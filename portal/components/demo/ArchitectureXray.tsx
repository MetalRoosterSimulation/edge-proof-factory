const ROWS: Array<{ browser: string; kit: string; production: string }> = [
  {
    browser: "Seeded TypeScript telemetry generator",
    kit: "sensor-simulator pod → MQTT fab-devices/<tool>/raw",
    production: "Fab equipment PLC / OPC UA / Modbus feeds",
  },
  {
    browser: "Gateway module (same counters, air-gapped path)",
    kit: "Losant Gateway Edge Agent tier — normalize, offline-buffer, governed egress",
    production: "SUSE Industrial Edge (Losant)",
  },
  {
    browser: "SPC health model — TypeScript port, golden-parity tested",
    kit: "edge-inference pod — same model in Python, CPU-only",
    production: "SUSE AI (heavier models, GPU node; same frame-in / verdict-out contract)",
  },
  {
    browser: "This page's console",
    kit: "fab-console dashboard on a NodePort",
    production: "Ops dashboard on the cluster",
  },
  {
    browser: "Browser tab (per-visitor sandbox)",
    kit: "Single-node k3s under Rancher/Fleet GitOps + NetworkPolicy",
    production: "SUSE Edge (SL Micro + K3s/RKE2) · SUSE Security (NeuVector)",
  },
];

/** "How this runs for real" — every element on this page mapped to its kit
 * tier and SUSE-supported production counterpart. Mappings are sourced from
 * the kit's component map; nothing here is invented. */
export function ArchitectureXray() {
  return (
    <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h2 className="text-lg font-medium">Architecture x-ray</h2>
      <p className="mt-1 text-sm text-black/70 dark:text-white/70">
        What each part of this page stands in for. The kit itself — not this
        page — runs k3s, MQTT, the gateway tier, and Rancher/Fleet.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-black/60 dark:border-white/10 dark:text-white/60">
              <th className="py-2 pr-4 font-medium">In this page</th>
              <th className="py-2 pr-4 font-medium">In the Proof Kit</th>
              <th className="py-2 font-medium">In production</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr
                key={row.browser}
                className="border-b border-black/5 align-top dark:border-white/5"
              >
                <td className="py-2 pr-4">{row.browser}</td>
                <td className="py-2 pr-4 text-black/70 dark:text-white/70">
                  {row.kit}
                </td>
                <td className="py-2 font-mono text-xs">{row.production}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
