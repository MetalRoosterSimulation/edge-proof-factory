# Component map — demo stack → SUSE-supported production stack

Versions from the SUSE Edge 3.6.1 matrix (see `docs/suse-edge-ai-stack.md`
in this repository); re-verify against the current release matrix before a
build.

| Demo component (open) | Role in the use case | Production SUSE component | Pinned version (Edge 3.6.1) |
|---|---|---|---|
| k3d single-node cluster | The corridor edge site | SUSE Linux Micro + K3s, built as one Edge Image Builder image (air-gap capable, embedded registry) | SL Micro 6.2 · K3s 1.35.4 · EIB 1.3.3.1 |
| `site-ingest` container (per-station Bearer tokens) | The one inbound flow at the site boundary | Same pattern on the platform; credentials issued/rotated/revoked per ground station, integrated with the utility's existing IdP (AD/Entra/LDAP/OIDC) — the platform provides no IdP | Rancher auth integration, 2.14.2 |
| Shared `/work` emptyDir (bounded, alert→backpressure) | Working storage for in-flight campaign imagery | Single-node sites: K3s local-path. Multi-node sites: SUSE Storage (Longhorn) — multi-node only, 3 nodes for 3-replica HA | Longhorn 1.11.2 |
| `vision-scorer` container (`vegmodel.py` stand-in) | The swappable vision workload | A third-party containerized inspection pipeline chosen by the customer, GPU-scheduled via NVIDIA GPU Operator; never a SUSE product claim | GPU Operator per SUSE AI deployment docs |
| `findings-relay` container | Outbound-only delivery of findings + evidence | Same outbound-only property fleet-wide: Rancher Prime + Fleet two-stage pull GitOps — all traffic originates at the site | Rancher Prime 2.14.2 · Fleet (bundled) |
| `allow-wan` NetworkPolicy (deleted = severed) | The WAN, and its loss | Real WAN loss at a substation/service center; the design's bounded-autonomy behavior is what this demo rehearses | — |
| `ops-center` container, `/workorder` endpoint | Work-management handoff | The utility's existing work-management/GIS systems, integrated via service accounts (engagement work, not product) | — |
| `ops-center` container, `/archive` endpoint (accounts records, does not store imagery) | Custody archive for evidence records | Customer- or third-party-operated S3-compatible object store selected under the utility's custody and jurisdiction requirements | — |
| (not in demo) | Runtime security on every cluster | SUSE Security (NeuVector) full per-cluster deployment; All-in-One container on single-node sites; policy as CRDs delivered via Fleet | NeuVector 5.5.2 |
| (not in demo) | Fleet observability | SUSE Observability with edge collection tier | per Edge 3.6.1 matrix |

## Notes that change a build decision

- **K3s vs RKE2.** Single-binary K3s fits the substation footprint; RKE2 is
  the hardened/FIPS path and what the management cluster runs. The datastore
  is baked in at image-build time: default SQLite is single-server with no
  HA — decide HA before imaging, not after.
- **AI footprint.** There is no LLM tier in this use case, so SUSE AI floors
  do not apply. Production-rate vision scoring needs a GPU node; sizing it
  is a discovery deliverable driven by the customer's campaign volumes —
  this kit deliberately ships no GPU numbers. The demo scorer is CPU-only
  by design and is not a performance analog.
- **Governance.** Raw corridor imagery never leaves the site except to the
  custody archive; only findings and evidence metadata cross to work
  management. Nothing in this design has a data path to or from
  protection/control systems — keep that separation explicit in every
  deployment conversation.
- **Security.** NeuVector runs complete on every cluster (Controller +
  Enforcer + Manager; All-in-One on single-node). Fleet-wide policy is
  authored as CRDs in Git and delivered by Fleet — no console drift, no
  federation dependency. Full enforcement requires real k3s, not the
  nested-Docker lab cluster.
- **Simplifications in this demo, stated plainly:** the three site
  containers share one pod and one emptyDir (production separates concerns
  on the same single-node cluster with real storage classes); the archive
  endpoint accounts evidence records instead of storing imagery bytes; the
  ops side is one stub container standing in for two customer systems;
  imagery is synthetic PPM so the scorer needs no imaging dependency. None
  of these change the pipeline semantics the demo proves.
