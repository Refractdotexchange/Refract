import Link from "next/link";
import { EXPLORER } from "@/lib/chain";
import { RefractMark } from "./brand";

export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--line-soft)", marginTop: 90 }}>
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "30px 22px 40px",
          display: "flex",
          flexWrap: "wrap",
          gap: 24,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <RefractMark size={26} />
          <div>
            <div className="font-display" style={{ fontWeight: 700, fontSize: 15 }}>
              REFRACT
            </div>
            <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>
              Routing exchange · Chain ID 4663
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13 }}>
          <Link href="/pools" style={{ color: "var(--muted)", textDecoration: "none" }}>
            Pools
          </Link>
          <Link href="/portfolio" style={{ color: "var(--muted)", textDecoration: "none" }}>
            Portfolio
          </Link>
          <Link href="/rewards" style={{ color: "var(--muted)", textDecoration: "none" }}>
            Rewards
          </Link>
          <Link href="/engine" style={{ color: "var(--muted)", textDecoration: "none" }}>
            Engine
          </Link>
          <a
            href={EXPLORER}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--muted)", textDecoration: "none" }}
          >
            Explorer ↗
          </a>
        </div>
      </div>

      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "0 22px 34px",
          fontSize: 11.5,
          color: "var(--faint)",
          lineHeight: 1.7,
        }}
      >
        REFRACT is an independent, non-custodial interface. It never takes custody of funds — every
        trade is signed in your own wallet. Nothing here is financial advice; tokens launched on a
        permissionless curve carry total-loss risk. Not affiliated with Robinhood Markets, Inc.,
        Uniswap Labs, or any token issuer listed.
      </div>
    </footer>
  );
}
