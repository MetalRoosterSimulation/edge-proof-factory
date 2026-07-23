/**
 * engine.ts — orchestration for the in-browser Proof Kit simulation.
 *
 * In the k3s kit the tiers are separate pods wired by MQTT topics:
 *
 *   sensor-simulator ──fab-devices/<tool>/raw──▶ gateway (Losant GEA tier)
 *   gateway ──fab/<tool>/telemetry──▶ edge-inference (SPC model)
 *   edge-inference ──fab/<tool>/health──▶ gateway (governed egress point)
 *   fault injection ──fab/control──▶ sensor-simulator
 *
 * This engine keeps the exact same tier contract in one browser tab: each
 * tick moves one frame per tool through simulator → gateway.normalize →
 * model.ingest → gateway.seeDerived, and injectFault()/heal() replace the
 * `fab/control` topic. Nothing here talks to any network — raw AND derived
 * data never leave the tab, which is a strictly tighter boundary than the
 * kit's (where derived scores MAY egress when Losant credentials exist).
 *
 * Determinism: a fixed default seed (like the kit's seeded simulator) makes
 * every visit reproducible; reseed() gives a fresh fab. Time advances in
 * FRAMES (the model's native unit — warmup, EWMA, RUL are frame-count
 * semantics), so the caller must pause ticking when the tab is hidden rather
 * than "catching up" — a burst of catch-up frames would misrepresent the
 * model's time base.
 */
import { Gateway } from "./gateway";
import { DEFAULT_WARMUP, Fleet, SENSORS } from "./health-model";
import { FAULTS, Gaussian, SimTool } from "./simulator";
import type {
  FaultName,
  FleetSnapshot,
  GatewayStats,
  HistorySample,
  ToolState,
  Verdict,
} from "./types";

export const DEFAULT_SEED = 1234; // same default the Python simulator uses
export const DEFAULT_N_TOOLS = 6; // matches the kit's N_TOOLS default
const HISTORY = 120; // frames of history kept per tool (service.py HISTORY)

/** The kit's AUTO_FAULT_* envs, as engine options: seed one tool with a slow
 * degradation shortly after warmup so a visitor lands on a fab where
 * something is already visibly going wrong. Disclosed in the UI. */
export type EngineOptions = {
  seed?: number;
  nTools?: number;
  warmup?: number;
  autoFaultTool?: string | null;
  autoFaultAfter?: number; // frame number; 0 = off
  autoFault?: FaultName;
};

export class DemoEngine {
  readonly seed: number;
  readonly warmup: number;
  readonly autoFaultTool: string | null;
  readonly autoFaultAfter: number;
  readonly autoFault: FaultName;

  private rng: Gaussian;
  private tools: SimTool[];
  private byId: Map<string, SimTool>;
  private gateway = new Gateway();
  private fleet: Fleet;
  private history = new Map<string, HistorySample[]>();
  frame = 0;

  constructor(opts: EngineOptions = {}) {
    this.seed = opts.seed ?? DEFAULT_SEED;
    this.warmup = opts.warmup ?? DEFAULT_WARMUP;
    this.autoFaultTool = opts.autoFaultTool === undefined ? "etch-03" : opts.autoFaultTool;
    this.autoFaultAfter = opts.autoFaultAfter ?? this.warmup + 10;
    this.autoFault = opts.autoFault ?? "rf_match_drift";
    const n = opts.nTools ?? DEFAULT_N_TOOLS;
    this.rng = new Gaussian(this.seed);
    this.fleet = new Fleet(this.warmup);
    this.tools = Array.from(
      { length: n },
      (_, i) => new SimTool(`etch-${String(i + 1).padStart(2, "0")}`),
    );
    this.byId = new Map(this.tools.map((t) => [t.toolId, t]));
  }

  /** Advance the whole fab by one frame (all tools). */
  tick(): void {
    this.frame += 1;
    if (
      this.autoFaultTool &&
      this.autoFaultAfter > 0 &&
      this.frame === this.autoFaultAfter &&
      this.byId.has(this.autoFaultTool)
    ) {
      this.byId.get(this.autoFaultTool)!.setFault(this.autoFault);
    }
    for (const tool of this.tools) {
      const raw = tool.frame(this.rng);
      const normalized = this.gateway.normalize(tool.toolId, this.frame, raw);
      const verdict = this.fleet.ingest(tool.toolId, normalized.sensors);
      this.gateway.seeDerived(verdict);
      let hist = this.history.get(tool.toolId);
      if (!hist) {
        hist = [];
        this.history.set(tool.toolId, hist);
      }
      hist.push({
        ts: this.frame,
        health: verdict.warming ? 100 : verdict.health,
        state: verdict.state,
        sensors: normalized.sensors,
      });
      if (hist.length > HISTORY) hist.shift();
    }
  }

  /** Run many frames at once (pre-warm on page load so sparklines are full
   * and the fab is past baseline learning the moment a visitor arrives). */
  run(frames: number): void {
    for (let i = 0; i < frames; i++) this.tick();
  }

  /** The `fab/control` topic, as a method call. */
  injectFault(toolId: string, fault: FaultName): boolean {
    const tool = this.byId.get(toolId);
    if (!tool || !(fault in FAULTS)) return false;
    tool.setFault(fault);
    return true;
  }

  heal(toolId: string): boolean {
    const tool = this.byId.get(toolId);
    if (!tool) return false;
    tool.setFault("clear");
    return true;
  }

  activeFault(toolId: string): FaultName | null {
    return this.byId.get(toolId)?.fault ?? null;
  }

  toolIds(): string[] {
    return this.tools.map((t) => t.toolId);
  }

  toolHistory(toolId: string): HistorySample[] {
    return this.history.get(toolId) ?? [];
  }

  gatewayStats(): GatewayStats {
    return this.gateway.snapshot();
  }

  verdict(toolId: string): Verdict | undefined {
    return this.fleet.lastVerdict.get(toolId);
  }

  /** Same shape as the Python service's GET /api/health. */
  snapshot(): FleetSnapshot {
    const tools = this.fleet.snapshot();
    const counts: Partial<Record<ToolState, number>> = {};
    for (const v of tools) counts[v.state] = (counts[v.state] ?? 0) + 1;
    return {
      frames_processed: this.gateway.snapshot().raw_ingested,
      uptime_s: this.frame,
      counts,
      tools,
      sensors: [...SENSORS],
    };
  }
}
