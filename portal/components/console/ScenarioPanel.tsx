"use client";

/**
 * ScenarioPanel — the guided run-through as a checklist over the live
 * console. The tour is chrome; the console is the product: dismiss it and
 * everything still works. Steps advance when their condition is met (checked
 * every tick by the Console) or via each step's action button.
 */
import { SCENARIO } from "@/lib/console/scenario";
import { actionBtn } from "@/components/console/panels";

export function ScenarioPanel({
  stepIndex,
  completed,
  onAction,
  onNext,
  onDismiss,
}: {
  stepIndex: number;
  completed: boolean[];
  onAction: (index: number) => void;
  onNext: () => void;
  onDismiss: () => void;
}) {
  const allDone = completed.every(Boolean);
  return (
    <section
      className="panel p-2"
      style={{ borderColor: "var(--c-action)" }}
      aria-label="Guided scenario"
    >
      <div className="flex items-center justify-between">
        <p className="panel-title" style={{ color: "var(--c-action)" }}>
          Guided scenario — excursion to recovery
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[10px] text-[var(--c-ink3)] hover:text-[var(--c-ink2)]"
        >
          dismiss
        </button>
      </div>
      <ol className="mt-1.5 space-y-1.5">
        {SCENARIO.map((step, i) => {
          const isCurrent = i === stepIndex && !allDone;
          const isDone = completed[i];
          return (
            <li
              key={step.title}
              className="border-l-2 pl-2"
              style={{
                borderColor: isDone
                  ? "var(--c-ink3)"
                  : isCurrent
                    ? "var(--c-action)"
                    : "var(--c-line)",
                opacity: isCurrent || isDone ? 1 : 0.55,
              }}
            >
              <p className="text-xs font-semibold">
                {isDone ? "✓ " : ""}
                {step.title}
              </p>
              {isCurrent && (
                <>
                  <p className="mt-0.5 text-[11px] leading-4 text-[var(--c-ink2)]">
                    {step.body}
                  </p>
                  <div className="mt-1 flex gap-1.5">
                    {step.action && !isDone && (
                      <button
                        type="button"
                        onClick={() => onAction(i)}
                        className={actionBtn()}
                      >
                        {step.action}
                      </button>
                    )}
                    {isDone && (
                      <button type="button" onClick={onNext} className={actionBtn()}>
                        Next
                      </button>
                    )}
                    {!step.action && !isDone && (
                      <span className="text-[10px] text-[var(--c-ink3)] italic">
                        waiting for condition…
                      </span>
                    )}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ol>
      {allDone && (
        <p className="mt-2 text-[11px] text-[var(--c-ink2)]">
          Scenario complete. The console stays live — inject faults on any
          chamber, or rebuild this end-to-end on your own hardware with the
          lab guide.
        </p>
      )}
    </section>
  );
}
