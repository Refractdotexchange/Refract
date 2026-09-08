import { NextResponse } from "next/server";
import { getAddress, isAddress, zeroAddress, type Address, type Hex } from "viem";
import { CONTRACTS, V3_FEE_TIERS, serverClient } from "@/lib/chain";
import {
  erc20Abi,
  uniswapV2FactoryAbi,
  uniswapV3FactoryAbi,
  uniswapV3PoolAbi,
} from "@/lib/abi";
import { cached, getRawLogs, latestBlock, pool as runPool, withRetry } from "@/lib/rpc";
import { BLOCK_TIME_SECONDS } from "@/lib/pools";
import { getEthUsd } from "@/lib/quote";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WETH = CONTRACTS.weth as Address;
const CHUNK = 25_000;

const V3_SWAP = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";
const V2_SWAP = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function decodeInt256(word: Hex): bigint {
  const v = BigInt(word);
  return v >= 1n << 255n ? v - (1n << 256n) : v;
}

/**
 * Price and activity history for a token, reconstructed from its own Swap
 * events. Each swap gives an executed price (ETH leg / token leg), so the
 * series is real trade data rather than a sampled oracle.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address: raw } = await params;
  if (!isAddress(raw)) {
    return NextResponse.json({ error: "Not a valid contract address" }, { status: 400 });
  }
  const token = getAddress(raw);
  const windowBlocks = Math.min(
    Math.max(Number(new URL(req.url).searchParams.get("window") ?? 100_000) || 100_000, 25_000),
    300_000,
  );

  try {
    const data = await cached(`history:${token}:${windowBlocks}`, 45_000, async () => {
      const head = await latestBlock();
      const from = head > BigInt(windowBlocks) ? head - BigInt(windowBlocks) : 0n;

      // Find this token's pools and which side of each holds WETH.
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

      const pools = [
        ...(v2Pair !== zeroAddress ? [{ address: v2Pair, v3: false }] : []),
        ...v3Pools.filter((p) => p !== zeroAddress).map((p) => ({ address: p, v3: true })),
      ];

      const decimals = await withRetry(() =>
        serverClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
      ).catch(() => 18);

      const headBlock = await withRetry(() => serverClient.getBlock({ blockNumber: head }));
      const headTs = Number(headBlock.timestamp);
      const at = (block: number) =>
        Math.round(headTs - (Number(head) - block) * BLOCK_TIME_SECONDS);

      const ranges: { from: bigint; to: bigint }[] = [];
      for (let start = from; start <= head; start += BigInt(CHUNK)) {
        const end = start + BigInt(CHUNK) - 1n;
        ranges.push({ from: start, to: end > head ? head : end });
      }

      type Point = { t: number; block: number; price: number; volumeEth: number };
      const points: Point[] = [];

      if (pools.length > 0) {
        // Which side is WETH, per pool.
        const sides = await withRetry(() =>
          serverClient.multicall({
            allowFailure: true,
            batchSize: 96_000,
            contracts: pools.flatMap((p) => [
              { address: p.address, abi: uniswapV3PoolAbi, functionName: "token0" } as const,
            ]),
          }),
        ).catch(() => []);

        const wethSide = new Map<string, 0 | 1>();
        pools.forEach((p, i) => {
          const t0 = sides[i];
          const isWethZero =
            t0?.status === "success" && String(t0.result).toLowerCase() === WETH.toLowerCase();
          wethSide.set(p.address.toLowerCase(), isWethZero ? 0 : 1);
        });

        const addresses = pools.map((p) => p.address);
        const tasks = ranges.flatMap(({ from: f, to: t }) => [
          () =>
            withRetry(() =>
              getRawLogs({ address: addresses, fromBlock: f, toBlock: t, topics: [V3_SWAP] }),
            ).catch(() => []),
          () =>
            withRetry(() =>
              getRawLogs({ address: addresses, fromBlock: f, toBlock: t, topics: [V2_SWAP] }),
            ).catch(() => []),
        ]);

        for (const log of (await runPool(tasks, 3)).flat()) {
          const side = wethSide.get(log.address.toLowerCase());
          if (side == null) continue;
          const isV3 = log.topics[0] === V3_SWAP;
          const body = log.data.slice(2);
          const word = (i: number) => ("0x" + body.slice(i * 64, (i + 1) * 64)) as Hex;
          const abs = (x: bigint) => (x < 0n ? -x : x);

          let ethWei: bigint;
          let tokenAmt: bigint;
          if (isV3) {
            if (body.length < 128) continue;
            ethWei = abs(decodeInt256(word(side)));
            tokenAmt = abs(decodeInt256(word(side === 0 ? 1 : 0)));
          } else {
            if (body.length < 256) continue;
            ethWei = BigInt(word(side)) + BigInt(word(side + 2));
            const other = side === 0 ? 1 : 0;
            tokenAmt = BigInt(word(other)) + BigInt(word(other + 2));
          }
          if (ethWei <= 0n || tokenAmt <= 0n) continue;

          const eth = Number(ethWei) / 1e18;
          const tok = Number(tokenAmt) / 10 ** Number(decimals);
          if (!Number.isFinite(eth) || !Number.isFinite(tok) || tok === 0) continue;

          const block = Number(BigInt(log.blockNumber));
          points.push({ t: at(block), block, price: eth / tok, volumeEth: eth });
        }
      }

      points.sort((a, b) => a.block - b.block);

      // Curve-stage tokens have no pool, so fall back to mint/burn activity for
      // a volume shape even when there is no price to plot.
      let curveActivity: { t: number; block: number; count: number }[] = [];
      if (points.length === 0) {
        const tasks = ranges.map(({ from: f, to: t }) => () =>
          withRetry(() =>
            getRawLogs({ address: token, fromBlock: f, toBlock: t, topics: [TRANSFER] }),
          ).catch(() => []),
        );
        const logs = (await runPool(tasks, 3)).flat();
        const buckets = new Map<number, number>();
        for (const l of logs) {
          const b = Number(BigInt(l.blockNumber));
          const key = Math.floor(b / 2000) * 2000;
          buckets.set(key, (buckets.get(key) ?? 0) + 1);
        }
        curveActivity = [...buckets.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([block, count]) => ({ t: at(block), block, count }));
      }

      const ethUsd = await getEthUsd();
      const first = points[0]?.price ?? null;
      const last = points[points.length - 1]?.price ?? null;

      return {
        address: token,
        points: points.slice(-400),
        curveActivity,
        pools: pools.length,
        priceEth: last,
        changePct: first && last && first > 0 ? ((last - first) / first) * 100 : null,
        volumeEth: points.reduce((s, p) => s + p.volumeEth, 0),
        trades: points.length,
        ethUsd,
        scannedBlocks: windowBlocks,
        updatedAt: Date.now(),
      };
    });

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 200) }, { status: 502 });
  }
}
