import { KitCard } from "@/components/KitCard";
import { getProofKits } from "@/lib/data";

// This is a live catalog backed by Supabase, not a snapshot — render per
// request so a newly-added kit shows up without a redeploy.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const kits = await getProofKits();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Proof kits</h1>
        <p className="mt-2 max-w-2xl text-black/70 dark:text-white/70">
          Each kit is a runnable minimal-footprint MVP of a SUSE Edge/AI use
          case plus the partner hand-off kit to rebuild it on your own
          hardware. Nothing here is described but unbuilt — every kit
          &quot;make up&quot;s on a fresh cluster before it ships.
        </p>
      </div>
      {kits.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          No proof kits yet.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {kits.map((kit) => (
            <KitCard key={kit.id} kit={kit} />
          ))}
        </div>
      )}
    </div>
  );
}
