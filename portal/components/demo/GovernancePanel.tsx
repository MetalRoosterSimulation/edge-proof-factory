import type { GatewayStats } from "@/lib/demo/types";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-black/60 dark:text-white/60">{label}</dt>
      <dd className="font-mono text-lg font-semibold">{value}</dd>
    </div>
  );
}

/** The gateway tier's live governance ledger — the counters mirror
 * gateway.py's stats one-for-one, running the kit's air-gapped path — plus
 * the offline-buffering exercise (simulate a downstream outage, watch the
 * gateway buffer, recover, watch it flush) and the egress inspector showing
 * the exact derived payload that would cross the boundary. */
export function GovernancePanel({
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
  return (
    <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">
          Governance boundary — {stats.site} / {stats.line}
        </h2>
        <button
          type="button"
          onClick={onToggleOutage}
          className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
            outage
              ? "border-orange-500/50 text-orange-600 hover:bg-orange-500/10 dark:text-orange-400"
              : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          }`}
        >
          {outage
            ? "Restore inference tier (flush buffer)"
            : "Simulate downstream outage"}
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="raw frames ingested"
          value={stats.raw_ingested.toLocaleString()}
        />
        <Stat
          label="published downstream"
          value={stats.normalized_published.toLocaleString()}
        />
        <Stat
          label={outage ? "buffering (outage)" : "buffer depth"}
          value={stats.buffer_depth.toLocaleString()}
        />
        <Stat
          label="derived verdicts at egress"
          value={stats.derived_seen.toLocaleString()}
        />
        <Stat
          label="withheld (air-gapped)"
          value={stats.losant_withheld_airgapped.toLocaleString()}
        />
        <Stat label="forwarded to cloud" value={String(stats.losant_forwarded)} />
      </dl>
      {outage && (
        <p className="mt-2 text-sm text-orange-600 dark:text-orange-400">
          Downstream (inference tier) outage in progress — the gateway is
          buffering raw frames, exactly like the kit&apos;s Losant GEA offline
          buffering. Restore to flush every buffered frame through the model
          in order; nothing is lost.
        </p>
      )}
      <p className="mt-3 text-sm text-black/70 dark:text-white/70">
        The gateway tier is the single egress point and only ever sees the
        derived health topic — raw telemetry is structurally incapable of
        leaving it. In the kit that is a network boundary (MQTT topic
        separation + NetworkPolicy on k3s), proven live: the gateway withheld
        100% of raw frames in air-gapped mode. This page runs the same
        counters in your browser. The AI Explain/Assistant features send only
        the derived fields below to a hosted model — never raw telemetry; in
        the kit that tier runs fully on-prem.
      </p>
      {egressSample && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
            Egress inspector — the ONLY payload allowed across the boundary
          </p>
          <pre className="mt-1 overflow-x-auto rounded-md border border-black/10 bg-black/5 p-3 font-mono text-xs dark:border-white/10 dark:bg-white/5">
            {JSON.stringify(egressSample, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}
