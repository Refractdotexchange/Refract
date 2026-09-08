import { NextResponse } from "next/server";
import { getPools } from "@/lib/pools";

export const dynamic = "force-dynamic";
// Chain scans issue several sequential eth_getLogs calls; the platform default
// of 10s cuts them off mid-scan.
export const maxDuration = 60;
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const windowBlocks = Math.min(
    Math.max(Number(url.searchParams.get("window") ?? 25_000) || 25_000, 5_000),
    150_000,
  );

  try {
    const data = await getPools(windowBlocks);
    return NextResponse.json(data, {
      headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Could not reach Robinhood Chain right now.", detail: String(err).slice(0, 200) },
      { status: 502 },
    );
  }
}
