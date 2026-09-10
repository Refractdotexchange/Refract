import type { Metadata } from "next";
import Link from "next/link";
import { PhaseTrack } from "@/components/phase-track";
import { SOCIALS } from "@/lib/chain";

export const metadata: Metadata = {
  title: "Roadmap",
  description:
    "What REFRACT has shipped, what is next, and the one thing that gates the rest. Sequenced by what actually blocks what.",
};

export default function RoadmapPage() {
  return (
    <div className="page-pad" style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 22px 0" }}>
      <header style={{ marginBottom: 34 }}>
        <div className="kicker" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="live-dot" />
          Sequenced by what blocks what
        </div>
        <h1
          className="font-display h-display"
          style={{ fontSize: "clamp(30px,4vw,46px)", fontWeight: 700, margin: "12px 0 0" }}
        >
          The <span className="spectrum-text">roadmap</span>
        </h1>
        <p
          className="lede"
          style={{ color: "var(--muted)", fontSize: 16, lineHeight: 1.65, maxWidth: 660, marginTop: 14 }}
        >
          No quarters, no dates we cannot back. Phases are ordered by what genuinely
          blocks what, and every item marked live is running in production right now.
          Where something does not work yet, it says so.
        </p>
      </header>

      <PhaseTrack />

      <section
        className="panel panel-lit"
        style={{ padding: "26px 28px", marginTop: 34 }}
      >
        <div className="kicker" style={{ marginBottom: 12 }}>
          The honest summary
        </div>
        <p style={{ color: "var(--muted)", fontSize: 15.5, lineHeight: 1.7, margin: 0, maxWidth: 780 }}>
          Phases 0 and 1 are a good product. Fee capture is the only thing standing
          between that and a business, and it is gated on a contract audit rather than
          on how fast we work, because it sits in the path of user funds. Everything
          after it is straightforward once revenue exists and honestly unfundable
          until it does.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
          <Link href="/engine" className="btn">
            How the engine works
          </Link>
          <a
            href="https://github.com/Refractdotexchange/Refract"
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost"
          >
            Read the code
          </a>
          <a href={SOCIALS.x} target="_blank" rel="noreferrer" className="btn btn-ghost">
            {SOCIALS.xHandle}
          </a>
        </div>
      </section>

      <p
        className="mono"
        style={{ color: "var(--faint)", fontSize: 11.5, lineHeight: 1.7, marginTop: 22 }}
      >
        This page describes intent, not a commitment or a delivery date. Nothing here
        is a promise of future value, and priorities change as the chain does.
      </p>
    </div>
  );
}
