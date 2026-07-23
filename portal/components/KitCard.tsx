import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import type { ProofKit } from "@/lib/types";

export function KitCard({ kit }: { kit: ProofKit }) {
  return (
    <Link
      href={`/kits/${kit.slug}`}
      className="block rounded-lg border border-black/10 p-5 transition hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium">{kit.name}</h3>
        <StatusBadge status={kit.status} />
      </div>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        {kit.partner} / {kit.customer} - {kit.industry}
      </p>
      <p className="mt-3 text-sm">{kit.summary}</p>
    </Link>
  );
}
