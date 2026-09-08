"use client";

import { useQuery } from "@tanstack/react-query";
import { compact, usd } from "@/lib/format";

type Stats = {
  head: number;
  degraded?: boolean;
  launches: number;
  activePools: number;
  graduated: number;
  trades: number;
  ethUsd: number | null;
  windowMinutes: number;
};

/** Live protocol stats, every value read from chain 4663 on the server. */
export function StatTicker() {
  const { data, isLoading } = useQuery<Stats>({
    queryKey: ["stats"],
    queryFn: async () => {
      const r = await fetch("/api/stats");
      if (!r.ok) throw new Error("stats unavailable");
      return r.json();
    },
    refetchInterval: 30_000,
  });

  // An incomplete scan must not render as a confident "0".
  const partial = data?.degraded ?? false;
  const count = (n: number | undefined) =>
    data == null ? null : partial && !n ? "—" : compact(n ?? 0, 0);

  const items = [
    { label: "ETH price", value: data ? usd(data.ethUsd) : null, tone: "var(--brass)" },
    { label: `Launches / ${data?.windowMinutes ?? 83}m`, value: count(data?.launches), tone: "var(--gold)" },
    { label: "Curve trades", value: count(data?.trades), tone: "var(--olive)" },
    { label: "Graduated", value: count(data?.graduated), tone: "var(--honey)" },
    { label: "Chain head", value: data ? `#${compact(data.head, 2)}` : null, tone: "var(--champagne)" },
  ];

  return (
    <>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(116px, 1fr))",
        gap: 10,
      }}
    >
      {items.map((it) => (
        <div key={it.label} className="panel" style={{ padding: "14px 16px" }}>
          <div className="kicker" style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: it.tone, flexShrink: 0 }} />
            {it.label}
          </div>
          <div
            className="font-display mono"
            style={{ fontSize: 21, fontWeight: 700, marginTop: 7, letterSpacing: "-0.02em" }}
          >
            {isLoading || it.value == null ? (
              <span className="skeleton" style={{ display: "block", width: 74, height: 24 }} />
            ) : (
              it.value
            )}
          </div>
        </div>
      ))}
    </div>
      {partial && (
        <div
          className="mono"
          style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 8, lineHeight: 1.5 }}
        >
          Partial scan — the public RPC rate-limited some block ranges. Figures shown as “—” are
          incomplete, not zero. Retrying automatically.
        </div>
      )}
    </>
  );
}
