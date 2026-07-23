/**
 * ai-server.ts — server-side plumbing for the AI stand-in routes.
 *
 * The routes are a hosted analog of the kit's on-prem SUSE AI tier (Ollama,
 * Phase 9) and degrade gracefully, exactly like the kit's service.py does
 * when OLLAMA_URL is unset: with no ANTHROPIC_API_KEY configured the routes
 * answer `available: false` with a note instead of erroring, and the UI
 * falls back to the deterministic signature diagnosis.
 *
 * This is the demo's only per-visitor cost surface, so it is rate limited
 * (per serverless instance — coarse, but the payloads are tiny and
 * max_tokens is capped).
 */
import Anthropic from "@anthropic-ai/sdk";

export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

export const NOT_CONFIGURED_NOTE =
  "Hosted AI stand-in not configured (set ANTHROPIC_API_KEY on the Vercel " +
  "project). In the kit this question is answered on-prem by the SUSE AI " +
  "tier — Ollama via `make ai`, verified live in Phase 9.";

let client: Anthropic | null = null;

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/** For tests: reset the memoized client. */
export function resetClient(): void {
  client = null;
}

// --- coarse per-instance rate limiting ---------------------------------------
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>();

export function rateLimited(request: Request): boolean {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

/** Extract the plain text of a response's content blocks. */
export function responseText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
