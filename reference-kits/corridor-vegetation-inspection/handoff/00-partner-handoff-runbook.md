# Partner hand-off runbook — build it yourself

Owner tags: **[P]** partner · **[S]** SUSE · **[C]** customer.

## What you were shown

A single-node corridor site ingesting drone imagery under per-station
credentials, scoring it locally with a swappable vision container, and
delivering findings + custody evidence outbound across a severable WAN —
with the bounded-autonomy behavior demonstrated live: capacity alert first,
ingest backpressure second, nothing already ingested lost, full drain on
heal. Screenshot: `assets/corridor-console.png`.

## Rebuild the demo (any laptop, ~15 min)

1. **[P]** Install docker, k3d, kubectl (the demo installs nothing globally).
2. **[P]** Clone the edge-proof-factory repository and
   `cd reference-kits/corridor-vegetation-inspection/demo`.
3. **[P]** `make up` — cluster, images, deploy; console at
   `http://localhost:18082`.
4. **[P]** Run the sequence: `make campaign`, `make revoked`, `make fault`,
   `make campaign`, `make fill`, `make heal`. Watch the console at each step.
5. **[P]** `make test` for the host-side unit tests;
   `bash tests/e2e_proof.sh` for the full assertion pass CI runs.

## Turn it into a customer pilot

6. **[P]** Capture the customer's discovery inputs before sizing anything:
   campaign imagery volumes (GB/TB per campaign), candidate compute sites
   and their connectivity class (private-WAN vs no-WAN sealed), longest
   tolerated WAN outage mid-campaign, custody/retention rules, and the
   work-management/GIS + IdP inventory. Start the service-account request
   early — it is the long-lead item.
7. **[C]** Select the vision pipeline (commercial vendor containers or open
   models) and the S3-compatible archive location; both stay swappable —
   the platform contract does not change.
8. **[P]** Build the pilot site image with Edge Image Builder (SL Micro +
   K3s + workloads + embedded registry from one build definition), sized
   from step 6, and stand it up at one real site on real hardware.
9. **[P]** Wire findings into the customer's work-management system via a
   service account, and evidence records into the customer-custody archive
   with the traceability fields (span, flight, model version, disposition).
10. **[C]** Run one real campaign through the pilot and compare
    time-to-work-order against the current process — that delta is the
    pilot's report card.

## Connect the real products (when you have accounts)

11. **[P]** Stand up Rancher Prime + Fleet at the ops center, register the
    pilot cluster, and move workload + policy delivery to the Git pull
    path. Add SUSE Security (NeuVector) full per-cluster with policy as
    CRDs in the same repository. Versions: `01-component-map.md`.

## How you make money on this (services-first)

Discovery and sizing, pilot build, per-site rollout, integration work
(work management/GIS, IdP, archive), and steady-state operations of the
site fleet are all services engagements; SUSE subscriptions (platform,
security, management) attach to every site the practice deploys. The
repeatable assets — the site image definition, policy set, acceptance
tests — make the second customer materially cheaper than the first.

## First action

**[P]** Today: run steps 1–5 on one laptop and time yourself — if the
rebuild takes you under thirty minutes, you are ready to demo it to a
customer tomorrow.
