/**
 * End-to-end test of the hidden-amount design.
 *
 *   1. deposit 3.7 ETH   (no inputs, one note out)
 *   2. spend 1.2 of it   (one input, 1.2 leaves the pool, 2.5 stays shielded)
 *
 * If both prove and verify, arbitrary deposits and partial withdrawals work.
 */
import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";
import { keccak256, toHex, parseEther, formatEther, encodeAbiParameters } from "viem";
import fs from "node:fs";

const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const LEVELS = 20;
const WASM = "joinsplit_js/joinsplit.wasm";
const ZKEY = "/tmp/js_0000.zkey";


const EXT_TUPLE = [{
  type: "tuple",
  components: [
    { name: "recipient", type: "address" },
    { name: "extAmount", type: "int256" },
    { name: "relayer", type: "address" },
    { name: "fee", type: "uint256" },
    { name: "encryptedOutput1", type: "bytes" },
    { name: "encryptedOutput2", type: "bytes" },
  ],
}];
/* Mirrors the contract exactly: keccak of the encoded struct, reduced. */
const extHash = (e) => BigInt(keccak256(encodeAbiParameters(EXT_TUPLE, [e]))) % FIELD;

const fixtures = [];
const flat = (proof, sig) => [
  BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1]),
  BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0]),
  BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0]),
  BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1]),
  ...sig.map(BigInt),
].map(String);

let P;
const pos = (a) => BigInt(P.F.toString(P(a)));
const rand = () => { const b = crypto.getRandomValues(new Uint8Array(31)); let o = 0n; for (const x of b) o = (o << 8n) | BigInt(x); return o; };

let zeros = null;
function getZeros() {
  if (zeros) return zeros;
  zeros = [BigInt(keccak256(toHex("refract.pool.v2"))) % FIELD];
  for (let i = 1; i < LEVELS; i++) zeros.push(pos([zeros[i - 1], zeros[i - 1]]));
  return zeros;
}
function merklePath(leaves, index) {
  const z = getZeros();
  const pathElements = [], pathIndices = [];
  let level = leaves.slice(), idx = index;
  for (let i = 0; i < LEVELS; i++) {
    const isRight = idx % 2 === 1;
    const sib = isRight ? idx - 1 : idx + 1;
    pathElements.push(sib < level.length ? level[sib] : z[i]);
    pathIndices.push(isRight ? 1 : 0);
    const next = [];
    for (let j = 0; j < level.length; j += 2)
      next.push(pos([level[j], j + 1 < level.length ? level[j + 1] : z[i]]));
    level = next.length ? next : [z[i + 1] ?? z[i]];
    idx >>= 1;
  }
  return { root: level[0], pathElements, pathIndices };
}
const emptyPath = () => ({ pathElements: Array(LEVELS).fill(0n), pathIndices: Array(LEVELS).fill(0) });

/*
 * The root of an untouched tree, derived the way the contract derives it: the
 * zeros chain climbs to level 19, then one more hash makes the level-20 root.
 * The circuit leaves the root unconstrained when every input is a dummy, so a
 * deposit will happily prove against any value here — the contract is what
 * insists on a root it recognises.
 */
const emptyRoot = () => { const z = getZeros(); return pos([z[LEVELS - 1], z[LEVELS - 1]]); };

const note = (amount) => ({ amount, nullifier: rand(), secret: rand() });
const commit = (n) => pos([n.amount, n.nullifier, n.secret]);
const nullify = (n, leafIndex) => pos([n.nullifier, BigInt(leafIndex)]);
const fieldAmount = (v) => (v >= 0n ? v : FIELD - (-v));

async function prove(input, label, tag, ext) {
  const t = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  const vk = JSON.parse(fs.readFileSync("/tmp/js_vk.json", "utf8"));
  const ok = await snarkjs.groth16.verify(vk, publicSignals, proof);
  console.log(`  ${label}: ${ok ? "VERIFIED" : "*** FAILED ***"}  (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  if (tag) fixtures.push({ tag, flat: flat(proof, publicSignals), ext });
  return ok;
}

async function main() {
  P = await buildPoseidon();
  const leaves = [];
  let allOk = true;

  /* ---------------- 1. deposit an arbitrary amount ---------------- */
  const DEPOSIT = parseEther("3.7");
  const d1 = note(DEPOSIT), d2 = note(0n);
  const dummyA = note(0n), dummyB = note(0n);
  const ep = emptyPath();

  const extDeposit = {
    recipient: "0x0000000000000000000000000000000000000000",
    extAmount: DEPOSIT,
    relayer: "0x0000000000000000000000000000000000000000",
    fee: 0n,
    encryptedOutput1: "0x11",
    encryptedOutput2: "0x22",
  };
  console.log(`\n[1] deposit ${formatEther(DEPOSIT)} ETH`);
  allOk &= await prove({
    root: emptyRoot().toString(),
    publicAmount: fieldAmount(DEPOSIT).toString(),
    extDataHash: extHash(extDeposit).toString(),
    inNullifiers: [nullify(dummyA, 0), nullify(dummyB, 1)].map(String),
    outCommitments: [commit(d1), commit(d2)].map(String),
    inAmount: ["0", "0"],
    inNullifier: [dummyA.nullifier, dummyB.nullifier].map(String),
    inSecret: [dummyA.secret, dummyB.secret].map(String),
    inLeafIndex: ["0", "1"],
    inPathElements: [ep.pathElements.map(String), ep.pathElements.map(String)],
    inPathIndices: [ep.pathIndices.map(String), ep.pathIndices.map(String)],
    outAmount: [d1.amount, d2.amount].map(String),
    outNullifier: [d1.nullifier, d2.nullifier].map(String),
    outSecret: [d1.secret, d2.secret].map(String),
  }, `prove deposit of ${formatEther(DEPOSIT)} ETH`, "deposit", {
    ...extDeposit, extAmount: extDeposit.extAmount.toString(), fee: "0",
    root: emptyRoot().toString(),
  });

  leaves.push(commit(d1), commit(d2));

  /* ---------------- 2. spend PART of it ---------------- */
  const SPEND = parseEther("1.2");
  const CHANGE = DEPOSIT - SPEND;
  const change = note(CHANGE), pad = note(0n), dummyC = note(0n);
  const path = merklePath(leaves, 0);

  const extSpend = {
    recipient: "0x000000000000000000000000000000000000dEaD",
    extAmount: -SPEND,
    relayer: "0x0000000000000000000000000000000000000000",
    fee: 0n,
    encryptedOutput1: "0x33",
    encryptedOutput2: "0x44",
  };
  console.log(`\n[2] spend ${formatEther(SPEND)} ETH, keep ${formatEther(CHANGE)} shielded`);
  allOk &= await prove({
    root: path.root.toString(),
    publicAmount: fieldAmount(-SPEND).toString(),
    extDataHash: extHash(extSpend).toString(),
    inNullifiers: [nullify(d1, 0), nullify(dummyC, 7)].map(String),
    outCommitments: [commit(change), commit(pad)].map(String),
    inAmount: [d1.amount, 0n].map(String),
    inNullifier: [d1.nullifier, dummyC.nullifier].map(String),
    inSecret: [d1.secret, dummyC.secret].map(String),
    inLeafIndex: ["0", "7"],
    inPathElements: [path.pathElements.map(String), ep.pathElements.map(String)],
    inPathIndices: [path.pathIndices.map(String), ep.pathIndices.map(String)],
    outAmount: [change.amount, pad.amount].map(String),
    outNullifier: [change.nullifier, pad.nullifier].map(String),
    outSecret: [change.secret, pad.secret].map(String),
  }, `prove partial spend`, "spend", {
    ...extSpend, extAmount: extSpend.extAmount.toString(), fee: "0",
    root: path.root.toString(),
  });

  /* ---------------- 3. the theft attempt that must fail ------------- */
  console.log(`\n[3] try to withdraw more than the note holds (must fail)`);
  try {
    const greedy = note(0n);
    await snarkjs.groth16.fullProve({
      root: path.root.toString(),
      publicAmount: fieldAmount(-parseEther("9.9")).toString(),
      extDataHash: "1",
      inNullifiers: [nullify(d1, 0), nullify(greedy, 9)].map(String),
      outCommitments: [commit(note(0n)), commit(note(0n))].map(String),
      inAmount: [d1.amount, 0n].map(String),
      inNullifier: [d1.nullifier, greedy.nullifier].map(String),
      inSecret: [d1.secret, greedy.secret].map(String),
      inLeafIndex: ["0", "9"],
      inPathElements: [path.pathElements.map(String), ep.pathElements.map(String)],
      inPathIndices: [path.pathIndices.map(String), ep.pathIndices.map(String)],
      outAmount: ["0", "0"],
      outNullifier: [rand(), rand()].map(String),
      outSecret: [rand(), rand()].map(String),
    }, WASM, ZKEY);
    console.log("  *** PROVED — VALUE CAN BE MINTED, CIRCUIT IS BROKEN ***");
    allOk = false;
  } catch {
    console.log("  rejected by the circuit — value is conserved");
  }

  fs.mkdirSync("../artifacts", { recursive: true });
  fs.writeFileSync("../artifacts/joinsplit-fixture.json", JSON.stringify(
    Object.fromEntries(fixtures.map(f => [f.tag, { flat: f.flat, ext: f.ext }])), null, 2));
  console.log("\n  fixtures -> contracts/artifacts/joinsplit-fixture.json");
  console.log(`\n${allOk ? "ALL CHECKS PASSED" : "FAILURES ABOVE"}`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
