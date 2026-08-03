# Scale-up path — laptop demo → production fleet

Four billable phases. Owner tags **[P]** partner / **[S]** SUSE / **[C]** customer.

## Stage 0 — laptop demo (this kit)

What it proves: the pipeline semantics — one inbound credentialed flow,
bounded working storage with alert-then-backpressure, swappable scoring,
outbound-only delivery that survives WAN loss, custody evidence with
traceability metadata. What it does not prove: hardware sizing, real
imagery throughput, NeuVector enforcement (nested-Docker limitation).
Exit: the partner team rebuilds it unaided and can narrate every step.

## Stage 1 — one real edge box (PILOT)

**[P]** Build the site image with Edge Image Builder (SL Micro 6.2 + K3s
1.35.4 + workloads + embedded registry, one build definition) and deploy on
one real single-node host at one customer site. **[C]** Supply real
campaign imagery, the vision-pipeline choice, and the archive location.
**[P]** Wire work-management and IdP service accounts. **[S]** Partner
enablement and product support as the platform lands.
Exit: one real campaign flows capture → findings → work order → custody
evidence end to end, with the WAN-loss behavior verified on site.

## Stage 2 — hardening, one zone (ROLL OUT)

**[P]** NeuVector full per-cluster (enforcement verified on real k3s),
policy as CRDs in Git delivered by Fleet; network policies mirrored from
this kit's default-deny spine; per-station credential lifecycle (issue,
rotate, revoke) integrated with the customer IdP; acceptance tests from the
kit's e2e sequence run as the site commissioning checklist. **[C]**
Compliance owner signs the evidence-record schema.
Exit: every site in the zone passes the same commissioning checklist.

## Stage 3 — scale to fleet (DAY 2 & SCALE)

**[P]** Rancher Prime + Fleet manage every site from the ops center; new
sites are an image flash plus a Git registration. Sealed sites (no WAN)
take updates as rebuilt images on a scheduled media cadence — decided per
site, recorded per site. **[P]** Steady-state operations move to the
partner's managed-services practice. **[S]** Subscription renewals track
the fleet count.
Exit: adding a site requires no engineering decision, only the recorded
per-site choices.

## The one rule

Decide **HA (datastore: SQLite vs embedded etcd)** and **GPU (real vision
throughput vs CPU demo)** at image-build time. Both are baked into the site
image; neither is a day-2 toggle.
