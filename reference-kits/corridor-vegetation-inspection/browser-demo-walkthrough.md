# Browser demo walkthrough — corridor vegetation inspection

**Demo URL:** `https://edge-ai-demo.vercel.app/corridor` · works on any device,
nothing to install · deterministic (add `?seed=7` to replay a different run)

This page is an **in-browser simulation** of the corridor-vegetation-inspection
kit's ground-side pipeline, and it says so on screen. It is the zero-setup way
to show the platform's operating behavior. The same pipeline exists as the
runnable kit in this folder — real containers on a single-node cluster, proven
automatically on every change (campaign, revoked credential, WAN loss,
backpressure, recovery all asserted; see `README.md`). When the customer wants
to see it on hardware, the kit rebuilds on a laptop in about 15 minutes
(`handoff/00-partner-handoff-runbook.md`).

## Driving it: the guided scenario

The console opens with a **guided scenario** panel — a six-step path from a
quiet campaign to an outage and back, in the order that makes the design
explain itself. Each step completes only when the simulation actually reaches
the state it describes, so it cannot get ahead of what is on screen, and the
buttons do the work (sever the WAN, attempt a revoked upload, heal, swap the
model). Dismiss it and the console is unchanged — the scenario is a path
through the product, not the product.

The order matters and is deliberate: with the link up, evidence archives as
fast as it is produced and working storage sits near zero, so there is nothing
to see. Severing the WAN first is what makes the bounded storage, the
backpressure threshold, and the outbound-only queues visible at all.

If you would rather not narrate it yourself, run the scenario top to bottom and
let the panel text carry the story.

## What is being demonstrated

Five properties of the ground-side platform, all visible on the page:

1. **One inbound flow, credentialed per station.** Imagery enters as a plain
   upload from a ground station under that station's own credential. Nothing
   else comes in — every other flow is the site dialing out. The refused-401
   counter shows a revoked station being turned away.
2. **Bounded working storage, with a stated degradation order.** The storage
   gauge has two marked thresholds: a capacity **alert at 80%**, ingest
   **backpressure at 95%**. When storage fills, the alert always comes first;
   backpressure refuses only new uploads. Imagery already ingested and
   findings already queued are never lost.
3. **The vision model is a swappable workload, not the platform.** The scorer
   is a third-party container the platform hosts. The "Swap vision model"
   control replaces it mid-run — the only visible change is the model version
   stamped on new findings.
4. **Site autonomy under WAN loss, outbound-only recovery.** Severing the WAN
   stops nothing at the site: ingest and scoring continue, findings and
   evidence queue locally. Restoring the WAN drains the queues. The site
   initiates every delivery; nothing dials into it.
5. **Every image becomes a custody evidence record.** The ops panel shows work
   orders created from findings and the last evidence record with its
   traceability metadata: span, flight, model version, disposition — the
   record set a wildfire-mitigation filing draws on.

Two boundaries are stated on the page and worth saying out loud: the flight
tier (drones, capture) is out of scope — this platform starts where imagery
lands — and there is no data path to or from protection and control systems.

## The walkthrough

Each step: what to do, what the customer sees, what to say. The "say" lines
are plain statements of what is on screen — read them or use your own words.

**0 · Frame it (before touching anything)**
Say: "This is a simulation of how the platform behaves — the real thing is a
set of containers on a single-node cluster, and I can show you that on a
laptop. What I want you to watch here is the operating behavior: what happens
when the network drops, when storage fills, and where every image ends up."

**1 · Let it run (~30 seconds, no clicks)**
They see: uploads accepted climbing, the scoring backlog staying near zero,
work orders and archived evidence counting up on the ops panel.
Say: "Imagery is landing from a ground station under that station's own
credential, being scored at the site, and turning into two things: work
orders for crews, and evidence records in an archive the utility owns."

**2 · Try revoked station**
They see: refused-401 ticks up; accepted does not move.
Say: "A station whose credential was revoked gets refused at the door. That
credential only reaches ingest — it can never touch the platform itself."

**3 · Sever WAN**
They see: the link flips to SEVERED; accepted keeps climbing; the findings
and evidence queues start growing; the ops panel freezes.
Say: "The link to the operations center just went down. Notice what did not
happen: the site did not stop. It keeps ingesting and scoring — findings
queue up locally. Remote sites lose connectivity; the design assumes it."

**4 · Leave it severed (~1 minute)**
They see: working storage climbing; at 80% the gauge turns amber — capacity
alert; at 95% it turns red and refused-507 starts counting while accepted
stops.
Say: "Storage at a site is finite, so the failure order is designed, not
accidental: first an alert — someone gets told while there is still room —
then ingest starts refusing new uploads. Everything already ingested and
every queued finding survives. Nothing is silently dropped."

**5 · Restore WAN**
They see: queues drain to zero, work orders jump, the archive count catches
up, storage frees and the gauge returns to normal.
Say: "Link is back. The queues drain on their own — the site delivers
everything it held, in order, and storage frees as evidence lands in the
archive. No operator action, no data loss, and a complete record of the
outage window."

**6 · Swap vision model**
They see: the model version changes; new findings carry the new version; no
other number so much as blinks.
Say: "We just replaced the analytics — the part vendors compete on — while
everything ran. The platform underneath did not change. Your choice of
vision vendor stays your choice, and every finding records which model made
it."

**Close on the evidence record.** Point at the last-evidence block (span,
flight, model version, disposition).
Say: "That record is the point. Every image that ever entered this system
has one — which span, which flight, which model scored it, and what happened
next. That is what an auditable inspection program looks like."

## Questions to expect

- **"Is this the real product?"** — No, and it says so on the page. It is a
  simulation of the pipeline's behavior. The real pipeline is the runnable
  kit in this folder: the same sequence you just watched runs as containers
  on a fresh cluster and is re-proven automatically on every change. On real
  deployments the platform is SUSE Linux Micro + K3s built as a single Edge
  Image Builder image, managed by Rancher Prime and Fleet, with SUSE
  Security on every cluster — versions in `handoff/01-component-map.md`.
- **"We already use a vegetation analytics vendor."** — Good: the platform
  hosts whichever containerized pipeline you choose, and you saw it swapped
  live. The platform decision and the analytics decision stay separate.
- **"Where does the imagery go?"** — Into working storage at the site, then
  into an archive the utility selects and controls. Custody is a selection
  requirement, not a preference.
- **"Does this touch our grid systems?"** — No. There is no data path to or
  from SCADA, EMS, or protection relays, and the production design states
  and verifies that separation at the network level.
- **"What are the drones in this?"** — Out of scope, deliberately. Any
  capture program — yours or a contractor's — hands imagery to a ground
  station; the platform starts there.

## After the demo

The next step is discovery, not a proposal: the sizing and design inputs are
the eight-item capture list the solution architect carries (campaign
volumes, time-to-work-order today, analytics status, site connectivity,
custody rules, outage tolerance, integration inventory, evidence
requirements). To show it on hardware at the follow-up, run the rebuild
steps in `handoff/00-partner-handoff-runbook.md` — about 15 minutes on any
laptop with docker and k3d.

Source of truth: this Markdown file. The PDF beside it is generated —
regenerate with any Markdown-to-PDF renderer rather than editing the PDF.
