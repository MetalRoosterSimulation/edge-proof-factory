# Reference kit — semiconductor predictive-maintenance edge AI

The fully-worked reference **Proof Kit**: a runnable minimal-footprint MVP plus the
partner hand-off, for the semiconductor predictive-maintenance edge-AI use case
(the Technologent / Microchip Technology worked example from the BD and use-case
factories).

- **`demo/`** — the runnable MVP. `cd demo && make up`. Single-node k3s, all-open
  images, CPU-only, laptop-class. Tested end to end.
- **`handoff/`** — the pilot's-manual hand-off kit: rebuild runbook, component map
  to the SUSE-supported stack, four-phase scale-up path, sourced footprints.

Losant (SUSE Industrial Edge) is a first-class tier of the running demo — the real
`losant-mqtt` SDK, the real `losant/edge-agent` as a drop-in, and an importable
Losant Edge Workflow. Rancher is wired via the Rancher MCP server at
`../../integrations/rancher-mcp-server/`.

Provenance: this kit's use case, architecture, and partner economics are seeded
from `~/Work/use-case-factory` (the semiconductor architecture package) and
`~/Work/bd-trigger-to-deal-factory/Edge` (the edge/AI BD factory). This factory
adds the one thing neither produced: a running proof and a hand-off, not paper.
