import { getAddress, pad, type Address, type Hex } from "viem";
import { CONTRACTS, serverClient } from "./chain";
import { BLOCK_TIME_SECONDS } from "./pools";
import { uniswapV3PoolAbi } from "./abi";
import { cached, getRawLogs, latestBlock, pool, withRetry } from "./rpc";
import { getEthUsd } from "./quote";

/**
 * REFRACT routes a share of its fee take back to the wallets that generated it.
 * Accrual is computed from the trader's own on-chain swap history — we scan
 * Uniswap Swap events where the wallet is the recipient, so the number is
 * verifiable by anyone against chain 4663.
 */
export const CASHBACK_BPS = 12; // 0.12% of routed volume
export const BOOSTED_BPS = 30; // 0.30% once $RFRT staking is live
export const MIN_QUALIFYING_ETH = 0.001;

const V3_SWAP_TOPIC =
  "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67" as Hex;
const V2_SWAP_TOPIC =
  "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822" as Hex;

const CHUNK = 25_000;

export type SwapRecord = {
  txHash: string;
  block: number;
  at: number;
  protocol: "Uniswap V2" | "Uniswap V3";
  poolAddress: string;
  /** ETH-denominated notional, where the pool has an ETH leg. */
  notionalEth: number | null;
  rewardEth: number | null;
  status: "accruing" | "below-minimum";
};

export type RewardsSummary = {
  address: Address;
  swaps: SwapRecord[];
  totalSwaps: number;
  qualifyingSwaps: number;
  volumeEth: number;
  accruedEth: number;
  accruedUsd: number | null;
  ethUsd: number | null;
  rateBps: number;
  boostedBps: number;
  scannedBlocks: number;
  head: number;
  updatedAt: number;
};

function decodeInt256(word: Hex): bigint {
  const v = BigInt(word);
  const max = 1n << 255n;
  return v >= max ? v - (1n << 256n) : v;
}

/** Read the wallet's routed swap history and the cashback it has accrued. */
export async function getRewards(
  address: Address,
  windowBlocks = 100_000,
): Promise<RewardsSummary> {
  const wallet = getAddress(address);

  return cached(`rewards:${wallet}:${windowBlocks}`, 30_000, async () => {
    const head = await latestBlock();
    const from = head > BigInt(windowBlocks) ? head - BigInt(windowBlocks) : 0n;
    const topicWallet = pad(wallet.toLowerCase() as Hex, { size: 32 });

    const ranges: { from: bigint; to: bigint }[] = [];
    for (let start = from; start <= head; start += BigInt(CHUNK)) {
      const end = start + BigInt(CHUNK) - 1n;
      ranges.push({ from: start, to: end > head ? head : end });
    }

    // V3 indexes `recipient` at topics[2]; V2 indexes `to` at topics[2].
    const tasks = ranges.flatMap(({ from: f, to: t }) => [
      () =>
        withRetry(() =>
          getRawLogs({ fromBlock: f, toBlock: t, topics: [V3_SWAP_TOPIC, null, topicWallet] }),
        ).catch(() => []),
      () =>
        withRetry(() =>
          getRawLogs({ fromBlock: f, toBlock: t, topics: [V2_SWAP_TOPIC, null, topicWallet] }),
        ).catch(() => []),
    ]);

    const [logs, headBlock, ethUsd] = await Promise.all([
      pool(tasks, 3).then((r) => r.flat()),
      withRetry(() => serverClient.getBlock({ blockNumber: head })),
      getEthUsd(),
    ]);

    const headTs = Number(headBlock.timestamp);

    // A swap's ETH notional is the WETH leg, not the largest leg — memecoin
    // legs are orders of magnitude bigger and would inflate every number.
    const WETH = CONTRACTS.weth.toLowerCase();
    const poolAddresses = [...new Set(logs.map((l) => l.address.toLowerCase()))];

    const sides = await withRetry(() =>
      serverClient.multicall({
        allowFailure: true,
        batchSize: 96_000,
        contracts: poolAddresses.flatMap((address) => [
          { address: address as Address, abi: uniswapV3PoolAbi, functionName: "token0" } as const,
          { address: address as Address, abi: uniswapV3PoolAbi, functionName: "token1" } as const,
        ]),
      }),
    ).catch(() => []);

    /** pool -> which side (0 or 1) holds WETH, or null if it has no ETH leg. */
    const wethSide = new Map<string, 0 | 1 | null>();
    poolAddresses.forEach((address, i) => {
      const t0 = sides[i * 2];
      const t1 = sides[i * 2 + 1];
      const a = t0?.status === "success" ? String(t0.result).toLowerCase() : null;
      const b = t1?.status === "success" ? String(t1.result).toLowerCase() : null;
      wethSide.set(address, a === WETH ? 0 : b === WETH ? 1 : null);
    });

    const swaps: SwapRecord[] = logs
      .map((log): SwapRecord | null => {
        const side = wethSide.get(log.address.toLowerCase());
        if (side == null) return null; // pool has no ETH leg — nothing to denominate in

        const isV3 = log.topics[0] === V3_SWAP_TOPIC;
        const block = Number(BigInt(log.blockNumber));
        const data = log.data.slice(2);
        const word = (i: number) => ("0x" + data.slice(i * 64, (i + 1) * 64)) as Hex;
        const abs = (x: bigint) => (x < 0n ? -x : x);

        let wei: bigint;
        if (isV3) {
          if (data.length < 128) return null;
          // Swap(sender, recipient, amount0, amount1, ...) — both signed.
          wei = abs(decodeInt256(word(side)));
        } else {
          if (data.length < 256) return null;
          // Swap(sender, amount0In, amount1In, amount0Out, amount1Out, to)
          wei = BigInt(word(side)) + BigInt(word(side + 2));
        }

        const notionalEth = Number(wei) / 1e18;
        if (!Number.isFinite(notionalEth) || notionalEth <= 0) return null;

        const qualifies = notionalEth >= MIN_QUALIFYING_ETH;
        return {
          txHash: log.transactionHash,
          block,
          at: Math.round(headTs - (Number(head) - block) * BLOCK_TIME_SECONDS),
          protocol: isV3 ? "Uniswap V3" : "Uniswap V2",
          poolAddress: log.address,
          notionalEth,
          rewardEth: qualifies ? (notionalEth * CASHBACK_BPS) / 10_000 : 0,
          status: qualifies ? "accruing" : "below-minimum",
        };
      })
      .filter((s): s is SwapRecord => s !== null)
      .sort((a, b) => b.block - a.block);

    const qualifying = swaps.filter((s) => s.status === "accruing");
    const volumeEth = qualifying.reduce((sum, s) => sum + (s.notionalEth ?? 0), 0);
    const accruedEth = qualifying.reduce((sum, s) => sum + (s.rewardEth ?? 0), 0);

    return {
      address: wallet,
      swaps: swaps.slice(0, 50),
      totalSwaps: swaps.length,
      qualifyingSwaps: qualifying.length,
      volumeEth,
      accruedEth,
      accruedUsd: ethUsd != null ? accruedEth * ethUsd : null,
      ethUsd,
      rateBps: CASHBACK_BPS,
      boostedBps: BOOSTED_BPS,
      scannedBlocks: windowBlocks,
      head: Number(head),
      updatedAt: Date.now(),
    };
  });
}
