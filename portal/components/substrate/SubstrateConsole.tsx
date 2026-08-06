"use client";

/**
 * Site AI Inference Substrate console — an in-browser, seeded SIMULATION
 * of the site-inference-substrate kit's pipeline: looping historian feed ->
 * KServe-class serving (three models) -> per-model outage policy at the
 * uplink (continue / flag / suppress) -> central ingestion, plus a
 * hash-chained evidence stream with in-place verification and a tamper
 * demonstration.
 *
 * Presentation only. Uses lib/substrate/sim.ts; imports nothing from
 * lib/demo/ (the FabEdge parity core is untouched).
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { ScenarioPanel } from "@/components/console/ScenarioPanel";
import { advance } from "@/lib/console/guided";
import { SUBSTRATE_SCENARIO, SUBSTRATE_SCENARIO_DONE } from "@/lib/substrate/scenario";
import {
  DEFAULT_SEED,
  SubstrateEngine,
  type SimEvent,
  type SubstrateView,
} from "@/lib/substrate/sim";

const TICK_HZ = 4;
const PREWARM_TICKS = 60;

const EVENT_COLOR: Record<SimEvent["kind"], string> = {
  info: "var(--c-ink2)",
  wan: "var(--c-warn)",
  policy: "var(--c-watch)",
  evidence: "var(--c-action)",
  alert: "var(--c-crit)",
};

const POLICY_COLOR: Record<string, string> = {
  continue: "var(--c-ink)",
  flag: "var(--c-watch)",
  suppress: "var(--c-action)",
};

function actionBtn(extra = ""): string {
  return (
    "border border-[var(--c-line)] px-2.5 py-1 text-[11px] tracking-wide " +
    "text-[var(--c-ink)] hover:border-[var(--c-ink3)] hover:bg-[var(--c-panel2)] " +
    "disabled:opacity-40 disabled:hover:bg-transparent " +
    extra
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] uppercase tracking-wide text-[var(--c-ink3)]">{label}</span>
      <span className="num text-[12px]" style={{ color: color ?? "var(--c-ink)" }}>
        {value}
      </span>
    </div>
  );
}

export function SubstrateConsole() {
  const engineRef = useRef<SubstrateEngine | null>(null);
  const [view, setView] = useState<SubstrateView | null>(null);
  const [scenarioOn, setScenarioOn] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState<boolean[]>(() =>
    SUBSTRATE_SCENARIO.map(() => false),
  );

  const act = useCallback((fn: (e: SubstrateEngine) => void) => {
    const engine = engineRef.current;
    if (engine) {
      fn(engine);
      const v = engine.view();
      setView(v);
      setCompleted((prev) => advance(SUBSTRATE_SCENARIO, prev, v));
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const seedParam = Number(params.get("seed"));
    const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : DEFAULT_SEED;
    const engine = new SubstrateEngine(seed);
    engine.run(PREWARM_TICKS);
    engineRef.current = engine;

    let timer: number | null = null;
    const start = () => {
      if (timer === null) {
        timer = window.setInterval(() => {
          engine.tick();
          const v = engine.view();
          setView(v);
          setCompleted((prev) => advance(SUBSTRATE_SCENARIO, prev, v));
        }, 1000 / TICK_HZ);
      }
    };
    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (!view) {
    return (
      <div className="mx-auto max-w-[1200px] px-3 py-10 text-[12px] text-[var(--c-ink3)]">
        starting site enclave…
      </div>
    );
  }

  const chainColor =
    view.chainStatus === "OK"
      ? "var(--c-ink)"
      : view.chainStatus === "BROKEN"
        ? "var(--c-crit)"
        : "var(--c-ink3)";

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col gap-3 px-3 pb-8 pt-4">
      {/* header */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-[15px] font-semibold text-[var(--c-ink)]">
          Site AI Inference Substrate — analytics enclave
        </h1>
        <span
          className="border border-[var(--c-line)] px-2 py-0.5 text-[10px] tracking-wide text-[var(--c-ink2)]"
          title="Everything on this page runs in your browser as a seeded simulation of the site-inference-substrate kit's pipeline. The evidence 'signature' here is a toy checksum; the runnable kit signs with HMAC and production uses per-site PKI keys. No live products, no telemetry, no backend."
        >
          SIMULATED SITE · in-browser model of the substrate kit pipeline · no live products
        </span>
        <span className="num ml-auto text-[11px] text-[var(--c-ink3)]">
          t={view.t} · seed {view.seed}
        </span>
      </header>

      {scenarioOn ? (
        <ScenarioPanel
          steps={SUBSTRATE_SCENARIO}
          title="Guided scenario — outage, evidence, tamper"
          doneNote={SUBSTRATE_SCENARIO_DONE}
          stepIndex={stepIndex}
          completed={completed}
          onAction={(index) => {
            const step = SUBSTRATE_SCENARIO[index];
            if (step.run) act(step.run);
          }}
          onNext={() =>
            setStepIndex((i) => Math.min(i + 1, SUBSTRATE_SCENARIO.length - 1))
          }
          onDismiss={() => setScenarioOn(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setScenarioOn(true)}
          className="self-start text-[11px] text-[var(--c-ink3)] hover:text-[var(--c-ink2)]"
        >
          Show guided scenario
        </button>
      )}

      {/* main grid */}
      <main className="grid gap-3 lg:grid-cols-3">
        {/* MODELS */}
        <section className="panel flex flex-col gap-2 p-3">
          <h2 className="panel-title">Serving tier — three models, three outage policies</h2>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-[9px] uppercase text-[var(--c-ink3)]">
                <th className="pb-1 font-normal">model</th>
                <th className="pb-1 font-normal">policy</th>
                <th className="pb-1 font-normal">scored</th>
                <th className="pb-1 font-normal">disposition</th>
              </tr>
            </thead>
            <tbody>
              {view.models.map((m) => (
                <tr key={m.name} className="border-t border-[var(--c-line-faint)]">
                  <td className="py-1 pr-2 text-[var(--c-ink)]">
                    {m.name}
                    <span className="text-[var(--c-ink3)]"> {m.version}</span>
                  </td>
                  <td className="py-1 pr-2" style={{ color: POLICY_COLOR[m.policy] }}>
                    {m.policy}
                  </td>
                  <td className="num py-1 pr-2 text-[var(--c-ink)]">{m.scored}</td>
                  <td className="py-1 text-[var(--c-ink2)]">{m.lastDisposition}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1 border border-[var(--c-line-faint)] bg-[var(--c-panel2)] p-2">
            <div className="text-[10px] uppercase tracking-wide text-[var(--c-ink3)]">
              historian feed (DMZ replica, read-only)
            </div>
            <div className="num mt-1 grid grid-cols-3 gap-1 text-[10px] text-[var(--c-ink2)]">
              {view.units.map((u) => (
                <div key={u.unit}>
                  <span className="text-[var(--c-ink)]">{u.unit}</span>{" "}
                  {u.temperature}°C · {u.pressure}bar · {u.cycles}cyc
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* UPLINK */}
        <section className="panel flex flex-col gap-3 p-3">
          <h2 className="panel-title">Uplink — outbound only</h2>
          <Stat
            label="uplink"
            value={view.uplinkUp ? "UP — site dialing out" : "SEVERED — scoring continues"}
            color={view.uplinkUp ? undefined : "var(--c-warn)"}
          />
          <Stat label="outputs queued" value={String(view.outboxQueued)}
            color={view.outboxQueued > 0 ? "var(--c-warn)" : undefined} />
          <Stat label="delivered (flagged)" value={`${view.delivered} (${view.deliveredFlagged})`} />
          <Stat label="held for review (suppress)" value={String(view.heldPendingReview)}
            color="var(--c-action)" />
          <p className="text-[10px] leading-4 text-[var(--c-ink3)]">
            Every flow across this boundary is initiated by the site. Severing the uplink never
            cuts the local feed — the DMZ read is a separate path. Held outputs are never
            auto-delivered, even after the uplink returns: suppress means pending review.
          </p>
          <div className="mt-auto flex flex-wrap gap-2">
            {view.uplinkUp ? (
              <button type="button" className={actionBtn("text-[var(--c-warn)]")}
                onClick={() => act((e) => e.severUplink())}>
                Sever uplink
              </button>
            ) : (
              <button type="button" className={actionBtn("text-[var(--c-action)]")}
                onClick={() => act((e) => e.healUplink())}>
                Restore uplink
              </button>
            )}
            <button type="button" className={actionBtn()} onClick={() => act((e) => e.sealNow())}>
              Seal evidence now
            </button>
            <button type="button" className={actionBtn()} onClick={() => act((e) => e.verifyChain())}>
              Verify chain
            </button>
            <button type="button" className={actionBtn("text-[var(--c-crit)]")}
              onClick={() => act((e) => e.tamperBundle())}>
              Tamper a bundle
            </button>
          </div>
        </section>

        {/* EVIDENCE + CENTRAL */}
        <section className="panel flex flex-col gap-3 p-3">
          <h2 className="panel-title">Evidence — signed, chained, write-once</h2>
          <Stat label="bundles sealed on site" value={String(view.evidenceSealed)} />
          <Stat label="shipped / verified centrally"
            value={`${view.evidenceShipped} / ${view.evidenceVerified}`} />
          <Stat label="chain verification" value={view.chainStatus} color={chainColor} />
          {view.chainProblem ? (
            <div className="border border-[var(--c-line-faint)] bg-[var(--c-panel2)] p-2 text-[10px] text-[var(--c-crit)]">
              {view.chainProblem}
            </div>
          ) : null}
          <h2 className="panel-title mt-2">Central — ML platform (far side)</h2>
          <Stat label="outputs received" value={String(view.centralOutputs)} />
          <Stat label="flagged stale-context" value={String(view.centralFlagged)}
            color={view.centralFlagged > 0 ? "var(--c-watch)" : undefined} />
          <p className="text-[10px] leading-4 text-[var(--c-ink3)]">
            Outputs are advisory — nothing here is a control signal, and nothing has a write
            path toward plant systems. The OT crossing is a read-only replica.
          </p>
        </section>
      </main>

      {/* event log */}
      <section className="panel p-3">
        <h2 className="panel-title">Event log</h2>
        <ul className="mt-1 flex max-h-48 flex-col gap-0.5 overflow-y-auto">
          {view.events.map((ev, i) => (
            <li key={`${ev.t}-${i}`} className="num text-[11px] leading-4"
              style={{ color: EVENT_COLOR[ev.kind] }}>
              t={String(ev.t).padStart(3, "0")} · {ev.text}
            </li>
          ))}
        </ul>
      </section>

      {/* honesty contract */}
      <details className="panel p-3 text-[11px] leading-5 text-[var(--c-ink2)]">
        <summary className="cursor-pointer text-[var(--c-ink)]">What is real here?</summary>
        <p className="mt-2">
          <span className="text-[var(--c-ink)]">Real:</span> the pipeline semantics this page
          demonstrates — a read-only historian feed scored at the site, per-model outage
          policies acting when the uplink drops (continue delivers, flag marks stale context,
          suppress holds for review and never auto-delivers), an evidence stream sealed on a
          chain where tampering is caught by verification, and full reconciliation on
          reconnect. These mirror the site-inference-substrate kit, which runs this same
          sequence as real containers on a single-node cluster and is re-proven automatically
          on every change.
        </p>
        <p className="mt-2">
          <span className="text-[var(--c-ink)]">Simulated:</span> everything running —
          telemetry, models, queues, the uplink, the chain. The evidence
          &quot;signature&quot; on this page is a toy checksum for illustration; the runnable
          kit signs with HMAC-SHA256 and the production design uses per-site keys from the
          customer&apos;s PKI. Seeded and replayable (<span className="num">?seed=7</span>).
          No live products, no backend.
        </p>
        <p className="mt-2">
          <span className="text-[var(--c-ink)]">In production:</span> the site runs as a SUSE
          Edge cluster (SUSE Linux Micro + K3s or RKE2 per site class, built as one sealed
          Edge Image Builder image), managed by Rancher Prime + Fleet pull-based GitOps —
          which is also the model release path — with SUSE Security (NeuVector) on every
          cluster, and serving on KServe- or Triton-class runtimes hosting the customer&apos;s
          or an ISV&apos;s models. Versions and floors: the repository&apos;s SUSE Edge stack
          notes.
        </p>
      </details>

      <footer className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--c-ink3)]">
        <Link className="underline-offset-2 hover:text-[var(--c-ink)] hover:underline" href="/">
          FabEdge console →
        </Link>
        <Link className="underline-offset-2 hover:text-[var(--c-ink)] hover:underline" href="/corridor">
          Corridor inspection demo →
        </Link>
        <span className="ml-auto">site-inference-substrate · edge-proof-factory</span>
      </footer>
    </div>
  );
}
