import type { ToolState } from "@/lib/demo/types";

const STROKE: Record<ToolState, string> = {
  HEALTHY: "stroke-emerald-500",
  WATCH: "stroke-amber-500",
  WARNING: "stroke-orange-500",
  CRITICAL: "stroke-red-500",
};

/** Health-history sparkline (0–100 fixed scale, like the kit's dashboard). */
export function Sparkline({
  values,
  state,
}: {
  values: number[];
  state: ToolState;
}) {
  if (values.length < 2) {
    return <div className="h-9" aria-hidden />;
  }
  const w = 248;
  const h = 34;
  const n = values.length;
  const points = values
    .map((v, i) => {
      const x = (i / (n - 1)) * w;
      const y = h - (Math.max(0, Math.min(100, v)) / 100) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="h-9 w-full"
      role="img"
      aria-label={`health trend, latest ${Math.round(values[n - 1])}`}
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth="1.8"
        className={STROKE[state]}
      />
    </svg>
  );
}
