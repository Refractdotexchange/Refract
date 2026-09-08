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
    [robinhoodChain.id]: fallback([http(RPC_PRIMARY), http(RPC_FALLBACK)]),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
