import type { Metadata } from "next";
import { ShieldedPanel } from "@/components/shielded-panel";

export const metadata: Metadata = {
  title: "Private",
  description:
    "Shielded swaps on Robinhood Chain. Nobody holds your funds: deposits are spent with a zero-knowledge proof, not an operator signature.",
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
          Private <span className="spectrum-text">swaps</span>
        </h1>
        <p
          className="lede"
          style={{ color: "var(--muted)", fontSize: 16, lineHeight: 1.65, maxWidth: 680, marginTop: 14 }}
        >
          Deposit into a shielded pool and spend later from an address that was
          never linked to it. There is no operator and no admin key: the only way
          out is a proof that you know your note&rsquo;s secret, checked by the
          contract itself.
        </p>
      </header>

      <ShieldedPanel />
    </div>
  );
}
