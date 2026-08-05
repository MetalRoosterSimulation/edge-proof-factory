# Production footprint — sourced hardware floors

Floors, not sizing. Real sizing is a Stage-1 discovery deliverable driven
by tag rates, model classes, and each site's outage-buffering requirement —
do not invent node counts. Versions and floors per the SUSE Edge 3.6.1
matrix notes in `docs/suse-edge-ai-stack.md`; re-verify before a build.

| Component | Minimum (per SUSE docs) |
|---|---|
| SUSE Linux Micro 6.2 | 1 GB RAM / 20 GB disk, UEFI only |
| K3s 1.35.4 (single server) | 2 CPU / 2 GB (server); default SQLite datastore = no HA |
| RKE2 1.35.4 (hardened path, 3-node classes) | 2 vCPU / 4 GB |
| Rancher Prime 2.14.2 management cluster | Small profile 4 vCPU / 16 GB per node, ≥3 nodes for HA |
| SUSE Security (NeuVector) 5.5.2 All-in-One (single-node classes) | 2 CPU / 2 GB / 5 GB + RWX 1–5 Gi |
| SUSE Storage (Longhorn) 1.11.2 | Multi-node only: 3 nodes for 3-replica HA, 4 vCPU / 4 GiB per node; single-node classes use K3s local-path |
| Edge Image Builder 1.3.3.1 build host | ≥4 GB RAM (8 recommended), runs as a privileged container |

## Two minimal reference footprints

**Single-node site class (storage cabinet, small solar):** SL Micro
(1 GB/20 GB, UEFI) + K3s single-server (SQLite, local-path) + NeuVector
All-in-One, one sealed EIB image. Buffering capacity is sized from tag
rates × the longest uplink outage the site must ride through (outputs,
evidence, and telemetry all queue during an outage) — a named discovery
input, not a default.

**Three-node site class (generation site):** RKE2 CIS-profile with embedded
etcd + Longhorn (1.11.2) replicated storage + NeuVector three-Controller
consensus — the class a site lands in when any of those three HA
requirements applies, because all three want the same three nodes.

## Where AI changes the number

No LLM tier exists in this use case, so SUSE AI's floors do not apply.
Production-rate model serving may require a GPU node scheduled via the
NVIDIA GPU Operator; the GPU model and count depend on the customer's
model classes and measured throughput — a discovery deliverable, never a
quote from this kit. Low-rate advisory models on CPU are a legitimate
production outcome; the demo scorer proves the pipeline, not throughput.

## Air-gapped delivery

Strict site classes take the same stack sealed: EIB bakes OS, Kubernetes,
serving runtime, and the embedded artifact registry from one build
definition; runtime-pulled images must be listed by hand in the embedded
registry (parse-invisible otherwise). Where a hardware unidirectional
gateway carries the OT crossing, there is no return path by construction;
the evidence stream and any update path then ride the site's recorded
connectivity pattern, with the buffering consequence stated per site.
