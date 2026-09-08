"use client";

import { useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { TokenAvatar } from "./brand";
import { SafeText } from "./safe-text";
import { shortAddress } from "@/lib/format";
import { BASE_TOKENS, loadImported, saveImported, type TokenInfo } from "@/lib/tokens";
import { useToast } from "./toast";

export function TokenSelect({
  open,
  onClose,
  onSelect,
  exclude,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (t: TokenInfo) => void;
  exclude?: TokenInfo;
}) {
  const [query, setQuery] = useState("");
  const [imported, setImported] = useState<TokenInfo[]>([]);
  const [lookup, setLookup] = useState<TokenInfo | null>(null);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { push } = useToast();

  useEffect(() => {
    if (open) {
      setImported(loadImported());
      setQuery("");
      setLookup(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const all = useMemo(() => [...BASE_TOKENS, ...imported], [imported]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = all.filter((t) => t.address.toLowerCase() !== exclude?.address.toLowerCase());
    if (!q) return list;
    return list.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q),
    );
  }, [all, query, exclude]);

  // Paste any contract address and we resolve it live from chain 4663.
  useEffect(() => {
    const q = query.trim();
    if (!isAddress(q)) {
      setLookup(null);
      setError(null);
      return;
    }
    if (all.some((t) => t.address.toLowerCase() === q.toLowerCase())) return;

    let cancelled = false;
    setLooking(true);
    setError(null);
    fetch(`/api/token/${q}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) {
          setError(d.error);
          setLookup(null);
        } else {
          setLookup({
            address: d.address,
            symbol: d.symbol,
            name: d.name,
            decimals: d.decimals,
            // Carried through so an imported token keeps its art in the
            // picker, the swap card and everywhere else it is rendered.
            logoUrl: d.logoUrl ?? null,
          });
        }
      })
      .catch(() => !cancelled && setError("Lookup failed — check the address and try again."))
      .finally(() => !cancelled && setLooking(false));

    return () => {
      cancelled = true;
    };
  }, [query, all]);

  const importToken = (t: TokenInfo) => {
    const next = [t, ...imported.filter((x) => x.address.toLowerCase() !== t.address.toLowerCase())];
    setImported(next);
    saveImported(next);
    push({ tone: "success", title: `${t.symbol} imported`, body: "Saved to your local token list." });
    onSelect(t);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Select a token"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "color-mix(in srgb, var(--bg) 78%, transparent)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
    >
      <div
        className="panel panel-lit rise"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 440,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          padding: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 className="font-display" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            Select a token
          </h2>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: "4px 9px" }}>
            ✕
          </button>
        </div>

        <input
          autoFocus
          className="input mono"
          placeholder="Search name, symbol, or paste 0x contract"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginTop: 13, fontSize: 13 }}
        />

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0 4px" }}>
          {BASE_TOKENS.map((t) => (
            <button key={t.address} className="chip" onClick={() => { onSelect(t); onClose(); }}>
              <TokenAvatar address={t.address} symbol={t.symbol} size={16} logoUrl={t.logoUrl} />
              {t.symbol}
            </button>
          ))}
        </div>

        <div className="scroll-thin" style={{ overflowY: "auto", flex: 1, marginTop: 8, minHeight: 140 }}>
          {looking && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 18, color: "var(--muted)", fontSize: 13 }}>
              <span className="spinner" /> Reading contract from chain 4663…
            </div>
          )}

          {error && (
            <div className="mono" style={{ color: "var(--ember)", fontSize: 12, padding: "14px 4px" }}>
              {error}
            </div>
          )}

          {lookup && (
            <div className="panel-flat" style={{ padding: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <TokenAvatar address={lookup.address} symbol={lookup.symbol} size={34} logoUrl={lookup.logoUrl} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="clip-text" style={{ fontWeight: 650, fontSize: 14 }}>
                  <SafeText value={lookup.name} />
                </div>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                  {lookup.symbol} · {shortAddress(lookup.address, 5)}
                </div>
              </div>
              <button className="btn btn-primary" style={{ padding: "8px 14px", fontSize: 13 }} onClick={() => importToken(lookup)}>
                Import
              </button>
            </div>
          )}

          {filtered.map((t) => (
            <button
              key={t.address}
              onClick={() => { onSelect(t); onClose(); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                background: "none",
                border: 0,
                borderRadius: 12,
                padding: "10px 10px",
                cursor: "pointer",
                color: "var(--text)",
                textAlign: "left",
                font: "inherit",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <TokenAvatar address={t.address} symbol={t.symbol} size={32} logoUrl={t.logoUrl} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="clip-text" style={{ fontWeight: 600, fontSize: 14 }}>
                  <SafeText value={t.name} />
                </div>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  {t.symbol} {!t.native && `· ${shortAddress(t.address, 4)}`}
                </div>
              </div>
            </button>
          ))}

          {!looking && !lookup && filtered.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--faint)", fontSize: 13, padding: "34px 12px", lineHeight: 1.6 }}>
              Nothing matches that.
              <br />
              Paste a contract address to look it up on-chain.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
