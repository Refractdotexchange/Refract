# We built a DEX that tells you when it can't do its job

There is a number on our pools page that reads "352 pools." Last week it read "0."

Nothing had gone wrong with the chain. There were plenty of pools. The public RPC we were reading from had rate-limited us halfway through a scan, our code caught the error, returned an empty list, and then cached that empty list for forty five seconds as though it were the truth.

That bug is the reason this post exists. Not because it was hard to fix, but because of what it made me realise about how most of this stuff gets built.

## The thing that annoyed me enough to start

Robinhood Chain has a Uniswap V2 pair and four separate V3 fee tiers live at the same time. Five venues for the same pair, all with different prices, all sitting there right now.

Most interfaces pick one, quote it, and call that the price.

I got curious about how much that actually costs. So I pulled a real quote across all five for 1 ETH into USDG, same second:

```
Uniswap V3   0.01% tier      2,486.66 USDG
Uniswap V3   0.05% tier      2,484.43
Uniswap V3   0.30% tier      2,479.76
Uniswap V2   direct pair     2,471.48
Uniswap V3   1.00% tier      2,340.95
```

The V2 pool that most routers default to is 0.61% worse than the best tier. On one ETH that is fifteen dollars you handed over for no reason. It is not a rounding error and it is not a one off. Run it again in an hour and the spread will be different but it will still be there.

That is the whole product. Quote everything, route through the winner, show your work.

## Show your work, specifically

REFRACT quotes six paths for every pair: V2 direct, V2 hopping through WETH, and all four V3 fee tiers. The V3 quotes come from the on chain QuoterV2 contract, which is technically state mutating, so we simulate the call rather than reading it. Then we rank by output and show you the shortfall on every route we did not pick.

You can override the pick. The engine recommends, it does not hide the alternatives. If you want to route through V2 because you have some reason I have not thought of, that is your call and the button is right there.

## Price impact, and the bug that made it useless

A quote is not a promise. Past a certain size you stop being a price taker and start pushing the price yourself.

The way we measure this: quote a probe trade one thousandth the size on the same venue, compare unit prices, and the gap is what your size costs you.

```
0.1 ETH      0.00%
5 ETH        0.02%
50 ETH       0.27%
500 ETH      5.90%
```

Above 5% you get a warning before you sign.

Here is the part I am less proud of. The first version of this returned null every single time. I had divided to get each unit price before comparing, and because ETH has 18 decimals while USDG has 6, the intermediate result truncated straight to zero. Integer division ate the whole calculation.

The fix was to cross multiply instead of dividing first. Two lines. But it shipped broken and I only caught it because I tested with three different trade sizes and got the same answer for all three, which is the kind of result that should never look plausible.

## Finding tokens nobody has listed yet

New tokens on this chain do not start on a DEX. They start on a bonding curve, and by the time anyone lists them the interesting part is over.

So we read the launchpad factory events directly. Simple enough in theory. In practice this took three attempts and two wrong answers.

First attempt: I read the launch event and assumed `topics[2]` was the bonding curve and `topics[3]` was the deployer. Ran it. Got 59 out of 62 pools marked "graduated" with identical reserves, which is not a thing that happens. Checked on chain and `topics[2]` was an EOA, a plain wallet. I had them backwards.

Second attempt: swapped them. Now `topics[3]` was a real contract, which felt right, except it held zero tokens and zero ETH. Not the curve either.

Third attempt worked, and it works better than what I was originally trying to do. Every launch mints the entire supply to the curve in a single `Transfer` from the zero address. That mint is the curve, unambiguously, and it does not depend on knowing any particular launchpad's private ABI. One call, 59 of 62 curves resolved, and it will keep working when the next launchpad shows up with a completely different event shape.

I like this fix a lot more than the one I was reaching for. Reverse engineering one vendor's contract would have worked until it did not.

## Rewards, and a number that was wrong by seven orders of magnitude

Every trade routed through REFRACT accrues 0.12% of its volume back to the wallet that made it. We compute this by scanning your own Uniswap `Swap` events on chain, so anyone can audit the figure independently.

The first version told a test wallet it had routed 62,257,097 ETH.

That wallet had routed about 0.14 ETH.

The mistake: I was taking the larger of the two swap legs as the notional value. Reasonable sounding, completely wrong. When you swap ETH for a memecoin with a billion supply, the memecoin leg is enormous and the ETH leg is tiny. I was reading the memecoin side and calling it ETH.

The fix was to look up which side of each pool actually holds WETH and read only that leg. Same wallet now correctly reports 0.1446 ETH of volume and 0.0001735 ETH accrued, which is 0.12% of 0.1446, which is what it should be.

I want to be direct about the state of this feature: **the rewards are not claimable yet.** The distributor contract is not deployed. What the page shows you is a computed, auditable figure for what your volume has earned. It says so on the page. I would rather explain a balance you cannot withdraw yet than show a claim button that does nothing.

## Three tokens, one name

On a permissionless launchpad the risk is not a bad chart. It is buying the wrong contract.

Our pools page right now has three tokens all called PCAT, all with near identical names, all with the same style of logo. Three different addresses. One of them might be fine. I have no idea which.

We flag duplicate name and symbol pairs automatically. The badge says how many share it. The only field that actually distinguishes them, the contract address, is right there on the card.

We also blur explicit token names by default, behind a one click reveal. Token names come straight off chain and some of them are slurs. This is a display filter, not a safety claim, and nothing is removed from the API. It just means the page is safe to open in front of someone.

## Your portfolio, without a token list

Most portfolio trackers work off a curated token list, which means anything launched in the last ten minutes is invisible.

We read your wallet's own `Transfer` history instead and price whatever we find from its deepest WETH pool. Buy something on a fresh curve and it is in your portfolio immediately.

The way I convinced myself this was correct: I ran it against a live Uniswap pool address. A constant product pool has to hold roughly equal value on both sides. It came back with $582,836 of USDG and $582,740 of WETH. Ninety six dollars apart on over a million. That is the kind of check that tells you the maths is right without needing to trust the maths.

## The reliability work nobody sees

Public RPCs rate limit hard. For a while I assumed we were just asking for too much and started throttling our own requests, which helped a little and not enough.

The actual cause was somewhere I was not looking. viem, the library we use for chain reads, chunks multicalls by calldata size with a default of 1024 bytes. Our batch of 460 calls was silently being fanned out into roughly thirty separate requests. I was carefully rate limiting one request that was quietly becoming thirty.

Setting the batch size explicitly fixed cold starts outright. Batching native balances through Multicall3 instead of one `eth_getBalance` per pool removed another ninety calls. Overlapping the independent scan phases took a full scan from 26 seconds to 14.7.

And then the part I actually care about. When a scan does get rate limited, it is marked incomplete. The page shows a dash, or a retry notice, and it says the RPC throttled us. It does not show you a confident zero. Incomplete results get cached for fifteen seconds instead of forty five, and a previously complete answer always beats a degraded one.

An empty result and a failed request look identical if you do not check. Almost nothing checks.

## What does not work yet

This is in the README too, near the top, on purpose.

**Cashback is not claimable.** Balances accrue and are auditable. The distributor contract is not deployed.

**Curve ETH reads zero for most pools.** The launchpad on this chain does not hold sale proceeds in the curve contract, so there is no balance for us to read. Rather than invent a TVL number we lead with what we can prove: supply sold, unsold reserve, real buy and sell counts.

**Tokens still on a curve have no price.** No pool means no pool price. You get a transfer activity chart instead and a price appears when it graduates.

**Scans cover a recent window, not all history.** Public RPCs reject wide log queries. The window is selectable and it is stated on the page.

**Portfolio values are marks, not quotes.** Spot price from the deepest pool. A thin pool will not fill at that number.

Publishing this list was the easiest decision in the whole project. Every one of these is discoverable in about a minute of using the app. Writing them down first costs nothing and means nobody feels lied to.

## It is open source

MIT licensed, all of it: github.com/Refractdotexchange/Refract

Not a marketing repo with the interesting parts removed. The route engine, the curve resolution, the rewards scan, the reliability work, the whole thing.

Clone it and run it:

```bash
git clone https://github.com/Refractdotexchange/Refract.git
cd Refract
npm install
npm run dev
```

No configuration needed. It ships with public RPC endpoints and an injected wallet connector, so a fresh clone runs immediately. If you are deploying it anywhere real, point it at your own RPC.

Every number in that app is a live chain read. No third party price index, no seeded fixtures, no mocked responses anywhere in the codebase. That constraint is the reason the failure handling exists.

## Some things about how it looks

The interface ships zero image files. The logo, the animated hero, the price charts and every token avatar are generated as vector or CSS. Token avatars derive a stable two tone gradient from the contract address, so a token with no logo still gets something recognisable instead of a grey circle.

We also made eight short films explaining how it works, with a mascot called Facet who is the product mark with a face on it. Every frame is drawn in code with Remotion. The music is synthesised from scratch, no samples and nothing licensed, and the second set of four each got their own key and tempo so they do not sound like one track wearing different hats.

That is more effort than a DEX frontend strictly needs. I know. It was fun.

## Where to find it

The app is at refract.exchange. The code is at github.com/Refractdotexchange/Refract. We post at @RefractHq_.

The token is `0xBfA6B87E293A4668b86Ee33E80Ff168266781400`. Check that address against the chain before you trade it and do not trust it because someone pasted it in a chat, including this one.

Non custodial throughout. Approvals are scoped to the exact amount of each swap, never unlimited. Every transaction is signed in your wallet, and the routers are the canonical Uniswap deployments on chain 4663.

Trade small first. Read the code if you feel like it. Tell me what is broken.
