"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { Address } from "viem";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "./toast";
import { erc20Abi } from "@/lib/abi";
import { txUrl } from "@/lib/chain";
import { curveAbi, minOut, priceImpact, quoteBuy, quoteSell, type CurveState } from "@/lib/curve";
import { gasReserve } from "@/lib/swap";
import { formatUnits, parseUnits } from "@/lib/format";

const SLIPPAGE_PRESETS = [100, 300, 500, 1000];

/**
 * Buying a token that is still on its Pons curve.
 *
 * The router cannot help here: a pre-graduation token has no Uniswap pool, so
 * the trade goes straight to the curve. Payment is an ERC-20 `pairToken`
 * (USDG, WETH or a tokenised equity depending on the launch), which means an
 * approval first and `value: 0` on the buy itself.
 */
/** Scale a typed amount to base units for the server-side probe. */
function probeAmount(value: string, decimals: number): string | null {
  if (!value) return null;
  try {
    const v = parseUnits(value, decimals);
    return v > 0n ? v.toString() : null;
  } catch {
    return null;
  }
}

export function CurveBuy({ token, symbol }: { token: Address; symbol: string }) {
  const { address: wallet, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { push } = useToast();

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(300);
  const [busy, setBusy] = useState<null | "approving" | "buying">(null);
  const selling = side === "sell";

  // Debounced so typing does not fire a probe per keystroke.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(amount), 350);
    return () => clearTimeout(t);
  }, [amount]);

  const curve = useQuery<CurveState & { exactOut?: string | null }>({
    queryKey: ["curve", token, debounced],
    queryFn: async () => {
      const probe = probeAmount(debounced, pairDecimalsRef.current);
      const r = await fetch(`/api/curve/${token}${probe ? `?amountIn=${probe}` : ""}`);
      if (!r.ok) throw new Error((await r.json()).error ?? "No curve");
      return r.json();
    },
    // Reserves move with every trade, so keep them fresh while the panel is open.
    refetchInterval: 12_000,
    retry: false,
  });

  const d = curve.data;
  // Kept in a ref so the query function can scale the probe without re-running
  // the effect every time the curve refreshes.
  const pairDecimalsRef = useRef(18);
  useEffect(() => {
    if (d) pairDecimalsRef.current = d.pairDecimals;
  }, [d]);

  const balance = useQuery<bigint>({
    queryKey: ["pair-balance", d?.pairToken, wallet],
    enabled: !!d && !!wallet && !!publicClient,
    queryFn: async () =>
      d!.isNative
        ? publicClient!.getBalance({ address: wallet! })
        : (publicClient!.readContract({
            address: d!.pairToken,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [wallet!],
          }) as Promise<bigint>),
    refetchInterval: 15_000,
  });

  // The token being sold back into the curve. Launch tokens are all 18dp.
  const tokenBalance = useQuery<bigint>({
    queryKey: ["token-balance", token, wallet],
    enabled: !!wallet && !!publicClient,
    queryFn: async () =>
      publicClient!.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [wallet!],
      }) as Promise<bigint>,
    refetchInterval: 15_000,
  });

  const inDecimals = selling ? 18 : (d?.pairDecimals ?? 18);
  const amountIn = useMemo(() => {
    if (!amount) return 0n;
    try {
      return parseUnits(amount, inDecimals);
    } catch {
      return 0n;
    }
  }, [amount, inDecimals]);

  // The contract's own answer when it could be probed, otherwise the estimate.
  // Only buys can be probed on-chain, so a sell always shows an estimate.
  const exact = !selling && d?.exactOut ? BigInt(d.exactOut) : null;
  const expected = useMemo(() => {
    if (!d || amountIn <= 0n) return 0n;
    if (exact != null) return exact;
    return selling
      ? quoteSell(amountIn, BigInt(d.pairReserve), BigInt(d.tokenReserve), d.feeBps)
      : quoteBuy(amountIn, BigInt(d.pairReserve), BigInt(d.tokenReserve), d.feeBps);
  }, [amountIn, d, exact, selling]);

  const impact = useMemo(() => {
    if (!d || amountIn <= 0n) return 0;
    return priceImpact(amountIn, BigInt(d.pairReserve), BigInt(d.tokenReserve), d.feeBps);
  }, [amountIn, d]);

  const spendBalance = selling ? tokenBalance.data : balance.data;
  const overBalance = spendBalance != null && amountIn > spendBalance;
  const outDecimals = selling ? (d?.pairDecimals ?? 18) : 18;
  const outSymbol = selling ? (d?.pairSymbol ?? "") : symbol;

  // A graduated curve is closed; the swap router takes over from there.
  if (curve.isError || (d && d.graduated)) return null;

  const trade = async () => {
    if (!d || !wallet || !publicClient || amountIn <= 0n) return;
    try {
      // Selling spends the launch token; buying spends the pair asset. Native
      // ETH is the only thing that never needs an approval.
      const spendToken = selling ? token : d.pairToken;
      const needsApproval = selling || !d.isNative;

      if (needsApproval) {
        const allowance = (await publicClient.readContract({
          address: spendToken,
          abi: erc20Abi,
          functionName: "allowance",
          args: [wallet, d.curve],
        })) as bigint;

        if (allowance < amountIn) {
          setBusy("approving");
          const approveHash = await writeContractAsync({
            address: spendToken,
            abi: erc20Abi,
            functionName: "approve",
            args: [d.curve, amountIn],
          });
          push({
            tone: "info",
            title: `Approving ${selling ? symbol : d.pairSymbol}`,
            href: { label: "View transaction", url: txUrl(approveHash) },
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
      }

      setBusy("buying");

      // Buy and sell are written as separate calls rather than one branch on a
      // variable: `sell` is non-payable, so viem's types reject a `value` field
      // on it even when that value is zero.
      const probeFloor = async (): Promise<bigint> => {
        // Ask the curve what it will really pay and derive the floor from that.
        // The applied fee does not match feeBps(), so an estimate-based floor
        // can sit above the real output and revert the trade.
        try {
          const sim = selling
            ? await publicClient.simulateContract({
                address: d.curve, abi: curveAbi, functionName: "sell",
                args: [amountIn, 0n, wallet], account: wallet,
              })
            : await publicClient.simulateContract({
                address: d.curve, abi: curveAbi, functionName: "buy",
                args: [amountIn, 0n, wallet], account: wallet,
                value: d.isNative ? amountIn : 0n,
              });
          const trueOut = sim.result as bigint;
          if (trueOut > 0n) return minOut(trueOut, slippageBps);
        } catch {
          /* fall through to the estimate */
        }
        return minOut(expected, slippageBps);
      };

      const floor = await probeFloor();

      let hash: `0x${string}`;
      if (selling) {
        await publicClient.simulateContract({
          address: d.curve, abi: curveAbi, functionName: "sell",
          args: [amountIn, floor, wallet], account: wallet,
        });
        hash = await writeContractAsync({
          address: d.curve, abi: curveAbi, functionName: "sell",
          args: [amountIn, floor, wallet],
        });
      } else {
        const value = d.isNative ? amountIn : 0n;
        await publicClient.simulateContract({
          address: d.curve, abi: curveAbi, functionName: "buy",
          args: [amountIn, floor, wallet], account: wallet, value,
        });
        hash = await writeContractAsync({
          address: d.curve, abi: curveAbi, functionName: "buy",
          args: [amountIn, floor, wallet], value,
        });
      }
      push({
        tone: "info",
        title: `${selling ? "Selling" : "Buying"} ${symbol}`,
        href: { label: "View transaction", url: txUrl(hash) },
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      push({
        tone: receipt.status === "success" ? "success" : "error",
        title:
          receipt.status === "success"
            ? `${selling ? "Sold" : "Bought"} ${symbol}`
            : `${selling ? "Sell" : "Buy"} failed`,
        href: { label: "View transaction", url: txUrl(hash) },
      });
      if (receipt.status === "success") {
        setAmount("");
        curve.refetch();
        balance.refetch();
        tokenBalance.refetch();
      }
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      const rejected = /User rejected|denied/i.test(msg);
      push({
        tone: "error",
        title: rejected ? "Transaction rejected" : `${selling ? "Sell" : "Buy"} failed`,
        body: rejected ? undefined : msg.slice(0, 140),
      });
    } finally {
      setBusy(null);
    }
  };

  if (curve.isLoading) {
    return (
      <div className="panel" style={{ padding: 22 }}>
        <div className="skeleton" style={{ height: 20, width: 180 }} />
      </div>
    );
  }
  if (!d) return null;

  return (
    <div className="panel panel-lit" style={{ padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="kicker">Trade on the curve</div>
          <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 6, maxWidth: 460 }}>
            This token has not graduated yet, so it trades on its Pons bonding curve.
            It is priced in <strong style={{ color: "var(--text)" }}>{d.pairSymbol}</strong>
            {d.isNative ? " (native ETH)." : ", not ETH."}
          </div>
        </div>
        <span className="chip mono" style={{ fontSize: 11.5 }}>
          {(d.feeBps / 100).toFixed(2)}% curve fee
        </span>
      </div>

      {/* Your position, shown wherever you are looking at the token. Without
          this the only place a holding appeared was the Portfolio page. */}
      {isConnected && tokenBalance.data != null && tokenBalance.data > 0n && (
        <div
          className="panel-flat"
          style={{ marginTop: 14, padding: "11px 14px", display: "flex", justifyContent: "space-between", gap: 12 }}
        >
          <span style={{ fontSize: 12.5, color: "var(--faint)" }}>Your balance</span>
          <span className="mono" style={{ fontSize: 13, color: "var(--text)", fontWeight: 600 }}>
            {formatUnits(tokenBalance.data, 18, 4)} {symbol}
          </span>
        </div>
      )}

      {/* Selling matters as much as buying: a curve token has no Uniswap pool,
          so this panel is the only way out of the position until it graduates. */}
      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
        {(["buy", "sell"] as const).map((s2) => (
          <button
            key={s2}
            className="chip"
            data-on={side === s2}
            onClick={() => {
              setSide(s2);
              setAmount("");
            }}
            style={{ cursor: "pointer", flex: 1, textTransform: "capitalize", padding: "9px 0" }}
          >
            {s2}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span className="kicker">{selling ? `Sell ${symbol}` : "You pay"}</span>
          {spendBalance != null && (
            <button
              onClick={async () => {
                const raw = spendBalance!;
                if (selling) {
                  // Selling spends the token, so no native gas reserve applies.
                  setAmount(formatUnits(raw, 18, 18));
                  return;
                }
                if (!d.isNative) {
                  setAmount(formatUnits(raw, d.pairDecimals, 6));
                  return;
                }
                // Hold back only the real cost of the buy, not a flat guess.
                let reserve = gasReserve(230_000_000n);
                try {
                  if (publicClient) reserve = gasReserve(await publicClient.getGasPrice());
                } catch {
                  /* keep the fallback */
                }
                setAmount(formatUnits(raw > reserve ? raw - reserve : 0n, d.pairDecimals, 6));
              }}
              style={{ background: "none", border: 0, cursor: "pointer", padding: 0 }}
              className="mono"
              title={`Use your full ${d.pairSymbol} balance`}
            >
              <span style={{ fontSize: 11.5, color: "var(--faint)" }}>
                balance {formatUnits(spendBalance, inDecimals, 4)} {selling ? symbol : d.pairSymbol}
              </span>
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            className="input mono"
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            style={{ flex: 1, fontSize: 20, padding: "12px 14px" }}
          />
          <span className="chip mono" style={{ flexShrink: 0 }}>{selling ? symbol : d.pairSymbol}</span>
        </div>
      </div>

      {amountIn > 0n && (
        <div className="panel-flat" style={{ marginTop: 12, padding: "12px 14px", display: "grid", gap: 7 }}>
          <Row
            label={exact != null ? "You receive (quoted on-chain)" : "You receive (rough estimate)"}
            value={`${formatUnits(expected, outDecimals, 4)} ${outSymbol}`}
            strong
          />
          <Row label={`Minimum after ${(slippageBps / 100).toFixed(2)}% slippage`} value={`${formatUnits(minOut(expected, slippageBps), outDecimals, 4)} ${outSymbol}`} />
          <Row
            label="Price impact"
            value={`${impact.toFixed(2)}%`}
            tone={impact > 10 ? "var(--ember)" : impact > 3 ? "var(--honey)" : undefined}
          />
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <span className="kicker" style={{ marginRight: 2 }}>Slippage</span>
        {SLIPPAGE_PRESETS.map((bps) => (
          <button
            key={bps}
            className="chip"
            data-on={slippageBps === bps}
            onClick={() => setSlippageBps(bps)}
            style={{ cursor: "pointer" }}
          >
            {(bps / 100).toFixed(bps < 100 ? 2 : 0)}%
          </button>
        ))}
      </div>

      {exact == null && amountIn > 0n && (
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
          This curve cannot be quoted directly, so the figure above is approximate. The exact
          amount is read from the contract just before you sign, and the trade is protected by
          your slippage setting.
        </div>
      )}

      {impact > 10 && amountIn > 0n && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--ember)", lineHeight: 1.5 }}>
          This trade moves the curve by {impact.toFixed(1)}%. The curve is thin at this size,
          so you are paying well above the going rate. Try a smaller amount.
        </div>
      )}

      <button
        className="btn btn-primary"
        style={{ width: "100%", marginTop: 14, padding: "13px 16px", fontSize: 15 }}
        disabled={!isConnected || amountIn <= 0n || expected <= 0n || overBalance || busy !== null}
        onClick={trade}
      >
        {!isConnected
          ? `Connect wallet to ${side}`
          : amountIn <= 0n
            ? "Enter an amount"
            : overBalance
              ? `Not enough ${selling ? symbol : d.pairSymbol}`
              : busy === "approving"
                ? `Approving ${selling ? symbol : d.pairSymbol}…`
                : busy === "buying"
                  ? "Confirming…"
                  : `${selling ? "Sell" : "Buy"} ${symbol}`}
      </button>

      <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--faint)", lineHeight: 1.6 }}>
        Traded directly against the curve contract, signed in your own wallet. Launch tokens are
        permissionless and can be minted, taxed or rugged by their deployer. Never buy more than
        you are willing to lose.
      </div>
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
      <span style={{ color: "var(--faint)" }}>{label}</span>
      <span className="mono" style={{ color: tone ?? (strong ? "var(--text)" : "var(--muted)"), fontWeight: strong ? 600 : 400 }}>
        {value}
      </span>
    </div>
  );
}
