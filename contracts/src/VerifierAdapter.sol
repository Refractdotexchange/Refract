// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./RefractShielded.sol";

interface IGroth16Verifier {
    function verifyProof(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[6] calldata pubSignals
    ) external view returns (bool);
}

/**
 * Bridges snarkjs's generated verifier to the pool's interface.
 *
 * snarkjs emits `uint[6]` because the public input count is fixed at compile
 * time; the pool takes a dynamic array so it is not recompiled every time the
 * circuit's shape changes. The length check here is the seam between the two
 * and must not be relaxed: a shorter array would let a caller leave public
 * inputs unconstrained.
 */
contract VerifierAdapter is IVerifier {
    IGroth16Verifier public immutable inner;

    error WrongInputCount();

    constructor(IGroth16Verifier _inner) {
        inner = _inner;
    }

    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata input
    ) external view returns (bool) {
        if (input.length != 6) revert WrongInputCount();
        uint[6] memory fixedInput;
        for (uint256 i = 0; i < 6; i++) fixedInput[i] = input[i];
        return inner.verifyProof(a, b, c, fixedInput);
    }
}
