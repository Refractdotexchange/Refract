import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, random } from "remotion";
import { C, FONT, SPECTRUM, SITE } from "./theme";

/* ---------- rig helpers ------------------------------------------------- */

/** Slow vertical float. Every character in every scene shares this so the
    films feel like one world. */
export const useBob = (amp = 10, period = 90, phase = 0) => {
  const f = useCurrentFrame();
  return Math.sin(((f + phase) / period) * Math.PI * 2) * amp;
};

/** Irregular blinking. A fixed period reads robotic, so the gap is jittered
    per cycle from Remotion's seeded random (still deterministic per frame). */
export const useBlink = (offset = 0) => {
  const f = useCurrentFrame() + offset;
  const cycle = Math.floor(f / 78);
  const jitter = random(`blink-${cycle}`) * 34;
  const t = (f % 78) - jitter;
  if (t < 0 || t > 7) return 0;
  return Math.sin((t / 7) * Math.PI);
};

export const useSpring = (delay = 0, damping = 200, mass = 0.7) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass } });
};

/* ---------- stage ------------------------------------------------------- */

/** Warm near-black ground, drifting aurora, grid veil, vignette and grain —
    the same backdrop the app renders behind its hero. */
export const Stage: React.FC<{ children: React.ReactNode; grain?: number }> = ({ children, grain = 0.05 }) => {
  const f = useCurrentFrame();
  const drift = (period: number, amp: number, phase: number) =>
    Math.sin(((f + phase) / period) * Math.PI * 2) * amp;

  return (
    <AbsoluteFill style={{
  backgroundColor: C.bg,
  fontFamily: FONT.body,
  overflow: "hidden",
  translate: "-23.2px 0px"
}}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1200px 800px at ${20 + drift(300, 6, 0)}% ${25 + drift(260, 8, 40)}%, rgba(163,230,53,0.16), transparent 60%),
                       radial-gradient(1000px 700px at ${82 + drift(340, 7, 90)}% ${72 + drift(290, 6, 20)}%, rgba(121,181,32,0.13), transparent 62%),
                       radial-gradient(900px 900px at 50% 110%, rgba(75,122,18,0.14), transparent 60%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.lineSoft} 1px, transparent 1px), linear-gradient(90deg, ${C.lineSoft} 1px, transparent 1px)`,
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(120% 90% at 50% 40%, #000 20%, transparent 78%)",
          opacity: 0.55,
        }}
      />
      {children}
      <AbsoluteFill style={{ boxShadow: "inset 0 0 340px 90px rgba(0,0,0,0.75)", pointerEvents: "none" }} />
      <Grain opacity={grain} />
    </AbsoluteFill>
  );
};

/** Film grain. The seed advances with the frame so it shimmers rather than
    sitting there as a static texture.

    Rasterised at 480x270 and scaled up by CSS rather than run at full frame:
    feTurbulence rasterises at the element's device size, so drawing it at
    1920x1080 costs 16x as much per frame for grain nobody looks at closely. */
const GRAIN_W = 480, GRAIN_H = 270;

const Grain: React.FC<{ opacity: number }> = ({ opacity }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity, mixBlendMode: "overlay", pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={GRAIN_W}
        height={GRAIN_H}
        style={{ transform: `scale(${1920 / GRAIN_W}, ${1080 / GRAIN_H})`, transformOrigin: "0 0" }}
      >
        <filter id={`grain-${f % 8}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={1} seed={f % 8} />
        </filter>
        <rect width={GRAIN_W} height={GRAIN_H} filter={`url(#grain-${f % 8})`} />
      </svg>
    </AbsoluteFill>
  );
};

/* ---------- typography -------------------------------------------------- */

/** Display headline. Words rise and settle one after another — the stagger is
    what makes a title read as spoken rather than pasted on. */
export const Headline: React.FC<{
  children: string; size?: number; delay?: number; stagger?: number;
  color?: string; align?: "left" | "center"; weight?: number; width?: number;
}> = ({ children, size = 96, delay = 0, stagger = 4, color = C.text, align = "left", weight = 700, width }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        fontFamily: FONT.display, fontSize: size, fontWeight: weight, color,
        letterSpacing: "-0.04em", lineHeight: 1.02, textAlign: align, maxWidth: width,
        display: "flex", flexWrap: "wrap", gap: `0 ${size * 0.26}px`,
        justifyContent: align === "center" ? "center" : "flex-start",
      }}
    >
      {children.split(" ").map((word, i) => {
        const p = spring({ frame: frame - delay - i * stagger, fps, config: { damping: 200, mass: 0.6 } });
        return (
          <span
            key={`${word}-${i}`}
            style={{
              display: "inline-block",
              transform: `translateY(${(1 - p) * size * 0.5}px)`,
              opacity: p,
              clipPath: "inset(-30% -10% -30% -10%)",
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

/** Small mono label above a headline. */
export const Kicker: React.FC<{ children: React.ReactNode; delay?: number; color?: string }> = ({
  children, delay = 0, color = C.gold,
}) => {
  const p = useSpring(delay);
  return (
    <div
      style={{
        fontFamily: FONT.mono, fontSize: 24, letterSpacing: "0.34em", textTransform: "uppercase",
        color, opacity: p, transform: `translateX(${(1 - p) * -24}px)`,
        display: "flex", alignItems: "center", gap: 16,
      }}
    >
      <span style={{ width: 46 * p, height: 2, background: color, display: "inline-block" }} />
      {children}
    </div>
  );
};

/** Numeric readout that counts up. Values in these films are real figures from
    the app's README, so they are worth landing on rather than flashing. */
export const Counter: React.FC<{
  to: number; from?: number; delay?: number; duration?: number;
  decimals?: number; prefix?: string; suffix?: string; size?: number; color?: string;
}> = ({ to, from = 0, delay = 0, duration = 40, decimals = 2, prefix = "", suffix = "", size = 72, color = C.text }) => {
  const frame = useCurrentFrame();
  const v = interpolate(frame, [delay, delay + duration], [from, to], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  return (
    <span style={{ fontFamily: FONT.mono, fontSize: size, color, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
      {prefix}
      {v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
};

/* ---------- brand ------------------------------------------------------- */

/** The product mark, redrawn at video scale. Matches src/components/brand.tsx. */
export const RefractMark: React.FC<{ size?: number; uid?: string }> = ({ size = 80, uid = "m" }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ display: "block", flexShrink: 0 }}>
    <defs>
      <linearGradient id={`pm-${uid}`} x1="16" y1="4" x2="16" y2="28" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#d2fa8a" stopOpacity={0.95} />
        <stop offset="100%" stopColor="#4b7a12" stopOpacity={0.32} />
      </linearGradient>
    </defs>
    <path d="M0.5 14.2 H12" stroke={C.text} strokeWidth={1.6} strokeLinecap="round" opacity={0.85} />
    <path d="M16 3.6 L28.6 27.2 H3.4 Z" stroke={`url(#pm-${uid})`} strokeWidth={1.7} strokeLinejoin="round" fill="rgba(163,230,53,0.12)" />
    <g strokeWidth={1.7} strokeLinecap="round">
      {["M18.5 15.4 L32 10.6", "M18.7 16.6 L32 14.2", "M18.9 17.8 L32 17.8", "M19.1 19.0 L32 21.4", "M19.3 20.2 L32 25.0"].map((d, i) => (
        <path key={d} d={d} stroke={SPECTRUM[i]} />
      ))}
    </g>
  </svg>
);

/** Closing lockup: mark, wordmark, spectrum rule, then the tagline. */
export const EndCard: React.FC<{ tagline: string; delay?: number }> = ({ tagline, delay = 0 }) => {
  const p = useSpring(delay);
  const p2 = useSpring(delay + 12);
  const p3 = useSpring(delay + 24);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 26, opacity: p, transform: `scale(${0.9 + p * 0.1})` }}>
        <RefractMark size={96} uid="end" />
        <span style={{ fontFamily: FONT.display, fontSize: 128, fontWeight: 700, letterSpacing: "-0.05em", color: C.text }}>
          REFRACT
        </span>
      </div>
      <div style={{ width: 620 * p2, height: 3, background: `linear-gradient(90deg, ${SPECTRUM.join(",")})`, borderRadius: 2 }} />
      <div
        style={{
          fontFamily: FONT.body, fontSize: 34, color: C.muted, opacity: p3,
          transform: `translateY(${(1 - p3) * 16}px)`, letterSpacing: "0.02em",
        }}
      >
        {tagline}
      </div>
      <div style={{ fontFamily: FONT.mono, fontSize: 22, color: C.faint, letterSpacing: "0.26em", opacity: p3, marginTop: 6 }}>
        {[SITE.url, SITE.handle, SITE.chain].filter(Boolean).join("   ·   ").toUpperCase()}
      </div>
      {SITE.ca && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 18, opacity: p3, marginTop: 14,
            padding: "14px 26px", borderRadius: 14,
            background: "rgba(163,230,53,0.07)", border: `1px solid ${C.line}`,
          }}
        >
          <span style={{ fontFamily: FONT.mono, fontSize: 19, letterSpacing: "0.24em", color: C.gold }}>CA</span>
          <span style={{ width: 1, height: 22, background: C.line }} />
          {/* Full address, never truncated: the whole point is that a viewer
              can read it straight off the frame. */}
          <span style={{ fontFamily: FONT.mono, fontSize: 26, letterSpacing: "0.04em", color: C.text }}>
            {SITE.ca}
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
};

/* ---------- surfaces ---------------------------------------------------- */

/** App-style panel. `lift` is the entrance progress 0..1. */
export const Panel: React.FC<{
  children: React.ReactNode; lift?: number; highlight?: boolean; style?: React.CSSProperties;
}> = ({ children, lift = 1, highlight = false, style }) => (
  <div
    style={{
      background: highlight ? "rgba(163,230,53,0.10)" : "rgba(20,20,20,0.72)",
      border: `1px solid ${highlight ? "rgba(163,230,53,0.55)" : C.line}`,
      borderRadius: 20,
      backdropFilter: "blur(8px)",
      boxShadow: highlight ? "0 0 0 1px rgba(163,230,53,0.22), 0 22px 60px -18px rgba(121,181,32,0.5)" : "0 18px 50px -24px rgba(0,0,0,0.8)",
      opacity: lift,
      transform: `translateY(${(1 - lift) * 30}px)`,
      ...style,
    }}
  >
    {children}
  </div>
);
