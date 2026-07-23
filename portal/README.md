# Edge Proof Factory — Partner Portal

A read-only Next.js 16 + Supabase web app that surfaces the factory's proof
kit catalog, component maps, scale-up paths, footprint specs, and build
ledger as a public, always-current page — instead of a partner having to
clone the repo and read markdown.

**This is a presentation layer, not a replacement.** The factory's actual
deliverable — a runnable k3s/Rancher demo (`../reference-kits/*/demo`) — is
unchanged and cannot run on Vercel (Vercel is serverless; it cannot host a
persistent Kubernetes cluster). The portal only *displays* what the demo and
hand-off docs already prove.

## Stack

- **Next.js 16** (App Router, Turbopack). Next 16 has real breaking changes
  vs. earlier versions — `AGENTS.md` in this directory points at
  `node_modules/next/dist/docs/` for the current conventions (route `params`
  are now a `Promise`, `PageProps`/`LayoutProps` helpers, Cache Components as
  an opt-in — **not enabled here**, see below). Read those docs, not
  pre-2026 Next.js knowledge, before changing routing or data-fetching code.
- **Supabase** (Postgres + PostgREST) as the only backend. No custom API
  routes — Server Components query Supabase directly (`lib/data.ts`).
- **Vercel** for hosting (the officially verified Next.js adapter).
- **Vitest + React Testing Library** for tests.

### Why Cache Components is off

Next 16 ships an opt-in `cacheComponents` mode (Partial Prerendering + `"use
cache"`). This app deliberately does **not** enable it: every data-driven
route is small, low-traffic, and needs to reflect Supabase changes
immediately (a new ledger phase should appear without a redeploy). Instead,
`/`, `/kits/[slug]`, and `/ledger` each export `export const dynamic =
"force-dynamic"` — plain per-request rendering, no caching subtlety to get
wrong. Revisit this only if traffic or Supabase read volume ever makes it a
real cost problem; it isn't one at this scale.

## Data model

Five tables (`supabase/migrations/0001_init.sql`), one per section of the
existing handoff docs:

| Table | Mirrors |
|---|---|
| `proof_kits` | `reference-kits/<kit>/README.md` + `handoff/00-partner-handoff-runbook.md` |
| `component_map_rows` | `handoff/01-component-map.md` |
| `scale_up_stages` | `handoff/02-scale-up-path.md` |
| `footprint_specs` | `handoff/03-production-footprint.md` |
| `ledger_phases` / `open_threads` | `../BUILD-LEDGER.md` |

Every table is public-read (RLS policy grants `select` to `anon` +
`authenticated`, no policy for insert/update/delete — those are denied by
default). Nobody writes through the app; content changes by editing
`supabase/seed-data.ts` and re-seeding (see below). If a future admin UI is
added, it must use the **service-role key** server-side, never the anon key.

`supabase/seed-data.ts` is the source of truth for content, not
`supabase/seed.sql` — the latter is generated (`npm run db:seed:generate`)
and gets overwritten. Every fact in `seed-data.ts` is transcribed from the
factory's existing docs (see the table above), not invented, per the
factory's "no fabrication" rule (`../docs/project-brief.md`).
`tests/lib/seed-data.test.ts` checks referential integrity (no orphaned
`kit_slug`, no duplicate ledger phase numbers) so a typo there fails CI
instead of shipping a broken link.

## Local development

```bash
npm install
npm run db:start          # local Supabase via Docker (Postgres, Studio, Kong…)
cp .env.example .env.local
# fill NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY from:
npx supabase status
npm run dev                # http://localhost:3000
```

Supabase Studio (table browser) runs at `http://localhost:54323`.

Changed `supabase/seed-data.ts` or added a migration?

```bash
npm run db:seed:generate   # regenerate seed.sql from seed-data.ts
npm run db:reset           # drop, recreate, re-migrate, re-seed
```

Stop everything with `npm run db:stop`.

## Testing

```bash
npm test          # vitest run — data layer (fake Supabase client), seed-data
                   # referential integrity, and component rendering
npm run lint
npm run build      # also type-checks and confirms static-vs-dynamic routing
```

The data layer (`lib/data.ts`) takes an optional injected Supabase client, so
tests exercise real query logic (`.select().eq().order()` chains) against an
in-memory fake (`tests/lib/fake-supabase-client.ts`) without a network call —
see `tests/lib/data.test.ts`. This was additionally verified against a real
local Postgres instance (`npm run db:start` + `npm run build` + `npm start`)
before this was committed — not just unit-tested in isolation.

## Deployed

- **Live app:** https://edge-ai-demo.vercel.app
- **Supabase project:** `edge-ai-demo` (ref `vpdtwiyvatpwzkapvmcl`, us-east-1,
  free tier) — a project dedicated to this portal, not shared with
  `svirt-sizing-tool`.
- **Vercel project:** `edge-ai-demo`, team `rooneyjoseph29-9646's projects`.

Both were provisioned and deployed via their MCP servers directly (OAuth —
no token ever typed in chat): `~/.mcp.json` (root-level, so it's visible from
any project in this session) wires up `vercel` and `supabase`. The Supabase
entry is intentionally unscoped (no `project_ref`) so account-level tools
(`list_organizations`, `create_project`) stay available for future projects;
narrow it to `?project_ref=vpdtwiyvatpwzkapvmcl` once this is the only
Supabase project you manage from here.

**Now git-integrated:** the Vercel project is connected to
`github.com/MetalRoosterSimulation/edge-proof-factory` (Root Directory
`portal`) — every push to `main` auto-deploys. `NEXT_PUBLIC_SUPABASE_URL`
and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set as real Production+Preview
Environment Variables (`vercel env add`), not the one-shot
`.env.production` file the very first deploy used.

**Gotcha if you ever reconnect this project to a repo:** Vercel does not
retroactively build the repo's current HEAD when you change its git
connection — it only builds on the *next* push, so you may need an empty
trigger commit (`git commit --allow-empty`). Also confirm **Root
Directory** is set to `portal` (Project Settings → General) if the app
lives in a subdirectory of the connected repo, as it does here — otherwise
the build fails with `Couldn't find any pages or app directory`, since
Vercel looks for `app/`/`pages/` at the repo root by default.

### Doing it from scratch instead (no MCP servers connected)

1. **Supabase** — create a **new, dedicated** project. Push the schema:
   `npx supabase link --project-ref <ref>` then `npx supabase db push
   --include-seed` (reads `supabase/seed-data.ts` via the generated
   `seed.sql`).
2. **Vercel** — `vercel link` this directory, set the two env vars (Project
   Settings → Environment Variables) to the hosted project's values (Supabase
   Project Settings → API), then `vercel deploy --prod`.

## Known upstream advisory

`npm audit` reports 2 high-severity advisories (`postcss`, `sharp`) — both
are vendored **inside** `next`'s own `node_modules` (build-time CSS tooling /
`next/image` optimizer), not top-level dependencies of this app. `npm audit
fix --force` would downgrade to `next@9.3.3`, which is not a real fix.
Tracked as: wait for an upstream Next.js patch release; not a workaround.
