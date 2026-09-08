"use client";

import Link from "next/link";
import { TokenAvatar } from "./brand";
import { SafeText } from "./safe-text";
import { compact, shortAddress, timeAgo } from "@/lib/format";
import type { Pool } from "@/lib/pools";

/**
 * Dense alternative to the card grid. At 70+ pools the cards are pleasant but
 * slow to scan; this puts ~20 rows on screen with the same data.
 */
export function PoolTable({
  pools,
  ethUsd,
  cloneCounts,
}: {
  pools: Pool[];
  ethUsd: number | null;
  cloneCounts: Map<string, number>;
}) {
  return (
    <div className="panel table-wrap" style={{ padding: 0, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
        <thead>
          <tr>
            {["Token", "Trades", "Supply sold", "Curve ETH", "Age", "Contract"].map((h, i) => (
              <th
                key={h}
                className="kicker"
                style={{
                  textAlign: i === 0 ? "left" : "right",
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--line)",
                  whiteSpace: "nowrap",
                  fontWeight: 400,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pools.map((p) => {
            const reserveEth = Number(p.reserveNative) / 1e18;
            const clones = cloneCounts.get(`${p.symbol.toLowerCase()}|${p.name.toLowerCase()}`) ?? 1;
            const pct = Math.min(100, Math.max(0, p.progress * 100));
            return (
              <tr key={p.token} className="pool-row">
                <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--line-soft)" }}>
                  <Link
                    href={`/token/${p.token}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      textDecoration: "none",
                      color: "var(--text)",
                      minWidth: 0,
                    }}
                  >
                    <TokenAvatar address={p.token} symbol={p.symbol} size={28} logoUrl={p.logoUrl} />
                    <span style={{ minWidth: 0 }}>
                      <span
                        className="clip-text"
                        style={{ display: "block", fontWeight: 650, fontSize: 13.5 }}
                      >
                        <SafeText value={p.symbol} />
                        {clones > 1 && (
                          <span
                            title={`${clones} tokens share this name and symbol`}
                            style={{ color: "var(--ember)", fontSize: 10, marginLeft: 7 }}
                          >
                            ⚠ {clones}×
                          </span>
                        )}
                        {p.status === "graduated" && (
                          <span style={{ color: "var(--olive)", fontSize: 10, marginLeft: 7 }}>
                            GRAD
                          </span>
                        )}
                      </span>
                      <span
                        className="clip-text"
                        style={{ display: "block", fontSize: 11, color: "var(--muted)" }}
                      >
                        <SafeText value={p.name} />
                      </span>
                    </span>
                  </Link>
                </td>
                <Cell>{compact(p.trades, 0)}</Cell>
                <td
                  style={{
                    padding: "11px 16px",
                    borderBottom: "1px solid var(--line-soft)",
                    textAlign: "right",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span className="mono" style={{ fontSize: 12 }}>
                    {pct.toFixed(1)}%
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      display: "block",
                      height: 3,
                      borderRadius: 2,
                      marginTop: 4,
                      background: "var(--surface-3)",
                      overflow: "hidden",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        width: `${pct}%`,
                        height: "100%",
                        background: "var(--meter)",
                      }}
                    />
                  </span>
                </td>
                <Cell>
                  {reserveEth > 0
                    ? reserveEth < 0.0001
                      ? reserveEth.toExponential(1)
                      : reserveEth.toFixed(4)
                    : "—"}
                  {reserveEth > 0 && ethUsd != null && (
                    <span style={{ color: "var(--faint)", marginLeft: 6 }}>
                      ${(reserveEth * ethUsd).toFixed(0)}
                    </span>
                  )}
                </Cell>
                <Cell muted>{timeAgo(p.launchedAt)}</Cell>
                <Cell muted>{shortAddress(p.token, 4)}</Cell>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <td
      className="mono"
      style={{
        padding: "11px 16px",
        borderBottom: "1px solid var(--line-soft)",
        textAlign: "right",
        fontSize: 12,
        whiteSpace: "nowrap",
        color: muted ? "var(--faint)" : "var(--text)",
      }}
    >
      {children}
    </td>
  );
}
