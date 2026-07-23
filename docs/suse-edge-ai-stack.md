# SUSE Edge & AI stack — sourced facts for building Proof Kits

Condensed from `suse-brain.md` (SUSE primary sources, dated 2026-06). The stack is
pinned per SUSE Edge release; **re-verify versions before quoting** — the current
pinned matrix here is **SUSE Edge 3.6.0**. This file is the grep-first reference
for the component map and footprint docs; for anything not here, grep the full
`suse-brain.md` (shared, ~1.5 MB — never read whole).

## Pinned matrix — SUSE Edge 3.6.0
SL Micro 6.2 · K3s 1.35.3 · RKE2 1.35.3 · Rancher Prime 2.14.1 · Longhorn (SUSE
Storage) 1.11.1 · NeuVector (SUSE Security) 5.5.1 · Metal3 0.15.0 · MetalLB
0.15.3 · Elemental 1.9.0 · Edge Image Builder 1.3.3.1 · KubeVirt 1.7.0 · Turtles/
CAPI 0.26.1 · System Upgrade Controller 0.19.1 · Upgrade Controller 0.1.3 ·
cert-manager 1.20.1. SUSE AI = **1.0** (separate cadence; base OS SLES 15 SP6 or
SL Micro 6.1).

## The components (role → footprint note)
- **SUSE Edge** — a curated, co-versioned set consumed as one release: SL Micro +
  K3s/RKE2 + Rancher Prime + Fleet + Elemental + Metal3/Turtles + EIB + Longhorn +
  NeuVector + MetalLB + lifecycle controllers. Two-tier: an RKE2 **management
  cluster** (Rancher/Fleet/Elemental) governs many **downstream** K3s/RKE2 edge
  clusters. Three provisioning patterns: phone-home (Elemental), image-based
  (EIB, air-gapped), directed bare-metal (Metal3/CAPI).
- **K3s** — single binary (<100 MB), containerd + Flannel + local-path. **Min 2
  CPU / 2 GB (server), 1 CPU / 512 MB (agent).** Default datastore = SQLite =
  single-server, no HA; HA needs embedded etcd (3) or external DB. **Datastore is
  baked in — decide HA before imaging.** CNCF Sandbox (not graduated).
- **RKE2** — hardened/CIS/FIPS; static-pod control plane; etcd datastore; Canal
  CNI. **Min 2 vCPU / 4 GB (~225 agents).** SUSE Edge steers to RKE2 unless etcd
  doesn't fit the constraints; the mgmt cluster runs RKE2.
- **Rancher Prime** — Helm workload on a cluster; downstream agents dial **out**
  (no inbound rule to the edge). Mgmt sizing Small 4 vCPU / 16 GB/node, ≥3 for HA.
  Prime = supported/hardened/FIPS builds from the SUSE registry; set
  `systemDefaultRegistry` for air-gapped.
- **Fleet** — GitOps; two-stage pull, all traffic originates from the managed
  cluster toward the controller (NAT/edge-friendly). `GitRepo`→`Bundle`→
  `BundleDeployment`; raw YAML/Helm/Kustomize all render to Helm.
- **Elemental** — phone-home onboarding; node boots seed image → registers →
  installs SL Micro → joins a cluster by label. Needs Rancher, TPM 2.0, UEFI
  x86-64, 25 GB. EIB can bake the registration in for zero-touch first boot.
- **Edge Image Builder (EIB)** — runs as a container; emits a Customized
  Ready-to-Boot ISO/RAW. Build host ≥4 GB (8 rec.), `--privileged`. Air-gap:
  embedded on-node registry + pre-pulled images; **runtime-pulled chart images
  are invisible to parsing — list them by hand** in `embeddedArtifactRegistry`.
- **SUSE Linux Micro** — immutable read-only Btrfs, A/B snapshots, SELinux on,
  Podman, no on-host image build. **Min 1 GB RAM / 20 GB disk (32 GB qcow2),
  UEFI only.** Delivered as a pre-built image, first boot via Ignition/Combustion.
- **SUSE AI** — a Helm-deployed curated set from the **SUSE Application
  Collection** (`dp.apps.rancher.io`): Open WebUI + Ollama/vLLM + Milvus (or
  OpenSearch/Qdrant) + NVIDIA GPU Operator (+ LiteLLM, MLflow, etc.). **Requires
  Rancher Prime + RKE2. Basic floor 4 c / 32 GB / 50 GB SSD per node; GPU required
  for real inference** (Ollama: NVIDIA GPU, CUDA 11+, 16 GB+ RAM). RAG stays in
  cluster (sovereignty). Single-node non-Rancher path = the Ansible Node Installer.
- **SUSE Security (NeuVector)** — Controller + per-node Enforcer (inline L7
  firewall) + Manager + Scanner. **All-in-One container for single-node** (2 c /
  2 GB / 5 GB + RWX 1–5 Gi). Two Helm charts (crd, core).
- **SUSE Storage (Longhorn)** — distributed block storage, **multi-node only** (3
  nodes for 3-replica HA; 4 vCPU / 4 GiB per node; open-iscsi + iscsid on every
  node). **Single-node edge uses K3s local-path, not Longhorn.**
- **Metal3 / Turtles** — directed bare-metal provisioning via BMC/Redfish; needs
  hosts reachable on the mgmt network (opposite of air-gapped/phone-home).

## SUSE Industrial Edge (the Losant OEM)
SUSE ships the **Losant Gateway Edge Agent** as SUSE Industrial Edge: OPC UA /
Modbus / serial ingest, a **local MQTT broker**, low-code **Edge Workflows**,
offline buffering, and an optional hosted SaaS layer that receives **derived,
non-sensitive data only** (never raw telemetry). The GEA is a **relay, not the
compute** — inference lives in the AI tier. Real open assets: `losant/edge-agent`
(Docker Hub), `losant-mqtt` (PyPI / github.com/Losant), `eea-examples`,
`workflow-node-catalog`, `losant-cli`, `losant-mcp-server`.

## Minimal footprints these facts support
- **Smallest edge box:** SL Micro (1 GB/20 GB, UEFI) + K3s single-server (SQLite,
  local-path) + optional NeuVector All-in-One. One EIB image, air-gapped.
- **HA edge site:** 3 nodes, K3s embedded-etcd or RKE2, + Longhorn.
- **Edge AI:** heavier — RKE2 + Rancher Prime + GPU node + Ollama/Milvus/Open WebUI
  (4 c / 32 GB / 50 GB floor, GPU mandatory). Not laptop-class.
