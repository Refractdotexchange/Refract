"use client";

import Link from "next/link";
import { useState } from "react";
import { PROJECT_TOKEN, tokenUrl } from "@/lib/chain";

/**
 * The project's contract address, with one-tap copy.
 *
 * Shown in full rather than truncated: a shortened address is exactly what an
 * impersonator relies on, since only the ends match. The link goes to our own
 * token page so the curve, supply and activity can be checked in one place.
 */
export function ContractBadge() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PROJECT_TOKEN.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked; the address is selectable on screen anyway */
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        padding: "10px 13px",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-md)",
        background: "color-mix(in srgb, var(--accent) 6%, transparent)",
      }}
    >
      <span className="mono" style={{ fontSize: 10.5, letterSpacing: "0.18em", color: "var(--accent)" }}>
        ${PROJECT_TOKEN.symbol} CA
      </span>
      <code
        className="mono wrap-anywhere"
        style={{ fontSize: 11.5, color: "var(--text)", userSelect: "all", flex: "1 1 auto", minWidth: 0 }}
      >
        {PROJECT_TOKEN.address}
      </code>
      <button
        onClick={copy}
        className="chip"
        style={{ cursor: "pointer", fontSize: 11, flexShrink: 0 }}
        aria-label="Copy contract address"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <Link
        href={`/token/${PROJECT_TOKEN.address}`}
        className="chip"
        style={{ textDecoration: "none", fontSize: 11, flexShrink: 0 }}
      >
        Chart →
      </Link>
      <a
        href={tokenUrl(PROJECT_TOKEN.address)}
        target="_blank"
        rel="noreferrer"
        className="chip"
        style={{ textDecoration: "none", fontSize: 11, flexShrink: 0 }}
      >
        Explorer ↗
      </a>
    </div>
  );
}
