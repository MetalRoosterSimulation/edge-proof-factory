@AGENTS.md

# Edge Proof Factory Portal

Read `README.md` first — stack, data model, local dev, testing, and the
Supabase/Vercel deploy steps that need the user's own login. This is the
Vercel + Supabase presentation layer for `~/Work/edge-proof-factory`; the
factory's actual deliverable (the runnable k3s/Rancher demo in
`../reference-kits/`) is unrelated code and unaffected by anything here.

Content lives in `supabase/seed-data.ts` (source of truth, sourced from the
factory's own docs — never invent a fact) and `supabase/migrations/`
(schema). Never hand-edit `supabase/seed.sql` — it's generated.

