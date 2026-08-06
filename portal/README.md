# FabEdge FDC console — the live demo app

The Next.js app deployed at **https://edge-ai-demo.vercel.app**. `/` is the
whole product: a tool-health (FDC) console for a **simulated** plasma-etch
bay, scored live by the same SPC model the on-prem kit runs — ported to
TypeScript and executed entirely in the visitor's browser. No backend at
runtime; the only serverless code is the optional AI stand-in
(`/api/explain`, `/api/chat`).

`/corridor` is a second, self-contained simulation console: the
corridor-vegetation-inspection kit's ground-side pipeline (per-station upload,
bounded working storage with alert-then-backpressure, swappable vision scoring,
outbound-only queues across a severable WAN, evidence records with traceability
metadata). It runs on its own core in `lib/corridor/` and imports nothing from
`lib/demo/` — the parity contract below is untouched by it.

Documentation lives in the repo root ([README](../README.md),
[docs/LOCAL-SETUP.md](../docs/LOCAL-SETUP.md),
[docs/LAB-MVP-SETUP.md](../docs/LAB-MVP-SETUP.md)) — not in this app. Old portal
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

**All three consoles carry a guided scenario**, so any of them can be driven by
someone who did not build it: `lib/console/scenario.ts` (excursion to recovery),
`lib/corridor/scenario.ts` (outage to recovery), `lib/substrate/scenario.ts`
(outage, evidence, tamper). They share one contract in `lib/console/guided.ts`
and one panel (`components/console/ScenarioPanel.tsx`). A step is a pure
condition over that console's own view, which is why
`tests/console/guided-scenarios.test.ts` can drive each one to completion
against the real engine and fail if any step is unreachable — the check that
keeps a scenario honest when the simulation changes underneath it.

Every step also carries a **`stack` line** — what runs that behaviour in the real
kit, rendered under an explicit "In the kit:" label. This exists because without
it the consoles pass a name-swap test: a competitor could demo the same steps on
their own stack, since nothing on screen tied any observed behaviour to anything.
The full stack was always named, but inside a collapsed `<details>` at the bottom
of the page — invisible during the demo, which is the only time it matters. The
"In the kit:" framing is not decoration: the browser runs a simulation, no
product executes here, and the test suite asserts both that most steps name a
real component and that no attribution is phrased as a live event.

Scenario order is load-bearing in both of the newer consoles, and both learned
it the hard way from that test: corridor storage never fills while the WAN is up
(evidence drains as fast as it is produced), and a substrate bundle cannot be
tampered once it has shipped. Put the outage first, or the demo has nothing to
show.

**Every console carries a footprint strip** (`components/console/FootprintStrip.tsx`,
data in `lib/console/footprint.ts`) directly above the guided scenario: the
single-node shape, the SL Micro / K3s / NeuVector floors, and how a viewer gets
from watching to running (the kit is a partner hand-off; one `make up`, ~15 min
on a laptop, installs nothing globally). It
exists because the control-room polish argues against the claim the factory
rests on — nobody watching strip charts and an alarm journal thinks "we could
stand that up before lunch" — and because the person whose signature you need is
asking what delivery takes, not whether Kubernetes survives a WAN cut. Styled
deliberately quiet: ISA-101 reserves colour for abnormal states and operator
actions, and a footprint is neither.

Every figure in it is **quoted** from that kit's
`handoff/03-production-footprint.md` and `handoff/00-partner-handoff-runbook.md`,
never estimated here — the no-fabrication rule applies to a customer-facing
screen exactly as it applies to a deck. `tests/console/footprint.test.ts` pins
the quoted values and the citations, so a change to a kit's footprint doc breaks
a test rather than silently leaving a stale number on a live page. It also
asserts the strip never claims HA these single-node kits do not have, and never
names **k3d**.

That last one is a real distinction, not pedantry: k3d is "k3s in Docker", the
laptop stand-in the kit's demo uses, and the kits' own component maps list it in
the *what the demo uses* column against `SUSE Linux Micro + K3s` in production.
On a strip headed "what this takes to run", scaffolding reads as the product —
so K3s is the only Kubernetes this screen names, and the docker/k3d/kubectl
prerequisites stay in the runbook where someone is about to type them.

The second line was once "Rebuild it yourself: docker + k3d + kubectl, then
`make up`". That is an instruction the page cannot carry out — a public demo URL
has no repo to run `make up` in — and "rebuild" read as *rebuild this browser
demo*, when `make up` builds the on-prem kit instead. It now names the hand-off
that actually puts the kit in a partner's hands and states plainly that what
comes up is real containers rather than this simulation.

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
