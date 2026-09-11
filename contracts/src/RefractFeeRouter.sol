// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * RefractFeeRouter — takes a share of what routing found, never of the trade.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A fill can never land below the baseline. That is the whole promise, and it
 * is an invariant here rather than a policy: the fee is carved out of the
 * surplus, and the surplus is by definition what the trade beat the baseline
 * by. Charge more than that and the arithmetic reverts.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The baseline is the venue you would have used without us: the plain Uniswap
 * V2 pair, priced on-chain from its own reserves at the moment of the trade.
 * It is computed here rather than passed in, because a caller who supplies
 * their own baseline simply declares it equal to the output and pays nothing.
 * An oracle or a signed quote would work too, and would put an operator back
 * in the path of user funds, which is the thing this project keeps refusing to
 * do.
 *
 * Where there is no V2 pair there is no baseline, and where there is no
 * baseline there is no fee. Treating "we could not measure it" as "all of it is
 * surplus" would turn an unmeasurable trade into the most expensive one.
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address);
}

interface IUniswapV2Pair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function token0() external view returns (address);
}

contract RefractFeeRouter {
    /* ---------------------------------------------------------------- config */

    /// The one contract this router may call. An arbitrary target is a drain.
    address public immutable router;
    IUniswapV2Factory public immutable v2Factory;
    address public immutable weth;

    /**
     * Share of the surplus taken, in basis points. Immutable, because a fee
     * that can be raised later is a fee nobody can reason about.
     */
    uint16 public immutable surplusFeeBps;

    /// Hard ceiling, enforced at construction. Half of what we found, at most.
    uint16 public constant MAX_SURPLUS_FEE_BPS = 5_000;

    /// Where collected fees go. Set once, at deploy.
    address public immutable collector;

    /* ----------------------------------------------------------------- state */

    /// Fees collected per token, for the accounting page. Never reset.
    mapping(address => uint256) public feesCollected;
    /// Surplus found per token, so the share taken is checkable against it.
    mapping(address => uint256) public surplusFound;
    /// Volume routed per wallet and token, which is what cashback is computed from.
    mapping(address => mapping(address => uint256)) public volumeOf;

    /* ---------------------------------------------------------------- events */

    /**
     * Everything the accounting page and the cashback maths need, in one place.
     * `baseline` is published alongside `amountOut` so anyone can recompute the
     * surplus and check the fee against it rather than taking our word.
     */
    event Routed(
        address indexed trader,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 baseline,
        uint256 surplus,
        uint256 fee
    );

    /* ---------------------------------------------------------------- errors */

    error BadFee();
    error SwapFailed();
    error InsufficientOutput();
    error TransferFailed();
    error InvalidRecipient();
    error NoValue();
    error Reentrancy();

    uint256 private _entered = 1;

    modifier nonReentrant() {
        if (_entered != 1) revert Reentrancy();
        _entered = 2;
        _;
        _entered = 1;
    }

    constructor(
        address _router,
        IUniswapV2Factory _v2Factory,
        address _weth,
        uint16 _surplusFeeBps,
        address _collector
    ) {
        if (_surplusFeeBps > MAX_SURPLUS_FEE_BPS) revert BadFee();
        if (_collector == address(0)) revert InvalidRecipient();
        router = _router;
        v2Factory = _v2Factory;
        weth = _weth;
        surplusFeeBps = _surplusFeeBps;
        collector = _collector;
    }

    /* ------------------------------------------------------------------ swap */

    /**
     * Route native ETH into `tokenOut` and keep a share of what routing beat
     * the baseline by.
     *
     * Native input only in this version. An ERC-20 input has to reach the
     * Universal Router through Permit2, which means an allowance dance this
     * contract would have to hold on the user's behalf, and most volume here
     * is buying anyway.
     */
    function swapExactEthForToken(
        address tokenOut,
        uint256 minOut,
        address recipient,
        bytes calldata routerCalldata
    ) external payable nonReentrant returns (uint256 delivered) {
        if (msg.value == 0) revert NoValue();
        if (recipient == address(0)) revert InvalidRecipient();

        uint256 before = IERC20(tokenOut).balanceOf(address(this));
        (bool ok, ) = router.call{value: msg.value}(routerCalldata);
        if (!ok) revert SwapFailed();
        uint256 received = IERC20(tokenOut).balanceOf(address(this)) - before;

        uint256 baseline = _baselineOut(tokenOut, msg.value);

        /*
         * A missing baseline means no fee, not a free hand.
         *
         * Reading baseline zero as "all of it is surplus" is the obvious bug
         * and the expensive one: it charges the full share precisely on the
         * trades where nothing justifies it. The guard is explicit rather than
         * implied by the subtraction.
         */
        uint256 surplus = (baseline > 0 && received > baseline) ? received - baseline : 0;
        uint256 fee = (surplus * surplusFeeBps) / 10_000;

        // The arithmetic above already guarantees this, and the guarantee is
        // the product, so it is checked rather than assumed.
        if (fee > surplus) revert BadFee();

        delivered = received - fee;

        /*
         * The promise, stated exactly: the fee never pushes a fill below the
         * baseline. It is not that a fill can never land there at all. A route
         * can genuinely come back worse than a V2 quote taken moments earlier,
         * and refusing to trade in that case would block a fill the trader
         * asked for and priced with minOut. When that happens nothing is
         * charged, so the trader keeps every unit the route returned.
         */
        if (fee > 0 && delivered < baseline) revert InsufficientOutput();
        if (delivered < minOut) revert InsufficientOutput();

        feesCollected[tokenOut] += fee;
        surplusFound[tokenOut] += surplus;
        volumeOf[msg.sender][tokenOut] += msg.value;

        if (!IERC20(tokenOut).transfer(recipient, delivered)) revert TransferFailed();
        if (fee > 0 && !IERC20(tokenOut).transfer(collector, fee)) revert TransferFailed();

        emit Routed(msg.sender, tokenOut, msg.value, received, baseline, surplus, fee);
    }

    /* -------------------------------------------------------------- baseline */

    /**
     * What a plain V2 swap would have returned for `amountIn` of ETH, priced
     * from the pair's own reserves in this block.
     *
     * Returns zero when there is no pair or it holds nothing, and zero means
     * no fee. That is deliberate: the alternative reading, that an unmeasurable
     * baseline makes the entire output surplus, would charge the most exactly
     * where we can justify the least.
     */
    function _baselineOut(address tokenOut, uint256 amountIn) internal view returns (uint256) {
        address pair = v2Factory.getPair(weth, tokenOut);
        if (pair == address(0)) return 0;

        (uint112 r0, uint112 r1, ) = IUniswapV2Pair(pair).getReserves();
        if (r0 == 0 || r1 == 0) return 0;

        bool wethIsToken0 = IUniswapV2Pair(pair).token0() == weth;
        uint256 reserveIn = wethIsToken0 ? r0 : r1;
        uint256 reserveOut = wethIsToken0 ? r1 : r0;

        // Uniswap V2 constant product, with its own 0.30% fee applied.
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * 1000 + amountInWithFee;
        return numerator / denominator;
    }

    /** Quote the baseline without trading, for the accounting page. */
    function baselineOut(address tokenOut, uint256 amountIn) external view returns (uint256) {
        return _baselineOut(tokenOut, amountIn);
    }

    /// Only the router may hand ETH back mid-swap.
    receive() external payable {
        require(msg.sender == router, "router only");
    }
}
