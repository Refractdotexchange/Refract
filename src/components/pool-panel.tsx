"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { formatEther, formatUnits, parseEther, isAddress, zeroAddress, type Address } from "viem";
import { refractPoolAbi } from "@/lib/pool-abi-v2";
import { REFRACT_POOL, isPoolLive } from "@/lib/pool-config";
import { scanPool, selectNotes, type PoolScan } from "@/lib/pool-notes";
import { buildShieldedTx, type SwapData as SwapDataT } from "@/lib/prove-joinsplit";
import { buildRoutedSwapCall } from "@/lib/shielded-swap";
import { applySlippage } from "@/lib/swap";
import type { Route } from "@/lib/quote";
import { useShieldedAccount } from "@/lib/use-shielded-account";
import { REQUIRED_CHAIN_ID, explainRevert, isUserRejection } from "@/lib/tx-guard";
import { txUrl } from "@/lib/chain";
import { useToast } from "./toast";

type Tab = "deposit" | "withdraw" | "swap";

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
  const [tokenOut, setTokenOut] = useState("");
  const [route, setRoute] = useState<Route | null>(null);
  const [tokenMeta, setTokenMeta] = useState<{ symbol: string; decimals: number } | null>(null);
  const [quoting, setQuoting] = useState(false);

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

  /*
   * Quotes come from the same engine the public swap page uses, so a shielded
   * trade is priced identically to an open one. Only the execution differs.
   */
  useEffect(() => {
    if (tab !== "swap" || !isAddress(tokenOut.trim())) {
      setRoute(null);
      return;
    }
    let amt: bigint;
    try {
      amt = parseEther(amount.trim() || "0");
    } catch {
      return;
    }
    if (amt <= 0n) {
      setRoute(null);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const [q, meta] = await Promise.all([
          fetch(`/api/quote?in=${zeroAddress}&out=${tokenOut.trim()}&amount=${amt}`).then((r) => r.json()),
          fetch(`/api/token/${tokenOut.trim()}`).then((r) => (r.ok ? r.json() : null)),
        ]);
        if (cancelled) return;
        const routes: Route[] = q?.routes ?? [];
        const best = routes
          .filter((r) => r.amountOut && BigInt(r.amountOut) > 0n)
          .sort((a, b) => (BigInt(b.amountOut) > BigInt(a.amountOut) ? 1 : -1))[0];
        setRoute(best ?? null);
        setTokenMeta(meta ? { symbol: meta.symbol ?? "TOKEN", decimals: meta.decimals ?? 18 } : null);
      } catch {
        if (!cancelled) setRoute(null);
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
      setQuoting(false);
    };
  }, [tab, tokenOut, amount]);

  let parsed: bigint | null = null;
  try {
    parsed = amount.trim() ? parseEther(amount.trim()) : null;
  } catch {
    parsed = null;
  }

  const balance = scan?.balance ?? 0n;
  const enough = tab === "deposit" || (parsed !== null && parsed <= balance);
  const recipientOk = tab === "deposit" || isAddress(recipient.trim());
  const swapReady = tab !== "swap" || (route !== null && isAddress(tokenOut.trim()));
  const canSubmit =
    live && key && parsed !== null && parsed > 0n && enough && recipientOk && swapReady &&
    !stage && !scanning && !quoting;

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
      const swapping = tab === "swap";
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

      /*
       * The trade has to be known before the proof is built, not after. A swap
       * binds ExtData and SwapData together in one hash, so a proof made
       * without the trade is bound to the wrong preimage and the contract
       * rejects it as BadProof with nothing on screen to explain why.
       */
      let swapData: SwapDataT | undefined;
      if (swapping) {
        if (!route) throw new Error("No route for that token right now.");
        const minOut = applySlippage(BigInt(route.amountOut), 100);
        const call = buildRoutedSwapCall({
          route,
          tokenOut: { address: tokenOut.trim() as Address, native: false } as never,
          amountIn: parsed,
          minOut,
        });
        swapData = {
          tokenOut: call.tokenOut,
          amountOutMin: minOut,
          recipient: recipient.trim() as Address,
          routerCalldata: call.calldata,
        };
      }

      const tx = await buildShieldedTx({
        key,
        leaves: fresh.leaves,
        inputs,
        depositAmount: depositing ? parsed : 0n,
        withdrawAmount: depositing ? 0n : parsed,
        // A swap spends exactly like a withdrawal; only the destination differs.
        recipient: depositing ? "0x0000000000000000000000000000000000000000" : (recipient.trim() as Address),
        swapData,
        onProgress: setStage,
      });

      /*
       * A swap spends the same way a withdrawal does: the proof says these
       * notes are mine and this much leaves the pool. Where it goes is the
       * only difference, and that is bound by the extData hash rather than by
       * the circuit.
       */
      if (swapping && swapData) {
        setStage("Checking the transaction");
        const swapArgs = [tx.proof, tx.args, tx.extData, swapData] as const;

        await publicClient.simulateContract({
          address: REFRACT_POOL.address,
          abi: refractPoolAbi,
          functionName: "swap",
          args: swapArgs,
          account: address,
        });

        setStage("Waiting for your wallet");
        const swapHash = await writeContractAsync({
          chainId: REQUIRED_CHAIN_ID,
          address: REFRACT_POOL.address,
          abi: refractPoolAbi,
          functionName: "swap",
          args: swapArgs,
          gas: TRANSACT_GAS,
        });
        push({ tone: "info", title: "Swap submitted", href: { label: "View transaction", url: txUrl(swapHash) } });

        const r = await publicClient.waitForTransactionReceipt({ hash: swapHash });
        if (r.status === "success") {
          push({
            tone: "success",
            title: "Swapped",
            body: `The pool traded ${formatEther(parsed)} ETH. The chain shows the pool swapped, not you.`,
            href: { label: "View transaction", url: txUrl(swapHash) },
          });
          setAmount("");
          await refresh();
        } else {
          push({ tone: "error", title: "Swap reverted", body: "Nothing moved." });
        }
        return;
      }

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
        {(["deposit", "withdraw", "swap"] as Tab[]).map((t) => (
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
      {tab !== "deposit" && (
        <button
          className="btn"
          style={{ fontSize: 11.5, padding: "5px 11px", marginTop: 8 }}
          onClick={() => setAmount(formatEther(balance))}
        >
          Max
        </button>
      )}

      {tab === "swap" && (
        <>
          <label className="kicker" style={{ display: "block", margin: "16px 0 7px" }}>
            Token to buy
          </label>
          <input
            className="mono"
            placeholder="0x... token address"
            value={tokenOut}
            onChange={(e) => setTokenOut(e.target.value)}
            style={{
              width: "100%", padding: "13px 15px", borderRadius: 12, fontSize: 13.5,
              background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text)",
            }}
          />
          {quoting && (
            <p className="mono" style={{ fontSize: 11, color: "var(--faint)", marginTop: 8 }}>
              Pricing across every venue on 4663
            </p>
          )}
          {!quoting && route && (
            <div
              className="panel"
              style={{ padding: "12px 14px", marginTop: 10, background: "color-mix(in srgb, var(--gold) 7%, transparent)" }}
            >
              <div className="mono" style={{ fontSize: 10.5, color: "var(--faint)", marginBottom: 5 }}>
                {route.label} · best of every venue quoted
              </div>
              <div className="mono" style={{ fontSize: 17, color: "var(--text)" }}>
                ≈ {tokenMeta ? formatUnits(BigInt(route.amountOut), tokenMeta.decimals) : route.amountOut}{" "}
                <span style={{ color: "var(--muted)", fontSize: 13 }}>{tokenMeta?.symbol ?? ""}</span>
              </div>
              <div className="mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 5 }}>
                1% slippage. Anything above the minimum still reaches you.
              </div>
            </div>
          )}
          {!quoting && !route && isAddress(tokenOut.trim()) && (
            <p style={{ color: "var(--ember)", fontSize: 12.5, marginTop: 8 }}>
              No route to that token right now.
            </p>
          )}
        </>
      )}

      {tab !== "deposit" && (
        <>
          <label className="kicker" style={{ display: "block", margin: "16px 0 7px" }}>
            {tab === "swap" ? "Send the token to" : "Send to"}
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
            Use an address with no history. Sending to the wallet you deposited
            from links the two and undoes the privacy.
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
            : tab === "swap"
              ? "Prove and swap"
              : "Prove and withdraw"}
      </button>

      {error && (
        <p style={{ color: "var(--ember)", fontSize: 12.5, marginTop: 12, lineHeight: 1.55 }}>{error}</p>
      )}

      <p className="mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 14, lineHeight: 1.6 }}>
        Proving runs entirely in your browser and takes a few seconds. Any
        amount you do not spend comes back as a new hidden note.
        {tab === "swap" && " The pool makes the trade, so the chain records that the pool swapped and not that you did."}
      </p>
    </div>
  );
}
