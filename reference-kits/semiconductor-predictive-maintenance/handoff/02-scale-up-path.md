# Scale-up path — laptop demo → fab-floor fleet

Four stages. Each is a real deliverable the partner bills as a services phase
(ASSESS → PILOT → ROLL OUT → DAY 2 & SCALE). Owner tags: **[P]** partner,
**[S]** SUSE, **[C]** customer.

## Stage 0 — the laptop demo (this kit)
Single-node k3s (k3d), all-open images, CPU only. Proves the pattern end to end.
- **[P]** Run `make up`; walk the customer through a live fault + the governance
  boundary. No customer hardware, no entitlement, no fab access needed.
- Exit: the customer agrees the pattern fits a named tool/zone.

## Stage 1 — one real edge box (PILOT)
Move the same workloads onto one physical edge node in one fab zone.
- **[P]** Build a **SUSE Edge** boot image with **Edge Image Builder**: SL Micro
  6.2 + K3s (single-server, SQLite, local-path) + the kit's Helm/manifests +
  pre-pulled images, in air-gapped (embedded-registry) mode. Host to build:
  ≥8 GB RAM, `--privileged`.
- **[P]** Deploy the **Losant Gateway Edge Agent** with the predictive-maintenance
  Edge Workflow; point it at the zone's real OPC UA / Modbus feeds.
- **[P/S]** Stand up the inference tier. If the model stays lightweight, keep it
  on CPU; if the customer needs heavier models, this is where **SUSE AI** (GPU
  node) enters — size the GPU in this stage, not before.
- **[P]** Add **SUSE Security (NeuVector)** All-in-One (2 c / 2 GB) for runtime
  enforcement on the node.
- **[C]** Provide the edge node (SL Micro min: 1 GB RAM / 20 GB disk, UEFI, TPM
  2.0 for Elemental onboarding) and the OT network path.
- Exit: real sensor data scored on real hardware; a simulated-disconnect test
  proves the GEA's offline buffering; governance boundary verified with the
  customer's security team.

## Stage 2 — production hardening, one zone (ROLL OUT)
- **[P]** Decide **HA now** — if the zone needs it, rebuild on K3s embedded-etcd
  (3 nodes) or RKE2, with **SUSE Storage (Longhorn)** 3-replica volumes. The
  datastore is baked into the image; this cannot be a config flip later.
- **[P]** Stand up **Rancher Prime** as the management cluster (RKE2, ≥3 nodes for
  HA, small = 4 vCPU / 16 GB/node) in the data-center zone; import the edge
  cluster. Downstream agents dial **out** — no inbound firewall rule to the fab.
- **[P]** Put the kit manifests in Git; deploy via **Fleet** (`GitRepo` →
  `Bundle`), all traffic originating from the edge toward the controller.
- Exit: the zone runs on the SUSE-supported stack, fleet-managed, GitOps-driven.

## Stage 3 — scale to the fab / many sites (DAY 2 & SCALE)
- **[P]** Onboard new nodes/zones with **Elemental** phone-home — a device
  auto-registers on first boot from the EIB-baked image; selected into a cluster
  by label. No per-site hands-on.
- **[P]** Roll the same Fleet `GitRepo` to a `ClusterGroup`; new sites converge to
  the proven pattern automatically. Renewal/annuity grows **per site**, not just
  per year.
- **[P]** Day-2: **Upgrade Controller** / System Upgrade Controller for staged OS
  + K8s upgrades; Losant cross-site dashboards for the derived fleet view.
- **[S]** Deal-registration and support wrap across the fleet.
- Exit: steady-state managed fleet; each new tool/zone is a repeatable unit, and
  each new use case is a second workflow layered on the same footprint.

## The one rule that spans all stages
Decide **HA (the datastore)** and **GPU (SUSE AI vs CPU model)** at image-build
time. Both are baked in and expensive to change after the fact. Everything else —
the workflow, the manifests, the model contract — is unchanged from laptop to
fleet, which is why the Stage-0 demo is a faithful proof and not a throwaway.
