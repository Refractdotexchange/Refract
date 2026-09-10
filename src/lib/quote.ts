import { type Address, zeroAddress } from "viem";
import { CONTRACTS, V3_FEE_TIERS, serverClient } from "./chain";
import {
  erc20Abi,
  quoterV2Abi,
  uniswapV2FactoryAbi,
  uniswapV2RouterAbi,
  uniswapV3FactoryAbi,
} from "./abi";
import { cached, withRetry } from "./rpc";
import { quoteV4, type PoolKey } from "./v4";

export const NATIVE = zeroAddress as Address;
const WETH = CONTRACTS.weth as Address;

export type Route = {
  id: string;
  protocol: "uniswap-v2" | "uniswap-v3" | "uniswap-v4";
  label: string;
  detail: string;
  /** Human-readable hop path, e.g. ["ETH", "USDG"]. */
  hops: string[];
  amountOut: string;
  fee?: number;
  gasEstimate?: string;
  /** Present on V4 routes: the pool this quote came from. */
  poolKey?: PoolKey;
  zeroForOne?: boolean;
};

export type QuoteResult = {
  /** Marginal price from a tiny probe trade, used to measure impact. */
  spotOut?: string;
  priceImpactBps?: number | null;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: string;
  routes: Route[];
  best: Route | null;
  updatedAt: number;
};

/** Native ETH is routed as WETH; the router wraps/unwraps at the edges. */
const asRoutable = (t: Address): Address => (t === NATIVE ? WETH : t);

async function v2Quote(
  path: Address[],
  amountIn: bigint,
): Promise<bigint | null> {
  try {
    const amounts = await withRetry(() =>
      serverClient.readContract({
        address: CONTRACTS.uniswapV2Router as Address,
        abi: uniswapV2RouterAbi,
        functionName: "getAmountsOut",
        args: [amountIn, path],
      }),
    );
    const out = amounts[amounts.length - 1];
    return out > 0n ? out : null;
  } catch {
    return null;
  }
}

async function v3Quote(
  tokenIn: Address,
  tokenOut: Address,
  fee: number,
  amountIn: bigint,
): Promise<{ amountOut: bigint; gasEstimate: bigint } | null> {
  try {
    const poolAddress = await withRetry(() =>
      serverClient.readContract({
        address: CONTRACTS.uniswapV3Factory as Address,
        abi: uniswapV3FactoryAbi,
        functionName: "getPool",
        args: [tokenIn, tokenOut, fee],
      }),
    );
    if (!poolAddress || poolAddress === zeroAddress) return null;

    // QuoterV2 is state-mutating by design, so it must be simulated, not read.
    const { result } = await withRetry(() =>
      serverClient.simulateContract({
        address: CONTRACTS.quoterV2 as Address,
        abi: quoterV2Abi,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
      }),
    );
    const [amountOut, , , gasEstimate] = result as readonly [bigint, bigint, number, bigint];
    return amountOut > 0n ? { amountOut, gasEstimate } : null;
  } catch {
    return null;
  }
}

async function symbolOf(token: Address): Promise<string> {
  if (token === NATIVE) return "ETH";
  return cached(`symbol:${token}`, 10 * 60_000, async () => {
    try {
      return await withRetry(() =>
        serverClient.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
      );
    } catch {
      return token.slice(0, 6);
    }
  });
}

/**
 * Quote a swap across every venue deployed on chain 4663 and rank by output.
 * V2 is checked direct and via the WETH hop; V3 is checked on all fee tiers.
 */
export async function quote(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
): Promise<QuoteResult> {
  const inR = asRoutable(tokenIn);
  const outR = asRoutable(tokenOut);

  if (amountIn <= 0n || inR.toLowerCase() === outR.toLowerCase()) {
    return {
      tokenIn,
      tokenOut,
      amountIn: amountIn.toString(),
      routes: [],
      best: null,
      updatedAt: Date.now(),
    };
  }

  const [symIn, symOut] = await Promise.all([symbolOf(tokenIn), symbolOf(tokenOut)]);
  const needsHop = inR !== WETH && outR !== WETH;

  const [v4Result, v2Direct, v2Hop, v2PairExists, ...v3Results] = await Promise.all([
    // V4 addresses native ETH directly, so it gets the caller's tokens rather
    // than the WETH-substituted ones. Pons graduates launch tokens here, which
    // makes this the only venue for a token that has just left its curve.
    quoteV4(tokenIn, tokenOut, amountIn).catch(() => null),
    v2Quote([inR, outR], amountIn),
    needsHop ? v2Quote([inR, WETH, outR], amountIn) : Promise.resolve(null),
    withRetry(() =>
      serverClient.readContract({
        address: CONTRACTS.uniswapV2Factory as Address,
        abi: uniswapV2FactoryAbi,
        functionName: "getPair",
        args: [inR, outR],
      }),
    ).catch(() => zeroAddress as Address),
    ...V3_FEE_TIERS.map((fee) => v3Quote(inR, outR, fee, amountIn)),
  ]);

  const routes: Route[] = [];

  if (v4Result) {
    routes.push({
      id: "v4",
      protocol: "uniswap-v4",
      label: "Uniswap V4",
      detail:
        v4Result.poolKey.hooks === zeroAddress
          ? `${(v4Result.poolKey.fee / 10_000).toFixed(2)}% tier`
          : "hooked pool",
      hops: [symIn, symOut],
      amountOut: v4Result.amountOut.toString(),
      fee: v4Result.poolKey.fee,
      gasEstimate: v4Result.gasEstimate.toString(),
      poolKey: v4Result.poolKey,
      zeroForOne: v4Result.zeroForOne,
    });
  }

  if (v2Direct && v2PairExists !== zeroAddress) {
    routes.push({
      id: "v2-direct",
      protocol: "uniswap-v2",
      label: "Uniswap V2",
      detail: "direct pair",
      hops: [symIn, symOut],
      amountOut: v2Direct.toString(),
    });
  }
  if (v2Hop) {
    routes.push({
      id: "v2-weth",
      protocol: "uniswap-v2",
      label: "Uniswap V2",
      detail: "via WETH",
      hops: [symIn, "WETH", symOut],
      amountOut: v2Hop.toString(),
    });
  }
  V3_FEE_TIERS.forEach((fee, i) => {
    const r = v3Results[i];
    if (!r) return;
    routes.push({
      id: `v3-${fee}`,
      protocol: "uniswap-v3",
      label: "Uniswap V3",
      detail: `${(fee / 10_000).toFixed(2)}% tier`,
      hops: [symIn, symOut],
      amountOut: r.amountOut.toString(),
      fee,
      gasEstimate: r.gasEstimate.toString(),
    });
  });

  routes.sort((a, b) => (BigInt(b.amountOut) > BigInt(a.amountOut) ? 1 : -1));

  const best = routes[0] ?? null;

  // Price impact: quote a probe 1000x smaller on the same venue and compare
  // unit prices. The probe is small enough to approximate the marginal price,
  // so the gap is what this trade's size costs you.
  let priceImpactBps: number | null = null;
  if (best) {
    const probeIn = amountIn / 1000n;
    if (probeIn > 0n) {
      const probeOut =
        best.protocol === "uniswap-v4"
          ? (await quoteV4(tokenIn, tokenOut, probeIn).catch(() => null))?.amountOut ?? null
          : best.protocol === "uniswap-v2"
            ? await v2Quote(best.id === "v2-weth" ? [inR, WETH, outR] : [inR, outR], probeIn)
            : (await v3Quote(inR, outR, best.fee ?? 3000, probeIn))?.amountOut ?? null;

      if (probeOut && probeOut > 0n) {
        // Compare unit prices by cross-multiplying rather than dividing first:
        // token decimals differ by orders of magnitude (1e18 in vs 1e6 out), so
        // an intermediate division truncates the ratio straight to zero.
        //
        //   impact = 1 - (actualOut / amountIn) / (probeOut / probeIn)
        const spot = amountIn * probeOut; // denominator basis
        const actual = BigInt(best.amountOut) * probeIn;
        if (spot > 0n) {
          const bps = Number(((spot - actual) * 10_000n) / spot);
          priceImpactBps = Math.max(0, bps);
        }
      }
    }
  }

  return {
    tokenIn,
    tokenOut,
    amountIn: amountIn.toString(),
    routes,
    best,
    priceImpactBps,
    updatedAt: Date.now(),
  };
}

/** ETH price in USD, taken from the deepest ETH/USDG pool on chain. */
export async function getEthUsd(): Promise<number | null> {
  return cached("ethUsd", 30_000, async () => {
    const usdg = CONTRACTS.usdg as Address;
    const decimals = await withRetry(() =>
      serverClient.readContract({ address: usdg, abi: erc20Abi, functionName: "decimals" }),
    ).catch(() => 6);

    const oneEth = 10n ** 18n;
    const candidates = await Promise.all([
      v2Quote([WETH, usdg], oneEth),
      ...V3_FEE_TIERS.map((fee) => v3Quote(WETH, usdg, fee, oneEth).then((r) => r?.amountOut ?? null)),
    ]);

    const best = candidates.filter((c): c is bigint => c != null).sort((a, b) => (b > a ? 1 : -1))[0];
    if (!best) return null;
    return Number(best) / 10 ** Number(decimals);
  });
}
