"use client";

/**
 * Console — the FabEdge FDC tool-health console. This is the whole app: a
 * simulated plasma-etch bay scored live by the same SPC model the on-prem
 * kit runs, presented in control-room form (ISA-101-informed chrome, SEMI
 * E10 states, ISA-18.2-style alarms).
 *
 * Honesty contract: the simulation is labeled by a persistent credibility
 * chip and a "what is real here" panel — never hidden, never shouted. Time
 * base is frames (the model's unit); ticking pauses while the tab is hidden.
 * Zero engine changes live here: this file only presents DemoEngine.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AiPanel, type ExplainState } from "@/components/console/AiPanel";
import {
  AlarmPanel,
  HealthPanel,
  SovereigntyPanel,
  ToolGrid,
} from "@/components/console/panels";
import { ScenarioPanel } from "@/components/console/ScenarioPanel";
import { StripChart } from "@/components/console/StripChart";
import { ackAlarm, deriveAlarms, unackedCount, type Alarm } from "@/lib/console/alarms";
import { FAB_CONTEXT, SENSOR_META, chamberName } from "@/lib/console/fab";
import { SCENARIO, SCENARIO_TOOL } from "@/lib/console/scenario";
import type { DerivedVerdict } from "@/lib/demo/ai-context";
import { derivedFields } from "@/lib/demo/gateway";
import { DEFAULT_SEED, DemoEngine } from "@/lib/demo/engine";
import type { FaultName, ToolState, Verdict } from "@/lib/demo/types";

const TICK_HZ = 4;
const PREWARM_FRAMES = 150;

function toDerived(v: Verdict): DerivedVerdict {
  return {
    tool_id: v.tool_id,
    health: v.health,
    state: v.state,
    rul_frames: v.rul_frames,
    warming: v.warming,
    top_contributors: v.top_contributors,
  };
}

type View = {
  tools: Verdict[];
  frame: number;
  seed: number;
  outage: boolean;
};

export function Console() {
  const engineRef = useRef<DemoEngine | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [selected, setSelected] = useState<string>(SCENARIO_TOOL);
  const [hidden, setHidden] = useState(false);
  const [explains, setExplains] = useState<Record<string, ExplainState>>({});
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const alarmStateRef = useRef<{ prev: Map<string, ToolState>; nextId: number }>({
    prev: new Map(),
    nextId: 1,
  });
  const diagnosisShownRef = useRef(false);
  const [scenarioOn, setScenarioOn] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState<boolean[]>(() =>
    SCENARIO.map(() => false),
  );

  const refresh = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const snapshot = engine.snapshot();
    setView({
      tools: snapshot.tools,
      frame: engine.frame,
      seed: engine.seed,
      outage: engine.outage,
    });
    // Alarms from state transitions (presentation-side journal).
    const s = alarmStateRef.current;
    setAlarms((existing) => {
      const r = deriveAlarms(s.prev, snapshot.tools, engine.frame, existing, s.nextId);
      s.prev = r.states;
      s.nextId = r.nextId;
      return r.alarms;
    });
    // Scenario condition check for the current step.
    setCompleted((prev) => {
      const idx = prev.findIndex((c) => !c);
      if (idx === -1) return prev;
      const step = SCENARIO[idx];
      if (
        step.done({ engine, diagnosisShown: diagnosisShownRef.current }) &&
        idx <= prev.length - 1
      ) {
        const next = [...prev];
        next[idx] = true;
        return next;
      }
      return prev;
    });
  }, []);

  const boot = useCallback(
    (seed: number) => {
      const engine = new DemoEngine({ seed });
      engine.run(PREWARM_FRAMES);
      engineRef.current = engine;
      alarmStateRef.current = { prev: new Map(), nextId: 1 };
      setAlarms([]);
      refresh();
    },
    [refresh],
  );

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("seed");
    const parsed = param == null ? NaN : Number.parseInt(param, 10);
    boot(Number.isFinite(parsed) ? parsed : DEFAULT_SEED);
  }, [boot]);

  useEffect(() => {
    setHidden(document.hidden);
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(() => {
      const engine = engineRef.current;
      if (!engine || document.hidden) return;
      engine.tick();
      refresh();
    }, 1000 / TICK_HZ);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const inject = useCallback(
    (toolId: string, fault: FaultName) => {
      engineRef.current?.injectFault(toolId, fault);
      refresh();
    },
    [refresh],
  );
  const heal = useCallback(
    (toolId: string) => {
      engineRef.current?.heal(toolId);
      refresh();
    },
    [refresh],
  );
  const toggleOutage = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setOutage(!engine.outage);
    refresh();
  }, [refresh]);

  const explainTool = useCallback(async (toolId: string) => {
    const verdict = engineRef.current?.verdict(toolId);
    if (!verdict) return;
    diagnosisShownRef.current = true;
    setExplains((prev) => ({ ...prev, [toolId]: { status: "loading" } }));
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toDerived(verdict)),
      });
      const data = await res.json();
      setExplains((prev) => ({
        ...prev,
        [toolId]: {
          status: "done",
          available: Boolean(data.available),
          text: data.available ? data.explanation : (data.note ?? "unavailable"),
          model: data.model,
        },
      }));
    } catch (err) {
      setExplains((prev) => ({
        ...prev,
        [toolId]: {
          status: "done",
          available: false,
          text: `request failed: ${err instanceof Error ? err.message : err}`,
        },
      }));
    }
  }, []);

  const getFleet = useCallback(
    () => (engineRef.current?.snapshot().tools ?? []).map(toDerived),
    [],
  );
  const markDiagnosisShown = useCallback(() => {
    diagnosisShownRef.current = true;
  }, []);

  const scenarioAction = useCallback(
    (index: number) => {
      const engine = engineRef.current;
      const step = SCENARIO[index];
      if (!engine || !step?.run) return;
      step.run(engine);
      if (index === 1) setSelected(SCENARIO_TOOL);
      refresh();
    },
    [refresh],
  );
  const scenarioNext = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, SCENARIO.length - 1));
  }, []);

  if (!view) {
    return (
      <p className="p-6 text-sm text-[var(--c-ink3)]">Starting the bay…</p>
    );
  }

  const selectedVerdict =
    view.tools.find((t) => t.tool_id === selected) ?? view.tools[0];
  const engine = engineRef.current!;
  const history = engine.toolHistory(selectedVerdict.tool_id);
  const healthHistory = history.map((h) => h.health);
  const worst = view.tools.reduce((a, b) => (a.health <= b.health ? a : b));

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-3 pb-6">
      {/* Header strip */}
      <header className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-[var(--c-line)] py-2">
        <h1 className="text-sm font-semibold tracking-wide">
          FabEdge FDC
          <span className="ml-2 font-normal text-[var(--c-ink3)]">
            {FAB_CONTEXT.bay}
          </span>
        </h1>
        <span className="num text-[11px] text-[var(--c-ink3)]">
          {FAB_CONTEXT.lot} · {FAB_CONTEXT.recipe} · wafer {FAB_CONTEXT.wafers}
        </span>
        <span
          className="border border-[var(--c-line)] px-2 py-0.5 text-[10px] tracking-wide text-[var(--c-ink2)]"
          title="Simulated telemetry, real math: the SPC model is the same code path as the on-prem kit, proven by replaying 590 recorded frames from the real kit through this port in CI."
        >
          SIMULATED FAB · same SPC model as the on-prem kit · golden-parity-tested
        </span>
        <span className="flex-1" />
        {hidden && (
          <span className="num text-[10px] text-[var(--c-watch)]">paused (tab hidden)</span>
        )}
        <span className="num text-[11px] text-[var(--c-ink3)]">
          t={view.frame} · {TICK_HZ} cycles/s · seed {view.seed}
        </span>
        <span className="num text-[11px]" style={{ color: unackedCount(alarms) ? "var(--c-warn)" : "var(--c-ink3)" }}>
          {unackedCount(alarms)} unack
        </span>
      </header>

      {/* Main grid */}
      <main className="mt-3 grid flex-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
        <div className="space-y-3">
          <ToolGrid tools={view.tools} selected={selectedVerdict.tool_id} onSelect={setSelected} />
          {scenarioOn ? (
            <ScenarioPanel
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
              className="w-full border border-[var(--c-line)] py-1.5 text-xs text-[var(--c-action)] hover:bg-[var(--c-panel2)]"
            >
              Show guided scenario
            </button>
          )}
        </div>

        <div className="space-y-3">
          <HealthPanel
            verdict={selectedVerdict}
            healthHistory={healthHistory}
            activeFault={engine.activeFault(selectedVerdict.tool_id)}
            onInject={inject}
            onHeal={heal}
          />
          <section>
            <p className="panel-title mb-1.5">
              Sensor traces — {chamberName(selectedVerdict.tool_id)} · last{" "}
              {history.length} cycles · UCL/LCL = learned operating point ±3σ
            </p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {SENSOR_META.map((meta) => (
                <StripChart
                  key={meta.key}
                  meta={meta}
                  values={history.map((h) => h.sensors[meta.key]).filter((v) => v !== undefined)}
                  latestFrame={view.frame}
                />
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-3">
          <AlarmPanel alarms={alarms} onAck={(id) => setAlarms((a) => ackAlarm(a, id))} />
          <AiPanel
            verdict={selectedVerdict}
            explain={explains[selectedVerdict.tool_id]}
            onExplain={explainTool}
            getFleet={getFleet}
            onDiagnosisShown={markDiagnosisShown}
          />
          <SovereigntyPanel
            stats={engine.gatewayStats()}
            outage={view.outage}
            onToggleOutage={toggleOutage}
            egressSample={worst ? derivedFields(worst) : null}
          />
        </div>
      </main>

      {/* Footer: provenance + docs, deliberately quiet */}
      <footer className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--c-line)] pt-2 text-[11px] text-[var(--c-ink3)]">
        <details>
          <summary className="cursor-pointer hover:text-[var(--c-ink2)]">
            What is real here?
          </summary>
          <div className="mt-1 max-w-3xl space-y-1 leading-4">
            <p>
              <b className="text-[var(--c-ink2)]">Real:</b> the SPC health model
              (Hotelling T² / EWMA, golden-parity-tested against the on-prem
              kit&apos;s Python model), the gateway&apos;s governed-egress and
              offline-buffering behavior, and the derived-only contract on
              everything that leaves this tab.
            </p>
            <p>
              <b className="text-[var(--c-ink2)]">Simulated:</b> the sensors
              (seeded synthetic telemetry), time (frames, accelerated), and the
              fab context. Enforcement is real in the on-prem kit — K3s on SL
              Micro, SUSE Industrial Edge gateway, NetworkPolicy + SUSE
              Security (NeuVector) — not in a browser tab.
            </p>
            <p>
              <b className="text-[var(--c-ink2)]">AI:</b> explain/assistant are
              labeled hosted stand-ins; the kit answers on-prem with Ollama.
            </p>
          </div>
        </details>
        <span className="flex-1" />
        <a
          className="hover:text-[var(--c-ink2)]"
          href="https://github.com/MetalRoosterSimulation/edge-proof-factory"
        >
          GitHub
        </a>
        <a
          className="hover:text-[var(--c-ink2)]"
          href="https://github.com/MetalRoosterSimulation/edge-proof-factory/blob/main/docs/LAB-SETUP.md"
        >
          Build this on-prem (lab guide)
        </a>
        <button
          type="button"
          className="hover:text-[var(--c-ink2)]"
          onClick={() => {
            const url = `${window.location.origin}/?seed=${view.seed}`;
            void navigator.clipboard?.writeText(url);
          }}
        >
          Copy link to this fab
        </button>
      </footer>
    </div>
  );
}
