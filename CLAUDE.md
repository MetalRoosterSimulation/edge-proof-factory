# CLAUDE.md — Edge Proof Factory map

Read this first. This factory turns a SUSE Edge/AI use case into a **runnable
minimal-footprint MVP** + a **partner hand-off kit** ("Proof Kit"). It is the
build/demo/hand-off sibling of the paper-producing factories:
`~/Work/bd-trigger-to-deal-factory/Edge` (BD messaging) and
`~/Work/use-case-factory` (architecture packages). It does not duplicate them — it
consumes their output (use case, architecture, economics) and produces the proof.

## Non-negotiables
1. **Runnable, not described.** Every kit's `demo/` must actually `make up` on a
   single-node k3s cluster and be tested end-to-end before it ships. No
   described-but-unbuilt manifests.
2. **Minimal footprint to demo.** All-open, openly-pullable images; CPU-only;
   single node; laptop-class. No SUSE entitlement required to *see it work*.
3. **Honest hand-off.** Every open demo component maps to its SUSE-supported
   production equivalent with a **sourced** version (SUSE Edge release matrix) and
   the real hardware floors. Never present the laptop footprint as the production
   footprint (esp. SUSE AI: 4c/32GB + GPU floor).
4. **Pilot's-manual voice** ([[pilots-manual-not-coaching]]): facts + owner-tagged
   steps only. No selling psychology. Banned filler words (leverage, seamless,
   robust, end-to-end as an adjective). Economics services-first, resale attached.
5. **No fabrication.** Product facts come from `docs/suse-edge-ai-stack.md`
   (grep the shared `suse-brain.md` for anything missing) with sources. Unknown
   numbers stay as ranges or `[FILL]`; never invent node counts, durations, prices.
6. **Faithful architecture.** Match the use-case-factory's architecture (e.g. the
   GEA is a relay, not the compute; governance boundary forwards derived data
   only). If the demo must diverge for footprint, say so in the component map.

## Layout
- `reference-kits/<use-case>/demo/` — runnable MVP (images/, k8s/, Makefile, tests/).
- `reference-kits/<use-case>/handoff/` — 00 runbook, 01 component-map, 02 scale-up,
  03 footprint, README, assets/.
- `integrations/rancher-mcp-server/` — Rancher fleet MCP server (reusable).
- `docs/` — project-brief, suse-edge-ai-stack, handoff-doctrine, footprint-rules.
- `templates/` — component-map / runbook / scale-up templates for new kits.
- `tools/validate_kit.py` — the release gate (run before shipping a kit).
- `portal/` — the live demo app (Vercel, no backend at runtime): '/' is the
  FabEdge FDC console — an in-browser SIMULATION of the kit's pipeline
  (TypeScript port in `portal/lib/demo/`, golden-parity-tested against the
  Python model; labeled on-page; the kit stays the deliverable). Docs live in
  GitHub (README.md, docs/LAB-SETUP.md), not the app. See `portal/README.md`.

## To produce a new Proof Kit
Follow `docs/factory/RUN-A-NEW-KIT.md`. In short: pull the use case + architecture from the sibling
factories → design the minimal all-open demo that mirrors that architecture →
build & test it end-to-end (`make up`, inject a fault, unit tests) → write the
hand-off kit from `templates/` grounded in `docs/suse-edge-ai-stack.md` →
`tools/validate_kit.py` → commit.

## Git gotchas
This factory is its OWN git repo (root = this directory, remote
`MetalRoosterSimulation/edge-proof-factory`) — commit here, not the home-dir
repo. Still path-scope adds (never `git add -A`): `~/.mcp.json` secrets
context lives above, and `node_modules/`, `.rancher-env`,
`*credentials.env`, `.env.local` are gitignored — never commit secrets.
User-facing docs (README, docs/LAB-SETUP.md) must stay copy-paste portable —
`tools/validate_kit.py` fails on machine-specific paths.
