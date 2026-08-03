# Proof Kit — corridor vegetation inspection (ground-side platform)

Runnable minimal-footprint MVP + partner hand-off kit for transmission-line
vegetation inspection: the utility-side platform that ingests drone corridor
imagery, scores it locally, hands findings to work management, and archives
every record as custody-held evidence. Partner- and customer-neutral by
design.

- `demo/` — the runnable MVP: `make up` on a single-node k3d cluster, then
  `make campaign`, `make fault` / `make heal`, `make fill`. See `demo/README.md`.
- `handoff/` — the partner kit: runbook, component map (open demo → SUSE
  Edge 3.6.1 production stack), scale-up path, sourced footprints.

**Proof environment:** GitHub Actions (`.github/workflows/corridor-kit-proof.yml`)
stands up a fresh cluster on every change and asserts the full sequence —
campaign → findings → work orders/archive, revoked credential → 401, severed
WAN → queues grow while the site keeps scoring, capacity alert → ingest
backpressure with nothing lost, heal → drain. Receipts in `BUILD-LEDGER.md`.

Grounded in the intel-to-opp factory's transmission-line vegetation-inspection
architecture package (adversarially gated 2026-08-03). The flight tier is out
of scope everywhere in this kit: imagery enters as a ground-station upload,
nothing more.
