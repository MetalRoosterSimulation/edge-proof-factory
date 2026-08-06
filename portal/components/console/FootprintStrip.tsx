"use client";

/**
 * FootprintStrip — what it takes to stand this up, visible while the demo runs.
 *
 * Deliberately quiet. The ISA-101 rule these consoles follow reserves colour for
 * abnormal states and operator actions, and a footprint is neither: it is
 * reference information that should be legible and ignorable. So this is a
 * single bordered row in tertiary ink, no colour, no icon, no emphasis beyond
 * the numbers themselves — the design language already used for the "what is
 * real here" panel.
 *
 * It sits high on the page rather than in the footer because the point is that
 * a partner sees it *during* the walk-through, at the moment they are forming a
 * view of how big this thing is. The facts themselves are quoted from the kit's
 * own handoff docs (see lib/console/footprint.ts).
 */
import type { Footprint } from "@/lib/console/footprint";

export function FootprintStrip({ footprint }: { footprint: Footprint }) {
  return (
    <section
      className="border border-[var(--c-line)] px-2 py-1.5 text-[10px] leading-4 text-[var(--c-ink3)]"
      aria-label="Production footprint"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[var(--c-ink2)]">What this takes to run:</span>
        <span className="text-[var(--c-ink3)]">{footprint.shape}</span>
        {footprint.facts.map((fact) => (
          <span key={fact} className="num border-l border-[var(--c-line)] pl-2">
            {fact}
          </span>
        ))}
      </div>
      <div className="mt-1 text-[var(--c-ink3)]">
        <span className="text-[var(--c-ink2)]">Try it for real:</span>{" "}
        {footprint.tryIt}
      </div>
    </section>
  );
}
