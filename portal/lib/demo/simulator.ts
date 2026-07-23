/**
 * simulator.ts — TypeScript port of the synthetic plasma-etch fab telemetry
 * generator from the k3s reference kit:
 *   reference-kits/semiconductor-predictive-maintenance/demo/images/
 *     sensor-simulator/app/simulate.py
 *
 * The healthy operating point (BASE) and the fault library (FAULTS) are copied
 * verbatim from the Python simulator — each fault is a physically-motivated
 * etch failure signature applied as per-frame drift. The golden-vector fixture
 * (tests/demo/golden-vectors.json) embeds the Python tables, and
 * tests/demo/golden-parity.test.ts asserts these copies match them exactly.
 *
 * The random source differs deliberately: Python uses Mersenne Twister +
 * random.gauss; the browser uses mulberry32 + Box–Muller. Parity of the RNG is
 * NOT required — only the *model* must match the Python model, and the parity
 * suite feeds it Python-recorded frames. The simulator just has to produce
 * statistically equivalent telemetry (same means, same σ, same drift), which
 * these tests also check.
 */
import type { FaultName, SensorFrame } from "./types";

// Healthy operating point + per-sensor 1-sigma noise for an etch chamber.
export const BASE: Record<string, [number, number]> = {
  chamber_pressure_mtorr: [50.0, 0.6],
  rf_forward_power_w: [1500.0, 6.0],
  rf_reflected_power_w: [8.0, 0.4],
  chamber_temp_c: [65.0, 0.3],
  endpoint_signal: [0.8, 0.01],
  he_backside_flow_sccm: [10.0, 0.15],
};

// Fault library: name → per-frame drift applied per active fault-step.
export const FAULTS: Record<FaultName, Partial<Record<string, number>>> = {
  // RF matching network degrades: reflected power climbs, pressure creeps,
  // endpoint signal weakens. The classic "match unit going bad".
  rf_match_drift: {
    rf_reflected_power_w: +0.05,
    chamber_pressure_mtorr: +0.02,
    endpoint_signal: -0.0007,
  },
  // Vacuum/He seal leak: backside He flow rises to hold pressure, temp drifts.
  he_seal_leak: {
    he_backside_flow_sccm: +0.03,
    chamber_temp_c: +0.02,
    chamber_pressure_mtorr: +0.015,
  },
  // Chiller/temperature-control fault: chamber temp runs away.
  chiller_fault: {
    chamber_temp_c: +0.05,
    rf_reflected_power_w: +0.02,
  },
};

export const FAULT_NAMES = Object.keys(FAULTS) as FaultName[];

/** Human-readable fault descriptions for the demo UI (sourced from the
 * simulator's own comments — no invented failure physics). */
export const FAULT_LABELS: Record<FaultName, { title: string; blurb: string }> = {
  rf_match_drift: {
    title: "RF match drift",
    blurb:
      "RF matching network degrades: reflected power climbs, pressure creeps, endpoint signal weakens.",
  },
  he_seal_leak: {
    title: "He seal leak",
    blurb:
      "Vacuum/He seal leak: backside He flow rises to hold pressure, temperature drifts.",
  },
  chiller_fault: {
    title: "Chiller fault",
    blurb: "Temperature-control fault: chamber temperature runs away.",
  },
};

/** mulberry32 — small, fast, seedable PRNG (uniform in [0,1)). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gaussian source over a uniform PRNG (Box–Muller, cached spare). */
export class Gaussian {
  private uniform: () => number;
  private spare: number | null = null;

  constructor(seed: number) {
    this.uniform = mulberry32(seed);
  }

  next(mean = 0, sigma = 1): number {
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return mean + sigma * s;
    }
    let u = 0;
    let v = 0;
    // Guard u=0 (log(0)); mulberry32 can emit exactly 0.
    while (u === 0) u = this.uniform();
    v = this.uniform();
    const mag = Math.sqrt(-2.0 * Math.log(u));
    this.spare = mag * Math.sin(2.0 * Math.PI * v);
    return mean + sigma * mag * Math.cos(2.0 * Math.PI * v);
  }
}

/** One simulated etch tool — port of simulate.py's Tool class. */
export class SimTool {
  readonly toolId: string;
  fault: FaultName | null = null;
  faultStep = 0;

  constructor(toolId: string) {
    this.toolId = toolId;
  }

  setFault(name: FaultName | "clear" | null): void {
    if (name === "clear" || name === null || name === undefined) {
      this.fault = null;
      this.faultStep = 0;
    } else if (name in FAULTS) {
      this.fault = name;
      this.faultStep = 0;
    }
  }

  frame(rng: Gaussian): SensorFrame {
    const drift: Partial<Record<string, number>> = {};
    if (this.fault) {
      this.faultStep += 1;
      for (const [s, per] of Object.entries(FAULTS[this.fault])) {
        drift[s] = (per as number) * this.faultStep;
      }
    }
    const f: SensorFrame = {};
    for (const [s, [mean, sigma]] of Object.entries(BASE)) {
      const v = mean + rng.next(0, sigma) + (drift[s] ?? 0.0);
      f[s] = Math.round(v * 10000) / 10000; // 4-decimal rounding, as in Python
    }
    return f;
  }
}
