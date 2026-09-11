/**
 * Router calldata for a swap the pool executes on your behalf.
 *
 * The pool may call exactly one address, fixed in its constructor, because an
 * arbitrary call target turns a payload into a drain. That address is the
 * Universal Router, so every shielded swap has to be expressed as a router
 * `execute` call. The app's ordinary swap path cannot be reused directly: it
 * targets three different routers depending on the venue, and two of them the
 * pool is not allowed to talk to.
 *
 * The output has to land in the pool, not with the trader, because the pool
 * forwards it after checking how much actually arrived. The router's
 * MSG_SENDER sentinel resolves to whoever called it, which here is the pool,
 * so that is what every command names as its recipient.
 */

import { encodeAbiParameters, encodeFunctionData, zeroAddress, type Address, type Hex } from "viem";
import { CONTRACTS } from "./chain";
import { universalRouterAbi, encodeV4Actions } from "./swap";
import type { Route } from "./quote";
import type { TokenInfo } from "./tokens";

const MSG_SENDER = "0x0000000000000000000000000000000000000001" as Address;
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002" as Address;
const WETH = CONTRACTS.weth as Address;

/** Universal Router command bytes. */
const CMD = { V3_SWAP_EXACT_IN: 0x00, V2_SWAP_EXACT_IN: 0x08, WRAP_ETH: 0x0b, V4_SWAP: 0x10 } as const;

const cmd = (...bytes: number[]) =>
  ("0x" + bytes.map((b) => b.toString(16).padStart(2, "0")).join("")) as Hex;

/** Packed V3 path: token, fee as three bytes, token. */
function v3Path(tokenIn: Address, fee: number, tokenOut: Address): Hex {
  return ("0x" +
    tokenIn.slice(2).toLowerCase() +
    fee.toString(16).padStart(6, "0") +
    tokenOut.slice(2).toLowerCase()) as Hex;
}

export type RoutedSwapCall = {
  /** Calldata the pool hands to the router, verbatim. */
  calldata: Hex;
  /** Token the pool will receive and forward. */
  tokenOut: Address;
};

/**
 * Build the router call for a contract that swaps on someone's behalf.
 *
 * Used by both the shielded pool and the fee router. Neither can let the
 * router pay the trader directly: each needs the output to arrive at itself so
 * it can measure what actually turned up before passing it on.
 *
 * Input is always native ETH: notes in this pool are ETH-denominated, so there
 * is no other asset for a swap to start from. For V2 and V3 the ETH is wrapped
 * inside the router first, and the swap is told the payer is the router rather
 * than the caller, because the pool never grants Permit2 an allowance. V4
 * settles native input itself and needs no wrap.
 */
export function buildRoutedSwapCall({
  route,
  tokenOut,
  amountIn,
  minOut,
  deadlineSeconds = 1200,
}: {
  route: Route;
  tokenOut: TokenInfo;
  amountIn: bigint;
  minOut: bigint;
  deadlineSeconds?: number;
}): RoutedSwapCall {
  if (tokenOut.native) {
    throw new Error("A shielded swap must buy a token. Withdraw to move ETH.");
  }
  const outAddr = tokenOut.address as Address;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);

  let commands: Hex;
  let inputs: Hex[];

  if (route.protocol === "uniswap-v4") {
    if (!route.poolKey) throw new Error("That V4 route is missing its pool key.");
    const zeroForOne = route.poolKey.currency0 === zeroAddress;
    commands = cmd(CMD.V4_SWAP);
    inputs = [encodeV4Actions({ poolKey: route.poolKey, zeroForOne, amountIn, minOut })];
  } else if (route.protocol === "uniswap-v2") {
    const path: Address[] = route.id === "v2-weth" ? [WETH, WETH, outAddr] : [WETH, outAddr];
    commands = cmd(CMD.WRAP_ETH, CMD.V2_SWAP_EXACT_IN);
    inputs = [
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        [ADDRESS_THIS, amountIn],
      ),
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "address[]" }, { type: "bool" }],
        [MSG_SENDER, amountIn, minOut, path, false],
      ),
    ];
  } else {
    const fee = route.fee ?? 3000;
    commands = cmd(CMD.WRAP_ETH, CMD.V3_SWAP_EXACT_IN);
    inputs = [
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        [ADDRESS_THIS, amountIn],
      ),
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" }, { type: "bool" }],
        [MSG_SENDER, amountIn, minOut, v3Path(WETH, fee, outAddr), false],
      ),
    ];
  }

  return {
    calldata: encodeFunctionData({
      abi: universalRouterAbi,
      functionName: "execute",
      args: [commands, inputs, deadline],
    }),
    tokenOut: outAddr,
  };
}
