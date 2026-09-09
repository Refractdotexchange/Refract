import React from "react";
import { Audio, staticFile, AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { Facet } from "../Mascot";
import { Stage, Headline, Kicker, EndCard, Panel, useBob, useBlink } from "../ui";
import { C, FONT } from "../theme";

/**
 * YOUR KEYS. YOUR TRADE. — 18s film on custody and approvals.
 *
 * Deliberately the slowest of the eight. The claim is a negative — we never
 * hold your funds, and we never ask for an unlimited approval — so the film
 * gives it space rather than energy. The contrast row is the whole argument.
 */

const T = { open: 24, lock: 90, exact: 210, sign: 340, end: 450 };

const ROWS = [
  { k: "Custody of funds", them: "Varies", us: "Never" },
  { k: "Approval amount", them: "Unlimited", us: "Exactly this swap" },
  { k: "Who signs", them: "Varies", us: "Your wallet" },
];

export const SelfCustody: React.FC = () => {
  const f = useCurrentFrame();
  const bob = useBob(8, 96);
  const blink = useBlink(13);

  const enter = interpolate(f, [T.open, T.open + 32], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const cx = 1455, cy = 700 + bob;
  const signed = f > T.sign;
  const outro = interpolate(f, [T.end - 14, T.end + 6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // The shield closing around him as the approval is scoped.
  const shield = interpolate(f, [T.lock, T.lock + 44], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

  return (
    <Stage>
      <Audio src={staticFile("music/refract-self-custody.wav")} />
      <AbsoluteFill style={{ opacity: outro }}>
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          {/* A ring drawing itself closed — scope, not a cage. */}
          <circle
            cx={cx} cy={cy - 10} r={252}
            fill="none" stroke={C.gold} strokeWidth={3}
            strokeDasharray={Math.PI * 2 * 252}
            strokeDashoffset={Math.PI * 2 * 252 * (1 - shield)}
            transform={`rotate(-90 ${cx} ${cy - 10})`}
            opacity={0.5 + shield * 0.35}
          />
          <circle cx={cx} cy={cy - 10} r={252} fill={C.gold} opacity={0.05 * shield} />
        </svg>

        <div style={{ position: "absolute", left: 108, top: 148, width: 980 }}>
          <Kicker delay={0}>Non-custodial</Kicker>
          <div style={{ marginTop: 22 }}>
            <Headline delay={8} size={104}>YOUR KEYS. YOUR TRADE.</Headline>
          </div>
        </div>

        <div style={{ position: "absolute", left: 108, top: 500, width: 940 }}>
          <div style={{ display: "flex", gap: 20, paddingBottom: 14, fontFamily: FONT.mono, fontSize: 17, letterSpacing: "0.2em", color: C.faint }}>
            <span style={{ flex: 1 }} />
            <span style={{ minWidth: 210 }}>ELSEWHERE</span>
            <span style={{ minWidth: 250, color: C.gold }}>REFRACT</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {ROWS.map((r, i) => {
              const at = T.exact + i * 40;
              const lift = interpolate(f, [at, at + 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              if (f < at) return null;
              return (
                <Panel key={r.k} lift={lift} style={{ padding: "20px 26px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 20, fontFamily: FONT.body, fontSize: 28 }}>
                    <span style={{ flex: 1, color: C.muted }}>{r.k}</span>
                    <span style={{ minWidth: 210, color: C.faint, fontFamily: FONT.mono, fontSize: 25 }}>{r.them}</span>
                    <span style={{ minWidth: 250, color: C.gold, fontFamily: FONT.mono, fontSize: 25, fontWeight: 600 }}>{r.us}</span>
                  </div>
                </Panel>
              );
            })}
          </div>
        </div>

        {signed ? (
          <div
            style={{
              position: "absolute", left: 108, top: 872, width: 940,
              opacity: interpolate(f, [T.sign, T.sign + 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            }}
          >
            <div style={{ fontFamily: FONT.body, fontSize: 32, color: C.muted, lineHeight: 1.4 }}>
              Approvals are scoped to the exact amount of each swap. The routers
              are the canonical Uniswap deployments on chain 4663.
            </div>
          </div>
        ) : null}

        <div style={{ position: "absolute", left: cx - 190, top: cy - 217, opacity: enter, transform: `scale(${0.9 + enter * 0.1})` }}>
          <Facet
            size={380}
            expression={signed ? "happy" : "focus"}
            blink={blink}
            lookX={Math.sin(f / 27) * 2}
            lookY={2}
            armL={-24}
            armR={-24}
            tilt={Math.sin(f / 88) * 1.5}
            glow={0.4 + shield * 0.45}
            charge={0.4 + shield * 0.3}
            uid="sc"
          />
        </div>
      </AbsoluteFill>

      {f > T.end ? <EndCard tagline="We never hold your funds." delay={T.end + 6} /> : null}
    </Stage>
  );
};
