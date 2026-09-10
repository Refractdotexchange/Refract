"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { Address } from "viem";
import { TokenAvatar } from "./brand";
import { TokenSelect } from "./token-select";
import { RouteList } from "./route-list";
import { useToast } from "./toast";
import { useQuote } from "@/hooks/use-quote";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { formatUnits, parseUnits } from "@/lib/format";
import { NATIVE_TOKEN, USDG_TOKEN, sameToken, type TokenInfo } from "@/lib/tokens";
import { applySlippage, buildSwap, buildV4Swap, gasReserve } from "@/lib/swap";
import { erc20Abi } from "@/lib/abi";
import { txUrl } from "@/lib/chain";
import { CASHBACK_BPS } from "@/lib/rewards";
import type { Route } from "@/lib/quote";

const SLIPPAGE_PRESETS = [10, 50, 100, 300];

/**
 * `buy` preselects the token to receive, so a link from a token page lands on
 * a swap that is ready to go. Previously that link dropped the token entirely
 * and left the user on the default ETH -> USDG pair, hunting for it by hand.
 */
export function SwapCard({ buy }: { buy?: TokenInfo | null } = {}) {
  const [tokenIn, setTokenIn] = useState<TokenInfo>(NATIVE_TOKEN);
  const [tokenOut, setTokenOut] = useState<TokenInfo>(buy ?? USDG_TOKEN);
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);
  const [showSettings, setShowSettings] = useState(false);
  const [picking, setPicking] = useState<"in" | "out" | null>(null);
  const [chosenRouteId, setChosenRouteId] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "approving" | "swapping">(null);

  // The token arrives after its metadata resolves, so adopt it when it lands.
  useEffect(() => {
    if (buy && !sameToken(buy, tokenOut)) setTokenOut(buy);
    // Only react to the incoming token, not to the user's later edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buy?.address]);

  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { push } = useToast();

  const balanceIn = useTokenBalance(tokenIn);
  const balanceOut = useTokenBalance(tokenOut);

  const amountIn = useMemo(() => parseUnits(amount, tokenIn.decimals), [amount, tokenIn.decimals]);
  const { data: quote, isFetching, error } = useQuote(tokenIn, tokenOut, amountIn);

  // Reset the manual route pick whenever the pair or size changes.
  useEffect(() => setChosenRouteId(null), [tokenIn.address, tokenOut.address, amountIn]);

  const routes = quote?.routes ?? [];
  const active: Route | null =
    routes.find((r) => r.id === chosenRouteId) ?? quote?.best ?? null;

  const amountOut = active ? BigInt(active.amountOut) : 0n;
  const minOut = active ? applySlippage(amountOut, slippageBps) : 0n;

  const ethUsd = quote?.ethUsd ?? null;
  const inUsd =
    ethUsd != null && tokenIn.native ? (Number(amountIn) / 1e18) * ethUsd : null;

  const cashbackEth =
    ethUsd != null && tokenIn.native
      ? ((Number(amountIn) / 1e18) * CASHBACK_BPS) / 10_000
      : null;

  const insufficient = isConnected && amountIn > balanceIn.value;

  const impactBps = quote?.priceImpactBps ?? null;
  const impactTone =
    impactBps == null
      ? undefined
      : impactBps >= 500
        ? "var(--ember)"
        : impactBps >= 150
          ? "var(--honey)"
          : undefined;

  const flip = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmount("");
  };

  const setMax = async () => {
    if (!tokenIn.native) {
      setAmount(formatUnits(balanceIn.value, tokenIn.decimals, tokenIn.decimals));
      return;
    }
    // Hold back only what the transaction will actually cost. A flat reserve
    // was 66x the real gas price here and swallowed most of a small balance.
    let reserve = gasReserve(230_000_000n); // fallback if the node is unreachable
    try {
      if (publicClient) reserve = gasReserve(await publicClient.getGasPrice());
    } catch {
      /* keep the fallback */
    }
    const usable = balanceIn.value > reserve ? balanceIn.value - reserve : 0n;
    setAmount(formatUnits(usable, tokenIn.decimals, tokenIn.decimals));
  };

  async function execute() {
    if (!active || !address || !publicClient) return;

    try {
      // V4 goes through the Universal Router rather than SwapRouter02, and
      // carries its own pool key from the quote.
      const plan =
        active.protocol === "uniswap-v4" && active.poolKey
          ? buildV4Swap({
              poolKey: active.poolKey,
              zeroForOne: active.zeroForOne ?? true,
              amountIn,
              minOut,
            })
          : buildSwap({
              route: active,
              tokenIn,
              tokenOut,
              amountIn,
              minOut,
              recipient: address,
            });

      // Approve only the exact amount this swap needs.
      if (plan.spender) {
        const allowance = await publicClient.readContract({
          address: tokenIn.address as Address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, plan.spender],
        });

        if (allowance < amountIn) {
          setBusy("approving");
          const approveHash = await writeContractAsync({
            address: tokenIn.address as Address,
            abi: erc20Abi,
            functionName: "approve",
            args: [plan.spender, amountIn],
          });
          push({
            tone: "info",
            title: `Approving ${tokenIn.symbol}`,
            body: "Waiting for confirmation on chain 4663.",
            href: { label: "View transaction", url: txUrl(approveHash) },
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
      }

      setBusy("swapping");
      const hash = await writeContractAsync(plan.request);
      push({
        tone: "info",
        title: "Swap submitted",
        body: `${tokenIn.symbol} → ${tokenOut.symbol} via ${active.label}.`,
        href: { label: "View transaction", url: txUrl(hash) },
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "success") {
        push({
          tone: "success",
          title: "Swap complete",
          body: `Received ~${formatUnits(amountOut, tokenOut.decimals, 6)} ${tokenOut.symbol}. Cashback is now accruing.`,
          href: { label: "View transaction", url: txUrl(hash) },
        });
        setAmount("");
        balanceIn.refetch();
        balanceOut.refetch();
      } else {
        push({ tone: "error", title: "Transaction reverted", body: "No funds were moved." });
      }
    } catch (err) {
      const msg = String(err);
      const rejected = /User rejected|denied|rejected the request/i.test(msg);
      push({
        tone: rejected ? "info" : "error",
        title: rejected ? "Cancelled in wallet" : "Swap failed",
        body: rejected
          ? "Nothing was sent."
          : /insufficient/i.test(msg)
            ? "Insufficient balance or liquidity for this size."
            : "The route may have moved. Refresh the quote and try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  const ctaLabel = !isConnected
    ? "Connect wallet to swap"
    : amountIn === 0n
      ? "Enter an amount"
      : insufficient
        ? `Not enough ${tokenIn.symbol}`
        : isFetching && !active
          ? "Finding best route"
          : !active
            ? "No route for this pair"
            : busy === "approving"
              ? `Approving ${tokenIn.symbol}…`
              : busy === "swapping"
                ? "Confirm in wallet…"
                : `Swap ${tokenIn.symbol} for ${tokenOut.symbol}`;

  const ctaDisabled =
    !isConnected || amountIn === 0n || insufficient || !active || busy !== null;

  return (
    <>
      <div className="panel panel-lit" style={{ padding: "20px 20px 18px", position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div className="kicker">Route engine</div>
            <h2 className="font-display" style={{ margin: "5px 0 0", fontSize: 21, fontWeight: 700 }}>
              Swap
            </h2>
          </div>
          <button
            className="btn"
            aria-label="Swap settings"
            onClick={() => setShowSettings((v) => !v)}
            style={{ padding: 10, borderRadius: 12 }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7a1.7 1.7 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" transform="translate(0.5 0.5) scale(0.96)" />
            </svg>
          </button>
        </div>

        {showSettings && (
          <div className="panel-flat rise" style={{ padding: 14, marginBottom: 12 }}>
            <div className="kicker" style={{ marginBottom: 9 }}>
              Max slippage
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SLIPPAGE_PRESETS.map((bps) => (
                <button
                  key={bps}
                  className="chip"
                  data-on={slippageBps === bps}
                  onClick={() => setSlippageBps(bps)}
                >
                  {(bps / 100).toFixed(bps < 100 ? 2 : 1)}%
                </button>
              ))}
            </div>
            <p style={{ color: "var(--muted)", fontSize: 12, margin: "10px 0 0", lineHeight: 1.55 }}>
              The swap reverts if you would receive less than{" "}
              <span className="mono" style={{ color: "var(--text)" }}>
                {formatUnits(minOut, tokenOut.decimals, 6)} {tokenOut.symbol}
              </span>
              .
            </p>
          </div>
        )}

        {/* Pay pane */}
        <Pane
          label="You pay"
          token={tokenIn}
          balance={balanceIn.value}
          onPick={() => setPicking("in")}
          onMax={setMax}
          value={amount}
          onChange={setAmount}
          usd={inUsd}
          editable
        />

        <div style={{ display: "flex", justifyContent: "center", margin: "-9px 0", position: "relative", zIndex: 2 }}>
          <button
            onClick={flip}
            aria-label="Switch direction"
            className="btn"
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              padding: 0,
              background: "var(--surface)",
              transition: "transform .25s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "rotate(180deg)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v14M8 17l-3-3M8 17l3-3M16 21V7M16 7l-3 3M16 7l3 3" />
            </svg>
          </button>
        </div>

        {/* Receive pane */}
        <Pane
          label="You receive"
          token={tokenOut}
          balance={balanceOut.value}
          onPick={() => setPicking("out")}
          value={active ? formatUnits(amountOut, tokenOut.decimals, 6) : ""}
          loading={isFetching && !active && amountIn > 0n}
        />

        <RouteList

            tokenOut={tokenOut.address}          routes={routes}
          activeId={active?.id ?? null}
          decimals={tokenOut.decimals}
          symbol={tokenOut.symbol}
          onPick={setChosenRouteId}
          loading={isFetching}
          hasAmount={amountIn > 0n}
        />

        {/* Cashback strip */}
        <div
          className="panel-flat"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            padding: "11px 14px",
            marginTop: 10,
            borderColor: cashbackEth ? "color-mix(in srgb, var(--gold) 40%, transparent)" : undefined,
            background: cashbackEth
              ? "color-mix(in srgb, var(--gold) 11%, transparent)"
              : undefined,
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={cashbackEth ? "var(--gold)" : "var(--faint)"} strokeWidth="1.7" style={{ flexShrink: 0 }}>
            <path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8M2 7h20v5H2zM12 21V7M12 7s-1.5-4-4-4a2 2 0 0 0 0 4zM12 7s1.5-4 4-4a2 2 0 0 1 0 4z" strokeLinejoin="round" />
          </svg>
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>
            {cashbackEth ? (
              <>
                This swap accrues{" "}
                <b className="mono" style={{ color: "var(--gold)" }}>
                  {cashbackEth.toFixed(6)} ETH
                </b>{" "}
                of cashback ({(CASHBACK_BPS / 100).toFixed(2)}% of routed volume).
              </>
            ) : (
              <span style={{ color: "var(--muted)" }}>
                Cashback accrues on ETH-denominated volume. Enter an amount to preview it.
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="mono" style={{ color: "var(--ember)", fontSize: 12, marginTop: 10 }}>
            {(error as Error).message}
          </div>
        )}

        <button
          className="btn btn-primary btn-lg"
          style={{ marginTop: 12 }}
          disabled={ctaDisabled}
          onClick={execute}
        >
          {busy && <span className="spinner" />}
          {ctaLabel}
        </button>

        {active && (
          <div style={{ marginTop: 11, display: "flex", flexDirection: "column", gap: 7 }}>
            <DetailRow
              label="Price impact"
              value={
                impactBps == null
                  ? "—"
                  : impactBps < 1
                    ? "<0.01%"
                    : `${(impactBps / 100).toFixed(2)}%`
              }
              tone={impactTone}
            />
            <DetailRow
              label="Minimum received"
              value={`${formatUnits(minOut, tokenOut.decimals, 6)} ${tokenOut.symbol}`}
            />
            <DetailRow label="Max slippage" value={`${(slippageBps / 100).toFixed(2)}%`} />
          </div>
        )}

        {impactBps != null && impactBps >= 500 && (
          <div
            className="panel-flat"
            style={{
              marginTop: 10,
              padding: "11px 14px",
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              borderColor: "color-mix(in srgb, var(--ember) 45%, transparent)",
              background: "color-mix(in srgb, var(--ember) 10%, transparent)",
            }}
          >
            <span style={{ color: "var(--ember)", fontSize: 15, lineHeight: 1.2 }}>⚠</span>
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--muted)" }}>
              This trade moves the price by{" "}
              <b style={{ color: "var(--ember)" }}>{(impactBps / 100).toFixed(1)}%</b>. The pool is
              thin for this size, so you are paying well above the going rate. Try a smaller amount.
            </div>
          </div>
        )}
      </div>

      <TokenSelect
        open={picking !== null}
        onClose={() => setPicking(null)}
        exclude={picking === "in" ? tokenOut : tokenIn}
        onSelect={(t) => {
          if (picking === "in") {
            if (sameToken(t, tokenOut)) setTokenOut(tokenIn);
            setTokenIn(t);
          } else {
            if (sameToken(t, tokenIn)) setTokenIn(tokenOut);
            setTokenOut(t);
          }
        }}
      />
    </>
  );
}

function DetailRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div
      className="mono"
      style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 11.5 }}
    >
      <span style={{ color: "var(--faint)" }}>{label}</span>
      <span style={{ color: tone ?? "var(--muted)", fontWeight: tone ? 700 : 400 }}>{value}</span>
    </div>
  );
}

function Pane({
  label,
  token,
  balance,
  onPick,
  onMax,
  value,
  onChange,
  usd,
  editable,
  loading,
}: {
  label: string;
  token: TokenInfo;
  balance: bigint;
  onPick: () => void;
  onMax?: () => void;
  value: string;
  onChange?: (v: string) => void;
  usd?: number | null;
  editable?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="panel-flat" style={{ padding: "13px 15px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
        <span className="kicker">{label}</span>
        <span className="mono" style={{ fontSize: 11.5, color: "var(--muted)", display: "flex", gap: 8 }}>
          {formatUnits(balance, token.decimals, 4)} {token.symbol}
          {onMax && balance > 0n && (
            <button
              onClick={onMax}
              style={{
                background: "none",
                border: 0,
                color: "var(--gold)",
                font: "inherit",
                fontWeight: 700,
                cursor: "pointer",
                padding: 0,
              }}
            >
              MAX
            </button>
          )}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {editable ? (
          <input
            inputMode="decimal"
            placeholder="0"
            value={value}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^\d*\.?\d*$/.test(v)) onChange?.(v);
            }}
            style={{
              flex: 1,
              minWidth: 0,
              background: "none",
              border: 0,
              outline: "none",
              color: "var(--text)",
              fontSize: 32,
              fontWeight: 600,
              fontFamily: "inherit",
              padding: 0,
            }}
          />
        ) : (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 32,
              fontWeight: 600,
              color: value ? "var(--text)" : "var(--faint)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {loading ? <span className="skeleton" style={{ display: "block", width: 130, height: 34 }} /> : value || "0"}
          </div>
        )}

        <button
          onClick={onPick}
          className="btn"
          style={{ flexShrink: 0, padding: "9px 12px", fontSize: 15, fontWeight: 700, background: "var(--surface)" }}
        >
          <TokenAvatar address={token.address} symbol={token.symbol} size={22} logoUrl={token.logoUrl} />
          {token.symbol}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      <div className="mono" style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 4, minHeight: 15 }}>
        {usd != null && usd > 0 ? `≈ $${usd.toFixed(2)}` : ""}
      </div>
    </div>
  );
}
