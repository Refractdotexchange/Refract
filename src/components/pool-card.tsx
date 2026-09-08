"use client";

import Link from "next/link";
import { TokenAvatar } from "./brand";
import { SafeText } from "./safe-text";
import { compact, shortAddress, timeAgo } from "@/lib/format";
import type { Pool } from "@/lib/pools";

/** Curve fill: how much of the supply has already been bought out. */
function CurveProgress({ value, status }: { value: number; status: Pool["status"] }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10.5,
          marginBottom: 5,
        }}
        className="mono"
      >
        <span style={{ color: "var(--faint)" }}>{status === "graduated" ? "CURVE COMPLETE" : "SUPPLY SOLD"}</span>
        <span style={{ color: pct > 80 ? "var(--honey)" : "var(--muted)" }}>{pct.toFixed(1)}%</span>
      </div>
      <div
        style={{
          height: 5,
          borderRadius: 3,
          background: "var(--surface-3)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 3,
            background: "var(--meter)",
            transition: "width .5s cubic-bezier(.22,1,.36,1)",
          }}
        />
      </div>
    </div>
  );
}

export function PoolCard({
  pool,
  ethUsd,
  clones = 0,
}: {
  pool: Pool;
  ethUsd: number | null;
  clones?: number;
}) {
  const reserveEth = Number(pool.reserveNative) / 1e18;
  const supply = Number(pool.totalSupply) / 10 ** pool.decimals;
  const remaining = Number(pool.reserveToken) / 10 ** pool.decimals;
  const priceUsd = pool.priceEth != null && ethUsd != null ? pool.priceEth * ethUsd : null;

  return (
    <Link
      href={`/token/${pool.token}`}
      className="panel"
      style={{
        display: "block",
        padding: 16,
        textDecoration: "none",
        color: "var(--text)",
        transition: "border-color .15s, transform .12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "color-mix(in srgb, var(--gold) 50%, transparent)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "";
        e.currentTarget.style.transform = "";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <TokenAvatar address={pool.token} symbol={pool.symbol} size={38} logoUrl={pool.logoUrl} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="font-display clip-text" style={{ fontWeight: 700, fontSize: 15.5 }}>
            <SafeText value={pool.symbol} />
          </div>
          <div className="clip-text" style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>
            <SafeText value={pool.name} />
          </div>
        </div>
        <span style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", flexShrink: 0 }}>
          {clones > 1 && (
            <span
              className="chip"
              title={`${clones} tokens on this chain share this name and symbol — check the contract address before trading.`}
              style={{
                pointerEvents: "none",
                fontSize: 9.5,
                color: "var(--ember)",
                borderColor: "color-mix(in srgb, var(--ember) 45%, transparent)",
                background: "color-mix(in srgb, var(--ember) 12%, transparent)",
              }}
            >
              ⚠ {clones}× CLONE
            </span>
          )}
          {pool.status === "graduated" && (
            <span
              className="chip"
              style={{
                pointerEvents: "none",
                fontSize: 9.5,
                color: "var(--olive)",
                borderColor: "color-mix(in srgb, var(--olive) 45%, transparent)",
                background: "color-mix(in srgb, var(--olive) 12%, transparent)",
              }}
            >
              GRADUATED
            </span>
          )}
        </span>
      </div>

      <div className="two-col" style={{ marginTop: 14, gap: 8 }}>
        <Metric
          label="Curve trades"
          value={compact(pool.trades, 0)}
          sub={pool.trades > 0 ? "buys + sells on curve" : "no fills yet"}
        />
        {reserveEth > 0 ? (
          <Metric
            label="Curve ETH"
            value={reserveEth < 0.0001 ? reserveEth.toExponential(1) : reserveEth.toFixed(4)}
            sub={ethUsd != null ? `$${(reserveEth * ethUsd).toFixed(2)}` : undefined}
          />
        ) : (
          <Metric
            label="Unsold supply"
            value={compact(remaining, 1)}
            sub={`of ${compact(supply, 1)}`}
          />
        )}
      </div>

      <CurveProgress value={pool.progress} status={pool.status} />

      <div
        className="mono"
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 12,
          paddingTop: 11,
          borderTop: "1px solid var(--line-soft)",
          fontSize: 10.5,
          color: "var(--faint)",
        }}
      >
        <span>{timeAgo(pool.launchedAt)}</span>
        <span>
          {priceUsd != null
            ? `$${priceUsd < 0.01 ? priceUsd.toPrecision(2) : priceUsd.toFixed(4)}`
            : shortAddress(pool.token, 4)}
        </span>
      </div>
    </Link>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="panel-flat" style={{ padding: "9px 11px" }}>
      <div className="kicker" style={{ fontSize: 9.5, letterSpacing: "0.18em" }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
        {value}
      </div>
      {sub && (
        <div className="mono" style={{ fontSize: 10, color: "var(--faint)", marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export function PoolCardSkeleton() {
  return (
    <div className="panel" style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
        <div className="skeleton" style={{ width: 38, height: 38, borderRadius: "50%" }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 14, width: "45%" }} />
          <div className="skeleton" style={{ height: 11, width: "70%", marginTop: 6 }} />
        </div>
      </div>
      <div className="two-col" style={{ marginTop: 14, gap: 8 }}>
        <div className="skeleton" style={{ height: 52 }} />
        <div className="skeleton" style={{ height: 52 }} />
      </div>
      <div className="skeleton" style={{ height: 5, marginTop: 18 }} />
      <div className="skeleton" style={{ height: 11, marginTop: 16 }} />
    </div>
  );
}

