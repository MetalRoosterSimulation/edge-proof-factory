"use client";

/**
 * FabAssistant — the kit's fleet-grounded chat (Open WebUI talking to the
 * "fab-assistant" model, service.py /v1/chat/completions), as a panel.
 * Every question is answered against the live fleet snapshot: the browser
 * sends its current DERIVED verdicts (never raw telemetry) plus the chat
 * turns to /api/chat, which mirrors the kit's _fleet_context system prompt.
 * Hosted stand-in — in the kit this runs on-prem (Ollama + Open WebUI).
 */
import { useState } from "react";
import type { DerivedVerdict } from "@/lib/demo/ai-context";

type Turn = { role: "user" | "assistant"; content: string };

export function FabAssistant({
  getFleet,
}: {
  getFleet: () => DerivedVerdict[];
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function send() {
    const question = input.trim();
    if (!question || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: question }];
    setTurns(next);
    setInput("");
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fleet: getFleet(), messages: next }),
      });
      const data = await res.json();
      if (data.available) {
        setTurns([...next, { role: "assistant", content: data.reply }]);
      } else {
        setNote(data.note ?? data.error ?? "assistant unavailable");
      }
    } catch (err) {
      setNote(`request failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h2 className="text-lg font-medium">Fab Assistant</h2>
      <p className="mt-1 text-sm text-black/70 dark:text-white/70">
        Ask about the fleet — every answer is grounded in the live snapshot
        (derived verdicts only). Hosted stand-in for the kit&apos;s on-prem
        chat tier: Open WebUI + Ollama on the SUSE AI profile, where the same
        question never leaves the cluster.
      </p>
      <div className="mt-3 space-y-2">
        {turns.map((t, i) => (
          <p
            key={i}
            className={
              t.role === "user"
                ? "text-sm font-medium"
                : "rounded-md border border-black/10 bg-black/5 p-2 text-sm text-black/80 dark:border-white/10 dark:bg-white/5 dark:text-white/80"
            }
          >
            {t.role === "user" ? `You: ${t.content}` : t.content}
          </p>
        ))}
        {busy && (
          <p className="text-sm text-black/50 italic dark:text-white/50">
            asking the hosted model…
          </p>
        )}
        {note && (
          <p className="text-sm text-black/50 italic dark:text-white/50">{note}</p>
        )}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Which tool needs maintenance first?"
          aria-label="Ask the fab assistant"
          className="min-w-0 flex-1 rounded-md border border-black/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
        />
        <button
          type="submit"
          disabled={busy || input.trim().length === 0}
          className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          Ask
        </button>
      </form>
    </section>
  );
}
