@AGENTS.md

# Edge Proof Factory Portal — FabEdge FDC console

Read `README.md` first — stack, design system, parity contract, dev/test
commands. This is the Next.js app deployed at **https://edge-ai-demo.vercel.app**.
`/` is the whole product: an in-browser SIMULATION of the kit's FDC pipeline,
scored by the same SPC model the on-prem kit runs. There is **no backend at
runtime** — the former Supabase layer was removed entirely (no `supabase/`
dir exists; don't look for seed-data.ts or migrations). The only serverless
code is the AI stand-in (`/api/explain`, `/api/chat`), which degrades
gracefully when `ANTHROPIC_API_KEY` is unset.

## The parity contract — this app is NOT unrelated to the kit

`lib/demo/` is a TypeScript port of the kit's Python model
(`../reference-kits/semiconductor-predictive-maintenance/demo/images/edge-inference/app/health_model.py`).
The **Python model is the source of truth**. Never edit `lib/demo/` freely:
if either side changes, re-record golden vectors and re-run the parity suite
(procedure in `README.md` §"The parity contract"). `lib/console/` is
presentation only and must stay that way.

## Git / deploy facts

- This portal is **not** its own git repo — it's tracked inside the
  `edge-proof-factory` repo. Vercel builds it because the project's Root
  Directory is set to `portal` (see BUILD-LEDGER Phase 12).
- A push to `main` therefore triggers **both** a Vercel build of the portal
  **and** a Fleet resync of the kit's manifests. One commit, two blast radii.
- Old portal URLs (`/demo`, `/ledger`, `/kits/*`) 301-redirect (see
  `next.config.ts`) — the console IS the root page.
