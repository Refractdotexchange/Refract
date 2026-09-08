import type { Metadata } from "next";
import { PortfolioView } from "@/components/portfolio-view";

export const metadata: Metadata = {
  title: "Portfolio",
  description:
    "Everything a wallet holds on Robinhood Chain, discovered from its own transfer history and priced from live pools.",
};

export default function PortfolioPage() {
  return (
    <div className="page-pad" style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 22px 0" }}>
      <div style={{ marginBottom: 24 }}>
        <div className="kicker" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="live-dot" />
          Priced from live pools
        </div>
        <h1
          className="font-display h-display"
          style={{ fontSize: "clamp(30px,4vw,44px)", fontWeight: 700, margin: "12px 0 0" }}
        >
          Your <span className="spectrum-text">portfolio</span>
        </h1>
        <p className="lede" style={{ color: "var(--muted)", fontSize: 15.5, lineHeight: 1.6, maxWidth: 620, marginTop: 12 }}>
          Holdings are discovered from the wallet&rsquo;s own transfer history, so a token bought
          minutes ago on a fresh curve shows up without needing a token list.
        </p>
      </div>

      <PortfolioView />
    </div>
  );
}
