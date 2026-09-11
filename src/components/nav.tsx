"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SOCIALS } from "@/lib/chain";
import { Wordmark } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { WalletButton } from "./wallet-button";

const LINKS = [
  { href: "/", label: "Swap" },
  { href: "/pools", label: "Pools" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/private", label: "Private" },
  { href: "/rewards", label: "Rewards" },
  { href: "/engine", label: "Engine" },
  { href: "/roadmap", label: "Roadmap" },
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
          {/* Icon-only in the nav so it survives the small-screen layout;
              the footer carries the handle in full. */}
          <a
            className="btn btn-ghost nav-x"
            href={SOCIALS.x}
            target="_blank"
            rel="noreferrer"
            aria-label={`REFRACT on X (${SOCIALS.xHandle})`}
            title={`REFRACT on X · ${SOCIALS.xHandle}`}
            style={{ padding: 9, borderRadius: 999, display: "inline-flex" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ display: "block" }}>
              <path d="M18.9 2H22l-7.1 8.1L23.2 22h-6.6l-5.1-6.7L5.6 22H2.5l7.6-8.7L1.2 2h6.8l4.6 6.1L18.9 2Zm-1.1 18.1h1.7L7.3 3.8H5.5l12.3 16.3Z" />
            </svg>
          </a>
          <a
            className="btn btn-ghost nav-x"
            href={SOCIALS.github}
            target="_blank"
            rel="noreferrer"
            aria-label="REFRACT source on GitHub"
            title="REFRACT source on GitHub"
            style={{ padding: 9, borderRadius: 999, display: "inline-flex" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ display: "block" }}>
              <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2 0-.4-.5-1.6.2-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.6 18.3 5 18.3 5c.7 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z" />
            </svg>
          </a>
          <ThemeToggle />
          <WalletButton />
        </div>
      </nav>
    </header>
  );
}
