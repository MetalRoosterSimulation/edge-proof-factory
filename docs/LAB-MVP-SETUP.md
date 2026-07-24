# Lab MVP setup — build the demo in a formal enterprise lab (real k3s)

> **Status:** this guide is NOT yet verified on a real k3s host — it is
> documented from the Makefile/manifests and sourced stack facts. The k3d
> path ([LOCAL-SETUP.md](LOCAL-SETUP.md)) IS verified end-to-end. Treat each
> step's Checks as the verification you're performing for the first time.

**What you'll build:** the same SUSE Edge predictive-maintenance proof as
[LOCAL-SETUP.md](LOCAL-SETUP.md) — six simulated etch chambers, on-device SPC
scoring with failure forecasting, a provable data-sovereignty boundary, SUSE
Security (NeuVector), and an on-prem AI explanation tier — but on a
**real single-node k3s cluster** (VM or bare metal) instead of k3d-in-Docker
on a laptop.

**Why this build:** this is the kit's actual production shape. k3s runs
directly on the host with its own containerd — no nested Docker — so
NeuVector's enforcer joins the cluster fully and **live Protect-mode
enforcement and the network activity map work here** (they cannot in the
local k3d build). The dashboard is reachable by anyone on the lab network,
not just localhost.

**Total time:** ~45 minutes on a prepared host (OS installed, network access
granted). Time for enterprise change control, firewall requests, and VM
provisioning is not included. **Assumed skill:** you can copy-paste into a
Linux terminal and have (or can get) root on the lab host.

Every step ends with **Check:** — literal expected output so you always know
it worked. Failures route to the [troubleshooting table](#troubleshooting).

> **Which make targets apply here:** `make deploy`, `wait`, `fault`, `heal`,
> `status`, `security`, `ai`, `losant`, and `sovereignty-verify` are plain
> kubectl/helm and work unchanged. **Do not use** `make up`, `cluster`,
> `import`, `down`, or `clean` — those drive k3d and belong to the local
> build only. This guide gives the k3s equivalents inline.

---

## 1. Prerequisites (~10 min, plus lead time for approvals)

| Item | Requirement | Verify with |
|---|---|---|
| Lab host | x86-64 VM or bare metal, dedicated to this demo; **4 cores / 8 GB RAM / 20 GB free disk** (k3s server floor is 2 c / 2 GB; NeuVector wants ~2 GB headroom; the AI tier pulls a multi-GB model) | `nproc`, `free -g`, `df -h` |
| OS | SUSE Linux Micro 6.2 (the SUSE Edge 3.6.1 pin) or any systemd Linux — SLES, openSUSE, Ubuntu, RHEL | `cat /etc/os-release` |
| Access | root or sudo on the host | `sudo -v` |
| Addressing | a stable IP or DNS name for the host — it becomes the dashboard URL | `ip -4 addr` |
| Network — outbound | HTTPS to `get.k3s.io`, GitHub, and public container registries (Docker Hub, ghcr.io); the optional AI tier also pulls a model from Ollama's registry | request via your network team |
| Network — inbound | **30080/tcp** open to demo viewers (dashboard NodePort); **6443/tcp** only if you'll run kubectl from a workstation | firewall change request |
| Container engine | Docker 27+ or Podman, on the lab host **or** on a workstation you can `scp` from (SL Micro is immutable — building on a workstation is simpler there) | `docker version` or `podman version` |
| helm | 3.14+ | `helm version --short` — only needed for the NeuVector step: https://helm.sh/docs/intro/install/ |
| git | any recent | `git --version` |

**Check:** all verify commands succeed, and the two firewall rows are
approved before demo day — they are the only steps with lead time.

## 2. Install k3s (~5 min)

On the lab host:

```bash
curl -sfL https://get.k3s.io | \
  INSTALL_K3S_VERSION="v1.35.4+k3s1" \
  INSTALL_K3S_EXEC="--disable=traefik" sh -s -
```

`v1.35.4+k3s1` matches K3s 1.35.4, the SUSE Edge 3.6.1 pin — check the
[SUSE Edge release matrix](https://documentation.suse.com) if you're on a
different Edge release; omit `INSTALL_K3S_VERSION` to take latest stable.
Traefik is disabled for parity with the kit's manifests (the dashboard is a
plain NodePort; no ingress controller is used).

The installer also symlinks `kubectl`, `crictl`, and `ctr` into
`/usr/local/bin`. Give your user kubectl access:

```bash
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown "$(id -u):$(id -g)" ~/.kube/config
```

**Check:** `kubectl get nodes` shows one node `Ready`, and
`kubectl version --client` prints 1.35.x (or your pinned version).

## 3. Clone, build, and import the images (~10 min)

```bash
git clone https://github.com/MetalRoosterSimulation/edge-proof-factory.git
cd edge-proof-factory/reference-kits/semiconductor-predictive-maintenance/demo
```

k3s runs its own containerd — there is no `k3d image import` here. Build the
three images (all base images openly pullable, no SUSE account needed) and
stream them straight into k3s's image store:

```bash
for i in sensor-simulator edge-inference gateway-edge-agent; do
  docker build -t edge-proof/$i:dev images/$i
  docker save edge-proof/$i:dev | sudo k3s ctr images import -
done
```

Podman instead of Docker: same loop with `podman build` and
`podman save --format docker-archive`. Building on a workstation: run the
build/save there, `scp` the tarballs over, and `sudo k3s ctr images import`
each on the host.

**Check:** `sudo k3s ctr images ls | grep edge-proof` lists all three
`:dev` images.

## 4. Deploy the pipeline (~3 min)

```bash
make deploy wait
```

**Check:** all four rollouts report `successfully rolled out`, and
`kubectl -n fab-edge get pods` shows **4 pods Running**
(`sensor-simulator`, `gateway-edge-agent`, `mosquitto`, `edge-inference`).

## 5. Watch it work (~2 min)

Open **http://\<lab-host\>:30080** — the NodePort directly, from any machine
on the lab network. (There is no `localhost:18080` here; that port mapping
is a k3d artifact of the local build, and Makefile messages that print it
can be ignored.)

**Check:** six tool cards; for the first ~30 s they read *warmup / baseline
learning* (each tool learns its own healthy baseline in place), then all six
show health **100/100** with a climbing *frames scored* counter.

## 6. Inject a fault — the money moment (~3 min)

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

## 7. Prove the sovereignty boundary (~3 min)

Two layers, both demonstrable:

**Layer 1 — the gateway's governed egress** (SUSE Industrial Edge / Losant
Gateway Edge Agent): only derived health may leave; raw telemetry is
structurally withheld.

```bash
kubectl -n fab-edge exec deploy/gateway-edge-agent -- \
  python -c "import urllib.request,json; d=json.load(urllib.request.urlopen('http://localhost:8081/stats')); print('raw ingested:', d['raw_ingested'], '| forwarded to cloud:', d['losant_forwarded'], '| withheld (air-gapped):', d['losant_withheld_airgapped'])"
```

**Check:** thousands ingested, **0 forwarded**, all withheld.

**Layer 2 — network enforcement** (default-deny NetworkPolicy):

```bash
make sovereignty-verify
```

**Check:** ends with `SOVEREIGNTY VERIFIED: raw telemetry has no egress path
out of the fab namespace.` — the fab pod's egress attempt is blocked while a
control pod in an unprotected namespace succeeds, proving the block is the
policy, not your network.

## 8. SUSE Security — NeuVector, fully enforcing (~10 min)

```bash
make security
```

Deploys NeuVector **5.5.2** (the SUSE Edge 3.6.1 pin) via the upstream Helm
chart, single-controller, with the runtime socket already pointed at k3s's
containerd. Then open the console:

```bash
kubectl -n neuvector get secret neuvector-bootstrap-secret \
  -o jsonpath='{.data.bootstrapPassword}' | base64 -d; echo
kubectl -n neuvector port-forward --address 0.0.0.0 svc/neuvector-service-webui 8443:8443
```

Browse to **https://\<lab-host\>:8443** (accept the self-signed cert), log in
as `admin` with the bootstrap password above, and set a new password when
prompted. (`--address 0.0.0.0` makes the console reachable from your
workstation; drop it if you're browsing on the host itself.)

**Check:** `kubectl -n neuvector get pods` shows controller, enforcer,
manager, and scanner pods Running; the console loads; and — the difference
from the local k3d build — the **enforcer completes cluster membership**, so
the **Network Activity map populates** with the fab namespace's real traffic.

With the enforcer live, you can take the boundary demo further than the
local build: NeuVector learns the fab namespace's behavior in Discover mode,
and switching the group to **Protect** gives live enforcement at the
container network layer — the runtime-security half of the story that the
k3d lab can only assert. The NetworkPolicy from step 7 remains in force
underneath either way.

## 9. The AI tier — on-prem explain (~10 min, optional)

```bash
make ai
```

Adds **Ollama** (the SUSE AI stand-in) and pulls a small model — give it a
few minutes, and note this is the step most sensitive to enterprise egress
rules (the model comes from Ollama's public registry; a proxy that
intercepts TLS will break the pull). Then, with a tool in a fault state:

```bash
curl -s http://<lab-host>:30080/api/explain/etch-03 | python3 -m json.tool
```

**Check:** a plain-language failure explanation and first maintenance
action, generated **on-cluster** — no data left the fab. (The same prompts
back the live console's AI panel, where a hosted model stands in and says
so.) `make ai` also includes Open WebUI as an optional chat front-end; the
console and `/api/explain` do not require it.

## 10. Teardown (~1 min)

Remove the demo but keep the cluster:

```bash
kubectl delete -k k8s/ai 2>/dev/null || true
helm uninstall neuvector -n neuvector 2>/dev/null; kubectl delete ns neuvector 2>/dev/null
kubectl delete -k k8s/base
```

Or remove k3s entirely (the installer ships an uninstaller):

```bash
sudo /usr/local/bin/k3s-uninstall.sh
```

**Check:** `kubectl get ns` no longer shows `fab-edge` (first path), or the
`k3s` systemd unit is gone (second path).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| k3s install script fails or node never `Ready` | `sudo systemctl status k3s` and `sudo journalctl -u k3s --no-pager \| tail -50`; on SLES/SL Micro check that SELinux packages installed cleanly |
| `kubectl`: permission denied on `/etc/rancher/k3s/k3s.yaml` | You skipped the copy/chown in step 2 — run it, or prefix commands with `sudo` |
| Pods stuck `ErrImagePull` / `ImagePullBackOff` on `edge-proof/*` | The images aren't in k3s's containerd — re-run the step 3 import loop and confirm with `sudo k3s ctr images ls \| grep edge-proof` |
| Dashboard loads on the host (`curl localhost:30080`) but not from your workstation | Host firewall — open 30080/tcp (`sudo firewall-cmd --add-port=30080/tcp --permanent && sudo firewall-cmd --reload` where firewalld runs), or your lab network filters east-west traffic |
| Port 30080 already bound on the host | Another service owns it — edit `nodePort` in `k8s/base/40-edge-inference.yaml` (any free port in 30000–32767) and `make deploy` again |
| Cards say "warmup" forever | Wait 40 s; then `make status`; if frames aren't climbing: `kubectl -n fab-edge logs deploy/sensor-simulator` |
| `make fault`: "command not found: mosquitto_pub" | You're not in `demo/`, or the pipeline isn't deployed — `cd` there and `make status` |
| `make security` pods Pending | Not enough free RAM — NeuVector wants ~2 GB headroom; grow the VM or skip step 8 |
| NeuVector console: bootstrap password rejected | Already rotated on a previous login — use the one you set, or `helm uninstall neuvector -n neuvector && kubectl delete ns neuvector && make security` for a fresh start |
| Ollama model pull stalls or fails | Enterprise proxy/egress — the model registry must be reachable; TLS-intercepting proxies break the pull |
| `make sovereignty-verify` fails on the control case | The lab blocks all egress (proxy, default-deny at the perimeter) — the result is inconclusive, not a kit failure |
| Want a clean slate | `kubectl delete -k k8s/base && make deploy wait` — no cluster rebuild needed |

---

## The 90-second narration (for demoing to someone)

1. "Six fab tools, streaming sensor data, scored on-prem in real time — on
   the same single-node k3s this would ship on." *(dashboard — all quiet)*
2. "Watch — a tool's RF matching network starts to degrade." *(`make fault TOOL=etch-03`)*
3. "The edge model catches it, escalates, forecasts time-to-failure, and
   names the exact sensor. No cloud round-trip." *(red card + RUL + rf-reflected)*
4. "And the raw telemetry never left the fab — provably, at two layers:
   policy and live runtime enforcement." *(`make sovereignty-verify` + the
   NeuVector activity map)*
5. "Everything maps 1:1 to the supported SUSE stack — that's the hand-off kit."

---

## Appendix: Day 2 — Rancher + Fleet GitOps (optional)

A real k3s lab cluster is exactly what Rancher expects to manage — this
appendix is more at home here than in the local build. When you scale to
many sites, Rancher Prime + Fleet is the management layer, and the kit is
already wired for it:

- `scripts/wire-rancher.sh` imports the lab cluster into a Rancher instance
  and deploys the kit as a Fleet `GitRepo` (GitOps: push to the repo, the
  cluster updates). Verified against Rancher v2.13.x (the lab instance; the
  current pinned matrix is Rancher Prime 2.14.2 per
  `docs/suse-edge-ai-stack.md`) — see
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

## Appendix: production deltas that remain

This lab is the production *shape* (real k3s, real containerd, full
NeuVector), but not yet the production *build*. What the hand-off kit
changes: SL Micro imaged via Edge Image Builder (air-gapped, images
pre-embedded — no step-3 hand import), SUSE-registry supported images
instead of the open stand-ins, and the real SUSE AI stack (RKE2 + GPU node,
4 c / 32 GB / 50 GB floor) instead of CPU-only Ollama. See
`reference-kits/semiconductor-predictive-maintenance/handoff/`.
