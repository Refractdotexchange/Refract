import { defineChain, createPublicClient, http, fallback } from "viem";

/**
 * Robinhood Chain (EVM L2). Verified live: eth_chainId -> 0x1237 (4663).
 */
export const RPC_PRIMARY =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
/**
 * Secondary endpoint, deliberately empty by default.
 *
 * The obvious candidate, robinhood-rpc.publicnode.com, answers eth_call and
 * accepts transactions but refuses eth_getLogs over historical ranges without
 * a paid token:
 *
 *   -32602  Archive requests require a personal token.
 *
 * viem surfaces -32602 as "Invalid parameters were provided to the RPC
 * method", which sends whoever reads it looking for a malformed request that
 * does not exist. Worse, the app cannot work without log queries: a shielded
 * balance is rebuilt from events, so every fall-through to that endpoint broke
 * the one screen the user came for, at exactly the moment the primary was
 * struggling and a fallback was supposed to help.
 *
 * A fallback that cannot serve the calls this app depends on is not
 * redundancy. Set RPC_FALLBACK_URL to a real archive endpoint to restore it.
 */
export const RPC_FALLBACK = process.env.RPC_FALLBACK_URL ?? "";

export const RPC_SERVER = process.env.RPC_SERVER_URL ?? RPC_PRIMARY;

export const EXPLORER = "https://robinhoodchain.blockscout.com";

/** Official accounts. Kept here so the nav, footer and card metadata agree. */
export const SOCIALS = {
  x: "https://x.com/RefractHq_",
  xHandle: "@RefractHq_",
  github: "https://github.com/Refractdotexchange/Refract",
} as const;

/**
 * The project's own token, launched on Pons. Verified on chain 4663:
 * name and symbol REFRACT, 18 decimals, 1B supply, curve
 * 0x0790d8bd598b87aac18dfb8d708c2afd4d7b8196.
 *
 * Shown so people can check the contract they are buying rather than trusting
 * an address pasted in a chat, which is how most launch scams land.
 */
export const PROJECT_TOKEN = {
  address: "0xBfA6B87E293A4668b86Ee33E80Ff168266781400",
  symbol: "REFRACT",
} as const;

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_PRIMARY, ...(RPC_FALLBACK ? [RPC_FALLBACK] : [])] } },
  blockExplorers: {
    default: { name: "Blockscout", url: EXPLORER },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      blockCreated: 1,
    },
  },
});

/**
 * On-chain deployments for chain 4663. These are the canonical routers and
 * factories the aggregator quotes against.
 */
export const CONTRACTS = {
  weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  uniswapV2Factory: "0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f",
  uniswapV2Router: "0x89e5DB8B5aA49aA85AC63f691524311AEB649eba",
  uniswapV3Factory: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA",
  quoterV2: "0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7",
  swapRouter02: "0xCaf681a66D020601342297493863E78C959E5cb2",
  universalRouter: "0x8876789976decbfcbbbe364623c63652db8c0904",
  uniswapV4PoolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  uniswapV4Quoter: "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94",
  multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
  // Launchpads that seed new bonding-curve pools on this chain.
  axiomLaunchFactory: "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e",
  ponsV1Factory: "0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB",
  ponsV2Factory: "0x7E1EAbd52Ae29598e6483F72dCf1a70b14284dB8",
} as const;

/** Uniswap V3 fee tiers probed when routing. */
export const V3_FEE_TIERS = [100, 500, 3000, 10000] as const;

/** Server-side client with automatic failover between the two public RPCs. */
export const serverClient = createPublicClient({
  chain: robinhoodChain,
  transport: fallback(
    [
      // Authenticated endpoint first when one is configured; the public RPCs
      // stay as failover so a missing or exhausted key never takes the app down.
      http(RPC_SERVER, { timeout: 12_000 }),
      http(RPC_PRIMARY, { timeout: 12_000 }),
      ...(RPC_FALLBACK ? [http(RPC_FALLBACK, { timeout: 12_000 })] : []),
    ],
    { rank: false },
  ),
  batch: { multicall: { wait: 16 } },
});

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (address: string) => `${EXPLORER}/address/${address}`;
export const tokenUrl = (address: string) => `${EXPLORER}/token/${address}`;
