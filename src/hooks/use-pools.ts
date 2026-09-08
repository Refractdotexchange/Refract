"use client";

import { useQuery } from "@tanstack/react-query";
import type { Pool } from "@/lib/pools";

export type PoolsResponse = {
  pools: Pool[];
  head: number;
  scannedBlocks: number;
  /** Some block ranges failed, so this list is incomplete. */
  degraded: boolean;
  updatedAt: number;
};

export function usePools(windowBlocks = 25_000) {
  return useQuery<PoolsResponse>({
    queryKey: ["pools", windowBlocks],
    queryFn: async () => {
      const r = await fetch(`/api/pools?window=${windowBlocks}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Pools unavailable");
      return d;
    },
    refetchInterval: 45_000,
    staleTime: 30_000,
    // A rate-limited cold start returns an incomplete list; come back quickly
    // for it rather than leaving the page looking empty.
    refetchIntervalInBackground: false,
    retry: 2,
  });
}

export function useEthUsd() {
  return useQuery<number | null>({
    queryKey: ["ethUsd"],
    queryFn: async () => {
      const r = await fetch("/api/stats");
      if (!r.ok) return null;
      const d = await r.json();
      return d.ethUsd ?? null;
    },
    refetchInterval: 60_000,
  });
}
