"use client";

/**
 * The shielded account: one signature, held in memory only.
 *
 * The key derived here can spend every note you own, so it is never written to
 * disk, localStorage or sessionStorage. A refresh asks for the signature
 * again. That is a small cost next to a spending key sitting in browser
 * storage where any script on the page could reach it.
 */

import { useCallback, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { KEY_MESSAGE, keyFromSignature, type ShieldedKey } from "./note-crypto";

export function useShieldedAccount() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [key, setKey] = useState<ShieldedKey | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whose key this is. Switching wallets must not leave the previous account's
  // key in place, or the balance shown belongs to somebody else.
  const owner = useRef<string | null>(null);
  if (address && owner.current && owner.current !== address && key) {
    owner.current = null;
    setKey(null);
  }

  const unlock = useCallback(async () => {
    setError(null);
    setUnlocking(true);
    try {
      const signature = await signMessageAsync({ message: KEY_MESSAGE });
      owner.current = address ?? null;
      setKey(keyFromSignature(signature));
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (!/rejected|denied/i.test(msg)) setError(msg.slice(0, 140));
    } finally {
      setUnlocking(false);
    }
  }, [address, signMessageAsync]);

  const lock = useCallback(() => {
    owner.current = null;
    setKey(null);
  }, []);

  return { key, unlock, lock, unlocking, error };
}
