import { NextResponse } from "next/server";
import { encodeFunctionData, getAddress, isAddress, type Address } from "viem";
import { serverClient } from "@/lib/chain";
import { erc20Abi } from "@/lib/abi";
import { curveAbi, launchTokenCurveAbi, NATIVE_PAIR, type CurveState } from "@/lib/curve";
import { cached, withRetry } from "@/lib/rpc";

/**
 * Simulate a buy with `minAmountOut = 0` and a funded caller, and read the
 * amount the curve returns. Costs nothing and moves no funds: it is an
 * eth_call with a balance override, never a transaction.
 *
 * Only native-ETH curves can be probed this way. An ERC-20 curve pulls its
 * payment with transferFrom, which needs a token balance and allowance that a
 * balance override cannot fake, so those still fall back to the estimate.
 */
async function probeBuy(curve: Address, amountIn: bigint): Promise<string | null> {
  const PROBE = "0x1111111111111111111111111111111111111111" as Address;
  const data = encodeFunctionData({
    abi: curveAbi,
    functionName: "buy",
    args: [amountIn, 0n, PROBE],
  });
  const res = (await serverClient.request({
    method: "eth_call",
    params: [
      { from: PROBE, to: curve, data, value: `0x${amountIn.toString(16)}` },
      "latest",
      { [PROBE]: { balance: "0x56BC75E2D63100000" } },
    ],
  } as never)) as `0x${string}`;
  if (!res || res === "0x") return null;
  return BigInt(res).toString();
}

/**
 * Curve state for a launch token: which asset it trades against, how deep the
 * reserves are, and whether it has graduated. Everything a client needs to
 * price a buy locally, so quoting costs no further requests as the user types.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ address: string }> },
) {
  const { address } = await ctx.params;
  const amountIn = new URL(req.url).searchParams.get("amountIn");
  if (!isAddress(address, { strict: false })) {
    return NextResponse.json({ error: "Not a valid token address" }, { status: 400 });
  }
  const token = getAddress(address) as Address;

  try {
    const data = await cached(`curve:${token}`, 15_000, async (): Promise<CurveState | null> => {
      // The token names its own curve, so this needs no log scan.
      const curve = await withRetry(() =>
        serverClient.readContract({
          address: token,
          abi: launchTokenCurveAbi,
          functionName: "curve",
        }),
      ).catch(() => null);

      if (!curve || curve === "0x0000000000000000000000000000000000000000") return null;

      const [pairToken, reserves, feeBps, graduated] = await withRetry(() =>
        serverClient.multicall({
          allowFailure: false,
          contracts: [
            { address: curve, abi: curveAbi, functionName: "pairToken" },
            { address: curve, abi: curveAbi, functionName: "getReserves" },
            { address: curve, abi: curveAbi, functionName: "feeBps" },
            { address: curve, abi: curveAbi, functionName: "graduated" },
          ],
        }),
      );

      // A zero pairToken means the curve trades native ETH, so there is no
      // contract to read metadata from.
      const isNative = pairToken.toLowerCase() === NATIVE_PAIR;

      let pairSymbol = "ETH";
      let pairDecimals = 18;
      if (!isNative) {
        // allowFailure: a pair asset that does not implement string symbol()
        // must not take the whole panel down; only decimals are load-bearing.
        const meta = await withRetry(() =>
          serverClient.multicall({
            allowFailure: true,
            contracts: [
              { address: pairToken, abi: erc20Abi, functionName: "symbol" },
              { address: pairToken, abi: erc20Abi, functionName: "decimals" },
            ],
          }),
        );
        if (meta[1].status !== "success") {
          // Without decimals every amount would be mispriced, so refuse rather
          // than guess: the UI hides the panel instead of risking a bad trade.
          return null;
        }
        pairSymbol =
          meta[0].status === "success"
            ? String(meta[0].result)
            : `${pairToken.slice(0, 6)}…${pairToken.slice(-4)}`;
        pairDecimals = Number(meta[1].result);
      }

      return {
        curve,
        token,
        pairToken,
        isNative,
        pairSymbol,
        pairDecimals,
        pairReserve: reserves[0].toString(),
        tokenReserve: reserves[1].toString(),
        feeBps: Number(feeBps),
        graduated: Boolean(graduated),
      };
    });

    if (!data) {
      return NextResponse.json({ error: "This token has no Pons curve." }, { status: 404 });
    }

    // Ask the contract what it would actually pay out. The closed-form quote
    // is unreliable because the applied fee does not match feeBps(), so where
    // the call can be simulated we use the real number instead.
    let exactOut: string | null = null;
    if (amountIn && /^\d+$/.test(amountIn) && BigInt(amountIn) > 0n && data.isNative) {
      exactOut = await probeBuy(data.curve, BigInt(amountIn)).catch(() => null);
    }

    return NextResponse.json({ ...data, exactOut }, {
      // Short: reserves move with every trade, and a stale quote misprices.
      headers: { "cache-control": "public, s-maxage=5, stale-while-revalidate=15" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Could not read the curve.", detail: String(err).slice(0, 200) },
      { status: 502 },
    );
  }
}
