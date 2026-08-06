/**
 * The footprint strip puts numbers on a customer-facing screen, so it inherits
 * the factory's no-fabrication rule: every figure must be quoted from the kit's
 * own handoff docs, not estimated here.
 *
 * These tests cannot read the kit docs (the portal builds standalone), so they
 * pin the shape and the exact quoted values instead. If a kit's footprint doc
 * changes, one of these fails and someone has to go look — which is the point.
 * The values below were taken from, and must continue to match:
 *
 *   reference-kits/<kit>/handoff/03-production-footprint.md
 *     "Smallest edge box (single-node, non-HA): SL Micro (1 GB/20 GB, UEFI) +
 *      K3s single-server (SQLite, local-path) + NeuVector All-in-One"
 *   reference-kits/<kit>/handoff/00-partner-handoff-runbook.md
 *     "Rebuild the demo (any laptop, ~15 min)" / "make up" /
 *     "Install docker, k3d, kubectl (the demo installs nothing globally)"
 */
import { describe, expect, it } from "vitest";

import {
  CORRIDOR_FOOTPRINT,
  FAB_FOOTPRINT,
  SUBSTRATE_FOOTPRINT,
  type Footprint,
} from "@/lib/console/footprint";

const ALL: Array<[string, Footprint]> = [
  ["corridor", CORRIDOR_FOOTPRINT],
  ["substrate", SUBSTRATE_FOOTPRINT],
  ["fab", FAB_FOOTPRINT],
];

describe("footprint", () => {
  for (const [name, fp] of ALL) {
    describe(name, () => {
      it("is complete", () => {
        expect(fp.kit).toBeTruthy();
        expect(fp.shape).toBeTruthy();
        expect(fp.facts.length).toBeGreaterThanOrEqual(4);
        expect(fp.rebuild).toBeTruthy();
      });

      it("cites the kit docs the numbers came from", () => {
        // Maintenance trail: a figure with no source is a figure someone made up.
        expect(fp.source).toMatch(/03-production-footprint\.md/);
        expect(fp.source).toMatch(/00-partner-handoff-runbook\.md/);
      });

      it("states the single-node claim the factory rests on", () => {
        const joined = fp.facts.join(" ");
        expect(joined).toMatch(/1 node/);
        expect(joined).toMatch(/non-HA/);
      });

      it("quotes the SL Micro and K3s floors verbatim from the kit doc", () => {
        const joined = fp.facts.join(" ");
        expect(joined).toContain("1 GB RAM / 20 GB disk");
        expect(joined).toContain("2 CPU / 2 GB");
        expect(joined).toMatch(/SUSE Linux Micro/);
        expect(joined).toMatch(/K3s single-server/);
      });

      it("names the SUSE component doing enforcement", () => {
        expect(fp.facts.join(" ")).toMatch(/SUSE Security \(NeuVector\)/);
      });

      it("gives the rebuild path with its stated time and prerequisites", () => {
        expect(fp.rebuild).toContain("make up");
        expect(fp.rebuild).toMatch(/15 min/);
        expect(fp.rebuild).toMatch(/docker/);
        expect(fp.rebuild).toMatch(/k3d/);
        expect(fp.rebuild).toMatch(/kubectl/);
        // The runbook's own claim, and the one a practice owner cares about.
        expect(fp.rebuild).toMatch(/installs nothing globally/);
      });

      it("claims no HA it does not have", () => {
        // The single-node kits are explicitly non-HA — the kit doc's resilience
        // model is "reimage/re-register fast, not HA". Saying otherwise on a
        // customer screen is the exact failure the kit docs guard against.
        // "non-HA" is the honest form and must survive; a bare "HA" must not.
        const all = `${fp.shape} ${fp.facts.join(" ")}`;
        expect(all).not.toMatch(/\bhigh availability\b/i);
        expect(all).not.toMatch(/(?<!non-)\bHA\b/);
      });
    });
  }

  it("the two single-node site kits quote the same stack, because their docs do", () => {
    expect(CORRIDOR_FOOTPRINT.facts).toEqual(SUBSTRATE_FOOTPRINT.facts);
  });

  it("the fab kit states its CPU-only inference tier", () => {
    // The semiconductor kit's smallest box runs the CPU inference tier; the GPU
    // path is a separate, larger shape. Blurring them would oversell the floor.
    expect(FAB_FOOTPRINT.facts.join(" ")).toMatch(/CPU inference tier/);
    expect(FAB_FOOTPRINT.facts.join(" ")).toMatch(/no GPU required/);
  });
});
