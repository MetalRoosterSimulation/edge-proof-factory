/**
 * scenario.ts — the guided run-through for the site-inference substrate console.
 *
 * The hardest thing to demonstrate about this kit is not that inference runs at
 * the site; it is what the site does when the uplink is gone and how anyone
 * proves, afterwards, what happened while nobody was watching. So the arc runs
 * the outage first and the tamper check last:
 *   1. models score locally, each under its own declared outage policy
 *   2. the uplink drops — three policies visibly diverge instead of one blanket rule
 *   3. evidence keeps sealing into a hash chain through the outage
 *   4. the link returns and held work drains
 *   5. tamper a sealed bundle and verify — the chain names the break
 *
 * Step 5 is the point of the whole console: evidence that only claims integrity
 * is not evidence. Every completion condition reads the simulation's own view.
 */
import type { SubstrateEngine, SubstrateView } from "@/lib/substrate/sim";
import type { GuidedStep } from "@/lib/console/guided";

export type SubstrateStep = GuidedStep<SubstrateView, SubstrateEngine>;

export const SUBSTRATE_SCENARIO: SubstrateStep[] = [
  {
    title: "Watch local scoring",
    stack:
      "SUSE Linux Micro + K3s or RKE2 per site class, one sealed Edge Image Builder image; models served behind the KServe v2 contract.",
    body:
      "Each model scores site telemetry on the node, and each carries its own " +
      "declared behaviour for an uplink outage — continue, flag, or suppress. " +
      "The policy is a property of the model, not a global switch, because in " +
      "practice the site does not want one answer for every workload.",
    done: (v) => v.models.some((m) => m.scored > 0),
  },
  {
    title: "Sever the uplink",
    stack:
      "Fleet pull-based GitOps — the site never needs an inbound call, so an outage degrades disposition, not availability.",
    body:
      "Drop the link to the centre. Nothing stops: scoring continues on the " +
      "node. What changes is disposition — the continue model keeps emitting, " +
      "the flag model marks its output, the suppress model holds work for " +
      "review rather than shipping an answer nobody can check.",
    action: "Sever uplink",
    run: (engine) => engine.severUplink(),
    done: (v) => !v.uplinkUp && v.outboxQueued + v.heldPendingReview > 0,
  },
  {
    title: "Keep sealing evidence",
    stack:
      "The evidence signer runs on the cluster and is delivered by Fleet, so sealing does not depend on the centre being reachable.",
    body:
      "Bundles keep sealing into the hash chain during the outage, each one " +
      "carrying the previous bundle's hash. The record of an outage is written " +
      "while the outage is happening — not reconstructed from memory once the " +
      "link is back.",
    done: (v) => v.evidenceSealed > 0,
  },
  {
    title: "Tamper with a bundle sealed during the outage",
    stack:
      "The chain is written by the kit at seal time — integrity is a property of the record, not of the network.",
    body:
      "Alter one of the bundles sealed while the link was down — the exact " +
      "record an auditor cares about, because nobody outside the site saw it " +
      "being made. Do it now, before the backlog ships: this is the window " +
      "where the evidence is only as good as its own integrity check.",
    action: "Tamper a bundle",
    run: (engine) => engine.tamperBundle(),
    // Completion has to observe that the tamper actually landed, not merely
    // that a tamperable bundle existed: tampering is a no-op when every sealed
    // bundle has already shipped, and a condition like `sealed > shipped` would
    // report success on the tick a new bundle seals — after the attempt.
    done: (v) => v.events.some((e) => /altered after sealing/i.test(e.text)),
  },
  {
    title: "Verify the chain",
    stack:
      "Verification runs against the local chain on the node; SUSE Security (NeuVector) governs what may run alongside it.",
    body:
      "Run verification. The chain reports BROKEN and names the sequence where " +
      "the hashes stop agreeing. That is the difference between evidence and a " +
      "log file: this one can fail, out loud, and say where.",
    action: "Verify chain",
    run: (engine) => engine.verifyChain(),
    done: (v) => v.chainStatus === "BROKEN" && Boolean(v.chainProblem),
  },
  {
    title: "Restore and drain",
    stack:
      "Rancher Prime + Fleet reconcile the site to its declared state; held work stays held because policy says so.",
    body:
      "Heal the uplink. Queued outputs deliver, flagged ones arrive still " +
      "marked as produced blind, and work held under the suppress policy stays " +
      "held for a human — recovery does not quietly launder it. The broken " +
      "chain stays broken: shipping the backlog does not repair the record.",
    action: "Heal uplink",
    run: (engine) => engine.healUplink(),
    done: (v) => v.uplinkUp && v.delivered > 0,
  },
];

export const SUBSTRATE_SCENARIO_DONE =
  "Scenario complete. Reseed to get an untampered chain and verify again — a " +
  "check that only ever passes is not a check.";
