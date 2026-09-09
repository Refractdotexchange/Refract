import React from "react";
import { Audio, staticFile, AbsoluteFill, interpolate, useCurrentFrame, random, Easing } from "remotion";
import { Facet } from "../Mascot";
import { Stage, Headline, Kicker, EndCard, Counter, Panel, useBob, useBlink } from "../ui";
import { C, FONT, SPECTRUM } from "../theme";

/**
 * EVERYTHING YOU HOLD — 20s film on portfolio discovery.
 *
 * The point is the method, not the list: holdings are found by reading the
 * wallet's own Transfer history, so a token bought minutes ago on a fresh
 * curve appears without waiting for anyone to list it. The scattered dots
 * being pulled into a stack is that scan.
 */

const T = { open: 24, scan: 78, found: 168, stack: 300, total: 430, end: 520 };
const DOTS = 22;

const HOLDINGS = [
  { sym: "REFRACT", amt: "1.24M", usd: "$18,410", venue: "V3 0.30%" },
  { sym: "USDG", amt: "5,280.44", usd: "$5,280", venue: "V3 0.01%" },
  { sym: "WETH", amt: "2.9081", usd: "$7,244", venue: "WETH" },
];

export const Portfolio: React.FC = () => {
  const f = useCurrentFrame();
  const bob = useBob(9, 90);
  const blink = useBlink(31);

  const enter = interpolate(f, [T.open, T.open + 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const cx = 1455, cy = 700 + bob;
  const totalled = f > T.total;
  const outro = interpolate(f, [T.end - 14, T.end + 6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <Stage>
      <Audio src={staticFile("music/refract-portfolio.wav")} />
      <AbsoluteFill style={{ opacity: outro }}>
        {/* Scattered holdings drawn in from across the chain. */}
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          {Array.from({ length: DOTS }, (_, i) => {
            const seed = `p-${i}`;
            const sx = 120 + random(seed) * 1700;
            const sy = 150 + random(seed + "y") * 800;
            const delay = T.scan + random(seed + "d") * 130;
            const t = interpolate(f, [delay, delay + 74], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
            if (t <= 0) return null;
            const x = sx + (cx - 60 - sx) * t;
            const y = sy + (cy - 40 - sy) * t;
            const r = (5 + random(seed + "r") * 6) * (1 - t * 0.45);
            return <circle key={i} cx={x} cy={y} r={r} fill={SPECTRUM[i % SPECTRUM.length]} opacity={0.85 * (1 - t * 0.5)} />;
          })}
        </svg>

        <div style={{ position: "absolute", left: 108, top: 128, width: 980 }}>
          <Kicker delay={0}>Portfolio</Kicker>
          <div style={{ marginTop: 22 }}>
            <Headline delay={8} size={100}>EVERYTHING YOU HOLD. FOUND.</Headline>
          </div>
          <div
            style={{
              marginTop: 26, width: 800, fontFamily: FONT.body, fontSize: 31, color: C.muted, lineHeight: 1.4,
              opacity: interpolate(f, [T.scan, T.scan + 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            }}
          >
            Read from your wallet&#8217;s own transfer history &#8212; no token
            list, so a fresh curve buy shows up straight away.
          </div>
        </div>

        <div style={{ position: "absolute", left: 108, top: 520, width: 900, display: "flex", flexDirection: "column", gap: 13 }}>
          {HOLDINGS.map((h, i) => {
            const at = T.found + i * 52;
            const lift = interpolate(f, [at, at + 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            if (f < at) return null;
            return (
              <Panel key={h.sym} lift={lift} style={{ padding: "20px 26px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <span style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, background: `linear-gradient(${40 + i * 60}deg, ${SPECTRUM[i]}, ${SPECTRUM[i + 2]})` }} />
                  <span style={{ flex: 1, fontFamily: FONT.display, fontWeight: 700, fontSize: 30, color: C.text }}>{h.sym}</span>
                  <span style={{ fontFamily: FONT.mono, fontSize: 25, color: C.muted }}>{h.amt}</span>
                  <span style={{ fontFamily: FONT.mono, fontSize: 28, color: C.gold, minWidth: 148, textAlign: "right" }}>{h.usd}</span>
                </div>
              </Panel>
            );
          })}
        </div>

        {totalled ? (
          <div style={{ position: "absolute", left: 108, top: 852 }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 18, letterSpacing: "0.24em", color: C.faint, marginBottom: 10 }}>
              TOTAL VALUE
            </div>
            <Counter to={30934} delay={T.total} duration={38} decimals={0} prefix="$" size={116} color={C.gold} />
          </div>
        ) : null}

        <div style={{ position: "absolute", left: cx - 190, top: cy - 207, opacity: enter, transform: `scale(${0.9 + enter * 0.1})` }}>
          <Facet
            size={380}
            expression={totalled ? "cheer" : f > T.found ? "happy" : "focus"}
            blink={blink}
            lookX={Math.sin(f / 23) * 4}
            lookY={totalled ? -4 : 2}
            armL={totalled ? -98 : -30}
            armR={totalled ? -98 : -30}
            tilt={Math.sin(f / 76) * 2}
            glow={totalled ? 0.9 : 0.5}
            charge={0.5 + Math.sin(f / 28) * 0.2}
            uid="pf"
          />
        </div>
      </AbsoluteFill>

      {f > T.end ? <EndCard tagline="Your whole position, in one place." delay={T.end + 6} /> : null}
    </Stage>
  );
};
