// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/DeployShielded.sol";

/**
 * Rehearses the real deployment before it costs gas.
 *
 * Deploys the one-shot deployer exactly as Remix will, then checks the pool it
 * produced is wired correctly and accepts a deposit. If this passes, the same
 * transaction on 4663 will behave the same way.
 */
contract DeployShieldedTest is Test {
    address constant ROUTER = 0x8876789976dEcBfCbBbe364623C63652db8C0904;
    uint256 constant DENOM = 0.001 ether;

    function test_oneShotDeployProducesAWorkingPool() public {
        DeployShielded d = new DeployShielded(ROUTER, address(0), DENOM);

        assertTrue(d.poseidon() != address(0), "poseidon deployed");
        assertTrue(d.verifier() != address(0), "verifier deployed");
        assertTrue(d.adapter() != address(0), "adapter deployed");
        assertTrue(d.pool() != address(0), "pool deployed");

        RefractShielded pool = RefractShielded(payable(d.pool()));
        assertEq(pool.denomination(), DENOM, "denomination set");
        assertEq(pool.token(), address(0), "native pool");
        assertEq(pool.router(), ROUTER, "router wired");

        // The tree must be initialised, otherwise deposits would insert against
        // a zero root and every later proof would fail.
        assertTrue(pool.getLastRoot() != bytes32(0), "tree initialised");

        // A real deposit at the configured size.
        address alice = address(0xA1);
        vm.deal(alice, 1 ether);
        bytes32 commitment = bytes32(uint256(keccak256("note")) % pool.FIELD_SIZE());
        vm.prank(alice);
        pool.deposit{value: DENOM}(commitment);

        assertEq(address(pool).balance, DENOM, "funds held");
        assertEq(pool.nextIndex(), 1, "leaf inserted");
        assertTrue(pool.commitmentExists(commitment), "commitment recorded");
    }

    function test_poseidonInDeployedPoolMatchesCircomlib() public {
        DeployShielded d = new DeployShielded(ROUTER, address(0), DENOM);
        uint256[2] memory pair = [uint256(1), uint256(2)];
        // Same reference vector the circuit uses. A mismatch here would mean
        // every browser proof is rejected by this pool.
        assertEq(
            IHasher(d.poseidon()).poseidon(pair),
            7853200120776062878684798364095072458815029376092732009249414926327459813530,
            "deployed hasher must match circomlibjs"
        );
    }
}
