/**
 * Every guided scenario must actually be completable by following its own
 * steps against the real engine — no step may be unreachable, and none may
 * complete before the thing it claims to demonstrate has happened.
 *
 * These drive the engines directly (no React), which is why the scenarios were
 * written as pure conditions over each console's view.
 */
import { describe, expect, it } from "vitest";

import { advance } from "@/lib/console/guided";
import { CorridorEngine } from "@/lib/corridor/sim";
import { CORRIDOR_SCENARIO } from "@/lib/corridor/scenario";
import { SCENARIO } from "@/lib/console/scenario";
import { SubstrateEngine } from "@/lib/substrate/sim";
import { SUBSTRATE_SCENARIO } from "@/lib/substrate/scenario";

/** Drive a scenario to completion the way the console does. */
function play<V, E>(
  steps: ReadonlyArray<{
    action?: string;
    run?: (engine: E) => void;
    done: (view: V) => boolean;
  }>,
  engine: E,
  tick: () => void,
  view: () => V,
  maxTicks: number,
): { completed: boolean[]; ticks: number } {
  let completed = steps.map(() => false);
  let ticks = 0;
  while (!completed.every(Boolean) && ticks < maxTicks) {
    const idx = completed.findIndex((c) => !c);
    const step = steps[idx];
    // The rep presses the button when the step offers one.
    if (step.run) step.run(engine);
    tick();
    ticks += 1;
    completed = advance(steps as never, completed, view());
  }
  return { completed, ticks };
}

describe("guided scenarios", () => {
  describe("corridor", () => {
    it("is completable end to end", () => {
      const engine = new CorridorEngine(42);
      const { completed, ticks } = play(
        CORRIDOR_SCENARIO,
        engine,
        () => engine.tick(),
        () => engine.view(),
        4000,
      );
      const stuck = CORRIDOR_SCENARIO.filter((_s, i) => !completed[i]).map(
        (s) => s.title,
      );
      expect(stuck, `unreachable step(s) after ${ticks} ticks`).toEqual([]);
    });

    it("does not mark a step done before its condition holds", () => {
      const engine = new CorridorEngine(42);
      const completed = CORRIDOR_SCENARIO.map(() => false);
      // Nothing has run yet: the first step must still be open.
      expect(advance(CORRIDOR_SCENARIO as never, completed, engine.view())[0]).toBe(
        false,
      );
    });

    it("only advances one step per evaluation", () => {
      // The campaign runs from boot, so ticking alone satisfies step 1.
      const engine = new CorridorEngine(42);
      engine.run(60);
      const completed = CORRIDOR_SCENARIO.map(() => false);
      const next = advance(CORRIDOR_SCENARIO as never, completed, engine.view());
      expect(next.filter(Boolean).length).toBe(1);
    });

    it("every step with an action declares a label, and vice versa", () => {
      for (const step of CORRIDOR_SCENARIO) {
        expect(Boolean(step.run)).toBe(Boolean(step.action));
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.body.length).toBeGreaterThan(0);
      }
    });
  });

  describe("substrate", () => {
    it("is completable end to end", () => {
      const engine = new SubstrateEngine(42);
      const { completed, ticks } = play(
        SUBSTRATE_SCENARIO,
        engine,
        () => engine.tick(),
        () => engine.view(),
        4000,
      );
      const stuck = SUBSTRATE_SCENARIO.filter((_s, i) => !completed[i]).map(
        (s) => s.title,
      );
      expect(stuck, `unreachable step(s) after ${ticks} ticks`).toEqual([]);
    });

    it("ends with a chain that reports BROKEN and names the break", () => {
      const engine = new SubstrateEngine(42);
      play(
        SUBSTRATE_SCENARIO,
        engine,
        () => engine.tick(),
        () => engine.view(),
        4000,
      );
      const v = engine.view();
      expect(v.chainStatus).toBe("BROKEN");
      expect(v.chainProblem).toBeTruthy();
    });

    it("every step with an action declares a label, and vice versa", () => {
      for (const step of SUBSTRATE_SCENARIO) {
        expect(Boolean(step.run)).toBe(Boolean(step.action));
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.body.length).toBeGreaterThan(0);
      }
    });
  });

  // Without attribution these consoles pass a name-swap test: a competitor
  // could demo the same steps on their own stack, because nothing on screen
  // ties any observed behaviour to anything. The factory applies that test to
  // every competitive claim in a deck; it applies here too.
  describe("stack attribution", () => {
    const ALL: Array<[string, ReadonlyArray<{ title: string; stack: string }>]> = [
      ["semiconductor", SCENARIO],
      ["corridor", CORRIDOR_SCENARIO],
      ["substrate", SUBSTRATE_SCENARIO],
    ];

    // Named components the kits actually run, per each console's own
    // "what is real here" panel.
    const COMPONENTS =
      /K3s|RKE2|Fleet|Rancher|NeuVector|SUSE Linux Micro|Edge Image Builder|KServe|SUSE Security/;

    for (const [name, steps] of ALL) {
      it(`${name}: every step names what runs it in the kit`, () => {
        for (const step of steps) {
          expect(step.stack, `"${step.title}" has no stack attribution`).toBeTruthy();
          expect(
            step.stack.length,
            `"${step.title}" attribution is too thin to be useful`,
          ).toBeGreaterThan(30);
        }
      });

      it(`${name}: attribution names real components, not generic architecture`, () => {
        const named = steps.filter((s) => COMPONENTS.test(s.stack));
        // Not every step can name a product honestly — a fault injection is a
        // property of the simulation. Most must, or the demo is name-swappable.
        expect(
          named.length,
          `only ${named.length}/${steps.length} steps name a component`,
        ).toBeGreaterThanOrEqual(Math.ceil(steps.length * 0.6));
      });

      it(`${name}: attribution never claims something is running in the browser`, () => {
        // The honesty contract: the page is a simulation, no product executes
        // here. Attribution says what the kit runs; it must not read as a live
        // event, which is what "is currently/now blocking" phrasing would do.
        const LIVE_CLAIM = /\b(is|are) (currently|now) \w+ing\b|\brunning right now\b|\blive (feed|event)s?\b/i;
        for (const step of steps) {
          expect(
            LIVE_CLAIM.test(step.stack),
            `"${step.title}" attribution reads as a live event: ${step.stack}`,
          ).toBe(false);
        }
      });
    }
  });

  describe("advance()", () => {
    it("returns the same array reference when nothing changed", () => {
      const steps = [{ title: "a", body: "b", stack: "s", done: () => false }];
      const completed = [false];
      expect(advance(steps as never, completed, {})).toBe(completed);
    });

    it("returns the same array reference when everything is done", () => {
      const steps = [{ title: "a", body: "b", stack: "s", done: () => true }];
      const completed = [true];
      expect(advance(steps as never, completed, {})).toBe(completed);
    });
  });
});
