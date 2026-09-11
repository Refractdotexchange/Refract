import { getAddress, zeroAddress, type Address, type Hex } from "viem";
import { CONTRACTS, serverClient } from "./chain";
import { cached, getRawLogs, latestBlock, pool as runPool, withRetry, type RawLog } from "./rpc";

/**
 * Uniswap V4 support.
 *
 * V4 is a singleton: there is no per-pair contract to look up, so a pool is
 * identified by its PoolKey (currency0, currency1, fee, tickSpacing, hooks).
 * The only way to recover a key is to read the Initialize event the
 * PoolManager emitted when the pool was created.
 *
 * This matters more than it sounds on chain 4663: Pons graduates its launch
 * tokens straight into V4, so a token that finishes its bonding curve is only
 * tradeable here. Quoting V2 and V3 alone misses it entirely.
 */

export const V4_QUOTER = "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94" as Address;

/** Initialize(bytes32 indexed id, address indexed c0, address indexed c1, uint24, int24, address, uint160, int24) */
const INITIALIZE_TOPIC =
  "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438";

export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

export type V4Pool = PoolKey & { poolId: Hex };

export const v4QuoterAbi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
            ],
          },
          { name: "zeroForOne", type: "bool" },
          { name: "exactAmount", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

/** Decode a signed integer of `bits` width from a 32-byte word. */
function toSigned(word: string, bits: number): number {
  const v = BigInt("0x" + word);
  const max = 1n << BigInt(bits - 1);
  return Number(v >= max ? v - (1n << BigInt(bits)) : v);
}

/**
 * Wide on purpose. The 10k-log cap that forces small chunks elsewhere does not
 * apply here: filtering Initialize by the token's indexed slot returns one or
 * two logs, so a 400k window is two requests rather than thirty-two.
 */
/** One backwards step. Wide enough that most tokens are found in the first. */
const WINDOW = 2_000_000n;
/** 2M blocks is about two days here, so this reaches back roughly a month. */
const MAX_WINDOWS = 16;
/** Discovery stops here and returns what it has, so a quote always answers. */
const SCAN_BUDGET_MS = 6_000;
/** 2M halved six times is 31k, below every provider cap seen so far. */
const MAX_SPLIT_DEPTH = 6;

type ScanResult = { ok: boolean; logs: RawLog[] };

/**
 * Scan every block, not a rolling window.
 *
 * This used to look back 400k blocks, which sounds generous and is not: blocks
 * on 4663 are about a tenth of a second, so 400k is eleven hours. Any token
 * that graduated before this morning had no route at all, including this
 * project's own, whose newest pool was 660k blocks old and therefore invisible.
 *
 * A rolling window is the wrong shape regardless. Pool keys are immutable and
 * a pool does not stop existing because it got old, so the only correct window
 * is all of it. Filtering Initialize by the token's indexed slot returns a
 * handful of logs however wide the range, and the node accepts 8M-block spans,
 * so the whole chain is a few requests and the result is cached.
 */

/**
 * Every V4 pool holding `token`, recovered from PoolManager Initialize events.
 *
 * Pool keys are immutable once created, so this is cached for a long time: the
 * expensive part is the log scan, and the answer does not change.
 */
export async function findV4Pools(token: Address, windowBlocks = 0): Promise<V4Pool[]> {
  const t = getAddress(token);

  return cached(`v4pools:${t}`, 30 * 60_000, async () => {
    const head = await latestBlock();
    // windowBlocks 0 means the whole chain, which is the default.
    const from = windowBlocks > 0 && head > BigInt(windowBlocks) ? head - BigInt(windowBlocks) : 0n;
    const padded = ("0x" + t.slice(2).toLowerCase().padStart(64, "0")) as Hex;

    /*
     * Ranges split themselves rather than trusting one chunk size.
     *
     * Providers cap eth_getLogs differently and do not agree: the public node
     * here takes an 8M span for a quiet token, the authenticated one used in
     * production does not, and neither takes a wide span for a token with many
     * pools. A fixed chunk tuned against one of them fails silently against the
     * others, because a rejected range looks exactly like a range with nothing
     * in it. Halving on failure gets the cheap path where it is allowed and
     * still finds everything where it is not.
     */
    const scan = async (f: bigint, to: bigint, topics: (Hex | null)[], depth = 0): Promise<ScanResult> => {
      try {
        const logs = await withRetry(() =>
          getRawLogs({ address: CONTRACTS.uniswapV4PoolManager, fromBlock: f, toBlock: to, topics }),
        );
        return { ok: true, logs };
      } catch {
        if (to - f < 2n || depth >= MAX_SPLIT_DEPTH) return { ok: false, logs: [] };
        const mid = f + (to - f) / 2n;
        const [a, b] = await Promise.all([
          scan(f, mid, topics, depth + 1),
          scan(mid + 1n, to, topics, depth + 1),
        ]);
        return { ok: a.ok || b.ok, logs: [...a.logs, ...b.logs] };
      }
    };

    /*
     * Walk backwards from the head a window at a time and stop at the first
     * window that finds anything, rather than sweeping the whole chain.
     *
     * Sweeping every block is correct and unusable: it took two minutes for a
     * token with many pools, because each wide range came back over the
     * provider's log limit and split all the way down. Walking backwards
     * inverts that. A token's pools are found in the first window or two, and
     * nothing is scanned past them.
     */
    /*
     * A soft deadline, because discovery must never hold a quote hostage. Most
     * tokens also have V2 or V3 liquidity, and a quote that returns those in a
     * second beats one that returns everything in twelve and times out in a
     * serverless function. Whatever has been found when the clock runs out is
     * returned, and the next call resumes from a warm cache.
     */
    const deadline = Date.now() + SCAN_BUDGET_MS;
    const results: ScanResult[] = [];
    let collected: RawLog[] = [];
    let to = head;
    for (let i = 0; i < MAX_WINDOWS && to > 0n; i++) {
      if (Date.now() > deadline) break;
      const f = to > WINDOW ? to - WINDOW : 0n;
      if (windowBlocks > 0 && head - f > BigInt(windowBlocks)) break;
      const pair = await Promise.all([
        scan(f, to, [INITIALIZE_TOPIC, null, padded, null]),
        scan(f, to, [INITIALIZE_TOPIC, null, null, padded]),
      ]);
      results.push(...pair);
      collected.push(...pair[0].logs, ...pair[1].logs);
      // Pool keys are immutable, so the newest window that has any is enough.
      if (collected.length > 0 || f === 0n) break;
      to = f - 1n;
    }

    // Every range failing is a rate limit, not "this token has no pool". Throw
    // so the empty answer is never cached as though it were real.
    if (results.length > 0 && results.every((r) => !r.ok)) {
      throw new Error("V4 pool discovery failed on every block range.");
    }

    const logs = collected;
    const seen = new Map<string, V4Pool>();

    for (const log of logs) {
      const [, id, c0, c1] = log.topics;
      if (!id || !c0 || !c1) continue;
      const body = log.data.slice(2);
      const word = (i: number) => body.slice(i * 64, (i + 1) * 64);
      if (body.length < 64 * 3) continue;

      const key: V4Pool = {
        poolId: id,
        currency0: getAddress(("0x" + c0.slice(26)) as Address),
        currency1: getAddress(("0x" + c1.slice(26)) as Address),
        fee: Number(BigInt("0x" + word(0))),
        tickSpacing: toSigned(word(1), 24),
        hooks: getAddress(("0x" + word(2).slice(24)) as Address),
      };
      seen.set(key.poolId, key);
    }

    return [...seen.values()];
  });
}

/**
 * Quote one V4 pool. The quoter is state-mutating by design, so it is
 * simulated rather than read. Returns null when the pool cannot fill.
 */
export async function quoteV4Pool(
  poolKey: PoolKey,
  zeroForOne: boolean,
  amountIn: bigint,
): Promise<{ amountOut: bigint; gasEstimate: bigint } | null> {
  try {
    const { result } = await withRetry(() =>
      serverClient.simulateContract({
        address: V4_QUOTER,
        abi: v4QuoterAbi,
        functionName: "quoteExactInputSingle",
        args: [{ poolKey, zeroForOne, exactAmount: amountIn, hookData: "0x" }],
      }),
    );
    const [amountOut, gasEstimate] = result as readonly [bigint, bigint];
    return amountOut > 0n ? { amountOut, gasEstimate } : null;
  } catch {
    return null;
  }
}

/**
 * Best V4 quote for a pair. V4 addresses native ETH as the zero address
 * directly rather than through WETH, so callers pass the native sentinel and
 * WETH-paired pools are matched too.
 */
export async function quoteV4(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
): Promise<{ amountOut: bigint; gasEstimate: bigint; poolKey: PoolKey; zeroForOne: boolean } | null> {
  const weth = getAddress(CONTRACTS.weth as Address);
  const inNative = tokenIn === zeroAddress;
  const outNative = tokenOut === zeroAddress;

  // The non-native side is the one worth scanning for.
  const subject = inNative || getAddress(tokenIn) === weth ? tokenOut : tokenIn;
  if (subject === zeroAddress) return null;

  const pools = await findV4Pools(getAddress(subject));
  if (pools.length === 0) return null;

  const matches = (side: Address, want: Address, wantNative: boolean) =>
    side === want || (wantNative && side === zeroAddress) || (side === zeroAddress && wantNative);

  const candidates = pools.filter((p) => {
    const inA = matches(p.currency0, inNative ? zeroAddress : getAddress(tokenIn), inNative);
    const outB = matches(p.currency1, outNative ? zeroAddress : getAddress(tokenOut), outNative);
    const inB = matches(p.currency1, inNative ? zeroAddress : getAddress(tokenIn), inNative);
    const outA = matches(p.currency0, outNative ? zeroAddress : getAddress(tokenOut), outNative);
    return (inA && outB) || (inB && outA);
  });

  const quotes = await Promise.all(
    candidates.map(async (p) => {
      const zeroForOne = matches(p.currency0, inNative ? zeroAddress : getAddress(tokenIn), inNative);
      const q = await quoteV4Pool(p, zeroForOne, amountIn);
      return q ? { ...q, poolKey: p as PoolKey, zeroForOne } : null;
    }),
  );

  const best = quotes
    .filter((q): q is NonNullable<typeof q> => q !== null)
    .sort((a, b) => (b.amountOut > a.amountOut ? 1 : -1))[0];

  return best ?? null;
}
