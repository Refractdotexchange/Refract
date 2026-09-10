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
const CHUNK = 200_000;

/**
 * Every V4 pool holding `token`, recovered from PoolManager Initialize events.
 *
 * Pool keys are immutable once created, so this is cached for a long time: the
 * expensive part is the log scan, and the answer does not change.
 */
export async function findV4Pools(token: Address, windowBlocks = 400_000): Promise<V4Pool[]> {
  const t = getAddress(token);

  return cached(`v4pools:${t}`, 30 * 60_000, async () => {
    const head = await latestBlock();
    const from = head > BigInt(windowBlocks) ? head - BigInt(windowBlocks) : 0n;
    const padded = ("0x" + t.slice(2).toLowerCase().padStart(64, "0")) as Hex;

    const ranges: { from: bigint; to: bigint }[] = [];
    for (let start = from; start <= head; start += BigInt(CHUNK)) {
      const end = start + BigInt(CHUNK) - 1n;
      ranges.push({ from: start, to: end > head ? head : end });
    }

    // The token can be either side of the pair, so both indexed slots are scanned.
    const tasks = ranges.flatMap(({ from: f, to }) => [
      () =>
        withRetry(() =>
          getRawLogs({
            address: CONTRACTS.uniswapV4PoolManager,
            fromBlock: f,
            toBlock: to,
            topics: [INITIALIZE_TOPIC, null, padded, null],
          }),
        )
          .then((logs) => ({ ok: true, logs }))
          .catch(() => ({ ok: false, logs: [] as RawLog[] })),
      () =>
        withRetry(() =>
          getRawLogs({
            address: CONTRACTS.uniswapV4PoolManager,
            fromBlock: f,
            toBlock: to,
            topics: [INITIALIZE_TOPIC, null, null, padded],
          }),
        )
          .then((logs) => ({ ok: true, logs }))
          .catch(() => ({ ok: false, logs: [] as RawLog[] })),
    ]);

    const results = await runPool(tasks, 4);
    // Every range failing is a rate limit, not "this token has no pool". Throw
    // so the empty answer is never cached as though it were real.
    if (results.every((r) => !r.ok)) {
      throw new Error("V4 pool discovery failed on every block range.");
    }

    const logs = results.flatMap((r) => r.logs);
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
