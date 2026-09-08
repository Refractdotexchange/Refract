<div align="center">

# REFRACT

**A routing exchange and launch-pool explorer for Robinhood Chain.**

One trade goes in, every venue on the chain is quoted, and the best route wins.

[![Live](https://img.shields.io/badge/live-refract.exchange-f5c542?style=flat-square)](https://www.refract.exchange)
[![Next.js](https://img.shields.io/badge/Next.js-15-000?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Chain](https://img.shields.io/badge/chain-4663-e0a534?style=flat-square)](https://robinhoodchain.blockscout.com)

[Live app](https://www.refract.exchange) · [Pools](https://www.refract.exchange/pools) · [Portfolio](https://www.refract.exchange/portfolio) · [Engine](https://www.refract.exchange/engine)

</div>

---

## Overview

REFRACT is a non-custodial interface for **Robinhood Chain (EVM, chain ID 4663)**. It compares every
liquidity venue deployed on the chain for a given pair, routes the trade through whichever pays out
most, and surfaces new bonding-curve launches as they happen.

Every figure in the app is read from chain state at request time. There is no third-party price
index, no seeded data, and no mocked responses anywhere in the codebase.

## Features

### Route engine

Quotes a pair against the Uniswap V2 pair (direct and via the WETH hop) and all four Uniswap V3 fee
tiers using the on-chain QuoterV2, then ranks the results by output and shows the shortfall of each
alternative against the winner. The recommendation is never hidden — you can override the pick.

> Representative result: 1 ETH → USDG returns **2,489.35 USDG** on the V3 0.01% tier against
> **2,467.44** on V2 — a real 0.88% improvement found automatically.

Price impact is measured by quoting a probe trade 1000× smaller on the same venue and comparing
unit prices, with an explicit warning above 5%.

### Launch pools

New tokens are discovered from launchpad factory events, and each token's bonding curve is then
resolved from its launch mint — the single `Transfer` from the zero address that sends the full
supply to the curve. Because that signal is protocol-agnostic, discovery does not depend on any one
launchpad's private ABI. Supply sold, unsold reserve, curve ETH and real buy/sell counts follow from
contract state.

Tokens sharing a name and symbol with other launches are flagged as possible clones.

### Charts

Token pages plot executed price reconstructed from that token's own `Swap` events, so every point is
a real fill and gaps in time are genuine gaps in trading. Curve-stage tokens with no pool yet show a
transfer-activity histogram instead of an invented price.

### Portfolio

Holdings are discovered from a wallet's own `Transfer` history rather than a token list, so a token
bought minutes ago on a fresh curve still appears. Each position is priced from its deepest WETH
pool.

### Rewards

Scans a wallet's Uniswap `Swap` events where it is the recipient, resolves each pool's WETH side so
notionals are denominated correctly, and computes accrued cashback at 0.12% of routed volume. The
figure is auditable by anyone against the chain.

### Safe mode

Token names are attacker-controlled strings taken straight from chain state, and some are slurs or
explicit. Safe mode — on by default — blurs those behind a one-click reveal. It is a display filter,
not a safety claim: nothing is removed from the API and the raw string is always one click away.

## Design notes

The interface ships no image assets. The wordmark, the animated hero refraction, the price chart and
every per-token avatar are generated vector or CSS. Token avatars derive a stable two-tone gradient
from the contract address, constrained to a warm hue band so they stay distinguishable without
fighting the palette.

Light and dark themes are both first-class, defined as CSS custom properties on `:root` with a
persisted toggle.

## Honest limitations

These are documented in the interface as well as here.

| Limitation | Detail |
|---|---|
| **Cashback is not claimable** | The distributor contract is not deployed. The Rewards page computes and shows what routed volume has earned and states plainly that nothing settles yet, rather than presenting a claimable balance that does not exist. |
| **Curve ETH often reads zero** | The launchpad observed on this chain does not custody sale proceeds in the curve contract, so there is no on-chain ETH balance to report. Rather than invent a TVL figure, the UI leads with metrics that are provable: supply sold, unsold reserve and trade counts. |
| **Pre-graduation tokens have no price** | A token still on its bonding curve has no Uniswap pool, so there is no pool price to read. A price appears once it graduates. |
| **Scan window is bounded** | Public RPC endpoints reject wide `eth_getLogs` spans, so discovery runs over a recent, selectable window (~40m to ~2.8h of chain time at roughly 10 blocks/sec). |
| **A rate-limited scan says so** | If block ranges fail, the result is marked incomplete and the UI shows `—` or a retry notice rather than a confident `0`. An incomplete answer is never cached as though it were complete. |
| **Portfolio values are marks, not quotes** | They come from the deepest pool's spot price. A thin pool will not fill at that price. |

## Architecture

```
src/
├── app/
│   ├── page.tsx                    Swap, live protocol stats, fresh launches
│   ├── pools/                      Launch-pool explorer (search, sort, stage filter, table view)
│   ├── token/[address]/            Per-token price chart, venues, FDV
│   ├── portfolio/                  Wallet holdings priced from live pools
│   ├── rewards/                    Cashback accrual tracker
│   ├── engine/                     How routing works
│   └── api/
│       ├── quote/                  V2 + V3 route comparison, price impact
│       ├── pools/                  Launch discovery and curve resolution
│       ├── stats/                  Protocol-level figures
│       ├── token/[address]/        Token metadata, venues, pricing
│       ├── history/[address]/      Executed-price series from Swap events
│       ├── portfolio/[address]/    Wallet holdings and marks
│       └── rewards/[address]/      Swap-history scan and accrual
├── lib/
│   ├── chain.ts                    Chain 4663 definition and verified contract map
│   ├── quote.ts                    Route comparison and price impact
│   ├── swap.ts                     Route to transaction, incl. router-side wrap/unwrap
│   ├── pools.ts                    Launch discovery, curve resolution, activity counts
│   ├── rewards.ts                  Swap-history scan and accrual
│   ├── safe.ts                     Display filter for on-chain token names
│   └── rpc.ts                      Global throttle, retry with backoff, TTL cache, raw log reads
├── hooks/                          Data-fetching hooks
└── components/                     UI, including all generated brand graphics
```

### Reliability

Public RPC endpoints rate-limit aggressively. Three measures keep scans complete:

1. **A process-wide request gate.** Several scans can run concurrently when a page renders; all
   outbound calls pass through one limiter with a minimum spacing.
2. **Raised multicall batch size.** viem chunks multicalls by a 1024-byte calldata default, which
   silently turns one logical batch into dozens of requests. Batches are sized explicitly instead.
3. **Batched native balances.** Curve ETH balances are read through Multicall3's `getEthBalance`
   rather than one `eth_getBalance` per pool.

Independent scan phases are overlapped, and failed block ranges mark the result incomplete rather
than being reported as a zero.

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run build        # production build
npm run start        # serve the production build
npm run typecheck    # tsc --noEmit
```

No configuration is required. The app ships with public RPC endpoints and an injected-wallet
connector, so a fresh clone runs immediately.

### Environment

Optional overrides, both with working defaults:

```bash
NEXT_PUBLIC_RPC_URL=https://rpc.mainnet.chain.robinhood.com
RPC_FALLBACK_URL=https://robinhood-rpc.publicnode.com
```

A dedicated RPC endpoint is recommended for any deployment expecting real traffic; the client fails
over between the two automatically.

## API

All routes read chain state directly and return JSON.

| Route | Description |
|---|---|
| `GET /api/quote?in=&out=&amount=` | Ranked routes for a pair, with price impact. Amounts in base units. |
| `GET /api/pools?window=` | Recent bonding-curve launches with reserves and activity. |
| `GET /api/stats` | Protocol-level figures for the current window. |
| `GET /api/token/{address}` | Token metadata, venues and pricing. |
| `GET /api/history/{address}?window=` | Executed-price series and volume. |
| `GET /api/portfolio/{address}?window=` | Wallet holdings with marks. |
| `GET /api/rewards/{address}?window=` | Routed volume and accrued cashback. |

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · wagmi · viem · TanStack Query · Tailwind CSS v4
with a hand-written design system.

## Disclaimer

REFRACT is an independent, non-custodial interface. It never takes custody of funds — every trade is
signed in the user's own wallet, and approvals are scoped to the exact amount of each swap.

Nothing in this project constitutes financial advice. Tokens launched on a permissionless bonding
curve can be minted, taxed or rugged by their deployer and carry total-loss risk. Always read a
contract before trading it.

Not affiliated with Robinhood Markets, Inc., Uniswap Labs, or any token issuer listed by the
interface.

## License

[MIT](LICENSE)
