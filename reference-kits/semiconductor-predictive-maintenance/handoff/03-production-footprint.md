# Production footprint — sourced hardware floors

Minimum specs from the SUSE product docs (SUSE Edge 3.6.0 / SUSE AI 1.0). These
are floors, not sizing — real sizing is a Stage-1 discovery deliverable. Numbers
without a customer input stay as ranges; do not invent node counts.

| Component | Minimum (per SUSE docs) |
|---|---|
| SUSE Linux Micro | 1 GB RAM / 20 GB disk (32 GB qcow2), UEFI only |
| K3s server | 2 CPU / 2 GB (single-server = SQLite, no HA) |
| K3s agent | 1 CPU / 512 MB |
| RKE2 | 2 vCPU / 4 GB (≈225 agents), SSD for etcd |
| Edge Image Builder (build host) | 4 GB RAM (8 GB rec.), `--privileged` |
| Elemental-onboarded node | TPM 2.0, UEFI x86-64, 25 GB volume |
| Rancher Prime mgmt (Small) | 4 vCPU / 16 GB per node, ≥3 nodes for HA |
| SUSE AI (Basic, per node) | 4 cores / 32 GB / 50 GB SSD |
| Ollama (real inference) | NVIDIA GPU, 16 GB+ RAM, CUDA 11.0+ |
| SUSE Security (NeuVector) | 2 cores / 2 GB / 5 GB + RWX 1–5 Gi |
| SUSE Storage (Longhorn) | 3 nodes, 4 vCPU / 4 GiB per node (multi-node only) |

## Two minimal reference footprints

**Smallest edge box (single-node, non-HA):** SL Micro (1 GB / 20 GB, UEFI) + K3s
single-server (SQLite, local-path) + the Losant GEA + the CPU inference tier +
NeuVector All-in-One (2 c / 2 GB). One EIB-built image, fully air-gapped.
Resilience model: reimage/re-register fast, not HA.

**HA edge site:** 3 nodes, K3s embedded-etcd or RKE2, + Longhorn 3-replica
storage. Decide this at image-build time.

## Where AI changes the number
If the customer needs models beyond the CPU control-chart tier, SUSE AI's floor
is **4 cores / 32 GB / 50 GB SSD per node plus a GPU**. That is the line item that
moves an edge-box budget into a small-server budget — call it out early so the
customer sizes power/cooling/GPU at the zone, and so the pilot doesn't promise a
laptop-class box for a GPU-class workload.

## Air-gapped delivery (fabs are usually disconnected)
- Edge platform: EIB bakes every image into the boot media; the node's embedded
  registry serves them locally. Watch charts that pull images at **runtime** —
  list them by hand in `embeddedArtifactRegistry.images` and set
  `systemDefaultRegistry`.
- SUSE AI: `SUSE-AI-get-images.sh` on a connected host → transfer → load into a
  local registry → `global.imageRegistry`.
- SUSE Security: mirror the images; refresh the CVE database by re-importing the
  Scanner image on a cadence.
