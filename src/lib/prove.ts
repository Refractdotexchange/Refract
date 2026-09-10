/**
 * Browser-side proof generation.
 *
 * Everything here runs on the user's machine. The nullifier and secret are
 * never sent anywhere: they go into the witness, a proof comes out, and the
 * proof reveals nothing about which note produced it.
 *
 * The proving key is about 5MB, so it is fetched only when someone actually
 * withdraws rather than on page load.
 */

import type { Note } from "./shielded";
import { buildProof } from "./merkle";
import { toHex32 } from "./shielded";

const WASM_URL = "/zk/withdraw.wasm";
const ZKEY_URL = "/zk/withdraw.zkey";

export type Groth16Proof = {
  a: [bigint, bigint];
  b: [[bigint, bigint], [bigint, bigint]];
  c: [bigint, bigint];
  root: `0x${string}`;
  nullifierHash: `0x${string}`;
};

type SnarkjsProof = {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
};

export type ProveProgress = (stage: string) => void;

/**
 * Build a withdrawal proof.
 *
 * `leaves` must be every commitment in the pool, in insertion order, read from
 * Deposit events. The tree is rebuilt locally rather than requested from a
 * server, because asking anyone for "the path to my commitment" would identify
 * the note.
 */
export async function proveWithdrawal({
  note,
  leaves,
  recipient,
  relayer = "0x0000000000000000000000000000000000000000",
  fee = 0n,
  onProgress,
}: {
  note: Note;
  leaves: bigint[];
  recipient: `0x${string}`;
  relayer?: `0x${string}`;
  fee?: bigint;
  onProgress?: ProveProgress;
}): Promise<Groth16Proof> {
  const index = leaves.findIndex((l) => l === note.commitment);
  if (index === -1) {
    throw new Error(
      "This note's deposit is not in the pool yet. If you just deposited, wait for the transaction to confirm.",
    );
  }

  onProgress?.("Rebuilding the tree");
  const { root, pathElements, pathIndices } = await buildProof(leaves, index);

  onProgress?.("Loading the proving key");
  const snarkjs = await import("snarkjs");

  onProgress?.("Generating the proof");
  const input = {
    root: root.toString(),
    nullifierHash: note.nullifierHash.toString(),
    recipient: BigInt(recipient).toString(),
    relayer: BigInt(relayer).toString(),
    fee: fee.toString(),
    refund: "0",
    nullifier: note.nullifier.toString(),
    secret: note.secret.toString(),
    pathElements: pathElements.map(String),
    pathIndices: pathIndices.map(String),
  };

  const { proof } = (await snarkjs.groth16.fullProve(input, WASM_URL, ZKEY_URL)) as {
    proof: SnarkjsProof;
  };

  onProgress?.("Proof ready");

  // snarkjs emits pi_b with its coordinate pairs swapped relative to what the
  // Solidity verifier expects. Getting this backwards produces a proof that
  // verifies locally and is rejected on-chain.
  return {
    a: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    b: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ],
    c: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
    root: toHex32(root),
    nullifierHash: toHex32(note.nullifierHash),
  };
}
