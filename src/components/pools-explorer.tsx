"use client";

import { useEffect, useMemo, useState } from "react";
import { PoolCard, PoolCardSkeleton } from "./pool-card";
import { SafeModeToggle } from "./safe-text";
import { PoolTable } from "./pool-table";
import { useEthUsd, usePools } from "@/hooks/use-pools";
import { compact, timeAgo } from "@/lib/format";
import type { Pool } from "@/lib/pools";

type SortKey = "newest" | "liquidity" | "activity" | "progress";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "activity", label: "Most traded" },
  { key: "progress", label: "Supply sold" },
  { key: "liquidity", label: "Curve ETH" },
];

const WINDOWS = [
  { blocks: 25_000, label: "~40m" },
  { blocks: 50_000, label: "~85m" },
  { blocks: 100_000, label: "~2.8h" },
];

export function PoolsExplorer() {
  const [sort, setSort] = useState<SortKey>("newest");
  const [windowBlocks, setWindowBlocks] = useState(25_000);
  const [query, setQuery] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const [stage, setStage] = useState<"all" | "curve" | "graduated">("all");
  const [view, setView] = useState<"grid" | "table">("grid");

  const { data, isLoading, isFetching, error, refetch } = usePools(windowBlocks);
  const incomplete = data?.degraded ?? false;
  const { data: ethUsd } = useEthUsd();

  // An incomplete scan that produced nothing is a transient RPC limit, not an
  // empty chain — retry shortly instead of showing a bare "no results".
  useEffect(() => {
    if (incomplete && (data?.pools.length ?? 0) === 0) {
      const t = setTimeout(() => refetch(), 6000);
      return () => clearTimeout(t);
    }
  }, [incomplete, data, refetch]);

  // Clone detection: several launches routinely ship the same name+symbol to
  // ride a trending token. Count them across the full result, not the filtered
  // view, so a search does not hide the duplicates.
  const cloneCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of data?.pools ?? []) {
      const key = `${p.symbol.toLowerCase()}|${p.name.toLowerCase()}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  const pools = useMemo(() => {
    let list: Pool[] = data?.pools ?? [];

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.symbol.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.token.toLowerCase().includes(q),
      );
    }
    if (onlyActive) list = list.filter((p) => p.trades > 0);
    if (stage !== "all") list = list.filter((p) => p.status === stage);

    const sorted = [...list];
    switch (sort) {
      case "liquidity":
        sorted.sort((a, b) => Number(BigInt(b.reserveNative) - BigInt(a.reserveNative)));
        break;
      case "activity":
        sorted.sort((a, b) => b.trades - a.trades || b.launchBlock - a.launchBlock);
        break;
      case "progress":
        sorted.sort((a, b) => b.progress - a.progress);
        break;
      default:
        sorted.sort((a, b) => b.launchBlock - a.launchBlock);
    }
    return sorted;
  }, [data, query, sort, onlyActive, stage]);

  return (
    <>
      <div
        className="panel"
        style={{ padding: 14, marginBottom: 18, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}
      >
        <input
          className="input"
          placeholder="Search symbol, name, or contract address"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: "1 1 240px", minWidth: 0, fontSize: 13.5 }}
        />

        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {SORTS.map((s) => (
            <button key={s.key} className="chip" data-on={sort === s.key} onClick={() => setSort(s.key)}>
              {s.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
          <span className="kicker" style={{ marginRight: 2 }}>
            Window
          </span>
          {WINDOWS.map((w) => (
            <button
              key={w.blocks}
              className="chip"
              data-on={windowBlocks === w.blocks}
              onClick={() => setWindowBlocks(w.blocks)}
            >
              {w.label}
            </button>
          ))}
          <button className="chip" data-on={onlyActive} onClick={() => setOnlyActive((v) => !v)}>
            Traded only
          </button>
          <SafeModeToggle />
          <button
            className="chip"
            onClick={() => setView(view === "grid" ? "table" : "grid")}
            title="Switch between cards and a dense table"
          >
            {view === "grid" ? "▦ Cards" : "☰ Table"}
          </button>
          <button
            className="chip"
            data-on={stage !== "all"}
            onClick={() => setStage(stage === "all" ? "curve" : stage === "curve" ? "graduated" : "all")}
          >
            {stage === "all" ? "All stages" : stage === "curve" ? "On curve" : "Graduated"}
          </button>
        </div>
      </div>

      <div
        className="mono stack-sm"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          fontSize: 11.5,
          color: "var(--faint)",
          marginBottom: 14,
        }}
      >
        <span>
          {isLoading ? "Scanning chain…" : `${compact(pools.length, 0)} pools`}
          {incomplete && !isLoading && " · partial scan"}
          {data && ` · scanned ${compact(data.scannedBlocks, 0)} blocks to head #${compact(data.head, 2)}`}
        </span>
        <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {data && <span>updated {timeAgo(Math.floor(data.updatedAt / 1000))}</span>}
          <button className="chip" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </span>
      </div>

      {error && (
        <div className="panel" style={{ padding: 22, color: "var(--muted)", fontSize: 14, lineHeight: 1.6 }}>
          {(error as Error).message}. The public RPC rate-limits bursts, so this usually clears on
          the next refresh.
        </div>
      )}

      {view === "table" && !isLoading && pools.length > 0 ? (
        <PoolTable pools={pools} ethUsd={ethUsd ?? null} cloneCounts={cloneCounts} />
      ) : (
        <div className="pool-grid">
          {isLoading && Array.from({ length: 9 }, (_, i) => <PoolCardSkeleton key={i} />)}
          {pools.map((p) => (
            <PoolCard
              key={p.token}
              pool={p}
              ethUsd={ethUsd ?? null}
              clones={cloneCounts.get(`${p.symbol.toLowerCase()}|${p.name.toLowerCase()}`) ?? 1}
            />
          ))}
        </div>
      )}

      {!isLoading && !error && pools.length === 0 && (
        <div className="panel" style={{ padding: 40, textAlign: "center" }}>
          {incomplete && (data?.pools.length ?? 0) === 0 ? (
            <>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                <span className="spinner" style={{ color: "var(--gold)", width: 20, height: 20 }} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Scan was rate-limited</div>
              <div style={{ color: "var(--muted)", fontSize: 13.5, marginTop: 7, lineHeight: 1.6, maxWidth: 400, margin: "7px auto 0" }}>
                The public RPC throttled this request, so the chain was not fully read. This is not
                an empty result. Retrying automatically.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Nothing matches those filters</div>
              <div style={{ color: "var(--muted)", fontSize: 13.5, marginTop: 7 }}>
                Try widening the window or clearing the search.
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
