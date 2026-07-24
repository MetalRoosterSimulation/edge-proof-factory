# RUN.md — produce a new Proof Kit

Input:
```
Use case: [Partner] / [Industry] / [Use case]
```

## Stage 0 — seed from the sibling factories (don't re-research)
- Pull the architecture + build process + PS playbook from
  `~/Work/use-case-factory/output/<partner>/<...>/` if it exists.
- Pull the use-case pattern + economics from
  `~/Work/bd-trigger-to-deal-factory/Edge/docs/use-case-library.md` and
  `engagement-economics.md`.
- Pull SUSE product facts from `docs/suse-edge-ai-stack.md`; grep the shared
  `suse-brain.md` for anything missing. Record versions with sources.

## Stage 1 — design the minimal all-open demo
- List the architecture's tiers. For each, pick the **openly-pullable** component
  that plays the same role (k3s, mosquitto, Ollama/Open WebUI, the vendor's own
  OSS SDK where one exists — e.g. Losant `losant-mqtt`, `losant/edge-agent`).
- Keep it single-node, CPU-only, laptop-class. Anything needing a GPU or an
  entitlement becomes an **optional profile**, never the base.
- Preserve the architecture's truths (data-governance boundary, which tier
  computes what). If you must simplify for footprint, note it for the component map.

## Stage 2 — build it (this is the work)
- `demo/images/*` — write the services; keep any real logic (models, protocols)
  in a module that is **unit-tested on the host**, not only in a container.
- `demo/k8s/base` — kustomize, minimal resources, NodePort for the UI.
- `demo/Makefile` — `up / fault / heal / status / test / down` at minimum.
- Optional profiles under `demo/k8s/<profile>` + a make target.

## Stage 3 — prove it (gate: no proof, no ship)
- `make up` on a fresh k3d cluster; confirm the UI is reachable on the host port.
- Exercise the use case live (inject the failure the use case is about; confirm
  the system detects/handles it). Capture a dashboard screenshot to `handoff/assets`.
- `make test` green. `tools/validate_kit.py` green.

## Stage 4 — write the hand-off kit (from templates/)
- `handoff/00-partner-handoff-runbook.md` — rebuild + pilot + connect + economics.
- `handoff/01-component-map.md` — open → SUSE-supported, sourced versions.
- `handoff/02-scale-up-path.md` — four phases (ASSESS → PILOT → ROLL OUT → DAY 2 &
  SCALE), owner-tagged.
- `handoff/03-production-footprint.md` — sourced floors; call out where a GPU
  changes the number.
- Voice: pilot's manual. No coaching, no banned filler, economics services-first.

## Stage 5 — validate + commit
- `python3 tools/validate_kit.py reference-kits/<use-case>`
- Path-scoped git add + commit. Never `git add -A`; never commit secrets.
- Add a line to `BUILD-LEDGER.md`.
