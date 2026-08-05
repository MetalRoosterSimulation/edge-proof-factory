import type { Metadata } from "next";
import { SubstrateConsole } from "@/components/substrate/SubstrateConsole";

export const metadata: Metadata = {
  title: "Site AI Inference Substrate — analytics enclave (simulation)",
  description:
    "In-browser, seeded simulation of the site-inference-substrate kit: a looping historian feed scored at the site edge behind the KServe v2 contract, per-model outage policies (continue / flag / suppress) acting under a severed uplink, and a signed, hash-chained evidence stream with in-place verification.",
};

export default function SiteInferencePage() {
  return <SubstrateConsole />;
}
