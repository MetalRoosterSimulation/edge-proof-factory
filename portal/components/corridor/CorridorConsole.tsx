"use client";

/**
 * Corridor vegetation-inspection console — an in-browser, seeded SIMULATION
 * of the corridor-vegetation-inspection kit's ground-side pipeline:
 * per-station upload -> bounded working storage (alert, then backpressure) ->
 * swappable vision scoring -> findings/evidence queues across a severable
 * "WAN" -> work orders + custody archive with traceability metadata.
 *
 * Presentation only. Uses lib/corridor/sim.ts; imports nothing from
 * lib/demo/ (the FabEdge parity core is untouched).
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { ScenarioPanel } from "@/components/console/ScenarioPanel";
import { advance } from "@/lib/console/guided";
import { CORRIDOR_SCENARIO, CORRIDOR_SCENARIO_DONE } from "@/lib/corridor/scenario";
import { FootprintStrip } from "@/components/console/FootprintStrip";
import { CORRIDOR_FOOTPRINT } from "@/lib/console/footprint";
import {
  ALERT_PCT,
  BACKPRESSURE_PCT,
  CorridorEngine,
  DEFAULT_SEED,
  type CorridorView,
  type SimEvent,
} from "@/lib/corridor/sim";

const TICK_HZ = 4;
const PREWARM_TICKS = 24;

const EVENT_COLOR: Record<SimEvent["kind"], string> = {
  info: "var(--c-ink2)",
  alert: "var(--c-watch)",
  block: "var(--c-crit)",
  wan: "var(--c-warn)",
  ops: "var(--c-action)",
};

function actionBtn(extra = ""): string {
  return (
    "border border-[var(--c-line)] px-2.5 py-1 text-[11px] tracking-wide " +
    "text-[var(--c-ink)] hover:border-[var(--c-ink3)] hover:bg-[var(--c-panel2)] " +
    "disabled:opacity-40 disabled:hover:bg-transparent " +
    extra
  );
}

function StorageGauge({ view }: { view: CorridorView }) {
  const W = 300;
  const H = 18;
  const pct = Math.min(1, view.workingUsedMb / view.workingLimitMb);
  const fill =
    view.storageState === "BACKPRESSURE"
      ? "var(--c-crit)"
      : view.storageState === "ALERT"
        ? "var(--c-watch)"
        : "var(--c-trace)";
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Working storage ${Math.round(pct * 100)} percent used`}
      className="block"
    >
      <rect x={0} y={0} width={W} height={H} fill="var(--c-panel2)" />
      <rect x={0} y={0} width={W * pct} height={H} fill={fill} opacity={0.75} />
      <line x1={W * ALERT_PCT} y1={0} x2={W * ALERT_PCT} y2={H} stroke="var(--c-watch)" strokeDasharray="2 2" />
      <line x1={W * BACKPRESSURE_PCT} y1={0} x2={W * BACKPRESSURE_PCT} y2={H} stroke="var(--c-crit)" strokeDasharray="2 2" />
    </svg>
  );
}

function QueueBar({ label, depth, max }: { label: string; depth: number; max: number }) {
  const W = 220;
  const H = 10;
  const pct = Math.min(1, depth / max);
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-[10px] uppercase tracking-wide text-[var(--c-ink3)]">{label}</span>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${label} queue depth ${depth}`} className="block flex-1">
        <rect x={0} y={0} width={W} height={H} fill="var(--c-panel2)" />
        <rect x={0} y={0} width={W * pct} height={H} fill={depth > 0 ? "var(--c-warn)" : "var(--c-trace)"} opacity={0.8} />
      </svg>
      <span className="num w-8 text-right text-[11px] text-[var(--c-ink)]">{depth}</span>
    </div>
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

export function CorridorConsole() {
  const engineRef = useRef<CorridorEngine | null>(null);
  const [view, setView] = useState<CorridorView | null>(null);
  const [scenarioOn, setScenarioOn] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState<boolean[]>(() =>
    CORRIDOR_SCENARIO.map(() => false),
  );

  const act = useCallback((fn: (e: CorridorEngine) => void) => {
    const engine = engineRef.current;
    if (engine) {
      fn(engine);
      const v = engine.view();
      setView(v);
      setCompleted((prev) => advance(CORRIDOR_SCENARIO, prev, v));
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const seedParam = Number(params.get("seed"));
    const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : DEFAULT_SEED;
    const engine = new CorridorEngine(seed);
    engine.run(PREWARM_TICKS);
    engineRef.current = engine;

    let timer: number | null = null;
    const start = () => {
      if (timer === null) {
        timer = window.setInterval(() => {
          engine.tick();
          const v = engine.view();
          setView(v);
          setCompleted((prev) => advance(CORRIDOR_SCENARIO, prev, v));
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

  const scenarioAction = (index: number) => {
    const step = CORRIDOR_SCENARIO[index];
    if (step.run) act(step.run);
  };
  const scenarioNext = () => setStepIndex((i) => Math.min(i + 1, CORRIDOR_SCENARIO.length - 1));

  if (!view) {
    return (
      <div className="mx-auto max-w-[1200px] px-3 py-10 text-[12px] text-[var(--c-ink3)]">
        starting corridor site…
      </div>
    );
  }

  const storageColor =
    view.storageState === "BACKPRESSURE"
      ? "var(--c-crit)"
      : view.storageState === "ALERT"
        ? "var(--c-watch)"
        : "var(--c-ink)";

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col gap-3 px-3 pb-8 pt-4">
      {/* header */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-[15px] font-semibold text-[var(--c-ink)]">
          Corridor Inspection — ground-side site
        </h1>
        <span
          className="border border-[var(--c-line)] px-2 py-0.5 text-[10px] tracking-wide text-[var(--c-ink2)]"
          title="Everything on this page runs in your browser as a seeded simulation of the corridor-vegetation-inspection kit's pipeline. No live products, no telemetry, no backend."
        >
          SIMULATED SITE · in-browser model of the corridor kit pipeline · no live products
        </span>
        <span className="num ml-auto text-[11px] text-[var(--c-ink3)]">
          t={view.t} · seed {view.seed}
        </span>
      </header>

      <FootprintStrip footprint={CORRIDOR_FOOTPRINT} />

      {scenarioOn ? (
        <ScenarioPanel
          steps={CORRIDOR_SCENARIO}
          title="Guided scenario — outage to recovery"
          doneNote={CORRIDOR_SCENARIO_DONE}
          stepIndex={stepIndex}
          completed={completed}
          onAction={scenarioAction}
          onNext={scenarioNext}
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
        {/* SITE */}
        <section className="panel flex flex-col gap-3 p-3">
          <h2 className="panel-title">Edge site — ingest &amp; scoring</h2>
          <Stat label="uploads accepted" value={String(view.accepted)} />
          <Stat
            label="refused · credential (401)"
            value={String(view.rejectedCredential)}
            color={view.rejectedCredential ? "var(--c-crit)" : undefined}
          />
          <Stat
            label="refused · backpressure (507)"
            value={String(view.rejectedBackpressure)}
            color={view.rejectedBackpressure ? "var(--c-crit)" : undefined}
          />
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-wide text-[var(--c-ink3)]">
                working storage (finite by design)
              </span>
              <span className="num text-[11px]" style={{ color: storageColor }}>
                {view.workingUsedMb.toFixed(0)}/{view.workingLimitMb} MB · {view.storageState}
              </span>
            </div>
            <StorageGauge view={view} />
            <p className="mt-1 text-[10px] leading-4 text-[var(--c-ink3)]">
              Degradation order: capacity alert at 80%, ingest backpressure at 95%. Scored imagery
              and queued findings survive; storage frees only when evidence lands in the archive.
            </p>
          </div>
          <Stat label="scoring backlog" value={String(view.scoreBacklog)} />
          <Stat label="images scored" value={String(view.scored)} />
          <div className="border border-[var(--c-line-faint)] bg-[var(--c-panel2)] p-2">
            <div className="text-[10px] uppercase tracking-wide text-[var(--c-ink3)]">
              vision workload (swappable)
            </div>
            <div className="num mt-1 text-[11px] text-[var(--c-ink)]">{view.modelVersion}</div>
          </div>
        </section>

        {/* LINK */}
        <section className="panel flex flex-col gap-3 p-3">
          <h2 className="panel-title">Site boundary — outbound only</h2>
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide text-[var(--c-ink3)]">wan link</span>
            <span
              className="num text-[12px]"
              style={{ color: view.wanUp ? "var(--c-ink)" : "var(--c-warn)" }}
            >
              {view.wanUp ? "UP — site dialing out" : "SEVERED — site autonomous"}
            </span>
          </div>
          <QueueBar label="findings" depth={view.findingsQueued} max={40} />
          <QueueBar label="evidence" depth={view.evidenceQueued} max={40} />
          <p className="text-[10px] leading-4 text-[var(--c-ink3)]">
            Every flow across this boundary is initiated by the site: management pull, findings
            delivery, evidence sync, telemetry. The one inbound flow is the ground-station upload,
            carried under a per-station credential that reaches ingest only.
          </p>
          <div className="mt-auto flex flex-wrap gap-2">
            {view.wanUp ? (
              <button type="button" className={actionBtn("text-[var(--c-warn)]")} onClick={() => act((e) => e.severWan())}>
                Sever WAN
              </button>
            ) : (
              <button type="button" className={actionBtn("text-[var(--c-action)]")} onClick={() => act((e) => e.healWan())}>
                Restore WAN
              </button>
            )}
            <button type="button" className={actionBtn()} onClick={() => act((e) => e.toggleCampaign())}>
              {view.campaignRunning ? "Pause campaign" : "Resume campaign"}
            </button>
            <button type="button" className={actionBtn()} onClick={() => act((e) => e.attemptRevokedUpload())}>
              Try revoked station
            </button>
            <button type="button" className={actionBtn()} onClick={() => act((e) => e.swapModel())}>
              Swap vision model
            </button>
          </div>
        </section>

        {/* OPS */}
        <section className="panel flex flex-col gap-3 p-3">
          <h2 className="panel-title">Ops center — work orders &amp; custody archive</h2>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--c-ink3)]">
              work orders (from findings)
            </div>
            {view.workOrders.length === 0 ? (
              <div className="text-[11px] text-[var(--c-ink3)]">none yet</div>
            ) : (
              <ul className="flex flex-col gap-1">
                {view.workOrders.slice(0, 6).map((f) => (
                  <li key={f.id} className="num flex justify-between gap-2 text-[11px] text-[var(--c-ink)]">
                    <span>
                      {f.span} · {f.kind === "vegetation encroachment" ? "vegetation" : "hardware"} ·{" "}
                      {f.score.toFixed(2)}
                    </span>
                    <span style={{ color: "var(--c-action)" }}>{f.disposition}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Stat label="evidence records archived" value={String(view.archived)} />
          <div className="border border-[var(--c-line-faint)] bg-[var(--c-panel2)] p-2">
            <div className="text-[10px] uppercase tracking-wide text-[var(--c-ink3)]">
              last evidence record (traceability)
            </div>
            {view.lastEvidence ? (
              <dl className="num mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] text-[var(--c-ink)]">
                <dt className="text-[var(--c-ink3)]">span</dt>
                <dd>{view.lastEvidence.span}</dd>
                <dt className="text-[var(--c-ink3)]">flight</dt>
                <dd>{view.lastEvidence.flight}</dd>
                <dt className="text-[var(--c-ink3)]">model</dt>
                <dd>{view.lastEvidence.modelVersion}</dd>
                <dt className="text-[var(--c-ink3)]">disposition</dt>
                <dd>{view.lastEvidence.disposition}</dd>
              </dl>
            ) : (
              <div className="mt-1 text-[11px] text-[var(--c-ink3)]">nothing archived yet</div>
            )}
          </div>
        </section>
      </main>

      {/* architecture truths */}
      <section className="grid gap-3 lg:grid-cols-3">
        {[
          {
            title: "Flight tier out of scope",
            body: "Drones, flight control, and on-drone compute are vendor-controlled. This site begins where imagery lands: a plain file upload from the ground station. No device-discovery plumbing.",
          },
          {
            title: "The model is a tenant, not the point",
            body: "The vision container is a third-party workload the platform hosts. Swap it and the platform, queues, and evidence trail do not change — findings simply carry the new model version.",
          },
          {
            title: "No path to protection & control",
            body: "This analytics site has no data path to or from SCADA, EMS, or protection relays — a separation the production design states and network-verifies.",
          },
        ].map((n) => (
          <div key={n.title} className="panel p-3">
            <h3 className="panel-title">{n.title}</h3>
            <p className="mt-1 text-[11px] leading-4 text-[var(--c-ink2)]">{n.body}</p>
          </div>
        ))}
      </section>

      {/* event log */}
      <section className="panel p-3">
        <h2 className="panel-title">Event log</h2>
        <ul className="mt-1 flex max-h-48 flex-col gap-0.5 overflow-y-auto">
          {view.events.map((ev, i) => (
            <li key={`${ev.t}-${i}`} className="num text-[11px] leading-4" style={{ color: EVENT_COLOR[ev.kind] }}>
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
          demonstrates — one inbound upload flow under a per-station credential, finite working
          storage with a capacity alert before ingest backpressure, a swappable containerized
          vision workload, outbound-only delivery that queues under WAN loss and drains on
          restore, and evidence records carrying span, flight, model version, and disposition.
          These mirror the corridor-vegetation-inspection architecture package this kit is built
          from.
        </p>
        <p className="mt-2">
          <span className="text-[var(--c-ink)]">Simulated:</span> everything running — imagery,
          scores, queues, the WAN, the archive. It is a seeded in-browser model
          (deterministic; add <span className="num">?seed=7</span> to the URL to replay a
          different run). No live products, no real imagery, no backend.
        </p>
        <p className="mt-2">
          <span className="text-[var(--c-ink)]">In production:</span> the site runs as a SUSE
          Edge single-node cluster (SUSE Linux Micro + K3s, built as one Edge Image Builder
          image), managed by Rancher Prime + Fleet pull-based GitOps, with SUSE Security
          (NeuVector) on the cluster and an S3-compatible archive the utility selects under its
          own custody. Versions and floors: the repository&apos;s SUSE Edge stack notes.
        </p>
      </details>

      <footer className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--c-ink3)]">
        <Link className="underline-offset-2 hover:text-[var(--c-ink)] hover:underline" href="/">
          FabEdge console (semiconductor kit) →
        </Link>
        <Link className="underline-offset-2 hover:text-[var(--c-ink)] hover:underline" href="/site-inference">
          Site AI Inference Substrate →
        </Link>
        <span className="ml-auto">corridor-vegetation-inspection · edge-proof-factory</span>
      </footer>
    </div>
  );
}
