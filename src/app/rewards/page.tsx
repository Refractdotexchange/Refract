import type { Metadata } from "next";
import { CashbackClaim } from "@/components/cashback-claim";
import { RewardsTracker } from "@/components/rewards-tracker";

export const metadata: Metadata = {
  title: "Rewards",
  description:
    "Track the cashback your wallet has accrued from routed volume on Robinhood Chain, computed from your own on-chain swap history.",
};

export default function RewardsPage() {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 22px 0" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div className="kicker">Routed volume pays you back</div>
        <h1 className="font-display" style={{ fontSize: "clamp(32px,4.4vw,50px)", fontWeight: 700, margin: "14px 0 0" }}>
          Your <span className="spectrum-text">cashback</span>
        </h1>
        <p
          style={{
            color: "var(--muted)",
            fontSize: 16,
            lineHeight: 1.65,
            maxWidth: 560,
            margin: "16px auto 0",
          }}
        >
          REFRACT returns a slice of routing fees to the wallets that generate them. Accrual is read
          straight from your swap history on chain 4663. Paste any address to audit it.
        </p>
      </div>

      <CashbackClaim />
      <RewardsTracker />
    </div>
  );
}
