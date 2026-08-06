/**
 * guided.ts — the shape a guided scenario has, independent of which console
 * runs it.
 *
 * The semiconductor console shipped with a scripted walk-through and the two
 * later consoles (/corridor, /site-inference) did not, which meant only one of
 * the three demos could be driven by a rep who had not built it. This is the
 * common contract so all three can use one panel: `V` is whatever view the
 * console already computes each tick, so a scenario is pure logic over a
 * snapshot and is testable without React.
 *
 * Presentation only in the sense that the console remains the product — every
 * scenario is dismissible and nothing depends on it.
 */

export type GuidedStep<V, E = unknown> = {
  title: string;
  body: string;
  /** Label for the step's action button, if it has one. */
  action?: string;
  /** Performed when the action button is pressed. */
  run?: (engine: E) => void;
  /** Completion condition, evaluated every tick against the console's view. */
  done: (view: V) => boolean;
};

/**
 * Advance the completion vector by at most one step, the way every console
 * drives it: find the first incomplete step, mark it done if its condition
 * holds. Returns the same array reference when nothing changed so React can
 * skip the re-render.
 */
export function advance<V>(
  // Only `done` is read here, so the engine type is irrelevant to advancing —
  // narrowing to that keeps every console's step array assignable without
  // widening the engine parameter.
  steps: ReadonlyArray<Pick<GuidedStep<V>, "done">>,
  completed: boolean[],
  view: V,
): boolean[] {
  const idx = completed.findIndex((c) => !c);
  if (idx === -1) return completed;
  if (!steps[idx].done(view)) return completed;
  const next = [...completed];
  next[idx] = true;
  return next;
}
