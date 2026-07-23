# BUILD-LEDGER — Edge Proof Factory

Chronological record of how this was built. Newest phase last.

## Mandate
Help SI partners *build* with SUSE on Edge/AI use cases: demo a working end-to-end
MVP with as few resources as possible, then hand off so the partner can rebuild on
their own limited hardware. Neither sibling factory (BD messaging, use-case
architecture) produces a runnable artifact — this one does. See `docs/project-brief.md`.

## Locked decisions
- Output = a **Proof Kit**: `demo/` (runnable MVP) + `handoff/` (rebuild kit).
- Demo = 100% openly-pullable images, single-node k3s (k3d), CPU-only, laptop-class.
- Proof before ship: `make up` on a fresh cluster + live failure exercise + unit
  tests + `tools/validate_kit.py`, all green.
- Honest hand-off: sourced SUSE versions (Edge 3.6.0 matrix) + real hardware floors;
  never sell the laptop footprint as production. Pilot's-manual voice.

## Phase 0 — research swarm
Four agents read the two sibling factories, the shared `suse-brain.md` (Edge/AI
product facts + version matrix), and the partner motion/economics. Confirmed the
gap: both factories produce paper; no runnable MVP or hand-off exists anywhere in
`~/Work`. Semiconductor predictive-maintenance chosen as the reference use case
(full architecture already exists in both factories; Technologent/Microchip).

## Phase 1 — the runnable MVP (reference kit)
- Environment: docker + k3d + kubectl + helm (installed to ~/.local/bin); a real
  single-node k3s cluster (v1.35.5) stood up in-session.
- `edge-inference` model: an EWMA-smoothed multivariate control chart (Hotelling
  T² / Mahalanobis SPC) with frozen Welford baseline, 2σ control-limit offset,
  health score + trend-extrapolated RUL + sensor attribution. Pure-Python/stdlib,
  unit-tested on the host (9/9). CPU-only.
- `sensor-simulator`: synthetic plasma-etch telemetry with three physical fault
  signatures, live fault injection over MQTT.
- Dashboard: self-contained fab-console (0 external resources), live polling,
  client-side sparklines.
- Built 3 images, imported to k3d, deployed via kustomize (namespace fab-edge),
  NodePort dashboard on host :18080. Verified end-to-end live: healthy fleet reads
  6×100; injected fault degrades WATCH→WARNING→CRITICAL with RUL counting to 0 and
  correct sensor attribution. Screenshot captured to handoff/assets.

## Phase 2 — Losant / SUSE Industrial Edge as a first-class tier (user request)
Rewired the flow to insert a **gateway-edge-agent** (Losant GEA) tier: raw OT
telemetry (`fab-devices/+/raw`) → normalize + offline-buffer → `fab/+/telemetry`
→ inference → derived `fab/+/health` → gateway is the single **governed egress**
point, forwarding only derived scores to the Losant platform via the real
`losant-mqtt` SDK. Raw telemetry structurally cannot leave. Two fidelity levels
(SDK egress; genuine `losant/edge-agent` drop-in) + an importable Losant Edge
Workflow. Verified live: gateway withheld 100% of raw frames in air-gapped mode.

## Phase 3 — SUSE AI profile
`make ai` adds Ollama + Open WebUI (the real Application Collection components) and
an on-prem `/api/explain/<tool>` endpoint (graceful fallback when off). Optional
profile — base stays CPU/laptop-class.

## Phase 4 — Rancher MCP server (user request)
`integrations/rancher-mcp-server/` — a Node/stdio MCP server, 10 tools (list
clusters/nodes/projects/namespaces/workloads/fleet, deploy-via-Fleet,
import-cluster). Mock mode for offline testing; selftest green (full stdio
handshake). Ready to point at a real Rancher via `.rancher-env`. Wires the demo to
be Rancher-managed end to end (import cluster + Fleet GitRepo).

## Phase 5 — hand-off kit + factory scaffolding
`handoff/`: 00 runbook, 01 component-map (open→SUSE, Edge 3.6.0 versions), 02
scale-up path (four services phases), 03 production footprint (sourced floors).
Factory: START-HERE, CLAUDE, RUN, docs (project-brief, suse-edge-ai-stack,
handoff-doctrine, footprint-rules), templates, `tools/validate_kit.py`.

## Verification
- Model unit tests: 9/9.
- `tools/validate_kit.py`: 15 pass, 0 warn, 0 fail.
- Rancher MCP selftest: ALL PASS.
- Cold `make up` end-to-end, dashboard reachable on host, live fault + governance
  proven.

## Phase 6 — live Rancher wiring (done 2026-07-23)
Connected to a local Rancher Community **v2.13.3** instance (LAN).
Token debugging: first two tokens 401'd (`X-Api-Cattle-Auth: false`) — a
mis-copied secret and a missing `token-` prefix; the client + `scripts/wire-
rancher.sh` now auto-add the prefix and accept split access/secret keys. The
third (clean copy of the Bearer Token field) authenticated as admin. Imported the
k3d `edge-mvp` cluster into Rancher (`c-c24cf`) via `wire-rancher.sh`: created the
imported cluster, applied the cattle-cluster-agent manifest to k3d, cluster
reached **active**. Verified via the MCP server in real mode: `rancher_list_
clusters` shows edge-mvp active, and `rancher_list_workloads c-c24cf fab-edge`
reads all four kit deployments 1/1 through Rancher's k8s proxy. Fixed a manifestUrl
race in the script (Rancher populates it asynchronously — now polls).

## Phase 7 — Fleet GitOps + public repo + run guide (done 2026-07-23)
Published the factory to a public GitHub repo
`github.com/MetalRoosterSimulation/edge-proof-factory` (committed clean — no
secrets; `.gitignore` verified). Created a Fleet `GitRepo` (`fleet-default/
edge-proof-kit`) targeting the imported `edge-mvp` cluster (`c-c24cf`), pointed at
`reference-kits/semiconductor-predictive-maintenance/demo/k8s/base`. First install
hit the expected ownership conflict (the namespace already existed from the earlier
`kubectl apply` — Helm won't adopt: `missing key app.kubernetes.io/managed-by`);
resolved by deleting the hand-applied `fab-edge` namespace and force-syncing. Fleet
redeployed cleanly: **readyClusters 1/1**, pods carry `managed-by: Helm` +
`objectset.rio.cattle.io/hash` — genuinely GitOps-owned (git push -> Fleet ->
cluster). Added `HOW-TO-RUN-THIS-DEMO.md` (foolproof run guide). Note: GitHub
create/push must be run by the user — the sandbox classifier blocks the agent from
using a token file against api.github.com (`scripts/`-style helper written for the
user to run).

## Phase 8 — durable re-import (done 2026-07-23)
Recreating the k3d cluster (`make down`/`up`) orphaned the Rancher object — a fresh
k3d cluster can't reattach to the old imported-cluster identity, and Fleet re-hit
the namespace-ownership conflict. Two durable fixes: (1) added
`reference-kits/.../demo/k8s/base/fleet.yaml` with `helm.takeOwnership: true` +
`releaseName: edge-proof-kit` so Fleet ADOPTS resources a local `make up` already
deployed instead of erroring; (2) rewrote `scripts/wire-rancher.sh` to detect a
non-active (orphaned) cluster object, delete it + its stale GitRepo + leftover
agent namespaces, import fresh, and then deploy the Fleet GitRepo and poll to 1/1
— all one command. `bash -n` clean. NOTE: fleet.yaml only takes effect once pushed
to GitHub (Fleet pulls from the repo).

**VERIFIED end to end 2026-07-23:** pushed fleet.yaml, then tore down + `make up`
fresh (fab-edge deployed by kubectl, no Helm labels) and ran `wire-rancher.sh`
once. It auto-created a fresh cluster (`c-mvnq2`), reached active, deployed the
GitRepo, and hit **1/1**. Confirmed adoption (not recreate): pods kept their
pre-Fleet age (3m16s = the `make up` pods) and gained `managed-by: Helm` +
`objectset.rio.cattle.io/hash`. No namespace deletion, no force-sync needed — the
exact dance that failed twice before. Dashboard 200, fleet healthy.

## Open threads
- Doc/script commits (Phases 7-8) are committed locally; re-run the publish helper
  to push them (agent can't push — sandbox blocks token+GitHub). After the push,
  re-run `wire-rancher.sh` once to prove the one-command re-import/takeOwnership flow.
- Additional reference kits (other use-case-library patterns) on demand via RUN.md.
