/**
 * The TS simulator is *statistically equivalent* to the Python one — same
 * operating point, same σ, same per-frame fault drift — but deliberately NOT
 * stream-identical (Python: Mersenne Twister + random.gauss; browser:
 * mulberry32 + Box–Muller). These tests pin the statistical contract and the
 * deterministic-given-seed behavior the demo relies on.
 */
import { describe, expect, it } from "vitest";
import {
  BASE,
  FAULTS,
  FAULT_NAMES,
  Gaussian,
  SimTool,
  mulberry32,
} from "@/lib/demo/simulator";

describe("seeded RNG", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it("different seeds give different streams", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const same = Array.from({ length: 20 }, () => a() === b());
    expect(same.every(Boolean)).toBe(false);
  });

  it("gaussian source has ~N(0,1) moments", () => {
    const g = new Gaussian(7);
    const n = 20000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const x = g.next();
      sum += x;
      sumSq += x * x;
    }
    const mean = sum / n;
    const std = Math.sqrt(sumSq / n - mean * mean);
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(std - 1)).toBeLessThan(0.03);
  });
});

describe("healthy telemetry matches the operating point", () => {
  it("per-sensor mean and σ track BASE over 5000 frames", () => {
    const rng = new Gaussian(1234);
    const tool = new SimTool("etch-01");
    const sums: Record<string, number> = {};
    const sumSqs: Record<string, number> = {};
    const n = 5000;
    for (let i = 0; i < n; i++) {
      const f = tool.frame(rng);
      for (const [s, v] of Object.entries(f)) {
        sums[s] = (sums[s] ?? 0) + v;
        sumSqs[s] = (sumSqs[s] ?? 0) + v * v;
      }
    }
    for (const [sensor, [mean, sigma]] of Object.entries(BASE)) {
      const m = sums[sensor] / n;
      const sd = Math.sqrt(sumSqs[sensor] / n - m * m);
      // mean within 5 standard errors; σ within 10%
      expect(Math.abs(m - mean), sensor).toBeLessThan((5 * sigma) / Math.sqrt(n) + 1e-4);
      expect(Math.abs(sd - sigma) / sigma, sensor).toBeLessThan(0.1);
    }
  });
});

describe("fault drift math matches the Python fault library", () => {
  it.each(FAULT_NAMES)("%s applies per-frame linear drift", (fault) => {
    const rng = new Gaussian(99);
    const tool = new SimTool("etch-01");
    tool.setFault(fault);
    const steps = 200;
    const acc: Record<string, number> = {};
    for (let i = 0; i < steps; i++) {
      const f = tool.frame(rng);
      for (const [s, v] of Object.entries(f)) acc[s] = (acc[s] ?? 0) + v;
    }
    for (const [sensor, perStep] of Object.entries(FAULTS[fault])) {
      const [mean, sigma] = BASE[sensor];
      const observedMean = acc[sensor] / steps;
      // Mean drift over steps 1..N is perStep·(N+1)/2.
      const expected = mean + ((perStep as number) * (steps + 1)) / 2;
      expect(Math.abs(observedMean - expected), sensor).toBeLessThan(
        (5 * sigma) / Math.sqrt(steps) + Math.abs(perStep as number) * 2,
      );
    }
  });

  it("clear resets fault state and drift", () => {
    const rng = new Gaussian(5);
    const tool = new SimTool("etch-01");
    tool.setFault("chiller_fault");
    for (let i = 0; i < 100; i++) tool.frame(rng);
    expect(tool.fault).toBe("chiller_fault");
    tool.setFault("clear");
    expect(tool.fault).toBeNull();
    expect(tool.faultStep).toBe(0);
    // Post-heal frames return to the healthy operating point.
    let sum = 0;
    const n = 500;
    for (let i = 0; i < n; i++) sum += tool.frame(rng).chamber_temp_c;
    expect(Math.abs(sum / n - BASE.chamber_temp_c[0])).toBeLessThan(0.1);
  });

  it("ignores unknown fault names (same as the Python simulator)", () => {
    const tool = new SimTool("etch-01");
    // @ts-expect-error — runtime guard against bad control messages
    tool.setFault("not_a_fault");
    expect(tool.fault).toBeNull();
  });
});
