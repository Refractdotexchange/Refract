import { hashCode } from "@/lib/format";

/**
 * The refraction ramp, light to deep. These are the design tokens rather than
 * literals so the mark inverts correctly between the black and white themes —
 * a hard-coded white mark would vanish on the light ground.
 */
const SPECTRUM = [
  "var(--champagne)",
  "var(--honey)",
  "var(--gold)",
  "var(--brass)",
  "var(--bronze)",
] as const;

/**
 * The REFRACT mark: a beam entering a triangle and leaving as a spectrum fan.
 * Drawn as vector so it stays crisp at every size and needs no image assets.
 */
export function RefractMark({ size = 30, animated = false }: { size?: number; animated?: boolean }) {
  const uid = animated ? "anim" : "static";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      <defs>
        <linearGradient id={`pm-body-${uid}`} x1="16" y1="4" x2="16" y2="28">
          <stop offset="0%" stopColor="var(--champagne)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--bronze)" stopOpacity="0.32" />
        </linearGradient>
      </defs>

      {/* incoming white beam */}
      <path d="M0.5 14.2 H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />

      {/* refract body */}
      <path
        d="M16 3.6 L28.6 27.2 H3.4 Z"
        stroke={`url(#pm-body-${uid})`}
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill="color-mix(in srgb, var(--gold) 12%, transparent)"
      />

      {/* refracted spectrum fan */}
      <g strokeWidth="1.7" strokeLinecap="round">
        <path d="M18.5 15.4 L32 10.6" stroke={SPECTRUM[0]} />
        <path d="M18.7 16.6 L32 14.2" stroke={SPECTRUM[1]} />
        <path d="M18.9 17.8 L32 17.8" stroke={SPECTRUM[2]} />
        <path d="M19.1 19.0 L32 21.4" stroke={SPECTRUM[3]} />
        <path d="M19.3 20.2 L32 25.0" stroke={SPECTRUM[4]} />
      </g>
    </svg>
  );
}

export function Wordmark({ size = 30 }: { size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <RefractMark size={size} />
      <span
        className="font-display brand-word"
        style={{ fontSize: size * 0.66, fontWeight: 700, letterSpacing: "-0.055em" }}
      >
        REFRACT
      </span>
    </span>
  );
}

/**
 * Hero graphic — an animated refraction. The spectrum rays draw themselves in
 * sequence, which reads as "one input, many routes, value back out".
 */
export function RefractBeam({ className = "" }: { className?: string }) {
  const rays = [
    { d: "M232 168 L560 96", c: "var(--champagne)", delay: 0 },
    { d: "M234 180 L560 140", c: "var(--honey)", delay: 0.14 },
    { d: "M236 192 L560 186", c: "color-mix(in srgb, var(--honey) 50%, var(--gold))", delay: 0.28 },
    { d: "M238 204 L560 232", c: "var(--gold)", delay: 0.42 },
    { d: "M240 216 L560 278", c: "var(--brass)", delay: 0.56 },
    { d: "M242 228 L560 322", c: "var(--bronze)", delay: 0.7 },
  ];

  return (
    <svg
      viewBox="0 0 560 400"
      className={className}
      fill="none"
      aria-hidden="true"
      style={{ width: "100%", height: "auto", overflow: "visible" }}
    >
      <defs>
        <linearGradient id="pb-face" x1="200" y1="70" x2="200" y2="330">
          <stop offset="0%" stopColor="var(--honey)" stopOpacity="0.32" />
          <stop offset="60%" stopColor="var(--brass)" stopOpacity="0.13" />
          <stop offset="100%" stopColor="var(--bronze)" stopOpacity="0.06" />
        </linearGradient>
        <linearGradient id="pb-edge" x1="200" y1="70" x2="200" y2="330">
          <stop offset="0%" stopColor="var(--champagne)" />
          <stop offset="100%" stopColor="var(--bronze)" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id="pb-entry" x1="0" y1="0" x2="196" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--text)" stopOpacity="0.05" />
          <stop offset="70%" stopColor="var(--text)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--text)" stopOpacity="1" />
        </linearGradient>
        <filter id="pb-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* incoming beam */}
      <path d="M0 196 H196" stroke="url(#pb-entry)" strokeWidth="3" strokeLinecap="round" />
      {/* No glow filter here — its filter region renders as a dark box behind
          the moving dot. A layered halo circle gives the same look cleanly. */}
      <circle r="9" fill="var(--honey)" opacity="0.28">
        <animateMotion dur="2.6s" repeatCount="indefinite" path="M0 196 H190" />
      </circle>
      <circle r="4" fill="var(--text)">
        <animateMotion dur="2.6s" repeatCount="indefinite" path="M0 196 H190" />
      </circle>

      {/* refract */}
      <path
        d="M204 62 L330 330 H78 Z"
        fill="url(#pb-face)"
        stroke="url(#pb-edge)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />

      {/* refracted rays */}
      <g strokeWidth="2.4" strokeLinecap="round" filter="url(#pb-glow)">
        {rays.map((r) => (
          <path
            key={r.d}
            d={r.d}
            stroke={r.c}
            strokeDasharray="340"
            style={{
              animation: `beam-travel 2.4s cubic-bezier(.4,0,.2,1) ${r.delay}s infinite`,
            }}
          />
        ))}
      </g>
    </svg>
  );
}

/**
 * Procedural token avatar. Launchpad tokens almost never ship a logo, so we
 * derive a stable two-tone gradient from the contract address instead of
 * showing an identical grey placeholder for every row.
 */
export function TokenAvatar({
  address,
  symbol,
  size = 34,
  logoUrl,
}: {
  address: string;
  symbol?: string;
  size?: number;
  logoUrl?: string | null;
}) {
  // No hue to vary in a monochrome theme, so an avatar's identity comes from
  // its lightness step and gradient angle instead. The band is held mid-range
  // (44-69%) so the same avatar stays legible on both grounds.
  const h = hashCode(address.toLowerCase());
  const angle = (h >> 3) % 360;
  // Hue is constrained to the 96-150deg green band: adjacent to the lime accent
  // so avatars sit inside the palette, but clear enough of it that a token
  // never reads as an accent chip.
  const hue = 96 + (h % 54);
  const hue2 = (hue + 8 + ((h >> 13) % 16)) % 360;
  const light = 44 + (h % 26);
  const light2 = Math.max(16, light - 20 - ((h >> 9) % 12));
  const letters = (symbol || address.slice(2, 4)).replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();

  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(${angle}deg, hsl(${hue} 74% ${light}%), hsl(${hue2} 66% ${light2}%))`,
        color: "rgba(255,255,255,.94)",
        fontSize: size * 0.36,
        fontWeight: 700,
        letterSpacing: "-0.02em",
        textShadow: "0 1px 3px rgba(0,0,0,.45)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.16)",
        userSelect: "none",
      }}
    >
      {letters}
      {logoUrl ? (
        // Layered over the generated avatar rather than replacing it. An
        // <img> with an empty alt renders nothing when it fails, so a dead
        // IPFS gateway leaves the fallback visible instead of a broken icon —
        // and it needs no error handler, so this stays a server component.
        <img
          // eslint-disable-next-line @next/next/no-img-element
          src={logoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "50%",
          }}
        />
      ) : null}
    </span>
  );
}

export function Aurora() {
  return (
    <>
      <div className="aurora" aria-hidden="true">
        <div className="aurora-blob aurora-a" />
        <div className="aurora-blob aurora-b" />
        <div className="aurora-blob aurora-c" />
      </div>
      <div className="grid-veil" aria-hidden="true" />
    </>
  );
}
