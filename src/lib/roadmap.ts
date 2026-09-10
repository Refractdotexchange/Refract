/**
 * Roadmap content, kept out of the component so the page is a rendering
 * concern and the claims live in one auditable place.
 *
 * Rule for this file: an item is only "live" if it runs in production today.
 * Where something does not work yet, the note says so rather than omitting it.
 */

export type Status = "live" | "next" | "planned";

export const C_STATUS: Record<Status, { tone: string; label: string }> = {
  live: { tone: "var(--gold)", label: "Live" },
  next: { tone: "var(--honey)", label: "In progress" },
  planned: { tone: "var(--faint)", label: "Planned" },
};

export type Phase = {
  n: string;
  title: string;
  status: Status;
  summary: string;
  items: { label: string; note?: string }[];
  /** Rendered as a warning strip. Used for the one real blocker. */
  gate?: string;
};

export const PHASES: Phase[] = [
  {
    n: "00",
    title: "Shipped",
    status: "live",
    summary:
      "Running in production against chain 4663 today, MIT licensed, with every figure read from chain state at request time.",
    items: [
      {
        label: "Route engine across six venues",
        note: "Uniswap V2 direct, V2 via WETH, all four V3 fee tiers, and V4.",
      },
      {
        label: "Price impact on every quote",
        note: "Measured against a probe trade 1000x smaller, warning above 5%.",
      },
      {
        label: "Launch discovery",
        note: "Curves resolved from the launch mint, so it does not depend on one launchpad's ABI.",
      },
      {
        label: "Clone detection and safe mode",
        note: "Duplicate name and symbol pairs flagged, explicit names blurred by default.",
      },
      {
        label: "Portfolio without a token list",
        note: "Holdings found from your wallet's own transfer history.",
      },
      {
        label: "Cashback accrual",
        note: "0.12% of routed volume, computed from your own swaps. Not claimable yet.",
      },
    ],
  },
  {
    n: "01",
    title: "Make it solid",
    status: "next",
    summary:
      "No new capability. This is the work that makes what already exists trustworthy enough to send real traffic at.",
    items: [
      {
        label: "Dedicated RPC endpoint",
        note: "The biggest UX problem today. Public endpoints rate-limit, which is why partial-scan handling exists at all.",
      },
      {
        label: "Verify the sell path end to end",
        note: "Buying is proven against live pool math. Selling needs a Permit2 approval and wants a real trade behind it.",
      },
      {
        label: "Resolve curve ETH reporting",
        note: "This launchpad does not hold sale proceeds in the curve, so the field reads zero. Find where they sit or drop the metric.",
      },
      {
        label: "Widen historical coverage",
        note: "Scans cover a recent window because of log limits. A dedicated endpoint widens it considerably.",
      },
    ],
  },
  {
    n: "02",
    title: "Fee capture",
    status: "planned",
    summary:
      "Today no fee is taken at all: swaps route straight to the venue and output goes directly to you. This phase changes that, and it is what funds everything below it.",
    items: [
      {
        label: "A share of the routing surplus, not of your trade",
        note: "The surplus is what we found above the venue you would have used anyway. Capped so a fill can never land below that baseline.",
      },
      {
        label: "Public fee accounting",
        note: "Every unit collected, visible on a page, from the first day it exists.",
      },
      {
        label: "Contract audit",
        note: "This sits in the path of user funds, so it ships after review, not before.",
      },
    ],
    gate:
      "This is the gate. Cashback has no funding source until fees exist, which is why the Rewards page says accrual is real but distribution is not. Everything in later phases depends on this one, and it is blocked on an audit rather than on effort.",
  },
  {
    n: "03",
    title: "Cashback becomes claimable",
    status: "planned",
    summary:
      "The accrual maths already exists and is already auditable. What is missing is the contract that holds collected fees and lets a wallet claim its share.",
    items: [
      {
        label: "Distributor contract and claim flow",
      },
      {
        label: "Honour everything accrued so far",
        note: "It was computed from real on-chain history, so early users can be paid rather than reset.",
      },
      {
        label: "The Rewards page stops needing a disclaimer",
      },
    ],
  },
  {
    n: "04",
    title: "The token does work",
    status: "planned",
    summary:
      "Only worth doing once fees flow. A boosted rate funded by nothing is just an emission, and everyone can tell the difference.",
    items: [
      {
        label: "Boosted rate for holders",
        note: "0.30% of routed volume instead of 0.12%. The token pays you more for something you already do.",
      },
      {
        label: "Buyback from collected fees",
        note: "Every transaction published, so the claim stays checkable.",
      },
    ],
  },
  {
    n: "05",
    title: "Widen the moat",
    status: "planned",
    summary:
      "Each of these is only worth building on top of a working loop, so they are deliberately last.",
    items: [
      { label: "More venues as they deploy", note: "The engine's value scales with how many places it can look." },
      { label: "Limit orders" },
      { label: "Multi-hop routing", note: "Better prices on thin pairs, which is where the surplus is largest." },
      { label: "Launch and clone alerts", note: "Both already run server-side; this is a feed on top." },
      { label: "Other chains", note: "Last on purpose. Expanding early only spreads thin liquidity across more surfaces." },
    ],
  },
];
