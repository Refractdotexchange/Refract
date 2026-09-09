"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { TokenAvatar } from "./brand";
import { CurveBuy } from "./curve-buy";
import { SafeText } from "./safe-text";
import { useToast } from "./toast";
import { addressUrl, tokenUrl } from "@/lib/chain";
import { compact, shortAddress, usd } from "@/lib/format";
import { ActivityBars, PriceChart, type Point } from "./chart";

type Venue = {
  protocol: string;
  address: string;
  fee?: number;
  priceEth: number | null;
  liquidityEth: number | null;
};

type TokenData = {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  supplyFormatted: number;
  venues: Venue[];
  priceEth: number | null;
  priceUsd: number | null;
  fdvUsd: number | null;
  liquidityEth: number;
  ethUsd: number | null;
  logoUrl: string | null;
  description: string | null;
};

type History = {
  points: Point[];
  curveActivity: { t: number; block: number; count: number }[];
  changePct: number | null;
  volumeEth: number;
  trades: number;
  ethUsd: number | null;
  scannedBlocks: number;
};

export function TokenDetail({ address }: { address: string }) {
  const { push } = useToast();
  const history = useQuery<History>({
    queryKey: ["history", address],
    queryFn: async () => {
      const r = await fetch(`/api/history/${address}?window=100000`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "History unavailable");
      return d;
    },
    refetchInterval: 60_000,
  });
  const { data, isLoading, error } = useQuery<TokenData>({
    queryKey: ["token", address],
    queryFn: async () => {
      const r = await fetch(`/api/token/${address}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Token unavailable");
      return d;
    },
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="panel" style={{ padding: 26 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div className="skeleton" style={{ width: 56, height: 56, borderRadius: "50%" }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 22, width: 180 }} />
            <div className="skeleton" style={{ height: 13, width: 260, marginTop: 9 }} />
          </div>
        </div>
        <div className="three-col" style={{ marginTop: 24 }}>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skeleton" style={{ height: 84 }} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="panel" style={{ padding: 34, textAlign: "center" }}>
        <div className="font-display" style={{ fontSize: 19, fontWeight: 700 }}>
          Could not load this token
        </div>
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 9, lineHeight: 1.6 }}>
          {(error as Error)?.message ?? "The contract did not respond as an ERC-20 on chain 4663."}
        </p>
        <Link href="/pools" className="btn" style={{ marginTop: 16 }}>
          Back to pools
        </Link>
      </div>
    );
  }

  const copy = () => {
    navigator.clipboard?.writeText(data.address);
    push({ tone: "success", title: "Contract address copied" });
  };

  return (
    <>
      <div className="panel panel-lit" style={{ padding: 24 }}>
        <div className="stack-sm" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <TokenAvatar address={data.address} symbol={data.symbol} size={58} logoUrl={data.logoUrl} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 className="font-display wrap-anywhere" style={{ fontSize: 30, fontWeight: 700, margin: 0, letterSpacing: "-0.03em" }}>
              <SafeText value={data.symbol} />
            </h1>
            <div className="wrap-anywhere" style={{ color: "var(--muted)", fontSize: 14.5, marginTop: 3 }}>
              <SafeText value={data.name} />
            </div>
            {data.description && data.description !== data.name && (
              // The deployer's own blurb, straight off the contract. Runs
              // through SafeText like every other on-chain string.
              <div
                className="wrap-anywhere"
                style={{ color: "var(--faint)", fontSize: 13, marginTop: 6, maxWidth: 560 }}
              >
                <SafeText value={data.description} />
              </div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="kicker">Price</div>
            <div className="font-display mono" style={{ fontSize: 27, fontWeight: 700, marginTop: 4 }}>
              {data.priceUsd != null
                ? data.priceUsd < 0.01
                  ? `$${data.priceUsd.toPrecision(3)}`
                  : usd(data.priceUsd)
                : "—"}
            </div>
            {data.priceEth != null && (
              <div className="mono" style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}>
                {data.priceEth.toPrecision(4)} ETH
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
          <button className="chip" onClick={copy}>
            <span className="mono">{shortAddress(data.address, 6)}</span> ⧉
          </button>
          <a className="chip" href={tokenUrl(data.address)} target="_blank" rel="noreferrer">
            Explorer ↗
          </a>
          <Link className="chip" href={`/?buy=${data.address}`}>
            Swap this token →
          </Link>
        </div>
      </div>

      <div className="three-col" style={{ marginTop: 12 }}>
        <Stat label="Fully diluted value" value={data.fdvUsd != null ? usd(data.fdvUsd) : "—"} tone="var(--gold)" />
        <Stat
          label="Pooled liquidity"
          value={
            data.ethUsd != null
              ? usd(data.liquidityEth * data.ethUsd)
              : `${compact(data.liquidityEth)} ETH`
          }
          sub={`${data.liquidityEth.toFixed(4)} ETH across ${data.venues.length} venue${data.venues.length === 1 ? "" : "s"}`}
          tone="var(--brass)"
        />
        <Stat label="Total supply" value={compact(data.supplyFormatted, 2)} sub={`${data.decimals} decimals`} tone="var(--honey)" />
      </div>

      <section style={{ marginTop: 26 }}>
        <div
          className="stack-sm"
          style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 12 }}
        >
          <h2 className="font-display" style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            {history.data && history.data.points.length > 0 ? "Executed price" : "Curve activity"}
          </h2>
          {history.data && (
            <span className="mono" style={{ fontSize: 11.5, color: "var(--faint)" }}>
              {history.data.trades > 0 && (
                <>
                  {compact(history.data.volumeEth, 3)} ETH volume ·{" "}
                  {history.data.changePct != null && (
                    <b
                      style={{
                        color:
                          history.data.changePct >= 0 ? "var(--olive)" : "var(--ember)",
                      }}
                    >
                      {history.data.changePct >= 0 ? "+" : ""}
                      {history.data.changePct.toFixed(1)}%
                    </b>
                  )}{" "}
                  ·{" "}
                </>
              )}
              last {compact(history.data.scannedBlocks, 0)} blocks
            </span>
          )}
        </div>

        {history.isLoading ? (
          <div className="skeleton" style={{ height: 260, borderRadius: 14 }} />
        ) : history.data && history.data.points.length > 0 ? (
          <PriceChart points={history.data.points} ethUsd={history.data.ethUsd} />
        ) : (
          <>
            <ActivityBars buckets={history.data?.curveActivity ?? []} />
            <p style={{ color: "var(--faint)", fontSize: 12, marginTop: 9, lineHeight: 1.6 }}>
              This token has no Uniswap pool yet, so there is no executed price to chart. The bars
              show transfer activity per block bucket while it trades on its launch curve.
            </p>
          </>
        )}
      </section>

      {/* Pre-graduation tokens have no Uniswap pool, so the curve is the only
          place to buy them. Renders nothing once a token has graduated. */}
      {data.venues.length === 0 && (
        <section style={{ marginTop: 30 }}>
          <CurveBuy token={data.address as `0x${string}`} symbol={data.symbol} />
        </section>
      )}

      <section style={{ marginTop: 30 }}>
        <h2 className="font-display" style={{ fontSize: 20, fontWeight: 700, margin: "0 0 13px" }}>
          Venues
        </h2>

        {data.venues.length === 0 ? (
          <div className="panel" style={{ padding: 26, color: "var(--muted)", fontSize: 14, lineHeight: 1.6 }}>
            No Uniswap pool exists for this token yet. It is still trading on its launch bonding
            curve. Once it graduates, its pools will appear here.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.venues.map((v) => (
              <div
                key={v.address}
                className="panel"
                style={{ padding: "14px 17px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 2,
                    background: v.protocol.includes("V3") ? "var(--gold)" : "var(--brass)",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                  <div style={{ fontWeight: 650, fontSize: 14.5 }}>
                    {v.protocol}
                    {v.fee != null && (
                      <span className="mono" style={{ color: "var(--faint)", fontWeight: 400, fontSize: 11.5, marginLeft: 8 }}>
                        {(v.fee / 10_000).toFixed(2)}% fee
                      </span>
                    )}
                  </div>
                  <a
                    href={addressUrl(v.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="mono"
                    style={{ fontSize: 11, color: "var(--faint)", textDecoration: "none" }}
                  >
                    {shortAddress(v.address, 6)} ↗
                  </a>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="kicker" style={{ fontSize: 9.5 }}>
                    Pool liquidity
                  </div>
                  <div className="mono" style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>
                    {(v.liquidityEth ?? 0).toFixed(4)} ETH
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <p style={{ color: "var(--faint)", fontSize: 12, lineHeight: 1.65, marginTop: 26 }}>
        Prices come from the deepest pool holding this token, read from contract state at the head
        of chain 4663. Permissionless launch tokens can be minted, taxed or rugged by their
        deployer. Always read the contract before trading.
      </p>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className="panel" style={{ padding: "16px 18px" }}>
      <div className="kicker" style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 6, height: 6, borderRadius: 2, background: tone }} />
        {label}
      </div>
      <div className="font-display mono" style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>
        {value}
      </div>
      {sub && (
        <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
