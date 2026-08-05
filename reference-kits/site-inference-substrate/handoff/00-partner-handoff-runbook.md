# Partner hand-off runbook — build it yourself

Owner tags: **[P]** partner · **[S]** SUSE · **[C]** customer.

## What you were shown

A site analytics enclave scoring a looping historian feed through a
KServe-v2 serving tier, holding to per-model outage policies when the
uplink was severed (continue / flag / suppress — visible in model config),
sealing signed hash-chained evidence bundles to a write-once directory,
and reconciling everything — outputs, flags, evidence chain — when the
uplink returned. Held outputs stayed held: suppress means pending review.
Screenshot: `assets/substrate-console.png`.

## Rebuild the demo (any laptop, ~15 min)

1. **[P]** Install docker, k3d, kubectl (the demo installs nothing globally).
2. **[P]** Clone the edge-proof-factory repository and
   `cd reference-kits/site-inference-substrate/demo`.
3. **[P]** `make up` — cluster, images, deploy; console at
   `http://localhost:18083`.
4. **[P]** Run the sequence: watch scoring flow, `make fault`, watch the
   three policies act, `make heal`, `make verify-evidence`. Use
   `make reset` between rehearsals.
5. **[P]** `make test` for the host-side unit tests;
   `bash tests/e2e_proof.sh` for the full assertion pass CI runs.

## Turn it into a customer pilot

6. **[P]** Capture the discovery inputs before sizing anything: exported
   tag inventory and rates from the historian/BMS, the site-class map
   (which sites are 3-node RKE2 class vs single-node K3s class), longest
   uplink outage each site must buffer through, model classes the customer
   intends to run and their owner (customer data-science team or ISV),
   evidence requirements, and the DMZ pattern per site (vendor replication
   vs hardware one-way gateway).
7. **[C]** Nominate the pilot site and the first model class; supply the
   replica/export access under a read-only service account.
8. **[P]** Build the pilot site image with Edge Image Builder (SL Micro +
   K3s/RKE2 + serving runtime + NeuVector from one build definition) and
   stand it up on dedicated hardware at the pilot site.
9. **[P]** Wire the model release path: model registry → promotion CI
   (cosign-signed image + reviewed Git pin) → Fleet delivery to the pilot
   cluster; agree the per-model outage policies with the customer's
   engineering owner and record them in the Git config.
10. **[C]** Run one real scoring campaign; compare the advisory outputs
    against the current cloud/manual path, and hand the first sealed
    evidence bundles to the compliance owner for format sign-off.

## Connect the real products (when you have accounts)

11. **[P]** Stand up Rancher Prime + Fleet centrally, register the pilot
    cluster, move workload + policy delivery to the Git pull path, add
    SUSE Security (NeuVector) with policy as CRDs, and enroll the host in
    Multi-Linux Manager patch channels. Versions: `01-component-map.md`.

## How you make money on this (services-first)

Discovery (tag inventory, site classing, policy definition), DMZ/replica
integration per site, pilot build, the model-release-path build on the
customer's CI, per-site rollout in waves, evidence-format consulting with
the compliance owner, and steady-state operations of the site fleet are
all services engagements; SUSE subscriptions (platform, security,
management) attach to every site. The repeatable assets — site image
definitions per class, policy CRD set, evidence schema, acceptance tests —
make the second site and the second customer materially cheaper.

## First action

**[P]** Today: run steps 1–5 on one laptop and rehearse the fault/heal
narrative once with a colleague as the customer — if you can explain why
the held outputs stay held, you understand the design.
