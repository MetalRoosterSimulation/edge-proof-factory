// Row shapes mirror supabase/migrations/0001_init.sql exactly — keep both in sync.

export type ProofKit = {
  id: string;
  slug: string;
  name: string;
  partner: string;
  customer: string;
  industry: string;
  use_case: string;
  status: "built-and-verified" | "in-progress" | "planned";
  summary: string;
  demo_path: string;
  repo_url: string | null;
  created_at: string;
};

export type ComponentMapRow = {
  id: string;
  kit_slug: string;
  demo_component: string;
  role: string;
  production_component: string;
  pinned_version: string;
  sort_order: number;
};

export type ScaleUpStage = {
  id: string;
  kit_slug: string;
  stage_number: number;
  title: string;
  body_md: string;
  sort_order: number;
};

export type FootprintSpec = {
  id: string;
  kit_slug: string;
  component: string;
  minimum_spec: string;
  sort_order: number;
};

export type LedgerPhase = {
  id: string;
  phase_number: number;
  title: string;
  status: "done" | "in-progress";
  body_md: string;
  done_date: string | null;
};

export type OpenThread = {
  id: string;
  description: string;
  status: "open" | "resolved";
  created_at: string;
};

export type ProofKitDetail = {
  kit: ProofKit;
  componentMap: ComponentMapRow[];
  scaleUpStages: ScaleUpStage[];
  footprintSpecs: FootprintSpec[];
};
