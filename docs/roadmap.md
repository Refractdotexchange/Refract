# REFRACT roadmap

Written against what is actually in the repo, not what would look good on a
slide. Every item in Phase 0 is live today. Everything after it is sequenced by
what genuinely blocks what, because most of it does.

The organising idea: REFRACT has one real edge, which is that it finds a better
price than the venue people default to. Nothing else matters until that edge is
captured as revenue, and once it is, everything else becomes fundable.

---

## Phase 0 - shipped

Live at refract.exchange, MIT licensed, running against chain 4663.

**Route engine.** Quotes Uniswap V2 direct, V2 via WETH, all four V3 fee tiers,
and Uniswap V4, then routes through whichever pays out most and shows the
shortfall on the rest. Price impact is measured against a probe trade 1000x
smaller on the same venue, with a warning above 5%.

**Launch discovery.** New tokens are found from launchpad factory events, and
each bonding curve is resolved from its launch mint rather than a launchpad's
private ABI, so it keeps working when the next launchpad ships a different
event shape.

**Clone detection.** Duplicate name and symbol pairs are flagged with the count,
and the contract address is on the card because it is the only field that
actually differs.

**Portfolio.** Holdings discovered from a wallet's own transfer history, no
token list, priced from the deepest pool.

**Rewards accrual.** 0.12% of routed volume computed from a wallet's own on-chain
swap history. Auditable by anyone. Not claimable, see Phase 3.

**Honest failure handling.** A rate-limited scan is reported as incomplete
rather than as a zero, and an incomplete answer is never cached as though it
were complete.

**Brand and explainers.** Eight films, all drawn in code, all scored from
scratch. Announcement cards. No image assets in the app itself.

---

## Phase 1 - make it solid

Nothing here is new capability. It is the work that makes the current product
trustworthy enough to push traffic at.

**Dedicated RPC endpoint.** The single biggest UX problem today. Public
endpoints rate-limit hard, which is why the app has partial-scan handling at
all. A paid endpoint removes most of that surface and cuts cold scans well
under the current times. This is a config change plus a bill, and it should
happen before any real marketing push.

**Verify the sell path end to end.** Buying is proven: the built transaction
passes at minOut just below the quote and reverts just above it, so the
encoding tracks real pool math. Selling needs a Permit2 approval and has not
been exercised by a funded wallet. Do this with a small real trade before
claiming both directions work.

**Decide what to do about curve ETH.** The launchpad on this chain does not
custody sale proceeds in the curve contract, so the field reads zero for most
pools. Either find where the proceeds actually sit and read that, or drop the
metric. A column that is always zero teaches people to ignore the page.

**Widen historical coverage.** Scans cover a recent window because of log
limits. With a dedicated RPC the window can grow considerably, which makes the
pools page and the rewards figure meaningfully more complete.

**Take the BETA badge off.** Only once the above is true.

---

## Phase 2 - fee capture

This is the unlock. Nothing after it is possible without it, and it is the
hardest engineering in the whole roadmap.

Today no fee is taken at all. Swaps route straight to the Uniswap routers and
output goes directly to the trader.

**The mechanism.** Take a share of the routing surplus, not of the trade. The
surplus is the difference between what REFRACT achieved and what the default
venue would have paid. On a recent ETH to USDG quote that gap was about 15 USDG
on one ETH. Taking a fifth of it leaves the trader roughly 12 USDG better off
than if they had used the pool they would have used anyway.

That framing matters. It is the only fee model in this category where the user
is provably not worse off, and it is defensible in public because the
counterfactual is on screen.

**What it needs.** A thin router contract that skims from output before
forwarding, sitting in front of the existing venue calls. On V4 the same effect
can be achieved in a hook. It must be capped so the fee can never push a fill
below what the default venue would have returned.

**Before it ships:** an audit. This contract sits in the path of user funds. Not
optional, not something to do later, and it is the main reason this phase takes
real time rather than a weekend.

**Also in this phase:** public fee accounting. Every unit collected, visible on
a page, from day one. It costs almost nothing to build alongside and it is the
thing that makes the later buyback credible.

---

## Phase 3 - make cashback real

Right now the rewards page computes a number and then explains that it cannot
be claimed. That is the honest way to ship it, but it is not a good permanent
state.

**Distributor contract.** Holds collected fees, lets a wallet claim its accrued
share. The accrual maths already exists and is already auditable, so this is
mostly contract work plus a claim flow in the UI.

**Retroactive accrual.** Everything accrued during Phases 0 to 2 was computed
from real on-chain history, so it can be honoured at launch rather than reset.
Doing that turns a caveat into a reason people are glad they used it early.

**Then the Rewards page stops needing a disclaimer**, which is a small thing
that says a lot.

---

## Phase 4 - the token does work

Only worth doing once fees flow. A boost funded by nothing is just an emission,
and everyone can tell.

**Boosted rate.** Hold or stake RFRT and earn 0.30% of routed volume instead of
0.12%. This is the token's actual job: it pays you more for something you were
already doing. Not governance theatre, not an APR conjured from supply.

**Buyback.** A share of collected fees market-buys RFRT. Publish every
transaction. This is the most credible part of a competitor's pitch and it is
credible precisely because it is checkable.

**The loop, once all of this is on:**

    more volume routed
      -> more surplus captured
        -> bigger buyback and bigger cashback pool
          -> holding RFRT pays more per trade
            -> traders route here rather than elsewhere
              -> more volume routed

**Be realistic about the cold start.** At low volume the surplus is small, the
buyback is a rounding error, and a boosted rate is worth pennies. The loop does
not spin on its own until real volume arrives. The first turns have to come
from the product being genuinely better and openly auditable, which is what the
current work is for.

---

## Phase 5 - widen the moat

Sequenced last because each of these is only worth building on top of a working
loop.

**More venues.** Any new AMM on 4663 is a few hundred lines given the existing
router abstraction. The engine's value scales with how many places it can look.

**Limit orders.** The natural next primitive for a router that already knows
every venue's price.

**Multi-hop routing.** Currently single-hop plus a WETH bridge. Real pathfinding
across intermediate tokens finds better prices on thin pairs, which is exactly
where the surplus is largest.

**Alerts.** Clone detection and launch discovery already run server-side. Pushing
them to a feed is a small step with real retention value.

**Other chains.** Deliberately last. The whole architecture is chain-agnostic
apart from the contract map, but expanding before the loop works just spreads
thin liquidity across more surfaces.

---

## What gates what

    Phase 1 ────────────────► can push traffic honestly
       │
    Phase 2 (fee capture) ──► everything below is funded
       │                      requires an audit
       ├── Phase 3 (distributor) ──► cashback becomes claimable
       │        │
       │     Phase 4 (boost + buyback) ──► token has a job
       │
       └── Phase 5 (venues, limits, alerts)

The honest summary: Phases 0 and 1 are a good product. Phase 2 is the only thing
standing between that and a business, and it is gated on a contract audit rather
than on effort. Everything in Phases 3 to 5 is straightforward once revenue
exists, and unfundable until it does.
