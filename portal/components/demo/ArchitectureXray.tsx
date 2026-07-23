const KIT = "reference-kits/semiconductor-predictive-maintenance/demo";

const ROWS: Array<{
  browser: string;
  kit: string;
  production: string;
  src: string;
}> = [
  {
    browser: "Seeded TypeScript telemetry generator",
    kit: "sensor-simulator pod → MQTT fab-devices/<tool>/raw",
    production: "Fab equipment PLC / OPC UA / Modbus feeds",
    src: `portal/lib/demo/simulator.ts ↔ ${KIT}/images/sensor-simulator/app/simulate.py`,
  },
  {
    browser: "Gateway module — counters, offline buffer, air-gapped path",
    kit: "Losant Gateway Edge Agent tier — normalize, offline-buffer, governed egress",
    production: "SUSE Industrial Edge (Losant)",
    src: `portal/lib/demo/gateway.ts ↔ ${KIT}/images/gateway-edge-agent/app/gateway.py`,
  },
  {
    browser: "SPC health model — TypeScript port, golden-parity tested",
    kit: "edge-inference pod — same model in Python, CPU-only",
    production: "SUSE AI (heavier models, GPU node; same frame-in / verdict-out contract)",
    src: `portal/lib/demo/health-model.ts ↔ ${KIT}/images/edge-inference/app/health_model.py (source of truth; parity: portal/scripts/generate-golden-vectors.py)`,
  },
  {
    browser: "Explain (AI) + Fab Assistant — hosted Claude, derived fields only",
    kit: "SUSE AI profile: Ollama + Open WebUI on k3s — same prompts, fully on-prem",
    production: "SUSE AI (Ollama / vLLM on a GPU node)",
    src: `portal/app/api/{explain,chat}/route.ts + portal/lib/demo/ai-context.ts ↔ ${KIT}/../images/edge-inference/app/service.py (_api_explain, _fleet_context) + k8s/ai/`,
  },
  {
    browser: "This page's console",
    kit: "fab-console dashboard on a NodePort",
    production: "Ops dashboard on the cluster",
    src: `portal/app/demo/ ↔ ${KIT}/images/edge-inference/app/dashboard.html`,
  },
  {
    browser: "Browser tab (per-visitor sandbox)",
    kit: "Single-node k3s under Rancher/Fleet GitOps + NetworkPolicy",
    production: "SUSE Edge (SL Micro + K3s/RKE2) · SUSE Security (NeuVector)",
    src: `${KIT}/k8s/ + HOW-TO-RUN-THIS-DEMO.md + scripts/wire-rancher.sh`,
  },
];

/** "How this runs for real" — every element on this page mapped to its kit
 * tier, its SUSE-supported production counterpart, and the source files a
 * colleague would study to rebuild it. Mappings are sourced from the kit's
 * component map; nothing here is invented. */
export function ArchitectureXray() {
  return (
    <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h2 className="text-lg font-medium">Architecture x-ray & study map</h2>
      <p className="mt-1 text-sm text-black/70 dark:text-white/70">
        What each part of this page stands in for, and where its source lives
        in{" "}
        <a
          className="underline"
          href="https://github.com/MetalRoosterSimulation/edge-proof-factory"
        >
          the repo
        </a>
        . The kit itself — not this page — runs k3s, MQTT, the gateway tier,
        and Rancher/Fleet.
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
                <td className="py-2 pr-4">
                  {row.browser}
                  <div className="mt-1 font-mono text-[10px] leading-4 text-black/40 dark:text-white/40">
                    {row.src}
                  </div>
                </td>
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
