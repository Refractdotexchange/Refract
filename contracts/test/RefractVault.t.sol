// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/RefractVault.sol";

contract MockToken is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a; balanceOf[to] += a; return true;
    }
    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[t] += a; return true;
    }
}

contract RefractVaultTest is Test {
    RefractVault vault;
    MockToken token;

    uint256 operatorKey = 0xA11CE;
    address operator;
    address owner = address(0xB0B);
    address alice = address(0xA1);
    address bob = address(0xB2);

    uint256 constant DELAY = 7 days;

    function setUp() public {
        operator = vm.addr(operatorKey);
        vm.prank(owner);
        vault = new RefractVault(operator, DELAY);
        token = new MockToken();
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        token.mint(alice, 1_000e18);
    }

    /* ------------------------------------------------------------- deposits */

    function test_depositNative() public {
        vm.prank(alice);
        vault.deposit{value: 5 ether}(address(0), 5 ether);
        assertEq(address(vault).balance, 5 ether);
        assertEq(vault.netDeposited(alice, address(0)), 5 ether);
    }

    function test_depositToken() public {
        vm.startPrank(alice);
        token.approve(address(vault), 100e18);
        vault.deposit(address(token), 100e18);
        vm.stopPrank();
        assertEq(token.balanceOf(address(vault)), 100e18);
        assertEq(vault.netDeposited(alice, address(token)), 100e18);
    }

    function test_depositNativeRejectsMismatchedValue() public {
        vm.prank(alice);
        vm.expectRevert(RefractVault.NativeValueMismatch.selector);
        vault.deposit{value: 1 ether}(address(0), 2 ether);
    }

    function test_directSendReverts() public {
        vm.prank(alice);
        (bool ok, ) = address(vault).call{value: 1 ether}("");
        assertFalse(ok, "raw send must revert so every credit has an event");
    }

    function test_pauseBlocksDepositsOnly() public {
        vm.prank(alice);
        vault.deposit{value: 5 ether}(address(0), 5 ether);

        vm.prank(owner);
        vault.setDepositsPaused(true);

        vm.prank(bob);
        vm.expectRevert(RefractVault.DepositsArePaused.selector);
        vault.deposit{value: 1 ether}(address(0), 1 ether);

        // Withdrawals must still work while paused.
        _withdraw(alice, address(0), 5 ether, 1, block.timestamp + 1 hours);
        assertEq(alice.balance, 100 ether);
    }

    /* ---------------------------------------------------------- withdrawals */

    function test_withdrawWithOperatorSignature() public {
        vm.prank(alice);
        vault.deposit{value: 10 ether}(address(0), 10 ether);

        _withdraw(alice, address(0), 4 ether, 1, block.timestamp + 1 hours);

        assertEq(alice.balance, 94 ether);
        assertEq(address(vault).balance, 6 ether);
        // Escape floor drops by what was paid out.
        assertEq(vault.netDeposited(alice, address(0)), 6 ether);
    }

    function test_withdrawCanExceedDepositAfterInternalSwap() public {
        // Bob funds the pool; Alice is paid more than she put in, which is what
        // an internal swap in her favour looks like on-chain.
        vm.prank(bob);
        vault.deposit{value: 20 ether}(address(0), 20 ether);
        vm.prank(alice);
        vault.deposit{value: 1 ether}(address(0), 1 ether);

        _withdraw(alice, address(0), 3 ether, 1, block.timestamp + 1 hours);

        assertEq(alice.balance, 102 ether);
        // Floor saturates at zero rather than underflowing.
        assertEq(vault.netDeposited(alice, address(0)), 0);
    }

    function test_withdrawRejectsForgedSignature() public {
        vm.prank(alice);
        vault.deposit{value: 5 ether}(address(0), 5 ether);

        uint256 wrongKey = 0xBAD;
        bytes memory sig = _sign(wrongKey, alice, address(0), 5 ether, 1, block.timestamp + 1 hours);

        vm.expectRevert(RefractVault.BadSignature.selector);
        vault.withdraw(alice, address(0), 5 ether, 1, block.timestamp + 1 hours, sig);
    }

    function test_withdrawRejectsReplay() public {
        vm.prank(alice);
        vault.deposit{value: 10 ether}(address(0), 10 ether);

        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(operatorKey, alice, address(0), 2 ether, 7, dl);
        vault.withdraw(alice, address(0), 2 ether, 7, dl, sig);

        vm.expectRevert(RefractVault.TicketAlreadyUsed.selector);
        vault.withdraw(alice, address(0), 2 ether, 7, dl, sig);
    }

    function test_withdrawRejectsExpired() public {
        vm.prank(alice);
        vault.deposit{value: 5 ether}(address(0), 5 ether);

        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(operatorKey, alice, address(0), 1 ether, 1, dl);
        vm.warp(dl + 1);

        vm.expectRevert(RefractVault.TicketExpired.selector);
        vault.withdraw(alice, address(0), 1 ether, 1, dl, sig);
    }

    function test_withdrawRejectsTamperedAmount() public {
        vm.prank(alice);
        vault.deposit{value: 10 ether}(address(0), 10 ether);

        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(operatorKey, alice, address(0), 1 ether, 1, dl);

        // Same signature, larger amount.
        vm.expectRevert(RefractVault.BadSignature.selector);
        vault.withdraw(alice, address(0), 9 ether, 1, dl, sig);
    }

    /* --------------------------------------------------------------- escape */

    function test_escapeLockedBeforeDelay() public {
        vm.prank(alice);
        vault.deposit{value: 5 ether}(address(0), 5 ether);

        vm.warp(block.timestamp + DELAY - 1);
        vm.prank(alice);
        vm.expectRevert(RefractVault.EscapeNotUnlocked.selector);
        vault.escape(address(0));
    }

    function test_escapeRecoversAfterOperatorGoesSilent() public {
        vm.prank(alice);
        vault.deposit{value: 5 ether}(address(0), 5 ether);

        vm.warp(block.timestamp + DELAY + 1);
        vm.prank(alice);
        vault.escape(address(0));

        assertEq(alice.balance, 100 ether, "depositor made whole");
        assertEq(vault.netDeposited(alice, address(0)), 0);
    }

    function test_escapeCappedAtOwnDeposit() public {
        vm.prank(alice);
        vault.deposit{value: 1 ether}(address(0), 1 ether);
        vm.prank(bob);
        vault.deposit{value: 30 ether}(address(0), 30 ether);

        vm.warp(block.timestamp + DELAY + 1);
        vm.prank(alice);
        vault.escape(address(0));

        // Alice cannot take Bob's deposit.
        assertEq(alice.balance, 100 ether);
        assertEq(address(vault).balance, 30 ether);
    }

    function test_withdrawResetsEscapeWindow() public {
        vm.prank(alice);
        vault.deposit{value: 10 ether}(address(0), 10 ether);

        vm.warp(block.timestamp + DELAY - 1 hours);
        _withdraw(alice, address(0), 1 ether, 1, block.timestamp + 1 hours);

        // Proof of life pushes the window out again.
        vm.warp(block.timestamp + DELAY - 1 hours);
        vm.prank(alice);
        vm.expectRevert(RefractVault.EscapeNotUnlocked.selector);
        vault.escape(address(0));
    }

    function test_escapePartialWhenPoolShort() public {
        vm.prank(alice);
        vault.deposit{value: 10 ether}(address(0), 10 ether);

        // Operator legitimately pays most of the pool out to Bob, then vanishes.
        _withdraw(bob, address(0), 8 ether, 1, block.timestamp + 1 hours);

        vm.warp(block.timestamp + DELAY + 1);
        vm.prank(alice);
        vault.escape(address(0));

        // Alice recovers what is left rather than reverting and stranding it.
        assertEq(address(vault).balance, 0);
        assertEq(vault.netDeposited(alice, address(0)), 8 ether, "shortfall remains claimable");
    }

    /* ---------------------------------------------------------------- admin */

    function test_ownerCannotDrainVault() public {
        vm.prank(alice);
        vault.deposit{value: 50 ether}(address(0), 50 ether);

        // There is no owner function that moves funds. Rotating the operator is
        // the strongest owner power, and it still requires a signature to pay out.
        vm.prank(owner);
        vault.setOperator(address(0xDEAD));
        assertEq(address(vault).balance, 50 ether, "owner alone cannot move funds");
    }

    function test_onlyOwnerCanRotateOperator() public {
        vm.prank(alice);
        vm.expectRevert(RefractVault.NotOwner.selector);
        vault.setOperator(alice);
    }

    function test_rotatedOperatorSignsValidly() public {
        vm.prank(alice);
        vault.deposit{value: 5 ether}(address(0), 5 ether);

        uint256 newKey = 0xC0FFEE;
        vm.prank(owner);
        vault.setOperator(vm.addr(newKey));

        uint256 dl = block.timestamp + 1 hours;
        bytes memory oldSig = _sign(operatorKey, alice, address(0), 1 ether, 1, dl);
        vm.expectRevert(RefractVault.BadSignature.selector);
        vault.withdraw(alice, address(0), 1 ether, 1, dl, oldSig);

        bytes memory newSig = _sign(newKey, alice, address(0), 1 ether, 2, dl);
        vault.withdraw(alice, address(0), 1 ether, 2, dl, newSig);
        assertEq(alice.balance, 96 ether);
    }

    function test_constructorRejectsUnsafeDelay() public {
        vm.expectRevert("escapeDelay out of range");
        new RefractVault(operator, 1 hours);
        vm.expectRevert("escapeDelay out of range");
        new RefractVault(operator, 365 days);
    }

    /* ------------------------------------------------------------- fuzzing */

    function testFuzz_escapeNeverExceedsDeposit(uint96 dep, uint96 other) public {
        dep = uint96(bound(dep, 1, 50 ether));
        other = uint96(bound(other, 0, 50 ether));

        vm.deal(alice, dep);
        vm.prank(alice);
        vault.deposit{value: dep}(address(0), dep);

        if (other > 0) {
            vm.deal(bob, other);
            vm.prank(bob);
            vault.deposit{value: other}(address(0), other);
        }

        vm.warp(block.timestamp + DELAY + 1);
        vm.prank(alice);
        vault.escape(address(0));

        assertLe(alice.balance, dep, "escape can never pay more than deposited");
    }

    /* -------------------------------------------------------------- helpers */

    function _sign(uint256 key, address user, address tkn, uint256 amount, uint256 nonce, uint256 deadline)
        internal view returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(vault.WITHDRAW_TYPEHASH(), user, tkn, amount, nonce, deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", vault.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _withdraw(address user, address tkn, uint256 amount, uint256 nonce, uint256 deadline) internal {
        bytes memory sig = _sign(operatorKey, user, tkn, amount, nonce, deadline);
        vault.withdraw(user, tkn, amount, nonce, deadline, sig);
    }
}
