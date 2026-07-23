import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Thrown when the Supabase env vars are missing. Pages let this reach the
 * nearest `error.tsx` boundary, which renders setup instructions instead of a
 * raw stack trace — the same "clear note, not an errno" rule the factory's
 * demo /api/explain endpoint follows (BUILD-LEDGER.md Phase 9).
 */
export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example) and reload."
    );
    this.name = "SupabaseNotConfiguredError";
  }
}

let cached: SupabaseClient | null = null;

/**
 * Server-only client for public, read-only catalog data. The anon key is
 * safe to hold server-side (it's also shipped to browsers in other Supabase
 * apps) because every table it reads is covered by an RLS policy that grants
 * `select` to `anon`/`authenticated` and nothing else — see migration 0001.
 */
export function getSupabaseClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new SupabaseNotConfiguredError();

  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

/** Test-only: clear the cached client so each test can inject its own. */
export function _resetSupabaseClientForTests(): void {
  cached = null;
}
