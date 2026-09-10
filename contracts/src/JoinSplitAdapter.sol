// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./RefractPool.sol";

interface IGroth16JoinSplit {
    function verifyProof(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[7] calldata pubSignals
    ) external view returns (bool);
}

/**
 * Bridges snarkjs's generated joinsplit verifier to the pool's interface.
 *
 * The length check is the seam between a fixed-size array and a dynamic one.
 * Relaxing it would let a caller supply fewer public inputs than the circuit
 * constrains, which for this circuit means leaving the output commitments or
 * the amount unbound.
 */
contract JoinSplitAdapter is IVerifier {
    IGroth16JoinSplit public immutable inner;

    error WrongInputCount();

    constructor(IGroth16JoinSplit _inner) {
        inner = _inner;
    }

    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata input
    ) external view returns (bool) {
        if (input.length != 7) revert WrongInputCount();
        uint[7] memory fixedInput;
        for (uint256 i = 0; i < 7; i++) fixedInput[i] = input[i];
        return inner.verifyProof(a, b, c, fixedInput);
    }
}
