import { LedgerTimeline } from "@/components/LedgerTimeline";
import { getLedgerPhases, getOpenThreads } from "@/lib/data";

// The ledger is meant to reflect new phases as they're committed — render
// per request rather than freezing it at build time.
export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const [phases, openThreads] = await Promise.all([
    getLedgerPhases(),
    getOpenThreads(),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Build ledger</h1>
        <p className="mt-2 max-w-2xl text-black/70 dark:text-white/70">
          Chronological record of how the factory was built. Newest phase
          last — mirrors BUILD-LEDGER.md.
        </p>
      </div>

      <LedgerTimeline phases={phases} />

      {openThreads.length > 0 && (
        <section>
          <h2 className="text-lg font-medium">Open threads</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
            {openThreads.map((thread) => (
              <li key={thread.id}>{thread.description}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
