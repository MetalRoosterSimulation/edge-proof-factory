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
 * gateway.py's stats one-for-one, running the kit's air-gapped path. */
export function GovernancePanel({ stats }: { stats: GatewayStats }) {
  return (
    <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h2 className="text-lg font-medium">
        Governance boundary — {stats.site} / {stats.line}
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="raw frames ingested"
          value={stats.raw_ingested.toLocaleString()}
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
      <p className="mt-3 text-sm text-black/70 dark:text-white/70">
        The gateway tier is the single egress point and only ever sees the
        derived health topic — raw telemetry is structurally incapable of
        leaving it. In the kit that is a network boundary (MQTT topic
        separation + NetworkPolicy on k3s), proven live: the gateway withheld
        100% of raw frames in air-gapped mode. This page runs the same
        counters in your browser, where the boundary is even tighter — no
        data, raw or derived, leaves this tab at all.
      </p>
    </section>
  );
}
