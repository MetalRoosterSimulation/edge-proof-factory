/**
 * Canonical seed content for the portal database.
 *
 * This file — not supabase/seed.sql — is the source of truth. Every fact here
 * is transcribed from the factory's own git-tracked docs (never invented, per
 * the factory's "no fabrication" rule):
 *   - proofKits / componentMap / scaleUpStages / footprintSpecs:
 *     reference-kits/semiconductor-predictive-maintenance/handoff/00-03*.md
 *   - ledgerPhases / openThreads: BUILD-LEDGER.md
 *
 * `npm run db:seed:generate` renders this into supabase/seed.sql. If you
 * update a kit's handoff docs or append a ledger phase, edit this file first
 * and regenerate — never hand-edit seed.sql, it will be overwritten.
 */

import type {
  ComponentMapRow,
  FootprintSpec,
  LedgerPhase,
  OpenThread,
  ProofKit,
  ScaleUpStage,
} from "@/lib/types";

export const proofKits: Omit<ProofKit, "id" | "created_at">[] = [
  {
    slug: "semiconductor-predictive-maintenance",
    name: "Semiconductor predictive maintenance — edge AI",
    partner: "Technologent",
    customer: "Microchip Technology",
    industry: "Semiconductor manufacturing",
    use_case:
      "OT telemetry -> Losant Gateway Edge Agent -> on-prem inference (health score + RUL + sensor attribution) -> ops dashboard, with raw telemetry held inside the fab and only derived scores allowed to leave.",
    status: "built-and-verified",
    summary:
      "The fully-worked reference Proof Kit: a runnable minimal-footprint MVP plus the partner hand-off. Losant (SUSE Industrial Edge) is a first-class tier of the running demo, and Rancher is wired via an MCP server with live Fleet GitOps.",
    demo_path: "reference-kits/semiconductor-predictive-maintenance/demo",
    repo_url: "https://github.com/MetalRoosterSimulation/edge-proof-factory",
  },
];

export const componentMap: Omit<ComponentMapRow, "id">[] = [
  {
    kit_slug: "semiconductor-predictive-maintenance",
    demo_component: "sensor-simulator",
    role: "Stands in for PLC / OPC UA / Modbus device outputs",
    production_component: "The fab's real equipment + protocol adapters",
    pinned_version: "n/a (customer OT)",
    sort_order: 0,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    demo_component:
      "mosquitto + gateway-edge-agent (runs the real losant-mqtt SDK)",
    role: "Local broker, normalize, offline-buffer, governed egress",
    production_component:
      "SUSE Industrial Edge — Losant Gateway Edge Agent (losant/edge-agent) running an Edge Workflow",
    pinned_version: "Losant GEA (SUSE OEM)",
    sort_order: 1,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    demo_component: "k3d (k3s in Docker), single node",
    role: "Edge Kubernetes",
    production_component:
      "SUSE Edge: K3s on SUSE Linux Micro; RKE2 where CIS/FIPS is required",
    pinned_version: "SL Micro 6.2 - K3s 1.35.3 - RKE2 1.35.3",
    sort_order: 2,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    demo_component: "(manual node)",
    role: "Immutable edge OS",
    production_component:
      "SUSE Linux Micro (read-only Btrfs, A/B, SELinux)",
    pinned_version: "6.2",
    sort_order: 3,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    demo_component: "(n/a in demo)",
    role: "Remote onboarding / phone-home",
    production_component: "Elemental (+ Edge Image Builder to bake the boot image)",
    pinned_version: "Elemental 1.9.0 - EIB 1.3.3.1",
    sort_order: 4,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    demo_component: "edge-inference (CPU control-chart model)",
    role: "On-prem health scoring + RUL",
    production_component: "SUSE AI: Ollama/vLLM + Milvus (+ heavier model), on a GPU node",
    pinned_version: "SUSE AI 1.0",
    sort_order: 5,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    demo_component: "ollama + open-webui (open images)",
    role: "Local GenAI assistant",
    production_component:
      "SUSE AI — the identical Ollama + Open WebUI, from the SUSE Application Collection (dp.apps.rancher.io)",
    pinned_version: "SUSE AI 1.0",
    sort_order: 6,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    demo_component: "kubectl / kustomize",
    role: "Deploy",
    production_component: "Rancher Prime + Fleet GitOps",
    pinned_version: "Rancher Prime 2.14.1",
    sort_order: 7,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    demo_component: "NetworkPolicy (k3s default)",
    role: "Runtime security",
    production_component:
      "SUSE Security (NeuVector) — inline L7 enforcement; All-in-One for single node",
    pinned_version: "NeuVector 5.5.1",
    sort_order: 8,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    demo_component: "emptyDir / k3s local-path",
    role: "Storage",
    production_component:
      "Single node: local-path (bundled). Multi-node: SUSE Storage (Longhorn)",
    pinned_version: "Longhorn 1.11.1",
    sort_order: 9,
  },
];

export const scaleUpStages: Omit<ScaleUpStage, "id">[] = [
  {
    kit_slug: "semiconductor-predictive-maintenance",
    stage_number: 0,
    title: "The laptop demo (this kit)",
    body_md:
      "Single-node k3s (k3d), all-open images, CPU only. Proves the pattern end to end. [P] Run `make up`; walk the customer through a live fault + the governance boundary — no customer hardware, no entitlement, no fab access needed. Exit: the customer agrees the pattern fits a named tool/zone.",
    sort_order: 0,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    stage_number: 1,
    title: "One real edge box (PILOT)",
    body_md:
      "Move the same workloads onto one physical edge node in one fab zone. [P] Build a SUSE Edge boot image with Edge Image Builder (SL Micro 6.2 + K3s single-server + the kit's manifests, air-gapped). [P] Deploy the Losant Gateway Edge Agent against the zone's real OPC UA / Modbus feeds. [P/S] Stand up the inference tier — size the GPU here, not before, if SUSE AI is needed. [P] Add SUSE Security (NeuVector) All-in-One. [C] Provide the edge node and OT network path. Exit: real sensor data scored on real hardware; offline buffering and the governance boundary verified with the customer's security team.",
    sort_order: 1,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    stage_number: 2,
    title: "Production hardening, one zone (ROLL OUT)",
    body_md:
      "[P] Decide HA now — rebuild on K3s embedded-etcd (3 nodes) or RKE2 with SUSE Storage (Longhorn) if the zone needs it; the datastore is baked into the image and cannot be a config flip later. [P] Stand up Rancher Prime as the management cluster; import the edge cluster (downstream agents dial out, no inbound firewall rule to the fab). [P] Put the kit manifests in Git; deploy via Fleet. Exit: the zone runs on the SUSE-supported stack, fleet-managed, GitOps-driven.",
    sort_order: 2,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    stage_number: 3,
    title: "Scale to the fab / many sites (DAY 2 & SCALE)",
    body_md:
      "[P] Onboard new nodes/zones with Elemental phone-home — no per-site hands-on. [P] Roll the same Fleet GitRepo to a ClusterGroup; new sites converge automatically (renewal grows per site, not just per year). [P] Day-2: Upgrade Controller for staged OS + K8s upgrades; Losant cross-site dashboards. [S] Deal-registration and support wrap across the fleet. Exit: steady-state managed fleet; each new tool/zone is a repeatable unit.",
    sort_order: 3,
  },
];

export const footprintSpecs: Omit<FootprintSpec, "id">[] = [
  {
    kit_slug: "semiconductor-predictive-maintenance",
    component: "SUSE Linux Micro",
    minimum_spec: "1 GB RAM / 20 GB disk (32 GB qcow2), UEFI only",
    sort_order: 0,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    component: "K3s server",
    minimum_spec: "2 CPU / 2 GB (single-server = SQLite, no HA)",
    sort_order: 1,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    component: "K3s agent",
    minimum_spec: "1 CPU / 512 MB",
    sort_order: 2,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    component: "RKE2",
    minimum_spec: "2 vCPU / 4 GB (~225 agents), SSD for etcd",
    sort_order: 3,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    component: "Edge Image Builder (build host)",
    minimum_spec: "4 GB RAM (8 GB rec.), --privileged",
    sort_order: 4,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    component: "Elemental-onboarded node",
    minimum_spec: "TPM 2.0, UEFI x86-64, 25 GB volume",
    sort_order: 5,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    component: "Rancher Prime mgmt (Small)",
    minimum_spec: "4 vCPU / 16 GB per node, >=3 nodes for HA",
    sort_order: 6,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    component: "SUSE AI (Basic, per node)",
    minimum_spec: "4 cores / 32 GB / 50 GB SSD",
    sort_order: 7,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    component: "Ollama (real inference)",
    minimum_spec: "NVIDIA GPU, 16 GB+ RAM, CUDA 11.0+",
    sort_order: 8,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    component: "SUSE Security (NeuVector)",
    minimum_spec: "2 cores / 2 GB / 5 GB + RWX 1-5 Gi",
    sort_order: 9,
  },
  {
    kit_slug: "semiconductor-predictive-maintenance",
    component: "SUSE Storage (Longhorn)",
    minimum_spec: "3 nodes, 4 vCPU / 4 GiB per node (multi-node only)",
    sort_order: 10,
  },
];

export const ledgerPhases: Omit<LedgerPhase, "id">[] = [
  {
    phase_number: 0,
    title: "Research swarm",
    status: "done",
    body_md:
      "Four agents read the two sibling factories, the shared suse-brain.md (Edge/AI product facts + version matrix), and the partner motion/economics. Confirmed the gap: both factories produce paper; no runnable MVP or hand-off existed anywhere in ~/Work. Semiconductor predictive-maintenance chosen as the reference use case (Technologent / Microchip Technology).",
    done_date: null,
  },
  {
    phase_number: 1,
    title: "The runnable MVP (reference kit)",
    status: "done",
    body_md:
      "Stood up a real single-node k3s cluster (k3d, v1.35.5). Built the edge-inference model (EWMA-smoothed multivariate control chart, Hotelling T^2 / Mahalanobis SPC, frozen Welford baseline, health score + trend-extrapolated RUL + sensor attribution — pure Python/stdlib, 9/9 unit tests, CPU-only), the sensor-simulator (synthetic plasma-etch telemetry with three fault signatures), and a self-contained ops dashboard. Verified end to end live: healthy fleet reads 6x100; injected fault degrades WATCH -> WARNING -> CRITICAL with RUL counting to 0 and correct sensor attribution.",
    done_date: null,
  },
  {
    phase_number: 2,
    title: "Losant / SUSE Industrial Edge as a first-class tier",
    status: "done",
    body_md:
      "Inserted a gateway-edge-agent (Losant GEA) tier as the single governed egress point: raw OT telemetry -> normalize + offline-buffer -> inference -> derived health -> gateway forwards only derived scores to Losant via the real losant-mqtt SDK. Raw telemetry structurally cannot leave. Verified live: gateway withheld 100% of raw frames in air-gapped mode.",
    done_date: null,
  },
  {
    phase_number: 3,
    title: "SUSE AI profile",
    status: "done",
    body_md:
      "`make ai` adds Ollama + Open WebUI (real Application Collection components) and an on-prem /api/explain/<tool> endpoint with a graceful fallback when the AI tier is off. Optional profile — the base kit stays CPU/laptop-class.",
    done_date: null,
  },
  {
    phase_number: 4,
    title: "Rancher MCP server",
    status: "done",
    body_md:
      "Built integrations/rancher-mcp-server/ — a Node/stdio MCP server with 10 tools (list clusters/nodes/projects/namespaces/workloads/fleet, deploy-via-Fleet, import-cluster). Mock mode for offline testing; selftest green on the full stdio handshake.",
    done_date: null,
  },
  {
    phase_number: 5,
    title: "Hand-off kit + factory scaffolding",
    status: "done",
    body_md:
      "Wrote the hand-off kit (00 runbook, 01 component map, 02 scale-up path, 03 production footprint) and the reusable factory machine: START-HERE, CLAUDE.md, RUN.md, docs (project-brief, suse-edge-ai-stack, handoff-doctrine, footprint-rules), templates, and tools/validate_kit.py. Verification: model unit tests 9/9, validate_kit.py 15 pass / 0 warn / 0 fail, Rancher MCP selftest all pass, cold make up end-to-end with live fault + governance proof.",
    done_date: null,
  },
  {
    phase_number: 6,
    title: "Live Rancher wiring",
    status: "done",
    body_md:
      "Connected to a local Rancher Community v2.13.3 instance. Debugged two 401'ing tokens (missing token- prefix); the client and wire-rancher.sh now auto-add the prefix. Imported the k3d edge-mvp cluster into Rancher; verified via the MCP server in real mode that rancher_list_clusters shows edge-mvp active and rancher_list_workloads reads all four kit deployments 1/1 through Rancher's k8s proxy.",
    done_date: "2026-07-23",
  },
  {
    phase_number: 7,
    title: "Fleet GitOps + public repo + run guide",
    status: "done",
    body_md:
      "Published the factory to github.com/MetalRoosterSimulation/edge-proof-factory. Created a Fleet GitRepo targeting the imported cluster. Resolved a Helm-adoption ownership conflict by deleting the hand-applied namespace and force-syncing. Fleet redeployed cleanly: readyClusters 1/1, genuinely GitOps-owned. Added HOW-TO-RUN-THIS-DEMO.md.",
    done_date: "2026-07-23",
  },
  {
    phase_number: 8,
    title: "Durable re-import",
    status: "done",
    body_md:
      "Fixed two re-import failure modes: added fleet.yaml with helm.takeOwnership so Fleet adopts resources a local make up already deployed, and rewrote wire-rancher.sh to detect and clean up an orphaned cluster object before re-importing. Verified end to end: tore down and rebuilt the k3d cluster, ran wire-rancher.sh once, reached 1/1 with confirmed adoption (pods kept their pre-Fleet age and gained Helm labels).",
    done_date: "2026-07-23",
  },
  {
    phase_number: 9,
    title: "SUSE AI tier under Fleet + explain endpoint",
    status: "done",
    body_md:
      "Fixed a Fleet bundle-scoping failure (a GitRepo path can't reference ../base) by making k8s/ai self-contained and additive with its own Helm release. /api/explain now returns a clear 'AI tier not reachable, run make ai' note instead of a raw errno. Verified live: injected an rf_match_drift fault and /api/explain/etch-03 returned a real qwen2.5:0.5b explanation naming the anomaly, on-prem, no data leaving the cluster.",
    done_date: "2026-07-23",
  },
  {
    phase_number: 10,
    title: "Factory Portal — Vercel + Supabase",
    status: "done",
    body_md:
      "Built a read-only Next.js 16 portal (this app) that surfaces the proof kit catalog, component maps, scale-up paths, footprint specs, and this build ledger from a dedicated Supabase Postgres project, deployed to Vercel. The k3s/Rancher demo itself is unchanged and cannot run on Vercel (serverless has no persistent cluster) — the portal is a presentation layer on top, not a replacement. Schema, seed data (transcribed from the existing handoff docs and this ledger, not invented), RLS policies, and the full test suite were built and verified against a local Supabase stack before any cloud resources were requested. Research/competitor-analysis phase was explicitly dropped from scope by user direction; the portal is being built directly. Live: Supabase project \"edge-ai-demo\" (ref vpdtwiyvatpwzkapvmcl, us-east-1, free tier) provisioned via the Supabase MCP server (OAuth, no token pasted anywhere); schema + seed applied and verified (zero security advisories). Deployed to Vercel via the deploy_to_vercel MCP tool (a one-shot file upload, not git-integrated CI) at https://edge-ai-demo.vercel.app — all three routes (/, /ledger, /kits/semiconductor-predictive-maintenance) fetched directly and confirmed serving real data from the hosted project.",
    done_date: "2026-07-23",
  },
];

export const openThreads: Omit<OpenThread, "id" | "created_at">[] = [
  {
    description:
      "Additional reference kits (other use-case-library patterns) on demand via RUN.md.",
    status: "open",
  },
  {
    description:
      "Portal is served via a one-shot Vercel file deploy (MCP deploy_to_vercel), not git-integrated CI, and has no custom domain. Recommended durable follow-up: Import Git Repository in the Vercel dashboard to connect it to github.com/MetalRoosterSimulation/edge-proof-factory (root directory portal/) so future commits auto-deploy, and add NEXT_PUBLIC_SUPABASE_URL/ANON_KEY as dashboard env vars at that point (the Vercel MCP server has no env-var API).",
    status: "open",
  },
];
