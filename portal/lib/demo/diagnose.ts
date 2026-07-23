/**
 * diagnose.ts — deterministic fault-signature matching.
 *
 * The k3s kit answers "what is wrong with this tool?" on-prem with a local
 * LLM (Ollama, SUSE AI tier — Phase 9, verified live, no data leaving the
 * cluster). A hosted LLM route here would invert that story, so the browser
 * simulation does the honest deterministic version instead: match the
 * model's own top-contributor attribution against the simulator's fault
 * library (the same physically-motivated signatures the kit injects) and
 * report the best fit. No generation, no fabrication — just the SPC model's
 * attribution cross-referenced with known failure signatures.
 */
import { FAULTS, FAULT_LABELS } from "./simulator";
import type { FaultName, Verdict } from "./types";

export type Diagnosis = {
  fault: FaultName;
  title: string;
  blurb: string;
  /** Fraction of the fault's drifted sensors present in the model's top
   * contributors, weighted by |z| rank (1.0 = every drifted channel is
   * anomalous, strongest first). */
  score: number;
  matched: string[];
};

/** Match a verdict's sensor attribution against the fault library.
 * Returns null while the tool is healthy/warming or no signature fits. */
export function diagnose(verdict: Verdict): Diagnosis | null {
  if (verdict.warming || verdict.state === "HEALTHY") return null;
  const tops = verdict.top_contributors;
  if (tops.length === 0) return null;
  // Rank weight: first contributor counts most.
  const weight = new Map(tops.map((c, i) => [c.sensor, tops.length - i]));
  const totalWeight = tops.reduce((a, _c, i) => a + (tops.length - i), 0);

  let best: Diagnosis | null = null;
  for (const [fault, drift] of Object.entries(FAULTS) as Array<
    [FaultName, Partial<Record<string, number>>]
  >) {
    const drifted = Object.keys(drift);
    const matched = drifted.filter((s) => weight.has(s));
    if (matched.length === 0) continue;
    const score =
      matched.reduce((a, s) => a + (weight.get(s) ?? 0), 0) / totalWeight;
    if (!best || score > best.score) {
      best = { fault, ...FAULT_LABELS[fault], score, matched };
    }
  }
  return best;
}
