/**
 * Client-side crypto for the shielded pool.
 *
 * Everything here runs in the browser and nothing leaves it. A note is the
 * user's only claim on their deposit: there is no operator to ask, no account
 * to recover, and no server that has a copy. Lose the note, lose the funds.
 * The UI has to say that clearly and this file is written on that assumption.
 */


/** BN254 scalar field. Every value fed to Poseidon must be below this. */
export const FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export type Note = {
  nullifier: bigint;
  secret: bigint;
  commitment: bigint;
  nullifierHash: bigint;
  /** The pool this note belongs to. A note is worthless against another pool. */
  pool: string;
};

type PoseidonFn = Awaited<ReturnType<typeof import("circomlibjs").buildPoseidon>>;
let poseidonPromise: Promise<PoseidonFn> | null = null;

/**
 * Poseidon is about a megabyte of WASM. Imported dynamically so the page
 * paints first and the crypto loads only when a note is actually needed,
 * rather than being paid for by everyone who visits.
 */
async function getPoseidon(): Promise<PoseidonFn> {
  if (!poseidonPromise) {
    poseidonPromise = import("circomlibjs").then((m) => m.buildPoseidon());
  }
  return poseidonPromise;
}

export async function poseidon(inputs: bigint[]): Promise<bigint> {
  const p = await getPoseidon();
  return BigInt(p.F.toString(p(inputs)));
}

/**
 * 31 bytes of CSPRNG output, which is always below the field size, so this
 * never needs rejection sampling or a modulo that would skew the distribution.
 *
 * Math.random would be catastrophic here: predictable randomness means anyone
 * can regenerate the note and spend it.
 */
function randomFieldElement(): bigint {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  let out = 0n;
  for (const b of bytes) out = (out << 8n) | BigInt(b);
  return out;
}

/** Create a fresh note. The commitment is what gets published on deposit. */
export async function createNote(pool: string): Promise<Note> {
  const nullifier = randomFieldElement();
  const secret = randomFieldElement();
  const [commitment, nullifierHash] = await Promise.all([
    poseidon([nullifier, secret]),
    poseidon([nullifier]),
  ]);
  return { nullifier, secret, commitment, nullifierHash, pool };
}

const NOTE_PREFIX = "refract";

/**
 * Serialise a note for backup. This string is bearer value: anyone holding it
 * can withdraw. It is deliberately one line so it survives being copied into a
 * password manager without being mangled.
 */
export function serialiseNote(note: Note): string {
  const n = note.nullifier.toString(16).padStart(64, "0");
  const s = note.secret.toString(16).padStart(64, "0");
  return `${NOTE_PREFIX}-${note.pool.toLowerCase()}-0x${n}${s}`;
}

export async function parseNote(raw: string): Promise<Note> {
  const trimmed = raw.trim();

  /*
   * Matched rather than split. Pool ids contain hyphens themselves
   * ("eth-0.001"), so splitting on "-" gives a variable number of parts and
   * rejects perfectly good notes. Anchoring the prefix and the 128 hex digits
   * lets the id in the middle be anything.
   */
  const match = /^refract-(.+)-0x([0-9a-fA-F]{128})$/.exec(trimmed);
  if (!match) {
    // Say which half is wrong, so a truncated paste is distinguishable from
    // something that was never a note.
    if (!trimmed.startsWith(`${NOTE_PREFIX}-`)) {
      throw new Error("That does not look like a REFRACT note.");
    }
    throw new Error("Note is malformed or truncated. Paste the whole thing.");
  }

  const [, pool, hex] = match;
  const nullifier = BigInt("0x" + hex.slice(0, 64));
  const secret = BigInt("0x" + hex.slice(64));
  if (nullifier >= FIELD_SIZE || secret >= FIELD_SIZE) {
    throw new Error("Note values are out of range.");
  }

  const [commitment, nullifierHash] = await Promise.all([
    poseidon([nullifier, secret]),
    poseidon([nullifier]),
  ]);
  return { nullifier, secret, commitment, nullifierHash, pool };
}

export const toHex32 = (v: bigint) => `0x${v.toString(16).padStart(64, "0")}` as `0x${string}`;
