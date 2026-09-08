import type { Metadata } from "next";
import { PoolsExplorer } from "@/components/pools-explorer";

export const metadata: Metadata = {
  title: "Launch pools",
  description:
    "Every bonding-curve launch on Robinhood Chain, read live from the chain — sortable by liquidity, activity, curve progress and age.",
};

export default function PoolsPage() {
  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 22px 0" }}>
      <div style={{ marginBottom: 26 }}>
        <div className="kicker" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="live-dot" />
          Read live from chain 4663
        </div>
        <h1 className="font-display" style={{ fontSize: "clamp(30px,4vw,44px)", fontWeight: 700, margin: "12px 0 0" }}>
          Launch <span className="spectrum-text">pools</span>
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 15.5, lineHeight: 1.6, maxWidth: 620, marginTop: 12 }}>
          Every token minted onto a bonding curve, discovered directly from launchpad factory
          events. Reserves, supply and curve progress are read from the contracts themselves — no
          third-party index sits in between.
        </p>
      </div>

      <PoolsExplorer />
    </div>
  );
}
