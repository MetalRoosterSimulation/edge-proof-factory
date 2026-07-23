import { describe, expect, it } from "vitest";
import {
  getLedgerPhases,
  getOpenThreads,
  getProofKit,
  getProofKits,
} from "@/lib/data";
import { makeFakeSupabaseClient } from "./fake-supabase-client";

const kit = {
  id: "1",
  slug: "semiconductor-predictive-maintenance",
  name: "Semiconductor predictive maintenance",
  partner: "Technologent",
  customer: "Microchip Technology",
  industry: "Semiconductor manufacturing",
  use_case: "OT telemetry to inference to dashboard",
  status: "built-and-verified",
  summary: "A runnable kit.",
  demo_path: "reference-kits/semiconductor-predictive-maintenance/demo",
  repo_url: "https://github.com/example/edge-proof-factory",
  created_at: "2026-07-22T00:00:00Z",
};

function makeClient() {
  return makeFakeSupabaseClient({
    proof_kits: [kit],
    component_map_rows: [
      {
        id: "cm1",
        kit_slug: kit.slug,
        demo_component: "k3d",
        role: "Edge Kubernetes",
        production_component: "SUSE Edge",
        pinned_version: "SL Micro 6.2",
        sort_order: 0,
      },
    ],
    scale_up_stages: [
      {
        id: "su1",
        kit_slug: kit.slug,
        stage_number: 0,
        title: "The laptop demo",
        body_md: "Proves the pattern end to end.",
        sort_order: 0,
      },
    ],
    footprint_specs: [
      {
        id: "fp1",
        kit_slug: kit.slug,
        component: "K3s server",
        minimum_spec: "2 CPU / 2 GB",
        sort_order: 0,
      },
    ],
    ledger_phases: [
      {
        id: "lp0",
        phase_number: 0,
        title: "Research swarm",
        status: "done",
        body_md: "Confirmed the gap.",
        done_date: null,
      },
      {
        id: "lp1",
        phase_number: 1,
        title: "The runnable MVP",
        status: "done",
        body_md: "Built the reference kit.",
        done_date: null,
      },
    ],
    open_threads: [
      {
        id: "ot1",
        description: "Open item",
        status: "open",
        created_at: "2026-07-23T00:00:00Z",
      },
      {
        id: "ot2",
        description: "Resolved item",
        status: "resolved",
        created_at: "2026-07-23T00:00:00Z",
      },
    ],
  });
}

describe("getProofKits", () => {
  it("returns every proof kit", async () => {
    const kits = await getProofKits(makeClient());
    expect(kits).toHaveLength(1);
    expect(kits[0].slug).toBe(kit.slug);
  });
});

describe("getProofKit", () => {
  it("returns the kit plus its component map, scale-up stages, and footprint specs", async () => {
    const detail = await getProofKit(kit.slug, makeClient());
    expect(detail).not.toBeNull();
    expect(detail?.kit.slug).toBe(kit.slug);
    expect(detail?.componentMap).toHaveLength(1);
    expect(detail?.scaleUpStages).toHaveLength(1);
    expect(detail?.footprintSpecs).toHaveLength(1);
  });

  it("returns null for an unknown slug", async () => {
    const detail = await getProofKit("does-not-exist", makeClient());
    expect(detail).toBeNull();
  });
});

describe("getLedgerPhases", () => {
  it("returns phases ordered by phase_number", async () => {
    const phases = await getLedgerPhases(makeClient());
    expect(phases.map((p) => p.phase_number)).toEqual([0, 1]);
  });
});

describe("getOpenThreads", () => {
  it("only returns threads with status=open", async () => {
    const threads = await getOpenThreads(makeClient());
    expect(threads).toHaveLength(1);
    expect(threads[0].id).toBe("ot1");
  });
});
