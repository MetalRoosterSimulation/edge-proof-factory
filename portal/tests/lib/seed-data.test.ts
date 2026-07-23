/**
 * Referential-integrity checks over the canonical seed content. These catch
 * the mistake that matters most for a "no fabrication" factory: a stray
 * kit_slug typo that would silently orphan a component-map row, scale-up
 * stage, or footprint spec from its kit.
 */
import { describe, expect, it } from "vitest";
import {
  componentMap,
  footprintSpecs,
  ledgerPhases,
  proofKits,
  scaleUpStages,
} from "@/supabase/seed-data";

const kitSlugs = new Set(proofKits.map((k) => k.slug));

describe("seed data referential integrity", () => {
  it("has no duplicate proof kit slugs", () => {
    expect(kitSlugs.size).toBe(proofKits.length);
  });

  it("every component_map_rows.kit_slug references a real proof kit", () => {
    for (const row of componentMap) {
      expect(kitSlugs.has(row.kit_slug)).toBe(true);
    }
  });

  it("every scale_up_stages.kit_slug references a real proof kit", () => {
    for (const row of scaleUpStages) {
      expect(kitSlugs.has(row.kit_slug)).toBe(true);
    }
  });

  it("every footprint_specs.kit_slug references a real proof kit", () => {
    for (const row of footprintSpecs) {
      expect(kitSlugs.has(row.kit_slug)).toBe(true);
    }
  });

  it("has no duplicate ledger phase numbers", () => {
    const numbers = ledgerPhases.map((p) => p.phase_number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("ledger phases are listed in ascending phase_number order", () => {
    const numbers = ledgerPhases.map((p) => p.phase_number);
    const sorted = [...numbers].sort((a, b) => a - b);
    expect(numbers).toEqual(sorted);
  });

  it("only the semiconductor kit's scale-up stages are numbered 0-3 with no gaps", () => {
    const stageNumbers = scaleUpStages
      .filter((s) => s.kit_slug === "semiconductor-predictive-maintenance")
      .map((s) => s.stage_number)
      .sort((a, b) => a - b);
    expect(stageNumbers).toEqual([0, 1, 2, 3]);
  });
});
