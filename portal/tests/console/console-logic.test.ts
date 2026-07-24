/**
 * Console presentation logic: fab-domain mapping (chamber names, SEMI E10
 * states, control limits from the simulator's own operating point), the
 * ISA-18.2-style alarm journal, and the guided scenario script driven
 * against a real DemoEngine.
 */
import { describe, expect, it } from "vitest";
import { ackAlarm, deriveAlarms, unackedCount, type Alarm } from "@/lib/console/alarms";
import { SENSOR_META, chamberName, e10State } from "@/lib/console/fab";
import { SCENARIO, SCENARIO_FAULT, SCENARIO_TOOL } from "@/lib/console/scenario";
import { BASE } from "@/lib/demo/simulator";
import { DemoEngine } from "@/lib/demo/engine";
import type { ToolState, Verdict } from "@/lib/demo/types";

function verdict(over: Partial<Verdict>): Verdict {
  return {
    tool_id: "etch-01",
    frames: 100,
    warming: false,
    health: 95,
    state: "HEALTHY",
    anomaly: 0,
    rul_frames: null,
    top_contributors: [],
    ...over,
  };
}

describe("fab domain mapping", () => {
  it("maps engine ids to process-module chamber names (display only)", () => {
    expect(chamberName("etch-03")).toBe("ETCH-PM3");
    expect(chamberName("etch-12")).toBe("ETCH-PM12");
  });

  it("derives SEMI E10 states from SPC states", () => {
    expect(e10State("HEALTHY", false)).toBe("PRODUCTIVE");
    expect(e10State("WATCH", false)).toBe("PRODUCTIVE");
    expect(e10State("WARNING", false)).toBe("ENGINEERING");
    expect(e10State("CRITICAL", false)).toBe("UNSCHEDULED DOWN");
    expect(e10State("HEALTHY", true)).toBe("NON-SCHEDULED");
  });

  it("control limits come from the simulator operating point (mean ± 3σ)", () => {
    for (const meta of SENSOR_META) {
      const [mean, sigma] = BASE[meta.key];
      expect(meta.mean).toBe(mean);
      expect(meta.ucl).toBeCloseTo(mean + 3 * sigma, 10);
      expect(meta.lcl).toBeCloseTo(mean - 3 * sigma, 10);
    }
    expect(SENSOR_META).toHaveLength(6);
  });
});

describe("alarm journal", () => {
  it("raises an excursion alarm on a worsening transition, with attribution", () => {
    const prev = new Map<string, ToolState>([["etch-01", "HEALTHY"]]);
    const r = deriveAlarms(
      prev,
      [
        verdict({
          state: "WARNING",
          health: 55,
          top_contributors: [{ sensor: "he_backside_flow_sccm", z: 4.2 }],
        }),
      ],
      200,
      [],
      1,
    );
    expect(r.alarms).toHaveLength(1);
    expect(r.alarms[0]).toMatchObject({
      toolId: "etch-01",
      severity: "WARNING",
      kind: "excursion",
      acked: false,
      frame: 200,
    });
    expect(r.alarms[0].message).toContain("he backside flow");
    expect(unackedCount(r.alarms)).toBe(1);
  });

  it("logs a pre-acked return-to-normal on recovery and ACK works", () => {
    const prev = new Map<string, ToolState>([["etch-01", "WARNING"]]);
    const r = deriveAlarms(prev, [verdict({ state: "HEALTHY" })], 300, [], 5);
    expect(r.alarms[0]).toMatchObject({ kind: "rtn", acked: true });

    const withUnacked: Alarm[] = [
      { id: 9, frame: 1, toolId: "etch-02", severity: "WATCH", kind: "excursion", message: "x", acked: false },
    ];
    expect(unackedCount(ackAlarm(withUnacked, 9))).toBe(0);
  });

  it("no alarm on unchanged state or during warmup", () => {
    const prev = new Map<string, ToolState>([["etch-01", "WATCH"]]);
    expect(
      deriveAlarms(prev, [verdict({ state: "WATCH", health: 70 })], 10, [], 1).alarms,
    ).toHaveLength(0);
    expect(
      deriveAlarms(new Map(), [verdict({ warming: true })], 10, [], 1).alarms,
    ).toHaveLength(0);
  });
});

describe("guided scenario against a live engine", () => {
  it("plays end-to-end: inject → excursion → diagnose → heal → boundary", () => {
    const engine = new DemoEngine({ seed: 1234 });
    engine.run(150);
    const view = { engine, diagnosisShown: false };

    expect(SCENARIO[0].done(view)).toBe(true);

    // Step 2: inject
    expect(SCENARIO[1].done(view)).toBe(false);
    SCENARIO[1].run!(engine);
    expect(engine.activeFault(SCENARIO_TOOL)).toBe(SCENARIO_FAULT);
    expect(SCENARIO[1].done(view)).toBe(true);

    // Step 3: excursion develops
    expect(SCENARIO[2].done(view)).toBe(false);
    engine.run(300);
    expect(SCENARIO[2].done(view)).toBe(true);

    // Step 4: diagnosis
    expect(SCENARIO[3].done(view)).toBe(false);
    view.diagnosisShown = true;
    expect(SCENARIO[3].done(view)).toBe(true);

    // Step 5: heal and recover
    SCENARIO[4].run!(engine);
    expect(SCENARIO[4].done(view)).toBe(false);
    engine.run(400);
    expect(SCENARIO[4].done(view)).toBe(true);

    // Step 6: outage → buffer → restore
    SCENARIO[5].run!(engine);
    expect(engine.outage).toBe(true);
    engine.run(20);
    expect(SCENARIO[5].done(view)).toBe(false);
    engine.setOutage(false);
    expect(SCENARIO[5].done(view)).toBe(true);
  });
});
