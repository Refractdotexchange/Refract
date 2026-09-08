"use client";

import { useMemo, useState } from "react";

export type Point = { t: number; block: number; price: number; volumeEth: number };

/** Downsample to at most `max` points, always keeping the first and last. */
function thin<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => arr[Math.round(i * step)]);
}

function path(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}

/**
 * Tiny inline trend line for list rows. No axes, no interaction — it exists to
 * answer "up or down" at a glance.
 */
export function Sparkline({
  values,
  width = 96,
  height = 26,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  const pts = thin(values, 40);
  if (pts.length < 2) {
    return (
      <span className="mono" style={{ fontSize: 10, color: "var(--faint)" }}>
        —
      </span>
    );
  }

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const up = pts[pts.length - 1] >= pts[0];
  const stroke = up ? "var(--olive)" : "var(--ember)";
  const pad = 2;

  const coords = pts.map((v, i) => ({
    x: (i / (pts.length - 1)) * (width - pad * 2) + pad,
    y: height - pad - ((v - min) / span) * (height - pad * 2),
  }));

  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: "block" }}>
      <path d={path(coords)} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Executed-price chart with an hover readout and a volume histogram underneath.
 * Every point is a real swap, so gaps in time are genuine gaps in trading.
 */
export function PriceChart({
  points,
  height = 260,
  ethUsd,
}: {
  points: Point[];
  height?: number;
  ethUsd: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const data = useMemo(() => thin(points, 220), [points]);

  const W = 1000;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const chartH = height - 62;
  const volH = 38;

  const geometry = useMemo(() => {
    if (data.length < 2) return null;
    const prices = data.map((d) => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = max - min || max || 1;
    const maxVol = Math.max(...data.map((d) => d.volumeEth), 0) || 1;

    const coords = data.map((d, i) => ({
      x: (i / (data.length - 1)) * (W - padL - padR) + padL,
      y: padT + (1 - (d.price - min) / span) * (chartH - padT),
      vh: (d.volumeEth / maxVol) * volH,
      d,
    }));
    return { coords, min, max };
  }, [data, chartH]);

  if (!geometry) {
    return (
      <div
        className="panel-flat"
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--faint)",
          fontSize: 13,
          textAlign: "center",
          padding: 20,
        }}
      >
        Not enough trades yet to plot a price.
      </div>
    );
  }

  const { coords, min, max } = geometry;
  const up = coords[coords.length - 1].d.price >= coords[0].d.price;
  const stroke = up ? "var(--olive)" : "var(--ember)";
  const active = hover != null ? coords[hover] : coords[coords.length - 1];

  const area = `${path(coords)} L${coords[coords.length - 1].x} ${chartH} L${coords[0].x} ${chartH} Z`;
  const fmt = (p: number) =>
    ethUsd != null
      ? `$${p * ethUsd < 0.01 ? (p * ethUsd).toPrecision(3) : (p * ethUsd).toFixed(4)}`
      : `${p.toPrecision(4)} ETH`;

  return (
    <div className="panel-flat" style={{ padding: "14px 14px 10px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 6,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="kicker">{hover != null ? "At this trade" : "Latest trade"}</div>
          <div className="font-display mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 3 }}>
            {fmt(active.d.price)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="kicker">Size</div>
          <div className="mono" style={{ fontSize: 13, marginTop: 5, color: "var(--muted)" }}>
            {active.d.volumeEth < 0.0001
              ? active.d.volumeEth.toExponential(1)
              : active.d.volumeEth.toFixed(4)}{" "}
            ETH
          </div>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height, display: "block", cursor: "crosshair" }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const rx = ((e.clientX - rect.left) / rect.width) * W;
          let best = 0;
          let bestD = Infinity;
          coords.forEach((c, i) => {
            const d = Math.abs(c.x - rx);
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          });
          setHover(best);
        }}
      >
        <defs>
          <linearGradient id="pc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? "var(--olive)" : "var(--ember)"} stopOpacity="0.22" />
            <stop offset="100%" stopColor={up ? "var(--olive)" : "var(--ember)"} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={padL}
            x2={W - padR}
            y1={padT + f * (chartH - padT)}
            y2={padT + f * (chartH - padT)}
            stroke="var(--line-soft)"
            strokeWidth="1"
          />
        ))}

        <path d={area} fill="url(#pc-fill)" />
        <path d={path(coords)} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />

        {/* volume histogram */}
        <g>
          {coords.map((c, i) => (
            <rect
              key={i}
              x={c.x - 1}
              y={height - volH - 10 + (volH - c.vh)}
              width="2"
              height={Math.max(0.5, c.vh)}
              fill="var(--brass)"
              opacity={hover === i ? 0.95 : 0.35}
            />
          ))}
        </g>

        {hover != null && (
          <line
            x1={active.x}
            x2={active.x}
            y1={padT}
            y2={height - 10}
            stroke="var(--gold)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}
        <circle cx={active.x} cy={active.y} r="4" fill={stroke} />
      </svg>

      <div
        className="mono"
        style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--faint)" }}
      >
        <span>low {fmt(min)}</span>
        <span>
          {data.length} trades · high {fmt(max)}
        </span>
      </div>
    </div>
  );
}

/** Bar strip for curve-stage tokens, which have no price series yet. */
export function ActivityBars({
  buckets,
  height = 120,
}: {
  buckets: { t: number; block: number; count: number }[];
  height?: number;
}) {
  if (buckets.length === 0) {
    return (
      <div
        className="panel-flat"
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--faint)",
          fontSize: 13,
        }}
      >
        No transfers in the scanned window.
      </div>
    );
  }
  const max = Math.max(...buckets.map((b) => b.count));
  return (
    <div
      className="panel-flat"
      style={{ padding: 14, display: "flex", alignItems: "flex-end", gap: 2, height }}
    >
      {buckets.map((b) => (
        <div
          key={b.block}
          title={`${b.count} transfers`}
          style={{
            flex: 1,
            minWidth: 2,
            height: `${Math.max(3, (b.count / max) * 100)}%`,
            background: "var(--meter)",
            borderRadius: 2,
            opacity: 0.85,
          }}
        />
      ))}
    </div>
  );
}
