import { NextResponse } from "next/server";
import { getAddress, isAddress, pad, zeroAddress, type Address, type Hex } from "viem";
import { CONTRACTS, V3_FEE_TIERS, serverClient } from "@/lib/chain";
import {
  TRANSFER_TOPIC,
  erc20Abi,
  launchTokenAbi,
  uniswapV2FactoryAbi,
  uniswapV2PairAbi,
  uniswapV3FactoryAbi,
  uniswapV3PoolAbi,
} from "@/lib/abi";
import { cached, getRawLogs, latestBlock, pool as runPool, withRetry } from "@/lib/rpc";
import { getEthUsd } from "@/lib/quote";
import { hydrateLogos, toHttpUrl } from "@/lib/logo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WETH = CONTRACTS.weth as Address;
const CHUNK = 25_000;

function priceFromSqrt(sqrtPriceX96: bigint, d0: number, d1: number): number {
  const ratio = Number(sqrtPriceX96) / 2 ** 96;
  return ratio * ratio * 10 ** (d0 - d1);
}

/**
 * Wallet holdings, discovered from the wallet's own Transfer history rather
 * than a token list — so tokens bought minutes ago on a fresh curve still show
 * up. Balances and prices are then read from contract state.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address: raw } = await params;
  if (!isAddress(raw)) {
    return NextResponse.json({ error: "Enter a valid 0x wallet address" }, { status: 400 });
  }
  const wallet = getAddress(raw);
  const windowBlocks = Math.min(
    Math.max(Number(new URL(req.url).searchParams.get("window") ?? 150_000) || 150_000, 25_000),
    400_000,
  );

  try {
    const data = await cached(`portfolio:${wallet}:${windowBlocks}`, 30_000, async () => {
      const head = await latestBlock();
      const from = head > BigInt(windowBlocks) ? head - BigInt(windowBlocks) : 0n;
      const topicWallet = pad(wallet.toLowerCase() as Hex, { size: 32 });

      const ranges: { from: bigint; to: bigint }[] = [];
      for (let start = from; start <= head; start += BigInt(CHUNK)) {
        const end = start + BigInt(CHUNK) - 1n;
        ranges.push({ from: start, to: end > head ? head : end });
      }

      // Any token that ever moved in or out of this wallet is a candidate.
      const tasks = ranges.flatMap(({ from: f, to: t }) => [
        () =>
          withRetry(() =>
            getRawLogs({ fromBlock: f, toBlock: t, topics: [TRANSFER_TOPIC, null, topicWallet] }),
          ).catch(() => []),
        () =>
          withRetry(() =>
            getRawLogs({ fromBlock: f, toBlock: t, topics: [TRANSFER_TOPIC, topicWallet, null] }),
          ).catch(() => []),
      ]);

      const logs = (await runPool(tasks, 3)).flat();
      const candidates = [...new Set(logs.map((l) => getAddress(l.address)))].slice(0, 60);

      const [nativeBalance, ethUsd] = await Promise.all([
        withRetry(() => serverClient.getBalance({ address: wallet })).catch(() => 0n),
        getEthUsd(),
      ]);

      if (candidates.length === 0) {
        const eth = Number(nativeBalance) / 1e18;
        return {
          address: wallet,
          nativeEth: eth,
          nativeUsd: ethUsd != null ? eth * ethUsd : null,
          holdings: [],
          totalUsd: ethUsd != null ? eth * ethUsd : null,
          tokensScanned: 0,
          scannedBlocks: windowBlocks,
          ethUsd,
          updatedAt: Date.now(),
        };
      }

      // Balance + metadata for every candidate in one multicall.
      const meta = await withRetry(() =>
        serverClient.multicall({
          allowFailure: true,
          batchSize: 96_000,
          contracts: candidates.flatMap((token) => [
            { address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet] } as const,
            { address: token, abi: erc20Abi, functionName: "symbol" } as const,
            { address: token, abi: erc20Abi, functionName: "name" } as const,
            { address: token, abi: erc20Abi, functionName: "decimals" } as const,
            { address: token, abi: launchTokenAbi, functionName: "logo" } as const,
          ]),
        }),
      );

      const held = candidates
        .map((token, i) => {
          const b = meta[i * 5];
          const balance = b.status === "success" ? (b.result as bigint) : 0n;
          if (balance === 0n) return null;
          const sym = meta[i * 5 + 1];
          const nm = meta[i * 5 + 2];
          const dec = meta[i * 5 + 3];
          const logo = meta[i * 5 + 4];
          return {
            token,
            balance,
            symbol: sym.status === "success" ? String(sym.result) : "???",
            name: nm.status === "success" ? String(nm.result) : "Unknown token",
            decimals: dec.status === "success" ? Number(dec.result) : 18,
            logoUrl: logo?.status === "success" ? toHttpUrl(logo.result) : null,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      // Price each holding from its deepest WETH pool.
      const priced = await runPool(
        held.map((h) => async () => {
          if (h.token.toLowerCase() === WETH.toLowerCase()) {
            return { ...h, priceEth: 1, venue: "WETH" };
          }
          try {
            const [v2Pair, ...v3] = await Promise.all([
              withRetry(() =>
                serverClient.readContract({
                  address: CONTRACTS.uniswapV2Factory as Address,
                  abi: uniswapV2FactoryAbi,
                  functionName: "getPair",
                  args: [h.token, WETH],
                }),
              ).catch(() => zeroAddress as Address),
              ...V3_FEE_TIERS.map((fee) =>
                withRetry(() =>
                  serverClient.readContract({
                    address: CONTRACTS.uniswapV3Factory as Address,
                    abi: uniswapV3FactoryAbi,
                    functionName: "getPool",
                    args: [h.token, WETH, fee],
                  }),
                ).catch(() => zeroAddress as Address),
              ),
            ]);

            let best: { price: number; liq: number; venue: string } | null = null;

            if (v2Pair !== zeroAddress) {
              const [r, t0] = await Promise.all([
                serverClient.readContract({
                  address: v2Pair,
                  abi: uniswapV2PairAbi,
                  functionName: "getReserves",
                }),
                serverClient.readContract({
                  address: v2Pair,
                  abi: uniswapV2PairAbi,
                  functionName: "token0",
                }),
              ]);
              const tokenIsZero = t0.toLowerCase() === h.token.toLowerCase();
              const rTok = Number(tokenIsZero ? r[0] : r[1]) / 10 ** h.decimals;
              const rEth = Number(tokenIsZero ? r[1] : r[0]) / 1e18;
              if (rTok > 0) best = { price: rEth / rTok, liq: rEth, venue: "Uniswap V2" };
            }

            for (let k = 0; k < v3.length; k++) {
              const p = v3[k];
              if (p === zeroAddress) continue;
              try {
                const [slot0, t0, wethBal] = await Promise.all([
                  serverClient.readContract({
                    address: p,
                    abi: uniswapV3PoolAbi,
                    functionName: "slot0",
                  }),
                  serverClient.readContract({
                    address: p,
                    abi: uniswapV3PoolAbi,
                    functionName: "token0",
                  }),
                  serverClient.readContract({
                    address: WETH,
                    abi: erc20Abi,
                    functionName: "balanceOf",
                    args: [p],
                  }),
                ]);
                const tokenIsZero = t0.toLowerCase() === h.token.toLowerCase();
                const raw = priceFromSqrt(
                  slot0[0],
                  tokenIsZero ? h.decimals : 18,
                  tokenIsZero ? 18 : h.decimals,
                );
                const price = tokenIsZero ? raw : raw > 0 ? 1 / raw : 0;
                const liq = Number(wethBal) / 1e18;
                if (price > 0 && (!best || liq > best.liq)) {
                  best = { price, liq, venue: `Uniswap V3 ${(V3_FEE_TIERS[k] / 10_000).toFixed(2)}%` };
                }
              } catch {
                /* uninitialised pool */
              }
            }

            return { ...h, priceEth: best?.price ?? null, venue: best?.venue ?? null };
          } catch {
            return { ...h, priceEth: null, venue: null };
          }
        }),
        4,
      );

      const holdings = priced
        .map((h) => {
          const amount = Number(h.balance) / 10 ** h.decimals;
          const valueEth = h.priceEth != null ? amount * h.priceEth : null;
          return {
            token: h.token,
            symbol: h.symbol,
            logoUrl: h.logoUrl,
            name: h.name,
            decimals: h.decimals,
            balance: h.balance.toString(),
            amount,
            priceEth: h.priceEth,
            valueEth,
            valueUsd: valueEth != null && ethUsd != null ? valueEth * ethUsd : null,
            venue: h.venue,
          };
        })
        .sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));

      // Follow any logo() values that point at metadata JSON rather than an
      // image. Cached by CID, so repeat wallets cost nothing.
      await hydrateLogos(holdings);

      const eth = Number(nativeBalance) / 1e18;
      const tokensUsd = holdings.reduce((s, h) => s + (h.valueUsd ?? 0), 0);

      return {
        address: wallet,
        nativeEth: eth,
        nativeUsd: ethUsd != null ? eth * ethUsd : null,
        holdings,
        totalUsd: ethUsd != null ? eth * ethUsd + tokensUsd : null,
        tokensScanned: candidates.length,
        scannedBlocks: windowBlocks,
        ethUsd,
        updatedAt: Date.now(),
      };
    });

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Could not load portfolio — try again.", detail: String(err).slice(0, 200) },
      { status: 502 },
    );
  }
}
