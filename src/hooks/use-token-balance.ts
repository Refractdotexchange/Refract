"use client";

import { useAccount, useBalance, useReadContract } from "wagmi";
import { erc20Abi } from "@/lib/abi";
import type { TokenInfo } from "@/lib/tokens";
import type { Address } from "viem";

/** Native and ERC-20 balances behind one interface. */
export function useTokenBalance(token: TokenInfo) {
  const { address } = useAccount();

  const native = useBalance({
    address,
    query: { enabled: !!address && !!token.native, refetchInterval: 20_000 },
  });

  const erc20 = useReadContract({
    address: token.address as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !token.native, refetchInterval: 20_000 },
  });

  const value = token.native ? native.data?.value : (erc20.data as bigint | undefined);
  return {
    value: value ?? 0n,
    isLoading: token.native ? native.isLoading : erc20.isLoading,
    refetch: token.native ? native.refetch : erc20.refetch,
  };
}
