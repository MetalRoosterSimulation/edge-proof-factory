/**
 * scenario.ts — the guided run-through for the corridor console.
 *
 * Same job as the semiconductor console's scenario: give a rep a scripted path
 * through the demo that lands the four things this kit actually proves, in an
 * order that survives a live call. Every step's completion is a condition on the
 * simulation's own view — nothing is faked or timed.
 *
 * The arc, and why it is this arc: the outage comes first, because everything
 * interesting here is downstream of it. With the link up, evidence drains as
 * fast as it is produced and working storage sits at zero — there is no
 * pressure to show. Sever the WAN and the design has to answer for itself:
 *   1. the campaign is running and imagery is being scored on site
 *   2. the WAN is severed — findings and evidence queue, nothing is lost
 *   3. working storage fills to its bound and applies backpressure rather
 *      than dropping work silently
 *   4. a revoked credential is refused at the edge, with no round trip
 *   5. the link returns and the backlog drains without operator action
 *   6. the vision model swaps without touching the platform
 */
import type { CorridorEngine, CorridorView } from "@/lib/corridor/sim";
import { MODEL_V2 } from "@/lib/corridor/sim";
import type { GuidedStep } from "@/lib/console/guided";

export type CorridorStep = GuidedStep<CorridorView, CorridorEngine>;

export const CORRIDOR_SCENARIO: CorridorStep[] = [
  {
    title: "Meet the campaign",
    stack:
      "SUSE Linux Micro + K3s as one Edge Image Builder image — the whole site is a single sealed node, not a rack.",
    body:
      "Ground stations upload inspection imagery; a third-party vision model " +
      "scores it on site. With the link up this is unremarkable on purpose — " +
      "evidence archives as fast as it is produced and working storage sits " +
      "near zero. The interesting behaviour starts when the link goes away.",
    done: (v) => v.campaignRunning && v.accepted > 0 && v.scored > 0,
  },
  {
    title: "Sever the WAN",
    stack:
      "Fleet's pull-based GitOps: the site dials out, nothing dials in. That is why severing the link cannot strand it.",
    body:
      "Cut the link to the central side. Scoring continues, findings and " +
      "evidence queue locally, and nothing is lost — the queues are outbound-" +
      "only, so severing the link cannot strand the site. This is the claim " +
      "the architecture makes; here it is under fault.",
    action: "Sever WAN",
    run: (engine) => engine.severWan(),
    done: (v) => !v.wanUp && v.evidenceQueued + v.findingsQueued > 0,
  },
  {
    title: "Watch working storage reach its bound",
    stack:
      "Storage sized in the kit manifests; the alert-then-backpressure order is the deployed policy, not a UI choice.",
    body:
      "With nothing draining, the working set climbs. At 80% the console " +
      "raises ALERT and keeps accepting; at 95% it applies backpressure and " +
      "refuses uploads with a 507 rather than dropping imagery silently. The " +
      "bound is sized by the kit — the demo shows what happens when you hit it, " +
      "instead of assuming you never will.",
    done: (v) => v.storageState !== "OK",
  },
  {
    title: "Refuse a revoked credential",
    stack:
      "SUSE Security (NeuVector) enforces admission on the cluster, so the refusal needs no call to the centre.",
    body:
      "A station whose credential has been revoked attempts an upload. It is " +
      "refused at the edge, on the severed side, with no call to the centre — " +
      "which is the whole point of enforcing identity locally.",
    action: "Attempt revoked upload",
    run: (engine) => engine.attemptRevokedUpload(),
    done: (v) => v.rejectedCredential > 0,
  },
  {
    title: "Heal the link and drain",
    stack:
      "Rancher Prime + Fleet reconcile the site back to its declared state — no operator step, no replay tool.",
    body:
      "Restore the WAN. Queued evidence drains in order, the archive count " +
      "climbs, and working storage returns to OK. Recovery is the boring part " +
      "on purpose: no operator action, no replay tooling, no reconciliation step.",
    action: "Heal WAN",
    run: (engine) => engine.healWan(),
    done: (v) => v.wanUp && v.archived > 0 && v.storageState === "OK",
  },
  {
    title: "Swap the vision model",
    stack:
      "The scorer is a container delivered by Fleet; the platform underneath it does not change.",
    body:
      "Replace the third-party scorer with a newer version while the campaign " +
      "runs. The platform, the queues, and the evidence format are unchanged — " +
      "the model is a container, which is why the partner can bring their own.",
    action: "Swap model",
    run: (engine) => engine.swapModel(),
    done: (v) => v.modelVersion === MODEL_V2,
  },
];

export const CORRIDOR_SCENARIO_DONE =
  "Scenario complete. The console stays live — sever the link again, refill " +
  "storage, or stand the same pipeline up on one node with the kit's runbook.";
