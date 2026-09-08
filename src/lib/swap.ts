import { encodeFunctionData, type Address } from "viem";
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
