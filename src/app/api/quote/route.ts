import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { quote, getEthUsd, NATIVE } from "@/lib/quote";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenIn = url.searchParams.get("in") ?? "";
  const tokenOut = url.searchParams.get("out") ?? "";
  const amountIn = url.searchParams.get("amount") ?? "0";

  const validIn = tokenIn === NATIVE || isAddress(tokenIn);
  const validOut = tokenOut === NATIVE || isAddress(tokenOut);
  if (!validIn || !validOut) {
    return NextResponse.json({ error: "in and out must be addresses" }, { status: 400 });
  }

  let amount: bigint;
  try {
    amount = BigInt(amountIn);
  } catch {
    return NextResponse.json({ error: "amount must be an integer in base units" }, { status: 400 });
  }

  try {
    const [result, ethUsd] = await Promise.all([
      quote(tokenIn as Address, tokenOut as Address, amount),
      getEthUsd(),
    ]);
    return NextResponse.json({ ...result, ethUsd });
  } catch (err) {
    return NextResponse.json(
      { error: "Quote engine unreachable — try again.", detail: String(err).slice(0, 200) },
      { status: 502 },
    );
  }
}
