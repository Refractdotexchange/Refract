import Link from "next/link";
import { Suspense } from "react";
import { SwapDeepLink } from "@/components/swap-deeplink";
import { SwapCard } from "@/components/swap-card";
import { StatTicker } from "@/components/stat-ticker";
import { FreshLaunches } from "@/components/fresh-launches";

export default function SwapPage() {
  return (
    <div className="page-pad" style={{ maxWidth: 1280, margin: "0 auto", padding: "44px 22px 0" }}>
      {/* Hero */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(0,470px)",
          gap: 48,
          alignItems: "center",
          marginBottom: 56,
        }}
        className="hero-grid"
      >
        <div>
          <div className="kicker" style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18 }}>
            <span className="live-dot" />
            Live on Robinhood Chain · 4663
          </div>

          <h1
            className="font-display h-display"
            style={{
              fontSize: "clamp(34px, 5.1vw, 62px)",
              lineHeight: 1.03,
              fontWeight: 700,
              margin: 0,
            }}
          >
            One trade in.
            <br />
            <span className="spectrum-text">Every route</span> compared.
          </h1>

          <p
            className="lede"
            style={{
              color: "var(--muted)",
              fontSize: 17,
              lineHeight: 1.62,
              maxWidth: 500,
              margin: "20px 0 28px",
            }}
          >
            REFRACT splits your swap across every venue deployed on chain 4663: Uniswap V2, all four
            V3 fee tiers, and fresh bonding-curve launches, then routes it through the one that
            pays out most. The router never holds your funds: every trade is signed in your own wallet, and a slice of every fee comes
            back to you.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 34 }}>
            <Link href="/pools" className="btn">
              Explore launch pools
            </Link>
            <Link href="/engine" className="btn btn-ghost">
              How the engine works →
            </Link>
          </div>

          <StatTicker />
        </div>

        <div style={{ position: "relative" }}>
          {/* A soft pool of light behind the card reads as refraction without
              the refract outline colliding with the card edges. */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: "-14% -18%",
              background:
                "radial-gradient(ellipse at 50% 45%, color-mix(in srgb, var(--gold) 16%, transparent), color-mix(in srgb, var(--brass) 5%, transparent) 45%, transparent 72%)",
              filter: "blur(18px)",
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative", zIndex: 1 }}>
            {/* Suspense because the deep-link reader uses useSearchParams;
                the plain card renders meanwhile. */}
            <Suspense fallback={<SwapCard />}>
              <SwapDeepLink />
            </Suspense>
          </div>
        </div>
      </section>

      <FreshLaunches />
    </div>
  );
}
