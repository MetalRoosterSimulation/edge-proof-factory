# Production footprint — sourced hardware floors

Floors, not sizing. Real sizing is a Stage-1 discovery deliverable driven
by the customer's campaign volumes and outage tolerance — do not invent
node counts. Versions and floors per the SUSE Edge 3.6.1 matrix notes in
`docs/suse-edge-ai-stack.md`; re-verify before a build.

| Component | Minimum (per SUSE docs) |
|---|---|
| SUSE Linux Micro 6.2 | 1 GB RAM / 20 GB disk, UEFI only |
| K3s 1.35.4 (single server) | 2 CPU / 2 GB (server); default SQLite datastore = no HA |
| K3s embedded etcd (HA) | 3 servers — decide before imaging |
| RKE2 1.35.4 (hardened path) | 2 vCPU / 4 GB |
| Rancher Prime 2.14.2 management cluster | Small profile 4 vCPU / 16 GB per node, ≥3 nodes for HA |
| SUSE Security (NeuVector) 5.5.2 All-in-One (single-node site) | 2 CPU / 2 GB / 5 GB + RWX 1–5 Gi |
| SUSE Storage (Longhorn) 1.11.2 | Multi-node only: 3 nodes for 3-replica HA, 4 vCPU / 4 GiB per node; single-node sites use K3s local-path |
| Edge Image Builder 1.3.3.1 build host | ≥4 GB RAM (8 recommended), runs as a privileged container |

## Two minimal reference footprints

**Smallest edge box (single-node, non-HA):** SL Micro (1 GB/20 GB, UEFI) +
K3s single-server (SQLite, local-path) + NeuVector All-in-One, delivered as
one EIB image with the embedded registry — the corridor site shape this
kit demonstrates. Working-storage capacity is sized from campaign volume ×
longest tolerated WAN outage, per the discovery inputs; the demo's 24 MB
limit is a teaching number, not a floor.

**HA edge site:** 3 nodes, K3s embedded-etcd or RKE2, plus Longhorn
(1.11.2) for replicated working storage — for sites whose campaign cadence
or evidence obligations do not tolerate a single-node loss window.

## Where AI changes the number

This use case carries no LLM tier, so SUSE AI's floors do not apply.
Production-rate vision scoring requires a GPU node scheduled via the NVIDIA
GPU Operator; the GPU model and count depend on the chosen vision pipeline
and the customer's images-per-campaign — a discovery deliverable, never a
quote from this kit. The demo's CPU scorer proves the pipeline, not the
throughput.

## Air-gapped delivery

Fully sealed sites (no WAN) take the same stack: EIB bakes OS, Kubernetes,
workloads, and the embedded artifact registry from one build definition, so
the node never reaches the internet; runtime-pulled images must be listed
by hand in the embedded registry (parse-invisible otherwise). Updates and
evidence move on a scheduled bidirectional media cadence — recorded
per site, with the compliance-latency consequence stated to the customer.
