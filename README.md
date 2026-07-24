# Edge Proof Factory — SUSE Edge predictive maintenance, runnable

A working end-to-end predictive-maintenance proof for the SUSE Edge stack:
six simulated plasma-etch chambers, on-device SPC health scoring (Hotelling
T² / EWMA) with failure forecasting and sensor attribution, a governed
data-sovereignty boundary, and an on-prem AI explanation tier — on a
single-node K3s cluster your laptop can run.

**[▶ Try the live demo](https://edge-ai-demo.vercel.app)** — the FabEdge FDC
console, no install. Simulated fab, same SPC model as the on-prem kit,
golden-parity-tested.

**[🔧 Build it on-prem in ~45 minutes](docs/LAB-SETUP.md)** — the dummy-proof
lab guide. If you can copy-paste into a terminal, you can run this.

---

## What this proves

| Claim | How it's proven |
|---|---|
| Predictive maintenance runs at the edge, CPU-only | `make up` deploys the whole pipeline on single-node k3s; inject a fault, watch detection → forecast → attribution live |
| Raw fab telemetry never leaves the fab | `make sovereignty-verify`: egress from the fab namespace is blocked at the network layer, with a control case proving the block is policy |
| The AI answers on-prem | `make ai` adds Ollama; `/api/explain` generates remediation direction with no data leaving the cluster |
| The browser demo is the same model | 590 frames recorded from the real Python model replay through the TypeScript port in CI, every verdict field compared |

## Architecture

```mermaid
flowchart LR
  subgraph fab["FAB SITE — single-node K3s (SL Micro in production)"]
    S[sensor-simulator<br/>synthetic etch telemetry] -->|"MQTT fab-devices/+/raw"| G[gateway-edge-agent<br/>SUSE Industrial Edge / Losant GEA<br/>normalize · offline-buffer · governed egress]
    G -->|"fab/+/telemetry"| I[edge-inference<br/>SPC model: T²/EWMA · health · RUL · attribution]
    I -->|"fab/+/health (derived only)"| G
    I --> D[fab console dashboard]
    O[Ollama — SUSE AI tier<br/>on-prem explain] -.-> I
    NP[NetworkPolicy + SUSE Security NeuVector<br/>egress enforcement] -.protects.- fab
  end
  G -. "derived health only<br/>(when Losant-connected)" .-> CLOUD[(Losant platform)]
```

Every open component maps to its SUSE-supported production counterpart —
see the [component map](reference-kits/semiconductor-predictive-maintenance/handoff/01-component-map.md)
(pinned to the SUSE Edge 3.6.1 release matrix).

## Quickstart (laptop lab)

```bash
git clone https://github.com/MetalRoosterSimulation/edge-proof-factory.git
cd edge-proof-factory/reference-kits/semiconductor-predictive-maintenance/demo
make up                      # ~2 min: cluster + images + deploy
# open http://localhost:18080
make fault TOOL=etch-03      # watch the excursion live
make sovereignty-verify      # prove raw data can't leave the fab
make down                    # clean teardown
```

Full walkthrough with per-step checkpoints, the NeuVector exercise, the AI
tier, and troubleshooting: **[docs/LAB-SETUP.md](docs/LAB-SETUP.md)**.

## Repository map

| Path | What it is |
|---|---|
| `reference-kits/semiconductor-predictive-maintenance/` | The Proof Kit: runnable demo (`demo/`) + partner hand-off kit (`handoff/`) |
| `portal/` | The live console app (Next.js) — the in-browser simulation deployed to Vercel |
| `docs/LAB-SETUP.md` | Step-by-step on-prem lab rebuild guide |
| `docs/reference-architectures/` | VP-approval-grade 1,000-sensor reference architectures: [RA-01 on-prem](docs/reference-architectures/RA-01-on-prem.md) ([PDF](docs/reference-architectures/RA-01-on-prem.pdf)) · [RA-02 hybrid AWS](docs/reference-architectures/RA-02-hybrid-aws.md) ([PDF](docs/reference-architectures/RA-02-hybrid-aws.pdf)) |
| `docs/` | Sourced SUSE stack facts, doctrine, factory process (`docs/factory/`) |
| `integrations/rancher-mcp-server/` | Optional: MCP server for Rancher fleet management (Day-2 appendix) |
| `BUILD-LEDGER.md` | Append-only build history — every phase, every verification |

## The SUSE story (Edge 3.6.1)

- **SUSE Edge** — SL Micro + K3s: the platform the kit runs on (k3d stands in
  on a laptop; production floors are in the
  [footprint doc](reference-kits/semiconductor-predictive-maintenance/handoff/03-production-footprint.md)).
- **SUSE Industrial Edge** (Losant) — the gateway tier: ingest, normalize,
  offline buffering, single governed egress point. The kit runs the real
  `losant-mqtt` SDK, with a genuine `losant/edge-agent` drop-in profile.
- **SUSE Security** (NeuVector 5.5.2) — runtime security enforcing the
  boundary; deployed by `make security`, exercised by `make sovereignty-verify`.
- **SUSE AI** — the inference + explanation tier; Ollama on-cluster via
  `make ai`, same prompt contract as the hosted stand-in in the live demo.
- **Rancher Prime / Fleet** — optional Day-2 fleet management
  ([appendix](docs/LAB-SETUP.md#appendix-day-2--rancher--fleet-gitops)).

## License & provenance

Demo code and docs in this repository are provided as-is for evaluation.
Product facts are sourced from SUSE documentation (versions pinned to the
Edge 3.6.1 release matrix); unknowns are marked rather than invented.
