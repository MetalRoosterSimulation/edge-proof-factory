# Edge Proof Factory

**Show a SUSE Edge/AI use case working end-to-end on a laptop in minutes, then hand
the partner everything they need to rebuild it on their own limited hardware.**

The BD factory (`~/Work/bd-trigger-to-deal-factory/Edge`) and the use-case factory
(`~/Work/use-case-factory`) produce paper — messaging, diagrams, playbooks. This
factory produces the two things they do not: a **runnable minimal-footprint MVP**
and a **partner hand-off kit**.

## Unit of work → output

```
Use case: [Partner] / [Industry] / [Use case]
```
→ a **Proof Kit**: `demo/` (a `make up` MVP on single-node k3s, all-open images,
CPU-class) + `handoff/` (rebuild runbook, component map to the SUSE-supported
stack, four-phase scale-up path, sourced footprints).

## See it now

**New here? Read [`HOW-TO-RUN-THIS-DEMO.md`](HOW-TO-RUN-THIS-DEMO.md)** — a
foolproof, copy-paste run guide with "what you should see" at every step.

```bash
cd reference-kits/semiconductor-predictive-maintenance/demo
make up            # ~2 min; opens an ops dashboard on :18080
make fault TOOL=etch-03   # watch a tool degrade; RUL counts down
```

## Map

- `reference-kits/semiconductor-predictive-maintenance/` — the fully-worked kit
  (runnable + tested). Read its `README.md`.
- `integrations/rancher-mcp-server/` — MCP server so an AI assistant can see your
  Rancher fleet and deploy a kit via Fleet GitOps.
- `portal/` — Next.js + Supabase partner portal presenting the kit catalog and
  build ledger as a live web page (Vercel-hosted once deployed). Read its
  `README.md`. Does not run the demo itself — see its "not a replacement" note.
- `docs/` — the factory brain: `project-brief.md` (mandate + locked decisions),
  `suse-edge-ai-stack.md` (sourced SUSE product facts), `handoff-doctrine.md`
  (the open→SUSE mapping rules + voice), `footprint-rules.md`.
- `CLAUDE.md` — the factory map. `RUN.md` — how to produce a new Proof Kit.
- `BUILD-LEDGER.md` — how this was built, phase by phase.
