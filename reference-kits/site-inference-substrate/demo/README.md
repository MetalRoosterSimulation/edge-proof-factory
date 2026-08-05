# Site AI inference substrate — runnable demo

The site-edge ML pattern on a single-node cluster: a DMZ historian replica
(looping synthetic tags: temperature, pressure, cycle counts) → a read-only
feature adapter → a serving tier speaking the **KServe v2 inference
protocol** with three stand-in models → an outbound-only uplink relay
applying each model's **outage policy** (continue / flag / suppress) → a
central stub (ML-platform ingestion + evidence store). A scheduled evidence
job seals signed, hash-chained bundles to a **write-once directory**.

Requires docker, k3d, kubectl. All images are built locally from this
directory — every base is openly pullable, CPU-only, laptop-class.

## Run it

```
make up          # cluster + images + deploy (~2 min)
open http://localhost:18083
```

## The 90-second demo

```
                 # watch first: three models scoring the looping feed,
                 # outputs landing centrally, evidence chain growing
make fault       # sever the uplink: scoring CONTINUES on the DMZ feed;
                 #   equipment-health (continue)  -> queues for delivery
                 #   storage-optimization (flag)  -> queues, marked stale-context
                 #   thermal-precursor (suppress) -> held on site for review
make heal        # queues drain; central reconciles; the evidence chain
                 #   verifies end to end; held outputs stay held (by policy)
make verify-evidence   # verify the signed WORM chain in place
make reset       # fresh demo state without rebuilding the cluster
make down        # delete the cluster
```

`make status` prints live counters; `make test` runs the host-side unit
tests (no cluster needed). The full assertion sequence CI runs is
`tests/e2e_proof.sh`.

## What's what

```
images/historian-replica/   DMZ read-only replica: looping synthetic tags
                            behind a read-only token; initiates nothing
images/feature-adapter/     reads the replica, builds KServe v2 infer calls
images/inference-serving/   /v2/* serving tier (KServe v2 protocol);
                            models + outage policies are config (scoring.py
                            unit-tested) — the SWAPPABLE workload
images/uplink-relay/        outbound-only delivery + the site console;
                            applies outage policies at enqueue time
images/evidence-collector/  seals signed hash-chained bundles to /worm
                            (0444 after write; evchain.py unit-tested)
images/central-stub/        far side: output ingestion + evidence
                            verification (signature, chain, sequence)
k8s/base/                   three namespaces (dmz / site / central);
                            default-deny egress; 45-allow-wan.yaml IS the
                            uplink — make fault deletes it, heal re-applies;
                            the DMZ read path is a separate policy, so a
                            severed uplink never cuts the local feed
tests/                      unit tests (gate-run) + e2e_proof.sh (CI-run)
```

## Architecture truths this demo keeps

- **The OT crossing is a read-only replica.** The enclave reads exports; it
  never writes toward plant systems — there is no return path to configure.
- **Outbound-only enclave.** Every boundary flow is site-initiated; the
  uplink sever is a real NetworkPolicy removal, not a mock.
- **Per-model outage policy is configuration, not code.** Visible at
  `/v2/models` and on the console; suppress means held for review —
  never auto-delivered, even after the uplink returns.
- **Evidence is signed, chained, and write-once.** Any tamper, gap, or
  reorder is detectable (`make verify-evidence`); a rewrite attempt on a
  sealed bundle fails.
- **Fleet-ready.** `k8s/base/fleet.yaml` makes the kit a Fleet bundle:
  point a Rancher GitRepo at this path and pushes to the repository become
  the model/config release path (two-stage pull, site dials out) — the
  same resync machinery the corridor kit uses.
