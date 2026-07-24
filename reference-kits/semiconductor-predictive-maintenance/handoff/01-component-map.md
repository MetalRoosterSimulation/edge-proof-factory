# Component map — demo stack → SUSE-supported production stack

Every component in the demo is openly pullable so the demo runs with no
entitlement. This table is the swap list for production. Versions are the
**SUSE Edge 3.6.0** support matrix (re-verify against the current SUSE Edge
release note before a build — the matrix is pinned per release).

| Demo component (open) | Role in the use case | Production SUSE component | Pinned version (Edge 3.6.0) |
|---|---|---|---|
| `sensor-simulator` | Stands in for PLC / OPC UA / Modbus device outputs | The fab's real equipment + protocol adapters | n/a (customer OT) |
| `mosquitto` + `gateway-edge-agent` (runs the real `losant-mqtt` SDK) | Local broker, normalize, offline-buffer, governed egress | **SUSE Industrial Edge** — Losant Gateway Edge Agent (`losant/edge-agent`) running an Edge Workflow | Losant GEA (SUSE OEM) |
| `k3d` (k3s in Docker), single node | Edge Kubernetes | **SUSE Edge**: **K3s** on **SUSE Linux Micro**; **RKE2** where CIS/FIPS is required | SL Micro 6.2 · K3s 1.35.3 · RKE2 1.35.3 |
| (manual node) | Immutable edge OS | **SUSE Linux Micro** (read-only Btrfs, A/B, SELinux) | 6.2 |
| (n/a in demo) | Remote onboarding / phone-home | **Elemental** (+ Edge Image Builder to bake the boot image) | Elemental 1.9.0 · EIB 1.3.3.1 |
| `edge-inference` (CPU control-chart model) | On-prem health scoring + RUL | **SUSE AI**: Ollama/vLLM + Milvus (+ heavier model), on a GPU node | SUSE AI 1.0 |
| `ollama` + `open-webui` (open images) | Local GenAI assistant | **SUSE AI** — the identical Ollama + Open WebUI, from the **SUSE Application Collection** (`dp.apps.rancher.io`) | SUSE AI 1.0 |
| `kubectl` / kustomize | Deploy | **Rancher Prime** + **Fleet** GitOps | Rancher Prime 2.14.1 |
| `NetworkPolicy` (always on) + **NeuVector deployed by `make security`** | Runtime security | **SUSE Security (NeuVector)** — inline L7 enforcement; All-in-One for single node. The demo deploys the real product (chart 2.10.2); Protect-mode enforcement requires non-nested k3s — on k3d the NetworkPolicy is the enforced boundary (see LAB-SETUP §6) | NeuVector 5.5.2 |
| `emptyDir` / k3s local-path | Storage | Single node: **local-path** (bundled). Multi-node: **SUSE Storage (Longhorn)** | Longhorn 1.11.1 |

## Notes that change a build decision

- **K3s vs RKE2.** SUSE Edge steers to **RKE2 unless an etcd datastore does not
  fit the constraints** (then K3s). K3s single-server uses embedded SQLite = no
  HA; converting SQLite→etcd later is a disruptive reinstall. **Decide HA per
  site before you build the image** — the datastore is baked in. (K3s min: 2 CPU
  / 2 GB. RKE2 min: 2 vCPU / 4 GB.)
- **SUSE AI is not a tiny footprint.** Its own floor is **4 cores / 32 GB / 50 GB
  SSD per node, and a GPU is required for real inference** (Ollama needs an NVIDIA
  GPU, CUDA 11+, 16 GB+ RAM). The demo's CPU control-chart model is the honest
  minimal-footprint analog; do not represent the laptop model as SUSE AI's
  production footprint. A single-node non-Rancher SUSE AI path exists (the
  Ansible Node Installer).
- **The GEA is a relay, not the compute.** In both the demo and production the
  health score is computed in the inference tier, never in the gateway. Keep it
  that way when you build the Edge Workflow.
- **Governance is structural.** Only derived scores cross the egress boundary
  (the demo proves this at the gateway `/stats`). Preserve that split in
  production: raw telemetry stays inside the fab control boundary; the Losant
  hosted layer receives derived health only. This is the sovereignty claim you
  sell.
- **Storage.** A single-box edge site uses K3s local-path; **Longhorn is for
  multi-node** (3 nodes for a 3-replica volume). Don't put Longhorn on a
  single-node site.
