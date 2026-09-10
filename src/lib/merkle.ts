/**
 * Merkle tree reconstruction for the shielded pool.
 *
 * To spend a note the browser needs a proof path, and building one means
 * knowing every commitment in the tree. Those come from Deposit events, so the
 * tree is rebuilt client-side rather than fetched from a server.
 *
 * That matters for privacy: asking a backend "what is the path for my
 * commitment?" would tell it exactly which note is yours, which is the one
 * thing the whole design is trying to avoid.
 */

import { poseidon, FIELD_SIZE } from "./shielded";

export const LEVELS = 20;

/**
 * Empty-subtree hashes, derived the same way the contract derives them in its
 * constructor. If these disagree the proof will be rejected on-chain, so the
 * seed string is duplicated deliberately and must not drift.
 */
const ZERO_SEED = "refract.shielded.v1";

let zerosCache: bigint[] | null = null;

async function keccakSeed(): Promise<bigint> {
  const { keccak256, toHex } = await import("viem");
  return BigInt(keccak256(toHex(ZERO_SEED))) % FIELD_SIZE;
}

export async function getZeros(): Promise<bigint[]> {
  if (zerosCache) return zerosCache;
  const zeros: bigint[] = [await keccakSeed()];
  for (let i = 1; i < LEVELS; i++) {
    zeros.push(await poseidon([zeros[i - 1], zeros[i - 1]]));
  }
  zerosCache = zeros;
  return zeros;
}

export type MerkleProof = {
  root: bigint;
  pathElements: bigint[];
  pathIndices: number[];
};

/**
 * Build the proof path for the leaf at `index`.
 *
 * Deliberately recomputes the whole tree rather than caching: a stale cache
 * would produce a proof against a root the contract has already forgotten,
 * which fails confusingly at signing time rather than here.
 */
export async function buildProof(leaves: bigint[], index: number): Promise<MerkleProof> {
  if (index < 0 || index >= leaves.length) {
    throw new Error("Commitment is not in the tree yet. Wait for the deposit to confirm.");
  }

  const zeros = await getZeros();
  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];

  let level = leaves.slice();
  let idx = index;

  for (let i = 0; i < LEVELS; i++) {
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    const sibling = siblingIdx < level.length ? level[siblingIdx] : zeros[i];

    pathElements.push(sibling);
    pathIndices.push(isRight ? 1 : 0);

    const next: bigint[] = [];
    for (let j = 0; j < level.length; j += 2) {
      const left = level[j];
      const right = j + 1 < level.length ? level[j + 1] : zeros[i];
      next.push(await poseidon([left, right]));
    }
    level = next.length > 0 ? next : [zeros[i + 1] ?? zeros[i]];
    idx = Math.floor(idx / 2);
  }

  return { root: level[0], pathElements, pathIndices };
}
