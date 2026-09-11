/**
 * The whole browser stack against a real deployed pool.
 *
 * Uses the exact modules the UI will use: key derivation, note encryption,
 * the prover, and the scanner. Nothing is reimplemented for the test.
 */
import { createPublicClient, createWalletClient, http, keccak256, toHex, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { keyFromSignature } from "../src/lib/note-crypto";
import { buildShieldedTx, setProverArtifacts } from "../src/lib/prove-joinsplit";
import { scanPool, selectNotes } from "../src/lib/pool-notes";
import { refractPoolAbi } from "../src/lib/pool-abi-v2";
import fs from "node:fs";
import * as snarkjs from "snarkjs";

setProverArtifacts("public/zk/joinsplit.wasm", "public/zk/joinsplit.zkey", snarkjs as any);

const RPC = "http://localhost:8548";
const POOL = fs.readFileSync("/tmp/pool_addr.txt", "utf8").trim() as `0x${string}`;
const chain = { id: 31337, name: "anvil", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
const acct = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const wallet = createWalletClient({ account: acct, chain, transport: http(RPC) });

const key = keyFromSignature(keccak256(toHex("alice-wallet-signature")));
const RECIPIENT = "0x000000000000000000000000000000000000dEaD" as const;

const send = async (tx: any, value: bigint) => {
  const hash = await wallet.writeContract({
    address: POOL, abi: refractPoolAbi, functionName: "transact",
    args: [tx.proof, tx.args, tx.extData], value,
  });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error("tx reverted");
  return r;
};
const scan = () => scanPool({ client: pub as any, address: POOL, deployBlock: 0n, key });

async function main() {
  /* 1. deposit an arbitrary amount */
  const DEPOSIT = parseEther("3.7");
  console.log(`\n[1] depositing ${formatEther(DEPOSIT)} ETH`);
  let s = await scan();
  let tx = await buildShieldedTx({ key, leaves: s.leaves, inputs: [], depositAmount: DEPOSIT });
  await send(tx, DEPOSIT);
  console.log(`    pool balance on chain: ${formatEther(await pub.getBalance({ address: POOL }))} ETH`);

  /* 2. find it again from the chain alone */
  console.log(`\n[2] rescanning from chain, with only the key`);
  s = await scan();
  console.log(`    notes found  : ${s.notes.length}`);
  console.log(`    balance      : ${formatEther(s.balance)} ETH`);
  if (s.balance !== DEPOSIT) throw new Error("balance mismatch after deposit");

  /* 3. spend PART of it */
  const SPEND = parseEther("1.2");
  console.log(`\n[3] withdrawing ${formatEther(SPEND)} ETH to a fresh address`);
  const picked = selectNotes(s.notes, SPEND);
  if (!picked) throw new Error("note selection failed");
  const before = await pub.getBalance({ address: RECIPIENT });
  tx = await buildShieldedTx({ key, leaves: s.leaves, inputs: picked, withdrawAmount: SPEND, recipient: RECIPIENT });
  await send(tx, 0n);
  const got = (await pub.getBalance({ address: RECIPIENT })) - before;
  console.log(`    recipient received: ${formatEther(got)} ETH`);

  /* 4. the change is still ours, still hidden */
  console.log(`\n[4] rescanning`);
  s = await scan();
  console.log(`    balance      : ${formatEther(s.balance)} ETH`);
  console.log(`    pool holds   : ${formatEther(await pub.getBalance({ address: POOL }))} ETH`);

  /* 5. a second partial spend, from the change */
  const SPEND2 = parseEther("0.5");
  console.log(`\n[5] withdrawing another ${formatEther(SPEND2)} ETH from the change`);
  const picked2 = selectNotes(s.notes, SPEND2);
  if (!picked2) throw new Error("could not select from change");
  tx = await buildShieldedTx({ key, leaves: s.leaves, inputs: picked2, withdrawAmount: SPEND2, recipient: RECIPIENT });
  await send(tx, 0n);
  s = await scan();
  console.log(`    balance      : ${formatEther(s.balance)} ETH`);

  /* 6. a stranger's key must see nothing */
  const mallory = keyFromSignature(keccak256(toHex("mallory")));
  const theirs = await scanPool({ client: pub as any, address: POOL, deployBlock: 0n, key: mallory });
  console.log(`\n[6] stranger scanning the same pool`);
  console.log(`    notes visible to them: ${theirs.notes.length}, balance ${formatEther(theirs.balance)} ETH`);

  const pass = got === SPEND && s.balance === parseEther("2.0") && theirs.notes.length === 0;
  console.log(`\n${pass ? "ALL CHECKS PASSED" : "*** FAILURE ***"}`);
  if (!pass) process.exit(1);
}
main().catch(e => { console.error(e.message ?? e); process.exit(1); });
