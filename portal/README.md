# FabEdge FDC console — the live demo app

The Next.js app deployed at **https://edge-ai-demo.vercel.app**. `/` is the
whole product: a tool-health (FDC) console for a **simulated** plasma-etch
bay, scored live by the same SPC model the on-prem kit runs — ported to
TypeScript and executed entirely in the visitor's browser. No backend at
runtime; the only serverless code is the optional AI stand-in
(`/api/explain`, `/api/chat`).

Documentation lives in the repo root ([README](../README.md),
[docs/LAB-SETUP.md](../docs/LAB-SETUP.md)) — not in this app. Old portal
URLs (`/demo`, `/ledger`, `/kits/*`) redirect (see `next.config.ts`).

## Design

Control-room UI informed by ISA-101 high-performance-HMI practice: one
committed dark near-neutral theme; color reserved for abnormal states
(yellow/orange/red) and operator actions (blue); no green-means-good;
IBM Plex Sans/Mono with tabular numerics. Screens: SEMI-E10 tool-state
grid, sensor strip-charts with UCL/LCL from the simulator's own operating
point, Hotelling T²/EWMA health strip with contribution bars, ISA-18.2-style
alarm journal, sovereignty panel, AI diagnosis panel, and a scripted guided
scenario (`lib/console/scenario.ts`) — no tour library.

Honesty contract: a persistent chip ("SIMULATED FAB · same SPC model as the
on-prem kit · golden-parity-tested") plus a "what is real here" footer
panel. NeuVector is named as the kit's enforcement of the boundary the sim
genuinely implements — never rendered as fake live events.

## The parity contract (do not break)

`lib/demo/` is the golden-parity core — the TypeScript port of the kit's
Python pipeline. The Python model
(`../reference-kits/semiconductor-predictive-maintenance/demo/images/edge-inference/app/health_model.py`)
is the **source of truth**. If either side changes:

```bash
python3 scripts/generate-golden-vectors.py   # re-record from the Python model
npm test                                     # parity suite must pass
```

`lib/console/` is presentation only and must stay that way.

## AI stand-in routes

`/api/explain` and `/api/chat` run the kit's own prompts
(`service.py`'s `_api_explain` / `_fleet_context`) against a hosted Claude
model via the official SDK. They accept **derived verdicts only** (parsed
and rejected otherwise — raw telemetry has no path into a prompt), are
rate-limited, and degrade to the kit-style "answered on-prem via make ai"
note when `ANTHROPIC_API_KEY` is unset. Enable on Vercel: Project →
Settings → Environment Variables → `ANTHROPIC_API_KEY`.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # vitest: parity + engine + console suites
npm run lint
npm run build   # '/' must stay statically prerendered
```

Deploys are git-integrated: push to `main` and Vercel builds `portal/`
(project root directory is set to `portal`).
