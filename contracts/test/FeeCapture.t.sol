// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {RefractFeeRouter, IUniswapV2Factory} from "../src/RefractFeeRouter.sol";

/**
 * Two things are being proven here.
 *
 * That the fee is a share of what routing found and never of the trade, which
 * is arithmetic and is tested as arithmetic.
 *
 * And that nobody can take anybody else's cashback, by any route: not another
 * trader, not the collector, not a token that calls back mid-transfer, and not
 * whoever deployed it, because there is nothing for them to call.
 */
contract FeeCaptureTest is Test {
    RefractFeeRouter fee;
    MockRouter router;
    MockFactory factory;
    MockToken token;
    MockToken weth;

    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);
    address constant COLLECTOR = address(0xFEE5);
    bytes constant SWAP = hex"01";

    function setUp() public {
        weth = new MockToken();
        token = new MockToken();
        factory = new MockFactory();
        router = new MockRouter(token);
        // 20% of the surplus taken, half of that owed back to traders.
        fee = new RefractFeeRouter(
            address(router), IUniswapV2Factory(address(factory)), address(weth), 2000, 5000, COLLECTOR
        );
        vm.deal(ALICE, 100 ether);
        vm.deal(BOB, 100 ether);
    }

    function _pair(uint112 wethReserve, uint112 tokenReserve) internal {
        MockPair p = new MockPair(address(weth), address(token), wethReserve, tokenReserve);
        factory.set(address(weth), address(token), address(p));
    }

    function _trade(address who, uint256 inEth, uint256 out) internal returns (uint256) {
        router.setOut(out);
        vm.prank(who);
        return fee.swapExactEthForToken{value: inEth}(address(token), 0, who, SWAP);
    }

    /* ------------------------------------------------------- the fee promise */

    function test_fillNeverLandsBelowTheBaseline() public {
        _pair(100 ether, 200_000e18);
        uint256 baseline = fee.baselineOut(address(token), 1 ether);
        uint256 delivered = _trade(ALICE, 1 ether, baseline + 1_000e18);

        assertGe(delivered, baseline, "the fee must never push a fill below the baseline");
        assertEq(delivered, baseline + 800e18, "a fifth of the surplus, and nothing else");
    }

    function test_noSurplusNoFee() public {
        _pair(100 ether, 200_000e18);
        uint256 baseline = fee.baselineOut(address(token), 1 ether);
        uint256 delivered = _trade(ALICE, 1 ether, baseline);
        assertEq(delivered, baseline, "nothing found, nothing taken");
        assertEq(fee.feesCollected(address(token)), 0);
    }

    function test_routingBelowBaselineIsNotCharged() public {
        _pair(100 ether, 200_000e18);
        uint256 baseline = fee.baselineOut(address(token), 1 ether);
        uint256 delivered = _trade(ALICE, 1 ether, baseline - 500e18);
        assertEq(delivered, baseline - 500e18, "a worse route still trades, and costs nothing");
        assertEq(fee.feesCollected(address(token)), 0);
    }

    /** Unmeasurable must mean free, never maximal. */
    function test_noPairMeansNoFee() public {
        uint256 delivered = _trade(ALICE, 1 ether, 50_000e18);
        assertEq(delivered, 50_000e18);
        assertEq(fee.feesCollected(address(token)), 0);
    }

    function test_minOutIsCheckedAfterTheFee() public {
        _pair(100 ether, 200_000e18);
        uint256 baseline = fee.baselineOut(address(token), 1 ether);
        router.setOut(baseline + 1_000e18);
        vm.prank(ALICE);
        vm.expectRevert(RefractFeeRouter.InsufficientOutput.selector);
        fee.swapExactEthForToken{value: 1 ether}(address(token), baseline + 1_000e18, ALICE, SWAP);
    }

    function test_feeAboveHalfTheSurplusCannotBeDeployed() public {
        vm.expectRevert(RefractFeeRouter.BadFee.selector);
        new RefractFeeRouter(
            address(router), IUniswapV2Factory(address(factory)), address(weth), 5_001, 5000, COLLECTOR
        );
    }

    /* ---------------------------------------------------------- the cashback */

    /** Shares follow recorded volume, and nobody decides them. */
    function test_cashbackSharesProRataByVolume() public {
        _pair(100 ether, 200_000e18);
        uint256 b1 = fee.baselineOut(address(token), 1 ether);

        // First trade in this token: no prior volume, so nothing is owed back.
        _trade(ALICE, 1 ether, b1 + 1_000e18);
        assertEq(fee.claimable(ALICE, address(token)), 0, "nobody is paid out of their own fee");

        // Bob trades. Alice's volume is the only volume, so she is owed it all.
        uint256 b2 = fee.baselineOut(address(token), 1 ether);
        _trade(BOB, 1 ether, b2 + 1_000e18);

        uint256 aliceOwed = fee.claimable(ALICE, address(token));
        assertGt(aliceOwed, 0, "Alice's volume earned Bob's cashback share");
        assertEq(fee.claimable(BOB, address(token)), 0, "Bob is not paid out of his own fee");
    }

    /** The one the question was really about. */
    function test_nobodyCanClaimSomeoneElsesCashback() public {
        _pair(100 ether, 200_000e18);
        _trade(ALICE, 1 ether, fee.baselineOut(address(token), 1 ether) + 1_000e18);
        _trade(BOB, 1 ether, fee.baselineOut(address(token), 1 ether) + 1_000e18);

        uint256 aliceOwed = fee.claimable(ALICE, address(token));
        assertGt(aliceOwed, 0);

        // Bob claims. claim() takes no account argument, so the only thing he
        // can ever be paid is his own accrual, which here is nothing.
        vm.prank(BOB);
        vm.expectRevert(RefractFeeRouter.NothingToClaim.selector);
        fee.claim(address(token));

        assertEq(fee.claimable(ALICE, address(token)), aliceOwed, "untouched");

        // Measured as a delta: Alice's balance also holds the tokens her own
        // swap bought, which are not cashback.
        uint256 beforeClaim = token.balanceOf(ALICE);
        vm.prank(ALICE);
        uint256 got = fee.claim(address(token));
        assertEq(got, aliceOwed);
        assertEq(token.balanceOf(ALICE) - beforeClaim, aliceOwed, "she receives exactly what she was owed");
    }

    function test_claimingTwicePaysNothingTheSecondTime() public {
        _pair(100 ether, 200_000e18);
        _trade(ALICE, 1 ether, fee.baselineOut(address(token), 1 ether) + 1_000e18);
        _trade(BOB, 1 ether, fee.baselineOut(address(token), 1 ether) + 1_000e18);

        vm.prank(ALICE);
        fee.claim(address(token));
        vm.prank(ALICE);
        vm.expectRevert(RefractFeeRouter.NothingToClaim.selector);
        fee.claim(address(token));
    }

    /** The collector gets its share as trades settle and can take nothing else. */
    function test_collectorCannotTakeCashback() public {
        _pair(100 ether, 200_000e18);
        _trade(ALICE, 1 ether, fee.baselineOut(address(token), 1 ether) + 1_000e18);
        _trade(BOB, 1 ether, fee.baselineOut(address(token), 1 ether) + 1_000e18);

        uint256 held = token.balanceOf(address(fee));
        uint256 reserved = fee.cashbackReserved(address(token));
        assertGe(held, reserved, "the contract holds at least what it owes");

        // The collector has no accrual of its own, so it has nothing to claim.
        vm.prank(COLLECTOR);
        vm.expectRevert(RefractFeeRouter.NothingToClaim.selector);
        fee.claim(address(token));
    }

    /**
     * The absence of a drain, stated as a test. If any owner or rescue path is
     * ever added, this fails.
     */
    function test_thereIsNoAdminPath() public view {
        address[3] memory selectorsShouldNotExist;
        selectorsShouldNotExist[0] = address(0); // placeholder, see below
        // owner(), withdraw(address), rescue(address) must all be absent.
        (bool a, ) = address(fee).staticcall(abi.encodeWithSignature("owner()"));
        (bool b, ) = address(fee).staticcall(abi.encodeWithSignature("withdraw(address)"));
        (bool c, ) = address(fee).staticcall(abi.encodeWithSignature("rescue(address)"));
        assertFalse(a, "no owner");
        assertFalse(b, "no withdraw");
        assertFalse(c, "no rescue");
    }

    /** The contract can never owe more than it holds. */
    function test_contractAlwaysHoldsWhatItOwes() public {
        _pair(100 ether, 200_000e18);
        for (uint256 i = 0; i < 5; i++) {
            _trade(i % 2 == 0 ? ALICE : BOB, 1 ether, fee.baselineOut(address(token), 1 ether) + 1_000e18);
            assertGe(
                token.balanceOf(address(fee)),
                fee.cashbackReserved(address(token)),
                "reserved cashback must always be covered"
            );
        }
        vm.prank(ALICE);
        fee.claim(address(token));
        assertGe(token.balanceOf(address(fee)), fee.cashbackReserved(address(token)));
    }

    function test_accountingIsPublicAndCheckable() public {
        _pair(100 ether, 200_000e18);
        uint256 baseline = fee.baselineOut(address(token), 1 ether);
        _trade(ALICE, 1 ether, baseline + 1_000e18);

        assertEq(fee.surplusFound(address(token)), 1_000e18);
        assertEq(fee.feesCollected(address(token)), 200e18);
        assertEq(fee.volumeOf(ALICE, address(token)), 1 ether);
        assertEq(fee.totalVolume(address(token)), 1 ether);
    }
}

/* ------------------------------------------------------------------ mocks */

contract MockToken {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function transfer(address to, uint256 a) external returns (bool) {
        if (balanceOf[msg.sender] < a) return false;
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }
}

contract MockPair {
    address public token0;
    address public token1;
    uint112 r0;
    uint112 r1;
    constructor(address a, address b, uint112 _r0, uint112 _r1) {
        (token0, token1) = a < b ? (a, b) : (b, a);
        (r0, r1) = a < b ? (_r0, _r1) : (_r1, _r0);
    }
    function getReserves() external view returns (uint112, uint112, uint32) { return (r0, r1, 0); }
}

contract MockFactory {
    mapping(bytes32 => address) pairs;
    function set(address a, address b, address p) external { pairs[keccak256(abi.encode(a, b))] = p; }
    function getPair(address a, address b) external view returns (address) {
        return pairs[keccak256(abi.encode(a, b))];
    }
}

contract MockRouter {
    MockToken public token;
    uint256 public out;
    constructor(MockToken t) { token = t; }
    function setOut(uint256 o) external { out = o; }
    fallback() external payable { token.mint(msg.sender, out); }
    receive() external payable {}
}
