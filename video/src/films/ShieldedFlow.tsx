import React from "react";
import { AbsoluteFill, Audio, staticFile, interpolate, Easing, useCurrentFrame } from "remotion";
import { Facet } from "../Mascot";
import { Stage, EndCard, RefractMark, useBob, useBlink } from "../ui";
import { C, FONT } from "../theme";
import { SHIELD as T } from "./timing";

/**
 * SHIELDED FLOW — 27s.
 *
 * The whole utility in one take, through the interface a person actually
 * uses: unlock, deposit an amount nobody had to pick from a list, spend part
 * of it to an address that has never been used, and land on the change that
 * stays hidden.
 *
 * The chain's own view runs down the right the entire time. That is the point
 * of building it this way: the film never has to claim what is private,
 * because both columns are on screen together and the viewer can read the
 * difference. The deposit is public and says so. The withdrawal is public and
 * says so. What is missing from that column is the link between them, and the
 * change, which is never published at all.
 *
 * The figures are amounts a person might type. Nothing here is a statistic.
 */

const WIN = { x: 96, y: 128, w: 940, h: 812 };
const CHAIN = { x: 1072, y: 128, w: 752, h: 812 };

const ease = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

/** Types a string on, one character at a time. */
const typeOn = (f: number, from: number, dur: number, text: string) => {
  const n = Math.round(interpolate(f, [from, from + dur], [0, text.length], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  }));
  return text.slice(0, n);
};

/** A value that is deliberately never shown. */
const Blocks: React.FC<{ p: number; size?: number }> = ({ p, size = 34 }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
    {[40, 22, 31].map((w, i) => (
      <span
        key={i}
        style={{
          display: "inline-block", height: size,
          width: w * Math.min(1, Math.max(0, p * 1.4 - i * 0.18)),
          borderRadius: 7,
          background: "linear-gradient(180deg,#5c7a1c,#3d5212)",
          border: `1px solid rgba(163,230,53,${0.5 * p})`,
        }}
      />
    ))}
  </span>
);

const Row: React.FC<{ label: string; children: React.ReactNode; lift: number; tone?: string }> = ({
  label, children, lift, tone = C.faint,
}) => (
  <div style={{ opacity: lift, transform: `translateY(${(1 - lift) * 16}px)`, marginBottom: 18 }}>
    <div style={{ fontFamily: FONT.mono, fontSize: 17, letterSpacing: "0.16em", textTransform: "uppercase", color: tone, marginBottom: 8 }}>
      {label}
    </div>
    <div style={{ fontFamily: FONT.mono, fontSize: 34, color: C.text, display: "flex", alignItems: "center" }}>
      {children}
    </div>
  </div>
);

export const ShieldedFlow: React.FC = () => {
  const f = useCurrentFrame();
  const bob = useBob(6, 96);
  const blink = useBlink(31);

  const win = ease(f, T.window, T.window + 26);
  const chainP = ease(f, T.window + 14, T.window + 44);

  const depositing = f < T.toWithdraw;

  // ---- left column state -------------------------------------------------
  const amountIn = typeOn(f, T.typeIn, 44, "3.7164");
  const amountOut = typeOn(f, T.typeOut, 30, "1.2");
  const recip = typeOn(f, T.typeOut + 34, 40, "0x7C4e…A19b");

  const balance = f < T.shielded ? 0 : f < T.change ? 3.7164 : 2.5164;
  const balP = ease(f, T.unlocked, T.unlocked + 22);
  const balPulse = f > T.shielded && f < T.shielded + 26 ? 1 + (1 - ease(f, T.shielded, T.shielded + 26)) * 0.09 : 1;

  const proving = f >= T.prove && f < T.sent;
  const proveStage =
    f < T.prove + 30 ? "Reading the pool"
      : f < T.prove + 58 ? "Rebuilding the tree"
        : "Generating the proof";

  const btnLabel = depositing
    ? f < T.shield ? "Shield this amount" : f < T.shielded ? "Confirm in wallet" : "Shielded"
    : proving ? proveStage
      : f < T.prove ? "Prove and withdraw"
        : "Sent";

  const outro = interpolate(f, [T.end - 14, T.end + 6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <Stage>
      <Audio src={staticFile("music/refract-shielded-flow.wav")} />
      <AbsoluteFill style={{ opacity: outro }}>
        {/* ---------------- the app ---------------- */}
        <div
          style={{
            position: "absolute", left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h,
            opacity: win, transform: `translateY(${(1 - win) * 26}px)`,
            background: "rgba(16,16,16,0.92)", border: `1px solid ${C.line}`, borderRadius: 26,
            boxShadow: "0 40px 100px -30px rgba(0,0,0,0.9)", overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "22px 30px", borderBottom: `1px solid ${C.lineSoft}` }}>
            <RefractMark size={34} uid="sf" />
            <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 25, color: C.text, letterSpacing: "-0.02em" }}>
              REFRACT
            </span>
            <span style={{ fontFamily: FONT.mono, fontSize: 16, color: C.gold, border: `1px solid ${C.line}`, borderRadius: 8, padding: "4px 11px" }}>
              PRIVATE
            </span>
          </div>

          <div style={{ padding: "28px 30px" }}>
            {f < T.unlocked ? (
              <div style={{ opacity: ease(f, T.unlock - 24, T.unlock) }}>
                <div style={{ fontFamily: FONT.mono, fontSize: 18, letterSpacing: "0.18em", textTransform: "uppercase", color: C.gold, marginBottom: 14 }}>
                  Unlock your shielded account
                </div>
                <div style={{ fontFamily: FONT.body, fontSize: 26, color: C.muted, lineHeight: 1.45, marginBottom: 26 }}>
                  One signature derives the key that finds your notes. It moves
                  nothing and costs nothing.
                </div>
                <div
                  style={{
                    display: "inline-block", fontFamily: FONT.display, fontWeight: 650, fontSize: 25,
                    color: f > T.unlock ? "#0b1400" : C.text,
                    background: f > T.unlock ? C.gold : "rgba(163,230,53,0.12)",
                    border: `1px solid ${C.line}`, borderRadius: 14, padding: "16px 30px",
                  }}
                >
                  {f > T.unlock ? "Signed" : "Sign to unlock"}
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontFamily: FONT.mono, fontSize: 17, letterSpacing: "0.16em", textTransform: "uppercase", color: C.faint }}>
                  Shielded balance
                </div>
                <div
                  style={{
                    fontFamily: FONT.mono, fontSize: 68, fontWeight: 600, color: C.text,
                    marginTop: 8, marginBottom: 4, opacity: balP,
                    transform: `scale(${balPulse})`, transformOrigin: "left center",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {balance.toFixed(4)} <span style={{ fontSize: 38, color: C.muted }}>ETH</span>
                </div>
                <div style={{ fontFamily: FONT.mono, fontSize: 16, color: C.faint, marginBottom: 24 }}>
                  {f < T.shielded ? "no notes yet" : f < T.change ? "1 note · rebuilt in this browser" : "1 note · change, still hidden"}
                </div>

                {/* tabs */}
                <div style={{ display: "flex", gap: 8, background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: 6, marginBottom: 22 }}>
                  {["Deposit", "Withdraw"].map((t) => {
                    const on = (t === "Deposit") === depositing;
                    return (
                      <div
                        key={t}
                        style={{
                          flex: 1, textAlign: "center", padding: "12px 0", borderRadius: 10,
                          fontFamily: FONT.display, fontWeight: on ? 650 : 500, fontSize: 22,
                          color: on ? C.text : C.faint, background: on ? C.surface2 : "transparent",
                        }}
                      >
                        {t}
                      </div>
                    );
                  })}
                </div>

                <div style={{ fontFamily: FONT.mono, fontSize: 16, letterSpacing: "0.16em", textTransform: "uppercase", color: C.faint, marginBottom: 9 }}>
                  Amount in ETH
                </div>
                <div
                  style={{
                    border: `1px solid ${C.line}`, borderRadius: 14, padding: "17px 20px",
                    background: "rgba(0,0,0,0.4)", fontFamily: FONT.mono, fontSize: 38, color: C.text,
                    display: "flex", alignItems: "center", minHeight: 76,
                  }}
                >
                  {depositing ? amountIn : amountOut}
                  <span style={{ width: 3, height: 40, background: C.gold, marginLeft: 8, opacity: Math.sin(f / 7) > -0.4 ? 1 : 0 }} />
                </div>

                {!depositing && (
                  <>
                    <div style={{ fontFamily: FONT.mono, fontSize: 16, letterSpacing: "0.16em", textTransform: "uppercase", color: C.faint, margin: "18px 0 9px" }}>
                      Send to
                    </div>
                    <div
                      style={{
                        border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 20px",
                        background: "rgba(0,0,0,0.4)", fontFamily: FONT.mono, fontSize: 27, color: C.text, minHeight: 60,
                      }}
                    >
                      {recip}
                    </div>
                    <div style={{ fontFamily: FONT.mono, fontSize: 15, color: C.faint, marginTop: 9 }}>
                      an address with no history
                    </div>
                  </>
                )}

                <div
                  style={{
                    marginTop: 24, textAlign: "center", padding: "18px 0", borderRadius: 15,
                    fontFamily: FONT.display, fontWeight: 650, fontSize: 25,
                    color: proving ? C.text : "#0b1400",
                    background: proving ? "rgba(163,230,53,0.12)" : C.gold,
                    border: `1px solid ${C.line}`,
                  }}
                >
                  {btnLabel}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ---------------- what the chain sees ---------------- */}
        <div
          style={{
            position: "absolute", left: CHAIN.x, top: CHAIN.y, width: CHAIN.w, height: CHAIN.h,
            opacity: chainP, transform: `translateY(${(1 - chainP) * 26}px)`,
            background: "rgba(10,10,10,0.72)", border: `1px dashed ${C.line}`, borderRadius: 26,
            padding: "26px 30px",
          }}
        >
          <div style={{ fontFamily: FONT.mono, fontSize: 18, letterSpacing: "0.2em", textTransform: "uppercase", color: C.faint, marginBottom: 24 }}>
            What the chain sees
          </div>

          <Row label="Deposit" lift={ease(f, T.shielded, T.shielded + 22)}>
            3.7164 ETH
          </Row>
          <Row label="From" lift={ease(f, T.shielded + 8, T.shielded + 30)}>
            <span style={{ fontSize: 27, color: C.muted }}>0x3D65…36A4</span>
          </Row>

          <div
            style={{
              height: 1, background: C.lineSoft, margin: "6px 0 22px",
              opacity: ease(f, T.sent - 20, T.sent),
            }}
          />

          <Row label="Withdrawal" lift={ease(f, T.sent, T.sent + 22)}>
            1.2 ETH
          </Row>
          <Row label="To" lift={ease(f, T.sent + 8, T.sent + 30)}>
            <span style={{ fontSize: 27, color: C.muted }}>0x7C4e…A19b</span>
          </Row>

          <Row label="Linked to the deposit" lift={ease(f, T.sent + 22, T.sent + 46)} tone={C.gold}>
            <span style={{ fontSize: 30, color: C.honey }}>no</span>
          </Row>

          <Row label="Change" lift={ease(f, T.change, T.change + 26)} tone={C.gold}>
            <Blocks p={ease(f, T.change, T.change + 30)} />
            <span style={{ fontSize: 26, color: C.muted, marginLeft: 12 }}>never published</span>
          </Row>
        </div>

        {/* mascot, small, watching the chain column */}
        <div style={{ position: "absolute", left: 1772, top: 900 + bob, opacity: ease(f, T.shielded, T.shielded + 30) }}>
          <Facet
            size={132}
            expression={f > T.change ? "cheer" : f > T.sent ? "happy" : "focus"}
            blink={blink}
            lookX={-4}
            tilt={Math.sin(f / 70) * 2}
            glow={0.45}
            charge={0.4 + Math.sin(f / 24) * 0.2}
            uid="sfm"
          />
        </div>

        {/* closing line */}
        {f > T.line - 10 && (
          <div
            style={{
              position: "absolute", left: 96, top: 976, width: 1200,
              opacity: ease(f, T.line, T.line + 24),
              fontFamily: FONT.body, fontSize: 32, color: C.muted,
            }}
          >
            Any amount in. Any part out.{" "}
            <span style={{ color: C.text }}>The rest was never on the chain to begin with.</span>
          </div>
        )}
      </AbsoluteFill>

      <EndCard tagline="One pool. Every size." delay={T.end} />
    </Stage>
  );
};
