import Link from "next/link";
import { EXPLORER, SOCIALS } from "@/lib/chain";
import { ContractBadge } from "./contract-badge";
import { RefractMark } from "./brand";

/** The X wordmark, drawn inline so no icon dependency or image asset is needed. */
function XMark({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <path d="M18.9 2H22l-7.1 8.1L23.2 22h-6.6l-5.1-6.7L5.6 22H2.5l7.6-8.7L1.2 2h6.8l4.6 6.1L18.9 2Zm-1.1 18.1h1.7L7.3 3.8H5.5l12.3 16.3Z" />
    </svg>
  );
}

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
          <a
            href={SOCIALS.x}
            target="_blank"
            rel="noreferrer"
            aria-label={`REFRACT on X (${SOCIALS.xHandle})`}
            style={{ color: "var(--muted)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 7 }}
          >
            <XMark size={12} />
            {SOCIALS.xHandle}
          </a>
          <a
            href={SOCIALS.github}
            target="_blank"
            rel="noreferrer"
            aria-label="REFRACT source on GitHub"
            style={{ color: "var(--muted)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 7 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ display: "block" }}>
              <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2 0-.4-.5-1.6.2-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.6 18.3 5 18.3 5c.7 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z" />
            </svg>
            Source
          </a>
        </div>
      </div>

      {/* Contract address sits above the disclaimer so it is findable without
          hunting, which is where people look for it. */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 22px 22px" }}>
        <ContractBadge />
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
        REFRACT is an independent, non-custodial interface. It never takes custody of funds. Every
        trade is signed in your own wallet. Nothing here is financial advice; tokens launched on a
        permissionless curve carry total-loss risk. Not affiliated with Robinhood Markets, Inc.,
        Uniswap Labs, or any token issuer listed.
      </div>
    </footer>
  );
}
