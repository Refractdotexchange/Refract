"use client";

import { useQuery } from "@tanstack/react-query";
import type { QuoteResult } from "@/lib/quote";
import type { TokenInfo } from "@/lib/tokens";

export type QuoteResponse = QuoteResult & { ethUsd: number | null };

/** Live route comparison. Re-quotes every 15s while an amount is entered. */
export function useQuote(tokenIn: TokenInfo, tokenOut: TokenInfo, amountIn: bigint) {
  return useQuery<QuoteResponse>({
    queryKey: ["quote", tokenIn.address, tokenOut.address, amountIn.toString()],
    enabled: amountIn > 0n && tokenIn.address !== tokenOut.address,
    refetchInterval: 15_000,
    staleTime: 8_000,
    queryFn: async () => {
      const params = new URLSearchParams({
        in: tokenIn.address,
        out: tokenOut.address,
        amount: amountIn.toString(),
      });
      const res = await fetch(`/api/quote?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Quote failed");
      return data;
    },
  });
}

export function useTokenBalanceKey(address?: string) {
  return address ?? "disconnected";
}
