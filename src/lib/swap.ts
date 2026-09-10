import { encodeAbiParameters, encodeFunctionData, parseAbi, zeroAddress, type Address, type Hex } from "viem";
import { CONTRACTS } from "./chain";
import { swapRouter02Abi, uniswapV2RouterAbi } from "./abi";
import type { Route } from "./quote";
import type { TokenInfo } from "./tokens";

/** SwapRouter02 sentinel recipients (Uniswap periphery Constants). */
const MSG_SENDER = "0x0000000000000000000000000000000000000001" as Address;
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002" as Address;

const WETH = CONTRACTS.weth as Address;

export type SwapPlan = {
  /** Router the input token must be approved against (null for native input). */
  spender: Address | null;
  request: {
    address: Address;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    abi: any;
    functionName: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: any[];
    value: bigint;
  };
};

export function applySlippage(amountOut: bigint, slippageBps: number): bigint {
  return (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
}

/**
 * Turn a chosen route into a concrete transaction. Native ETH is wrapped and
 * unwrapped by the router itself so the user never needs a separate wrap step.
 */
export function buildSwap({
  route,
  tokenIn,
  tokenOut,
  amountIn,
  minOut,
  recipient,
  deadlineSeconds = 1200,
}: {
  route: Route;
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  amountIn: bigint;
  minOut: bigint;
  recipient: Address;
  deadlineSeconds?: number;
}): SwapPlan {
  const nativeIn = !!tokenIn.native;
  const nativeOut = !!tokenOut.native;
  const inAddr = (nativeIn ? WETH : tokenIn.address) as Address;
  const outAddr = (nativeOut ? WETH : tokenOut.address) as Address;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);

  if (route.protocol === "uniswap-v2") {
    const router = CONTRACTS.uniswapV2Router as Address;
    const path: Address[] =
      route.id === "v2-weth" ? [inAddr, WETH, outAddr] : [inAddr, outAddr];

    if (nativeIn) {
      return {
        spender: null,
        request: {
          address: router,
          abi: uniswapV2RouterAbi,
          functionName: "swapExactETHForTokensSupportingFeeOnTransferTokens",
          args: [minOut, path, recipient, deadline],
          value: amountIn,
        },
      };
    }
    if (nativeOut) {
      return {
        spender: router,
        request: {
          address: router,
          abi: uniswapV2RouterAbi,
          functionName: "swapExactTokensForETHSupportingFeeOnTransferTokens",
          args: [amountIn, minOut, path, recipient, deadline],
          value: 0n,
        },
      };
    }
    return {
      spender: router,
      request: {
        address: router,
        abi: uniswapV2RouterAbi,
        functionName: "swapExactTokensForTokensSupportingFeeOnTransferTokens",
        args: [amountIn, minOut, path, recipient, deadline],
        value: 0n,
      },
    };
  }

  // Uniswap V3 via SwapRouter02.
  const router = CONTRACTS.swapRouter02 as Address;
  const fee = route.fee ?? 3000;

  const params = {
    tokenIn: inAddr,
    tokenOut: outAddr,
    fee,
    // For a native payout the router must hold the WETH so it can unwrap it.
    recipient: nativeOut ? ADDRESS_THIS : MSG_SENDER,
    amountIn,
    amountOutMinimum: minOut,
    sqrtPriceLimitX96: 0n,
  };

  if (nativeOut) {
    // multicall: swap into the router, then unwrap WETH to the trader.
    return {
      spender: nativeIn ? null : router,
      request: {
        address: router,
        abi: swapRouter02Abi,
        functionName: "multicall",
        args: [
          deadline,
          [
            encodeExactInputSingle(params),
            encodeUnwrapWeth(minOut, recipient),
          ],
        ],
        value: nativeIn ? amountIn : 0n,
      },
    };
  }

  return {
    spender: nativeIn ? null : router,
    request: {
      address: router,
      abi: swapRouter02Abi,
      functionName: "exactInputSingle",
      args: [params],
      value: nativeIn ? amountIn : 0n,
    },
  };
}

type ExactInputSingleParams = {
  tokenIn: Address;
  tokenOut: Address;
  fee: number;
  recipient: Address;
  amountIn: bigint;
  amountOutMinimum: bigint;
  sqrtPriceLimitX96: bigint;
};

const encodeExactInputSingle = (p: ExactInputSingleParams) =>
  encodeFunctionData({ abi: swapRouter02Abi, functionName: "exactInputSingle", args: [p] });

const encodeUnwrapWeth = (amountMinimum: bigint, recipient: Address) =>
  encodeFunctionData({
    abi: swapRouter02Abi,
    functionName: "unwrapWETH9",
    args: [amountMinimum, recipient],
  });

/**
 * Native ETH to hold back when a user taps MAX, so the swap itself can still
 * be paid for.
 *
 * Derived from live gas price rather than hardcoded: chain 4663 settles a swap
 * for roughly 0.00005 ETH, so the previous flat 0.003 ETH reserve held back
 * about 66x the actual cost and made MAX unusable on a small balance. The
 * multiplier leaves generous headroom for an approval plus a price spike, and
 * the floor covers the case where a node reports an implausibly low price.
 */
export function gasReserve(gasPrice: bigint): bigint {
  const GAS_FOR_SWAP_PLUS_APPROVE = 400_000n;
  const HEADROOM = 3n;
  const FLOOR = 20_000_000_000_000n; // 0.00002 ETH
  const estimate = gasPrice * GAS_FOR_SWAP_PLUS_APPROVE * HEADROOM;
  return estimate > FLOOR ? estimate : FLOOR;
}

/* ---------- Uniswap V4 ---------------------------------------------------

   V4 swaps do not go through a dedicated router. They are executed as a
   command on the Universal Router, which unlocks the PoolManager and replays
   a list of actions inside it.

   The three actions below are the minimum for an exact-input single-hop swap:
     SWAP_EXACT_IN_SINGLE  perform the swap
     SETTLE_ALL            pay what we owe the pool
     TAKE_ALL              collect what it owes us

   Native ETH is the zero address here rather than WETH, so an ETH swap needs
   no wrapping and carries its amount as msg.value.
-------------------------------------------------------------------------- */

const UR_V4_SWAP = 0x10;
const ACTION_SWAP_EXACT_IN_SINGLE = 0x06;
const ACTION_SETTLE_ALL = 0x0c;
const ACTION_TAKE_ALL = 0x0f;

export const universalRouterAbi = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
]);

const poolKeyComponents = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
] as const;

type V4PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

/** Encode the action list and its parameters for a single-hop exact-in swap. */
function encodeV4Actions({
  poolKey,
  zeroForOne,
  amountIn,
  minOut,
}: {
  poolKey: V4PoolKey;
  zeroForOne: boolean;
  amountIn: bigint;
  minOut: bigint;
}): Hex {
  const actions = ("0x" +
    [ACTION_SWAP_EXACT_IN_SINGLE, ACTION_SETTLE_ALL, ACTION_TAKE_ALL]
      .map((a) => a.toString(16).padStart(2, "0"))
      .join("")) as Hex;

  const currencyIn = zeroForOne ? poolKey.currency0 : poolKey.currency1;
  const currencyOut = zeroForOne ? poolKey.currency1 : poolKey.currency0;

  const swapParams = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "poolKey", type: "tuple", components: poolKeyComponents },
          { name: "zeroForOne", type: "bool" },
          { name: "amountIn", type: "uint128" },
          { name: "amountOutMinimum", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    [{ poolKey, zeroForOne, amountIn, amountOutMinimum: minOut, hookData: "0x" }],
  );

  const settle = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [currencyIn, amountIn],
  );
  const take = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [currencyOut, minOut],
  );

  return encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    [actions, [swapParams, settle, take]],
  );
}

/** Build a V4 swap as a Universal Router `execute` call. */
export function buildV4Swap({
  poolKey,
  zeroForOne,
  amountIn,
  minOut,
  deadlineSeconds = 1200,
}: {
  poolKey: V4PoolKey;
  zeroForOne: boolean;
  amountIn: bigint;
  minOut: bigint;
  deadlineSeconds?: number;
}): SwapPlan {
  const currencyIn = zeroForOne ? poolKey.currency0 : poolKey.currency1;
  const nativeIn = currencyIn === zeroAddress;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);
  const commands = ("0x" + UR_V4_SWAP.toString(16).padStart(2, "0")) as Hex;

  return {
    // Native input needs no approval; an ERC-20 input is pulled by the router.
    spender: nativeIn ? null : (CONTRACTS.universalRouter as Address),
    request: {
      address: CONTRACTS.universalRouter as Address,
      abi: universalRouterAbi,
      functionName: "execute",
      args: [commands, [encodeV4Actions({ poolKey, zeroForOne, amountIn, minOut })], deadline],
      value: nativeIn ? amountIn : 0n,
    },
  };
}
