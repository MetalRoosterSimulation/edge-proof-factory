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
 *     "the demo installs nothing globally"
 *
 * Note the docker/k3d/kubectl prerequisites in that runbook are deliberately NOT
 * surfaced on screen — see the k3d test below.
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
        expect(fp.tryIt).toBeTruthy();
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

      it("tells a viewer how to actually get the kit, not just a command", () => {
        // The old wording ("Rebuild it yourself: docker + k3d + kubectl, then
        // `make up`") was an instruction the page cannot carry out — a public
        // demo URL has no repo to run `make up` in. Naming the hand-off is what
        // makes the line actionable rather than decorative.
        expect(fp.tryIt).toMatch(/hand-off/);
        expect(fp.tryIt).toMatch(/SUSE contact/);
        expect(fp.tryIt).toContain("make up");
        expect(fp.tryIt).toMatch(/15 minutes/);
        // The runbook's own claim, and the one a practice owner cares about.
        expect(fp.tryIt).toMatch(/installs nothing globally/);
      });

      it("distinguishes the kit from this simulation", () => {
        // `make up` builds the on-prem kit, not this browser page. Saying
        // "rebuild it" blurred the two; the honesty contract needs the line
        // drawn explicitly.
        expect(fp.tryIt).toMatch(/real containers/);
        expect(fp.tryIt).toMatch(/not this simulation/);
      });

      it("names K3s and never k3d — product, not demo scaffolding", () => {
        // k3d is "k3s in Docker", the laptop stand-in the kit demo uses; the
        // kits' component maps list it under what the DEMO uses, against
        // "SUSE Linux Micro + K3s" in production. On a strip headed "what this
        // takes to run", scaffolding reads as the product. Keep it out.
        const all = `${fp.shape} ${fp.facts.join(" ")} ${fp.tryIt}`;
        expect(all).not.toMatch(/k3d/i);
        expect(all).toMatch(/K3s/);
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
