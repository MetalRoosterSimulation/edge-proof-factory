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

  it("returns null when every contributor is below the 2σ control noise floor", () => {
    const dx = diagnose(
      verdict({
        top_contributors: [
          { sensor: "chamber_temp_c", z: 1.4 },
          { sensor: "endpoint_signal", z: -1.1 },
        ],
      }),
    );
    expect(dx).toBeNull();
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
    expect(dx?.score).toBeGreaterThan(0.9);
    expect(dx?.matched).toHaveLength(3);
  });

  it("one dominant channel plus noise is NOT outvoted by set overlap", () => {
    // Regression: observed live on the deployed page. A chiller fault shows
    // chamber_temp_c z=8 with two sub-noise channels in the top-3; the old
    // rank-weighted set overlap labeled it a He seal leak because that
    // signature happened to contain one of the noise sensors. Cosine
    // similarity must pick the chiller.
    const dx = diagnose(
      verdict({
        top_contributors: [
          { sensor: "chamber_temp_c", z: 8 },
          { sensor: "rf_forward_power_w", z: -1.22 },
          { sensor: "he_backside_flow_sccm", z: -1.04 },
        ],
      }),
    );
    expect(dx?.fault).toBe("chiller_fault");
  });

  it("a sign-flipped signature does not match", () => {
    // endpoint_signal drifts DOWN under rf_match_drift; a rising endpoint
    // with falling reflected power is not that fault.
    const dx = diagnose(
      verdict({
        top_contributors: [
          { sensor: "endpoint_signal", z: 6 },
          { sensor: "rf_reflected_power_w", z: -5 },
        ],
      }),
    );
    expect(dx?.fault).not.toBe("rf_match_drift");
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

  it("identifies faults correctly EARLY, when only the primary channel is anomalous", () => {
    for (const fault of FAULT_NAMES) {
      const e = new DemoEngine({ seed: 77, autoFaultTool: null });
      e.run(60);
      e.injectFault("etch-02", fault);
      // Walk forward and check the first frame a diagnosis appears.
      let first = null;
      for (let i = 0; i < 300 && !first; i++) {
        e.tick();
        first = diagnose(e.verdict("etch-02")!);
      }
      expect(first, fault).not.toBeNull();
      expect(first!.fault, `first diagnosis for ${fault}`).toBe(fault);
    }
  });
});
