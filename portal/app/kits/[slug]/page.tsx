import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { getProofKit } from "@/lib/data";

// Kit status/component-map/scale-up content can change between deploys —
// render per request instead of freezing it at build time.
export const dynamic = "force-dynamic";

export default async function KitDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getProofKit(slug);
  if (!detail) notFound();

  const { kit, componentMap, scaleUpStages, footprintSpecs } = detail;

  return (
    <div className="space-y-10">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{kit.name}</h1>
          <StatusBadge status={kit.status} />
        </div>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          {kit.partner} / {kit.customer} - {kit.industry}
        </p>
        <p className="mt-4 max-w-2xl">{kit.summary}</p>
      </div>

      <section>
        <h2 className="text-lg font-medium">Run it</h2>
        <p className="mt-2 text-sm">{kit.use_case}</p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-black/5 p-4 text-sm dark:bg-white/10">
          <code>{`cd ${kit.demo_path}\nmake up`}</code>
        </pre>
        {kit.repo_url && (
          <a
            href={kit.repo_url}
            className="mt-2 inline-block text-sm underline"
          >
            {kit.repo_url}
          </a>
        )}
      </section>

      {componentMap.length > 0 && (
        <section>
          <h2 className="text-lg font-medium">
            Component map — demo to production
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-black/60 dark:border-white/10 dark:text-white/60">
                  <th className="py-2 pr-4 font-medium">Demo component</th>
                  <th className="py-2 pr-4 font-medium">Role</th>
                  <th className="py-2 pr-4 font-medium">
                    Production component
                  </th>
                  <th className="py-2 font-medium">Pinned version</th>
                </tr>
              </thead>
              <tbody>
                {componentMap.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-black/5 align-top dark:border-white/5"
                  >
                    <td className="py-2 pr-4 font-mono text-xs">
                      {row.demo_component}
                    </td>
                    <td className="py-2 pr-4">{row.role}</td>
                    <td className="py-2 pr-4">{row.production_component}</td>
                    <td className="py-2 font-mono text-xs">
                      {row.pinned_version}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {scaleUpStages.length > 0 && (
        <section>
          <h2 className="text-lg font-medium">Scale-up path</h2>
          <ol className="mt-3 space-y-4">
            {scaleUpStages.map((stage) => (
              <li
                key={stage.id}
                className="border-l-2 border-black/10 pl-4 dark:border-white/10"
              >
                <h3 className="font-medium">
                  Stage {stage.stage_number} — {stage.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-black/80 dark:text-white/80">
                  {stage.body_md}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {footprintSpecs.length > 0 && (
        <section>
          <h2 className="text-lg font-medium">
            Production footprint — sourced hardware floors
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-black/60 dark:border-white/10 dark:text-white/60">
                  <th className="py-2 pr-4 font-medium">Component</th>
                  <th className="py-2 font-medium">Minimum (per SUSE docs)</th>
                </tr>
              </thead>
              <tbody>
                {footprintSpecs.map((spec) => (
                  <tr
                    key={spec.id}
                    className="border-b border-black/5 dark:border-white/5"
                  >
                    <td className="py-2 pr-4">{spec.component}</td>
                    <td className="py-2 font-mono text-xs">
                      {spec.minimum_spec}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
