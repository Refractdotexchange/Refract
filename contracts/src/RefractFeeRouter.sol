// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * RefractFeeRouter — takes a share of what routing found, and pays a share of
 * that back, without anyone being able to decide who gets what.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO PROMISES, BOTH ARITHMETIC RATHER THAN POLICY.
 *
 *   A fill never lands below the baseline because of the fee. The fee is
 *   carved out of the surplus, and the surplus is what the trade beat the
 *   baseline by, so charging more than that reverts.
 *
 *   Nobody can take anybody else's cashback. There is no owner, no publisher,
 *   no admin and no withdraw function. A claim pays the caller, out of what the
 *   caller's own recorded volume has accrued, and nothing else can move it.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The first draft of this system paid cashback from a Merkle root published by
 * a trusted account. Its own test proved the problem: whoever published could
 * name themselves in a root and take the pot. Everything below exists so that
 * there is nobody to trust, because the inputs are already on-chain. Volume is
 * recorded here as it happens, fees are collected here, and a share is owed by
 * an accumulator rather than by a decision.
 *
 * The baseline is the venue you would have used without us: the plain Uniswap
 * V2 pair, priced from its own reserves at the moment of the trade. It is read
 * here rather than passed in, because a caller who supplies their own baseline
 * declares it equal to the output and pays nothing.
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

    /// Share of the surplus taken, in basis points. Immutable.
    uint16 public immutable surplusFeeBps;
    /// Share of that fee owed back to traders, in basis points. Immutable.
    uint16 public immutable cashbackBps;

    /// At most half of what we found.
    uint16 public constant MAX_SURPLUS_FEE_BPS = 5_000;

    /**
     * Where the protocol's half of the fee goes. Immutable, and deliberately
     * powerless: it receives its share as each trade settles and has no claim
     * on anything else in this contract, cashback included.
     */
    address public immutable collector;

    uint256 private constant PRECISION = 1e18;

    /* ----------------------------------------------------------------- state */

    /// Fees taken per token, for the accounting page. Never reset.
    mapping(address => uint256) public feesCollected;
    /// Surplus found per token, so the share taken is checkable against it.
    mapping(address => uint256) public surplusFound;
    /// Cashback owed to traders in total, per token.
    mapping(address => uint256) public cashbackReserved;

    /// Routed volume, in ETH, per trader and bought token.
    mapping(address => mapping(address => uint256)) public volumeOf;
    mapping(address => uint256) public totalVolume;

    /// Cashback accrued per unit of volume, scaled by PRECISION.
    mapping(address => uint256) public accPerVolume;
    /// What each trader's volume had already accrued when it last changed.
    mapping(address => mapping(address => uint256)) public rewardDebt;
    /// Settled and unclaimed.
    mapping(address => mapping(address => uint256)) public owed;

    /* ---------------------------------------------------------------- events */

    /**
     * Everything the accounting page needs, and everything anyone needs to
     * check the fee against the surplus themselves.
     */
    event Routed(
        address indexed trader,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 baseline,
        uint256 surplus,
        uint256 fee,
        uint256 toCashback
    );
    event CashbackClaimed(address indexed trader, address indexed token, uint256 amount);

    /* ---------------------------------------------------------------- errors */

    error BadFee();
    error SwapFailed();
    error InsufficientOutput();
    error TransferFailed();
    error InvalidRecipient();
    error NoValue();
    error NothingToClaim();
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
        uint16 _cashbackBps,
        address _collector
    ) {
        if (_surplusFeeBps > MAX_SURPLUS_FEE_BPS || _cashbackBps > 10_000) revert BadFee();
        if (_collector == address(0)) revert InvalidRecipient();
        router = _router;
        v2Factory = _v2Factory;
        weth = _weth;
        surplusFeeBps = _surplusFeeBps;
        cashbackBps = _cashbackBps;
        collector = _collector;
    }

    /* ------------------------------------------------------------------ swap */

    /**
     * Route native ETH into `tokenOut`, keep a share of what routing beat the
     * baseline by, and owe part of that share back to the volume that has
     * already traded.
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
         * A missing baseline means no fee, not a free hand. Reading baseline
         * zero as "all of it is surplus" charges the full share precisely on
         * the trades where nothing justifies it.
         */
        uint256 surplus = (baseline > 0 && received > baseline) ? received - baseline : 0;
        uint256 fee = (surplus * surplusFeeBps) / 10_000;
        if (fee > surplus) revert BadFee();

        delivered = received - fee;

        /*
         * The promise, exactly: the fee never pushes a fill below the baseline.
         * Not that a fill can never land there. A route can genuinely come back
         * worse than a V2 quote taken moments earlier, and refusing to trade
         * then would block a fill the trader asked for and priced with minOut.
         * In that case nothing is charged at all.
         */
        if (fee > 0 && delivered < baseline) revert InsufficientOutput();
        if (delivered < minOut) revert InsufficientOutput();

        // What actually reached traders, which is not always the intended
        // share: see _accrue for the first trade in a token.
        surplusFound[tokenOut] += surplus;
        uint256 toCashback = _accrue(msg.sender, tokenOut, msg.value, fee);

        if (!IERC20(tokenOut).transfer(recipient, delivered)) revert TransferFailed();

        uint256 toCollector = fee - toCashback;
        if (toCollector > 0 && !IERC20(tokenOut).transfer(collector, toCollector)) revert TransferFailed();

        emit Routed(msg.sender, tokenOut, msg.value, received, baseline, surplus, fee, toCashback);
    }

    /**
     * Book this trade's volume and share out its cashback.
     *
     * Order matters and is the whole correctness of the accumulator. The
     * trader's existing entitlement is settled before their volume changes, so
     * altering the volume cannot rewrite what it had already earned. The fee is
     * then shared across the volume that existed before this trade, so nobody
     * is paid cashback out of their own fee. Only then is the new volume added.
     */
    function _accrue(address trader, address token, uint256 amountIn, uint256 fee)
        internal
        returns (uint256 distributed)
    {
        uint256 acc = accPerVolume[token];
        uint256 vol = volumeOf[trader][token];

        if (vol > 0) {
            owed[trader][token] += (vol * acc) / PRECISION - rewardDebt[trader][token];
        }

        uint256 total = totalVolume[token];
        if (total > 0) {
            distributed = (fee * cashbackBps) / 10_000;
            if (distributed > 0) {
                acc += (distributed * PRECISION) / total;
                accPerVolume[token] = acc;
                cashbackReserved[token] += distributed;
            }
        }
        /*
         * On the first trade in a token there is no prior volume to share
         * with, so `distributed` stays zero and the whole fee goes to the
         * collector. Reserving a share for nobody would strand it here
         * permanently, since nothing but an accrued claim can ever move it.
         */

        volumeOf[trader][token] = vol + amountIn;
        totalVolume[token] = total + amountIn;
        rewardDebt[trader][token] = ((vol + amountIn) * acc) / PRECISION;

        feesCollected[token] += fee;
    }

    /* ----------------------------------------------------------------- claim */

    /**
     * Take your own cashback. There is no argument for whose.
     *
     * The caller is the only account that can be paid, the amount is whatever
     * that caller's recorded volume has accrued, and no other function in this
     * contract moves cashback anywhere.
     */
    function claim(address token) external nonReentrant returns (uint256 amount) {
        uint256 vol = volumeOf[msg.sender][token];
        uint256 acc = accPerVolume[token];

        if (vol > 0) {
            owed[msg.sender][token] += (vol * acc) / PRECISION - rewardDebt[msg.sender][token];
            rewardDebt[msg.sender][token] = (vol * acc) / PRECISION;
        }

        amount = owed[msg.sender][token];
        if (amount == 0) revert NothingToClaim();

        // Zeroed before the transfer, so a token that calls back finds nothing
        // left to claim rather than a second chance at the same balance.
        owed[msg.sender][token] = 0;
        cashbackReserved[token] -= amount;

        if (!IERC20(token).transfer(msg.sender, amount)) revert TransferFailed();
        emit CashbackClaimed(msg.sender, token, amount);
    }

    /** What `trader` could claim right now, settled and unsettled together. */
    function claimable(address trader, address token) external view returns (uint256) {
        uint256 vol = volumeOf[trader][token];
        uint256 pending = vol > 0
            ? (vol * accPerVolume[token]) / PRECISION - rewardDebt[trader][token]
            : 0;
        return owed[trader][token] + pending;
    }

    /* -------------------------------------------------------------- baseline */

    function _baselineOut(address tokenOut, uint256 amountIn) internal view returns (uint256) {
        address pair = v2Factory.getPair(weth, tokenOut);
        if (pair == address(0)) return 0;

        (uint112 r0, uint112 r1, ) = IUniswapV2Pair(pair).getReserves();
        if (r0 == 0 || r1 == 0) return 0;

        bool wethIsToken0 = IUniswapV2Pair(pair).token0() == weth;
        uint256 reserveIn = wethIsToken0 ? r0 : r1;
        uint256 reserveOut = wethIsToken0 ? r1 : r0;

        uint256 amountInWithFee = amountIn * 997;
        return (amountInWithFee * reserveOut) / (reserveIn * 1000 + amountInWithFee);
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
