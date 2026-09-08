import { getAddress, pad, type Address, type Hex } from "viem";
import { CONTRACTS, serverClient } from "./chain";
import { LAUNCH_EVENT_TOPIC, TRANSFER_TOPIC, erc20Abi, launchTokenAbi, multicall3Abi } from "./abi";
import { hydrateLogos, toHttpUrl } from "./logo";
import {
  cached,
  getRawLogs,
  latestBlock,
  pool,
  withRetry,
  type RawLog,
} from "./rpc";

/** Robinhood Chain produces ~10 blocks/sec, so a block window is ~0.1s each. */
export const BLOCK_TIME_SECONDS = 0.1;
/** The public RPC rejects getLogs spans much wider than this. */
const CHUNK = 25_000;
const ZERO_TOPIC = "0x" + "0".repeat(64);

export type Pool = {
  token: Address;
  curve: Address;
  deployer: Address;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  /** Tokens still held by the bonding curve. */
  reserveToken: string;
  /** Native ETH held by the bonding curve. */
  reserveNative: string;
  /** Share of supply already bought out of the curve, 0..1. */
  progress: number;
  /** "curve" while the bonding curve still holds tokens, "graduated" once empty. */
  status: "curve" | "graduated";
  /** Indicative price in ETH derived from curve reserves. */
  priceEth: number | null;
  launchBlock: number;
  launchedAt: number;
  lastActiveBlock: number;
  trades: number;
  explorerUrl: string;
  /** Token art from the contract's own `logo()`, resolved to an http URL. */
  logoUrl: string | null;
};

/** Scan the launchpad factory for new-token events over a window of blocks. */
async function scanLaunches(
  fromBlock: bigint,
  toBlock: bigint,
): Promise<{ logs: RawLog[]; failedRanges: number }> {
  const chunks: { from: bigint; to: bigint }[] = [];
  for (let start = fromBlock; start <= toBlock; start += BigInt(CHUNK)) {
    const end = start + BigInt(CHUNK) - 1n;
    chunks.push({ from: start, to: end > toBlock ? toBlock : end });
  }

  const batches = await pool(
    chunks.map(
      ({ from, to }) =>
        () =>
          withRetry(() =>
            // topics[1] is the new token and topics[2] the deployer EOA.
            getRawLogs({
              address: CONTRACTS.axiomLaunchFactory,
              fromBlock: from,
              toBlock: to,
              topics: [LAUNCH_EVENT_TOPIC],
            }),
          )
            .then((logs) => ({ ok: true, logs }))
            .catch(() => ({ ok: false, logs: [] as RawLog[] })),
    ),
    3,
  );

  const failed = batches.filter((b) => !b.ok).length;

  // A rate-limited scan looks identical to "no launches happened". Any failed
  // range means the result is incomplete, so say so rather than letting a
  // partial (or empty) answer be cached as though it were the whole truth.
  if (failed === batches.length) {
    throw new Error(
      "Launch scan failed on every block range (RPC rate limit).",
    );
  }

  return { logs: batches.flatMap((b) => b.logs), failedRanges: failed };
}

/**
 * Resolve each token's bonding curve. The launchpad's own event does not carry
 * it, but the curve is unambiguous on-chain: a launch mints the entire supply
 * to the curve in a single Transfer from the zero address. Filtering by our
 * token set keeps this to one call per chunk.
 */
async function resolveCurves(
  tokens: Address[],
  fromBlock: bigint,
  toBlock: bigint,
): Promise<{ found: Map<string, { curve: Address; minted: bigint }>; failedRanges: number }> {
  const found = new Map<string, { curve: Address; minted: bigint }>();
  if (tokens.length === 0) return { found, failedRanges: 0 };

  const GROUP = 80;
  const groups: Address[][] = [];
  for (let i = 0; i < tokens.length; i += GROUP)
    groups.push(tokens.slice(i, i + GROUP));

  const ranges: { from: bigint; to: bigint }[] = [];
  for (let start = fromBlock; start <= toBlock; start += BigInt(CHUNK)) {
    const end = start + BigInt(CHUNK) - 1n;
    ranges.push({ from: start, to: end > toBlock ? toBlock : end });
  }

  const tasks = groups.flatMap((group) =>
    ranges.map(
      ({ from, to }) =>
        () =>
          withRetry(() =>
            getRawLogs({
              address: group,
              fromBlock: from,
              toBlock: to,
              topics: [TRANSFER_TOPIC, ZERO_TOPIC],
            }),
          )
            .then((logs) => ({ ok: true, logs }))
            .catch(() => ({ ok: false, logs: [] as RawLog[] })),
    ),
  );

  const results = await pool(tasks, 3);
  const failedRanges = results.filter((r) => !r.ok).length;
  if (failedRanges === results.length) {
    throw new Error(
      "Curve resolution failed on every block range (RPC rate limit).",
    );
  }

  for (const log of results.flatMap((r) => r.logs)) {
    const token = getAddress(log.address);
    if (found.has(token)) continue; // first mint is the launch mint
    const to = log.topics[2];
    if (!to) continue;
    found.set(token, {
      curve: getAddress(("0x" + to.slice(26)) as Address),
      minted: BigInt(log.data === "0x" ? "0x0" : log.data),
    });
  }
  return { found, failedRanges };
}

/**
 * Real trade counts: every ERC-20 Transfer where a bonding curve is the sender
 * or the recipient is a sell or a buy on that curve. Filtering by both the
 * token address set and the curve topic keeps this to two calls per chunk.
 */
async function scanActivity(
  pairs: { token: Address; curve: Address }[],
  fromBlock: bigint,
  toBlock: bigint,
) {
  const counts = new Map<string, { trades: number; lastBlock: number }>();
  if (pairs.length === 0) return counts;

  // eth_getLogs caps how much it will match at once, so batch the address set.
  const GROUP = 60;
  const groups: (typeof pairs)[] = [];
  for (let i = 0; i < pairs.length; i += GROUP)
    groups.push(pairs.slice(i, i + GROUP));

  const ranges: { from: bigint; to: bigint }[] = [];
  for (let start = fromBlock; start <= toBlock; start += BigInt(CHUNK)) {
    const end = start + BigInt(CHUNK) - 1n;
    ranges.push({ from: start, to: end > toBlock ? toBlock : end });
  }

  const tasks = groups.flatMap((group) => {
    const tokens = group.map((p) => p.token);
    const curveTopics = group.map((p) =>
      pad(p.curve.toLowerCase() as Hex, { size: 32 }),
    );
    return ranges.flatMap(({ from, to }) => [
      // buys: curve is the sender
      () =>
        withRetry(() =>
          getRawLogs({
            address: tokens,
            fromBlock: from,
            toBlock: to,
            topics: [TRANSFER_TOPIC, curveTopics, null],
          }),
        ).catch(() => []),
      // sells: curve is the recipient
      () =>
        withRetry(() =>
          getRawLogs({
            address: tokens,
            fromBlock: from,
            toBlock: to,
            topics: [TRANSFER_TOPIC, null, curveTopics],
          }),
        ).catch(() => []),
    ]);
  });

  for (const log of (await pool(tasks, 3)).flat()) {
    const token = getAddress(log.address);
    const blockNumber = Number(BigInt(log.blockNumber));
    const prev = counts.get(token);
    if (prev) {
      prev.trades += 1;
      prev.lastBlock = Math.max(prev.lastBlock, blockNumber);
    } else {
      counts.set(token, { trades: 1, lastBlock: blockNumber });
    }
  }
  return counts;
}

/**
 * Discover recently launched bonding-curve pools and enrich them with live
 * on-chain metadata and reserves. Every field here is read from chain 4663 —
 * nothing is proxied from a third party.
 */
export async function getPools(windowBlocks = 25_000): Promise<{
  pools: Pool[];
  head: number;
  scannedBlocks: number;
  /** True when some block ranges failed, so this result is incomplete. */
  degraded: boolean;
  updatedAt: number;
}> {
  return cached(
    `pools:${windowBlocks}`,
    45_000,
    async () => {
      const head = await latestBlock();
      const from =
        head > BigInt(windowBlocks) ? head - BigInt(windowBlocks) : 0n;

      const [launchScan, headBlock] = await Promise.all([
        scanLaunches(from, head),
        withRetry(() => serverClient.getBlock({ blockNumber: head })),
      ]);
      const launchLogs = launchScan.logs;
      let degraded = launchScan.failedRanges > 0;

      const headTs = Number(headBlock.timestamp);

      // De-duplicate: a token can emit more than one launch log.
      const seen = new Map<string, { deployer: Address; block: number }>();
      for (const log of launchLogs) {
        const [, t1, t2] = log.topics;
        if (!t1 || !t2) continue;
        const token = getAddress(("0x" + t1.slice(26)) as Address);
        if (seen.has(token)) continue;
        // topics[1] is the new token and topics[2] the deployer EOA — both
        // confirmed against chain state. The curve is resolved separately.
        seen.set(token, {
          deployer: getAddress(("0x" + t2.slice(26)) as Address),
          block: Number(BigInt(log.blockNumber)),
        });
      }

      const discovered = [...seen.entries()];
      if (discovered.length === 0) {
        return {
          pools: [],
          head: Number(head),
          scannedBlocks: windowBlocks,
          degraded,
          updatedAt: Date.now(),
        };
      }

      const curveScan = await resolveCurves(
        discovered.map(([token]) => token as Address),
        from,
        head,
      );
      const curves = curveScan.found;

      // A failed block range means the answer is genuinely incomplete. A token
      // whose launch mint simply falls outside the window is not a failure — it
      // is just unresolvable here, so it is dropped without flagging the result.
      if (curveScan.failedRanges > 0) degraded = true;

      // Without a proven curve there is nothing truthful to report, so skip it.
      const entries = discovered
        .filter(([token]) => curves.has(token))
        .map(
          ([token, info]) =>
            [token, { ...info, curve: curves.get(token)!.curve }] as const,
        );

      if (entries.length === 0) {
        return {
          pools: [],
          head: Number(head),
          scannedBlocks: windowBlocks,
          degraded,
          updatedAt: Date.now(),
        };
      }

      // One multicall for all string metadata + curve token reserves.
      const metaCalls = entries.flatMap(([token, info]) => [
        { address: token as Address, abi: erc20Abi, functionName: "name" } as const,
        { address: token as Address, abi: erc20Abi, functionName: "symbol" } as const,
        { address: token as Address, abi: erc20Abi, functionName: "decimals" } as const,
        { address: token as Address, abi: erc20Abi, functionName: "totalSupply" } as const,
        {
          address: token as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [info.curve],
        } as const,
        { address: token as Address, abi: launchTokenAbi, functionName: "logo" } as const,
      ]);

      // Native reserve held by each curve. Multicall3 exposes getEthBalance, so
      // these batch into a single request instead of one call per pool.
      const nativeCalls = entries.map(
        ([, info]) =>
          ({
            address: CONTRACTS.multicall3 as Address,
            abi: multicall3Abi,
            functionName: "getEthBalance",
            args: [info.curve],
          }) as const,
      );

      // These three no longer depend on each other, so overlap them rather than
      // paying for each round trip in sequence.
      const [activity, meta, nativeResults] = await Promise.all([
        scanActivity(
          entries.map(([token, info]) => ({
            token: token as Address,
            curve: info.curve,
          })),
          from,
          head,
        ),
        withRetry(() =>
          serverClient.multicall({
            contracts: metaCalls,
            allowFailure: true,
            batchSize: 96_000,
          }),
        ),
        withRetry(() =>
          serverClient.multicall({
            allowFailure: true,
            batchSize: 96_000,
            contracts: nativeCalls,
          }),
        ).catch(() => []),
      ]);

      const natives = entries.map((_, i) => {
        const r = nativeResults[i];
        return r?.status === "success" ? (r.result as bigint) : 0n;
      });

      const pools: Pool[] = entries.map(([token, info], i) => {
        const base = i * 6;
        const nameRes = meta[base];
        const symbolRes = meta[base + 1];
        const decimalsRes = meta[base + 2];
        const supplyRes = meta[base + 3];
        const reserveRes = meta[base + 4];
        const logoRes = meta[base + 5];

        const decimals =
          decimalsRes.status === "success" ? Number(decimalsRes.result) : 18;
        const totalSupply =
          supplyRes.status === "success" ? (supplyRes.result as bigint) : 0n;
        const reserveToken =
          reserveRes.status === "success" ? (reserveRes.result as bigint) : 0n;
        const reserveNative = natives[i];

        const sold =
          totalSupply > reserveToken ? totalSupply - reserveToken : 0n;
        const progress =
          totalSupply > 0n
            ? Number((sold * 10_000n) / totalSupply) / 10_000
            : 0;

        // A curve holding no tokens has finished — it has either graduated to a
        // Uniswap pool or been fully bought out.
        const status: Pool["status"] =
          reserveToken === 0n || progress >= 0.999 ? "graduated" : "curve";

        // Indicative curve price. Near the end of the curve the remaining token
        // balance is dust, so the ratio stops being meaningful — report null
        // rather than a number that looks real and is not.
        const priceEth =
          status === "curve" && reserveToken > 0n && reserveNative > 0n
            ? Number(reserveNative) /
              1e18 /
              (Number(reserveToken) / 10 ** decimals)
            : null;

        const act = activity.get(token);
        const launchBlock = info.block;
        const launchedAt = Math.round(
          headTs - (Number(head) - launchBlock) * BLOCK_TIME_SECONDS,
        );

        return {
          token: token as Address,
          curve: info.curve,
          deployer: info.deployer,
          name:
            nameRes.status === "success"
              ? String(nameRes.result)
              : `Token ${token.slice(0, 6)}`,
          symbol:
            symbolRes.status === "success" ? String(symbolRes.result) : "???",
          decimals,
          totalSupply: totalSupply.toString(),
          reserveToken: reserveToken.toString(),
          reserveNative: reserveNative.toString(),
          progress,
          status,
          priceEth,
          launchBlock,
          launchedAt,
          lastActiveBlock: act?.lastBlock ?? launchBlock,
          trades: act?.trades ?? 0,
          explorerUrl: `https://robinhoodchain.blockscout.com/token/${token}`,
          logoUrl: logoRes?.status === "success" ? toHttpUrl(logoRes.result) : null,
        };
      });

      // Tokens whose metadata calls all reverted are not real ERC-20s — drop them.
      const usable = pools.filter(
        (p) => p.symbol !== "???" || p.totalSupply !== "0",
      );

      usable.sort((a, b) => b.launchBlock - a.launchBlock);

      // Follow any logo() values that turned out to be metadata documents.
      // Cached by CID, so this costs nothing after the first scan.
      await hydrateLogos(usable);

      return {
        pools: usable,
        head: Number(head),
        scannedBlocks: windowBlocks,
        degraded,
        updatedAt: Date.now(),
      };
    },
    (result) => result.degraded,
  );
}
