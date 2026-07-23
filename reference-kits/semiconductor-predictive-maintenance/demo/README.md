# Demo — semiconductor predictive-maintenance edge AI

A working, end-to-end MVP of the use case, on a single-node k3s cluster. Runs on a
laptop. Every image is openly pullable, so it starts in minutes with no SUSE
entitlement — the hand-off kit maps each component to its SUSE-supported
equivalent for production.

## What it is

Six plasma-etch chambers stream sensor telemetry. At the edge, an on-device model
scores each tool's health (0–100), forecasts remaining useful life, and names the
sensors driving a fault — all on CPU, on-prem, with raw telemetry never leaving
the fab. A local LLM (optional) explains an anomaly in plain language.

```
 sensor-simulator ──raw──▶ gateway-edge-agent ──normalized──▶ edge-inference ──▶ dashboard
   (OT devices)            (Losant GEA:              (SUSE AI analog:        (ops console
                            normalize/buffer/          health score +          :18080)
                            governed egress)           RUL + attribution)
                                │ derived scores only
                                ▼
                          Losant platform (optional, opt-in)
```

Tier → production SUSE mapping (full detail in `../handoff/01-component-map.md`):

| Demo tier | Production SUSE |
|---|---|
| mosquitto + gateway-edge-agent (real `losant-mqtt` SDK) | **SUSE Industrial Edge** (Losant Gateway Edge Agent) |
| k3s single node (k3d) | **SUSE Edge** — SL Micro + K3s/RKE2, Elemental, Edge Image Builder |
| edge-inference (CPU model) | **SUSE AI** — Ollama/vLLM + Milvus on a GPU node |
| NetworkPolicy / opt-in egress | **SUSE Security (NeuVector)** |
| `kubectl`/Fleet manifests | **Rancher Prime** + Fleet GitOps |

## Prerequisites

`docker`, `k3d`, `kubectl`. Nothing is installed globally by the demo.
(Install k3d: `curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash`.)

## Run it

```bash
make up                      # cluster + build + deploy (~2 min); prints the URL
open http://localhost:18080  # the ops dashboard — 6 tools, all green

make fault TOOL=etch-03      # inject an RF-match-drift fault; watch it degrade
make status                  # health/state/RUL for every tool
make heal  TOOL=etch-03      # clear it
make down                    # delete the cluster
```

Fault library (`FAULT=`): `rf_match_drift` (default), `he_seal_leak`,
`chiller_fault`. Each is a physically-motivated etch failure signature.

## The 90-second partner demo

1. `make up`, open the dashboard — six tools green at 100.
2. `make fault TOOL=etch-03` — narrate: "an RF matching network is starting to
   degrade." Within ~20s the card goes amber → red, health falls, the RUL
   forecast counts down, and `rf_reflected_power_w` is named as the top signal.
3. Point at the gateway: `kubectl -n fab-edge exec deploy/gateway-edge-agent -- \
   wget -qO- localhost:8081/stats` — `losant_withheld_airgapped` proves raw
   telemetry never left the fab.
4. `make heal TOOL=etch-03` — recovery.

## Optional profiles

- **SUSE AI (local LLM):** `make ai` adds Ollama + Open WebUI (the real SUSE AI
  Application Collection components) and wires an on-prem "explain this anomaly"
  endpoint (`/api/explain/<tool>`). Pulls a tiny model; give it a few minutes.
- **Losant platform:** see `k8s/losant/README.md` — connect the gateway's real
  `losant-mqtt` SDK egress, or swap in the genuine `losant/edge-agent`.
- **Rancher:** import this cluster into Rancher and deploy via Fleet — see
  `../../../integrations/rancher-mcp-server/`.

## Tests

```bash
make test        # model unit tests (no cluster needed)
```

## How the model works

`images/edge-inference/app/health_model.py` — an EWMA-smoothed multivariate
control chart (Hotelling T² / Mahalanobis SPC): each tool learns its own healthy
baseline (Welford), scores per-sensor z-scores against it, and converts the
smoothed statistic (above its 2σ control limit) into a 0–100 health score plus a
trend-extrapolated RUL. CPU-only, a few KB of state per tool. Production swaps in
a heavier model behind SUSE AI; the contract (sensor frame in, verdict out) is
unchanged. Fully unit-tested (`tests/test_health_model.py`).

## Layout

```
images/            sensor-simulator · gateway-edge-agent (Losant) · edge-inference
k8s/base/          the minimal-footprint deployment (kustomize)
k8s/ai/            SUSE AI analog profile (Ollama + Open WebUI)
k8s/losant/        Losant platform connection (SDK egress + real edge-agent)
losant/            the Losant Edge Workflow to import
tests/             model unit tests
Makefile           the whole UX
```
