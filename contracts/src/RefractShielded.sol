// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * RefractShielded — non-custodial shielded pool for chain 4663.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOBODY CAN MOVE YOUR FUNDS BUT YOU.
 *
 * There is no operator key, no admin withdrawal, and no owner path to user
 * money. A deposit inserts a commitment into a Merkle tree; the only way back
 * out is a zero-knowledge proof that you know the secret behind one of those
 * commitments. The contract checks the maths and pays. No signature, no server.
 *
 * That is the whole difference from a custodial vault: privacy without handing
 * anyone your funds.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * How the privacy works
 *
 *   deposit    You publish hash(nullifier, secret). Everyone sees a commitment
 *              was added. Nobody can tell which one is yours.
 *   withdraw   You prove "I know the secret behind SOME commitment in this
 *              tree" without revealing which. You publish a nullifier hash so
 *              the same note cannot be spent twice, and the nullifier cannot
 *              be linked back to the deposit.
 *
 * Shielded swap
 *
 *   The pool itself performs the trade through the REFRACT router, so the swap
 *   is visible on-chain but the trader is not. An observer sees the pool
 *   swapped; they cannot see whose note funded it. The output is written back
 *   into the tree as a fresh commitment.
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
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract RefractShielded {
    /* ---------------------------------------------------------------- config */

    /// 2^20 leaves. Matches Tornado, and is far more than this chain will fill.
    uint32 public constant LEVELS = 20;
    /// Recent roots kept so a proof built moments ago is not invalidated by
    /// someone else depositing first.
    uint32 public constant ROOT_HISTORY = 30;
    /// BN254 scalar field. Every public input must be reduced modulo this.
    uint256 public constant FIELD_SIZE =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    address public constant NATIVE = address(0);

    IVerifier public immutable withdrawVerifier;
    IHasher public immutable hasher;
    /// The one contract the pool may call to swap. Fixed at deploy: an
    /// arbitrary call target would let anyone drain the pool.
    address public immutable router;

    /* ----------------------------------------------------------------- state */

    /// Denomination is fixed per pool. Mixed amounts destroy the anonymity set,
    /// so each token gets its own pool at a chosen size.
    address public immutable token;
    uint256 public immutable denomination;

    mapping(uint256 => bytes32) public filledSubtrees;
    mapping(uint256 => bytes32) public zeros;
    mapping(uint256 => bytes32) public roots;
    uint32 public currentRootIndex;
    uint32 public nextIndex;

    mapping(bytes32 => bool) public nullifierSpent;
    mapping(bytes32 => bool) public commitmentExists;

    /* ---------------------------------------------------------------- events */

    event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp);
    event Withdrawal(address indexed to, bytes32 nullifierHash, address indexed relayer, uint256 fee);
    event ShieldedSwap(bytes32 nullifierHash, bytes32 indexed newCommitment, uint256 amountOut);

    /* ---------------------------------------------------------------- errors */

    error CommitmentUsed();
    error NullifierUsed();
    error UnknownRoot();
    error BadProof();
    error WrongValue();
    error TreeFull();
    error FeeTooHigh();
    error NotInField();
    error TransferFailed();
    error SwapFailed();
    error InsufficientOutput();

    /* ----------------------------------------------------------- constructor */

    constructor(
        IVerifier _withdrawVerifier,
        IHasher _hasher,
        address _router,
        address _token,
        uint256 _denomination
    ) {
        require(_denomination > 0, "denomination");
        withdrawVerifier = _withdrawVerifier;
        hasher = _hasher;
        router = _router;
        token = _token;
        denomination = _denomination;

        // Empty-subtree hashes are computed here rather than hardcoded, so they
        // cannot drift from whatever the hasher actually does.
        bytes32 currentZero = bytes32(uint256(keccak256("refract.shielded.v1")) % FIELD_SIZE);
        zeros[0] = currentZero;
        filledSubtrees[0] = currentZero;
        for (uint32 i = 1; i < LEVELS; i++) {
            currentZero = _hashLeftRight(currentZero, currentZero);
            zeros[i] = currentZero;
            filledSubtrees[i] = currentZero;
        }
        roots[0] = _hashLeftRight(currentZero, currentZero);
    }

    /* --------------------------------------------------------------- deposit */

    /**
     * Shield funds. `commitment` is Poseidon(nullifier, secret), computed in
     * your browser. Keep both halves: they are the only way to spend the note,
     * and nobody can recover them for you.
     */
    function deposit(bytes32 commitment) external payable {
        if (uint256(commitment) >= FIELD_SIZE) revert NotInField();
        if (commitmentExists[commitment]) revert CommitmentUsed();

        if (token == NATIVE) {
            if (msg.value != denomination) revert WrongValue();
        } else {
            if (msg.value != 0) revert WrongValue();
            if (!IERC20(token).transferFrom(msg.sender, address(this), denomination)) {
                revert TransferFailed();
            }
        }

        commitmentExists[commitment] = true;
        uint32 index = _insert(commitment);
        emit Deposit(commitment, index, block.timestamp);
    }

    /* -------------------------------------------------------------- withdraw */

    /**
     * Unshield to any address, proving ownership without revealing which note.
     *
     * `relayer` and `fee` let someone else pay gas, which matters because
     * withdrawing to a fresh address from your own funded wallet would defeat
     * the point.
     */
    function withdraw(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        bytes32 root,
        bytes32 nullifierHash,
        address payable recipient,
        address payable relayer,
        uint256 fee
    ) external {
        if (fee > denomination) revert FeeTooHigh();
        if (nullifierSpent[nullifierHash]) revert NullifierUsed();
        if (!isKnownRoot(root)) revert UnknownRoot();

        uint256[] memory input = new uint256[](6);
        input[0] = uint256(root);
        input[1] = uint256(nullifierHash);
        input[2] = uint256(uint160(address(recipient)));
        input[3] = uint256(uint160(address(relayer)));
        input[4] = fee;
        input[5] = 0; // refund, reserved

        if (!withdrawVerifier.verifyProof(a, b, c, input)) revert BadProof();

        nullifierSpent[nullifierHash] = true;

        uint256 payout = denomination - fee;
        _payOut(recipient, payout);
        if (fee > 0) _payOut(relayer, fee);

        emit Withdrawal(recipient, nullifierHash, relayer, fee);
    }

    /* --------------------------------------------------------- shielded swap */

    /**
     * Spend a note by swapping it, and shield the proceeds in `destination`.
     *
     * The pool executes the trade through the REFRACT router, so what lands
     * on-chain is "the pool swapped", never "this wallet swapped".
     *
     * The output commitment has to be built before the swap runs, so it commits
     * to exactly `amountOutMin`. Anything the router returns above that stays
     * with the pool, so set slippage tight. Being explicit beats a surprise.
     */
    function shieldedSwap(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        bytes32 root,
        bytes32 nullifierHash,
        RefractShielded destination,
        bytes32 newCommitment,
        uint256 amountOutMin,
        bytes calldata swapData
    ) external {
        if (nullifierSpent[nullifierHash]) revert NullifierUsed();
        if (!isKnownRoot(root)) revert UnknownRoot();
        if (amountOutMin != destination.denomination()) revert InsufficientOutput();

        // The proof binds the destination pool and the output commitment, so a
        // watcher cannot re-target a spend they saw in the mempool.
        uint256[] memory input = new uint256[](6);
        input[0] = uint256(root);
        input[1] = uint256(nullifierHash);
        input[2] = uint256(uint160(address(destination)));
        input[3] = uint256(newCommitment) % FIELD_SIZE;
        input[4] = amountOutMin;
        input[5] = 0;

        if (!withdrawVerifier.verifyProof(a, b, c, input)) revert BadProof();

        nullifierSpent[nullifierHash] = true;

        address outToken = destination.token();
        uint256 balanceBefore = _balanceOf(outToken);

        // Only ever the router, never an arbitrary target.
        if (token == NATIVE) {
            (bool ok, ) = router.call{value: denomination}(swapData);
            if (!ok) revert SwapFailed();
        } else {
            IERC20(token).approve(router, denomination);
            (bool ok, ) = router.call(swapData);
            if (!ok) revert SwapFailed();
            IERC20(token).approve(router, 0);
        }

        uint256 received = _balanceOf(outToken) - balanceBefore;
        if (received < amountOutMin) revert InsufficientOutput();

        // Shield the proceeds into the destination pool.
        if (outToken == NATIVE) {
            destination.deposit{value: amountOutMin}(newCommitment);
        } else {
            IERC20(outToken).approve(address(destination), amountOutMin);
            destination.deposit(newCommitment);
        }

        emit ShieldedSwap(nullifierHash, newCommitment, amountOutMin);
    }

    /* ------------------------------------------------------------------ tree */

    function _hashLeftRight(bytes32 left, bytes32 right) internal view returns (bytes32) {
        uint256[2] memory pair = [uint256(left), uint256(right)];
        return bytes32(hasher.poseidon(pair));
    }

    function _insert(bytes32 leaf) internal returns (uint32 index) {
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
        return _nextIndex;
    }

    /// True if `root` is the current root or one of the recent ones.
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

    function _balanceOf(address t) internal view returns (uint256) {
        return t == NATIVE ? address(this).balance : IERC20(t).balanceOf(address(this));
    }

    function _payOut(address payable to, uint256 amount) internal {
        if (amount == 0) return;
        if (token == NATIVE) {
            (bool ok, ) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            if (!IERC20(token).transfer(to, amount)) revert TransferFailed();
        }
    }

    /// Accepts ETH only from the router mid-swap, never as a bare deposit.
    receive() external payable {
        require(msg.sender == router, "use deposit()");
    }
}
