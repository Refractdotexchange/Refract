import React from "react";
import { C, SPECTRUM } from "./theme";

/**
 * FACET — the REFRACT mascot.
 *
 * A living prism shard: a rounded gold triangle that takes white light in on
 * one side and throws a spectrum out the other. The shape is deliberately the
 * same triangle as the product mark (src/components/brand.tsx), so the mascot
 * and the logo are legibly the same object.
 *
 * The whole character is one SVG with a small rig: expression, blink, pupil
 * aim, two arm angles, tilt and glow. Scenes drive those; nothing here
 * animates on its own, so every motion stays frame-deterministic for Remotion.
 */

export type Expression = "idle" | "happy" | "wow" | "focus" | "cheer";

export type FacetProps = {
  size?: number;
  expression?: Expression;
  /** 0 = open, 1 = fully shut. */
  blink?: number;
  /** Pupil aim, in body units. Roughly -6..6 reads naturally. */
  lookX?: number;
  lookY?: number;
  /** Arm rotation in degrees. 0 hangs down, negative lifts. */
  armL?: number;
  armR?: number;
  /** Body tilt in degrees. */
  tilt?: number;
  /** 0..1 outer bloom. Push to 1 on beats. */
  glow?: number;
  /** 0..1 how bright the internal refraction lines burn. */
  charge?: number;
  /** Unique per instance — SVG defs ids are global in a document. */
  uid?: string;
};

const BROW: Record<Expression, { l: string; r: string; w: number }> = {
  idle:  { l: "M64 78 Q78 72 92 76",   r: "M128 76 Q142 72 156 78",   w: 5 },
  happy: { l: "M62 74 Q78 64 94 72",   r: "M126 72 Q142 64 158 74",   w: 5.5 },
  wow:   { l: "M62 68 Q78 58 94 66",   r: "M126 66 Q142 58 158 68",   w: 5.5 },
  focus: { l: "M64 72 Q78 80 94 82",   r: "M126 82 Q142 80 156 72",   w: 6 },
  cheer: { l: "M60 70 Q78 58 96 70",   r: "M124 70 Q142 58 160 70",   w: 6 },
};

const MOUTH: Record<Expression, React.ReactNode> = {
  idle:  <path d="M98 150 Q110 158 122 150" stroke="#13210a" strokeWidth={5} strokeLinecap="round" fill="none" />,
  happy: <path d="M92 146 Q110 166 128 146" stroke="#13210a" strokeWidth={6} strokeLinecap="round" fill="none" />,
  wow:   <ellipse cx={110} cy={152} rx={9} ry={12} fill="#13210a" />,
  focus: <path d="M99 153 Q110 150 121 155" stroke="#13210a" strokeWidth={5} strokeLinecap="round" fill="none" />,
  cheer: (
    <g>
      <path d="M88 143 Q110 174 132 143 Z" fill="#13210a" />
      <path d="M100 160 Q110 170 120 160 Z" fill={C.ember} opacity={0.85} />
    </g>
  ),
};

export const Facet: React.FC<FacetProps> = ({
  size = 380,
  expression = "idle",
  blink = 0,
  lookX = 0,
  lookY = 0,
  armL = 0,
  armR = 0,
  tilt = 0,
  glow = 0.5,
  charge = 0.6,
  uid = "f",
}) => {
  const brow = BROW[expression];
  const eyeOpen = Math.max(0.06, 1 - blink);
  const wide = expression === "wow" ? 1.18 : expression === "focus" ? 0.82 : 1;

  const Eye = ({ cx }: { cx: number }) => (
    <g transform={`translate(${cx} 108)`}>
      <g transform={`scale(${wide} ${eyeOpen * wide})`}>
        <ellipse rx={17} ry={19} fill="#0f1a05" />
        {/* Pupil aim reads as attention; the big highlight is what makes it
            feel alive, so it moves further than the pupil itself. */}
        <circle cx={lookX * 0.9 - 5} cy={lookY * 0.9 - 6} r={6.2} fill="#fbfff6" />
        <circle cx={lookX * 0.7 + 6} cy={lookY * 0.7 + 7} r={2.8} fill="#fbfff6" opacity={0.75} />
      </g>
      {blink > 0.55 ? (
        <path d="M-17 0 H17" stroke="#4b7a12" strokeWidth={4} strokeLinecap="round" opacity={0.9} />
      ) : null}
    </g>
  );

  const Arm = ({ x, dir, rot }: { x: number; dir: 1 | -1; rot: number }) => (
    <g transform={`translate(${x} 138) rotate(${rot * dir})`}>
      {/* Drawn twice: a dark under-stroke first, so the arm still reads as a
          separate limb where it crosses the body's own gold. */}
      <path d={`M0 0 L${36 * dir} 32`} stroke="#3d6410" strokeWidth={19} strokeLinecap="round" fill="none" opacity={0.55} />
      <path d={`M0 0 L${36 * dir} 32`} stroke={`url(#fc-arm-${uid})`} strokeWidth={14} strokeLinecap="round" fill="none" />
      <circle cx={38 * dir} cy={34} r={10.5} fill="#3d6410" opacity={0.55} />
      <circle cx={38 * dir} cy={34} r={9.5} fill={C.honey} />
    </g>
  );

  return (
    <svg width={size} height={size} viewBox="0 0 220 220" fill="none" style={{ overflow: "visible", display: "block" }}>
      <defs>
        <linearGradient id={`fc-body-${uid}`} x1="110" y1="24" x2="110" y2="182" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#e6ffb3" />
          <stop offset="45%" stopColor={C.gold} />
          <stop offset="100%" stopColor="#79b520" />
        </linearGradient>
        <linearGradient id={`fc-edge-${uid}`} x1="110" y1="24" x2="110" y2="182" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f8fff0" />
          <stop offset="100%" stopColor="#4b7a12" />
        </linearGradient>
        <linearGradient id={`fc-arm-${uid}`} x1="0" y1="0" x2="0" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={C.gold} />
          <stop offset="100%" stopColor={C.honey} />
        </linearGradient>
        <radialGradient id={`fc-glow-${uid}`}>
          <stop offset="0%" stopColor={C.honey} stopOpacity={0.55} />
          <stop offset="55%" stopColor={C.brass} stopOpacity={0.16} />
          <stop offset="100%" stopColor={C.brass} stopOpacity={0} />
        </radialGradient>
        <clipPath id={`fc-clip-${uid}`}>
          <path d="M110 30 L190 172 H30 Z" />
        </clipPath>
      </defs>

      <g transform={`rotate(${tilt} 110 120)`}>
        <circle cx={110} cy={118} r={130} fill={`url(#fc-glow-${uid})`} opacity={glow} />

        {/* Arms sit behind the body so the shoulders read as one silhouette. */}
        <Arm x={58} dir={-1} rot={armL} />
        <Arm x={162} dir={1} rot={armR} />

        {/* Body. Fill plus a round-joined stroke of the same paint is what
            gives the triangle its soft corners without hand-built arcs. */}
        <path
          d="M110 30 L190 172 H30 Z"
          fill={`url(#fc-body-${uid})`}
          stroke={`url(#fc-body-${uid})`}
          strokeWidth={26}
          strokeLinejoin="round"
        />
        <path
          d="M110 30 L190 172 H30 Z"
          fill="none"
          stroke={`url(#fc-edge-${uid})`}
          strokeWidth={30}
          strokeLinejoin="round"
          opacity={0.28}
        />

        <g clipPath={`url(#fc-clip-${uid})`}>
          {/* Internal refraction — the light actually inside the character. */}
          <g opacity={0.16 + charge * 0.34}>
            <path d="M110 18 L58 190" stroke="#f8fff0" strokeWidth={3} />
            <path d="M110 18 L150 190" stroke="#f8fff0" strokeWidth={2} opacity={0.7} />
            <path d="M20 120 L210 96" stroke="#f8fff0" strokeWidth={1.6} opacity={0.5} />
          </g>
          <path d="M74 44 L96 44 L46 168 L24 168 Z" fill="#fbfff6" opacity={0.3} />
          <path d="M104 44 L112 44 L62 168 L54 168 Z" fill="#fbfff6" opacity={0.16} />
        </g>

        <g strokeLinecap="round" fill="none">
          <path d={brow.l} stroke="#13210a" strokeWidth={brow.w} opacity={0.9} />
          <path d={brow.r} stroke="#13210a" strokeWidth={brow.w} opacity={0.9} />
        </g>

        <Eye cx={84} />
        <Eye cx={136} />
        {MOUTH[expression]}

        {/* Cheek blush warms the gold up and keeps him from reading as a shape. */}
        <ellipse cx={62} cy={140} rx={11} ry={6} fill={C.ember} opacity={0.22} />
        <ellipse cx={158} cy={140} rx={11} ry={6} fill={C.ember} opacity={0.22} />

        {/* Apex sparkle — the tell that he is still charged. */}
        <g opacity={0.5 + charge * 0.5}>
          <path d="M110 8 L113 20 L125 23 L113 26 L110 38 L107 26 L95 23 L107 20 Z" fill="#fbfff6" />
        </g>
      </g>
    </svg>
  );
};

/**
 * The spectrum fan Facet throws. Kept outside the character so scenes can
 * aim it, stagger it, and let route labels ride on the individual rays.
 */
export const Fan: React.FC<{
  x: number; y: number; length: number; spread: number;
  progress: number; width?: number; opacity?: number; rays?: number;
  /** Degrees to swing the whole fan. Positive aims it downward — useful for
      steering the rays clear of type without shortening them. */
  rotate?: number;
}> = ({ x, y, length, spread, progress, width = 6, opacity = 1, rays = 6, rotate = 0 }) => (
  <g opacity={opacity}>
    {SPECTRUM.slice(0, rays).map((color, i) => {
      const t = rays === 1 ? 0.5 : i / (rays - 1);
      const angle = (rotate - spread / 2 + spread * t) * (Math.PI / 180);
      // Each ray starts a beat after the one above it, so the fan unfurls.
      const p = Math.max(0, Math.min(1, (progress - i * 0.06) / 0.7));
      const len = length * p;
      return (
        <line
          key={color}
          x1={x} y1={y}
          x2={x + Math.cos(angle) * len}
          y2={y + Math.sin(angle) * len}
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          opacity={0.95}
        />
      );
    })}
  </g>
);
