/**
 * ai-context.ts — prompt construction for the demo's AI stand-in tier.
 *
 * In the k3s kit these prompts are built by the inference service and
 * answered ON-PREM by the SUSE AI tier (Ollama; Phase 9, verified live —
 * no data leaving the cluster):
 *   - service.py `_fleet_context` grounds an OpenAI-compatible chat
 *     ("Fab Assistant", served to Open WebUI) in the live fleet snapshot;
 *   - service.py `_api_explain` asks the local model to explain one tool's
 *     anomaly from the SPC model's own attribution.
 *
 * The portal cannot run Ollama, so /api/explain and /api/chat call a hosted
 * Claude model instead — a clearly-labeled stand-in. The governance contract
 * survives the substitution BY CONSTRUCTION: these builders accept only the
 * derived verdict shape (health, state, RUL, warming, z-score attribution —
 * the same fields the kit's governed egress publishes). Raw sensor readings
 * have no path into a prompt.
 */

/** The derived-only payload the AI routes accept. Mirrors the kit's egress
 * contract (service.py `_derived`) plus the model's own attribution. */
export type DerivedVerdict = {
  tool_id: string;
  health: number;
  state: string;
  rul_frames: number | null;
  warming: boolean;
  top_contributors: Array<{ sensor: string; z: number }>;
};

const TOOL_ID_RE = /^[a-z0-9-]{1,32}$/;
const SENSOR_RE = /^[a-z0-9_]{1,64}$/;
const STATES = new Set(["HEALTHY", "WATCH", "WARNING", "CRITICAL"]);

/** Parse an untrusted request body into the derived contract — anything
 * outside it (raw sensor values included) is rejected, not passed through. */
export function parseDerived(input: unknown): DerivedVerdict | null {
  if (typeof input !== "object" || input === null) return null;
  const o = input as Record<string, unknown>;
  if (typeof o.tool_id !== "string" || !TOOL_ID_RE.test(o.tool_id)) return null;
  if (typeof o.health !== "number" || !Number.isFinite(o.health)) return null;
  if (typeof o.state !== "string" || !STATES.has(o.state)) return null;
  const rul =
    o.rul_frames === null || o.rul_frames === undefined
      ? null
      : typeof o.rul_frames === "number" && Number.isFinite(o.rul_frames)
        ? Math.round(o.rul_frames)
        : undefined;
  if (rul === undefined) return null;
  const rawTops = Array.isArray(o.top_contributors) ? o.top_contributors : [];
  if (rawTops.length > 6) return null;
  const tops: DerivedVerdict["top_contributors"] = [];
  for (const t of rawTops) {
    if (typeof t !== "object" || t === null) return null;
    const c = t as Record<string, unknown>;
    if (typeof c.sensor !== "string" || !SENSOR_RE.test(c.sensor)) return null;
    if (typeof c.z !== "number" || !Number.isFinite(c.z)) return null;
    tops.push({ sensor: c.sensor, z: Math.round(c.z * 100) / 100 });
  }
  return {
    tool_id: o.tool_id,
    health: Math.round(Math.max(0, Math.min(100, o.health)) * 100) / 100,
    state: o.state,
    rul_frames: rul,
    warming: o.warming === true,
    top_contributors: tops,
  };
}

/** Port of service.py `_api_explain`'s prompt (same wording, same inputs). */
export function explainPrompt(v: DerivedVerdict): string {
  const contribs =
    v.top_contributors.map((c) => `${c.sensor} (z=${c.z})`).join(", ") ||
    "no dominant signal";
  return (
    `You are a semiconductor fab maintenance assistant. A plasma-etch ` +
    `tool '${v.tool_id}' has health ${v.health}/100 (state ${v.state}). ` +
    `The strongest anomaly signals are: ${contribs}. In 2-3 sentences, ` +
    `explain the most likely failure mode and the first maintenance action. ` +
    `Be specific and concise.`
  );
}

/** Port of service.py `_fleet_context` — the live-fleet system prompt that
 * grounds the Fab Assistant chat. Input is a list of derived verdicts,
 * worst first (the same snapshot the dashboard renders). */
export function fleetContext(snapshot: DerivedVerdict[]): string {
  const lines = [
    "You are the Fab Edge maintenance assistant for a semiconductor " +
      "plasma-etch line. Answer ONLY from the live tool data below " +
      "(health 0-100; RUL = forecast cycles to critical; z = sensor " +
      "anomaly). Be concise and specific, name the tool and the first " +
      "maintenance action. If asked about something not in the data, " +
      "say so.",
    "",
    "LIVE TOOL STATUS (worst first):",
  ];
  if (snapshot.length === 0) {
    lines.push("  (tools still warming up — no verdicts yet)");
  }
  for (const v of snapshot) {
    if (v.warming) {
      lines.push(`  ${v.tool_id}: warming up (baseline learning)`);
      continue;
    }
    const tops =
      v.top_contributors.map((c) => `${c.sensor} z=${c.z}`).join(", ") || "none";
    const rul = v.rul_frames === null ? "nominal" : `~${v.rul_frames} cycles`;
    lines.push(
      `  ${v.tool_id}: health ${Math.round(v.health)}/100, ${v.state}, ` +
        `RUL ${rul}, top anomalies: ${tops}`,
    );
  }
  return lines.join("\n");
}

/** Chat message shape accepted from the browser. */
export type ChatTurn = { role: "user" | "assistant"; content: string };

const MAX_TURNS = 20;
const MAX_TURN_CHARS = 2000;

export function parseChatTurns(input: unknown): ChatTurn[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_TURNS) {
    return null;
  }
  const turns: ChatTurn[] = [];
  for (const t of input) {
    if (typeof t !== "object" || t === null) return null;
    const o = t as Record<string, unknown>;
    if (o.role !== "user" && o.role !== "assistant") return null;
    if (typeof o.content !== "string" || o.content.length === 0) return null;
    turns.push({ role: o.role, content: o.content.slice(0, MAX_TURN_CHARS) });
  }
  if (turns[0].role !== "user" || turns[turns.length - 1].role !== "user") {
    return null;
  }
  return turns;
}
