import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LedgerTimeline } from "@/components/LedgerTimeline";
import type { LedgerPhase } from "@/lib/types";

const phases: LedgerPhase[] = [
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
    status: "in-progress",
    body_md: "Building the reference kit.",
    done_date: "2026-07-23",
  },
];

describe("LedgerTimeline", () => {
  it("renders every phase with its number, title, and status", () => {
    render(<LedgerTimeline phases={phases} />);
    expect(screen.getByText("Phase 0")).toBeInTheDocument();
    expect(screen.getByText("Research swarm")).toBeInTheDocument();
    expect(screen.getByText("Phase 1")).toBeInTheDocument();
    expect(screen.getByText("The runnable MVP")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("2026-07-23")).toBeInTheDocument();
  });
});
