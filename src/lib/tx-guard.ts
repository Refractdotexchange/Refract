/**
 * Turning wallet failures into sentences a person can act on.
 *
 * Two things went wrong in practice and both are handled here.
 *
 * The chain guard exists because a wallet left on Ethereum mainnet will
 * happily sign a transaction to the pool's address, where there is no
 * contract. The value lands at an address nobody controls on that chain and it
 * is not coming back. Reads in this app go through the app's own RPC and are
 * always on 4663, so nothing on screen hints that the wallet disagrees. The
 * only safe move is to refuse to write until the wallet is on 4663.
 *
 * The revert decoder exists because "Internal JSON-RPC error" is what a wallet
 * shows when its own node rejects a call and the ABI carries no error
 * definitions. For a shielded withdrawal that is the worst possible message:
 * the user cannot tell whether their note is spent, and the honest answer is
 * almost always that it is not.
 */

import { robinhoodChain } from "./chain";

export const REQUIRED_CHAIN_ID = robinhoodChain.id;

/**
 * A withdrawal runs a Groth16 pairing check, which is heavy enough that some
 * wallet RPCs fail to estimate it and report an unusable error instead. A
 * fixed limit skips estimation entirely. Unused gas is never charged, and a
 * measured withdrawal against a fork of live state used 298k, so this is
 * generous without costing anything.
 */
export const WITHDRAW_GAS = 900_000n;

/** Plain-English text for every way the pool can reject a call. */
const REVERTS: Record<string, string> = {
  UnknownRoot:
    "The pool does not recognise the Merkle root this proof was built against. Your note is unspent. This usually means your wallet is talking to a node that has not caught up yet.",
  BadProof: "The pool rejected the proof. Your note is unspent.",
  NullifierUsed: "This note has already been spent.",
  CommitmentUsed: "That commitment is already in the pool. Generate a fresh note.",
  WrongValue: "The amount sent did not match this pool's fixed denomination. Nothing was moved.",
  FeeTooHigh: "The relayer fee exceeds the pool denomination.",
  NotInField: "The commitment is out of range for the proving field.",
  TransferFailed: "The pool could not pay the recipient. Your note is unspent.",
  TreeFull: "This pool is full.",
};

/** True when the user dismissed the wallet prompt rather than hitting a fault. */
export function isUserRejection(e: unknown): boolean {
  return /User rejected|denied|rejected the request|User denied/i.test(String(e));
}

/**
 * Walks a viem error's cause chain looking for the decoded revert.
 *
 * Deliberately matched on shape rather than `instanceof`. Class identity is
 * not reliable here: viem ships both CJS and ESM builds, and a bundler that
 * hands two copies to different modules makes every `instanceof` silently
 * false, which is how a decoded `UnknownRoot` ends up displayed as raw error
 * text. Reading the fields costs nothing and cannot fail that way.
 */
function findRevert(e: unknown): { errorName?: string; reason?: string } | null {
  let cur: unknown = e;
  for (let i = 0; i < 12 && cur != null; i++) {
    const c = cur as { data?: { errorName?: string }; reason?: string; cause?: unknown };
    if (c.data?.errorName) return { errorName: c.data.errorName };
    if (typeof c.reason === "string" && c.reason) return { reason: c.reason };
    cur = c.cause;
  }
  return null;
}

/**
 * Best available explanation for a failed contract call.
 *
 * The decoded custom error is the only part of a viem message that is actually
 * about the contract. Everything below it is transport noise.
 */
export function explainRevert(e: unknown, fallback: string): string {
  const revert = findRevert(e);
  if (revert?.errorName) {
    return (
      REVERTS[revert.errorName] ??
      `The pool rejected the call (${revert.errorName}). Your note is unspent.`
    );
  }
  if (revert?.reason) return revert.reason;

  const msg = String((e as Error)?.message ?? e);

  // A wallet whose node failed outright. Say what to check, not "internal error".
  if (/Internal JSON-RPC error|-32603|internal error/i.test(msg)) {
    return "Your wallet's node could not process this transaction. Nothing was sent and your note is unspent. Check that your wallet is on Robinhood Chain (4663) and try again.";
  }
  /*
   * -32602 is "invalid params", which is what a node returns when it will not
   * serve archive data without a paid token. viem renders that as a malformed
   * request and sends the reader hunting for a bug that is not there.
   */
  if (/Archive requests require|-32602|Invalid parameters were provided/i.test(msg)) {
    return "The RPC this app is talking to will not serve historical logs, which is how your notes are found. Nothing was sent. Reload to retry, and if it persists the node needs replacing.";
  }
  if (/insufficient funds/i.test(msg)) {
    return "Not enough ETH in this wallet to cover gas. Nothing was sent.";
  }
  return `${fallback} ${msg.slice(0, 140)}`;
}
