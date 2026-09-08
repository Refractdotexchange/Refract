"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import { txUrl } from "@/lib/chain";
import { compact, shortAddress, timeAgo, usd } from "@/lib/format";
import type { RewardsSummary } from "@/lib/rewards";

export function RewardsTracker() {
  const { address: connected } = useAccount();
  const [input, setInput] = useState("");
  const [target, setTarget] = useState<string | null>(null);

  const active = target ?? connected ?? null;
  const valid = !!active && isAddress(active);

  const { data, isLoading, error } = useQuery<RewardsSummary>({
    queryKey: ["rewards", active],
    enabled: valid,
    queryFn: async () => {
      const r = await fetch(`/api/rewards/${active}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not load rewards");
      return d;
    },
    refetchInterval: 60_000,
  });

  const inputInvalid = input.trim().length > 0 && !isAddress(input.trim());

  return (
    <>
      {/* Rate tiles */}
      <div className="three-col" style={{ marginBottom: 14 }}>
        <RateTile
          label="Base rate"
          value={data ? `${(data.rateBps / 100).toFixed(2)}%` : "0.12%"}
          sub="of routed volume, every swap"
          tone="var(--gold)"
        />
        <RateTile
          label="Boosted rate"
          value={data ? `${(data.boostedBps / 100).toFixed(2)}%` : "0.30%"}
          sub="when $PRSM staking goes live"
          tone="var(--brass)"
          dim
        />
        <RateTile label="Minimum swap" value="0.001 ETH" sub="smaller swaps do not accrue" tone="var(--honey)" />
      </div>

      {/* Address lookup */}
      <div className="panel panel-lit" style={{ padding: 20 }}>
        <div className="kicker" style={{ marginBottom: 10 }}>
          Look up a wallet
        </div>
        <div className="stack-sm" style={{ display: "flex", gap: 9 }}>
          <input
            className="input mono"
            placeholder={connected ?? "0x…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && isAddress(input.trim()) && setTarget(input.trim())}
            style={{ flex: 1, fontSize: 13 }}
            aria-invalid={inputInvalid}
          />
          <button
            className="btn btn-primary"
            disabled={!isAddress(input.trim())}
            onClick={() => setTarget(input.trim())}
            style={{ flexShrink: 0 }}
          >
            Track
          </button>
        </div>
        {inputInvalid && (
          <div className="mono" style={{ color: "var(--ember)", fontSize: 11.5, marginTop: 8 }}>
            Enter a valid 0x wallet address
          </div>
        )}
        {!valid && !inputInvalid && (
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 9, lineHeight: 1.55 }}>
            Connect a wallet or paste an address to scan its routed volume.
          </div>
        )}
      </div>

      {!valid && (
        <div className="panel" style={{ padding: 26, marginTop: 12 }}>
          <div className="kicker" style={{ marginBottom: 14 }}>
            How accrual works
          </div>
          <div className="three-col">
            {[
              {
                n: "1",
                t: "Trade through REFRACT",
                d: "Any swap routed through a Uniswap pool on chain 4663 counts, from any wallet.",
              },
              {
                n: "2",
                t: "Volume is measured",
                d: "We read the ETH leg of each of your swaps directly from its on-chain event.",
              },
              {
                n: "3",
                t: "0.12% accrues",
                d: "Your share is computed per swap. Everything here is auditable against the chain.",
              },
            ].map((s) => (
              <div key={s.n} className="panel-flat" style={{ padding: 16 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: "var(--meter)",
                    color: "var(--accent-ink)",
                    fontWeight: 800,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 11,
                  }}
                >
                  {s.n}
                </div>
                <div style={{ fontWeight: 650, fontSize: 14, marginBottom: 6 }}>{s.t}</div>
                <div style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.6 }}>{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {valid && (
        <div style={{ marginTop: 14 }}>
          {isLoading && (
            <div className="panel" style={{ padding: 22, display: "flex", gap: 11, alignItems: "center" }}>
              <span className="spinner" style={{ color: "var(--gold)" }} />
              <span style={{ color: "var(--muted)", fontSize: 14 }}>
                Scanning swap history for {shortAddress(active!, 5)}…
              </span>
            </div>
          )}

          {error && (
            <div className="panel" style={{ padding: 22, color: "var(--ember)", fontSize: 13.5 }}>
              {(error as Error).message}
            </div>
          )}

          {data && (
            <>
              <div className="panel panel-lit" style={{ padding: 24, textAlign: "center" }}>
                <div className="kicker">Accrued cashback</div>
                <div
                  className="font-display mono spectrum-text"
                  style={{ fontSize: 46, fontWeight: 700, margin: "10px 0 2px", letterSpacing: "-0.03em" }}
                >
                  {data.accruedEth > 0 ? data.accruedEth.toFixed(6) : "0.000000"}
                </div>
                <div className="mono" style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  ETH {data.accruedUsd != null && `· ${usd(data.accruedUsd)}`}
                </div>

                <div className="three-col" style={{ marginTop: 22 }}>
                  <MiniStat label="Routed volume" value={`${compact(data.volumeEth, 4)} ETH`} />
                  <MiniStat label="Qualifying swaps" value={compact(data.qualifyingSwaps, 0)} />
                  <MiniStat label="Swaps found" value={compact(data.totalSwaps, 0)} />
                </div>

                <div
                  className="panel-flat"
                  style={{ marginTop: 16, padding: "11px 15px", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6, textAlign: "left" }}
                >
                  Balances accrue continuously and settle when the distributor contract goes live.
                  Nothing is claimable yet — this figure is an audit of what your volume has earned,
                  computed from the last {compact(data.scannedBlocks, 0)} blocks.
                </div>
              </div>

              {data.swaps.length > 0 && (
                <section style={{ marginTop: 26 }}>
                  <h2 className="font-display" style={{ fontSize: 18, fontWeight: 700, margin: "0 0 12px" }}>
                    Recent routed swaps
                  </h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {data.swaps.map((s) => (
                      <div
                        key={`${s.txHash}-${s.block}-${s.poolAddress}`}
                        className="panel-flat"
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 15px", flexWrap: "wrap" }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: s.protocol.includes("V3") ? "var(--gold)" : "var(--brass)",
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ flex: "1 1 120px", fontSize: 13, fontWeight: 600 }}>{s.protocol}</span>
                        <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
                          {(s.notionalEth ?? 0).toFixed(5)} ETH
                        </span>
                        <span
                          className="mono"
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: s.status === "accruing" ? "var(--olive)" : "var(--faint)",
                            minWidth: 92,
                            textAlign: "right",
                          }}
                        >
                          {s.status === "accruing" ? `+${(s.rewardEth ?? 0).toFixed(7)}` : "below min"}
                        </span>
                        <a
                          href={txUrl(s.txHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="mono"
                          style={{ fontSize: 10.5, color: "var(--faint)", textDecoration: "none", whiteSpace: "nowrap" }}
                        >
                          {timeAgo(s.at)} ↗
                        </a>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {data.totalSwaps === 0 && (
                <div className="panel" style={{ padding: 32, textAlign: "center", marginTop: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>No routed swaps in this window</div>
                  <div style={{ color: "var(--muted)", fontSize: 13.5, marginTop: 7, lineHeight: 1.6 }}>
                    This wallet has not traded through a Uniswap pool on chain 4663 in the last{" "}
                    {compact(data.scannedBlocks, 0)} blocks.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

function RateTile({
  label,
  value,
  sub,
  tone,
  dim,
}: {
  label: string;
  value: string;
  sub: string;
  tone: string;
  dim?: boolean;
}) {
  return (
    <div className="panel" style={{ padding: "17px 18px", opacity: dim ? 0.72 : 1 }}>
      <div className="kicker" style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 6, height: 6, borderRadius: 2, background: tone }} />
        {label}
      </div>
      <div className="font-display mono" style={{ fontSize: 26, fontWeight: 700, marginTop: 8, color: tone }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-flat" style={{ padding: "11px 12px" }}>
      <div className="mono font-display" style={{ fontSize: 17, fontWeight: 700 }}>
        {value}
      </div>
      <div className="kicker" style={{ fontSize: 9.5, marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}
