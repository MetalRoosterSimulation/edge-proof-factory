const LABEL: Record<string, string> = {
  "built-and-verified": "Built and verified",
  "in-progress": "In progress",
  planned: "Planned",
  done: "Done",
};

const CLASS: Record<string, string> = {
  "built-and-verified":
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  done: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  "in-progress":
    "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  planned: "bg-black/5 text-black/70 dark:bg-white/10 dark:text-white/70",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        CLASS[status] ?? CLASS.planned
      }`}
    >
      {LABEL[status] ?? status}
    </span>
  );
}
