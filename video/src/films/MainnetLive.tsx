import React from "react";
import { AbsoluteFill, Audio, staticFile, interpolate, Easing, useCurrentFrame } from "remotion";
import { Facet } from "../Mascot";
import { Stage, EndCard, RefractMark, useBob, useBlink } from "../ui";
import { C, FONT } from "../theme";
import { MAINNET as T } from "./timing";

/**
 * MAINNET LIVE — 30s. The launch film.
 *
 * Four things shipped, so four beats. Every figure on screen was taken from a
 * real run rather than drawn to look good: the venue spread is what the quoter
 * actually returned for 0.02 ETH into USDG, the baseline and fill come from a
 * simulation against live chain state, and the deposit, spend and swap are the
 * numbers from the pool's own end to end runs.
 *
 * It closes on what is not hidden as well as what is, because a launch film
 * that only lists strengths teaches people to trust the thing in situations it
 * was never going to cover.
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

/** One labelled figure. */
const Fig: React.FC<{ label: string; value: string; unit?: string; lift: number; tone?: string; big?: boolean }> = ({
  label, value, unit, lift, tone = C.faint, big = false,
}) => (
  <div style={{ opacity: lift, transform: `translateY(${(1 - lift) * 14}px)` }}>
    <div style={{ fontFamily: FONT.mono, fontSize: 15, letterSpacing: ".17em", textTransform: "uppercase", color: tone, marginBottom: 7 }}>
      {label}
    </div>
    <div style={{ fontFamily: FONT.mono, fontSize: big ? 44 : 33, fontWeight: big ? 600 : 400, color: C.text }}>
      {value}
      {unit && <span style={{ fontSize: big ? 26 : 21, color: C.muted, marginLeft: 8 }}>{unit}</span>}
    </div>
  </div>
);

const Panel: React.FC<{ kicker: string; title: string; lift: number; children: React.ReactNode }> = ({
  kicker, title, lift, children,
}) => (
  <div style={{ opacity: lift, transform: `translateY(${(1 - lift) * 26}px)` }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: C.gold, boxShadow: `0 0 12px ${C.gold}` }} />
      <span style={{ fontFamily: FONT.mono, fontSize: 15, letterSpacing: ".24em", textTransform: "uppercase", color: C.gold }}>
        {kicker}
      </span>
    </div>
    <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 62, letterSpacing: "-.035em", color: C.text, marginBottom: 30 }}>
      {title}
    </div>
    {children}
  </div>
);

export const MainnetLive: React.FC = () => {
  const f = useCurrentFrame();
  const bob = useBob(6, 92);
  const blink = useBlink(31);
  const outro = interpolate(f, [T.end - 14, T.end + 6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const beat = f < T.cash ? 0 : f < T.send ? 1 : f < T.swap ? 2 : f < T.cards ? 3 : 4;

  return (
    <Stage>
      <Audio src={staticFile("music/refract-mainnet-live.wav")} />
      <AbsoluteFill style={{ opacity: outro }}>
        {/* header */}
        <div style={{ position: "absolute", left: 92, top: 74, display: "flex", alignItems: "center", gap: 16, opacity: ease(f, T.title, T.title + 24) }}>
          <RefractMark size={40} uid="ml" />
          <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 30, color: C.text, letterSpacing: "-.02em" }}>REFRACT</span>
          <span style={{ fontFamily: FONT.mono, fontSize: 15, letterSpacing: ".2em", color: "#0b1400", background: C.gold, borderRadius: 999, padding: "6px 15px", fontWeight: 600 }}>
            MAINNET LIVE
          </span>
        </div>

        <div style={{ position: "absolute", left: 92, top: 190, width: 1080 }}>
          {beat === 0 && (
            <Panel kicker="Best route" title="Every venue, every trade." lift={ease(f, T.route - 20, T.route + 10)}>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {VENUES.map((v, i) => {
                  const at = T.route + i * 16;
                  const p = ease(f, at, at + 20);
                  const won = v.best && f > T.routeBest;
                  const dim = !v.best && f > T.routeBest ? 0.32 : 1;
                  return (
                    <div key={`${v.name}${v.tier}`} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "15px 20px", borderRadius: 13, opacity: p * dim,
                      transform: `translateX(${(1 - p) * 26}px)`,
                      background: won ? "rgba(163,230,53,.13)" : "rgba(255,255,255,.03)",
                      border: `1px solid ${won ? "rgba(163,230,53,.6)" : "rgba(255,255,255,.07)"}`,
                    }}>
                      <span style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 23, color: won ? C.text : C.muted }}>
                        {v.name} <span style={{ fontFamily: FONT.mono, fontSize: 15, color: C.faint }}>{v.tier}</span>
                      </span>
                      <span style={{ fontFamily: FONT.mono, fontSize: 23, color: won ? C.honey : C.muted }}>{v.out}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 18, opacity: ease(f, T.routeBest + 18, T.routeBest + 42), fontFamily: FONT.body, fontSize: 23, color: C.muted }}>
                0.61 USDG between the best and the worst, on one 0.02 ETH trade.
              </div>
            </Panel>
          )}

          {beat === 1 && (
            <Panel kicker="Cashback" title="A share of what we found." lift={ease(f, T.cash, T.cash + 26)}>
              <div style={{ display: "flex", gap: 54 }}>
                <Fig label="Plain V2 would pay" value="2.532440" unit="USDG" lift={ease(f, T.cash + 14, T.cash + 38)} />
                <Fig label="You receive" value="2.546405" unit="USDG" lift={ease(f, T.cash + 28, T.cash + 52)} tone={C.gold} big />
              </div>
              <div style={{ marginTop: 30, display: "flex", gap: 54 }}>
                <Fig label="Surplus found" value="0.017673" unit="USDG" lift={ease(f, T.cashClaim, T.cashClaim + 24)} />
                <Fig label="Fee, a fifth of it" value="0.003534" unit="USDG" lift={ease(f, T.cashClaim + 12, T.cashClaim + 36)} />
              </div>
              <div style={{ marginTop: 26, opacity: ease(f, T.cashClaim + 26, T.cashClaim + 50), fontFamily: FONT.body, fontSize: 23, color: C.muted }}>
                Never a share of your trade. Half of the fee is owed back, and you claim it yourself.
              </div>
            </Panel>
          )}

          {beat === 2 && (
            <Panel kicker="PrivateSend" title="Any amount in. Any part out." lift={ease(f, T.send, T.send + 26)}>
              <div style={{ display: "flex", gap: 54 }}>
                <Fig label="Deposit" value="3.7" unit="ETH" lift={ease(f, T.send + 14, T.send + 38)} big />
                <Fig label="Spend" value="1.2" unit="ETH" lift={ease(f, T.send + 28, T.send + 52)} big />
              </div>
              <div style={{ marginTop: 30, opacity: ease(f, T.sendChange, T.sendChange + 26) }}>
                <div style={{ fontFamily: FONT.mono, fontSize: 15, letterSpacing: ".17em", textTransform: "uppercase", color: C.gold, marginBottom: 9 }}>
                  Change, never published
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                  {[52, 30, 40].map((w, i) => (
                    <span key={i} style={{
                      display: "inline-block", height: 40,
                      width: w * ease(f, T.sendChange + i * 7, T.sendChange + i * 7 + 18),
                      borderRadius: 8, background: "linear-gradient(180deg,#5c7a1c,#3d5212)",
                      border: "1px solid rgba(163,230,53,.5)",
                    }} />
                  ))}
                  <span style={{ fontFamily: FONT.mono, fontSize: 26, color: C.muted, marginLeft: 10 }}>ETH</span>
                </div>
              </div>
            </Panel>
          )}

          {beat === 3 && (
            <Panel kicker="PrivateSwap" title="The pool trades. Not you." lift={ease(f, T.swap, T.swap + 26)}>
              <div style={{ display: "flex", gap: 54 }}>
                <Fig label="Swap" value="0.02 ETH → 49.37" unit="USDG" lift={ease(f, T.swap + 14, T.swap + 38)} />
              </div>
              <div style={{ marginTop: 30, display: "flex", gap: 54 }}>
                <Fig label="Executed by" value="the REFRACT pool" lift={ease(f, T.swap + 30, T.swap + 54)} />
              </div>
              <div style={{ marginTop: 30, opacity: ease(f, T.swapUnknown, T.swapUnknown + 26) }}>
                <div style={{ fontFamily: FONT.mono, fontSize: 15, letterSpacing: ".17em", textTransform: "uppercase", color: C.gold, marginBottom: 8 }}>
                  Funded by which wallet
                </div>
                <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 52, color: C.honey }}>unknown</div>
              </div>
            </Panel>
          )}

          {beat === 4 && (
            <div style={{ opacity: ease(f, T.cards, T.cards + 26) }}>
              <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 74, letterSpacing: "-.045em", color: C.text, marginBottom: 30 }}>
                All four, live on 4663.
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", maxWidth: 1100 }}>
                {["Best route", "Cashback", "PrivateSend", "PrivateSwap"].map((n, i) => (
                  <div key={n} style={{
                    opacity: ease(f, T.cards + 16 + i * 12, T.cards + 40 + i * 12),
                    padding: "17px 26px", borderRadius: 15,
                    background: "rgba(163,230,53,.1)", border: "1.5px solid rgba(163,230,53,.5)",
                    fontFamily: FONT.display, fontWeight: 650, fontSize: 27, color: C.text,
                  }}>
                    {n}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 34, opacity: ease(f, T.line, T.line + 26), fontFamily: FONT.body, fontSize: 27, color: C.muted, lineHeight: 1.45, maxWidth: 1020 }}>
                Nobody holds your funds. Nobody sees whose they are.{" "}
                <span style={{ color: C.faint }}>
                  The trades are public and their sizes are; what is missing is who made them.
                </span>
              </div>
            </div>
          )}
        </div>

        <div style={{ position: "absolute", left: 1730, top: 880 + bob, opacity: ease(f, T.route, T.route + 30) }}>
          <Facet
            size={136}
            expression={beat >= 4 ? "cheer" : beat === 3 ? "happy" : "focus"}
            blink={blink}
            lookX={-4}
            tilt={Math.sin(f / 70) * 2}
            glow={0.45}
            charge={0.42 + Math.sin(f / 24) * 0.2}
            uid="mlm"
          />
        </div>
      </AbsoluteFill>

      <EndCard tagline="Mainnet is live." delay={T.end} />
    </Stage>
  );
};
