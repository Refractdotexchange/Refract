"use client";

import Link from "next/link";
import { PoolCard, PoolCardSkeleton } from "./pool-card";
import { useEthUsd, usePools } from "@/hooks/use-pools";

/** The six newest bonding-curve launches, surfaced on the swap page. */
export function FreshLaunches() {
  const { data, isLoading, error } = usePools(25_000);
  const { data: ethUsd } = useEthUsd();
  const pools = data?.pools.slice(0, 6) ?? [];

  return (
    <section style={{ marginTop: 20 }}>
      <div
        className="stack-sm"
        style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, marginBottom: 18 }}
      >
        <div>
          <div className="kicker" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="live-dot" />
            Straight off the curve
          </div>
          <h2 className="font-display" style={{ fontSize: 27, fontWeight: 700, margin: "9px 0 0" }}>
            Fresh launches
          </h2>
        </div>
        <Link href="/pools" className="btn">
          All pools →
        </Link>
      </div>

      {error && (
        <div className="panel" style={{ padding: 20, color: "var(--muted)", fontSize: 14 }}>
          Could not reach chain 4663 right now. The list refreshes automatically.
        </div>
      )}

      <div className="pool-grid">
        {isLoading && Array.from({ length: 6 }, (_, i) => <PoolCardSkeleton key={i} />)}
        {pools.map((p) => (
          <PoolCard key={p.token} pool={p} ethUsd={ethUsd ?? null} />
        ))}
      </div>

      {!isLoading && !error && pools.length === 0 && (
        <div className="panel" style={{ padding: 26, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
          No launches in the last scanned window. Check back shortly.
        </div>
      )}
    </section>
  );
}
