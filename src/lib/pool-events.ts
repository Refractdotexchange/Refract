/**
 * Reads every commitment in a pool from its Deposit events.
 *
 * Order matters: the Merkle tree is built by insertion order, so leaves are
 * sorted by the leafIndex the contract assigned rather than by block, which
 * would be ambiguous for two deposits in the same block.
 */

import type { Address, PublicClient } from "viem";
import { shieldedPoolAbi } from "./pool-abi";

const CHUNK = 25_000n;

export async function fetchLeaves(
  client: PublicClient,
  pool: Address,
  deployBlock: bigint,
): Promise<bigint[]> {
  const head = await client.getBlockNumber();
  const found = new Map<number, bigint>();

  for (let from = deployBlock; from <= head; from += CHUNK) {
    const to = from + CHUNK - 1n > head ? head : from + CHUNK - 1n;
    const logs = await client.getLogs({
      address: pool,
      event: shieldedPoolAbi[8],
      fromBlock: from,
      toBlock: to,
    });
    for (const log of logs) {
      const args = log.args as { commitment?: `0x${string}`; leafIndex?: number };
      if (args.commitment == null || args.leafIndex == null) continue;
      found.set(Number(args.leafIndex), BigInt(args.commitment));
    }
  }

  // Reconstruct in index order, so a gap is a loud failure rather than a
  // silently wrong tree that produces proofs the contract rejects.
  const leaves: bigint[] = [];
  for (let i = 0; i < found.size; i++) {
    const leaf = found.get(i);
    if (leaf === undefined) {
      throw new Error(`Deposit history has a gap at index ${i}. Try again.`);
    }
    leaves.push(leaf);
  }
  return leaves;
}
