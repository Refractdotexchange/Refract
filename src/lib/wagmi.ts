import { createConfig, http, fallback } from "wagmi";
// Imported from @wagmi/core rather than the wagmi/connectors barrel: the barrel
// also pulls in the Coinbase Base Account SDK, whose optional x402 deps do not
// resolve and break the build. `injected` is the only connector this app uses.
import { injected } from "@wagmi/core";
import { RPC_FALLBACK, RPC_PRIMARY, robinhoodChain } from "./chain";

/**
 * Injected-only on purpose: no WalletConnect project id is required to run
 * this app, so it works from a fresh clone with zero configuration.
 */
export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    /*
     * Timeouts and retries are set explicitly rather than left to defaults,
     * to match the server client. A browser drops every open socket the
     * moment the machine's network changes — a VPN toggling, WiFi
     * reconnecting, waking from sleep — and Chrome reports that as
     * ERR_NETWORK_CHANGED. Withdrawing spends several seconds proving and
     * several more reading deposit events, so there is plenty of window for
     * that to land mid-flight. Retrying absorbs it; without this a blip
     * during a withdrawal surfaces as a failure the user cannot act on.
     */
    [robinhoodChain.id]: fallback(
      [
        http(RPC_PRIMARY, { timeout: 12_000, retryCount: 3, retryDelay: 250 }),
        // Only when one is actually configured. See RPC_FALLBACK in chain.ts:
        // an endpoint that refuses eth_getLogs cannot serve this app, and
        // falling through to it broke balances instead of rescuing them.
        ...(RPC_FALLBACK ? [http(RPC_FALLBACK, { timeout: 12_000, retryCount: 3, retryDelay: 250 })] : []),
      ],
      { rank: false },
    ),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
