"use client";

import { useState } from "react";
import { formatUnits } from "@/lib/format";
import type { Route } from "@/lib/quote";
import { CurveFallback } from "./curve-fallback";

const PROTOCOL_COLOR: Record<Route["protocol"], string> = {
  "uniswap-v2": "var(--brass)",
  "uniswap-v3": "var(--gold)",
  "uniswap-v4": "var(--champagne)",
};

/**
 * Every venue we found for this pair, ranked by output. Expanding it shows the
 * loss against the best route so the choice is legible rather than implicit.
 */
export function RouteList({
  routes,
  activeId,
  decimals,
  symbol,
  onPick,
  loading,
  hasAmount,
  tokenOut,
}: {
  routes: Route[];
  activeId: string | null;
  /** Used to offer the bonding curve when no Uniswap route exists. */
  tokenOut?: `0x${string}`;
  decimals: number;
  symbol: string;
  onPick: (id: string) => void;
  loading: boolean;
  hasAmount: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!hasAmount) return null;

  if (loading && routes.length === 0) {
    return (
      <div className="panel-flat" style={{ padding: "12px 15px", marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
        <span className="spinner" style={{ color: "var(--gold)" }} />
        <span style={{ fontSize: 13, color: "var(--muted)" }}>Comparing venues on chain 4663…</span>
      </div>
    );
  }

  if (routes.length === 0) {
    return (
      <>
        <div className="panel-flat" style={{ padding: "12px 15px", marginTop: 10, fontSize: 13, color: "var(--muted)" }}>
          No on-chain route found for this pair.
        </div>
        {/* A pre-graduation token has no pool but is still buyable on its curve. */}
        {tokenOut && <CurveFallback token={tokenOut} symbol={symbol} />}
      </>
    );
  }

  const best = BigInt(routes[0].amountOut);
  const active = routes.find((r) => r.id === activeId) ?? routes[0];

  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="panel-flat"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "11px 15px",
          cursor: "pointer",
          color: "var(--text)",
          font: "inherit",
          textAlign: "left",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: PROTOCOL_COLOR[active.protocol],
              flexShrink: 0,
            }}
          />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13.5, fontWeight: 600 }}>{active.label}</span>
            <span className="mono" style={{ display: "block", fontSize: 10.5, color: "var(--faint)" }}>
              {active.hops.join(" → ")} · {active.detail}
            </span>
          </span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
          <span className="chip" data-on="true" style={{ pointerEvents: "none", fontSize: 10.5 }}>
            {routes.length} route{routes.length > 1 ? "s" : ""}
          </span>
          <span style={{ color: "var(--muted)", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", display: "inline-block" }}>
            ›
          </span>
        </span>
      </button>

      {open && (
        <div className="rise" style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
          {routes.map((r, i) => {
            const out = BigInt(r.amountOut);
            const deltaBps = best > 0n ? Number(((best - out) * 10_000n) / best) : 0;
            const isActive = r.id === active.id;
            return (
              <button
                key={r.id}
                onClick={() => onPick(r.id)}
                className="panel-flat"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  cursor: "pointer",
                  font: "inherit",
                  textAlign: "left",
                  color: isActive ? "var(--text)" : "var(--muted)",
                  borderColor: isActive
                    ? "color-mix(in srgb, var(--gold) 55%, transparent)"
                    : undefined,
                }}
              >
                <span
                  style={{ width: 8, height: 8, borderRadius: 2, background: PROTOCOL_COLOR[r.protocol], flexShrink: 0 }}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>
                    {r.label}{" "}
                    <span className="mono" style={{ fontWeight: 400, fontSize: 10.5, color: "var(--faint)" }}>
                      {r.detail}
                    </span>
                  </span>
                </span>
                <span className="mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                  {formatUnits(out, decimals, 5)} {symbol}
                </span>
                {i === 0 ? (
                  <span
                    className="chip"
                    data-on="true"
                    style={{ pointerEvents: "none", fontSize: 9.5, padding: "2px 8px" }}
                  >
                    BEST
                  </span>
                ) : (
                  <span
                    className="mono"
                    style={{ fontSize: 10.5, color: "var(--ember)", minWidth: 46, textAlign: "right" }}
                  >
                    −{(deltaBps / 100).toFixed(2)}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
