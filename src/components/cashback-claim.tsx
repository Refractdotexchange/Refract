"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { formatUnits, type Address } from "viem";
import { feeRouterAbi } from "@/lib/fee-abi";
import { FEE_ROUTER, isFeeRouterLive } from "@/lib/fee-config";
import { REQUIRED_CHAIN_ID, explainRevert, isUserRejection } from "@/lib/tx-guard";
import { txUrl } from "@/lib/chain";
import { useToast } from "./toast";

type Row = { token: Address; symbol: string; decimals: number; amount: bigint };

/**
 * Claim cashback.
 *
 * Nothing here asks permission. The contract pays whoever calls it, from what
 * that caller's own recorded volume has accrued, so this page only has to find
 * which tokens a wallet has traded and read the figure the contract already
 * knows. There is no operator to approve anything and no key of ours involved.
 *
 * Cashback is denominated in whatever was bought, because that is the token
 * the fee was taken in, so a wallet can have a separate balance per token.
 */
export function CashbackClaim() {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { push } = useToast();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address || !publicClient || !FEE_ROUTER.address) return;
    setError(null);
    try {
      // Which tokens this wallet has bought through the router. Filtered by
      // the indexed trader, so this is one small query rather than a scan.
      const logs = await publicClient.getContractEvents({
        address: FEE_ROUTER.address,
        abi: feeRouterAbi,
        eventName: "Routed",
        args: { trader: address },
        fromBlock: FEE_ROUTER.deployBlock,
        toBlock: "latest",
      });

      const tokens = [...new Set(logs.map((l) => (l.args as { tokenOut?: Address }).tokenOut).filter(Boolean))] as Address[];
      if (tokens.length === 0) {
        setRows([]);
        return;
      }

      const amounts = await Promise.all(
        tokens.map((t) =>
          publicClient.readContract({
            address: FEE_ROUTER.address as Address,
            abi: feeRouterAbi,
            functionName: "claimable",
            args: [address, t],
          }),
        ),
      );

      const meta = await Promise.all(
        tokens.map(async (t) => {
          try {
            const r = await fetch(`/api/token/${t}`);
            if (!r.ok) return { symbol: t.slice(0, 6), decimals: 18 };
            const j = await r.json();
            return { symbol: j.symbol ?? t.slice(0, 6), decimals: j.decimals ?? 18 };
          } catch {
            return { symbol: t.slice(0, 6), decimals: 18 };
          }
        }),
      );

      setRows(
        tokens
          .map((token, i) => ({ token, amount: amounts[i] as bigint, ...meta[i] }))
          .filter((r) => r.amount > 0n),
      );
    } catch (e) {
      setError(String((e as Error).message ?? e).slice(0, 160));
      setRows([]);
    }
  }, [address, publicClient]);

  useEffect(() => {
    if (isConnected) void load();
  }, [isConnected, load]);

  async function claim(row: Row) {
    if (!FEE_ROUTER.address || !publicClient) return;
    setError(null);
    setBusy(row.token);
    try {
      if (chainId !== REQUIRED_CHAIN_ID) await switchChainAsync({ chainId: REQUIRED_CHAIN_ID });

      const hash = await writeContractAsync({
        chainId: REQUIRED_CHAIN_ID,
        address: FEE_ROUTER.address,
        abi: feeRouterAbi,
        functionName: "claim",
        args: [row.token],
      });
      push({ tone: "info", title: "Claim submitted", href: { label: "View transaction", url: txUrl(hash) } });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "success") {
        push({
          tone: "success",
          title: "Cashback claimed",
          body: `${formatUnits(row.amount, row.decimals)} ${row.symbol} sent to your wallet.`,
          href: { label: "View transaction", url: txUrl(hash) },
        });
        await load();
      } else {
        push({ tone: "error", title: "Claim reverted", body: "Nothing moved." });
      }
    } catch (e) {
      if (isUserRejection(e)) push({ tone: "info", title: "Cancelled in wallet" });
      else setError(explainRevert(e, "The claim did not go through."));
    } finally {
      setBusy(null);
    }
  }

  if (!isFeeRouterLive()) return null;

  if (!isConnected) {
    return (
      <div className="panel" style={{ padding: "16px 18px", marginBottom: 18 }}>
        <div className="kicker" style={{ marginBottom: 8 }}>Cashback</div>
        <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
          Connect a wallet to see what your routed trades have earned. Cashback is
          paid by the contract to whoever claims it, so nobody has to approve anything.
        </p>
      </div>
    );
  }

  return (
    <div className="panel panel-lit" style={{ padding: "18px 20px", marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div className="kicker">Claimable cashback</div>
        <button className="btn" style={{ fontSize: 11.5, padding: "5px 11px" }} onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {rows === null ? (
        <span className="skeleton" style={{ display: "block", width: 200, height: 22, marginTop: 12 }} />
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.6, margin: "10px 0 0" }}>
          Nothing yet. Cashback accrues when you buy through the router and a trade
          beats the plain Uniswap V2 price, since the fee is a share of that
          difference and nothing else.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {rows.map((r) => (
            <div
              key={r.token}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                padding: "12px 14px", borderRadius: 12,
                background: "var(--surface-2)", border: "1px solid var(--line)",
              }}
            >
              <div className="mono" style={{ fontSize: 17, color: "var(--text)" }}>
                {formatUnits(r.amount, r.decimals)}{" "}
                <span style={{ color: "var(--muted)", fontSize: 13 }}>{r.symbol}</span>
              </div>
              <button
                className="btn btn-primary"
                disabled={busy === r.token}
                onClick={() => void claim(r)}
              >
                {busy === r.token && <span className="spinner" />}
                {busy === r.token ? "Claiming" : "Claim"}
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p style={{ color: "var(--ember)", fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
