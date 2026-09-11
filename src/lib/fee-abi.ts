import { parseAbi } from "viem";

/** The subset of RefractFeeRouter the frontend calls. */
export const feeRouterAbi = parseAbi([
  "function swapExactEthForToken(address tokenOut, uint256 minOut, address recipient, bytes routerCalldata) payable returns (uint256)",
  "function claim(address token) returns (uint256)",
  "function claimable(address trader, address token) view returns (uint256)",
  "function volumeOf(address trader, address token) view returns (uint256)",
  "function totalVolume(address token) view returns (uint256)",
  "function feesCollected(address token) view returns (uint256)",
  "function surplusFound(address token) view returns (uint256)",
  "function cashbackReserved(address token) view returns (uint256)",
  "function baselineOut(address tokenOut, uint256 amountIn) view returns (uint256)",
  "function surplusFeeBps() view returns (uint16)",
  "function cashbackBps() view returns (uint16)",
  "function collector() view returns (address)",
  "event Routed(address indexed trader, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 baseline, uint256 surplus, uint256 fee, uint256 toCashback)",
  "event CashbackClaimed(address indexed trader, address indexed token, uint256 amount)",
  "error BadFee()",
  "error SwapFailed()",
  "error InsufficientOutput()",
  "error TransferFailed()",
  "error InvalidRecipient()",
  "error NoValue()",
  "error NothingToClaim()",
  "error Reentrancy()",
]);
