"use client";

/**
 * DemoClient — the live fab console. Runs the whole ported pipeline
 * (simulator → gateway → SPC model) in this tab via DemoEngine.
 *
 * Time base: the model's unit is FRAMES (one process cycle per tool), not
 * seconds. The engine ticks at TICK_HZ while the tab is visible and PAUSES
 * when it is hidden — a wall-clock "catch-up" burst would misrepresent
 * frame-count semantics (warmup, EWMA smoothing, RUL), so we don't do it.
 * The header badge discloses both facts.
 *
 * Determinism: fixed default seed (same as the kit's seeded simulator), so
 * every visit replays identically until faults are injected; "New fab"
 * reseeds. `?seed=<n>` in the URL pins a seed — the share button copies it.
 *
 * The engine is created on the client only (in an effect) — the server
 * renders a static shell, so there is nothing nondeterministic in the
 * server-rendered markup to mismatch on hydration.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArchitectureXray } from "@/components/demo/ArchitectureXray";
import { GovernancePanel } from "@/components/demo/GovernancePanel";
import { ToolCard } from "@/components/demo/ToolCard";
import { DEFAULT_SEED, DemoEngine } from "@/lib/demo/engine";
import type { FaultName, FleetSnapshot, GatewayStats } from "@/lib/demo/types";

const TICK_HZ = 4;
const PREWARM_FRAMES = 150; // past warmup (30) + auto-fault start (40)

type View = {
  snapshot: FleetSnapshot;
  gateway: GatewayStats;
  histories: Record<string, number[]>;
  activeFaults: Record<string, FaultName | null>;
  seed: number;
};

function readView(engine: DemoEngine): View {
  const histories: Record<string, number[]> = {};
  const activeFaults: Record<string, FaultName | null> = {};
  for (const id of engine.toolIds()) {
    histories[id] = engine.toolHistory(id).map((h) => h.health);
    activeFaults[id] = engine.activeFault(id);
  }
  return {
    snapshot: engine.snapshot(),
    gateway: engine.gatewayStats(),
    histories,
    activeFaults,
    seed: engine.seed,
  };
}

const STATE_CHIP: Record<string, string> = {
  HEALTHY: "text-emerald-600 dark:text-emerald-400",
  WATCH: "text-amber-600 dark:text-amber-400",
  WARNING: "text-orange-600 dark:text-orange-400",
  CRITICAL: "text-red-600 dark:text-red-400",
};

export function DemoClient() {
  const engineRef = useRef<DemoEngine | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState(false);

  const boot = useCallback((seed: number) => {
    const engine = new DemoEngine({ seed });
    engine.run(PREWARM_FRAMES);
    engineRef.current = engine;
    setView(readView(engine));
  }, []);

  // Boot on mount; honor ?seed=<n> for shared/reproducible fabs. The seed can
  // only be read client-side (window.location), so this is a mount-only boot:
  // one synchronous setState replacing the server-rendered placeholder — a
  // single cascading render at mount, by design, so the fab is live on first
  // paint instead of one tick later.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("seed");
    const parsed = param == null ? NaN : Number.parseInt(param, 10);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    boot(Number.isFinite(parsed) ? parsed : DEFAULT_SEED);
  }, [boot]);

  // Tick while visible; pause (with notice) while hidden. The initial state
  // must be read too — a tab restored/opened in the background never fires
  // visibilitychange, and the notice should show from the first paint.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only sync with document.hidden
    setHidden(document.hidden);
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(() => {
      const engine = engineRef.current;
      if (!engine || document.hidden) return;
      engine.tick();
      setView(readView(engine));
    }, 1000 / TICK_HZ);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, []);

  // Inject/heal re-read the view immediately so the button flips on click
  // even while ticking is paused (hidden tab) or throttled by the browser.
  const inject = useCallback((toolId: string, fault: FaultName) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.injectFault(toolId, fault);
    setView(readView(engine));
  }, []);
  const heal = useCallback((toolId: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.heal(toolId);
    setView(readView(engine));
  }, []);
  const reseed = useCallback(() => {
    // Deterministic-but-fresh: derive the next seed from the current one so
    // the page stays free of nondeterministic sources.
    const next = ((engineRef.current?.seed ?? DEFAULT_SEED) * 48271) % 2147483647;
    boot(next);
  }, [boot]);
  const share = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}?seed=${engineRef.current?.seed ?? DEFAULT_SEED}`;
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  if (!view) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        Starting the fab…
      </p>
    );
  }

  const { snapshot, gateway, histories, activeFaults, seed } = view;
  const counts = Object.entries(snapshot.counts) as Array<[string, number]>;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex gap-3 font-mono text-xs">
          {counts.map(([state, n]) => (
            <span key={state} className={STATE_CHIP[state]}>
              {n} {state.toLowerCase()}
            </span>
          ))}
        </div>
        <span className="font-mono text-xs text-black/60 dark:text-white/60">
          {snapshot.frames_processed.toLocaleString()} frames scored · seed{" "}
          {seed}
        </span>
        <span className="font-mono text-xs text-black/50 dark:text-white/50">
          simulation · {TICK_HZ} process cycles/s (accelerated) · time counts
          frames, not seconds
        </span>
        {hidden && (
          <span className="font-mono text-xs text-amber-600 dark:text-amber-400">
            paused while tab is hidden
          </span>
        )}
        <span className="flex-1" />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={share}
            className="rounded-md border border-black/15 px-2.5 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            {copied ? "Link copied" : "Copy link to this fab"}
          </button>
          <button
            type="button"
            onClick={reseed}
            className="rounded-md border border-black/15 px-2.5 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            New fab
          </button>
        </div>
      </div>

      <p className="text-sm text-black/70 dark:text-white/70">
        Six simulated plasma-etch tools. <b>etch-03</b>{" "}
        was seeded with a slow RF match drift (the kit&apos;s auto-fault
        option) — watch its health fall and a cycles-to-critical forecast appear. Inject a fault on any
        healthy tool and the model detects it from the sensor shift; heal it
        and the health recovers.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {snapshot.tools.map((v) => (
          <ToolCard
            key={v.tool_id}
            verdict={v}
            history={histories[v.tool_id] ?? []}
            activeFault={activeFaults[v.tool_id] ?? null}
            onInject={inject}
            onHeal={heal}
          />
        ))}
      </div>

      <GovernancePanel stats={gateway} />
      <ArchitectureXray />
    </div>
  );
}
