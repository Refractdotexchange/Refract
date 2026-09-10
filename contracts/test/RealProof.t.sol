// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/Verifier.sol";
import "../src/VerifierAdapter.sol";

/**
 * Verifies a genuine Groth16 proof on-chain.
 *
 * The fixture is produced by circuits/prove-test.mjs from a real note, a real
 * Merkle path and the compiled circuit. This is the test that proves the whole
 * stack lines up: circuit, proving key, generated verifier, and the chain's
 * BN254 precompiles.
 */
contract RealProofTest is Test {
    Groth16Verifier verifier;
    VerifierAdapter adapter;

    function setUp() public {
        verifier = new Groth16Verifier();
        adapter = new VerifierAdapter(IGroth16Verifier(address(verifier)));
    }

    function _fixture() internal view returns (
        uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[] memory input
    ) {
        string memory raw = vm.readFile("artifacts/proof-fixture.json");
        uint256[] memory flat = vm.parseJsonUintArray(raw, ".flat");
        a = [flat[0], flat[1]];
        b = [[flat[2], flat[3]], [flat[4], flat[5]]];
        c = [flat[6], flat[7]];
        input = new uint256[](6);
        for (uint256 i = 0; i < 6; i++) input[i] = flat[8 + i];
    }

    function test_realProofVerifiesOnChain() public view {
        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[] memory input) = _fixture();
        assertTrue(adapter.verifyProof(a, b, c, input), "a genuine proof must verify on-chain");
    }

    function test_tamperedRecipientIsRejected() public view {
        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[] memory input) = _fixture();
        // Rewriting the recipient is the attack the binding exists to stop.
        input[2] = uint256(uint160(address(0xBAD)));
        assertFalse(adapter.verifyProof(a, b, c, input), "tampered recipient must fail");
    }

    function test_tamperedNullifierIsRejected() public view {
        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[] memory input) = _fixture();
        input[1] = input[1] + 1;
        assertFalse(adapter.verifyProof(a, b, c, input), "tampered nullifier must fail");
    }

    function test_wrongInputCountReverts() public {
        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, ) = _fixture();
        uint256[] memory short = new uint256[](5);
        vm.expectRevert(VerifierAdapter.WrongInputCount.selector);
        adapter.verifyProof(a, b, c, short);
    }
}
