# Partner hand-off runbook — build it yourself

You watched the demo. This is the sheet you run to rebuild it on your own
hardware, then take it to production. Facts and steps only. Owner tags: **[P]**
partner, **[S]** SUSE, **[C]** customer.

## What you were shown
A single-node k3s cluster running the full use case: OT telemetry → Losant
Gateway Edge Agent → on-prem inference (health score + RUL + sensor attribution)
→ ops dashboard, with raw telemetry held inside the fab and only derived scores
allowed to leave. Every image was openly pullable — no entitlement required.

## Rebuild the demo (any laptop, ~15 min)
1. **[P]** Install `docker`, `k3d`, `kubectl`.
2. **[P]** Clone this kit; `cd reference-kits/semiconductor-predictive-maintenance/demo`.
3. **[P]** `make up` → open `http://localhost:18080`.
4. **[P]** `make fault TOOL=etch-03`, watch it degrade; `make heal TOOL=etch-03`.
5. **[P]** `make test` to see the model's unit tests pass.
You now own a running reference you can show any customer, offline, in minutes.

## Turn it into a customer pilot
6. **[P]** Read `01-component-map.md` — swap each open component for its
   SUSE-supported equivalent. Nothing else in the topology changes.
7. **[P]** Read `02-scale-up-path.md` — it is your four-phase services plan
   (ASSESS → PILOT → ROLL OUT → DAY 2 & SCALE), each phase already scoped.
8. **[P]** Read `03-production-footprint.md` before you quote hardware. Two
   decisions are baked in at image-build time and expensive to change: **HA
   (the K3s/RKE2 datastore)** and **GPU (SUSE AI vs the CPU model)**. Resolve
   both in Stage 1, not after.
9. **[S]** SUSE Industrial Edge / GEA is new to SUSE's field too — engagement 1
   is a joint build with the SUSE field team; you lead engagements 2–3 with SUSE
   support; steady state is in-house. Book SUSE pre-sales for the first pilot.
10. **[C]** The customer provides the edge node, the OT network path to the
    tool's OPC UA / Modbus feeds, and the security team for the governance review.

## Connect the real products (when you have accounts)
11. **[P]** Losant platform: `k8s/losant/README.md` — either connect the
    gateway's real `losant-mqtt` egress (`make losant`) or swap in the genuine
    `losant/edge-agent` running the imported Edge Workflow.
12. **[P]** SUSE AI: `make ai` adds the real Ollama + Open WebUI (Application
    Collection components) and the on-prem "explain this anomaly" endpoint.
13. **[P]** Rancher: import the cluster and deploy via Fleet — the Rancher MCP
    server (`integrations/rancher-mcp-server/`) lets an AI assistant see the
    fleet and deploy this kit as a `GitRepo`.

## How you make money on this (services-first)
- **Primary line:** assessment, architecture, pilot build, deployment, day-2 —
  mapped to your existing practices. Resale margin is attached, never the headline.
- **Recurring:** Day-2 site ops + fleet patching; **Fleet Scale** (more zones on
  the proven pattern); **new use cases** (a second Edge Workflow on the same
  footprint). A fleet renews **per site**, so the annuity grows with site count.
- Size **per use case**, not per opportunity. The pilot's job is proving the
  pattern; Fleet Scale and Day 2 are where the recurring revenue compounds.

## First action
`make up`, inject a fault, and book the SUSE pre-sales contact for the first
pilot zone. Everything else follows from a running proof.
