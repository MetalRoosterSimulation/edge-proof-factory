/**
 * POST /api/chat — hosted stand-in for the kit's fleet-grounded Fab
 * Assistant (service.py POST /v1/chat/completions, served to Open WebUI and
 * answered by Ollama on the SUSE AI tier).
 *
 * The browser sends its current fleet snapshot as DERIVED verdicts only
 * (parseDerived rejects anything else) plus the chat turns; the route builds
 * the same live-context system prompt the kit builds (_fleet_context) and
 * asks the hosted model. Raw telemetry has no path into this request.
 */
import {
  AI_MODEL,
  NOT_CONFIGURED_NOTE,
  aiAvailable,
  getClient,
  rateLimited,
  responseText,
} from "@/lib/demo/ai-server";
import {
  fleetContext,
  parseChatTurns,
  parseDerived,
  type DerivedVerdict,
} from "@/lib/demo/ai-context";

const MAX_FLEET = 12;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const o = (typeof body === "object" && body !== null ? body : {}) as Record<
    string,
    unknown
  >;
  const turns = parseChatTurns(o.messages);
  if (!turns) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const rawFleet = Array.isArray(o.fleet) ? o.fleet.slice(0, MAX_FLEET) : [];
  const fleet: DerivedVerdict[] = [];
  for (const item of rawFleet) {
    const v = parseDerived(item);
    if (!v) {
      return Response.json({ error: "bad request" }, { status: 400 });
    }
    fleet.push(v);
  }
  if (!aiAvailable()) {
    return Response.json({ available: false, reply: null, note: NOT_CONFIGURED_NOTE });
  }
  if (rateLimited(request)) {
    return Response.json({ error: "rate limited" }, { status: 429 });
  }
  try {
    const message = await getClient().messages.create({
      model: AI_MODEL,
      max_tokens: 2048,
      system: fleetContext(fleet),
      messages: turns,
    });
    return Response.json({
      available: true,
      reply: responseText(message),
      model: AI_MODEL,
    });
  } catch (err) {
    return Response.json({
      available: false,
      reply: null,
      note: `Hosted AI stand-in request failed: ${err instanceof Error ? err.message : "unknown error"}`,
    });
  }
}
