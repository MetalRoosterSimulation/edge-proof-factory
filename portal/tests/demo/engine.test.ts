/**
 * DemoEngine — the browser stand-in for the kit's MQTT wiring. These tests
 * prove the demo's whole story end-to-end without a DOM: pre-warm, seeded
 * auto-degradation, visitor fault injection, healing, worst-first snapshots,
 * determinism, and the governance ledger (nothing forwarded, everything
 * withheld — the air-gapped path of gateway.py).
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_N_TOOLS, DemoEngine } from "@/lib/demo/engine";
import { derivedFields } from "@/lib/demo/gateway";

function freshEngine(over = {}) {
  return new DemoEngine({ seed: 1234, ...over });
}

describe("pre-warm and steady state", () => {
  it("after warmup all tools report verdicts and the fleet is populated", () => {
    const e = freshEngine({ autoFaultTool: null });
    e.run(60);
    const snap = e.snapshot();
    expect(snap.tools).toHaveLength(DEFAULT_N_TOOLS);
    expect(snap.frames_processed).toBe(60 * DEFAULT_N_TOOLS);
    for (const v of snap.tools) {
      expect(v.warming).toBe(false);
      expect(v.health).toBeGreaterThan(50);
    }
  });

  it("keeps bounded per-tool history", () => {
    const e = freshEngine({ autoFaultTool: null });
    e.run(300);
    expect(e.toolHistory("etch-01").length).toBe(120);
  });
});

describe("seeded auto-degradation (the kit's AUTO_FAULT_TOOL)", () => {
  it("etch-03 degrades below the healthy band while others stay healthy", () => {
    const e = freshEngine(); // default: rf_match_drift on etch-03 at frame 40
    e.run(220);
    const bad = e.verdict("etch-03")!;
    expect(bad.state).not.toBe("HEALTHY");
    expect(bad.health).toBeLessThan(65);
    expect(bad.top_contributors[0].sensor).toBe("rf_reflected_power_w");
    const good = e.verdict("etch-01")!;
    expect(good.health).toBeGreaterThan(65);
  });

  it("snapshot sorts worst tool first", () => {
    const e = freshEngine();
    e.run(220);
    expect(e.snapshot().tools[0].tool_id).toBe("etch-03");
  });

  it("eventually forecasts a RUL and reaches CRITICAL", () => {
    const e = freshEngine();
    e.run(420);
    const v = e.verdict("etch-03")!;
    expect(v.state).toBe("CRITICAL");
    expect(v.rul_frames).not.toBeNull();
  });
});

describe("visitor fault injection and healing (the fab/control topic)", () => {
  it("injecting a chiller fault degrades the tool with correct attribution", () => {
    const e = freshEngine({ autoFaultTool: null });
    e.run(60);
    expect(e.injectFault("etch-05", "chiller_fault")).toBe(true);
    e.run(180);
    const v = e.verdict("etch-05")!;
    expect(v.health).toBeLessThan(65);
    expect(v.top_contributors.map((c) => c.sensor)).toContain("chamber_temp_c");
  });

  it("healing stops the drift and health recovers", () => {
    const e = freshEngine({ autoFaultTool: null });
    e.run(60);
    e.injectFault("etch-02", "he_seal_leak");
    e.run(150);
    const sick = e.verdict("etch-02")!.health;
    expect(sick).toBeLessThan(70);
    e.heal("etch-02");
    e.run(200);
    const healed = e.verdict("etch-02")!.health;
    expect(healed).toBeGreaterThan(sick + 20);
    expect(e.activeFault("etch-02")).toBeNull();
  });

  it("rejects unknown tools and unknown faults", () => {
    const e = freshEngine({ autoFaultTool: null });
    expect(e.injectFault("etch-99", "chiller_fault")).toBe(false);
    // @ts-expect-error — runtime guard
    expect(e.injectFault("etch-01", "bogus")).toBe(false);
    expect(e.heal("etch-99")).toBe(false);
  });
});

describe("determinism (fixed seed, like the kit's seeded simulator)", () => {
  it("same seed → identical fleet state", () => {
    const a = freshEngine();
    const b = freshEngine();
    a.run(150);
    b.run(150);
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it("different seeds → different telemetry", () => {
    const a = freshEngine({ autoFaultTool: null });
    const b = freshEngine({ seed: 4321, autoFaultTool: null });
    a.run(50);
    b.run(50);
    expect(a.toolHistory("etch-01").at(-1)!.sensors).not.toEqual(
      b.toolHistory("etch-01").at(-1)!.sensors,
    );
  });
});

describe("governance ledger — the air-gapped GEA path", () => {
  it("counts every raw frame ingested and withholds every derived verdict", () => {
    const e = freshEngine();
    e.run(100);
    const g = e.gatewayStats();
    expect(g.raw_ingested).toBe(100 * DEFAULT_N_TOOLS);
    expect(g.normalized_published).toBe(g.raw_ingested);
    expect(g.derived_seen).toBe(g.raw_ingested);
    expect(g.losant_withheld_airgapped).toBe(g.derived_seen);
    expect(g.losant_forwarded).toBe(0);
    expect(g.losant_connected).toBe(false);
  });

  it("derivedFields exposes only the kit's governed egress contract", () => {
    const e = freshEngine();
    e.run(60);
    const fields = derivedFields(e.verdict("etch-01")!);
    expect(Object.keys(fields).sort()).toEqual(
      ["health", "rul_frames", "state", "tool_id", "warming"].sort(),
    );
    // No raw sensor readings in the egress contract, ever.
    expect(JSON.stringify(fields)).not.toContain("chamber_pressure");
  });
});
