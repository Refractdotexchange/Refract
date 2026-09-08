"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { WalletButton } from "./wallet-button";

const LINKS = [
  { href: "/", label: "Swap" },
  { href: "/pools", label: "Pools" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/rewards", label: "Rewards" },
  { href: "/engine", label: "Engine" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        borderBottom: "1px solid var(--line-soft)",
        background: "color-mix(in srgb, var(--bg) 72%, transparent)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <nav
        className="nav-wrap"
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "13px 22px",
          display: "flex",
          alignItems: "center",
          gap: 20,
        }}
      >
        <Link
          href="/"
          style={{ color: "var(--text)", textDecoration: "none", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 9 }}
        >
          <Wordmark size={28} />
          {/* The chain is live but the product is not finished: cashback does
              not settle yet and scans are window-bounded. Saying so in the
              brand lockup is more honest than a footnote nobody reads. */}
          <span className="beta-tag">BETA</span>
        </Link>

        {/* Layout lives in CSS, not inline: inline styles outrank the media
            query that moves these links onto their own row on small screens. */}
        <div className="nav-links scroll-thin">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  position: "relative",
                  padding: "8px 14px",
                  borderRadius: 10,
                  fontSize: 14.5,
                  fontWeight: active ? 650 : 500,
                  color: active ? "var(--text)" : "var(--muted)",
                  textDecoration: "none",
                  background: active ? "var(--surface-2)" : "transparent",
                  whiteSpace: "nowrap",
                  transition: "color .15s, background .15s",
                }}
              >
                {l.label}
                {active && (
                  <span
                    className="spectrum-rule"
                    style={{ position: "absolute", left: 14, right: 14, bottom: 2, height: 2 }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span
            className="chip nav-chip"
            style={{ cursor: "default" }}
            title="All data on this site is read live from Robinhood Chain (chain ID 4663)"
          >
            <span className="live-dot" />
            <span className="mono">4663</span>
          </span>
          <ThemeToggle />
          <WalletButton />
        </div>
      </nav>
    </header>
  );
}
