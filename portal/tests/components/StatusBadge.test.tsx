import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/StatusBadge";

describe("StatusBadge", () => {
  it("renders a human label for a known status", () => {
    render(<StatusBadge status="built-and-verified" />);
    expect(screen.getByText("Built and verified")).toBeInTheDocument();
  });

  it("falls back to the raw value for an unknown status", () => {
    render(<StatusBadge status="mystery" />);
    expect(screen.getByText("mystery")).toBeInTheDocument();
  });
});
