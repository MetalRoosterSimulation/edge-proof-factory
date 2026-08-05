# Scale-up path — laptop demo → production fleet

Four billable phases. Owner tags **[P]** partner / **[S]** SUSE / **[C]** customer.

## Stage 0 — laptop demo (this kit)

What it proves: the pipeline semantics — read-only OT crossing, KServe-v2
serving contract, per-model outage policies acting under a severed uplink,
signed write-once evidence with an end-to-end verifiable chain, full
reconcile on reconnect. What it does not prove: hardware sizing, real
historian integration, model quality, NeuVector enforcement (nested-Docker
limitation). Exit: the partner team rebuilds it unaided and can explain
each outage policy's behavior.

## Stage 1 — one real site (PILOT)

**[P]** Build the site image with Edge Image Builder per the pilot site's
class (SL Micro 6.2 + K3s 1.35.4 single-node, or RKE2 1.35.4 CIS-profile
3-node) and deploy on dedicated hardware. **[C]** Provide the historian/BMS
export under a read-only service account and nominate the first model
class. **[P]** Integrate the DMZ replica pattern the site's security
posture requires; stand up the serving runtime (KServe/Triton-class) and
the evidence job with a per-site key from the customer's PKI. **[S]**
Partner enablement and product support as the platform lands.
Exit: one real model scores live site telemetry; the first sealed evidence
bundles verify centrally; an uplink-outage drill shows the agreed
per-model policies acting.

## Stage 2 — hardening, one region (ROLL OUT)

**[P]** NeuVector full per-cluster with policy as CRDs in Git; TPM2 +
Keylime attestation enrolled (the strictest site class records its
attestation decision explicitly); Multi-Linux Manager patch channels;
the model release path productionized — registry → cosign-signing CI →
reviewed Git pin → Fleet waves by cluster label, rollback as Git revert.
**[C]** Compliance owner signs the evidence schema and retention.
Exit: every site in the region passes the same commissioning checklist,
and a model release reaches the region through the Git path alone.

## Stage 3 — scale to fleet (DAY 2 & SCALE)

**[P]** Rancher Prime + Fleet manage every site; new sites are an image
flash plus registration; rollout waves ordered by site class (canary →
workhorse classes → strictest class last). Steady-state operations move to
the partner's managed-services practice: patch cadence, model-release
operation, evidence pipeline monitoring, outage-drill schedule. **[S]**
Subscription renewals track the fleet count.
Exit: adding a site or promoting a model requires no engineering decision,
only the recorded per-class choices.

## The one rule

Decide **site class** (single-node K3s vs 3-node RKE2 — datastore, storage
replication, and security consensus all follow it) and **GPU** (real model
throughput vs CPU advisory cadence) at image-build time. Both are baked
into the site image; neither is a day-2 toggle.
