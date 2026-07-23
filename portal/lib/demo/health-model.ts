/**
 * health-model.ts — TypeScript port of the on-device predictive-maintenance
 * model for a semiconductor plasma-etch chamber.
 *
 * This is a faithful, line-for-line port of the Python original that runs in
 * the k3s reference kit:
 *   reference-kits/semiconductor-predictive-maintenance/demo/images/
 *     edge-inference/app/health_model.py
 * Same technique — an EWMA-smoothed multivariate control chart (Hotelling T² /
 * Mahalanobis SPC), the standard fab statistical-process-control approach:
 *
 *   1. Baseline learning: per-sensor mean/variance via Welford's algorithm for
 *      the first `warmup` frames, then FROZEN. Each tool learns its own
 *      baseline in situ; no training set ships with the model.
 *   2. Per-sensor z-score against the frozen baseline, clipped to ±Z_CLIP.
 *   3. Mahalanobis-style statistic m = Σ z² over the sensors present.
 *   4. EWMA smoothing (fast → live health, slow → degradation trend).
 *   5. health = 100·exp(−anomaly/DECAY), anomaly = √(excess/k) above the
 *      2σ upper control limit.
 *   6. RUL = frames until projected health crosses CRITICAL, by least-squares
 *      extrapolation over the slow-EWMA trend window.
 *
 * Parity with the Python model is *proven*, not asserted: see
 * tests/demo/golden-parity.test.ts, which replays 590 recorded frames from the
 * real Python model (scripts/generate-golden-vectors.py) through this port and
 * compares every verdict. If you change a constant here, change the Python
 * model too and regenerate the vectors — they are one model in two languages.
 */
import type { Contributor, SensorFrame, ToolState, Verdict } from "./types";

// --- Sensor contract (must match the simulator) ------------------------------
export const SENSORS = [
  "chamber_pressure_mtorr",
  "rf_forward_power_w",
  "rf_reflected_power_w",
  "chamber_temp_c",
  "endpoint_signal",
  "he_backside_flow_sccm",
] as const;

// --- Verdict states (by health score 0-100) ----------------------------------
const STATE_BANDS: Array<[number, ToolState]> = [
  [85.0, "HEALTHY"],
  [65.0, "WATCH"],
  [40.0, "WARNING"],
];
export const CRITICAL_HEALTH = 40.0;

// --- Model constants (identical to the Python model) -------------------------
const DECAY = 2.2; // health = 100·exp(−anomaly/DECAY)
const Z_CLIP = 8.0; // clip per-sensor z-scores
const FAST_ALPHA = 0.15; // EWMA weight, live health statistic
const SLOW_ALPHA = 0.03; // EWMA weight, degradation-trend statistic
const UCL_SIGMA = 2.0; // control-limit offset (σ of the statistic's noise)
const STD_FLOOR = 1e-3; // guard against a zero-variance (constant) sensor
const EPS = 1e-9;
export const DEFAULT_WARMUP = 30;
const SLOPE_WINDOW = 20; // frames of trend history for the RUL slope
const FORECAST_HORIZON = 100000; // frames; beyond this RUL reports nominal

/** Python-style round(x, ndigits): round-half-to-even on the scaled value.
 * (JS Math.round is half-up; Python uses banker's rounding — the golden
 * vectors were produced by Python, so we match its convention.) */
function pyRound(x: number, ndigits: number): number {
  const m = Math.pow(10, ndigits);
  const y = x * m;
  const floor = Math.floor(y);
  const diff = y - floor;
  let r: number;
  if (diff > 0.5) r = floor + 1;
  else if (diff < 0.5) r = floor;
  else r = floor % 2 === 0 ? floor : floor + 1;
  return r / m;
}

/** Map a 0-100 health score to a discrete state. */
export function classify(health: number): ToolState {
  for (const [threshold, state] of STATE_BANDS) {
    if (health >= threshold) return state;
  }
  return "CRITICAL";
}

/** Exact online mean/variance for one sensor during the warmup window. */
class Welford {
  n = 0;
  mean = 0.0;
  m2 = 0.0;
  std = STD_FLOOR;

  observe(x: number): void {
    this.n += 1;
    const delta = x - this.mean;
    this.mean += delta / this.n;
    this.m2 += delta * (x - this.mean);
  }

  freeze(): void {
    const variance = this.n > 1 ? this.m2 / (this.n - 1) : 0.0;
    this.std = Math.max(Math.sqrt(variance), STD_FLOOR);
  }

  zscore(x: number): number {
    return (x - this.mean) / this.std;
  }
}

/** One instance per physical tool. Feed sensor frames, read verdicts. */
export class ToolHealthModel {
  readonly toolId: string;
  readonly warmup: number;
  frames = 0;
  private base = new Map<string, Welford>();
  private k: number = SENSORS.length; // active sensor count, set at freeze
  private mFast: number = SENSORS.length;
  private mSlow: number = SENSORS.length;
  private slowHist: number[] = []; // bounded to SLOPE_WINDOW

  constructor(toolId: string, warmup: number = DEFAULT_WARMUP) {
    this.toolId = toolId;
    this.warmup = warmup;
    for (const s of SENSORS) this.base.set(s, new Welford());
  }

  private mahal(frame: SensorFrame): {
    acc: number;
    k: number;
    contribs: Map<string, number>;
  } {
    let acc = 0.0;
    let k = 0;
    const contribs = new Map<string, number>();
    for (const [name, base] of this.base) {
      if (!(name in frame)) continue;
      let z = base.zscore(frame[name]);
      z = Math.max(-Z_CLIP, Math.min(Z_CLIP, z));
      contribs.set(name, z);
      acc += z * z;
      k += 1;
    }
    return { acc, k, contribs };
  }

  /** Ingest one sensor frame; return a verdict. */
  update(frame: SensorFrame): Verdict {
    this.frames += 1;

    // --- warmup: learn & freeze baseline, report healthy --------------------
    if (this.frames <= this.warmup) {
      for (const [name, base] of this.base) {
        if (name in frame) base.observe(frame[name]);
      }
      if (this.frames === this.warmup) {
        let active = 0;
        for (const base of this.base.values()) {
          base.freeze();
          if (base.n > 0) active += 1;
        }
        this.k = Math.max(active, 1);
        this.mFast = this.k;
        this.mSlow = this.k;
        this.slowHist = [];
      }
      return this.verdict(100.0, 0.0, null, [], true);
    }

    // --- scoring against frozen baseline ------------------------------------
    const { acc: mahal, k: kPresent, contribs } = this.mahal(frame);
    const k = kPresent || this.k;
    this.mFast = (1 - FAST_ALPHA) * this.mFast + FAST_ALPHA * mahal;
    this.mSlow = (1 - SLOW_ALPHA) * this.mSlow + SLOW_ALPHA * mahal;
    this.slowHist.push(this.mSlow);
    if (this.slowHist.length > SLOPE_WINDOW) this.slowHist.shift();

    const anomaly = ToolHealthModel.anomaly(this.mFast, k);
    const health = Math.max(0.0, Math.min(100.0, 100.0 * Math.exp(-anomaly / DECAY)));
    const rul = this.rul(k);

    const top: Contributor[] = [...contribs.entries()]
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 3)
      .map(([sensor, z]) => ({ sensor, z: pyRound(z, 2) }));
    return this.verdict(health, anomaly, rul, top, false);
  }

  /** Anomaly above the upper control limit: under a healthy tool the statistic
   * fluctuates around k with a known EWMA-of-χ²(k) noise floor; subtract that
   * floor so healthy noise scores ~0 and only a genuine shift registers. */
  private static anomaly(mSmoothed: number, k: number): number {
    if (!k) return 0.0;
    const noiseStd = Math.sqrt((FAST_ALPHA / (2.0 - FAST_ALPHA)) * 2.0 * k);
    const excess = Math.max(0.0, mSmoothed - k - UCL_SIGMA * noiseStd);
    return Math.sqrt(excess / k);
  }

  /** Least-squares degradation slope over the trend window, in anomaly-space;
   * a flat / improving trend reports null (nominal, beyond horizon). */
  private rul(k: number): number | null {
    const hist = this.slowHist;
    if (hist.length < SLOPE_WINDOW) return null;
    const ys = hist.map((m) => ToolHealthModel.anomaly(m, k));
    const n = ys.length;
    const xbar = (n - 1) / 2.0;
    const ybar = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0.0;
    let den = 0.0;
    for (let i = 0; i < n; i++) {
      num += (i - xbar) * (ys[i] - ybar);
      den += (i - xbar) * (i - xbar);
    }
    const slope = den > EPS ? num / den : 0.0;
    if (slope <= EPS) return null;
    const cur = ys[n - 1];
    const anomCrit = -DECAY * Math.log(CRITICAL_HEALTH / 100.0);
    if (cur >= anomCrit) return 0;
    const frames = (anomCrit - cur) / slope;
    if (frames >= FORECAST_HORIZON || frames < 0) return null;
    return Math.round(frames);
  }

  private verdict(
    health: number,
    anomaly: number,
    rul: number | null,
    top: Contributor[],
    warming: boolean,
  ): Verdict {
    const h = pyRound(health, 2);
    return {
      tool_id: this.toolId,
      frames: this.frames,
      warming,
      health: h,
      state: warming ? "HEALTHY" : classify(h),
      anomaly: pyRound(anomaly, 4),
      rul_frames: rul,
      top_contributors: top,
    };
  }
}

/** Holds many tools; the browser engine and dashboard read from this. */
export class Fleet {
  private warmup: number;
  private models = new Map<string, ToolHealthModel>();
  readonly lastVerdict = new Map<string, Verdict>();

  constructor(warmup: number = DEFAULT_WARMUP) {
    this.warmup = warmup;
  }

  ingest(toolId: string, frame: SensorFrame): Verdict {
    let m = this.models.get(toolId);
    if (!m) {
      m = new ToolHealthModel(toolId, this.warmup);
      this.models.set(toolId, m);
    }
    const verdict = m.update(frame);
    this.lastVerdict.set(toolId, verdict);
    return verdict;
  }

  /** Sorted worst-first — what the dashboard renders. */
  snapshot(): Verdict[] {
    const order: Record<ToolState, number> = {
      CRITICAL: 0,
      WARNING: 1,
      WATCH: 2,
      HEALTHY: 3,
    };
    return [...this.lastVerdict.values()].sort(
      (a, b) => order[a.state] - order[b.state] || a.health - b.health,
    );
  }
}
