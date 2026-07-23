import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/server";
import type {
  ComponentMapRow,
  FootprintSpec,
  LedgerPhase,
  OpenThread,
  ProofKit,
  ProofKitDetail,
  ScaleUpStage,
} from "@/lib/types";

/**
 * Every query takes an optional client so tests can inject a fake and
 * production code can rely on the default (real) singleton. This is the
 * only seam the data layer needs — no mocking framework required.
 */
type Client = SupabaseClient;

export async function getProofKits(
  client: Client = getSupabaseClient()
): Promise<ProofKit[]> {
  const { data, error } = await client
    .from("proof_kits")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as ProofKit[];
}

export async function getProofKit(
  slug: string,
  client: Client = getSupabaseClient()
): Promise<ProofKitDetail | null> {
  const { data: kit, error: kitError } = await client
    .from("proof_kits")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (kitError) throw kitError;
  if (!kit) return null;

  const [componentMap, scaleUpStages, footprintSpecs] = await Promise.all([
    client
      .from("component_map_rows")
      .select("*")
      .eq("kit_slug", slug)
      .order("sort_order", { ascending: true }),
    client
      .from("scale_up_stages")
      .select("*")
      .eq("kit_slug", slug)
      .order("sort_order", { ascending: true }),
    client
      .from("footprint_specs")
      .select("*")
      .eq("kit_slug", slug)
      .order("sort_order", { ascending: true }),
  ]);
  if (componentMap.error) throw componentMap.error;
  if (scaleUpStages.error) throw scaleUpStages.error;
  if (footprintSpecs.error) throw footprintSpecs.error;

  return {
    kit: kit as ProofKit,
    componentMap: componentMap.data as ComponentMapRow[],
    scaleUpStages: scaleUpStages.data as ScaleUpStage[],
    footprintSpecs: footprintSpecs.data as FootprintSpec[],
  };
}

export async function getLedgerPhases(
  client: Client = getSupabaseClient()
): Promise<LedgerPhase[]> {
  const { data, error } = await client
    .from("ledger_phases")
    .select("*")
    .order("phase_number", { ascending: true });
  if (error) throw error;
  return data as LedgerPhase[];
}

export async function getOpenThreads(
  client: Client = getSupabaseClient()
): Promise<OpenThread[]> {
  const { data, error } = await client
    .from("open_threads")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as OpenThread[];
}
