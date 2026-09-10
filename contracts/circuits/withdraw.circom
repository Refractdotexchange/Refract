pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";

/*
 * Withdrawal circuit for RefractShielded.
 *
 * Proves, without revealing which note: "I know the secret behind a commitment
 * that sits in the Merkle tree with this root, and here is its nullifier."
 *
 * The nullifier is derived from the secret, so it is unique per note and
 * cannot be linked back to the deposit. The contract stores spent nullifiers,
 * which is what stops a note being spent twice.
 */

/* One level of a Merkle path. `s` selects which side the sibling is on. */
template MerkleStep() {
    signal input in;
    signal input sibling;
    signal input s;          // 0 = we are the left child, 1 = the right
    signal output out;

    s * (1 - s) === 0;       // force s to be a bit

    // Swap the pair when we are the right child, without branching.
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
        steps[i].in       <== i == 0 ? leaf : steps[i - 1].out;
        steps[i].sibling  <== pathElements[i];
        steps[i].s        <== pathIndices[i];
    }
    root <== steps[levels - 1].out;
}

template Withdraw(levels) {
    /* public */
    signal input root;
    signal input nullifierHash;
    signal input recipient;      // bound into the proof so it cannot be swapped
    signal input relayer;
    signal input fee;
    signal input refund;

    /* private */
    signal input nullifier;
    signal input secret;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // The commitment that was deposited.
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== nullifier;
    commitmentHasher.inputs[1] <== secret;

    // Its nullifier. Derived from the secret half only, so publishing it
    // reveals nothing about which commitment it belongs to.
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHasher.out === nullifierHash;

    // The commitment is in the tree.
    component tree = MerkleProof(levels);
    tree.leaf <== commitmentHasher.out;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i]  <== pathIndices[i];
    }
    tree.root === root;

    /*
     * recipient, relayer, fee and refund take no part in the maths above, but
     * they must still be constrained. Squaring each one binds it into the
     * proof, so a watcher who sees the transaction in flight cannot rewrite
     * the recipient and steal the withdrawal.
     */
    signal recipientSq;
    signal relayerSq;
    signal feeSq;
    signal refundSq;
    recipientSq <== recipient * recipient;
    relayerSq   <== relayer * relayer;
    feeSq       <== fee * fee;
    refundSq    <== refund * refund;
}

component main {
    public [root, nullifierHash, recipient, relayer, fee, refund]
} = Withdraw(20);
