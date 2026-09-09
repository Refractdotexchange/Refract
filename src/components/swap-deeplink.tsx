"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isAddress } from "viem";
import { SwapCard } from "./swap-card";
import type { TokenInfo } from "@/lib/tokens";

/**
 * Reads ?buy=0x… and resolves it to a token before handing it to the swap.
 *
 * Kept separate from SwapCard so the card stays usable without a router, and
 * so useSearchParams (which opts the tree into client rendering) touches only
 * this small wrapper.
 */
export function SwapDeepLink() {
  const params = useSearchParams();
  const wanted = params.get("buy");
  const [token, setToken] = useState<TokenInfo | null>(null);

  useEffect(() => {
    if (!wanted || !isAddress(wanted)) {
      setToken(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/token/${wanted}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || d.error) return;
        setToken({
          address: d.address,
          symbol: d.symbol,
          name: d.name,
          decimals: d.decimals,
          logoUrl: d.logoUrl ?? null,
        });
      })
      .catch(() => {
        /* leave the swap on its defaults */
      });
    return () => {
      cancelled = true;
    };
  }, [wanted]);

  return <SwapCard buy={token} />;
}
