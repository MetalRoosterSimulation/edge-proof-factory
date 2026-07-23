import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KitCard } from "@/components/KitCard";
import type { ProofKit } from "@/lib/types";

const kit: ProofKit = {
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
  repo_url: null,
  created_at: "2026-07-22T00:00:00Z",
};

describe("KitCard", () => {
  it("links to the kit detail page and shows its status", () => {
    render(<KitCard kit={kit} />);
    expect(
      screen.getByRole("link", { name: /Semiconductor predictive maintenance/ })
    ).toHaveAttribute("href", "/kits/semiconductor-predictive-maintenance");
    expect(screen.getByText("Built and verified")).toBeInTheDocument();
    expect(
      screen.getByText("Technologent / Microchip Technology - Semiconductor manufacturing")
    ).toBeInTheDocument();
  });
});
