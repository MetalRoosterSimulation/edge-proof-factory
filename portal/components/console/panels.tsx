"use client";

/**
 * Console panels: tool grid (SEMI E10 states), health/attribution detail,
 * alarm list (ISA-18.2 style), and the sovereignty panel. Presentation only —
 * every number comes from the DemoEngine's existing outputs. Color follows
 * ISA-101 practice: steady state is gray; yellow/orange/red are reserved for
 * abnormal, blue for operator actions.
 */
import type { Alarm } from "@/lib/console/alarms";
import { chamberName, e10State, fmt } from "@/lib/console/fab";
import type { FaultName, GatewayStats, ToolState, Verdict } from "@/lib/demo/types";
import { FAULT_LABELS, FAULT_NAMES } from "@/lib/demo/simulator";

export const STATE_COLOR: Record<ToolState, string> = {
  HEALTHY: "var(--c-ink2)",
  WATCH: "var(--c-watch)",
  WARNING: "var(--c-warn)",
  CRITICAL: "var(--c-crit)",
};

export function actionBtn(extra = ""): string {
  return (
    "border border-[var(--c-line)] px-2.5 py-1 text-xs font-medium " +
    "text-[var(--c-action)] hover:bg-[var(--c-panel2)] disabled:opacity-40 " +
    extra
  );
}

// --- Tool grid ---------------------------------------------------------------
export function ToolGrid({
  tools,
  selected,
  onSelect,
}: {
  tools: Verdict[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const byId = [...tools].sort((a, b) => a.tool_id.localeCompare(b.tool_id));
  return (
    <section className="panel p-2">
      <p className="panel-title mb-2">Tool state — SEMI E10</p>
      <div className="grid grid-cols-2 gap-1.5">
        {byId.map((v) => {
          const e10 = e10State(v.state, v.warming);
          const active = v.tool_id === selected;
          return (
            <button
              key={v.tool_id}
              type="button"
              onClick={() => onSelect(v.tool_id)}
              aria-pressed={active}
              className={`border p-2 text-left ${
                active
                  ? "border-[var(--c-action)]"
                  : "border-[var(--c-line)] hover:border-[var(--c-ink3)]"
              }`}
              style={{ background: "var(--c-panel2)" }}
            >
              <div className="flex items-center justify-between">
                <span className="num text-xs">{chamberName(v.tool_id)}</span>
                <span
                  className="num text-sm font-medium"
                  style={{ color: STATE_COLOR[v.state] }}
                >
                  {v.warming ? "—" : Math.round(v.health)}
                </span>
              </div>
              <div
                className="mt-1 text-[9px] font-medium tracking-wider"
                style={{
                  color:
                    e10 === "PRODUCTIVE" || e10 === "NON-SCHEDULED"
                      ? "var(--c-ink3)"
                      : STATE_COLOR[v.state],
                }}
              >
                {e10}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// --- Health / attribution detail ---------------------------------------------
export function HealthPanel({
  verdict,
  healthHistory,
  activeFault,
  onInject,
  onHeal,
}: {
  verdict: Verdict;
  healthHistory: number[];
  activeFault: FaultName | null;
  onInject: (toolId: string, fault: FaultName) => void;
  onHeal: (toolId: string) => void;
}) {
  const v = verdict;
  const n = healthHistory.length;
  const W = 560;
  const H = 56;
  const pts =
    n >= 2
      ? healthHistory
          .map((h, i) => `${((i / (n - 1)) * W).toFixed(1)},${(H - (h / 100) * H).toFixed(1)}`)
          .join(" ")
      : "";
  return (
    <section className="panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="panel-title">
          Tool health — Hotelling T² / EWMA · {chamberName(v.tool_id)}
        </p>
        <div className="flex gap-1.5">
          {activeFault ? (
            <button type="button" onClick={() => onHeal(v.tool_id)} className={actionBtn()}>
              Heal ({FAULT_LABELS[activeFault].title})
            </button>
          ) : (
            FAULT_NAMES.map((f) => (
              <button
                key={f}
                type="button"
                title={FAULT_LABELS[f].blurb}
                onClick={() => onInject(v.tool_id, f)}
                className={actionBtn()}
              >
                Simulate: {FAULT_LABELS[f].title}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="panel-title">Health</p>
          <p className="num text-2xl font-medium" style={{ color: STATE_COLOR[v.state] }}>
            {v.warming ? "—" : Math.round(v.health)}
            <span className="text-xs text-[var(--c-ink3)]"> /100</span>
          </p>
        </div>
        <div>
          <p className="panel-title">SPC state</p>
          <p className="text-sm font-medium" style={{ color: STATE_COLOR[v.state] }}>
            {v.warming ? "WARMUP" : v.state}
          </p>
        </div>
        <div>
          <p className="panel-title">T² anomaly</p>
          <p className="num text-sm">{fmt(v.anomaly, 3)}</p>
        </div>
        <div>
          <p className="panel-title">RUL forecast</p>
          <p className="num text-sm">
            {v.rul_frames == null ? "nominal" : `~${v.rul_frames} cycles`}
          </p>
        </div>
      </div>

      {n >= 2 && (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="mt-2 h-14 w-full"
          role="img"
          aria-label="health trend"
        >
          {/* state bands as recessive references */}
          {[85, 65, 40].map((t) => (
            <line
              key={t}
              x1="0"
              x2={W}
              y1={H - (t / 100) * H}
              y2={H - (t / 100) * H}
              stroke="var(--c-line)"
              strokeWidth="1"
              strokeDasharray="2 4"
            />
          ))}
          <polyline
            points={pts}
            fill="none"
            stroke={STATE_COLOR[v.state]}
            strokeWidth="1.8"
          />
        </svg>
      )}

      <div className="mt-2">
        <p className="panel-title">Contribution (sensor attribution)</p>
        {v.top_contributors.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--c-ink3)]">no dominant signal</p>
        ) : (
          <div className="mt-1 space-y-1">
            {v.top_contributors.map((c) => {
              const width = Math.min(100, (Math.abs(c.z) / 8) * 100);
              return (
                <div key={c.sensor} className="flex items-center gap-2">
                  <span className="w-40 truncate text-xs text-[var(--c-ink2)]">
                    {c.sensor.replaceAll("_", " ")}
                  </span>
                  <div className="h-2 flex-1 bg-[var(--c-panel2)]">
                    <div
                      className="h-2"
                      style={{
                        width: `${width}%`,
                        background: Math.abs(c.z) >= 2 ? STATE_COLOR[v.state] : "var(--c-ink3)",
                      }}
                    />
                  </div>
                  <span className="num w-14 text-right text-xs">z={c.z}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// --- Alarm list ---------------------------------------------------------------
export function AlarmPanel({
  alarms,
  onAck,
}: {
  alarms: Alarm[];
  onAck: (id: number) => void;
}) {
  return (
    <section className="panel p-2">
      <p className="panel-title mb-1">Alarms</p>
      {alarms.length === 0 ? (
        <p className="py-2 text-xs text-[var(--c-ink3)]">
          No alarms. Steady state is supposed to look like this.
        </p>
      ) : (
        <ul className="max-h-48 space-y-px overflow-y-auto">
          {alarms.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 px-1 py-1 text-xs"
              style={{
                background: a.acked ? "transparent" : "var(--c-panel2)",
                fontWeight: a.acked ? 400 : 600,
              }}
            >
              <span className="num w-12 shrink-0 text-[var(--c-ink3)]">
                t={a.frame}
              </span>
              <span
                className="w-2 shrink-0"
                aria-hidden
                style={{
                  color: a.kind === "rtn" ? "var(--c-ink3)" : STATE_COLOR[a.severity as ToolState],
                }}
              >
                ●
              </span>
              <span className="num w-20 shrink-0">{chamberName(a.toolId)}</span>
              <span className="flex-1 truncate text-[var(--c-ink2)]">{a.message}</span>
              {!a.acked && (
                <button
                  type="button"
                  onClick={() => onAck(a.id)}
                  className="shrink-0 border border-[var(--c-line)] px-1.5 text-[10px] text-[var(--c-action)]"
                >
                  ACK
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// --- Sovereignty panel --------------------------------------------------------
export function SovereigntyPanel({
  stats,
  outage,
  onToggleOutage,
  egressSample,
}: {
  stats: GatewayStats;
  outage: boolean;
  onToggleOutage: () => void;
  egressSample: Record<string, unknown> | null;
}) {
  const rows: Array<[string, string, string?]> = [
    ["raw frames ingested", stats.raw_ingested.toLocaleString()],
    ["published to inference", stats.normalized_published.toLocaleString()],
    [
      outage ? "buffering (outage)" : "buffer depth",
      stats.buffer_depth.toLocaleString(),
      outage ? "var(--c-warn)" : undefined,
    ],
    ["withheld from cloud", stats.losant_withheld_airgapped.toLocaleString()],
    ["forwarded off-site", String(stats.losant_forwarded)],
  ];
  return (
    <section className="panel p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="panel-title">Data boundary — SUSE Industrial Edge gateway</p>
        <button type="button" onClick={onToggleOutage} className={actionBtn()}>
          {outage ? "Restore inference (flush)" : "Simulate outage"}
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {rows.map(([label, value, color]) => (
          <div key={label} className="flex items-baseline justify-between gap-2">
            <dt className="text-[10px] text-[var(--c-ink3)]">{label}</dt>
            <dd className="num text-xs" style={color ? { color } : undefined}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {egressSample && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] tracking-wider text-[var(--c-ink3)] uppercase">
            Egress inspector — only payload allowed off-site
          </summary>
          <pre className="num mt-1 overflow-x-auto border border-[var(--c-line)] bg-[var(--c-panel2)] p-2 text-[10px] leading-4">
            {JSON.stringify(egressSample, null, 2)}
          </pre>
        </details>
      )}
      <p className="mt-2 text-[11px] leading-4 text-[var(--c-ink3)]">
        The gateway (Losant Gateway Edge Agent — SUSE Industrial Edge) is the
        single egress point: raw telemetry stays at the fab, only derived
        health leaves. In the on-prem kit, SUSE Security (NeuVector) enforces
        this boundary at the network layer — see the lab guide&apos;s egress
        exercise.
      </p>
    </section>
  );
}
