# Corridor vegetation inspection — runnable demo

The ground-side corridor-imagery pipeline on a single-node cluster:
ground-station upload (the one inbound flow, per-station credential) →
working storage (finite, alert-then-backpressure) → swappable vision scoring
→ findings/evidence delivery, outbound only, across a severable "WAN" → work
orders + custody archive with traceability metadata (span, flight, model
version, disposition).

Requires docker, k3d, kubectl. All images are built locally from this
directory — every base is openly pullable, CPU-only, laptop-class.

## Run it

```
make up          # cluster + images + deploy (~2 min)
open http://localhost:18082
```

## The 90-second demo

```
make campaign    # 12 uploads: watch findings become work orders, evidence archive
make revoked     # a revoked station credential is refused (401)
make fault       # sever the WAN: site keeps ingesting + scoring, queues grow
make fill        # oversized campaign: capacity ALERT first, then 507 backpressure
                 #   — already-scored imagery and queued findings survive
make heal        # WAN back: queues drain, work orders advance, storage frees
make down        # delete the cluster
```

`make status` prints live counters; `make test` runs the host-side unit
tests (no cluster needed). The full assertion sequence CI runs is
`tests/e2e_proof.sh`.

## What's what

```
images/site-ingest/      the one inbound flow: per-station tokens, bounded
                         working storage (store.py — unit-tested), console
images/vision-scorer/    the SWAPPABLE third-party workload stand-in
                         (vegmodel.py — unit-tested; PPM in, record out)
images/findings-relay/   outbound-only delivery; the filesystem IS the queue
images/ops-center/       far side of the WAN: work orders + custody archive
images/ground-station/   campaign generator (synthetic PPM corridor imagery)
k8s/base/                two namespaces (corridor-site / corridor-ops),
                         default-deny egress; 35-allow-wan.yaml IS the WAN —
                         make fault deletes it, make heal re-applies it
tests/                   unit tests (gate-run) + e2e_proof.sh (CI-run)
```

## Architecture truths this demo keeps

- **Ground-side only.** No flight tier, no device-discovery plumbing —
  imagery enters as a plain upload from a simulated ground station.
- **One inbound flow.** Everything else the site does is dial-out. Severing
  the WAN is a real NetworkPolicy removal, not a mock flag.
- **The model is a tenant.** Swap the scorer container (or set
  `MODEL_VERSION`) and only the version stamped on findings changes.
- **Bounded autonomy.** Storage frees only when evidence lands in the
  archive; under a severed WAN it climbs, alerts, then refuses new uploads
  while everything already ingested survives.
- **No path to protection & control.** Nothing here talks to anything
  OT-shaped; the production separation is stated in the component map.
