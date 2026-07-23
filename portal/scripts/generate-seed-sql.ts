/**
 * Renders supabase/seed-data.ts (the canonical, sourced content) into
 * supabase/seed.sql (what `supabase db reset` / `supabase start` actually
 * runs). Run via `npm run db:seed:generate` after editing seed-data.ts.
 *
 * Do not hand-edit seed.sql — it is generated output and gets clobbered.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  componentMap,
  footprintSpecs,
  ledgerPhases,
  openThreads,
  proofKits,
  scaleUpStages,
} from "../supabase/seed-data";

function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

function insertStatement(
  table: string,
  rows: Record<string, unknown>[]
): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  const values = rows
    .map((row) => `  (${columns.map((c) => sqlValue(row[c])).join(", ")})`)
    .join(",\n");
  return `insert into ${table} (${columns.join(", ")}) values\n${values};\n`;
}

const truncate = `truncate table
  proof_kits, component_map_rows, scale_up_stages, footprint_specs,
  ledger_phases, open_threads
  restart identity cascade;\n`;

const sql = [
  "-- GENERATED FILE — do not edit by hand.",
  "-- Source: supabase/seed-data.ts. Regenerate with `npm run db:seed:generate`.",
  "",
  truncate,
  insertStatement("proof_kits", proofKits),
  insertStatement("component_map_rows", componentMap),
  insertStatement("scale_up_stages", scaleUpStages),
  insertStatement("footprint_specs", footprintSpecs),
  insertStatement("ledger_phases", ledgerPhases),
  insertStatement("open_threads", openThreads),
].join("\n");

const outPath = join(__dirname, "..", "supabase", "seed.sql");
writeFileSync(outPath, sql);
console.log(`Wrote ${outPath}`);
