/**
 * diagnose.ts — deterministic fault-signature matching.
 *
 * The k3s kit answers "what is wrong with this tool?" on-prem with a local
 * LLM (Ollama, SUSE AI tier — Phase 9, verified live, no data leaving the
 * cluster). A hosted LLM route here would invert that story, so the browser
 * simulation does the honest deterministic version instead: compare the
 * model's own top-contributor attribution against the simulator's fault
 * library (the same physically-motivated signatures the kit injects) and
 * report the best fit. No generation, no fabrication — just the SPC model's
 * attribution cross-referenced with known failure signatures.
 *
 * Method: signed cosine similarity between the observed z-vector (the
 * verdict's top contributors) and each fault's signature vector, where a
 * signature component is its per-frame drift divided by that sensor's
 * healthy σ (so a 0.05 W drift on a σ=0.4 channel outweighs a 0.02 mtorr
 * drift on a σ=0.6 channel, and drift signs must agree with z signs).
 * Rank-weighted set overlap was tried first and mis-labeled a live chiller
 * fault as a He seal leak: with one dominant channel (temp z=8) plus two
 * noise channels, set overlap let the noise outvote the magnitude. Cosine
 * similarity weighs channels by how anomalous they actually are.
 */
import { BASE, FAULTS, FAULT_LABELS } from "./simulator";
import type { FaultName, Verdict } from "./types";

/** Only count channels the control chart itself would flag (2σ = the model's
 * UCL offset); below that, a contributor is healthy noise. */
const SIGNIFICANT_Z = 2.0;
/** Minimum cosine similarity to claim a match at all. */
const MIN_SCORE = 0.4;

export type Diagnosis = {
  fault: FaultName;
  title: string;
  blurb: string;
  /** Signed cosine similarity (0–1) between the observed z-vector and the
   * fault's σ-scaled drift signature. */
  score: number;
  matched: string[];
};

/** σ-scaled signed signature vectors, computed once from the simulator's own
 * tables (single source of truth — regenerating nothing by hand). */
const SIGNATURES: Array<{
  fault: FaultName;
  vec: Map<string, number>;
  norm: number;
}> = (Object.entries(FAULTS) as Array<[FaultName, Partial<Record<string, number>>]>).map(
  ([fault, drift]) => {
    const vec = new Map<string, number>();
    let sq = 0;
    for (const [sensor, perFrame] of Object.entries(drift)) {
      const sigma = BASE[sensor][1];
      const scaled = (perFrame as number) / sigma;
      vec.set(sensor, scaled);
      sq += scaled * scaled;
    }
    return { fault, vec, norm: Math.sqrt(sq) };
  },
);

/** Match a verdict's sensor attribution against the fault library.
 * Returns null while the tool is healthy/warming or no signature fits. */
export function diagnose(verdict: Verdict): Diagnosis | null {
  if (verdict.warming || verdict.state === "HEALTHY") return null;
  const observed = verdict.top_contributors.filter(
    (c) => Math.abs(c.z) >= SIGNIFICANT_Z,
  );
  if (observed.length === 0) return null;
  const zNorm = Math.sqrt(observed.reduce((a, c) => a + c.z * c.z, 0));

  let best: Diagnosis | null = null;
  for (const { fault, vec, norm } of SIGNATURES) {
    let dot = 0;
    const matched: string[] = [];
    for (const c of observed) {
      const s = vec.get(c.sensor);
      if (s === undefined) continue;
      dot += c.z * s;
      matched.push(c.sensor);
    }
    if (matched.length === 0) continue;
    const score = dot / (zNorm * norm);
    if (score >= MIN_SCORE && (!best || score > best.score)) {
      best = { fault, ...FAULT_LABELS[fault], score, matched };
    }
  }
  return best;
}
