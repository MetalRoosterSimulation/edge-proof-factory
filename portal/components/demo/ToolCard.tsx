import { Sparkline } from "@/components/demo/Sparkline";
import { diagnose } from "@/lib/demo/diagnose";
import { FAULT_LABELS, FAULT_NAMES } from "@/lib/demo/simulator";
import type { FaultName, ToolState, Verdict } from "@/lib/demo/types";

const STATE_TEXT: Record<ToolState, string> = {
  HEALTHY: "text-emerald-600 dark:text-emerald-400",
  WATCH: "text-amber-600 dark:text-amber-400",
  WARNING: "text-orange-600 dark:text-orange-400",
  CRITICAL: "text-red-600 dark:text-red-400",
};

const STATE_EDGE: Record<ToolState, string> = {
  HEALTHY: "bg-emerald-500",
  WATCH: "bg-amber-500",
  WARNING: "bg-orange-500",
  CRITICAL: "bg-red-500",
};

export function ToolCard({
  verdict,
  history,
  activeFault,
  onInject,
  onHeal,
}: {
  verdict: Verdict;
  history: number[];
  activeFault: FaultName | null;
  onInject: (toolId: string, fault: FaultName) => void;
  onHeal: (toolId: string) => void;
}) {
  const v = verdict;
  const dx = diagnose(v);
  return (
    <div className="relative overflow-hidden rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div
        className={`absolute inset-y-0 left-0 w-1 ${STATE_EDGE[v.state]}`}
        aria-hidden
      />
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-sm text-black/60 dark:text-white/60">
          {v.tool_id}
        </span>
        <span
          className={`text-xs font-semibold uppercase tracking-wider ${STATE_TEXT[v.state]}`}
        >
          {v.warming ? "warmup" : v.state}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`font-mono text-4xl font-semibold ${STATE_TEXT[v.state]}`}>
          {v.warming ? "—" : Math.round(v.health)}
        </span>
        <span className="text-sm text-black/60 dark:text-white/60">
          /100 health
        </span>
      </div>
      <Sparkline values={history} state={v.state} />
      <p className="min-h-4 font-mono text-xs text-black/60 dark:text-white/60">
        {v.warming
          ? "baseline learning…"
          : v.rul_frames == null
            ? "forecast: nominal"
            : `forecast to critical: ~${v.rul_frames} cycles`}
      </p>
      {v.top_contributors.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {v.top_contributors.map((c) => (
            <span
              key={c.sensor}
              className="rounded border border-black/10 px-1.5 py-0.5 font-mono text-[11px] text-black/60 dark:border-white/10 dark:text-white/60"
            >
              {c.sensor.replaceAll("_", " ")}{" "}
              <b className={STATE_TEXT[v.state]}>z={c.z}</b>
            </span>
          ))}
        </div>
      )}
      {dx && (
        <p className="mt-2 text-xs text-black/70 dark:text-white/70">
          <span className="font-semibold">Signature match: {dx.title}.</span>{" "}
          {dx.blurb}{" "}
          <span className="text-black/50 dark:text-white/50">
            (model attribution × the kit&apos;s fault library — in the kit this
            is answered on-prem by the SUSE AI tier)
          </span>
        </p>
      )}
      {!v.warming && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {activeFault ? (
            <button
              type="button"
              onClick={() => onHeal(v.tool_id)}
              className="rounded-md border border-black/15 px-2.5 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Heal ({FAULT_LABELS[activeFault].title})
            </button>
          ) : (
            FAULT_NAMES.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => onInject(v.tool_id, f)}
                title={FAULT_LABELS[f].blurb}
                className="rounded-md border border-black/15 px-2.5 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                Inject {FAULT_LABELS[f].title}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
