import { zeroAddress, type Address } from "viem";
import { CONTRACTS } from "./chain";

export type TokenInfo = {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  native?: boolean;
  logoUrl?: string | null;
};

/** Base assets that always route on chain 4663. Verified on-chain. */
export const BASE_TOKENS: TokenInfo[] = [
  {
    address: zeroAddress as Address,
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    native: true,
  },
  {
    address: CONTRACTS.weth as Address,
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
  },
  {
    address: CONTRACTS.usdg as Address,
    symbol: "USDG",
    name: "Global Dollar",
    decimals: 6,
  },
];

export const NATIVE_TOKEN = BASE_TOKENS[0];
export const WETH_TOKEN = BASE_TOKENS[1];
export const USDG_TOKEN = BASE_TOKENS[2];

export const IMPORTED_KEY = "refract.importedTokens";

export function loadImported(): TokenInfo[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(IMPORTED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveImported(tokens: TokenInfo[]) {
  try {
    localStorage.setItem(IMPORTED_KEY, JSON.stringify(tokens.slice(0, 60)));
  } catch {
    /* storage unavailable — imports last for this session only */
  }
}

export const sameToken = (a?: TokenInfo, b?: TokenInfo) =>
  !!a && !!b && a.address.toLowerCase() === b.address.toLowerCase();
