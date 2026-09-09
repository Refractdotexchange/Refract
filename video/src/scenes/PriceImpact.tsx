import React from "react";
import { Audio, staticFile, AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { Facet } from "../Mascot";
import { Stage, Headline, Kicker, EndCard, Counter, Panel, useBob, useBlink } from "../ui";
import { C, FONT } from "../theme";

/**
 * THE SIZE MOVES THE PRICE — 22s film on price impact.
 *
 * The argument is that a quote is not a promise: past a certain size you are
 * buying your own slippage. The bar is the same trade at four sizes, and the
 * number under it is what each one actually costs against the marginal price.
 * The numbers are the shape our engine returns, measured against a probe trade
 * 1000x smaller on the same venue.
 */

const T = { open: 24, bars: 96, grow: 210, warn: 360, ease: 500, end: 580 };

const STEPS = [
  { size: "0.1 ETH", impact: 0.0, w: 0.16 },
  { size: "5 ETH", impact: 0.02, w: 0.34 },
  { size: "50 ETH", impact: 0.27, w: 0.62 },
  { size: "500 ETH", impact: 5.9, w: 1.0 },
];

export const PriceImpact: React.FC = () => {
  const f = useCurrentFrame();
  const bob = useBob(9, 92);
  const blink = useBlink(17);

  const enter = interpolate(f, [T.open, T.open + 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const cx = 1445, cy = 700 + bob;

  // How far through the four sizes we are, 0..4.
  const step = interpolate(f, [T.bars, T.warn], [0, STEPS.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const alarmed = f > T.warn && f < T.ease;
  const relieved = f >= T.ease;

  // The warning shake — small, and only for a moment.
  const shake = alarmed ? Math.sin((f - T.warn) / 1.6) * Math.max(0, 6 - (f - T.warn) / 8) : 0;
  const outro = interpolate(f, [T.end - 14, T.end + 6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <Stage>
      <Audio src={staticFile("music/refract-price-impact.wav")} />
      <AbsoluteFill style={{ opacity: outro }}>
        <div style={{ position: "absolute", left: 108, top: 128, width: 1000 }}>
          <Kicker delay={0}>Price impact</Kicker>
          <div style={{ marginTop: 22 }}>
            <Headline delay={8} size={96}>THE SIZE YOU TRADE MOVES THE PRICE.</Headline>
          </div>
        </div>

        {/* The four sizes, revealed one at a time. */}
        <div style={{ position: "absolute", left: 108, top: 470, width: 940, display: "flex", flexDirection: "column", gap: 15 }}>
          {STEPS.map((s, i) => {
            const on = step > i;
            const lift = interpolate(step, [i, i + 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const bad = s.impact >= 5;
            const warm = s.impact >= 0.2 && !bad;
            const col = bad ? C.ember : warm ? C.honey : C.gold;
            if (!on) return null;
            return (
              <Panel key={s.size} lift={lift} highlight={bad && alarmed} style={{ padding: "18px 26px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                  <span style={{ fontFamily: FONT.mono, fontSize: 30, color: C.text, minWidth: 168 }}>{s.size}</span>
                  <span style={{ flex: 1, height: 12, background: "rgba(255,255,255,0.06)", borderRadius: 6, overflow: "hidden" }}>
                    <span
                      style={{
                        display: "block", height: "100%", borderRadius: 6, background: col,
                        width: `${s.w * 100 * lift}%`, boxShadow: `0 0 18px ${col}`,
                      }}
                    />
                  </span>
                  <span style={{ fontFamily: FONT.mono, fontSize: 30, color: col, minWidth: 132, textAlign: "right" }}>
                    {s.impact === 0 ? "0.00%" : `${s.impact.toFixed(2)}%`}
                  </span>
                </div>
              </Panel>
            );
          })}
        </div>

        {/* The warning, then the resolution. */}
        {alarmed ? (
          <div style={{ position: "absolute", left: 108, top: 900, transform: `translateX(${shake}px)` }}>
            <Panel lift={1} style={{ padding: "22px 30px", borderColor: C.ember, background: "rgba(255,95,86,0.10)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 18, fontFamily: FONT.body, fontSize: 31, color: C.text }}>
                <span style={{ color: C.ember, fontSize: 34 }}>&#9888;</span>
                <span>This trade moves the price <b style={{ color: C.ember }}>5.9%</b>. The pool is thin for this size.</span>
              </div>
            </Panel>
          </div>
        ) : null}

        {relieved ? (
          <div
            style={{
              position: "absolute", left: 108, top: 900,
              opacity: interpolate(f, [T.ease, T.ease + 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 22, fontFamily: FONT.body, fontSize: 33, color: C.muted }}>
              <span>So we warn you before you sign, not after.</span>
              <Counter to={5.0} delay={T.ease + 8} duration={26} decimals={0} suffix="% +" size={44} color={C.ember} />
              <span style={{ fontSize: 27, color: C.faint }}>triggers the warning</span>
            </div>
          </div>
        ) : null}

        <div style={{ position: "absolute", left: cx - 190, top: cy - 207, opacity: enter, transform: `scale(${0.9 + enter * 0.1})` }}>
          <Facet
            size={380}
            expression={alarmed ? "wow" : relieved ? "happy" : "focus"}
            blink={blink}
            lookX={interpolate(step, [0, 4], [-3, 3], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
            lookY={alarmed ? -5 : 2}
            armL={alarmed ? -104 : -18}
            armR={alarmed ? -104 : -18}
            tilt={Math.sin(f / 78) * 2 + (alarmed ? -4 : 0)}
            glow={alarmed ? 0.95 : relieved ? 0.6 : 0.4}
            charge={alarmed ? 1 : 0.45}
            uid="pi"
          />
        </div>
      </AbsoluteFill>

      {f > T.end ? <EndCard tagline="Know the cost before you sign." delay={T.end + 6} /> : null}
    </Stage>
  );
};
