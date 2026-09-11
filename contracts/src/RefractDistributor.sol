// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * RefractDistributor — pays out collected fees as cashback.
 *
 * Cashback was always computed from real on-chain history: every swap the
 * router emits carries the trader, the volume and the surplus, so a wallet's
 * share is a function of public data that anyone can recompute. What was
 * missing was somewhere for the money to sit and a way to take it out.
 *
 * Amounts are published as a Merkle root rather than written per wallet,
 * because writing thousands of balances on-chain costs more than the cashback
 * is worth. The root commits to (account, token, cumulative) leaves; a claim
 * proves its own leaf and takes the difference between the cumulative figure
 * and whatever that wallet has already taken.
 *
 * Cumulative rather than per-epoch on purpose. A wallet that never claims does
 * not accumulate a queue of tiny claims to make later, missing an epoch costs
 * nothing, and a root published with a mistake in it is fixed by publishing a
 * better one rather than by unwinding anything.
 *
 * What this asks you to trust, stated plainly: whoever publishes roots. They
 * cannot take the funds, there is no path in this contract that sends money
 * anywhere except to the wallet named in a proven leaf, and they cannot make a
 * claim smaller than one already taken. They can publish a root that pays the
 * wrong people. The defence is that the input is public: every Routed event is
 * on-chain, so a root that disagrees with the chain is provably wrong and
 * visible to anyone who checks.
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract RefractDistributor {
    /* ----------------------------------------------------------------- state */

    /// Publishes roots. Cannot move funds; see the note above.
    address public publisher;
    /// Current root per token. Leaves are keccak(account, token, cumulative).
    mapping(address => bytes32) public root;
    /// How much each wallet has already taken, per token.
    mapping(address => mapping(address => uint256)) public claimed;
    /// Bumped on every publish, so a claim can name the root it was built for.
    mapping(address => uint256) public epoch;

    /* ---------------------------------------------------------------- events */

    event RootPublished(address indexed token, bytes32 root, uint256 epoch);
    event Claimed(address indexed account, address indexed token, uint256 amount);
    event PublisherChanged(address indexed from, address indexed to);

    /* ---------------------------------------------------------------- errors */

    error NotPublisher();
    error BadProof();
    error NothingToClaim();
    error TransferFailed();
    error InsufficientFunds();
    error InvalidAddress();
    error StaleRoot();

    constructor(address _publisher) {
        if (_publisher == address(0)) revert InvalidAddress();
        publisher = _publisher;
    }

    modifier onlyPublisher() {
        if (msg.sender != publisher) revert NotPublisher();
        _;
    }

    /* -------------------------------------------------------------- publish */

    function publishRoot(address token, bytes32 newRoot) external onlyPublisher {
        root[token] = newRoot;
        emit RootPublished(token, newRoot, ++epoch[token]);
    }

    /**
     * Hand the role on. There is deliberately no way to renounce it to the
     * zero address: a distributor whose root can never change again is a
     * distributor where everything accrued after the last root is stranded.
     */
    function setPublisher(address next) external onlyPublisher {
        if (next == address(0)) revert InvalidAddress();
        emit PublisherChanged(publisher, next);
        publisher = next;
    }

    /* ---------------------------------------------------------------- claim */

    /**
     * Take everything owed that has not been taken yet.
     *
     * `cumulative` is the total this wallet has ever been owed in `token`, not
     * the amount of this claim. The difference is what moves.
     */
    function claim(
        address account,
        address token,
        uint256 cumulative,
        uint256 forEpoch,
        bytes32[] calldata proof
    ) external returns (uint256 amount) {
        // Pinning the epoch stops a claim built against one root landing after
        // a newer one has replaced it and paying out a figure nobody published.
        if (forEpoch != epoch[token]) revert StaleRoot();

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(account, token, cumulative))));
        if (!_verify(proof, root[token], leaf)) revert BadProof();

        uint256 taken = claimed[account][token];
        if (cumulative <= taken) revert NothingToClaim();
        amount = cumulative - taken;

        if (IERC20(token).balanceOf(address(this)) < amount) revert InsufficientFunds();

        // Written before the transfer, so a token that calls back cannot be
        // used to take the same difference twice.
        claimed[account][token] = cumulative;

        if (!IERC20(token).transfer(account, amount)) revert TransferFailed();
        emit Claimed(account, token, amount);
    }

    /** What `account` could take right now, given a proven cumulative figure. */
    function claimable(address account, address token, uint256 cumulative)
        external
        view
        returns (uint256)
    {
        uint256 taken = claimed[account][token];
        return cumulative > taken ? cumulative - taken : 0;
    }

    /* --------------------------------------------------------------- merkle */

    function _verify(bytes32[] calldata proof, bytes32 r, bytes32 leaf) internal pure returns (bool) {
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 p = proof[i];
            computed = computed <= p
                ? keccak256(abi.encode(computed, p))
                : keccak256(abi.encode(p, computed));
        }
        return computed == r;
    }
}
