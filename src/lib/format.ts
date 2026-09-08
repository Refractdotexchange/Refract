/** Formatting helpers shared by server and client. All pure, no deps. */

export function shortAddress(a?: string, size = 4) {
  if (!a) return "";
  return `${a.slice(0, 2 + size)}…${a.slice(-size)}`;
}

/** Format a bigint of `decimals` precision into a readable decimal string. */
export function formatUnits(value: bigint, decimals: number, maxFrac = 6): string {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = v % base;
  let fracStr = frac.toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${wholeStr}${fracStr ? "." + fracStr : ""}`;
}

/** Parse a user-typed decimal string into a bigint of `decimals` precision. */
export function parseUnits(input: string, decimals: number): bigint {
  const clean = input.trim().replace(/,/g, "");
  if (!clean || !/^\d*\.?\d*$/.test(clean)) return 0n;
  const [w = "0", f = ""] = clean.split(".");
  const frac = f.slice(0, decimals).padEnd(decimals, "0");
  return BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0");
}

/** Compact notation for dashboards: 1.2K / 3.4M / 5.6B. */
export function compact(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) return (n / size).toFixed(digits).replace(/\.?0+$/, "") + suffix;
  }
  if (abs === 0) return "0";
  if (abs < 0.0001) return n.toExponential(2);
  return n.toFixed(abs < 1 ? 4 : digits).replace(/\.?0+$/, "");
}

export function usd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return "$" + compact(n);
  if (Math.abs(n) < 0.01 && n !== 0) return "$" + n.toPrecision(2);
  return "$" + n.toFixed(2);
}

/** "3m ago" / "5h ago" / "2d ago" from a unix seconds timestamp. */
export function timeAgo(unixSeconds: number, now = Date.now()): string {
  if (!unixSeconds) return "—";
  const s = Math.max(0, Math.floor(now / 1000 - unixSeconds));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Deterministic 32-bit hash — used to derive token avatar colours from an address. */
export function hashCode(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function isAddressLike(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s.trim());
}
