import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getRewards } from "@/lib/rewards";

export const dynamic = "force-dynamic";
// Chain scans issue several sequential eth_getLogs calls; the platform default
// of 10s cuts them off mid-scan.
export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!isAddress(address)) {
    return NextResponse.json({ error: "Enter a valid 0x wallet address" }, { status: 400 });
  }

  const windowBlocks = Math.min(
    Math.max(Number(new URL(req.url).searchParams.get("window") ?? 100_000) || 100_000, 25_000),
    300_000,
  );

  try {
    return NextResponse.json(await getRewards(address as Address, windowBlocks));
  } catch (err) {
    return NextResponse.json(
      { error: "Could not load rewards — try again.", detail: String(err).slice(0, 200) },
      { status: 502 },
    );
  }
}
