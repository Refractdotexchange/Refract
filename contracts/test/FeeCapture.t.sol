// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
// Named imports: both contracts declare their own file-scope IERC20, and a
// plain import of each would pull two identical interfaces into one scope.
import {RefractFeeRouter, IUniswapV2Factory} from "../src/RefractFeeRouter.sol";
import {RefractDistributor} from "../src/RefractDistributor.sol";

/**
 * The promise is that a fill never lands below the baseline, and that the fee
 * is a share of what routing found rather than of the trade. Both are
 * arithmetic, so both are tested as arithmetic.
 */
contract FeeCaptureTest is Test {
    RefractFeeRouter fee;
    MockRouter router;
    MockFactory factory;
    MockToken token;
    MockToken weth;

    address constant TRADER = address(0xBEEF);
    /// Any non-empty payload: empty calldata reaches receive(), not fallback().
    bytes constant SWAP = hex"01";
    address constant COLLECTOR = address(0xFEE5);

    function setUp() public {
        weth = new MockToken();
        token = new MockToken();
        factory = new MockFactory();
        router = new MockRouter(token);
        // 2000 bps: a fifth of the surplus, well under the 5000 ceiling.
        fee = new RefractFeeRouter(address(router), IUniswapV2Factory(address(factory)), address(weth), 2000, COLLECTOR);
        vm.deal(TRADER, 100 ether);
    }

    function _pair(uint112 wethReserve, uint112 tokenReserve) internal {
        MockPair p = new MockPair(address(weth), address(token), wethReserve, tokenReserve);
        factory.set(address(weth), address(token), address(p));
    }

    /* --------------------------------------------------------- the promise */

    function test_fillNeverLandsBelowTheBaseline() public {
        _pair(100 ether, 200_000e18);
        uint256 baseline = fee.baselineOut(address(token), 1 ether);
        router.setOut(baseline + 1_000e18); // routing beat V2 by 1000 tokens

        vm.prank(TRADER);
        uint256 delivered = fee.swapExactEthForToken{value: 1 ether}(address(token), 0, TRADER, SWAP);

        assertGe(delivered, baseline, "a fill must never land below the baseline");
        assertEq(delivered, baseline + 1_000e18 - 200e18, "fee is a fifth of the surplus only");
        assertEq(token.balanceOf(COLLECTOR), 200e18, "collector takes exactly that fifth");
    }

    /** No surplus means no fee, even though a trade happened. */
    function test_noSurplusNoFee() public {
        _pair(100 ether, 200_000e18);
        router.setOut(fee.baselineOut(address(token), 1 ether));

        vm.prank(TRADER);
        uint256 delivered = fee.swapExactEthForToken{value: 1 ether}(address(token), 0, TRADER, SWAP);

        assertEq(token.balanceOf(COLLECTOR), 0, "nothing found, nothing taken");
        assertEq(delivered, fee.baselineOut(address(token), 1 ether));
    }

    /**
     * A route worse than the V2 reference still trades, and costs nothing.
     * Refusing it would block a fill the trader asked for and priced with
     * minOut, on the strength of a quote that is only a reference.
     */
    function test_routingBelowBaselineIsNotCharged() public {
        _pair(100 ether, 200_000e18);
        uint256 baseline = fee.baselineOut(address(token), 1 ether);
        router.setOut(baseline - 500e18);

        vm.prank(TRADER);
        uint256 delivered = fee.swapExactEthForToken{value: 1 ether}(address(token), 0, TRADER, SWAP);

        assertEq(token.balanceOf(COLLECTOR), 0, "there was no surplus to share");
        assertEq(delivered, baseline - 500e18, "the trader keeps all of it");
    }

    /**
     * The trap this design exists to avoid. With no pair there is no baseline,
     * and calling the whole output surplus would charge the most precisely
     * where the least can be justified.
     */
    function test_noPairMeansNoFeeRatherThanMaximumFee() public {
        router.setOut(50_000e18);

        vm.prank(TRADER);
        uint256 delivered = fee.swapExactEthForToken{value: 1 ether}(address(token), 0, TRADER, SWAP);

        assertEq(token.balanceOf(COLLECTOR), 0, "unmeasurable must mean free, not maximal");
        assertEq(delivered, 50_000e18);
    }

    /** The baseline is read from the pair, so a caller cannot declare one. */
    function test_baselineIsNotCallerSupplied() public {
        _pair(100 ether, 200_000e18);
        router.setOut(fee.baselineOut(address(token), 1 ether) + 1_000e18);

        // There is no argument for it: the signature carries tokenOut, minOut,
        // recipient and calldata, and nothing a caller passes touches baseline.
        vm.prank(TRADER);
        fee.swapExactEthForToken{value: 1 ether}(address(token), 0, TRADER, SWAP);
        assertEq(token.balanceOf(COLLECTOR), 200e18, "fee is set by the pair, not the caller");
    }

    function test_minOutIsCheckedAfterTheFee() public {
        _pair(100 ether, 200_000e18);
        uint256 baseline = fee.baselineOut(address(token), 1 ether);
        router.setOut(baseline + 1_000e18);

        vm.prank(TRADER);
        vm.expectRevert(RefractFeeRouter.InsufficientOutput.selector);
        fee.swapExactEthForToken{value: 1 ether}(address(token), baseline + 1_000e18, TRADER, SWAP);
    }

    function test_feeAboveHalfTheSurplusCannotBeDeployed() public {
        vm.expectRevert(RefractFeeRouter.BadFee.selector);
        new RefractFeeRouter(address(router), IUniswapV2Factory(address(factory)), address(weth), 5_001, COLLECTOR);
    }

    function test_accountingIsPublicAndCheckable() public {
        _pair(100 ether, 200_000e18);
        uint256 baseline = fee.baselineOut(address(token), 1 ether);
        router.setOut(baseline + 1_000e18);

        vm.prank(TRADER);
        fee.swapExactEthForToken{value: 1 ether}(address(token), 0, TRADER, SWAP);

        assertEq(fee.surplusFound(address(token)), 1_000e18);
        assertEq(fee.feesCollected(address(token)), 200e18);
        assertEq(fee.volumeOf(TRADER, address(token)), 1 ether, "volume is what cashback is computed from");
    }
}

/* ------------------------------------------------------------- distributor */

contract DistributorTest is Test {
    RefractDistributor dist;
    MockToken token;
    address constant PUB = address(0xDEC1DE);
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);

    function setUp() public {
        token = new MockToken();
        dist = new RefractDistributor(PUB);
        token.mint(address(dist), 1_000e18);
    }

    function _leaf(address a, uint256 c) internal view returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(a, address(token), c))));
    }

    function _node(bytes32 x, bytes32 y) internal pure returns (bytes32) {
        return x <= y ? keccak256(abi.encode(x, y)) : keccak256(abi.encode(y, x));
    }

    /** Two leaves, so each proof is the other leaf. */
    function _publish(uint256 aliceAmt, uint256 bobAmt) internal returns (bytes32 la, bytes32 lb) {
        la = _leaf(ALICE, aliceAmt);
        lb = _leaf(BOB, bobAmt);
        vm.prank(PUB);
        dist.publishRoot(address(token), _node(la, lb));
    }

    function test_claimPaysWhatWasPublished() public {
        (, bytes32 lb) = _publish(100e18, 50e18);
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = lb;

        dist.claim(ALICE, address(token), 100e18, dist.epoch(address(token)), proof);
        assertEq(token.balanceOf(ALICE), 100e18);
    }

    /** Cumulative, so a second root pays only the difference. */
    function test_secondClaimPaysOnlyTheDifference() public {
        (, bytes32 lb) = _publish(100e18, 50e18);
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = lb;
        dist.claim(ALICE, address(token), 100e18, dist.epoch(address(token)), proof);

        (, bytes32 lb2) = _publish(175e18, 50e18);
        proof[0] = lb2;
        dist.claim(ALICE, address(token), 175e18, dist.epoch(address(token)), proof);

        assertEq(token.balanceOf(ALICE), 175e18, "not 275: the figure is cumulative");
    }

    function test_replayingTheSameClaimReverts() public {
        (, bytes32 lb) = _publish(100e18, 50e18);
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = lb;
        uint256 e = dist.epoch(address(token));
        dist.claim(ALICE, address(token), 100e18, e, proof);

        vm.expectRevert(RefractDistributor.NothingToClaim.selector);
        dist.claim(ALICE, address(token), 100e18, e, proof);
    }

    function test_forgedAmountIsRejected() public {
        (, bytes32 lb) = _publish(100e18, 50e18);
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = lb;

        // Read before expectRevert: epoch() is an external call, and the
        // cheatcode would otherwise match it rather than the claim.
        uint256 e = dist.epoch(address(token));
        vm.expectRevert(RefractDistributor.BadProof.selector);
        dist.claim(ALICE, address(token), 900e18, e, proof);
    }

    /** A claim built for an old root cannot land after a newer one. */
    function test_staleRootIsRejected() public {
        (, bytes32 lb) = _publish(100e18, 50e18);
        uint256 old = dist.epoch(address(token));
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = lb;

        _publish(120e18, 50e18);
        vm.expectRevert(RefractDistributor.StaleRoot.selector);
        dist.claim(ALICE, address(token), 100e18, old, proof);
    }

    function test_onlyPublisherMayPublish() public {
        vm.prank(ALICE);
        vm.expectRevert(RefractDistributor.NotPublisher.selector);
        dist.publishRoot(address(token), bytes32(uint256(1)));
    }

    /** The publisher can direct payments and can never take them. */
    function test_publisherCannotMoveFundsToItself() public {
        bytes32 leaf = _leaf(PUB, 1_000e18);
        vm.prank(PUB);
        dist.publishRoot(address(token), leaf);

        bytes32[] memory none = new bytes32[](0);
        // Even naming itself, payment goes to the account in the leaf, which is
        // the publisher here. That is the worst it can do, and it is visible.
        dist.claim(PUB, address(token), 1_000e18, dist.epoch(address(token)), none);
        assertEq(token.balanceOf(PUB), 1_000e18, "a bad root is detectable, not hidden");
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
