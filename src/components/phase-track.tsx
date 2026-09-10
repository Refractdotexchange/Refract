import { C_STATUS, PHASES, type Status } from "@/lib/roadmap";

/**
 * The roadmap as a vertical track.
 *
 * Status is carried by a filled / half / hollow node rather than colour alone,
 * so the state survives a greyscale render and does not depend on the reader
 * spotting a hue difference.
 */

function Node({ status }: { status: Status }) {
  const tone = C_STATUS[status].tone;
  return (
    <span
      aria-hidden="true"
      style={{
        position: "relative",
        width: 17,
        height: 17,
        borderRadius: "50%",
        flexShrink: 0,
        marginTop: 4,
        border: `2px solid ${tone}`,
        background: status === "live" ? tone : "var(--bg)",
        boxShadow: status === "live" ? `0 0 14px ${tone}` : "none",
        display: "block",
      }}
    >
      {status === "next" && (
        <span
          style={{
            position: "absolute",
            inset: 3,
            borderRadius: "50%",
            background: tone,
          }}
        />
      )}
    </span>
  );
}

function StatusChip({ status }: { status: Status }) {
  const { tone, label } = C_STATUS[status];
  return (
    <span
      className="mono"
      style={{
        fontSize: 10,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: tone,
        border: `1px solid ${tone}`,
        background: `color-mix(in srgb, ${tone} 12%, transparent)`,
        borderRadius: 999,
        padding: "4px 11px",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

export function PhaseTrack() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {PHASES.map((phase, i) => {
        const gate = phase.gate;
        return (
          <article
            key={phase.n}
            className="panel"
            style={{
              padding: "24px 26px",
              position: "relative",
              borderColor: gate
                ? "color-mix(in srgb, var(--honey) 42%, transparent)"
                : undefined,
            }}
          >
            {/* Connector between cards, so the set reads as one track. */}
            {i < PHASES.length - 1 && (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 34,
                  bottom: -12,
                  width: 2,
                  height: 12,
                  background: "var(--line)",
                }}
              />
            )}

            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
              <Node status={phase.status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="mono"
                  style={{ fontSize: 11, letterSpacing: "0.22em", color: "var(--faint)" }}
                >
                  PHASE {phase.n}
                </div>
                <h2
                  className="font-display"
                  style={{ fontSize: 22, fontWeight: 700, margin: "6px 0 0", letterSpacing: "-0.02em" }}
                >
                  {phase.title}
                </h2>
              </div>
              <StatusChip status={phase.status} />
            </div>

            <p
              style={{
                color: "var(--muted)",
                fontSize: 14.5,
                lineHeight: 1.62,
                margin: "0 0 16px",
                paddingLeft: 33,
                maxWidth: 760,
              }}
            >
              {phase.summary}
            </p>

            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: "0 0 0 33px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "10px 22px",
              }}
            >
              {phase.items.map((item) => (
                <li
                  key={item.label}
                  style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14 }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 2,
                      marginTop: 7,
                      flexShrink: 0,
                      background:
                        phase.status === "live" ? "var(--gold)" : "var(--surface-3)",
                    }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <b style={{ color: "var(--text)", fontWeight: 600 }}>{item.label}</b>
                    {item.note && (
                      <span style={{ color: "var(--faint)", display: "block", fontSize: 13, marginTop: 2, lineHeight: 1.5 }}>
                        {item.note}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            {gate && (
              <div
                style={{
                  marginTop: 18,
                  marginLeft: 33,
                  padding: "13px 16px",
                  borderRadius: 13,
                  background: "color-mix(in srgb, var(--honey) 9%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--honey) 34%, transparent)",
                  display: "flex",
                  gap: 11,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ color: "var(--honey)", fontSize: 15, lineHeight: 1.2 }}>&#9888;</span>
                <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>
                  {gate}
                </span>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
