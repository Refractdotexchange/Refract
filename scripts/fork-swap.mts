/**
 * Does a shielded swap actually work against the real Universal Router?
 *
 * Forks chain 4663, deploys the pool pointed at the live router, deposits, and
 * runs a real swap through the same modules the website uses. The router, the
 * venues and the token are all the real ones; only the chain is a copy.
 */
import { createPublicClient, createWalletClient, http, keccak256, toHex, parseEther, formatEther, formatUnits, zeroAddress, erc20Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as snarkjs from "snarkjs";
import fs from "node:fs";
import { keyFromSignature } from "../src/lib/note-crypto";
import { buildShieldedTx, setProverArtifacts } from "../src/lib/prove-joinsplit";
import { scanPool, selectNotes } from "../src/lib/pool-notes";
import { refractPoolAbi } from "../src/lib/pool-abi-v2";
import { buildShieldedSwapCall } from "../src/lib/shielded-swap";
import { applySlippage } from "../src/lib/swap";
import { quote } from "../src/lib/quote";

setProverArtifacts("public/zk/joinsplit.wasm", "public/zk/joinsplit.zkey", snarkjs as never);

const RPC = "http://localhost:8549";
const POOL = fs.readFileSync("/tmp/fork_pool.txt", "utf8").trim() as `0x${string}`;
/*
 * The fork starts at a live block, so scanning from genesis would chunk its
 * way through sixty million blocks before finding anything. Production reads
 * this from pool-config for the same reason.
 */
const FROM = BigInt(fs.readFileSync("/tmp/fork_block.txt", "utf8").trim());
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as const;
const RECIP = "0x00000000000000000000000000000000DeaDBeef" as const;

const chain = { id: 4663, name: "fork", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
const acct = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const wallet = createWalletClient({ account: acct, chain, transport: http(RPC) });
const key = keyFromSignature(keccak256(toHex("fork-swap-user")));

async function main() {
  const DEPOSIT = parseEther("0.05");
  console.log(`\n[1] shielding ${formatEther(DEPOSIT)} ETH`);
  let scan = await scanPool({ client: pub as never, address: POOL, deployBlock: FROM, key });
  let tx = await buildShieldedTx({ key, leaves: scan.leaves, inputs: [], depositAmount: DEPOSIT });
  let h = await wallet.writeContract({ address: POOL, abi: refractPoolAbi, functionName: "transact", args: [tx.proof, tx.args, tx.extData], value: DEPOSIT });
  if ((await pub.waitForTransactionReceipt({ hash: h })).status !== "success") throw new Error("deposit reverted");
  scan = await scanPool({ client: pub as never, address: POOL, deployBlock: FROM, key });
  console.log(`    shielded balance: ${formatEther(scan.balance)} ETH`);

  /* ---- quote the trade with the same engine the website uses ---- */
  const SPEND = parseEther("0.02");
  console.log(`\n[2] quoting ${formatEther(SPEND)} ETH -> USDG`);
  const q = await quote(zeroAddress, USDG, SPEND);
  const routes = (q.routes ?? []).filter((r) => BigInt(r.amountOut) > 0n)
    .sort((a, b) => (BigInt(b.amountOut) > BigInt(a.amountOut) ? 1 : -1));
  if (routes.length === 0) throw new Error("no route to USDG");
  const route = routes[0];
  console.log(`    best: ${route.label} (${route.protocol})  out ${formatUnits(BigInt(route.amountOut), 6)} USDG`);

  /* ---- build the router call and swap ---- */
  const minOut = applySlippage(BigInt(route.amountOut), 300);
  const call = buildShieldedSwapCall({ route, tokenOut: { address: USDG, native: false } as never, amountIn: SPEND, minOut });
  const picked = selectNotes(scan.notes, SPEND);
  if (!picked) throw new Error("note selection failed");
  // The proof must bind the trade, or the contract rejects it as BadProof.
  const swapData = { tokenOut: USDG as `0x${string}`, amountOutMin: minOut, recipient: RECIP as `0x${string}`, routerCalldata: call.calldata };
  tx = await buildShieldedTx({ key, leaves: scan.leaves, inputs: picked, withdrawAmount: SPEND, recipient: zeroAddress, swapData });

  const before = await pub.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [RECIP] });
  // Measured as a delta. The fork carries whatever earlier runs left behind,
  // so comparing against the deposit alone reports a false failure.
  const shieldedBefore = scan.balance;
  console.log(`\n[3] pool executes the swap through ${route.protocol}`);
  h = await wallet.writeContract({
    address: POOL, abi: refractPoolAbi, functionName: "swap",
    args: [tx.proof, tx.args, tx.extData, swapData],
    gas: 3_000_000n,
  });
  const r = await pub.waitForTransactionReceipt({ hash: h });
  console.log(`    tx status: ${r.status}  gas ${r.gasUsed}`);
  if (r.status !== "success") throw new Error("swap reverted");

  const got = (await pub.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [RECIP] })) - before;
  console.log(`    recipient received: ${formatUnits(got, 6)} USDG`);

  scan = await scanPool({ client: pub as never, address: POOL, deployBlock: FROM, key });
  console.log(`\n[4] change still shielded: ${formatEther(scan.balance)} ETH`);
  const ok = got >= minOut && scan.balance === shieldedBefore - SPEND;
  console.log(`\n${ok ? "SHIELDED SWAP WORKS" : "*** FAILED ***"}`);
  if (!ok) process.exit(1);
}
main().catch((e) => { console.error(e.shortMessage ?? e.message ?? e); process.exit(1); });
