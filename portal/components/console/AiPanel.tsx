"use client";

/**
 * AiPanel — diagnosis and remediation for the selected chamber.
 *
 * Layer 1 (always on, deterministic): the signature diagnosis — the model's
 * own attribution matched against the kit's fault library.
 * Layer 2 (explicit click): AI explain + fleet-grounded assistant, served by
 * the hosted stand-in routes; derived verdicts only ever leave the tab. In
 * the on-prem kit both answers come from Ollama on the cluster.
 */
import { useState } from "react";
import type { DerivedVerdict } from "@/lib/demo/ai-context";
import { diagnose } from "@/lib/demo/diagnose";
import type { Verdict } from "@/lib/demo/types";
import { chamberName } from "@/lib/console/fab";
import { actionBtn } from "@/components/console/panels";

export type ExplainState =
  | { status: "loading" }
  | { status: "done"; available: boolean; text: string; model?: string };

type Turn = { role: "user" | "assistant"; content: string };

export function AiPanel({
  verdict,
  explain,
  onExplain,
  getFleet,
  onDiagnosisShown,
}: {
  verdict: Verdict;
  explain?: ExplainState;
  onExplain: (toolId: string) => void;
  getFleet: () => DerivedVerdict[];
  onDiagnosisShown: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const dx = diagnose(verdict);
  if (dx) onDiagnosisShown();

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
    <section className="panel p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="panel-title">Diagnosis — {chamberName(verdict.tool_id)}</p>
        {!verdict.warming && (
          <button
            type="button"
            onClick={() => onExplain(verdict.tool_id)}
            disabled={explain?.status === "loading"}
            className={actionBtn()}
          >
            {explain ? "Re-run AI explain" : "AI explain"}
          </button>
        )}
      </div>

      {dx ? (
        <p className="mt-1 text-xs leading-4 text-[var(--c-ink2)]">
          <span className="font-semibold text-[var(--c-ink)]">
            Signature: {dx.title}.
          </span>{" "}
          {dx.blurb}{" "}
          <span className="text-[var(--c-ink3)]">(deterministic — attribution × fault library)</span>
        </p>
      ) : (
        <p className="mt-1 text-xs text-[var(--c-ink3)]">
          No excursion signature — chamber within control limits.
        </p>
      )}

      {explain && (
        <div className="mt-2 border-t border-dashed border-[var(--c-line)] pt-2 text-xs leading-4">
          {explain.status === "loading" ? (
            <p className="text-[var(--c-ink3)] italic">asking the model…</p>
          ) : explain.available ? (
            <p className="text-[var(--c-ink2)]">
              <span className="panel-title">
                AI remediation · hosted stand-in{explain.model ? ` · ${explain.model}` : ""}
              </span>
              <br />
              {explain.text}
            </p>
          ) : (
            <p className="text-[var(--c-ink3)] italic">{explain.text}</p>
          )}
        </div>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-[10px] tracking-wider text-[var(--c-ink3)] uppercase">
          Fab assistant (fleet-grounded chat)
        </summary>
        <div className="mt-2 space-y-1.5">
          {turns.map((t, i) => (
            <p
              key={i}
              className={
                t.role === "user"
                  ? "text-xs font-medium"
                  : "border border-[var(--c-line)] bg-[var(--c-panel2)] p-1.5 text-xs leading-4 text-[var(--c-ink2)]"
              }
            >
              {t.role === "user" ? `You: ${t.content}` : t.content}
            </p>
          ))}
          {busy && <p className="text-xs text-[var(--c-ink3)] italic">asking the model…</p>}
          {note && <p className="text-xs text-[var(--c-ink3)] italic">{note}</p>}
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Which chamber needs maintenance first?"
              aria-label="Ask the fab assistant"
              className="num min-w-0 flex-1 border border-[var(--c-line)] bg-transparent px-2 py-1 text-xs outline-none focus:border-[var(--c-action)]"
            />
            <button
              type="submit"
              disabled={busy || input.trim().length === 0}
              className={actionBtn()}
            >
              Ask
            </button>
          </form>
        </div>
      </details>
    </section>
  );
}
