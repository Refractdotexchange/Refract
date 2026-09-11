import React from "react";
import { AbsoluteFill, Audio, staticFile, interpolate, Easing, useCurrentFrame } from "remotion";
import { Facet } from "../Mascot";
import { Stage, EndCard, RefractMark, useBob, useBlink } from "../ui";
import { C, FONT } from "../theme";
import { PSWAP as T } from "./timing";

/**
 * PRIVATE SWAP — 24s.
 *
 * The only film where both halves of the product are on screen together. A
 * mixer hides you and stops; this quotes every venue on the chain first and
 * then has the pool, rather than the trader, execute the winner.
 *
 * The quotes are a real reading: 0.02 ETH to USDG on 4663, every venue the
 * router actually probes, captured from the live quoter. The spread between
 * the best and the worst is genuinely 0.61 USDG, which is the argument for
 * routing at all and is not worth inventing a better number for.
 *
 * It ends on the row the chain cannot fill in, and then says plainly that the
 * trade is visible and only the trader is not. A privacy film that overclaims
 * is worse than no film.
 */

const VENUES = [
  { name: "Uniswap V4", tier: "hooked pool", out: "49.372367", best: true },
  { name: "Uniswap V2", tier: "direct pair", out: "49.241615", best: false },
  { name: "Uniswap V3", tier: "0.30% tier", out: "49.240659", best: false },
  { name: "Uniswap V3", tier: "0.05% tier", out: "49.239685", best: false },
  { name: "Uniswap V3", tier: "1.00% tier", out: "48.762480", best: false },
];

const ease = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

const typeOn = (f: number, from: number, dur: number, text: string) =>
  text.slice(0, Math.round(interpolate(f, [from, from + dur], [0, text.length], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  })));

/** One venue's quote, landing in its own time. */
const Venue: React.FC<{ v: (typeof VENUES)[number]; i: number; frame: number }> = ({ v, i, frame }) => {
  const at = T.quoteFrom + i * T.venueGap;
  const p = ease(frame, at, at + 22);
  const won = v.best && frame > T.pick;
  const dim = !v.best && frame > T.pick ? interpolate(frame, [T.pick, T.pick + 26], [1, 0.3], { extrapolateRight: "clamp" }) : 1;
  const lift = won ? ease(frame, T.pick, T.pick + 24) : 0;

  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "17px 22px", borderRadius: 15, marginBottom: 9,
        opacity: p * dim,
        transform: `translateX(${(1 - p) * 30}px) scale(${1 + lift * 0.03})`,
        background: won ? "rgba(163,230,53,0.13)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${won ? "rgba(163,230,53,0.6)" : "rgba(255,255,255,0.07)"}`,
        boxShadow: won ? "0 0 44px -12px rgba(163,230,53,0.6)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: won ? C.gold : "#3a4234" }} />
        <div>
          <div style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 24, color: won ? C.text : C.muted }}>
            {v.name}
          </div>
          <div style={{ fontFamily: FONT.mono, fontSize: 14, color: C.faint, marginTop: 2 }}>{v.tier}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 25, color: won ? C.honey : C.muted, fontWeight: won ? 600 : 400 }}>
          {v.out}
        </span>
        {won && (
          <span style={{
            fontFamily: FONT.mono, fontSize: 13, letterSpacing: "0.1em", color: "#0b1400",
            background: C.gold, borderRadius: 999, padding: "5px 12px", fontWeight: 600,
          }}>
            BEST
          </span>
        )}
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; lift: number; tone?: string; children: React.ReactNode }> = ({
  label, lift, tone = C.faint, children,
}) => (
  <div style={{ opacity: lift, transform: `translateY(${(1 - lift) * 14}px)`, marginBottom: 20 }}>
    <div style={{ fontFamily: FONT.mono, fontSize: 16, letterSpacing: "0.16em", textTransform: "uppercase", color: tone, marginBottom: 7 }}>
      {label}
    </div>
    <div style={{ fontFamily: FONT.mono, fontSize: 31, color: C.text, display: "flex", alignItems: "center" }}>
      {children}
    </div>
  </div>
);

export const PrivateSwap: React.FC = () => {
  const f = useCurrentFrame();
  const bob = useBob(6, 94);
  const blink = useBlink(29);

  const win = ease(f, T.window, T.window + 26);
  const proving = f >= T.prove && f < T.execute;
  const outro = interpolate(f, [T.end - 14, T.end + 6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const showChain = f >= T.chain - 16;

  const status = proving
    ? (f < T.prove + 34 ? "Rebuilding the tree" : "Generating the proof")
    : f >= T.execute ? "The pool traded"
      : f >= T.pick ? "Prove and swap"
        : f >= T.quoteFrom ? "Pricing every venue"
          : "Choose a token";

  return (
    <Stage>
      <Audio src={staticFile("music/refract-private-swap-track.wav")} />
      <AbsoluteFill style={{ opacity: outro }}>
        {/* ---------------- left: the app ---------------- */}
        <div
          style={{
            position: "absolute", left: 92, top: 128, width: 700, height: 812,
            opacity: win, transform: `translateY(${(1 - win) * 24}px)`,
            background: "rgba(16,16,16,0.92)", border: `1px solid ${C.line}`, borderRadius: 26,
            boxShadow: "0 40px 100px -30px rgba(0,0,0,0.9)", overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "22px 28px", borderBottom: `1px solid ${C.lineSoft}` }}>
            <RefractMark size={32} uid="ps" />
            <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 24, color: C.text, letterSpacing: "-0.02em" }}>
              REFRACT
            </span>
            <span style={{ fontFamily: FONT.mono, fontSize: 15, color: C.gold, border: `1px solid ${C.line}`, borderRadius: 8, padding: "4px 10px" }}>
              PRIVATE
            </span>
          </div>

          <div style={{ padding: "26px 28px" }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 16, letterSpacing: "0.16em", textTransform: "uppercase", color: C.faint }}>
              Shielded balance
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 58, fontWeight: 600, color: C.text, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
              {(f >= T.execute ? 0.13 : 0.15).toFixed(2)} <span style={{ fontSize: 32, color: C.muted }}>ETH</span>
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 15, color: C.faint, marginBottom: 26 }}>
              {f >= T.execute ? "change, still hidden" : "yours, and only yours"}
            </div>

            <div style={{ fontFamily: FONT.mono, fontSize: 15, letterSpacing: "0.16em", textTransform: "uppercase", color: C.faint, marginBottom: 8 }}>
              Spend
            </div>
            <div style={{
              border: `1px solid ${C.line}`, borderRadius: 13, padding: "15px 18px",
              background: "rgba(0,0,0,0.4)", fontFamily: FONT.mono, fontSize: 32, color: C.text, marginBottom: 18,
            }}>
              0.02 <span style={{ fontSize: 22, color: C.muted }}>ETH</span>
            </div>

            <div style={{ fontFamily: FONT.mono, fontSize: 15, letterSpacing: "0.16em", textTransform: "uppercase", color: C.faint, marginBottom: 8 }}>
              Token to buy
            </div>
            <div style={{
              border: `1px solid ${C.line}`, borderRadius: 13, padding: "15px 18px",
              background: "rgba(0,0,0,0.4)", fontFamily: FONT.mono, fontSize: 24, color: C.text, minHeight: 60,
            }}>
              {typeOn(f, T.token, 38, "USDG")}
              <span style={{ display: "inline-block", width: 3, height: 26, background: C.gold, marginLeft: 6, verticalAlign: -4, opacity: Math.sin(f / 7) > -0.4 ? 1 : 0 }} />
            </div>

            <div style={{
              marginTop: 26, textAlign: "center", padding: "17px 0", borderRadius: 14,
              fontFamily: FONT.display, fontWeight: 650, fontSize: 24,
              color: proving ? C.text : "#0b1400",
              background: proving ? "rgba(163,230,53,0.12)" : C.gold,
              border: `1px solid ${C.line}`,
            }}>
              {status}
            </div>
          </div>
        </div>

        {/* ---------------- right: venues, then the chain ---------------- */}
        <div style={{ position: "absolute", left: 840, top: 128, width: 988 }}>
          {!showChain ? (
            <>
              <div style={{ fontFamily: FONT.mono, fontSize: 17, letterSpacing: "0.2em", textTransform: "uppercase", color: C.faint, marginBottom: 20 }}>
                Every venue on 4663, quoted
              </div>
              {VENUES.map((v, i) => (
                <Venue key={`${v.name}-${v.tier}`} v={v} i={i} frame={f} />
              ))}
              <div style={{
                opacity: ease(f, T.pick + 20, T.pick + 44),
                fontFamily: FONT.body, fontSize: 24, color: C.muted, marginTop: 16,
              }}>
                0.61 USDG between the best and the worst, on a 0.02 ETH trade.
              </div>
            </>
          ) : (
            <div style={{
              opacity: ease(f, T.chain, T.chain + 26),
              background: "rgba(10,10,10,0.72)", border: `1px dashed ${C.line}`, borderRadius: 26,
              padding: "30px 34px",
            }}>
              <div style={{ fontFamily: FONT.mono, fontSize: 17, letterSpacing: "0.2em", textTransform: "uppercase", color: C.faint, marginBottom: 26 }}>
                What the chain records
              </div>
              <Row label="Swap" lift={ease(f, T.chain + 6, T.chain + 30)}>
                0.02 ETH <span style={{ color: C.faint, margin: "0 12px" }}>&rarr;</span> 49.372367 USDG
              </Row>
              <Row label="Executed by" lift={ease(f, T.chain + 20, T.chain + 44)}>
                <span style={{ fontSize: 26, color: C.muted }}>the REFRACT pool</span>
              </Row>
              <Row label="Token sent to" lift={ease(f, T.chain + 34, T.chain + 58)}>
                <span style={{ fontSize: 26, color: C.muted }}>0x00&hellip;DeaDBeef</span>
              </Row>
              <div style={{ height: 1, background: C.lineSoft, margin: "4px 0 24px", opacity: ease(f, T.unknown - 14, T.unknown) }} />
              <Row label="Funded by which wallet" lift={ease(f, T.unknown, T.unknown + 26)} tone={C.gold}>
                <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 42, color: C.honey }}>
                  unknown
                </span>
              </Row>
            </div>
          )}
        </div>

        <div style={{ position: "absolute", left: 1768, top: 908 + bob, opacity: ease(f, T.pick, T.pick + 28) }}>
          <Facet
            size={130}
            expression={f > T.unknown ? "cheer" : f > T.execute ? "happy" : "focus"}
            blink={blink}
            lookX={-4}
            tilt={Math.sin(f / 70) * 2}
            glow={0.45}
            charge={0.4 + Math.sin(f / 24) * 0.2}
            uid="psm"
          />
        </div>

        {f > T.line - 10 && (
          <div style={{
            position: "absolute", left: 92, bottom: 74, width: 1500,
            opacity: ease(f, T.line, T.line + 24),
            fontFamily: FONT.body, fontSize: 30, color: C.muted, lineHeight: 1.4,
          }}>
            The trade is public. <span style={{ color: C.text }}>The trader is not.</span>
          </div>
        )}
      </AbsoluteFill>

      <EndCard tagline="Route it. Then hide who did." delay={T.end} />
    </Stage>
  );
};
