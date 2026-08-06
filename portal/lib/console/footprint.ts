/**
 * footprint.ts — what each kit costs to stand up, on screen during the demo.
 *
 * Why this exists: the consoles are ISA-101 control rooms — strip charts, alarm
 * journals, contribution bars. That polish is right for proving the platform
 * behaves correctly under fault, and it quietly argues against the claim the
 * whole factory rests on: one node, `make up`, about fifteen minutes. Someone
 * watching a control room does not think "we could stand that up before lunch".
 *
 * The footprint facts were already written down — in each kit's
 * `handoff/03-production-footprint.md` and `handoff/00-partner-handoff-runbook.md`
 * — but a partner only meets them later, in a PDF, if they read it. The person
 * whose signature you need is the one asking "what does delivery take", and the
 * demo never answered them.
 *
 * EVERY NUMBER HERE IS QUOTED, NOT ESTIMATED. Each entry cites the kit doc it
 * came from. The factory's no-fabrication rule applies to the demo surface
 * exactly as it applies to a deck: if a figure is not in the kit docs, it does
 * not go on screen. `footprint.test.ts` pins the citations.
 */

export type Footprint = {
  /** Kit these figures belong to. */
  kit: string;
  /** The site shape, as the kit's own footprint doc names it. */
  shape: string;
  /** Short facts, rendered as a row. Keep each to a few words. */
  facts: string[];
  /** How a partner rebuilds it themselves. */
  rebuild: string;
  /** Which kit doc these came from — shown to nobody, kept for maintenance. */
  source: string;
};

/**
 * Corridor and substrate quote the same single-node stack because their kits do:
 * "SL Micro (1 GB/20 GB, UEFI) + K3s single-server (SQLite, local-path) +
 * NeuVector All-in-One, one sealed EIB image."
 */
const SINGLE_NODE_FACTS = [
  "1 node, non-HA",
  "SUSE Linux Micro — 1 GB RAM / 20 GB disk",
  "K3s single-server — 2 CPU / 2 GB",
  "SUSE Security (NeuVector) All-in-One — 2 CPU / 2 GB",
  "one sealed Edge Image Builder image",
];

const REBUILD = "docker + k3d + kubectl, then `make up` — about 15 min on a laptop, installs nothing globally";

export const CORRIDOR_FOOTPRINT: Footprint = {
  kit: "corridor-vegetation-inspection",
  shape: "Smallest edge box (single-node, non-HA)",
  facts: SINGLE_NODE_FACTS,
  rebuild: REBUILD,
  source: "handoff/03-production-footprint.md, handoff/00-partner-handoff-runbook.md",
};

export const SUBSTRATE_FOOTPRINT: Footprint = {
  kit: "site-inference-substrate",
  shape: "Single-node site class (storage cabinet, small solar)",
  facts: SINGLE_NODE_FACTS,
  rebuild: REBUILD,
  source: "handoff/03-production-footprint.md, handoff/00-partner-handoff-runbook.md",
};

export const FAB_FOOTPRINT: Footprint = {
  kit: "semiconductor-predictive-maintenance",
  shape: "Smallest edge box (single-node, non-HA)",
  facts: [
    "1 node, non-HA",
    "SUSE Linux Micro — 1 GB RAM / 20 GB disk",
    "K3s single-server — 2 CPU / 2 GB",
    "SUSE Security (NeuVector) All-in-One — 2 CPU / 2 GB",
    "CPU inference tier — no GPU required",
    "one EIB image, fully air-gapped",
  ],
  rebuild: REBUILD,
  source: "handoff/03-production-footprint.md, handoff/00-partner-handoff-runbook.md",
};
