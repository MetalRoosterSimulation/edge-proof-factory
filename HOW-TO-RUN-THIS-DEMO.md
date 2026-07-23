# How to run this demo — foolproof guide

A working, end-to-end SUSE Edge/AI predictive-maintenance MVP on your laptop. No
SUSE account needed. If you can copy-paste into a terminal, you can run this.

Every step lists **what you should see** so you always know it worked.

---

## 0. What you're about to run

Six simulated semiconductor etch chambers stream sensor data. At the edge, a model
scores each tool's health, forecasts failure, and names the bad sensor — all on
your CPU, on-prem, with raw data never leaving the "fab." You inject a fault and
watch a tool go red in real time.

---

## 1. One-time setup — install three tools

You need **Docker**, **k3d**, and **kubectl**. Check what you already have:

```bash
docker version && k3d version && kubectl version --client
```

Install whatever is missing:

- **Docker** — https://docs.docker.com/get-docker/ (start Docker Desktop, or on
  Linux `sudo systemctl start docker`). Confirm with `docker ps` (should not error).
- **k3d** (one line):
  ```bash
  curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash
  ```
- **kubectl**:
  ```bash
  curl -fsSLO "https://dl.k8s.io/release/$(curl -fsSL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
    && chmod +x kubectl && sudo mv kubectl /usr/local/bin/
  ```
  (macOS: `brew install kubectl`.)

**Check:** all three version commands print a version and no "command not found".

---

## 2. Start the demo — two commands

```bash
cd ~/Work/edge-proof-factory/reference-kits/semiconductor-predictive-maintenance/demo
make up
```

This creates a single-node cluster, builds the images, and deploys everything. It
takes ~2 minutes the first time.

**What you should see** at the end:
```
  ┌─────────────────────────────────────────────────────────┐
  │  Fab Edge dashboard:  http://localhost:18080              │
  │  Inject a fault:      make fault TOOL=etch-03            │
  └─────────────────────────────────────────────────────────┘
```

---

## 3. Watch it work

Open **http://localhost:18080** in a browser.

**What you should see:** six tool cards, each green, health **100 / 100**, a live
"frames scored" counter climbing in the top-right, and a pulsing "● live".

> First ~30 seconds each tool shows "warmup / baseline learning" — that's normal;
> it's learning each tool's healthy baseline. Then it turns green.

---

## 4. The money moment — inject a fault

In the terminal:

```bash
make fault TOOL=etch-03
```

**What you should see on the dashboard within ~20 seconds:** the `etch-03` card
turns amber (**WATCH**) → orange (**WARNING**) → red (**CRITICAL**); its health
number falls; a "forecast to critical: ~N cycles" line counts **down**; and the
top signal shows **`rf reflected power`** with a rising z-score — the model caught
the RF-match-drift fault and named the right sensor.

Check it from the terminal too:
```bash
make status
```
**What you should see:** `etch-03` at a low health with state `CRITICAL`, the other
five still `HEALTHY`.

Clear it and watch it recover:
```bash
make heal TOOL=etch-03
```

Other faults to try: `make fault TOOL=etch-05 FAULT=he_seal_leak` and
`make fault TOOL=etch-01 FAULT=chiller_fault`.

---

## 5. Prove data never leaves the fab (the sovereignty story)

```bash
kubectl -n fab-edge exec deploy/gateway-edge-agent -- \
  python -c "import urllib.request,json; d=json.load(urllib.request.urlopen('http://localhost:8081/stats')); print('raw ingested:', d['raw_ingested'], '| forwarded to cloud:', d['losant_forwarded'], '| withheld (air-gapped):', d['losant_withheld_airgapped'])"
```

**What you should see:** thousands of frames ingested, **0 forwarded** to the
cloud, all **withheld** — the Losant gateway keeps raw telemetry on-prem. (There's
also a network policy that blocks the pods from reaching the internet at all.)

---

## 6. (Optional) Turn on the local AI assistant — SUSE AI

```bash
make ai
```

This adds Ollama + Open WebUI (the real SUSE AI components) and an on-prem
"explain this anomaly" feature. It downloads a small model, so give it a few
minutes. Then, with a tool in a fault state:
```bash
curl -s http://localhost:18080/api/explain/etch-03 | python3 -m json.tool
```
**What you should see:** a plain-language explanation of the likely failure and the
first maintenance action — generated locally, no data leaving the cluster.

---

## 7. (Optional) See it managed in Rancher via Fleet GitOps

If the cluster has been imported into Rancher (already done in this environment):

- Open your Rancher UI → **Cluster Management** → the `edge-mvp` cluster is listed
  and **Active**.
- **Continuous Delivery → Git Repos** → `edge-proof-kit` shows **1/1 ready**,
  pulling from `github.com/MetalRoosterSimulation/edge-proof-factory`. Fleet
  deploys the demo from git — change a manifest, push, and the cluster updates.

To set this up fresh on another Rancher, see
`integrations/rancher-mcp-server/README.md` and `scripts/wire-rancher.sh`.

---

## 8. Stop / clean up

```bash
cd ~/Work/edge-proof-factory/reference-kits/semiconductor-predictive-maintenance/demo
make down          # deletes the cluster (frees all resources)
# make clean       # also removes the built images
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `make up` fails early, "Cannot connect to the Docker daemon" | Start Docker Desktop (or `sudo systemctl start docker`), then re-run. |
| "port 18080 already in use" | Something else uses that port. Run with another: `make up HOSTPORT=18090` and open `http://localhost:18090`. |
| "cluster 'edge-mvp' already exists" | It's already up — just open the dashboard, or `make down` first for a clean start. |
| Dashboard loads but cards say "warmup" forever | Wait 30–40s; if still stuck, `make status` — if no frames are climbing, `kubectl -n fab-edge logs deploy/sensor-simulator`. |
| Dashboard won't load | `kubectl -n fab-edge get pods` — all four should be `Running`. If not, `kubectl -n fab-edge describe pod <name>`. |
| `make fault` says "command not found: mosquitto_pub" | You're not in the `demo/` directory, or the cluster isn't up. `cd` into `demo/` and check `make status`. |
| Want to re-run from scratch | `make down` then `make up`. |

---

## The 90-second narration (for demoing to someone)

1. "Six fab tools, streaming sensor data, scored on-prem in real time." *(open dashboard — all green)*
2. "Watch — a tool's RF matching network starts to degrade." *(`make fault TOOL=etch-03`)*
3. "The edge model catches it, escalates it, and forecasts time-to-failure — and it
   names the exact sensor. No cloud round-trip." *(point at the red card + RUL + rf-reflected signal)*
4. "And the raw telemetry never left the fab." *(run the step-5 command)*
5. "Everything here maps 1:1 to the supported SUSE stack — that's the hand-off kit."
```

*Full details: `reference-kits/semiconductor-predictive-maintenance/demo/README.md`
and the hand-off kit in `.../handoff/`.*
