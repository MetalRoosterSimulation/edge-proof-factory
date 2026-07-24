# Production footprint — sourced hardware floors

Minimum specs from the SUSE product docs (SUSE Edge <RELEASE> / SUSE AI <RELEASE>).
These are floors, not sizing — real sizing is a Stage-1 discovery deliverable.
Numbers without a customer input stay as ranges; do not invent node counts.

| Component | Minimum (per SUSE docs) |
|---|---|
| <SUSE component> | <sourced floor — cite the docs page in the kit README> |
| ... | ... |

## Two minimal reference footprints

**Smallest edge box (single-node, non-HA):** <the smallest honest production
build for this use case — OS + Kubernetes flavor + the workload tiers it
actually needs. State the resilience model (e.g. reimage/re-register fast,
not HA)>.

**HA edge site:** <the multi-node variant — node count, Kubernetes flavor,
storage layer. Note this is decided at image-build time>.

## Where AI changes the number
<If the use case has an AI tier: state the SUSE AI floor (4 cores / 32 GB /
50 GB SSD per node plus a GPU as of SUSE AI 1.0 — re-verify) and what workload
tier crosses that line, so the customer sizes power/cooling/GPU early and the
pilot doesn't promise a laptop-class box for a GPU-class workload. If there is
no AI tier, delete this section rather than padding it.>

## Air-gapped delivery
<Only if the deployment environment is disconnected/regulated. Name the
concrete mechanisms (EIB embedded registry, image mirroring, CVE-db refresh
cadence) for each tier the kit ships — [FILL] anything unverified rather than
guessing.>
