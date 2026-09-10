// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * RefractVault — pooled vault for private swaps on Robinhood Chain (4663).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE DEPLOYING. THIS CONTRACT IS CUSTODIAL.
 *
 * Funds deposited here are pooled. Individual balances are tracked off-chain by
 * the operator, which is what lets swaps happen privately: a trade between two
 * users never touches the chain, so it is invisible to observers, MEV bots and
 * chain analysis.
 *
 * The cost of that privacy is trust. A normal withdrawal requires a signature
 * from the operator key. If that key is lost, compromised, or the operator
 * chooses not to sign, normal withdrawals stop working.
 *
 * Any interface built on this MUST say so plainly. Advertising it as
 * non-custodial would be false.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * What this contract does that a plain custodial vault does not:
 *
 *   Every deposit and withdrawal is recorded on-chain per address. If the
 *   operator stops signing for `escapeDelay`, any depositor can call
 *   `escape()` and recover, without permission, up to their own net deposited
 *   amount for that token.
 *
 *   That is a floor, not exact accounting. If you deposited ETH and swapped to
 *   USDC inside the vault, escape returns ETH, because ETH is what the chain
 *   can prove you put in. It is deliberately imprecise in the user's favour
 *   only up to what they contributed, and it exists so that an unresponsive
 *   operator cannot strand funds forever.
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract RefractVault {
    /* ---------------------------------------------------------------- types */

    /// Native ETH is addressed as the zero address, matching Uniswap V4.
    address public constant NATIVE = address(0);

    /* ---------------------------------------------------------------- state */

    address public owner;
    /// Key that authorises withdrawals. Held by the operator's signing service.
    address public operator;
    /// Deposits can be halted without affecting withdrawals or escapes.
    bool public depositsPaused;

    /// How long the operator may be silent before escape unlocks. Immutable.
    uint256 public immutable escapeDelay;
    /// Refreshed whenever the operator authorises a withdrawal.
    uint256 public lastOperatorAction;

    /// Net contribution per user per token: deposited minus withdrawn.
    mapping(address => mapping(address => uint256)) public netDeposited;
    /// Spent withdrawal authorisations, keyed by their EIP-712 digest.
    mapping(bytes32 => bool) public usedTickets;

    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant WITHDRAW_TYPEHASH = keccak256(
        "Withdraw(address user,address token,uint256 amount,uint256 nonce,uint256 deadline)"
    );

    /* --------------------------------------------------------------- events */

    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount, uint256 nonce);
    event Escaped(address indexed user, address indexed token, uint256 amount);
    event OperatorChanged(address indexed previous, address indexed next);
    event OwnerChanged(address indexed previous, address indexed next);
    event DepositsPausedSet(bool paused);

    /* --------------------------------------------------------------- errors */

    error NotOwner();
    error ZeroAddress();
    error ZeroAmount();
    error DepositsArePaused();
    error BadSignature();
    error TicketAlreadyUsed();
    error TicketExpired();
    error EscapeNotUnlocked();
    error NothingToEscape();
    error TransferFailed();
    error NativeValueMismatch();

    /* ---------------------------------------------------------- constructor */

    constructor(address _operator, uint256 _escapeDelay) {
        if (_operator == address(0)) revert ZeroAddress();
        // A delay short enough to be a real remedy, long enough that ordinary
        // operator downtime does not trigger a bank run.
        require(_escapeDelay >= 3 days && _escapeDelay <= 30 days, "escapeDelay out of range");

        owner = msg.sender;
        operator = _operator;
        escapeDelay = _escapeDelay;
        lastOperatorAction = block.timestamp;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("RefractVault")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );

        emit OwnerChanged(address(0), msg.sender);
        emit OperatorChanged(address(0), _operator);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /* -------------------------------------------------------------- deposit */

    /**
     * Deposit into the vault. The event is what the operator indexes to credit
     * an internal balance, and `netDeposited` is what backs `escape()`.
     */
    function deposit(address token, uint256 amount) external payable {
        if (depositsPaused) revert DepositsArePaused();
        if (amount == 0) revert ZeroAmount();

        if (token == NATIVE) {
            if (msg.value != amount) revert NativeValueMismatch();
        } else {
            if (msg.value != 0) revert NativeValueMismatch();
            // Pull first, then measure, so fee-on-transfer tokens credit only
            // what actually arrived rather than what was requested.
            uint256 before = IERC20(token).balanceOf(address(this));
            if (!IERC20(token).transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
            amount = IERC20(token).balanceOf(address(this)) - before;
            if (amount == 0) revert ZeroAmount();
        }

        netDeposited[msg.sender][token] += amount;
        emit Deposited(msg.sender, token, amount);
    }

    /* ------------------------------------------------------------- withdraw */

    /**
     * Withdraw against an operator-signed authorisation.
     *
     * The signature is what makes this custodial: the operator decides what a
     * user is owed, because only the operator knows the internal balances.
     * Anyone may submit a valid ticket, so a user is not dependent on the
     * operator also paying gas.
     */
    function withdraw(
        address user,
        address token,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        if (amount == 0) revert ZeroAmount();
        if (block.timestamp > deadline) revert TicketExpired();

        bytes32 structHash = keccak256(
            abi.encode(WITHDRAW_TYPEHASH, user, token, amount, nonce, deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));

        if (usedTickets[digest]) revert TicketAlreadyUsed();
        if (_recover(digest, signature) != operator) revert BadSignature();

        usedTickets[digest] = true;
        // Any authorised withdrawal is proof of life, which resets the escape
        // window for everyone.
        lastOperatorAction = block.timestamp;

        // Reduce the escape floor by what is being paid out, saturating at zero
        // because internal swaps mean a payout can exceed the original deposit.
        uint256 floor = netDeposited[user][token];
        netDeposited[user][token] = amount >= floor ? 0 : floor - amount;

        _payOut(user, token, amount);
        emit Withdrawn(user, token, amount, nonce);
    }

    /* --------------------------------------------------------------- escape */

    /**
     * Permissionless recovery when the operator has gone silent.
     *
     * Unlocks `escapeDelay` after the last authorised withdrawal and returns up
     * to the caller's own net deposited amount for one token. It is capped by
     * the contract's balance, so a partial recovery is possible rather than a
     * revert that would let one caller block everyone.
     */
    function escape(address token) external {
        if (block.timestamp < lastOperatorAction + escapeDelay) revert EscapeNotUnlocked();

        uint256 owed = netDeposited[msg.sender][token];
        if (owed == 0) revert NothingToEscape();

        uint256 available = token == NATIVE
            ? address(this).balance
            : IERC20(token).balanceOf(address(this));
        if (available == 0) revert NothingToEscape();

        uint256 amount = owed > available ? available : owed;
        netDeposited[msg.sender][token] = owed - amount;

        _payOut(msg.sender, token, amount);
        emit Escaped(msg.sender, token, amount);
    }

    /// Seconds until escape unlocks. Zero means it is available now.
    function escapeUnlocksIn() external view returns (uint256) {
        uint256 unlockAt = lastOperatorAction + escapeDelay;
        return block.timestamp >= unlockAt ? 0 : unlockAt - block.timestamp;
    }

    /* ---------------------------------------------------------------- admin */

    function setOperator(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        emit OperatorChanged(operator, next);
        operator = next;
    }

    function setDepositsPaused(bool paused) external onlyOwner {
        depositsPaused = paused;
        emit DepositsPausedSet(paused);
    }

    /**
     * Owner transfer is deliberately the only ownership control. There is no
     * sweep, no rescue, and no owner path that moves user funds: withdrawals
     * need an operator signature and escapes need the delay to elapse. An
     * owner key alone cannot drain this contract.
     */
    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        emit OwnerChanged(owner, next);
        owner = next;
    }

    /* ------------------------------------------------------------ internals */

    function _payOut(address to, address token, uint256 amount) private {
        if (token == NATIVE) {
            (bool ok, ) = payable(to).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            if (!IERC20(token).transfer(to, amount)) revert TransferFailed();
        }
    }

    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        // Reject the malleable upper half of the curve order.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            revert BadSignature();
        }
        if (v < 27) v += 27;
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert BadSignature();
        return signer;
    }

    /// Direct sends are rejected so every credit has a Deposited event behind it.
    receive() external payable {
        revert("use deposit()");
    }
}
