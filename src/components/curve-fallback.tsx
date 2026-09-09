"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

/**
 * Shown when the router finds no venue for a pair.
 *
 * A token that has not graduated has no Uniswap pool, so "no route" is the
 * correct answer from the router but the wrong place to stop: the token is
 * still buyable on its Pons curve. Without this the swap card is a dead end
 * for every fresh launch, which is most of what the site lists.
 */
export function CurveFallback({ token, symbol }: { token: Address; symbol: string }) {
  const curve = useQuery<{ pairSymbol: string; graduated: boolean; isNative: boolean }>({
    queryKey: ["curve-fallback", token],
    queryFn: async () => {
      const r = await fetch(`/api/curve/${token}`);
      if (!r.ok) throw new Error("no curve");
      return r.json();
    },
    retry: false,
    staleTime: 30_000,
  });

  const d = curve.data;
  if (!d || d.graduated) return null;

  return (
    <div
      className="panel-flat"
      style={{ padding: "13px 15px", marginTop: 10, display: "flex", flexDirection: "column", gap: 9 }}
    >
      <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
        <strong style={{ color: "var(--text)" }}>{symbol}</strong> has not graduated to Uniswap yet,
        so there is no pool to route through. It is still trading on its Pons bonding curve, where
        buys are paid in <strong style={{ color: "var(--text)" }}>{d.pairSymbol}</strong>.
      </div>
      <Link
        href={`/token/${token}`}
        className="btn btn-primary"
        style={{ textDecoration: "none", textAlign: "center", padding: "10px 14px", fontSize: 14 }}
      >
        Buy {symbol} on the curve →
      </Link>
    </div>
  );
}
