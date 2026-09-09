import React from "react";
import { Audio, staticFile, AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { Facet } from "../Mascot";
import { Stage, Headline, Kicker, EndCard, Panel, useBob, useBlink } from "../ui";
import { C, FONT } from "../theme";

/**
 * THREE TOKENS. ONE NAME. — 20s film on clone detection.
 *
 * The risk on a permissionless launchpad is not a bad chart, it is buying the
 * wrong contract. Three cards arrive looking identical; the only thing that
 * separates them is the address, so that is what the film puts on screen.
 */

const T = { open: 24, cards: 84, dupes: 150, flag: 300, safe: 430, end: 520 };

const CLONES = [
  { sym: "PCAT", name: "Psyopcat", addr: "0x346E…F13e", trades: 6 },
  { sym: "PCAT", name: "psy op cat", addr: "0xA17D…A8F5", trades: 13 },
  { sym: "PCAT", name: "psy op", addr: "0x0637…47D0", trades: 5 },
];

export const CloneGuard: React.FC = () => {
  const f = useCurrentFrame();
  const bob = useBob(9, 86);
  const blink = useBlink(23);

  const enter = interpolate(f, [T.open, T.open + 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const cx = 1450, cy = 706 + bob;

  const flagged = f > T.flag;
  const safe = f > T.safe;
  const outro = interpolate(f, [T.end - 14, T.end + 6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <Stage>
      <Audio src={staticFile("music/refract-clone-guard.wav")} />
      <AbsoluteFill style={{ opacity: outro }}>
        <div style={{ position: "absolute", left: 108, top: 126, width: 1010 }}>
          <Kicker delay={0} color={flagged && !safe ? C.ember : undefined}>Clone detection</Kicker>
          <div style={{ marginTop: 22 }}>
            <Headline delay={8} size={100}>THREE TOKENS. ONE NAME.</Headline>
          </div>
        </div>

        <div style={{ position: "absolute", left: 108, top: 452, width: 1010, display: "flex", flexDirection: "column", gap: 14 }}>
          {CLONES.map((c, i) => {
            const at = T.cards + i * 46;
            const lift = interpolate(f, [at, at + 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            if (f < at) return null;
            const badge = interpolate(f, [T.flag + i * 8, T.flag + i * 8 + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <Panel key={c.addr} lift={lift} style={{ padding: "20px 26px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <span style={{ width: 46, height: 46, borderRadius: "50%", flexShrink: 0, background: `linear-gradient(140deg, ${C.honey}, ${C.brass})` }} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "block", fontFamily: FONT.display, fontWeight: 700, fontSize: 30, color: C.text }}>{c.sym}</span>
                    <span style={{ display: "block", fontFamily: FONT.body, fontSize: 22, color: C.muted, marginTop: 2 }}>{c.name}</span>
                  </span>
                  {/* The address is the only thing that actually differs. */}
                  <span style={{ fontFamily: FONT.mono, fontSize: 25, color: flagged ? C.text : C.faint, transition: "color .2s" }}>{c.addr}</span>
                  {flagged ? (
                    <span
                      style={{
                        opacity: badge, transform: `scale(${0.85 + badge * 0.15})`,
                        fontFamily: FONT.mono, fontSize: 19, letterSpacing: "0.08em", whiteSpace: "nowrap",
                        color: C.ember, border: `1px solid ${C.ember}`, background: "rgba(255,95,86,0.12)",
                        borderRadius: 999, padding: "7px 15px",
                      }}
                    >
                      &#9888; 3&#215; CLONE
                    </span>
                  ) : null}
                </div>
              </Panel>
            );
          })}
        </div>

        {safe ? (
          <div
            style={{
              position: "absolute", left: 108, top: 872, width: 1010,
              opacity: interpolate(f, [T.safe, T.safe + 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            }}
          >
            <div style={{ fontFamily: FONT.body, fontSize: 33, color: C.muted, lineHeight: 1.4 }}>
              Same name, same symbol, three different contracts. We flag them
              &#8212; and blur explicit on-chain names by default.
            </div>
          </div>
        ) : null}

        <div style={{ position: "absolute", left: cx - 190, top: cy - 207, opacity: enter, transform: `scale(${0.9 + enter * 0.1})` }}>
          <Facet
            size={380}
            expression={flagged && !safe ? "wow" : safe ? "happy" : "focus"}
            blink={blink}
            lookX={-4 + Math.sin(f / 21) * 2}
            lookY={interpolate(f, [T.cards, T.flag], [-2, 4], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
            armL={flagged && !safe ? -100 : -20}
            armR={flagged && !safe ? -68 : -20}
            tilt={Math.sin(f / 70) * 2}
            glow={flagged && !safe ? 0.95 : 0.5}
            charge={flagged && !safe ? 1 : 0.45}
            uid="cg"
          />
        </div>
      </AbsoluteFill>

      {f > T.end ? <EndCard tagline="Check the contract, not the name." delay={T.end + 6} /> : null}
    </Stage>
  );
};
