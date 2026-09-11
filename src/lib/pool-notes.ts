/**
 * Rebuilding your shielded balance from the chain.
 *
 * Nothing on-chain says what you own. A commitment is a hash, and with hidden
 * amounts it does not even leak a size. So the wallet reads every note ever
 * written to the pool, tries to decrypt each one, and keeps the handful that
 * open. What is left is your balance.
 *
 * All of it happens in the browser. A server that could answer "which notes
 * are yours" would be a server that knows your entire position, which is the
 * one thing this is built to avoid.
 */

import type { PublicClient } from "viem";
import { refractPoolAbi } from "./pool-abi-v2";
import { tryDecryptNote, type NotePlain, type ShieldedKey } from "./note-crypto";
import { poseidon } from "./shielded";

export type OwnedNote = NotePlain & {
  leafIndex: number;
  commitment: bigint;
  nullifierHash: bigint;
  spent: boolean;
};

export type PoolScan = {
  /** Every commitment in insertion order, needed to build a Merkle path. */
  leaves: bigint[];
  /** Your notes, spent and unspent. */
  notes: OwnedNote[];
  /** What you can actually spend. */
  balance: bigint;
};

const CHUNK = 25_000n;

/** The nullifier a note will publish when spent, which is how we know it was. */
export async function noteNullifier(note: NotePlain, leafIndex: number): Promise<bigint> {
  return poseidon([note.nullifier, BigInt(leafIndex)]);
}

export async function noteCommitment(note: NotePlain): Promise<bigint> {
  return poseidon([note.amount, note.nullifier, note.secret]);
}

/**
 * Read the whole pool and pick out what is yours.
 *
 * `onProgress` exists because this is slow by construction: one elliptic-curve
 * operation per note in the pool, and the alternative is telling a server who
 * you are.
 */
export async function scanPool({
  client,
  address,
  deployBlock,
  key,
  onProgress,
}: {
  client: PublicClient;
  address: `0x${string}`;
  deployBlock: bigint;
  key: ShieldedKey;
  onProgress?: (stage: string) => void;
}): Promise<PoolScan> {
  onProgress?.("Reading the pool");

  const head = await client.getBlockNumber();
  const events: { commitment: bigint; leafIndex: number; encryptedNote: `0x${string}` }[] = [];

  // Chunked because public RPCs cap the block range on a log query.
  for (let from = deployBlock; from <= head; from += CHUNK) {
    const to = from + CHUNK - 1n > head ? head : from + CHUNK - 1n;
    const logs = await client.getContractEvents({
      address,
      abi: refractPoolAbi,
      eventName: "NewCommitment",
      fromBlock: from,
      toBlock: to,
    });
    for (const l of logs) {
      const a = l.args as { commitment?: `0x${string}`; leafIndex?: number; encryptedNote?: `0x${string}` };
      if (a.commitment === undefined || a.leafIndex === undefined || a.encryptedNote === undefined) continue;
      events.push({
        commitment: BigInt(a.commitment),
        leafIndex: Number(a.leafIndex),
        encryptedNote: a.encryptedNote,
      });
    }
  }

  events.sort((x, y) => x.leafIndex - y.leafIndex);

  // A gap means the scan is incomplete, and a Merkle path built on an
  // incomplete tree produces a root the contract has never seen. Better to say
  // so than to fail later with something unreadable.
  for (let i = 0; i < events.length; i++) {
    if (events[i].leafIndex !== i) {
      throw new Error("The pool history came back incomplete. Try again in a moment.");
    }
  }

  const leaves = events.map((e) => e.commitment);
  const mine: OwnedNote[] = [];

  onProgress?.(`Checking ${events.length} notes`);
  for (const e of events) {
    const plain = await tryDecryptNote(e.encryptedNote, key);
    if (!plain) continue;

    // A note that does not hash to its commitment was not written by a wallet
    // that followed the rules, and is unspendable. Dropping it keeps a
    // deliberately malformed payload from corrupting the balance.
    if ((await noteCommitment(plain)) !== e.commitment) continue;

    // Zero-value padding notes are real notes, just not worth showing.
    if (plain.amount === 0n) continue;

    mine.push({
      ...plain,
      leafIndex: e.leafIndex,
      commitment: e.commitment,
      nullifierHash: await noteNullifier(plain, e.leafIndex),
      spent: false,
    });
  }

  // Which of them have already been spent. Only our own nullifiers are asked
  // about, and only ones we could compute anyway.
  if (mine.length > 0) {
    onProgress?.("Checking what is already spent");
    const calls = mine.map((n) => ({
      address,
      abi: refractPoolAbi,
      functionName: "nullifierSpent" as const,
      args: [`0x${n.nullifierHash.toString(16).padStart(64, "0")}`] as [`0x${string}`],
    }));

    // Batched where Multicall3 is deployed, one at a time where it is not.
    // A chain without it should be slower here, not broken: failing the whole
    // scan would leave the owner unable to see funds that are plainly theirs.
    let spent: boolean[];
    try {
      spent = (await client.multicall({ contracts: calls, allowFailure: false })) as boolean[];
    } catch {
      spent = (await Promise.all(
        calls.map((c) => client.readContract(c)),
      )) as boolean[];
    }
    mine.forEach((n, i) => {
      n.spent = Boolean(spent[i]);
    });
  }

  const balance = mine.reduce((sum, n) => (n.spent ? sum : sum + n.amount), 0n);
  return { leaves, notes: mine, balance };
}

/**
 * Choose which notes to spend.
 *
 * The circuit takes two inputs, so a spend can draw on at most two notes at
 * once. Largest first keeps the count down and leaves small change behind
 * rather than shattering a big note into dust.
 */
export function selectNotes(notes: OwnedNote[], target: bigint): OwnedNote[] | null {
  const usable = notes.filter((n) => !n.spent && n.amount > 0n).sort((a, b) => (b.amount > a.amount ? 1 : -1));
  if (usable.length === 0) return null;

  for (const n of usable) if (n.amount >= target) return [n];
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      if (usable[i].amount + usable[j].amount >= target) return [usable[i], usable[j]];
    }
  }
  return null;
}
