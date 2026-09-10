/**
 * Client-side crypto for the shielded pool.
 *
 * Everything here runs in the browser and nothing leaves it. A note is the
 * user's only claim on their deposit: there is no operator to ask, no account
 * to recover, and no server that has a copy. Lose the note, lose the funds.
 * The UI has to say that clearly and this file is written on that assumption.
 */

import { buildPoseidon } from "circomlibjs";

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

let poseidonPromise: ReturnType<typeof buildPoseidon> | null = null;

/** Poseidon is ~1MB of WASM, so it is built once and shared. */
async function getPoseidon() {
  if (!poseidonPromise) poseidonPromise = buildPoseidon();
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
  const parts = trimmed.split("-");
  if (parts.length !== 3 || parts[0] !== NOTE_PREFIX) {
    throw new Error("That does not look like a REFRACT note.");
  }
  const pool = parts[1];
  const hex = parts[2].startsWith("0x") ? parts[2].slice(2) : parts[2];
  if (hex.length !== 128 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("Note is malformed or truncated.");
  }
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
