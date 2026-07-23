/**
 * AI stand-in tier: prompt builders (ports of service.py's _fleet_context /
 * _api_explain prompt) and the /api/explain + /api/chat route handlers with
 * the Anthropic SDK mocked. The load-bearing claims: the routes accept ONLY
 * the derived contract (raw telemetry is rejected, not forwarded), degrade
 * gracefully without a key, and return the kit-shaped response.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  explainPrompt,
  fleetContext,
  parseChatTurns,
  parseDerived,
} from "@/lib/demo/ai-context";
import { DemoEngine } from "@/lib/demo/engine";

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

import { POST as explainPost } from "@/app/api/explain/route";
import { POST as chatPost } from "@/app/api/chat/route";
import { resetClient } from "@/lib/demo/ai-server";

function liveDerived() {
  const e = new DemoEngine({ seed: 1234 });
  e.run(220);
  const v = e.verdict("etch-03")!;
  return {
    tool_id: v.tool_id,
    health: v.health,
    state: v.state,
    rul_frames: v.rul_frames,
    warming: v.warming,
    top_contributors: v.top_contributors,
  };
}

function post(handler: (r: Request) => Promise<Response>, body: unknown) {
  return handler(
    new Request("http://localhost/api/test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // unique per call so the per-IP rate limiter never trips in tests
        "x-forwarded-for": `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("parseDerived — the governance contract at the AI boundary", () => {
  it("accepts a live derived verdict", () => {
    const v = parseDerived(liveDerived());
    expect(v).not.toBeNull();
    expect(v!.tool_id).toBe("etch-03");
  });

  it("rejects raw telemetry shapes and junk", () => {
    expect(parseDerived(null)).toBeNull();
    expect(parseDerived({ tool_id: "etch-01" })).toBeNull();
    expect(parseDerived({ ...liveDerived(), state: "EXPLODED" })).toBeNull();
    expect(parseDerived({ ...liveDerived(), tool_id: "../etc/passwd" })).toBeNull();
    // A frame of raw sensors is not a verdict — no health/state.
    expect(
      parseDerived({ tool_id: "etch-01", chamber_pressure_mtorr: 50.1 }),
    ).toBeNull();
  });

  it("never passes unexpected fields through", () => {
    const v = parseDerived({ ...liveDerived(), sensors: { secret: 1 } });
    expect(v).not.toBeNull();
    expect(JSON.stringify(v)).not.toContain("secret");
  });
});

describe("prompt builders mirror the kit", () => {
  it("explainPrompt matches service.py's wording and inputs", () => {
    const p = explainPrompt(parseDerived(liveDerived())!);
    expect(p).toContain("semiconductor fab maintenance assistant");
    expect(p).toContain("'etch-03'");
    expect(p).toContain("rf_reflected_power_w (z=");
    expect(p).toContain("2-3 sentences");
    // No raw readings, ever.
    expect(p).not.toMatch(/\d{3,4}\.\d/);
  });

  it("fleetContext renders the worst-first live snapshot like _fleet_context", () => {
    const ctx = fleetContext([parseDerived(liveDerived())!]);
    expect(ctx).toContain("LIVE TOOL STATUS (worst first):");
    expect(ctx).toMatch(/etch-03: health \d+\/100/);
    expect(fleetContext([])).toContain("warming up — no verdicts yet");
  });

  it("parseChatTurns enforces shape, order, and caps", () => {
    expect(parseChatTurns([{ role: "user", content: "hi" }])).toHaveLength(1);
    expect(parseChatTurns([])).toBeNull();
    expect(parseChatTurns([{ role: "assistant", content: "hi" }])).toBeNull();
    expect(parseChatTurns([{ role: "user", content: "" }])).toBeNull();
    const long = { role: "user", content: "x".repeat(5000) };
    expect(parseChatTurns([long])![0].content).toHaveLength(2000);
  });
});

describe("route handlers", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    resetClient();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("explain: returns the model's text for a valid derived payload", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "RF match network degrading; inspect the matching unit." }],
    });
    const res = await post(explainPost, liveDerived());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.available).toBe(true);
    expect(data.explanation).toContain("RF match");
    expect(mockCreate).toHaveBeenCalledOnce();
    // The prompt sent upstream carries only derived data.
    const sent = mockCreate.mock.calls[0][0];
    expect(sent.model).toBe("claude-opus-4-8");
    expect(JSON.stringify(sent)).not.toContain("chamber_pressure_mtorr\":");
  });

  it("explain: 400s on junk without calling the model", async () => {
    const res = await post(explainPost, { tool_id: "etch-01", sensors: { a: 1 } });
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("explain: degrades gracefully with no key (the kit's make-ai note)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const res = await post(explainPost, liveDerived());
    const data = await res.json();
    expect(data.available).toBe(false);
    expect(data.note).toContain("SUSE AI");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("explain: model errors become a note, never a raw 500", async () => {
    mockCreate.mockRejectedValue(new Error("overloaded"));
    const res = await post(explainPost, liveDerived());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.available).toBe(false);
    expect(data.note).toContain("overloaded");
  });

  it("chat: grounds the system prompt in the derived fleet snapshot", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "etch-03 needs an RF match inspection first." }],
    });
    const res = await post(chatPost, {
      fleet: [liveDerived()],
      messages: [{ role: "user", content: "Which tool needs maintenance first?" }],
    });
    const data = await res.json();
    expect(data.available).toBe(true);
    expect(data.reply).toContain("etch-03");
    const sent = mockCreate.mock.calls[0][0];
    expect(sent.system).toContain("LIVE TOOL STATUS (worst first):");
    expect(sent.messages).toEqual([
      { role: "user", content: "Which tool needs maintenance first?" },
    ]);
  });

  it("chat: rejects a fleet entry that is not a derived verdict", async () => {
    const res = await post(chatPost, {
      fleet: [{ tool_id: "etch-01", chamber_pressure_mtorr: 50.2 }],
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
