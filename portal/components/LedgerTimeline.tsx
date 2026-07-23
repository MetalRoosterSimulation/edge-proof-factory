import { StatusBadge } from "@/components/StatusBadge";
import type { LedgerPhase } from "@/lib/types";

export function LedgerTimeline({ phases }: { phases: LedgerPhase[] }) {
  return (
    <ol className="space-y-6">
      {phases.map((phase) => (
        <li
          key={phase.id}
          className="border-l-2 border-black/10 pl-5 dark:border-white/10"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-black/50 dark:text-white/50">
              Phase {phase.phase_number}
            </span>
            <h3 className="font-medium">{phase.title}</h3>
            <StatusBadge status={phase.status} />
            {phase.done_date && (
              <span className="text-xs text-black/50 dark:text-white/50">
                {phase.done_date}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-black/80 dark:text-white/80">
            {phase.body_md}
          </p>
        </li>
      ))}
    </ol>
  );
}
