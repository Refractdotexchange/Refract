/**
 * Building a shielded transaction in the browser.
 *
 * Deposit, withdraw, partial spend and private transfer are one operation. The
 * only thing that separates them is how much value crosses the boundary and
 * who the outputs belong to, so they all come through here.
 *
 * Nothing here is sent anywhere. The amounts, the secrets and the Merkle path
 * all feed the witness locally; what leaves the page is a proof, two
 * commitments, two nullifiers and a public amount.
 */

import { encodeAbiParameters, keccak256, toHex, type Address } from "viem";
import { poseidon, FIELD_SIZE } from "./shielded";
import { encryptNote, type NotePlain, type ShieldedKey } from "./note-crypto";
import { noteCommitment } from "./pool-notes";
import type { OwnedNote } from "./pool-notes";

let WASM_URL = "/zk/joinsplit.wasm";
let ZKEY_URL = "/zk/joinsplit.zkey";

type Snarkjs = {
  groth16: {
    fullProve: (
      input: Record<string, unknown>,
      wasm: string,
      zkey: string,
    ) => Promise<{ proof: { pi_a: string[]; pi_b: string[][]; pi_c: string[] } }>;
  };
};

/**
 * snarkjs is about 1.5MB, so it is loaded only when someone actually proves
 * something rather than by everyone who opens the page.
 */
let loadSnarkjs: () => Promise<Snarkjs> = () => import("snarkjs") as unknown as Promise<Snarkjs>;

/**
 * Point the prover at local files, and optionally at an already-loaded snarkjs.
 *
 * Only used by the integration test, which drives this exact code path against
 * a real contract. Testing a reimplementation of the prover would test the
 * reimplementation instead of the thing that ships.
 */
export function setProverArtifacts(wasm: string, zkey: string, snarkjs?: Snarkjs) {
  WASM_URL = wasm;
  ZKEY_URL = zkey;
  if (snarkjs) loadSnarkjs = async () => snarkjs;
}

export const LEVELS = 20;
const ZERO_SEED = "refract.pool.v2";

/* --------------------------------------------------------------- the tree */

let zerosCache: bigint[] | null = null;

async function getZeros(): Promise<bigint[]> {
  if (zerosCache) return zerosCache;
  const zeros: bigint[] = [BigInt(keccak256(toHex(ZERO_SEED))) % FIELD_SIZE];
  for (let i = 1; i < LEVELS; i++) zeros.push(await poseidon([zeros[i - 1], zeros[i - 1]]));
  zerosCache = zeros;
  return zeros;
}

/** Root of a tree nobody has touched, matching the contract's constructor. */
export async function emptyRoot(): Promise<bigint> {
  const z = await getZeros();
  return poseidon([z[LEVELS - 1], z[LEVELS - 1]]);
}

async function merklePath(leaves: bigint[], index: number) {
  const z = await getZeros();
  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];
  let level = leaves.slice();
  let idx = index;
  for (let i = 0; i < LEVELS; i++) {
    const isRight = idx % 2 === 1;
    const sib = isRight ? idx - 1 : idx + 1;
    pathElements.push(sib < level.length ? level[sib] : z[i]);
    pathIndices.push(isRight ? 1 : 0);
    const next: bigint[] = [];
    for (let j = 0; j < level.length; j += 2) {
      next.push(await poseidon([level[j], j + 1 < level.length ? level[j + 1] : z[i]]));
    }
    level = next.length > 0 ? next : [z[i + 1] ?? z[i]];
    idx = Math.floor(idx / 2);
  }
  return { root: level[0], pathElements, pathIndices };
}

/* ------------------------------------------------------------- ext data */

const EXT_TUPLE = [
  {
    type: "tuple",
    components: [
      { name: "recipient", type: "address" },
      { name: "extAmount", type: "int256" },
      { name: "relayer", type: "address" },
      { name: "fee", type: "uint256" },
      { name: "encryptedOutput1", type: "bytes" },
      { name: "encryptedOutput2", type: "bytes" },
    ],
  },
] as const;

export type ExtData = {
  recipient: Address;
  extAmount: bigint;
  relayer: Address;
  fee: bigint;
  encryptedOutput1: `0x${string}`;
  encryptedOutput2: `0x${string}`;
};

/**
 * Hash of everything the circuit does not reason about but the proof must
 * still pin down. Mirrors the contract byte for byte; if the two ever disagree
 * every transaction reverts, which is the safe direction for them to fail.
 */
export function extDataHash(ext: ExtData): bigint {
  return BigInt(keccak256(encodeAbiParameters(EXT_TUPLE, [ext]))) % FIELD_SIZE;
}

/* ------------------------------------------------------------------ proof */

const randomField = (): bigint => {
  const b = crypto.getRandomValues(new Uint8Array(31));
  let out = 0n;
  for (const x of b) out = (out << 8n) | BigInt(x);
  return out;
};

/** A fresh note for `amount`, owned by whoever holds the matching key. */
export const makeNote = (amount: bigint): NotePlain => ({
  amount,
  nullifier: randomField(),
  secret: randomField(),
});

export type ShieldedTx = {
  proof: { a: readonly [bigint, bigint]; b: readonly [readonly [bigint, bigint], readonly [bigint, bigint]]; c: readonly [bigint, bigint] };
  args: {
    root: `0x${string}`;
    publicAmount: bigint;
    extDataHash: `0x${string}`;
    inNullifiers: readonly [`0x${string}`, `0x${string}`];
    outCommitments: readonly [`0x${string}`, `0x${string}`];
  };
  extData: ExtData;
  /** Notes the caller now owns. Worth keeping if a scan is not run after. */
  outputs: NotePlain[];
};

const hex32 = (v: bigint) => `0x${v.toString(16).padStart(64, "0")}` as `0x${string}`;

/**
 * Assemble and prove one shielded transaction.
 *
 * `inputs` are notes being spent, zero to two of them. `outAmount` is what
 * leaves the pool in the clear, zero for a deposit. Anything left over becomes
 * a change note encrypted back to the owner, which is what makes a partial
 * spend possible at all.
 */
export async function buildShieldedTx({
  key,
  leaves,
  inputs,
  depositAmount = 0n,
  withdrawAmount = 0n,
  recipient = "0x0000000000000000000000000000000000000000",
  relayer = "0x0000000000000000000000000000000000000000",
  fee = 0n,
  onProgress,
}: {
  key: ShieldedKey;
  leaves: bigint[];
  inputs: OwnedNote[];
  depositAmount?: bigint;
  withdrawAmount?: bigint;
  recipient?: Address;
  relayer?: Address;
  fee?: bigint;
  onProgress?: (stage: string) => void;
}): Promise<ShieldedTx> {
  if (inputs.length > 2) throw new Error("At most two notes can be spent at once.");

  const sumIn = inputs.reduce((s, n) => s + n.amount, 0n);
  const change = sumIn + depositAmount - withdrawAmount - fee;
  if (change < 0n) throw new Error("Those notes do not cover that amount.");

  onProgress?.("Preparing notes");

  // Output one: the change, kept shielded. Output two pads the shape so every
  // transaction looks the same regardless of how many notes it really used.
  const outNotes = [makeNote(change), makeNote(0n)];

  // Inputs are padded with zero-value dummies for the same reason. The circuit
  // skips the tree check for these, so they need no path.
  const dummies: OwnedNote[] = [];
  while (inputs.length + dummies.length < 2) {
    const d = makeNote(0n);
    dummies.push({ ...d, leafIndex: 0, commitment: 0n, nullifierHash: 0n, spent: false });
  }
  const allIn = [...inputs, ...dummies];

  onProgress?.("Rebuilding the tree");
  const paths = await Promise.all(
    allIn.map(async (n, i) =>
      i < inputs.length
        ? await merklePath(leaves, n.leafIndex)
        : { root: 0n, pathElements: Array(LEVELS).fill(0n), pathIndices: Array(LEVELS).fill(0) },
    ),
  );
  const root = inputs.length > 0 ? paths[0].root : await emptyRoot();

  // Dummies still publish a nullifier, so they must differ from each other and
  // from anything real. A random nullifier makes a collision impossible in
  // practice, and the contract rejects a duplicate outright.
  const nullifiers = await Promise.all(
    allIn.map((n, i) =>
      i < inputs.length ? Promise.resolve(n.nullifierHash) : poseidon([n.nullifier, BigInt(i)]),
    ),
  );

  const commitments = await Promise.all(outNotes.map(noteCommitment));

  onProgress?.("Encrypting your change");
  const ext: ExtData = {
    recipient,
    extAmount: depositAmount - withdrawAmount,
    relayer,
    fee,
    encryptedOutput1: await encryptNote(outNotes[0], key.publicKey),
    encryptedOutput2: await encryptNote(outNotes[1], key.publicKey),
  };

  const net = ext.extAmount - fee;
  const publicAmount = net >= 0n ? net : FIELD_SIZE - -net;

  onProgress?.("Generating the proof");
  const snarkjs = await loadSnarkjs();
  const { proof } = (await snarkjs.groth16.fullProve(
    {
      root: root.toString(),
      publicAmount: publicAmount.toString(),
      extDataHash: extDataHash(ext).toString(),
      inNullifiers: nullifiers.map(String),
      outCommitments: commitments.map(String),
      inAmount: allIn.map((n) => n.amount.toString()),
      inNullifier: allIn.map((n) => n.nullifier.toString()),
      inSecret: allIn.map((n) => n.secret.toString()),
      inLeafIndex: allIn.map((n, i) => (i < inputs.length ? n.leafIndex.toString() : String(i))),
      inPathElements: paths.map((p) => p.pathElements.map(String)),
      inPathIndices: paths.map((p) => p.pathIndices.map(String)),
      outAmount: outNotes.map((n) => n.amount.toString()),
      outNullifier: outNotes.map((n) => n.nullifier.toString()),
      outSecret: outNotes.map((n) => n.secret.toString()),
    },
    WASM_URL,
    ZKEY_URL,
  ));

  onProgress?.("Proof ready");
  return {
    // snarkjs emits pi_b with its coordinate pairs swapped relative to what the
    // Solidity verifier expects.
    proof: {
      a: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
      b: [
        [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
        [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
      ],
      c: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
    },
    args: {
      root: hex32(root),
      publicAmount,
      extDataHash: hex32(extDataHash(ext)),
      inNullifiers: [hex32(nullifiers[0]), hex32(nullifiers[1])],
      outCommitments: [hex32(commitments[0]), hex32(commitments[1])],
    },
    extData: ext,
    outputs: outNotes,
  };
}
