"use client";

/**
 * StripChart — one sensor trace with SPC control limits, the core FDC mark.
 * Single muted series (no legend — the title names it), dashed UCL/LCL
 * hairlines from the simulator's healthy operating point, breach samples
 * marked in the reserved abnormal color, crosshair hover tooltip.
 */
import { useState } from "react";
import { fmt, type SensorMeta } from "@/lib/console/fab";

const W = 260;
const H = 64;
const PAD = 4;

export function StripChart({
  meta,
  values,
  latestFrame,
}: {
  meta: SensorMeta;
  values: number[];
  latestFrame: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = values.length;
  const latest = n > 0 ? values[n - 1] : null;

  let body = null;
  if (n >= 2) {
    const lo = Math.min(...values, meta.lcl);
    const hi = Math.max(...values, meta.ucl);
    const span = hi - lo || 1;
    const x = (i: number) => (i / (n - 1)) * (W - PAD * 2) + PAD;
    const y = (v: number) => H - PAD - ((v - lo) / span) * (H - PAD * 2);
    const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const breaches = values
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => v > meta.ucl || v < meta.lcl);
    const hoverIdx = hover !== null ? Math.max(0, Math.min(n - 1, hover)) : null;

    body = (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-16 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${meta.label} trend`}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const frac = (e.clientX - rect.left) / rect.width;
          setHover(Math.round(frac * (n - 1)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <line x1={PAD} x2={W - PAD} y1={y(meta.ucl)} y2={y(meta.ucl)} stroke="var(--c-ink3)" strokeWidth="1" strokeDasharray="3 3" />
        <line x1={PAD} x2={W - PAD} y1={y(meta.lcl)} y2={y(meta.lcl)} stroke="var(--c-ink3)" strokeWidth="1" strokeDasharray="3 3" />
        <polyline points={points} fill="none" stroke="var(--c-trace)" strokeWidth="1.6" />
        {breaches.map(({ v, i }) => (
          <circle key={i} cx={x(i)} cy={y(v)} r="2" fill="var(--c-warn)" />
        ))}
        {hoverIdx !== null && (
          <line
            x1={x(hoverIdx)}
            x2={x(hoverIdx)}
            y1={PAD}
            y2={H - PAD}
            stroke="var(--c-ink3)"
            strokeWidth="1"
          />
        )}
      </svg>
    );
  } else {
    body = <div className="h-16" aria-hidden />;
  }

  const hoverValue =
    hover !== null && n >= 2 ? values[Math.max(0, Math.min(n - 1, hover))] : null;

  return (
    <div className="panel relative p-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="panel-title">{meta.label}</span>
        <span className="num text-xs text-[var(--c-ink)]">
          {hoverValue !== null
            ? fmt(hoverValue, meta.decimals)
            : latest !== null
              ? fmt(latest, meta.decimals)
              : "—"}
          <span className="ml-1 text-[var(--c-ink3)]">{meta.unit}</span>
        </span>
      </div>
      {body}
      <div className="num flex justify-between text-[10px] text-[var(--c-ink3)]">
        <span>
          UCL {fmt(meta.ucl, meta.decimals)} · LCL {fmt(meta.lcl, meta.decimals)}
        </span>
        <span>
          {hover !== null && n >= 2
            ? `t−${n - 1 - Math.max(0, Math.min(n - 1, hover))}`
            : `t=${latestFrame}`}
        </span>
      </div>
    </div>
  );
}
