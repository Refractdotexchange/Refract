import type { Metadata } from "next";
import { PoolPanel } from "@/components/pool-panel";
import { HowShieldingWorks } from "@/components/how-shielding-works";

export const metadata: Metadata = {
  title: "Private",
  description:
    "Shielded ETH on Robinhood Chain. Deposit any amount, spend any part of it, and the rest stays hidden. No operator, no admin key.",
};

export default function PrivatePage() {
  return (
    <div className="page-pad" style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 22px 0" }}>
      <header style={{ marginBottom: 30 }}>
        <div className="kicker" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="live-dot" />
          Zero-knowledge · chain 4663
        </div>
        <h1
          className="font-display h-display"
          style={{ fontSize: "clamp(30px,4vw,46px)", fontWeight: 700, margin: "12px 0 0" }}
        >
          Private <span className="spectrum-text">balances</span>
        </h1>
        <p
          className="lede"
          style={{ color: "var(--muted)", fontSize: 16, lineHeight: 1.65, maxWidth: 680, marginTop: 14 }}
        >
          Deposit any amount, spend any part of it later from an address that was
          never linked to it, and whatever is left stays hidden. There is no
          operator and no admin key: the only way out is a proof, checked by the
          contract itself.
        </p>
      </header>

      <div className="two-col" style={{ alignItems: "start", gap: 14 }}>
        <PoolPanel />
        <HowShieldingWorks />
      </div>
    </div>
  );
}
