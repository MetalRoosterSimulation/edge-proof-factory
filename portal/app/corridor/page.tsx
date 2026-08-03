import type { Metadata } from "next";
import { CorridorConsole } from "@/components/corridor/CorridorConsole";

export const metadata: Metadata = {
  title: "Corridor Vegetation Inspection — ground-side site (simulation)",
  description:
    "In-browser, seeded simulation of the corridor-vegetation-inspection kit's ground-side pipeline: per-station upload, bounded working storage with alert-then-backpressure, swappable vision scoring, and outbound-only findings/evidence delivery across a severable WAN.",
};

export default function CorridorPage() {
  return <CorridorConsole />;
}
