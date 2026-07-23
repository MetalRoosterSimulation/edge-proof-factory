import { describe, expect, it } from "vitest";
import { DemoEngine } from "@/lib/demo/engine";
import { diagnose } from "@/lib/demo/diagnose";
import { FAULT_NAMES } from "@/lib/demo/simulator";
import type { Verdict } from "@/lib/demo/types";

function verdict(over: Partial<Verdict>): Verdict {
  return {
    tool_id: "etch-01",
    frames: 100,
    warming: false,
    health: 55,
    state: "WARNING",
    anomaly: 0.5,
    rul_frames: 40,
    top_contributors: [],
    ...over,
  };
}

describe("diagnose", () => {
  it("returns null for warming or healthy tools", () => {
    expect(diagnose(verdict({ warming: true, state: "HEALTHY" }))).toBeNull();
    expect(diagnose(verdict({ state: "HEALTHY", health: 95 }))).toBeNull();
    expect(diagnose(verdict({ top_contributors: [] }))).toBeNull();
  });

  it("matches a clean RF-drift attribution to rf_match_drift", () => {
    const dx = diagnose(
      verdict({
        top_contributors: [
          { sensor: "rf_reflected_power_w", z: 7.9 },
          { sensor: "chamber_pressure_mtorr", z: 4.2 },
          { sensor: "endpoint_signal", z: -3.8 },
        ],
      }),
    );
    expect(dx?.fault).toBe("rf_match_drift");
    expect(dx?.score).toBe(1); // every top contributor is in the signature
    expect(dx?.matched).toHaveLength(3);
  });

  it("identifies each injected fault from the live model's own attribution", () => {
    for (const fault of FAULT_NAMES) {
      const e = new DemoEngine({ seed: 1234, autoFaultTool: null });
      e.run(60);
      e.injectFault("etch-04", fault);
      e.run(250);
      const dx = diagnose(e.verdict("etch-04")!);
      expect(dx?.fault, fault).toBe(fault);
    }
  });
});
