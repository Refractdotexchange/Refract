import { serverClient } from "./chain";

/**
 * Process-wide gate on outbound RPC calls. Individual scans already limit their
 * own fan-out, but several scans can run at once (a page renders pools, stats
 * and a quote together) and the shared public RPC answers 429 to the burst.
 * Serialising through one gate keeps every caller under the limit.
 */
const MAX_IN_FLIGHT = 6;
const MIN_SPACING_MS = 25;

let inFlight = 0;
let lastStart = 0;
const waiting: (() => void)[] = [];

function releaseSlot() {
  inFlight--;
  const next = waiting.shift();
  if (next) next();
}

async function acquireSlot(): Promise<void> {
  if (inFlight >= MAX_IN_FLIGHT) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  inFlight++;
  const gap = Date.now() - lastStart;
  if (gap < MIN_SPACING_MS) {
    await new Promise((r) => setTimeout(r, MIN_SPACING_MS - gap));
  }
  lastStart = Date.now();
}

/** Run one RPC call through the global gate. */
export async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  await acquireSlot();
  try {
    return await fn();
  } finally {
    releaseSlot();
  }
}

/** Run `tasks` with at most `limit` in flight, preserving result order. */
export async function pool<T>(tasks: (() => Promise<T>)[], limit = 3): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * The public RPCs answer 429 under bursty load. Retry with exponential backoff
 * rather than failing the whole page render.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await throttled(fn);
    } catch (err) {
      lastError = err;
      const msg = String(err);
      const rateLimited = /429|Too Many Requests/i.test(msg);
      const retriable = rateLimited || /timeout|fetch failed|ECONNRESET|socket hang up/i.test(msg);
      if (!retriable || i === attempts - 1) break;
      // Rate limits need real room, not a token pause.
      const base = rateLimited ? 600 : 220;
      await new Promise((r) => setTimeout(r, base * 2 ** i + Math.random() * 250));
    }
  }
  throw lastError;
}

type Entry<T> = { value: T; expires: number };
const store = new Map<string, Entry<unknown>>();

/**
 * Small in-process TTL cache so repeated page loads do not re-scan the chain.
 *
 * `isDegraded` marks a result as incomplete (some RPC ranges failed). Those are
 * cached only briefly, so a partial answer cannot sit around for a full TTL
 * looking like the real thing — and a previously-good value always wins over a
 * degraded one.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  isDegraded?: (value: T) => boolean,
): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expires > Date.now()) return hit.value;
  try {
    const value = await fn();
    const degraded = isDegraded?.(value) ?? false;
    if (degraded && hit) return hit.value; // prefer the last complete answer
    store.set(key, { value, expires: Date.now() + (degraded ? 15_000 : ttlMs) });
    return value;
  } catch (err) {
    // Serve stale data rather than an error page when the RPC is flaky.
    if (hit) return hit.value;
    throw err;
  }
}

export async function latestBlock(): Promise<bigint> {
  return cached("latestBlock", 3_000, () => withRetry(() => serverClient.getBlockNumber()));
}

export type RawLog = {
  address: `0x${string}`;
  topics: `0x${string}`[];
  data: `0x${string}`;
  blockNumber: `0x${string}`;
  transactionHash: `0x${string}`;
  logIndex: `0x${string}`;
};

/**
 * eth_getLogs with a raw topic filter. The launchpad contracts on chain 4663
 * publish no ABI, so we match verified topic hashes directly rather than
 * decoding through viem's typed event helpers.
 */
export async function getRawLogs(filter: {
  address?: string | string[];
  fromBlock: bigint;
  toBlock: bigint;
  topics: (string | string[] | null)[];
}): Promise<RawLog[]> {
  const params: Record<string, unknown> = {
    fromBlock: `0x${filter.fromBlock.toString(16)}`,
    toBlock: `0x${filter.toBlock.toString(16)}`,
    topics: filter.topics,
  };
  if (filter.address) params.address = filter.address;

  const logs = await serverClient.request({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    method: "eth_getLogs" as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params: [params] as any,
  });
  return (logs ?? []) as unknown as RawLog[];
}
