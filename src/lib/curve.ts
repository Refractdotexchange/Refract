import { parseAbi, type Address } from "viem";

/**
 * Pons bonding curves.
 *
 * Every token launched through Pons gets its own curve contract, and trades
 * there until it graduates to Uniswap. The interface below was recovered from
 * on-chain bytecode and confirmed against a real trade, because the contracts
 * are unverified on the explorer:
 *
 *   tx 0xf9535adf967abe05be72f7259cf779f0620cea240df6994a1a2cdde67fa3f308
 *   buy(212787331, 5432888058536618400677888, 0x2a4d…21d7)  value: 0
 *   -> paid 212787331 USDG, received 5902755789720995449901263 USDUG
 *
 * Two things that trade desks get wrong here:
 *   1. Payment is an ERC-20 `pairToken`, never native ETH, so a buy needs an
 *      approval first and carries value: 0.
 *   2. The pair asset is not always ETH. Pons v2 quotes curves in USDG, WETH
 *      and tokenised equities (GME, MSTR, NVDA), so the UI has to read it per
 *      curve rather than assume.
 *
 * A `pairToken` of the zero address means the curve trades native ETH instead
 * of an ERC-20. That path is payable and takes no approval, confirmed against:
 *
 *   tx 0xed2d0216ba5963261aa0bf483229f38be3945ecad06d02d8859a75f152ba3e8a
 *   buy(10000000000000000, 3924866834875245304177179, 0x…)  value: 0.01 ETH
 *
 * so `amountIn` is repeated as msg.value rather than pulled by transferFrom.
 */

export const NATIVE_PAIR = "0x0000000000000000000000000000000000000000" as const;

export const curveAbi = parseAbi([
  "function token() view returns (address)",
  "function pairToken() view returns (address)",
  "function getReserves() view returns (uint256 pairReserve, uint256 tokenReserve)",
  "function feeBps() view returns (uint256)",
  "function graduated() view returns (bool)",
  // payable: native-ETH curves take the amount as msg.value.
  "function buy(uint256 amountIn, uint256 minAmountOut, address to) payable returns (uint256)",
  "function sell(uint256 amountIn, uint256 minAmountOut, address to) returns (uint256)",
]);

/** Launch tokens point back at their own curve, so no scan is needed. */
export const launchTokenCurveAbi = parseAbi(["function curve() view returns (address)"]);

export type CurveState = {
  curve: Address;
  token: Address;
  pairToken: Address;
  /** True when the curve trades native ETH (pairToken is the zero address). */
  isNative: boolean;
  pairSymbol: string;
  pairDecimals: number;
  pairReserve: string;
  tokenReserve: string;
  feeBps: number;
  graduated: boolean;
};

/**
 * Constant product with the fee taken off the input.
 *
 * IMPORTANT: this is an estimate, not the truth. `feeBps()` reports 100 on
 * every curve inspected, but the fee actually applied varies:
 *
 *   USDG curve   0xb4F3…074B   feeBps 100 -> 100bps effective
 *   SOLARANG     native        feeBps 100 -> 200bps effective
 *   0xfB0b…3fa6  native        feeBps 100 -> 300bps effective
 *
 * all measured against real trades and pinned-block simulations. So the fee
 * cannot be derived off-chain, and quoting from this alone overstates the
 * output by 1-2%, which is enough to make a buy revert on tight slippage.
 * Prefer `exactOut` from the API, which asks the contract itself; fall back to
 * this only for display when the contract cannot be probed.
 */
export function quoteBuy(
  amountIn: bigint,
  pairReserve: bigint,
  tokenReserve: bigint,
  feeBps: number,
): bigint {
  if (amountIn <= 0n || pairReserve <= 0n || tokenReserve <= 0n) return 0n;
  const afterFee = (amountIn * BigInt(10_000 - feeBps)) / 10_000n;
  return (afterFee * tokenReserve) / (pairReserve + afterFee);
}

/** Price impact in percent, for warning the user before they commit. */
export function priceImpact(
  amountIn: bigint,
  pairReserve: bigint,
  tokenReserve: bigint,
  feeBps: number,
): number {
  if (amountIn <= 0n || pairReserve <= 0n || tokenReserve <= 0n) return 0;
  const out = quoteBuy(amountIn, pairReserve, tokenReserve, feeBps);
  if (out <= 0n) return 0;
  // Spot price ignores depth; comparing it to the realised rate is the impact.
  const spotOut = (amountIn * tokenReserve) / pairReserve;
  if (spotOut <= 0n) return 0;
  return Math.max(0, (1 - Number(out) / Number(spotOut)) * 100);
}

/**
 * Selling back into the curve: tokens in, pair asset out. Same caveat as
 * quoteBuy — the applied fee is not what feeBps() reports, so treat this as a
 * display estimate and take the real floor from a simulation.
 *
 * Confirmed against a real sell:
 *   tx 0x25e4c07b5b358926f16ebfba9bee861967dd4ae48be7f317d6c1fb4ce6223b95
 *   sell(1786381981353094046414611, 15907259961953695, 0x…)  value: 0
 */
export function quoteSell(
  tokenIn: bigint,
  pairReserve: bigint,
  tokenReserve: bigint,
  feeBps: number,
): bigint {
  if (tokenIn <= 0n || pairReserve <= 0n || tokenReserve <= 0n) return 0n;
  const afterFee = (tokenIn * BigInt(10_000 - feeBps)) / 10_000n;
  return (afterFee * pairReserve) / (tokenReserve + afterFee);
}

/** Slippage floor sent as `minAmountOut`, so a moved curve reverts. */
export function minOut(expected: bigint, slippageBps: number): bigint {
  return (expected * BigInt(10_000 - slippageBps)) / 10_000n;
}
