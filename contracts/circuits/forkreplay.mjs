/**
 * Replays the browser's exact withdrawal path against a fork of chain 4663.
 *
 * Uses a note this script generates, never the user's: the point is to
 * exercise the code path, and a note is bearer value.
 */
import { createWalletClient, createPublicClient, http, keccak256, toHex, parseAbi, decodeErrorResult } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";
import fs from "node:fs";

const RPC = "http://localhost:8547";
const LIVE_POOL = "0xFAE178987b368e4C76A71b83E602C5AEC64d1220";
const FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const LEVELS = 20;

const chain = { id: 4663, name: "fork", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
// anvil default account #0
const acct = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const wallet = createWalletClient({ account: acct, chain, transport: http(RPC) });

let P;
const poseidon = (ins) => BigInt(P.F.toString(P(ins)));
const toHex32 = (v) => `0x${v.toString(16).padStart(64, "0")}`;

// ---- merkle.ts, transcribed verbatim ------------------------------------
let zerosCache = null;
function getZeros() {
  if (zerosCache) return zerosCache;
  const zeros = [BigInt(keccak256(toHex("refract.shielded.v1"))) % FIELD_SIZE];
  for (let i = 1; i < LEVELS; i++) zeros.push(poseidon([zeros[i - 1], zeros[i - 1]]));
  zerosCache = zeros;
  return zeros;
}
function buildMerkleProof(leaves, index) {
  const zeros = getZeros();
  const pathElements = [], pathIndices = [];
  let level = leaves.slice(), idx = index;
  for (let i = 0; i < LEVELS; i++) {
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    const sibling = siblingIdx < level.length ? level[siblingIdx] : zeros[i];
    pathElements.push(sibling);
    pathIndices.push(isRight ? 1 : 0);
    const next = [];
    for (let j = 0; j < level.length; j += 2) {
      const left = level[j];
      const right = j + 1 < level.length ? level[j + 1] : zeros[i];
      next.push(poseidon([left, right]));
    }
    level = next.length > 0 ? next : [zeros[i + 1] ?? zeros[i]];
    idx = Math.floor(idx / 2);
  }
  return { root: level[0], pathElements, pathIndices };
}

const POOL_ABI = parseAbi([
  "function deposit(bytes32 commitment) external payable",
  "function withdraw(uint256[2] a, uint256[2][2] b, uint256[2] c, bytes32 root, bytes32 nullifierHash, address recipient, address relayer, uint256 fee) external",
  "function getLastRoot() view returns (bytes32)",
  "function isKnownRoot(bytes32) view returns (bool)",
  "function nextIndex() view returns (uint32)",
  "event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)",
  "error UnknownRoot()", "error BadProof()", "error NullifierUsed()",
  "error FeeTooHigh()", "error NotInField()", "error TransferFailed()",
  "error CommitmentUsed()", "error WrongValue()", "error TreeFull()",
]);

async function main() {
  P = await buildPoseidon();

  // ---- 1. does merkle.ts reproduce the LIVE root from the user's leaf? ----
  const logs = await pub.getContractEvents({
    address: LIVE_POOL, abi: POOL_ABI, eventName: "Deposit",
    fromBlock: 59512541n, toBlock: "latest",
  });
  const leaves = logs
    .sort((a, b) => a.args.leafIndex - b.args.leafIndex)
    .map((l) => BigInt(l.args.commitment));
  console.log(`\n[1] live pool has ${leaves.length} leaf/leaves`);
  const liveRoot = buildMerkleProof(leaves, 0).root;
  const chainRoot = await pub.readContract({ address: LIVE_POOL, abi: POOL_ABI, functionName: "getLastRoot" });
  console.log(`    merkle.ts root : ${toHex32(liveRoot)}`);
  console.log(`    contract root  : ${chainRoot}`);
  console.log(`    ${toHex32(liveRoot) === chainRoot ? "MATCH — tree logic is correct" : "*** MISMATCH — tree logic is wrong ***"}`);

  // ---- 2. full round trip with our own note, on the fork -----------------
  const rand = () => { const b = crypto.getRandomValues(new Uint8Array(31)); let o = 0n; for (const x of b) o = (o << 8n) | BigInt(x); return o; };
  const nullifier = rand(), secret = rand();
  const commitment = poseidon([nullifier, secret]);
  const nullifierHash = poseidon([nullifier]);

  await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({
    address: LIVE_POOL, abi: POOL_ABI, functionName: "deposit",
    args: [toHex32(commitment)], value: 1000000000000000n }) });
  const myIndex = leaves.length;
  leaves.push(commitment);
  console.log(`\n[2] deposited our own note at leaf ${myIndex}`);

  const { root, pathElements, pathIndices } = buildMerkleProof(leaves, myIndex);
  const known = await pub.readContract({ address: LIVE_POOL, abi: POOL_ABI, functionName: "isKnownRoot", args: [toHex32(root)] });
  console.log(`    isKnownRoot(our root) = ${known}`);

  const recipient = "0x000000000000000000000000000000000000dEaD";
  const relayer = "0x0000000000000000000000000000000000000000";
  const input = {
    root: root.toString(), nullifierHash: nullifierHash.toString(),
    recipient: BigInt(recipient).toString(), relayer: BigInt(relayer).toString(),
    fee: "0", refund: "0",
    nullifier: nullifier.toString(), secret: secret.toString(),
    pathElements: pathElements.map(String), pathIndices: pathIndices.map(String),
  };
  console.log("    generating proof...");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input, "withdraw_js/withdraw.wasm", "withdraw_final.zkey");

  const vk = JSON.parse(fs.readFileSync("verification_key.json", "utf8"));
  console.log(`    snarkjs local verify: ${await snarkjs.groth16.verify(vk, publicSignals, proof)}`);

  const args = [
    [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    [[BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
     [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])]],
    [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
    toHex32(root), toHex32(nullifierHash), recipient, relayer, 0n,
  ];

  console.log("\n[3] calling withdraw on the fork...");
  try {
    await pub.simulateContract({ address: LIVE_POOL, abi: POOL_ABI, functionName: "withdraw", args, account: acct });
    console.log("    SIMULATION PASSED");
    const h = await wallet.writeContract({ address: LIVE_POOL, abi: POOL_ABI, functionName: "withdraw", args });
    const r = await pub.waitForTransactionReceipt({ hash: h });
    console.log(`    tx status: ${r.status}`);
    console.log(`    dead balance: ${await pub.getBalance({ address: recipient })}`);
  } catch (e) {
    console.log("    *** REVERTED ***");
    const name = e?.cause?.data?.errorName ?? e?.cause?.cause?.data?.errorName;
    console.log(`    decoded error: ${name ?? "(undecoded)"}`);
    console.log((e.shortMessage ?? e.message ?? "").slice(0, 600));
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
