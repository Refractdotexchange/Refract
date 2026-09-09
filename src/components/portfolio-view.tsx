"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import { TokenAvatar } from "./brand";
import { SafeText } from "./safe-text";
import { compact, shortAddress, usd } from "@/lib/format";

type Holding = {
  token: string;
  symbol: string;
  name: string;
  amount: number;
  priceEth: number | null;
  valueEth: number | null;
  valueUsd: number | null;
  venue: string | null;
  logoUrl: string | null;
};

type Portfolio = {
  address: string;
  nativeEth: number;
  nativeUsd: number | null;
  holdings: Holding[];
  totalUsd: number | null;
  tokensScanned: number;
  scannedBlocks: number;
  ethUsd: number | null;
};

export function PortfolioView() {
  const { address: connected } = useAccount();
  const [input, setInput] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const active = target ?? connected ?? null;
  const valid = !!active && isAddress(active);

  const { data, isLoading, error } = useQuery<Portfolio>({
    queryKey: ["portfolio", active],
    enabled: valid,
    queryFn: async () => {
      const r = await fetch(`/api/portfolio/${active}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not load portfolio");
      return d;
    },
    refetchInterval: 60_000,
  });

  const invalid = input.trim().length > 0 && !isAddress(input.trim());
  const unpriced = data?.holdings.filter((h) => h.valueUsd == null).length ?? 0;

  return (
    <>
      <div className="panel panel-lit" style={{ padding: 18 }}>
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
            style={{ flex: 1, fontSize: 13, minWidth: 0 }}
          />
          <button
            className="btn btn-primary"
            disabled={!isAddress(input.trim())}
            onClick={() => setTarget(input.trim())}
            style={{ flexShrink: 0 }}
          >
            Load
          </button>
        </div>
        {invalid && (
          <div className="mono" style={{ color: "var(--ember)", fontSize: 11.5, marginTop: 8 }}>
            Enter a valid 0x wallet address
          </div>
        )}
        {!valid && !invalid && (
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 9 }}>
            Connect a wallet or paste an address to scan its holdings.
          </div>
        )}
      </div>

      {valid && isLoading && (
        <div className="panel" style={{ padding: 22, marginTop: 12, display: "flex", gap: 11, alignItems: "center" }}>
          <span className="spinner" style={{ color: "var(--gold)" }} />
          <span style={{ color: "var(--muted)", fontSize: 14 }}>
            Scanning transfers for {shortAddress(active!, 5)}…
          </span>
        </div>
      )}

      {error && (
        <div className="panel" style={{ padding: 22, marginTop: 12, color: "var(--ember)", fontSize: 13.5 }}>
          {(error as Error).message}
        </div>
      )}

      {data && (
        <>
          <div className="panel panel-lit" style={{ padding: 24, marginTop: 12, textAlign: "center" }}>
            <div className="kicker">Total value</div>
            <div
              className="font-display mono spectrum-text"
              style={{ fontSize: 42, fontWeight: 700, margin: "10px 0 4px", letterSpacing: "-0.03em" }}
            >
              {data.totalUsd != null ? usd(data.totalUsd) : "—"}
            </div>
            <div className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
              {data.nativeEth.toFixed(5)} ETH native · {data.holdings.length} token
              {data.holdings.length === 1 ? "" : "s"} held
            </div>
            {unpriced > 0 && (
              <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginTop: 8, lineHeight: 1.5 }}>
                {unpriced} holding{unpriced === 1 ? "" : "s"} have no pool yet, so they carry no
                price and are excluded from the total.
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
            <Row
              avatar={<TokenAvatar address="0x0000000000000000000000000000000000000000" symbol="ETH" size={32} />}
              symbol="ETH"
              name="Ether (native)"
              amount={data.nativeEth}
              valueUsd={data.nativeUsd}
              venue="native"
            />
            {data.holdings.map((h) => (
              <Link
                key={h.token}
                href={`/token/${h.token}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <Row
                  avatar={<TokenAvatar address={h.token} symbol={h.symbol} size={32} logoUrl={h.logoUrl} />}
                  symbol={h.symbol}
                  name={h.name}
                  amount={h.amount}
                  valueUsd={h.valueUsd}
                  venue={h.venue}
                  masked
                />
              </Link>
            ))}
          </div>

          {data.holdings.length === 0 && (
            <div className="panel" style={{ padding: 32, textAlign: "center", marginTop: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>No token balances found</div>
              <div style={{ color: "var(--muted)", fontSize: 13.5, marginTop: 7, lineHeight: 1.6 }}>
                This wallet has not received an ERC-20 on chain 4663 in the last{" "}
                {compact(data.scannedBlocks, 0)} blocks.
              </div>
            </div>
          )}

          <p className="mono" style={{ color: "var(--faint)", fontSize: 10.5, marginTop: 16, lineHeight: 1.7 }}>
            Scanned {compact(data.scannedBlocks, 0)} blocks · {data.tokensScanned} contracts touched.
            Values are marks from the deepest pool, not quotes. Thin pools will not fill at this
            price.
          </p>
        </>
      )}
    </>
  );
}

function Row({
  avatar,
  symbol,
  name,
  amount,
  valueUsd,
  venue,
  masked,
}: {
  avatar: React.ReactNode;
  symbol: string;
  name: string;
  amount: number;
  valueUsd: number | null;
  venue: string | null;
  masked?: boolean;
}) {
  return (
    <div
      className="panel-flat"
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 15px" }}
    >
      {avatar}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="clip-text" style={{ fontWeight: 650, fontSize: 14 }}>
          {masked ? <SafeText value={symbol} /> : symbol}
        </div>
        <div className="clip-text" style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>
          {masked ? <SafeText value={name} /> : name}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div className="mono" style={{ fontSize: 13.5, fontWeight: 600 }}>
          {valueUsd != null ? usd(valueUsd) : "—"}
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 2 }}>
          {compact(amount, 3)} {venue ? `· ${venue}` : "· no pool"}
        </div>
      </div>
    </div>
  );
}
