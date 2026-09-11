// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * RefractPool — shielded pool with hidden amounts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOBODY CAN MOVE YOUR FUNDS BUT YOU. No operator, no admin, no owner path.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The fixed-denomination pool this replaces could hide which note you spent
 * but never how much it was worth, because the amount was the pool: everyone
 * in it had deposited the same figure. Offering more sizes only made that
 * worse, since each new size splits the users into a smaller crowd.
 *
 * Here a note carries its own hidden value. One tree holds every note of every
 * size, so the crowd is everyone who uses the pool rather than everyone who
 * picked the same denomination.
 *
 *   note        Poseidon(amount, nullifier, secret). Only the hash is published.
 *   transact    Spend up to two notes, create up to two new ones, and move a
 *               public difference in or out. Deposit, withdraw, partial spend
 *               and internal transfer are all this one call.
 *
 * Deposit 3.7 and the chain sees 3.7 arrive. Spend 1.2 of it later and the
 * chain sees 1.2 leave. Nothing links the two, and the 2.5 of change stays
 * shielded as a fresh note whose value is never published.
 *
 * The proof enforces that inputs plus what is being deposited equals outputs
 * plus what is being withdrawn. Amounts are range-checked inside the circuit,
 * so value cannot be minted by wrapping the field.
 */

interface IVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata input
    ) external view returns (bool);
}

interface IHasher {
    function poseidon(uint256[2] calldata input) external pure returns (uint256);
}

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract RefractPool {
    /* ---------------------------------------------------------------- config */

    uint32 public constant LEVELS = 20;
    uint32 public constant ROOT_HISTORY = 30;

    uint256 public constant FIELD_SIZE =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    /**
     * Ceiling on any single public movement. The circuit range-checks note
     * amounts to 96 bits, and this keeps the signed arithmetic below that with
     * room to spare, so a sum of inputs can never straddle the field boundary.
     */
    int256 public constant MAX_EXT_AMOUNT = 2 ** 95;

    IVerifier public immutable verifier;
    IHasher public immutable hasher;
    /**
     * The one contract the pool may call when swapping. Fixed at deploy: an
     * arbitrary call target would let anyone hand the pool a payload that
     * transfers its balance somewhere else, which is the single most common
     * way a contract like this gets emptied.
     */
    address public immutable router;

    /* ----------------------------------------------------------------- state */

    mapping(uint256 => bytes32) public filledSubtrees;
    mapping(uint256 => bytes32) public zeros;
    mapping(uint256 => bytes32) public roots;
    uint32 public currentRootIndex;
    uint32 public nextIndex;

    mapping(bytes32 => bool) public nullifierSpent;

    /**
     * Reentrancy latch.
     *
     * `swap` hands control to two contracts an attacker chooses the shape of:
     * the router payload, and `tokenOut`, whose `balanceOf` and `transfer` are
     * arbitrary code called by this pool. Spending nullifiers before the call
     * already stops the same note being spent twice, but the output accounting
     * reads a balance either side of a foreign call, and reasoning case by case
     * about what can be made to happen in between is how this kind of contract
     * gets emptied. One latch removes the whole class.
     */
    uint256 private _entered = 1;

    /* ---------------------------------------------------------------- events */

    /**
     * Carries the encrypted note alongside the commitment. A spender cannot ask
     * anyone which notes are theirs without giving themselves away, so the
     * ciphertext rides along and each wallet trial-decrypts the stream locally.
     */
    event NewCommitment(bytes32 indexed commitment, uint32 leafIndex, bytes encryptedNote);
    event NewNullifier(bytes32 indexed nullifier);
    event PublicMovement(address indexed recipient, int256 extAmount, uint256 fee);
    /** A trade the pool executed. Says what moved, never whose note funded it. */
    event ShieldedSwap(address indexed tokenOut, address indexed recipient, uint256 amountIn, uint256 amountOut);

    /* ---------------------------------------------------------------- errors */

    error UnknownRoot();
    error NullifierUsed();
    error DuplicateNullifier();
    error BadProof();
    error WrongValue();
    error TreeFull();
    error AmountOutOfRange();
    error FeeTooHigh();
    error TransferFailed();
    error InvalidRecipient();
    error SwapFailed();
    error InsufficientOutput();
    error NotASpend();
    error Reentrancy();

    modifier nonReentrant() {
        if (_entered != 1) revert Reentrancy();
        _entered = 2;
        _;
        _entered = 1;
    }

    /* ------------------------------------------------------------- structures */

    struct Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    struct TransactArgs {
        bytes32 root;
        /// Field-encoded net movement, checked against extData by the contract.
        uint256 publicAmount;
        bytes32 extDataHash;
        bytes32[2] inNullifiers;
        bytes32[2] outCommitments;
    }

    /**
     * Everything the proof commits to but the circuit does not need to reason
     * about. Hashed into a single public input so a watcher who sees the
     * transaction in flight cannot rewrite the recipient and take the funds.
     */
    struct ExtData {
        address recipient;
        /// Positive deposits, negative withdraws, zero is a private transfer.
        int256 extAmount;
        address relayer;
        uint256 fee;
        bytes encryptedOutput1;
        bytes encryptedOutput2;
    }

    /**
     * Everything a swap needs that a withdrawal does not. Hashed together with
     * `ExtData`, so the proof pins the trade as tightly as it pins a payout.
     */
    struct SwapData {
        address tokenOut;
        uint256 amountOutMin;
        /// Where the bought token lands. Use an address with no history.
        address recipient;
        /// Calldata for the router. The target is fixed; only the trade varies.
        bytes routerCalldata;
    }

    /* ----------------------------------------------------------- constructor */

    constructor(IVerifier _verifier, IHasher _hasher, address _router) {
        verifier = _verifier;
        hasher = _hasher;
        router = _router;

        bytes32 currentZero = bytes32(uint256(keccak256("refract.pool.v2")) % FIELD_SIZE);
        zeros[0] = currentZero;
        filledSubtrees[0] = currentZero;
        for (uint32 i = 1; i < LEVELS; i++) {
            currentZero = _hashLeftRight(currentZero, currentZero);
            zeros[i] = currentZero;
            filledSubtrees[i] = currentZero;
        }
        roots[0] = _hashLeftRight(currentZero, currentZero);
    }

    /* -------------------------------------------------------------- transact */

    /**
     * The only way funds move. Deposit, withdraw, spend part of a note or send
     * one privately are all the same call; what separates them is the sign of
     * `extData.extAmount` and whether the outputs are yours.
     */
    function transact(Proof calldata proof, TransactArgs calldata args, ExtData calldata extData)
        external
        payable
        nonReentrant
    {
        if (!isKnownRoot(args.root)) revert UnknownRoot();

        // Two identical nullifiers would spend one note twice inside a single
        // proof, which the circuit alone cannot see.
        if (args.inNullifiers[0] == args.inNullifiers[1]) revert DuplicateNullifier();
        for (uint256 i = 0; i < args.inNullifiers.length; i++) {
            if (nullifierSpent[args.inNullifiers[i]]) revert NullifierUsed();
        }

        if (extData.extAmount <= -MAX_EXT_AMOUNT || extData.extAmount >= MAX_EXT_AMOUNT) {
            revert AmountOutOfRange();
        }
        if (extData.fee >= uint256(MAX_EXT_AMOUNT)) revert FeeTooHigh();

        // Binding the whole struct is what stops the recipient being swapped.
        if (uint256(keccak256(abi.encode(extData))) % FIELD_SIZE != uint256(args.extDataHash)) {
            revert BadProof();
        }
        if (args.publicAmount != _publicAmount(extData.extAmount, extData.fee)) {
            revert WrongValue();
        }

        // Money in must arrive with the call; money out must not.
        if (extData.extAmount > 0) {
            if (msg.value != uint256(extData.extAmount)) revert WrongValue();
        } else {
            if (msg.value != 0) revert WrongValue();
            if (extData.extAmount < 0 && extData.recipient == address(0)) revert InvalidRecipient();
        }

        uint256[] memory input = new uint256[](7);
        input[0] = uint256(args.root);
        input[1] = args.publicAmount;
        input[2] = uint256(args.extDataHash);
        input[3] = uint256(args.inNullifiers[0]);
        input[4] = uint256(args.inNullifiers[1]);
        input[5] = uint256(args.outCommitments[0]);
        input[6] = uint256(args.outCommitments[1]);

        if (!verifier.verifyProof(proof.a, proof.b, proof.c, input)) revert BadProof();

        for (uint256 i = 0; i < args.inNullifiers.length; i++) {
            nullifierSpent[args.inNullifiers[i]] = true;
            emit NewNullifier(args.inNullifiers[i]);
        }

        _insert(args.outCommitments[0], extData.encryptedOutput1);
        _insert(args.outCommitments[1], extData.encryptedOutput2);

        if (extData.extAmount < 0) {
            _payOut(payable(extData.recipient), uint256(-extData.extAmount));
        }
        if (extData.fee > 0) _payOut(payable(extData.relayer), extData.fee);

        emit PublicMovement(extData.recipient, extData.extAmount, extData.fee);
    }

    /* ------------------------------------------------------------------ swap */

    /**
     * Spend notes by trading them, so the chain records that the pool swapped
     * rather than that you did.
     *
     * The proof is the same one a withdrawal uses. Spending a note to a router
     * is not a different claim from spending it to a person: either way you are
     * proving you own notes worth `extAmount` and that the sums balance. That
     * is why this needs no second circuit and no second ceremony.
     *
     * What it hides is the trader, not the trade. The swap is on chain and so
     * is its size. What is missing is the link between it and whoever funded
     * it, and the proceeds land at an address with no history.
     *
     * The output is not shielded. Notes here are denominated in ETH, so a token
     * bought through the pool leaves it. Holding token notes needs the asset
     * inside the commitment, which is a new circuit.
     */
    function swap(
        Proof calldata proof,
        TransactArgs calldata args,
        ExtData calldata extData,
        SwapData calldata swapData
    ) external nonReentrant {
        if (!isKnownRoot(args.root)) revert UnknownRoot();
        if (args.inNullifiers[0] == args.inNullifiers[1]) revert DuplicateNullifier();
        for (uint256 i = 0; i < args.inNullifiers.length; i++) {
            if (nullifierSpent[args.inNullifiers[i]]) revert NullifierUsed();
        }

        // A swap only ever spends. Allowing a deposit here would let value
        // arrive and be routed in the same call, which nothing checks for.
        if (extData.extAmount >= 0) revert NotASpend();
        // No msg.value check: this function is not payable, so the compiler
        // already rejects any ETH sent with it.
        if (swapData.recipient == address(0)) revert InvalidRecipient();
        if (swapData.amountOutMin == 0) revert InsufficientOutput();
        if (extData.extAmount <= -MAX_EXT_AMOUNT) revert AmountOutOfRange();
        if (extData.fee >= uint256(MAX_EXT_AMOUNT)) revert FeeTooHigh();

        /*
         * Both structs are bound, and the preimage deliberately differs from
         * the one `transact` hashes. A proof built for a withdrawal therefore
         * cannot be replayed here to route the same notes somewhere else, and
         * a watcher cannot rewrite the token, the minimum or the recipient of
         * a swap they see in the mempool.
         */
        if (uint256(keccak256(abi.encode(extData, swapData))) % FIELD_SIZE != uint256(args.extDataHash)) {
            revert BadProof();
        }
        if (args.publicAmount != _publicAmount(extData.extAmount, extData.fee)) revert WrongValue();

        uint256[] memory input = new uint256[](7);
        input[0] = uint256(args.root);
        input[1] = args.publicAmount;
        input[2] = uint256(args.extDataHash);
        input[3] = uint256(args.inNullifiers[0]);
        input[4] = uint256(args.inNullifiers[1]);
        input[5] = uint256(args.outCommitments[0]);
        input[6] = uint256(args.outCommitments[1]);

        if (!verifier.verifyProof(proof.a, proof.b, proof.c, input)) revert BadProof();

        // Spent and inserted before the router is called. The router is a
        // foreign contract, and a note that is still spendable while it has
        // control is a note that can be spent twice.
        for (uint256 i = 0; i < args.inNullifiers.length; i++) {
            nullifierSpent[args.inNullifiers[i]] = true;
            emit NewNullifier(args.inNullifiers[i]);
        }
        _insert(args.outCommitments[0], extData.encryptedOutput1);
        _insert(args.outCommitments[1], extData.encryptedOutput2);

        uint256 amountIn = uint256(-extData.extAmount);

        // Measured as a balance delta rather than trusting a return value, so
        // a router that reports more than it delivered cannot short the user.
        uint256 before = IERC20(swapData.tokenOut).balanceOf(address(this));
        (bool ok, ) = router.call{value: amountIn}(swapData.routerCalldata);
        if (!ok) revert SwapFailed();
        uint256 received = IERC20(swapData.tokenOut).balanceOf(address(this)) - before;
        if (received < swapData.amountOutMin) revert InsufficientOutput();

        if (!IERC20(swapData.tokenOut).transfer(swapData.recipient, received)) revert TransferFailed();
        if (extData.fee > 0) _payOut(payable(extData.relayer), extData.fee);

        emit ShieldedSwap(swapData.tokenOut, swapData.recipient, amountIn, received);
    }

    /**
     * Signed movement folded into one field element, matching the circuit's
     * `sumIn + publicAmount === sumOut`. Negatives wrap, which is how a field
     * represents them.
     */
    function _publicAmount(int256 extAmount, uint256 fee) internal pure returns (uint256) {
        // Re-checked here rather than trusting the caller. Every cast below is
        // only safe inside these bounds, and a later caller that skipped them
        // would turn a signed overflow into minted value with nothing to catch
        // it. The check is a few gas; the failure mode is unbounded.
        if (extAmount <= -MAX_EXT_AMOUNT || extAmount >= MAX_EXT_AMOUNT) revert AmountOutOfRange();
        if (fee >= uint256(MAX_EXT_AMOUNT)) revert FeeTooHigh();

        int256 net = extAmount - int256(fee);
        return net >= 0 ? uint256(net) : FIELD_SIZE - uint256(-net);
    }

    /* ------------------------------------------------------------------ tree */

    function _hashLeftRight(bytes32 left, bytes32 right) internal view returns (bytes32) {
        uint256[2] memory pair = [uint256(left), uint256(right)];
        return bytes32(hasher.poseidon(pair));
    }

    function _insert(bytes32 leaf, bytes memory encryptedNote) internal returns (uint32 index) {
        uint32 _nextIndex = nextIndex;
        if (_nextIndex == uint32(2) ** LEVELS) revert TreeFull();

        uint32 currentIndex = _nextIndex;
        bytes32 currentHash = leaf;

        for (uint32 i = 0; i < LEVELS; i++) {
            bytes32 left;
            bytes32 right;
            if (currentIndex % 2 == 0) {
                left = currentHash;
                right = zeros[i];
                filledSubtrees[i] = currentHash;
            } else {
                left = filledSubtrees[i];
                right = currentHash;
            }
            currentHash = _hashLeftRight(left, right);
            currentIndex /= 2;
        }

        uint32 newRootIndex = (currentRootIndex + 1) % ROOT_HISTORY;
        currentRootIndex = newRootIndex;
        roots[newRootIndex] = currentHash;
        nextIndex = _nextIndex + 1;

        emit NewCommitment(leaf, _nextIndex, encryptedNote);
        return _nextIndex;
    }

    function isKnownRoot(bytes32 root) public view returns (bool) {
        if (root == 0) return false;
        uint32 i = currentRootIndex;
        for (uint32 n = 0; n < ROOT_HISTORY; n++) {
            if (root == roots[i]) return true;
            i = i == 0 ? ROOT_HISTORY - 1 : i - 1;
        }
        return false;
    }

    function getLastRoot() external view returns (bytes32) {
        return roots[currentRootIndex];
    }

    /* ------------------------------------------------------------- internals */

    /// Accepts ETH only from the router mid-swap, never as a bare deposit.
    receive() external payable {
        require(msg.sender == router, "use transact()");
    }

    function _payOut(address payable to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
