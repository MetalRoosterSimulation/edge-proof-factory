/**
 * POST /api/explain — hosted stand-in for the kit's on-prem explain endpoint
 * (service.py GET /api/explain/<tool>, answered by Ollama on the SUSE AI
 * tier; Phase 9, verified live).
 *
 * Accepts ONLY the derived verdict contract (parseDerived) — the same fields
 * the kit's governed egress publishes. Raw telemetry has no path into this
 * request, which keeps the governance story intact even though the model is
 * hosted. Response shape mirrors the kit's endpoint: `available` +
 * `explanation` or a human `note`, never a raw error.
 */
import {
  AI_MODEL,
  NOT_CONFIGURED_NOTE,
  aiAvailable,
  getClient,
  rateLimited,
  responseText,
} from "@/lib/demo/ai-server";
import { explainPrompt, parseDerived } from "@/lib/demo/ai-context";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const verdict = parseDerived(body);
  if (!verdict) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (!aiAvailable()) {
    return Response.json({
      tool_id: verdict.tool_id,
      available: false,
      explanation: null,
      note: NOT_CONFIGURED_NOTE,
    });
  }
  if (rateLimited(request)) {
    return Response.json({ error: "rate limited" }, { status: 429 });
  }
  try {
    const message = await getClient().messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: explainPrompt(verdict) }],
    });
    return Response.json({
      tool_id: verdict.tool_id,
      available: true,
      explanation: responseText(message),
      model: AI_MODEL,
    });
  } catch (err) {
    return Response.json({
      tool_id: verdict.tool_id,
      available: false,
      explanation: null,
      note: `Hosted AI stand-in request failed: ${err instanceof Error ? err.message : "unknown error"}`,
    });
  }
}
