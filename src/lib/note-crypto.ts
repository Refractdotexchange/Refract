/**
 * Finding your own notes again.
 *
 * Once a note carries a hidden amount, the chain no longer tells you what you
 * own. A commitment is a hash; nothing in it says whose it is or what it is
 * worth. So the note travels alongside its commitment, encrypted to a key only
 * the owner holds, and every wallet trial-decrypts the whole stream to work out
 * which ones are theirs.
 *
 * Asking a server "which notes are mine?" would be the simplest possible fix
 * and would also hand over the entire secret, so it is not an option. Trial
 * decryption is the cost of not having to trust anyone.
 *
 * The scheme is ECDH over secp256k1 to a fresh ephemeral key per note, then
 * AES-256-GCM. GCM's authentication tag doubles as the ownership test: if it
 * verifies, the note was encrypted to you, and if it does not, it belongs to
 * someone else and nothing is learned about it.
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { keccak256 } from "viem";

export type ShieldedKey = {
  /** Spending key. Never leaves the browser, never goes in a transaction. */
  privateKey: Uint8Array;
  /** Compressed public key, 33 bytes. Notes are encrypted to this. */
  publicKey: Uint8Array;
};

/** Plaintext contents of a note, before it becomes a commitment. */
export type NotePlain = {
  amount: bigint;
  nullifier: bigint;
  secret: bigint;
};

const N = secp256k1.CURVE.n;

/**
 * Derive the shielded key from a wallet signature.
 *
 * The user signs one fixed string and the key falls out of the signature, so
 * there is no second secret to write down and lose. Signing the same string on
 * the same wallet always regenerates the same key, which is what makes notes
 * recoverable on a new device.
 *
 * The message is deliberately explicit about what signing does. A signature
 * request that looks like noise is how people get drained.
 */
export const KEY_MESSAGE =
  "REFRACT shielded account\n\n" +
  "Signing this message derives the key that finds and spends your private notes.\n" +
  "It does not move any funds and costs nothing.\n\n" +
  "Only sign this on refract.exchange.";

export function keyFromSignature(signature: `0x${string}`): ShieldedKey {
  // Hashed rather than used raw: a signature is 65 bytes with structure, and
  // the low bits of r and s are not a uniform scalar.
  let scalar = BigInt(keccak256(signature)) % N;
  if (scalar === 0n) scalar = 1n;
  const privateKey = hexToBytes(scalar.toString(16).padStart(64, "0"));
  return { privateKey, publicKey: secp256k1.getPublicKey(privateKey, true) };
}

/* ------------------------------------------------------------------ codec */

const AMOUNT_BYTES = 32;
const NOTE_BYTES = 96; // amount ‖ nullifier ‖ secret

function encodeNote(note: NotePlain): Uint8Array {
  const out = new Uint8Array(NOTE_BYTES);
  out.set(bigintTo32(note.amount), 0);
  out.set(bigintTo32(note.nullifier), AMOUNT_BYTES);
  out.set(bigintTo32(note.secret), AMOUNT_BYTES * 2);
  return out;
}

function decodeNote(bytes: Uint8Array): NotePlain {
  return {
    amount: bytesToBigint(bytes.slice(0, 32)),
    nullifier: bytesToBigint(bytes.slice(32, 64)),
    secret: bytesToBigint(bytes.slice(64, 96)),
  };
}

/* ------------------------------------------------------------- encryption */

async function aesKey(shared: Uint8Array): Promise<CryptoKey> {
  // The shared point is not uniformly random, so it is hashed before use.
  const material = sha256(shared);
  return crypto.subtle.importKey("raw", material as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Encrypt a note to `recipientPublicKey`.
 *
 * Layout: ephemeral public key (33) ‖ iv (12) ‖ ciphertext+tag (112).
 * A fresh ephemeral key per note means two notes to the same owner share no
 * visible material, so the ciphertexts cannot be grouped by recipient.
 */
export async function encryptNote(
  note: NotePlain,
  recipientPublicKey: Uint8Array,
): Promise<`0x${string}`> {
  const ephemeral = secp256k1.utils.randomPrivateKey();
  const ephemeralPub = secp256k1.getPublicKey(ephemeral, true);
  const shared = secp256k1.getSharedSecret(ephemeral, recipientPublicKey, true);
  const key = await aesKey(shared);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encodeNote(note) as BufferSource),
  );

  const out = new Uint8Array(ephemeralPub.length + iv.length + ct.length);
  out.set(ephemeralPub, 0);
  out.set(iv, ephemeralPub.length);
  out.set(ct, ephemeralPub.length + iv.length);
  return bytesToHex(out);
}

/**
 * Try to decrypt one payload.
 *
 * Returns null whenever the note is not ours, which is the common case and not
 * an error: a wallet runs this against every note in the pool. Any malformed
 * input returns null too, because a hostile payload must not be able to stop a
 * scan partway and hide the notes that come after it.
 */
export async function tryDecryptNote(
  payload: `0x${string}` | Uint8Array,
  key: ShieldedKey,
): Promise<NotePlain | null> {
  try {
    const bytes = typeof payload === "string" ? hexToBytes(payload.slice(2)) : payload;
    if (bytes.length !== 33 + 12 + NOTE_BYTES + 16) return null;

    const ephemeralPub = bytes.slice(0, 33);
    const iv = bytes.slice(33, 45);
    const ct = bytes.slice(45);

    const shared = secp256k1.getSharedSecret(key.privateKey, ephemeralPub, true);
    const plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        await aesKey(shared),
        ct as BufferSource,
      ),
    );
    return decodeNote(plain);
  } catch {
    // Wrong recipient, or garbage. Either way it is not ours.
    return null;
  }
}

/* ---------------------------------------------------------------- helpers */

function bigintTo32(v: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = v;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

function bytesToBigint(b: Uint8Array): bigint {
  let out = 0n;
  for (const byte of b) out = (out << 8n) | BigInt(byte);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(b: Uint8Array): `0x${string}` {
  return `0x${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}`;
}
