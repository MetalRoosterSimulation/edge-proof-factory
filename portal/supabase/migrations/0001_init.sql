-- Edge Proof Factory Portal — initial schema
--
-- Five tables mirror the factory's existing markdown structure exactly:
-- BUILD-LEDGER.md -> ledger_phases + open_threads; reference-kits/<kit>/handoff/
-- 01-03 -> proof_kits + component_map_rows + scale_up_stages + footprint_specs.
-- The portal is a read replica of what already lives in git, not a new
-- source of truth — see supabase/seed-data.ts for the real content and
-- supabase/README.md for how the two stay in sync.
--
-- RLS model: every table is public-read (anon + authenticated `select`) and
-- has no insert/update/delete policy, so those are denied by default once RLS
-- is enabled. Writes only ever happen via the service-role key from a
-- trusted context (the seed script, or a future admin tool) — never from the
-- browser or the anon key used by the Next.js app.

create extension if not exists pgcrypto;

-- proof_kits -----------------------------------------------------------

create table proof_kits (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  partner text not null,
  customer text not null,
  industry text not null,
  use_case text not null,
  status text not null check (status in ('built-and-verified', 'in-progress', 'planned')),
  summary text not null,
  demo_path text not null,
  repo_url text,
  created_at timestamptz not null default now()
);

alter table proof_kits enable row level security;

create policy "proof_kits are publicly readable"
  on proof_kits for select
  to anon, authenticated
  using (true);

-- component_map_rows -----------------------------------------------------
-- The demo->production swap list (handoff/01-component-map.md, table rows).

create table component_map_rows (
  id uuid primary key default gen_random_uuid(),
  kit_slug text not null references proof_kits (slug) on delete cascade,
  demo_component text not null,
  role text not null,
  production_component text not null,
  pinned_version text not null,
  sort_order int not null default 0
);

create index component_map_rows_kit_slug_idx on component_map_rows (kit_slug);

alter table component_map_rows enable row level security;

create policy "component_map_rows are publicly readable"
  on component_map_rows for select
  to anon, authenticated
  using (true);

-- scale_up_stages --------------------------------------------------------
-- The four-stage services plan (handoff/02-scale-up-path.md).

create table scale_up_stages (
  id uuid primary key default gen_random_uuid(),
  kit_slug text not null references proof_kits (slug) on delete cascade,
  stage_number int not null,
  title text not null,
  body_md text not null,
  sort_order int not null default 0
);

create index scale_up_stages_kit_slug_idx on scale_up_stages (kit_slug);

alter table scale_up_stages enable row level security;

create policy "scale_up_stages are publicly readable"
  on scale_up_stages for select
  to anon, authenticated
  using (true);

-- footprint_specs ----------------------------------------------------------
-- Sourced hardware floors (handoff/03-production-footprint.md).

create table footprint_specs (
  id uuid primary key default gen_random_uuid(),
  kit_slug text not null references proof_kits (slug) on delete cascade,
  component text not null,
  minimum_spec text not null,
  sort_order int not null default 0
);

create index footprint_specs_kit_slug_idx on footprint_specs (kit_slug);

alter table footprint_specs enable row level security;

create policy "footprint_specs are publicly readable"
  on footprint_specs for select
  to anon, authenticated
  using (true);

-- ledger_phases ------------------------------------------------------------
-- Factory-level build history (BUILD-LEDGER.md "## Phase N" sections). Not
-- scoped to a single kit — the ledger tracks the factory itself.

create table ledger_phases (
  id uuid primary key default gen_random_uuid(),
  phase_number int not null unique,
  title text not null,
  status text not null check (status in ('done', 'in-progress')),
  body_md text not null,
  done_date date
);

alter table ledger_phases enable row level security;

create policy "ledger_phases are publicly readable"
  on ledger_phases for select
  to anon, authenticated
  using (true);

-- open_threads ---------------------------------------------------------
-- BUILD-LEDGER.md "## Open threads" section.

create table open_threads (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  status text not null check (status in ('open', 'resolved')) default 'open',
  created_at timestamptz not null default now()
);

alter table open_threads enable row level security;

create policy "open_threads are publicly readable"
  on open_threads for select
  to anon, authenticated
  using (true);

-- Grants ---------------------------------------------------------------
-- RLS policies alone are not enough: Postgres also requires the role to
-- hold a base GRANT before RLS is even consulted. Without this, every query
-- above fails with "permission denied for table ..." (42501), RLS policy
-- notwithstanding.

grant usage on schema public to anon, authenticated;

grant select on
  proof_kits,
  component_map_rows,
  scale_up_stages,
  footprint_specs,
  ledger_phases,
  open_threads
to anon, authenticated;
