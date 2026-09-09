import type { Metadata } from "next";
import Link from "next/link";
import { RefractBeam } from "@/components/brand";
import { StatTicker } from "@/components/stat-ticker";

export const metadata: Metadata = {
  title: "The Engine",
  description:
    "How REFRACT routes a swap: split the order across every venue on chain 4663, settle on the best, and refract a slice of the fee back to the trader.",
};

const STEPS = [
  {
    n: "01",
    title: "Split",
    tone: "var(--champagne)",
    body: "Your order hits the router and fans out across every venue deployed on chain 4663: the V2 pair, all four V3 fee tiers, and the WETH hop. Each is quoted against live contract state, not a cached index.",
  },
  {
    n: "02",
    title: "Compare",
    tone: "var(--honey)",
    body: "Quotes come back ranked by output, with the loss against the best route shown for each. You can override the pick. The engine recommends, it never hides the alternatives.",
  },
  {
    n: "03",
    title: "Settle",
    tone: "var(--gold)",
    body: "The winning route is built into a single transaction, signed in your wallet. Wrapping and unwrapping happen inside the router, so native ETH in and native ETH out stay one click.",
  },
  {
    n: "04",
    title: "Return",
    tone: "var(--brass)",
    body: "A slice of the routing fee is attributed back to the wallet that generated it, accruing at 0.12% of routed volume, auditable from your own on-chain swap history.",
  },
];

const FAQ = [
  {
    q: "Where does the data come from?",
    a: "Every figure on this site is read from Robinhood Chain (chain ID 4663) at request time: factory events for launch discovery, contract state for reserves and supply, and the Uniswap quoter for prices. No third-party price API sits in between.",
  },
  {
    q: "Does REFRACT hold my funds?",
    a: "No. REFRACT is an interface. Approvals are for the exact amount of each swap, transactions are signed in your own wallet, and the routers are the canonical Uniswap deployments on this chain.",
  },
  {
    q: "What is the cashback actually paid in?",
    a: "Accrual is denominated in ETH against your routed volume. Balances are computed and auditable today; the distributor contract that settles them is not yet deployed, and the Rewards page says so plainly rather than showing a claimable number that isn't.",
  },
  {
    q: "Why do some tokens show no price?",
    a: "A token still trading on its launch bonding curve has no Uniswap pool yet, so there is no pool price to read. The Pools page shows its curve reserves and fill percentage instead, and a price appears once it graduates.",
  },
];

export default function EnginePage() {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 22px 0" }}>
      <section style={{ textAlign: "center", marginBottom: 12 }}>
        <div className="kicker">How it works</div>
        <h1 className="font-display" style={{ fontSize: "clamp(34px,4.8vw,56px)", fontWeight: 700, margin: "14px 0 0" }}>
          The <span className="spectrum-text">refraction</span> engine
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 16.5, lineHeight: 1.65, maxWidth: 580, margin: "16px auto 0" }}>
          One beam goes in. It gets split, measured, and the strongest band comes out the other
          side, with a little colour sent back to whoever aimed it.
        </p>
      </section>

      <div style={{ maxWidth: 700, margin: "0 auto 46px", opacity: 0.9 }}>
        <RefractBeam />
      </div>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
          marginBottom: 46,
        }}
      >
        {STEPS.map((s) => (
          <div key={s.n} className="panel" style={{ padding: 20 }}>
            <div
              className="font-display mono"
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: s.tone,
                letterSpacing: "0.1em",
              }}
            >
              {s.n}
            </div>
            <div className="spectrum-rule" style={{ width: 34, margin: "10px 0 13px", background: s.tone }} />
            <h3 className="font-display" style={{ fontSize: 19, fontWeight: 700, margin: "0 0 9px" }}>
              {s.title}
            </h3>
            <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.65, margin: 0 }}>{s.body}</p>
          </div>
        ))}
      </section>

      <section style={{ marginBottom: 46 }}>
        <h2 className="font-display" style={{ fontSize: 22, fontWeight: 700, margin: "0 0 14px", textAlign: "center" }}>
          Live on chain right now
        </h2>
        <StatTicker />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 className="font-display" style={{ fontSize: 22, fontWeight: 700, margin: "0 0 14px" }}>
          Straight answers
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {FAQ.map((f) => (
            <details key={f.q} className="panel" style={{ padding: "16px 19px" }}>
              <summary
                className="font-display"
                style={{ fontSize: 15.5, fontWeight: 650, cursor: "pointer", listStyle: "none" }}
              >
                {f.q}
              </summary>
              <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.7, margin: "11px 0 0" }}>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="panel panel-lit" style={{ padding: 34, textAlign: "center" }}>
        <h2 className="font-display" style={{ fontSize: 25, fontWeight: 700, margin: 0 }}>
          Point a trade through it
        </h2>
        <p style={{ color: "var(--muted)", fontSize: 15, margin: "11px auto 20px", maxWidth: 440, lineHeight: 1.6 }}>
          Connect a wallet, pick a pair, and watch every venue on chain 4663 compete for the fill.
        </p>
        <Link href="/" className="btn btn-primary" style={{ padding: "14px 32px", fontSize: 16 }}>
          Open the swap
        </Link>
      </section>
    </div>
  );
}
