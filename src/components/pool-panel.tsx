"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { formatEther, parseEther, isAddress, type Address } from "viem";
import { refractPoolAbi } from "@/lib/pool-abi-v2";
import { REFRACT_POOL, isPoolLive } from "@/lib/pool-config";
import { scanPool, selectNotes, type PoolScan } from "@/lib/pool-notes";
import { buildShieldedTx } from "@/lib/prove-joinsplit";
import { useShieldedAccount } from "@/lib/use-shielded-account";
import { REQUIRED_CHAIN_ID, explainRevert, isUserRejection } from "@/lib/tx-guard";
import { txUrl } from "@/lib/chain";
import { useToast } from "./toast";

type Tab = "deposit" | "withdraw";

/** Proving runs the pairing precompiles, which wallets estimate badly. */
const TRANSACT_GAS = 2_000_000n;

export function PoolPanel() {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { push } = useToast();
  const { key, unlock, lock, unlocking, error: keyError } = useShieldedAccount();

  const [tab, setTab] = useState<Tab>("deposit");
  const [scan, setScan] = useState<PoolScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [error, setError] = useState<string | null>(null);

  const live = isPoolLive();

  const refresh = useCallback(async () => {
    if (!key || !publicClient || !REFRACT_POOL.address) return;
    setScanning(true);
    try {
      setScan(
        await scanPool({
          client: publicClient,
          address: REFRACT_POOL.address,
          deployBlock: REFRACT_POOL.deployBlock,
          key,
          onProgress: setStage,
        }),
      );
    } catch (e) {
      setError(String((e as Error).message ?? e).slice(0, 160));
    } finally {
      setScanning(false);
      setStage(null);
    }
  }, [key, publicClient]);

  useEffect(() => {
    if (key) void refresh();
  }, [key, refresh]);

  let parsed: bigint | null = null;
  try {
    parsed = amount.trim() ? parseEther(amount.trim()) : null;
  } catch {
    parsed = null;
  }

  const balance = scan?.balance ?? 0n;
  const enough = tab === "deposit" || (parsed !== null && parsed <= balance);
  const recipientOk = tab === "deposit" || isAddress(recipient.trim());
  const canSubmit =
    live && key && parsed !== null && parsed > 0n && enough && recipientOk && !stage && !scanning;

  async function submit() {
    if (!key || !publicClient || !address || parsed === null || !REFRACT_POOL.address) return;
    setError(null);
    try {
      if (chainId !== REQUIRED_CHAIN_ID) {
        setStage("Switching network");
        await switchChainAsync({ chainId: REQUIRED_CHAIN_ID });
      }

      // Re-read rather than trusting the balance on screen. Someone else
      // depositing moves the root, and a proof against a forgotten root is
      // rejected on-chain for reasons the user cannot see.
      setStage("Reading the pool");
      const fresh = await scanPool({
        client: publicClient,
        address: REFRACT_POOL.address,
        deployBlock: REFRACT_POOL.deployBlock,
        key,
        onProgress: setStage,
      });
      setScan(fresh);

      const depositing = tab === "deposit";
      let inputs: PoolScan["notes"] = [];
      if (!depositing) {
        const picked = selectNotes(fresh.notes, parsed);
        if (!picked) {
          throw new Error(
            "No combination of your notes covers that amount. A spend can draw on two notes at once, so try a smaller amount.",
          );
        }
        inputs = picked;
      }

      const tx = await buildShieldedTx({
        key,
        leaves: fresh.leaves,
        inputs,
        depositAmount: depositing ? parsed : 0n,
        withdrawAmount: depositing ? 0n : parsed,
        recipient: depositing ? "0x0000000000000000000000000000000000000000" : (recipient.trim() as Address),
        onProgress: setStage,
      });

      const args = [tx.proof, tx.args, tx.extData] as const;

      // Simulated against our own RPC first, so a rejection arrives decoded
      // rather than as whatever the wallet's node says.
      setStage("Checking the transaction");
      await publicClient.simulateContract({
        address: REFRACT_POOL.address,
        abi: refractPoolAbi,
        functionName: "transact",
        args,
        account: address,
        value: depositing ? parsed : 0n,
      });

      setStage("Waiting for your wallet");
      const hash = await writeContractAsync({
        chainId: REQUIRED_CHAIN_ID,
        address: REFRACT_POOL.address,
        abi: refractPoolAbi,
        functionName: "transact",
        args,
        value: depositing ? parsed : 0n,
        gas: TRANSACT_GAS,
      });

      push({
        tone: "info",
        title: depositing ? "Deposit submitted" : "Withdrawal submitted",
        href: { label: "View transaction", url: txUrl(hash) },
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "success") {
        push({
          tone: "success",
          title: depositing ? "Shielded" : "Withdrawn",
          body: depositing
            ? `${formatEther(parsed)} ETH is now private. Your change is recovered from this wallet's signature.`
            : `${formatEther(parsed)} ETH sent. The rest stays shielded.`,
          href: { label: "View transaction", url: txUrl(hash) },
        });
        setAmount("");
        await refresh();
      } else {
        push({ tone: "error", title: "Transaction reverted", body: "Nothing moved." });
      }
    } catch (e) {
      const rejected = isUserRejection(e);
      setError(rejected ? null : explainRevert(e, "The transaction did not go through."));
      if (rejected) push({ tone: "info", title: "Cancelled in wallet", body: "Nothing moved." });
    } finally {
      setStage(null);
    }
  }

  /* ------------------------------------------------------------------ gates */

  if (!live) {
    return (
      <div className="panel panel-lit" style={{ padding: 22 }}>
        <div className="kicker" style={{ marginBottom: 10 }}>Not deployed yet</div>
        <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.6 }}>
          The pool goes live on 4663 shortly. Nothing here can take funds until it does.
        </p>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="panel panel-lit" style={{ padding: 22 }}>
        <div className="kicker" style={{ marginBottom: 10 }}>Shielded balance</div>
        <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.6 }}>
          Connect a wallet to begin. Your balance is reconstructed in this browser
          from a signature, never fetched from a server.
        </p>
      </div>
    );
  }

  if (!key) {
    return (
      <div className="panel panel-lit" style={{ padding: 22 }}>
        <div className="kicker" style={{ marginBottom: 12 }}>Unlock your shielded account</div>
        <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.6, marginBottom: 18 }}>
          Sign one message to derive the key that finds and spends your private
          notes. It moves nothing and costs nothing. The key is held in this tab
          only, never stored, so a refresh asks again.
        </p>
        <button className="btn btn-primary btn-lg" onClick={unlock} disabled={unlocking}>
          {unlocking && <span className="spinner" />}
          {unlocking ? "Check your wallet" : "Sign to unlock"}
        </button>
        {keyError && (
          <p style={{ color: "var(--ember)", fontSize: 12.5, marginTop: 12 }}>{keyError}</p>
        )}
      </div>
    );
  }

  /* ----------------------------------------------------------------- panel */

  return (
    <div className="panel panel-lit" style={{ padding: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div className="kicker">Shielded balance</div>
        <button
          className="btn"
          style={{ fontSize: 11.5, padding: "5px 11px" }}
          onClick={lock}
        >
          Lock
        </button>
      </div>

      <div
        className="font-display mono"
        style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-0.03em", margin: "10px 0 4px" }}
      >
        {scanning && !scan ? (
          <span className="skeleton" style={{ display: "block", width: 190, height: 40 }} />
        ) : (
          `${formatEther(balance)} ETH`
        )}
      </div>
      <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginBottom: 18 }}>
        {scanning
          ? (stage ?? "Scanning")
          : `${scan?.notes.filter((n) => !n.spent).length ?? 0} note(s) · rebuilt in this browser`}
      </div>

      <div className="panel" style={{ padding: 6, display: "flex", gap: 6, marginBottom: 16 }}>
        {(["deposit", "withdraw"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(null); }}
            className="btn"
            style={{
              flex: 1,
              border: 0,
              background: tab === t ? "var(--surface-2)" : "transparent",
              color: tab === t ? "var(--text)" : "var(--muted)",
              fontWeight: tab === t ? 650 : 500,
              textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <label className="kicker" style={{ display: "block", marginBottom: 7 }}>
        Amount in ETH
      </label>
      <input
        className="mono"
        inputMode="decimal"
        placeholder="0.0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{
          width: "100%", padding: "13px 15px", borderRadius: 12, fontSize: 16,
          background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text)",
        }}
      />
      {tab === "withdraw" && (
        <button
          className="btn"
          style={{ fontSize: 11.5, padding: "5px 11px", marginTop: 8 }}
          onClick={() => setAmount(formatEther(balance))}
        >
          Max
        </button>
      )}

      {tab === "withdraw" && (
        <>
          <label className="kicker" style={{ display: "block", margin: "16px 0 7px" }}>
            Send to
          </label>
          <input
            className="mono"
            placeholder="0x..."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            style={{
              width: "100%", padding: "13px 15px", borderRadius: 12, fontSize: 13.5,
              background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text)",
            }}
          />
          <p className="mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 8, lineHeight: 1.55 }}>
            Use an address with no history. Withdrawing to the wallet you
            deposited from links the two and undoes the privacy.
          </p>
        </>
      )}

      {parsed !== null && !enough && (
        <p style={{ color: "var(--ember)", fontSize: 12.5, marginTop: 12 }}>
          That is more than your shielded balance.
        </p>
      )}

      <button
        className="btn btn-primary btn-lg"
        style={{ marginTop: 18 }}
        disabled={!canSubmit}
        onClick={submit}
      >
        {stage && <span className="spinner" />}
        {stage
          ? stage
          : tab === "deposit"
            ? "Shield this amount"
            : "Prove and withdraw"}
      </button>

      {error && (
        <p style={{ color: "var(--ember)", fontSize: 12.5, marginTop: 12, lineHeight: 1.55 }}>{error}</p>
      )}

      <p className="mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 14, lineHeight: 1.6 }}>
        Proving runs entirely in your browser and takes a few seconds. Any
        amount you do not spend comes back as a new hidden note.
      </p>
    </div>
  );
}
