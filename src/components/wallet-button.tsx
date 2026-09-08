"use client";

import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { useEffect, useRef, useState } from "react";
import { robinhoodChain, addressUrl } from "@/lib/chain";
import { formatUnits, shortAddress } from "@/lib/format";

export function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: balance } = useBalance({ address, query: { enabled: !!address } });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const injectedConnector = connectors.find((c) => c.id === "injected") ?? connectors[0];
  const wrongChain = isConnected && chainId !== robinhoodChain.id;

  if (!isConnected) {
    return (
      <button
        className="btn btn-primary"
        onClick={() => injectedConnector && connect({ connector: injectedConnector })}
        disabled={isPending || !injectedConnector}
      >
        {isPending && <span className="spinner" />}
        <span className="connect-long">{isPending ? "Connecting" : "Connect wallet"}</span>
        <span className="connect-short">{isPending ? "…" : "Connect"}</span>
      </button>
    );
  }

  if (wrongChain) {
    return (
      <button
        className="btn"
        style={{ borderColor: "var(--honey)", color: "var(--honey)" }}
        onClick={() => switchChain({ chainId: robinhoodChain.id })}
      >
        <span className="connect-long">Switch to Robinhood Chain</span>
        <span className="connect-short">Switch</span>
      </button>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="live-dot" />
        <span className="mono" style={{ fontSize: 12.5 }}>
          {shortAddress(address)}
        </span>
      </button>
      {open && (
        <div
          className="panel rise"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            minWidth: 240,
            padding: 14,
            zIndex: 60,
          }}
        >
          <div className="kicker" style={{ marginBottom: 6 }}>
            Balance
          </div>
          <div className="mono font-display" style={{ fontSize: 22, fontWeight: 700 }}>
            {balance ? formatUnits(balance.value, balance.decimals, 5) : "—"}{" "}
            <span style={{ fontSize: 13, color: "var(--muted)" }}>ETH</span>
          </div>
          <hr className="hairline" style={{ margin: "12px 0" }} />
          <a
            href={address ? addressUrl(address) : "#"}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost"
            style={{ width: "100%", justifyContent: "flex-start", fontSize: 13 }}
          >
            View on explorer ↗
          </a>
          <button
            className="btn btn-ghost"
            style={{ width: "100%", justifyContent: "flex-start", fontSize: 13, color: "var(--ember)" }}
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
