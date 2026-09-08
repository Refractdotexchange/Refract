import { NextResponse } from "next/server";
import { isAddress, getAddress, zeroAddress, type Address } from "viem";
import { CONTRACTS, V3_FEE_TIERS, serverClient } from "@/lib/chain";
import {
  erc20Abi,
  uniswapV2FactoryAbi,
  uniswapV2PairAbi,
  uniswapV3FactoryAbi,
  uniswapV3PoolAbi,
} from "@/lib/abi";
import { cached, withRetry } from "@/lib/rpc";
import { getEthUsd } from "@/lib/quote";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WETH = CONTRACTS.weth as Address;

/** Uniswap V3 price from sqrtPriceX96, returned as token1 per token0. */
function priceFromSqrt(sqrtPriceX96: bigint, decimals0: number, decimals1: number): number {
  const q96 = 2 ** 96;
  const ratio = Number(sqrtPriceX96) / q96;
  return ratio * ratio * 10 ** (decimals0 - decimals1);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address: raw } = await params;
  if (!isAddress(raw)) {
    return NextResponse.json({ error: "Not a valid contract address" }, { status: 400 });
  }
  const token = getAddress(raw);

  try {
    const data = await cached(`token:${token}`, 20_000, async () => {
      const meta = await withRetry(() =>
        serverClient.multicall({
          allowFailure: true,
          batchSize: 96_000,
          contracts: [
            { address: token, abi: erc20Abi, functionName: "name" },
            { address: token, abi: erc20Abi, functionName: "symbol" },
            { address: token, abi: erc20Abi, functionName: "decimals" },
            { address: token, abi: erc20Abi, functionName: "totalSupply" },
          ],
        }),
      );

      if (meta[1].status !== "success" && meta[2].status !== "success") {
        return null; // not an ERC-20
      }

      const decimals = meta[2].status === "success" ? Number(meta[2].result) : 18;
      const totalSupply = meta[3].status === "success" ? (meta[3].result as bigint) : 0n;

      // Locate every venue this token trades on.
      const [v2Pair, ...v3Pools] = await Promise.all([
        withRetry(() =>
          serverClient.readContract({
            address: CONTRACTS.uniswapV2Factory as Address,
            abi: uniswapV2FactoryAbi,
            functionName: "getPair",
            args: [token, WETH],
          }),
        ).catch(() => zeroAddress as Address),
        ...V3_FEE_TIERS.map((fee) =>
          withRetry(() =>
            serverClient.readContract({
              address: CONTRACTS.uniswapV3Factory as Address,
              abi: uniswapV3FactoryAbi,
              functionName: "getPool",
              args: [token, WETH, fee],
            }),
          ).catch(() => zeroAddress as Address),
        ),
      ]);

      const venues: {
        protocol: string;
        address: Address;
        fee?: number;
        priceEth: number | null;
        liquidityEth: number | null;
      }[] = [];

      if (v2Pair !== zeroAddress) {
        const [reserves, token0] = await Promise.all([
          withRetry(() =>
            serverClient.readContract({
              address: v2Pair,
              abi: uniswapV2PairAbi,
              functionName: "getReserves",
            }),
          ),
          withRetry(() =>
            serverClient.readContract({
              address: v2Pair,
              abi: uniswapV2PairAbi,
              functionName: "token0",
            }),
          ),
        ]);
        const tokenIsZero = token0.toLowerCase() === token.toLowerCase();
        const rToken = tokenIsZero ? reserves[0] : reserves[1];
        const rWeth = tokenIsZero ? reserves[1] : reserves[0];
        const tokenAmt = Number(rToken) / 10 ** decimals;
        const wethAmt = Number(rWeth) / 1e18;
        venues.push({
          protocol: "Uniswap V2",
          address: v2Pair,
          priceEth: tokenAmt > 0 ? wethAmt / tokenAmt : null,
          liquidityEth: wethAmt,
        });
      }

      await Promise.all(
        v3Pools.map(async (poolAddress, i) => {
          if (poolAddress === zeroAddress) return;
          try {
            const [slot0, token0, wethBal] = await Promise.all([
              withRetry(() =>
                serverClient.readContract({
                  address: poolAddress,
                  abi: uniswapV3PoolAbi,
                  functionName: "slot0",
                }),
              ),
              withRetry(() =>
                serverClient.readContract({
                  address: poolAddress,
                  abi: uniswapV3PoolAbi,
                  functionName: "token0",
                }),
              ),
              withRetry(() =>
                serverClient.readContract({
                  address: WETH,
                  abi: erc20Abi,
                  functionName: "balanceOf",
                  args: [poolAddress],
                }),
              ),
            ]);
            const tokenIsZero = token0.toLowerCase() === token.toLowerCase();
            const p = priceFromSqrt(
              slot0[0],
              tokenIsZero ? decimals : 18,
              tokenIsZero ? 18 : decimals,
            );
            venues.push({
              protocol: "Uniswap V3",
              address: poolAddress,
              fee: V3_FEE_TIERS[i],
              priceEth: tokenIsZero ? p : p > 0 ? 1 / p : null,
              liquidityEth: Number(wethBal) / 1e18,
            });
          } catch {
            /* pool exists but is uninitialised — skip it */
          }
        }),
      );

      venues.sort((a, b) => (b.liquidityEth ?? 0) - (a.liquidityEth ?? 0));

      const deepest = venues[0];
      const ethUsd = await getEthUsd();
      const priceEth = deepest?.priceEth ?? null;
      const priceUsd = priceEth != null && ethUsd != null ? priceEth * ethUsd : null;
      const supply = Number(totalSupply) / 10 ** decimals;

      return {
        address: token,
        name: meta[0].status === "success" ? String(meta[0].result) : "Unknown token",
        symbol: meta[1].status === "success" ? String(meta[1].result) : "???",
        decimals,
        totalSupply: totalSupply.toString(),
        supplyFormatted: supply,
        venues,
        priceEth,
        priceUsd,
        fdvUsd: priceUsd != null ? priceUsd * supply : null,
        liquidityEth: venues.reduce((s, v) => s + (v.liquidityEth ?? 0), 0),
        ethUsd,
        updatedAt: Date.now(),
      };
    });

    if (!data) {
      return NextResponse.json(
        { error: "That contract is not an ERC-20 on chain 4663." },
        { status: 404 },
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 200) }, { status: 502 });
  }
}
