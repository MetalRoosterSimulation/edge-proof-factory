import type { Metadata } from "next";
import Link from "next/link";
import { DemoClient } from "./DemoClient";

export const metadata: Metadata = {
  title: "Live simulation — Edge Proof Factory",
  description:
    "Interactive simulation of the semiconductor predictive-maintenance Proof Kit: the same SPC model, ported to TypeScript, running entirely in your browser.",
};

const KIT_SLUG = "semiconductor-predictive-maintenance";
const REPO = "https://github.com/MetalRoosterSimulation/edge-proof-factory";

// The page itself is static; everything live happens client-side in
// DemoClient. No Supabase in the demo runtime — this route must work even if
// the content backend is asleep.
export default function DemoPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">
          Predictive maintenance, live in your browser
        </h1>
        <p className="mt-2 max-w-3xl text-black/70 dark:text-white/70">
          This is an <b>interactive simulation of the Proof Kit</b>: the same
          statistical process control model that runs in the kit&apos;s
          edge-inference tier — an EWMA-smoothed Hotelling T² control chart
          with per-tool learned baselines and a remaining-useful-life
          forecast — ported to TypeScript and running entirely in this tab on
          synthetic telemetry. Parity with the Python model is enforced by
          replaying 590 recorded frames from the real kit through the port in
          CI. The gateway tier&apos;s offline buffering is here too (simulate
          an outage, watch it buffer and flush), and the kit&apos;s AI tier —
          per-tool Explain and the fleet-grounded Fab Assistant — is served by
          a hosted Claude model as a labeled stand-in that receives derived
          verdicts only, never raw telemetry; in the kit that tier runs fully
          on-prem (Ollama + Open WebUI). The kit itself runs on single-node
          k3s under Rancher/Fleet; this page simulates it, it does not
          replace it.
        </p>
      </div>

      <DemoClient />

      <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h2 className="text-lg font-medium">Run the real thing</h2>
        <p className="mt-1 text-sm text-black/70 dark:text-white/70">
          The Proof Kit deploys this pipeline as real services — MQTT broker,
          gateway tier, inference pod, dashboard — on a fresh single-node k3s
          cluster with one command, then hands off the rebuild.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link
            href={`/kits/${KIT_SLUG}`}
            className="rounded-md border border-black/15 px-3 py-1.5 font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            The Proof Kit — components, scale-up, footprint
          </Link>
          <a
            href={`${REPO}/blob/main/HOW-TO-RUN-THIS-DEMO.md`}
            className="rounded-md border border-black/15 px-3 py-1.5 font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            HOW-TO-RUN-THIS-DEMO.md — make up on your hardware
          </a>
          <a
            href={REPO}
            className="rounded-md border border-black/15 px-3 py-1.5 font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Source on GitHub
          </a>
        </div>
      </section>
    </div>
  );
}
