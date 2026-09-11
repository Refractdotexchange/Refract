import React from "react";
import { Audio, staticFile, AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { Facet, Fan } from "../Mascot";
import { Stage, Headline, Kicker, EndCard, Panel, useBob, useBlink, useSpring } from "../ui";
import { C, FONT } from "../theme";

/**
 * STOP PICKING A SIZE — 22s film for the hidden-amount pool.
 *
 * The argument the picture has to make is that the amount was always the
 * leak, so the film shows it being removed rather than described. Three fixed
 * denominations arrive, get struck through, and are replaced by a field a
 * number is typed into; that number then splits into the part that is spent
 * and the part that stays hidden, and only the hidden half is redacted.
 *
 * The figures are amounts a person might type, not claims about the protocol.
 * Nothing here is a statistic, because there are no users yet to have one.
 */

const T = {
  kicker: 10,
  head: 22,
  facet: 48,
  chips: 96,
  strike: 176,
  field: 236,
  typed: 258,
  split: 372,
  redact: 404,
  line: 470,
  end: 556,
};

const DENOMS = ["0.1 ETH", "1 ETH", "10 ETH"];

/** The digits of the deposit, typed in one at a time. */
const Typed: React.FC<{ frame: number }> = ({ frame }) => {
  const full = "3.7164";
  const shown = Math.round(
    interpolate(frame, [T.typed, T.typed + 46], [0, full.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  // Blinks while typing, then holds steady once the number is complete.
  const caret = shown >= full.length ? Math.sin(frame / 7) > -0.4 : true;
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <span style={{ fontFamily: FONT.mono, fontSize: 108, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>
        {full.slice(0, shown)}
      </span>
      <span style={{ fontFamily: FONT.mono, fontSize: 62, color: C.muted, marginLeft: 18 }}>ETH</span>
      <span
        style={{
          width: 4, height: 78, background: C.gold, marginLeft: 14,
          opacity: caret ? 1 : 0,
        }}
      />
    </span>
  );
};

/** A value that gets blacked out rather than shown. */
const Redacted: React.FC<{ frame: number }> = ({ frame }) => {
  const widths = [62, 34, 48];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
      {widths.map((w, i) => {
        const p = interpolate(frame, [T.redact + i * 7, T.redact + i * 7 + 16], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        });
        return (
          <span
            key={i}
            style={{
              display: "inline-block", height: 52, width: w * p, borderRadius: 9,
              background: "linear-gradient(180deg,#5c7a1c,#3d5212)",
              border: `1px solid rgba(163,230,53,${0.5 * p})`,
            }}
          />
        );
      })}
      <span style={{ fontFamily: FONT.mono, fontSize: 42, color: C.honey, marginLeft: 8 }}>ETH</span>
    </span>
  );
};

/**
 * One fixed denomination, struck through.
 *
 * Its own component so the spring is not called from inside a map. The list
 * happens to be a constant length today, which makes hooks in a loop work by
 * accident; a fourth denomination would break it in a way that is miserable
 * to debug.
 */
const Denom: React.FC<{ label: string; i: number; frame: number }> = ({ label, i, frame }) => {
  const p = useSpring(T.chips + i * 9);
  const strike = interpolate(frame, [T.strike + i * 8, T.strike + i * 8 + 18], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  // Dimmed once the open field arrives, so attention moves rather than splits.
  const fade = interpolate(frame, [T.field, T.field + 26], [1, 0.28], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "relative", opacity: p * fade, transform: `translateY(${(1 - p) * 22}px)`,
        fontFamily: FONT.mono, fontSize: 38, color: C.muted,
        border: "1px solid rgba(255,255,255,0.14)", borderRadius: 14, padding: "16px 28px",
      }}
    >
      {label}
      <span
        style={{
          position: "absolute", left: 18, right: 18, top: "50%", height: 3,
          background: C.gold, transform: `scaleX(${strike})`, transformOrigin: "left",
        }}
      />
    </div>
  );
};

export const AnyAmount: React.FC = () => {
  const f = useCurrentFrame();
  const bob = useBob(9, 90);
  const blink = useBlink(37);

  const enter = interpolate(f, [T.facet, T.facet + 30], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const fanP = interpolate(f, [T.field, T.field + 46], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const outro = interpolate(f, [T.end - 14, T.end + 6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const fieldP = useSpring(T.field);
  const splitP = useSpring(T.split);
  const lineP = useSpring(T.line);

  const cx = 1500, cy = 742 + bob;

  return (
    <Stage>
      <Audio src={staticFile("music/refract-any-amount.wav")} />
      <AbsoluteFill style={{ opacity: outro }}>
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          <Fan x={1080} y={196} length={820} spread={40} progress={fanP} width={7} opacity={0.7} />
        </svg>

        <div style={{ position: "absolute", left: cx - 176, top: cy - 196, opacity: enter, transform: `scale(${0.9 + enter * 0.1})` }}>
          <Facet
            size={352}
            expression={f > T.redact ? "cheer" : f > T.strike ? "wow" : "focus"}
            blink={blink}
            lookX={Math.sin(f / 21) * 3}
            lookY={f > T.field ? -3 : 0}
            armL={f > T.split ? -92 : -30}
            armR={f > T.split ? -92 : -30}
            tilt={Math.sin(f / 78) * 2}
            glow={0.5}
            charge={0.45 + Math.sin(f / 25) * 0.25}
            uid="aa"
          />
        </div>

        {/* ---- copy ---- */}
        <div style={{ position: "absolute", left: 108, top: 122, width: 920 }}>
          <Kicker delay={T.kicker}>Shielded pool</Kicker>
          <div style={{ marginTop: 22 }}>
            <Headline delay={T.head} size={100}>STOP PICKING A SIZE.</Headline>
          </div>
        </div>

        {/* ---- the old way: three sizes, struck through ---- */}
        <div style={{ position: "absolute", left: 108, top: 400, display: "flex", gap: 16 }}>
          {DENOMS.map((d, i) => (
            <Denom key={d} label={d} i={i} frame={f} />
          ))}
        </div>

        {/* ---- the new way: type any number ---- */}
        {f > T.field - 12 && (
          <div style={{ position: "absolute", left: 108, top: 534, width: 880 }}>
            <Panel lift={fieldP} highlight style={{ padding: "30px 36px" }}>
              <div style={{ fontFamily: FONT.mono, fontSize: 22, letterSpacing: "0.2em", textTransform: "uppercase", color: C.gold, marginBottom: 16 }}>
                Deposit
              </div>
              <Typed frame={f} />
            </Panel>
          </div>
        )}

        {/* ---- the split: what leaves, and what does not ---- */}
        {f > T.split - 12 && (
          <div style={{ position: "absolute", left: 108, top: 762, display: "flex", gap: 16, width: 880 }}>
            <Panel lift={splitP} style={{ flex: 1, padding: "24px 28px" }}>
              <div style={{ fontFamily: FONT.mono, fontSize: 19, letterSpacing: "0.16em", textTransform: "uppercase", color: C.faint, marginBottom: 12 }}>
                Spend
              </div>
              <span style={{ fontFamily: FONT.mono, fontSize: 46, fontWeight: 600, color: C.text }}>1.2</span>
              <span style={{ fontFamily: FONT.mono, fontSize: 30, color: C.muted, marginLeft: 10 }}>ETH</span>
            </Panel>
            <Panel lift={splitP} highlight style={{ flex: 1, padding: "24px 28px" }}>
              <div style={{ fontFamily: FONT.mono, fontSize: 19, letterSpacing: "0.16em", textTransform: "uppercase", color: C.gold, marginBottom: 12 }}>
                Change · hidden
              </div>
              <Redacted frame={f} />
            </Panel>
          </div>
        )}

        {/* ---- the claim, stated plainly ---- */}
        {f > T.line - 10 && (
          <div
            style={{
              position: "absolute", left: 1096, top: 300, width: 700,
              opacity: lineP, transform: `translateY(${(1 - lineP) * 24}px)`,
              fontFamily: FONT.body, fontSize: 34, color: C.muted, lineHeight: 1.42,
            }}
          >
            Deposit any amount. Spend any part of it.
            <br />
            <span style={{ color: C.text }}>The number never reaches the chain.</span>
          </div>
        )}
      </AbsoluteFill>

      <EndCard tagline="One pool. Every size." delay={T.end} />
    </Stage>
  );
};
