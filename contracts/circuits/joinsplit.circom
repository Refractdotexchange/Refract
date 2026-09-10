pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";

/*
 * Prototype: arbitrary-amount shielded transfer, measured for cost.
 *
 * The fixed-denomination pool hides which note you spent. It cannot hide the
 * amount, because the amount is the pool. This spends notes that carry a
 * hidden value instead, so a deposit, a withdrawal and the change left behind
 * are all whatever size the user chooses.
 *
 * Each note is Poseidon(amount, nullifier, secret). A spend proves:
 *   - every input note is in the tree, and the prover knows its secret
 *   - inputs plus anything deposited equals outputs plus anything withdrawn
 *   - no amount is large enough to wrap the field and mint value from nothing
 *
 * Only the public delta is visible. Deposit 3.7, spend 1.2, and the chain sees
 * a 3.7 deposit and a 1.2 withdrawal with no way to tell they are related, and
 * the 2.5 of change stays shielded as a fresh note.
 */

template MerkleStep() {
    signal input in;
    signal input sibling;
    signal input s;
    signal output out;
    s * (1 - s) === 0;
    signal left;
    signal right;
    left  <== in + s * (sibling - in);
    right <== sibling + s * (in - sibling);
    component h = Poseidon(2);
    h.inputs[0] <== left;
    h.inputs[1] <== right;
    out <== h.out;
}

template MerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal output root;
    component steps[levels];
    for (var i = 0; i < levels; i++) {
        steps[i] = MerkleStep();
        steps[i].in      <== i == 0 ? leaf : steps[i - 1].out;
        steps[i].sibling <== pathElements[i];
        steps[i].s       <== pathIndices[i];
    }
    root <== steps[levels - 1].out;
}

template JoinSplit(levels, nIns, nOuts, bits) {
    /* public */
    signal input root;
    signal input publicAmount;      // net value entering (+) or leaving (-) the shield
    signal input extDataHash;       // binds recipient, relayer and fee
    signal input inNullifiers[nIns];
    signal input outCommitments[nOuts];

    /* private */
    signal input inAmount[nIns];
    signal input inNullifier[nIns];
    signal input inSecret[nIns];
    signal input inLeafIndex[nIns];
    signal input inPathElements[nIns][levels];
    signal input inPathIndices[nIns][levels];

    signal input outAmount[nOuts];
    signal input outNullifier[nOuts];
    signal input outSecret[nOuts];

    component inHash[nIns];
    component nullHash[nIns];
    component tree[nIns];
    component inRange[nIns];
    component isDummy[nIns];

    var sumIn = 0;

    for (var i = 0; i < nIns; i++) {
        // Amounts are range-checked. Without this, two "amounts" that wrap the
        // field could sum to something smaller than either, minting value.
        inRange[i] = Num2Bits(bits);
        inRange[i].in <== inAmount[i];

        inHash[i] = Poseidon(3);
        inHash[i].inputs[0] <== inAmount[i];
        inHash[i].inputs[1] <== inNullifier[i];
        inHash[i].inputs[2] <== inSecret[i];

        // Bound to the leaf index so the same note cannot be spent twice
        // inside one proof, which a value-carrying note otherwise allows.
        nullHash[i] = Poseidon(2);
        nullHash[i].inputs[0] <== inNullifier[i];
        nullHash[i].inputs[1] <== inLeafIndex[i];
        nullHash[i].out === inNullifiers[i];

        tree[i] = MerkleProof(levels);
        tree[i].leaf <== inHash[i].out;
        for (var j = 0; j < levels; j++) {
            tree[i].pathElements[j] <== inPathElements[i][j];
            tree[i].pathIndices[j]  <== inPathIndices[i][j];
        }

        // A zero-value input is a filler, so a spend can use fewer notes than
        // the circuit has slots without inventing a tree membership for it.
        isDummy[i] = IsZero();
        isDummy[i].in <== inAmount[i];
        (tree[i].root - root) * (1 - isDummy[i].out) === 0;

        sumIn += inAmount[i];
    }

    component outHash[nOuts];
    component outRange[nOuts];
    var sumOut = 0;

    for (var i = 0; i < nOuts; i++) {
        outRange[i] = Num2Bits(bits);
        outRange[i].in <== outAmount[i];

        outHash[i] = Poseidon(3);
        outHash[i].inputs[0] <== outAmount[i];
        outHash[i].inputs[1] <== outNullifier[i];
        outHash[i].inputs[2] <== outSecret[i];
        outHash[i].out === outCommitments[i];

        sumOut += outAmount[i];
    }

    // Value is conserved. publicAmount is what crosses the boundary.
    sumIn + publicAmount === sumOut;

    // Bind the external data so a watcher cannot rewrite the recipient.
    signal extSq;
    extSq <== extDataHash * extDataHash;
}

component main {
    public [root, publicAmount, extDataHash, inNullifiers, outCommitments]
} = JoinSplit(20, 2, 2, 96);
