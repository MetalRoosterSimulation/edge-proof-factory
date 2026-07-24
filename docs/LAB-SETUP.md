# Lab setup — build the on-prem demo yourself

**What you'll build:** the end-to-end SUSE Edge predictive-maintenance proof
on your own machine — six simulated etch chambers, on-device SPC scoring
with failure forecasting, a provable data-sovereignty boundary, SUSE
Security (NeuVector), and an on-prem AI explanation tier — all on a
single-node k3s cluster.

**Total time:** ~45 minutes cold (~10 minutes if Docker/k3d/kubectl are
already installed). **Assumed skill:** you can copy-paste into a terminal.

Every step ends with **Check:** — literal expected output so you always know
it worked. Every failure routes to the [troubleshooting table](#troubleshooting).

---

## 1. Prerequisites (~10 min)

| Tool | Minimum | Verify with | Install |
|---|---|---|---|
| Docker | 27+ | `docker version` | https://docs.docker.com/get-docker/ then `docker ps` must not error |
| k3d | 5.x | `k3d version` | `curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh \| bash` |
| kubectl | 1.30+ | `kubectl version --client` | `brew install kubectl` (macOS) or https://kubernetes.io/docs/tasks/tools/ |
| helm | 3.14+ | `helm version --short` | only needed for the NeuVector step: https://helm.sh/docs/intro/install/ |
| Hardware | 4 cores / 8 GB free RAM / 10 GB disk | `free -g`, `df -h` | NeuVector step wants ~2 GB more headroom |

**Check:** all verify commands print a version; none say "command not found".

## 2. Clone and start (~5 min)

```bash
git clone https://github.com/MetalRoosterSimulation/edge-proof-factory.git
cd edge-proof-factory/reference-kits/semiconductor-predictive-maintenance/demo
make up
```

This creates the cluster, builds three images locally (all base images
openly pullable, no SUSE account needed), and deploys the pipeline.

**Check:** the command ends with a box printing
`Fab Edge dashboard:  http://localhost:18080` and
`kubectl -n fab-edge get pods` shows **4 pods Running**
(`sensor-simulator`, `gateway-edge-agent`, `mosquitto`, `edge-inference`).

## 3. Watch it work (~2 min)

Open **http://localhost:18080**.

**Check:** six tool cards; for the first ~30 s they read *warmup / baseline
learning* (each tool learns its own healthy baseline in place), then all six
show health **100/100** with a climbing *frames scored* counter.

## 4. Inject a fault — the money moment (~3 min)

```bash
make fault TOOL=etch-03
```

**Check (within ~20 s on the dashboard):** `etch-03` escalates WATCH →
WARNING → CRITICAL, health falls, *forecast to critical: ~N cycles* counts
down, and the top signal is **rf reflected power** with a rising z-score —
the model caught the RF-match drift and named the right sensor.

Recover it, and try the other physically-motivated faults:

```bash
make heal  TOOL=etch-03
make fault TOOL=etch-05 FAULT=he_seal_leak
make fault TOOL=etch-01 FAULT=chiller_fault
make status        # terminal view of the whole fleet
```

## 5. Prove the sovereignty boundary (~3 min)

Two layers, both demonstrable:

**Layer 1 — the gateway's governed egress** (SUSE Industrial Edge / Losant
Gateway Edge Agent): only derived health may leave; raw telemetry is
structurally withheld.

```bash
kubectl -n fab-edge exec deploy/gateway-edge-agent -- \
  python -c "import urllib.request,json; d=json.load(urllib.request.urlopen('http://localhost:8081/stats')); print('raw ingested:', d['raw_ingested'], '| forwarded to cloud:', d['losant_forwarded'], '| withheld (air-gapped):', d['losant_withheld_airgapped'])"
```

**Check:** thousands ingested, **0 forwarded**, all withheld.

**Layer 2 — network enforcement** (default-deny NetworkPolicy; SUSE
Security/NeuVector in production):

```bash
make sovereignty-verify
```

**Check:** ends with `SOVEREIGNTY VERIFIED: raw telemetry has no egress path
out of the fab namespace.` — the fab pod's egress attempt is blocked while a
control pod in an unprotected namespace succeeds, proving the block is the
policy, not your network.

## 6. SUSE Security — NeuVector (~10 min)

```bash
make security
```

Deploys NeuVector **5.5.2** (the SUSE Edge 3.6.1 pin) via the upstream Helm
chart, single-controller and laptop-tuned. Then open the console:

```bash
kubectl -n neuvector get secret neuvector-bootstrap-secret \
  -o jsonpath='{.data.bootstrapPassword}' | base64 -d; echo
kubectl -n neuvector port-forward svc/neuvector-service-webui 8443:8443
```

Browse to **https://localhost:8443** (accept the self-signed cert), log in
as `admin` with the bootstrap password above, and set a new password when
prompted.

**Check:** `kubectl -n neuvector get pods` shows controller, enforcer,
manager, and 3 scanner pods Running; the console loads.

> **Honest scope on k3d:** in this nested-Docker lab, NeuVector's control
> plane, console, vulnerability scanners, and admission control all run —
> but the enforcer cannot complete cluster membership inside nested
> containers (consul gossip and the kernel proc-connector are unavailable
> one layer down), so live Protect-mode blocking and the network activity
> map stay empty here. Run the kit on a **non-nested single-node k3s**
> (an SL Micro VM or bare metal — the kit's actual production shape) for
> the full Protect-mode egress-block demonstration. In this lab, the
> enforced boundary is the NetworkPolicy you just proved in step 5.

## 7. The AI tier — on-prem explain (~10 min, optional)

```bash
make ai
```

Adds **Ollama** (the SUSE AI stand-in) and pulls a small model — give it a
few minutes. Then, with a tool in a fault state:

```bash
curl -s http://localhost:18080/api/explain/etch-03 | python3 -m json.tool
```

**Check:** a plain-language failure explanation and first maintenance
action, generated **on-cluster** — no data left the fab. (The same prompts
back the live console's AI panel, where a hosted model stands in and says
so.) `make ai` also includes Open WebUI as an optional chat front-end; the
console and `/api/explain` do not require it.

## 8. Teardown (~1 min)

```bash
make down        # deletes the cluster and frees all resources
# make clean     # also removes the locally built images
```

**Check:** `k3d cluster list` no longer shows `edge-mvp`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `make up` fails: "Cannot connect to the Docker daemon" | Start Docker (Desktop, or `sudo systemctl start docker`), re-run |
| "port 18080 already in use" | `make up HOSTPORT=18090`, open `http://localhost:18090` |
| "cluster 'edge-mvp' already exists" | It's already up — open the dashboard, or `make down` first |
| Cards say "warmup" forever | Wait 40 s; then `make status`; if frames aren't climbing: `kubectl -n fab-edge logs deploy/sensor-simulator` |
| Dashboard won't load | `kubectl -n fab-edge get pods` — all 4 must be Running; `kubectl -n fab-edge describe pod <name>` for the stuck one |
| `make fault`: "command not found: mosquitto_pub" | You're not in `demo/`, or the cluster is down — `cd` there and `make status` |
| `make security` pods Pending | Not enough free RAM — NeuVector wants ~2 GB headroom; close something or skip step 6 |
| NeuVector console: bootstrap password rejected | The password was already rotated on a previous login — use the one you set, or `helm uninstall neuvector -n neuvector && kubectl delete ns neuvector && make security` for a fresh start |
| `make sovereignty-verify` fails on the control case | Your lab network blocks all egress (corporate proxy?) — the result is inconclusive, not a kit failure |
| Want a clean slate | `make down && make up` |

---

## The 90-second narration (for demoing to someone)

1. "Six fab tools, streaming sensor data, scored on-prem in real time." *(dashboard — all quiet)*
2. "Watch — a tool's RF matching network starts to degrade." *(`make fault TOOL=etch-03`)*
3. "The edge model catches it, escalates, forecasts time-to-failure, and
   names the exact sensor. No cloud round-trip." *(red card + RUL + rf-reflected)*
4. "And the raw telemetry never left the fab — provably." *(`make sovereignty-verify`)*
5. "Everything maps 1:1 to the supported SUSE stack — that's the hand-off kit."

---

## Appendix: Day 2 — Rancher + Fleet GitOps (optional)

Single-site deployments don't need central management — SUSE's own
standalone Edge Image Builder quickstart bootstraps clusters in place. When
you scale to many sites, Rancher Prime + Fleet is the layer that manages
them, and this kit is already wired for it:

- `scripts/wire-rancher.sh` imports the lab cluster into a Rancher instance
  and deploys the kit as a Fleet `GitRepo` (GitOps: push to the repo, the
  cluster updates). Verified end-to-end against Rancher v2.13.x — see
  `BUILD-LEDGER.md` phases 6–8 for the receipts and the gotchas already
  solved (token prefixes, re-import after cluster recreation, Helm adoption).
- `integrations/rancher-mcp-server/` exposes the same operations as MCP
  tools (list clusters/workloads, deploy via Fleet, import cluster) for
  AI-assisted operations.

## Appendix: Losant platform connection (optional)

The gateway runs air-gapped by default. To sync **derived health only** to a
Losant application (the SUSE Industrial Edge SaaS layer), create
`k8s/losant/losant-credentials.env` from the example file and run
`make losant`. A genuine `losant/edge-agent` drop-in manifest is in
`k8s/losant/edge-agent.yaml`. See `k8s/losant/README.md`.
