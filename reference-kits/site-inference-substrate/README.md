# Proof Kit — site AI inference substrate

Runnable minimal-footprint MVP + partner hand-off kit for the generation/
storage-operator pattern: ML models scored at the site edge instead of the
cloud — a sealed single-node "site" cluster reading a DMZ historian replica,
serving models behind the KServe v2 inference protocol, holding to per-model
outage policies when the uplink drops, and sealing a signed, hash-chained
evidence stream to a write-once directory. Partner- and customer-neutral by
design.

- `demo/` — the runnable MVP: `make up`, then `make fault` / `make heal`,
  `make verify-evidence`, `make reset`. See `demo/README.md`.
- `handoff/` — the partner kit: runbook, component map (open demo → SUSE
  Edge 3.6.1 production stack), scale-up path, sourced footprints.

**Proof environment:** GitHub Actions
(`.github/workflows/substrate-kit-proof.yml`) stands up a fresh cluster on
every change and asserts the full sequence — three models scoring the
looping historian feed with their outage policies visible in config,
evidence bundles sealing/chaining/refusing rewrites, uplink severed →
scoring continues while outputs queue (continue), flag (stale-context), or
hold (suppress), uplink healed → queues drain and the evidence chain
verifies centrally. Receipts in `BUILD-LEDGER.md`.

Grounded in the intel-to-opp factory's site-inference-substrate architecture
package (energy-utilities vertical). The OT zone is out of scope everywhere
in this kit: the analytics side reads a replica and can never write toward
plant systems.
