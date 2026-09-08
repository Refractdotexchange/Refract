import { NextResponse } from "next/server";
import { getPools } from "@/lib/pools";
import { getEthUsd } from "@/lib/quote";
import { cached } from "@/lib/rpc";

export const dynamic = "force-dynamic";
// Chain scans issue several sequential eth_getLogs calls; the platform default
// of 10s cuts them off mid-scan.
export const maxDuration = 60;

/**
 * Protocol-level stats, all derived from live chain reads. No figure here is
 * hard-coded or fetched from a third-party API.
 */
export async function GET() {
  try {
    const data = await cached(
      "stats",
      45_000,
      async () => {
        const [{ pools, head, degraded }, ethUsd] = await Promise.all([
          getPools(25_000),
          getEthUsd(),
        ]);

        const trades = pools.reduce((sum, p) => sum + p.trades, 0);
        const active = pools.filter((p) => p.trades > 0).length;
        const graduated = pools.filter((p) => p.status === "graduated").length;

        return {
          head,
          degraded,
          launches: pools.length,
          activePools: active,
          graduated,
          trades,
          ethUsd,
          windowMinutes: Math.round((25_000 * 0.1) / 60),
          updatedAt: Date.now(),
        };
      },
      (result) => result.degraded,
    );

    return NextResponse.json(data, {
      headers: {
        "cache-control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err).slice(0, 200) },
      { status: 502 },
    );
  }
}
