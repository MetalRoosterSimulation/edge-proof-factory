# Hand-off kit — semiconductor predictive-maintenance edge AI

What you give the partner after the demo so they can rebuild it and take it to
production on their own limited resources. Read in order:

1. **`00-partner-handoff-runbook.md`** — the pilot's-manual sheet: rebuild the
   demo, turn it into a customer pilot, connect the real products, and the
   services-first economics. Start here.
2. **`01-component-map.md`** — every open demo component → its SUSE-supported
   production equivalent, with pinned SUSE Edge 3.6.0 versions and the decisions
   that change a build.
3. **`02-scale-up-path.md`** — laptop → one edge box → hardened zone → fleet, as
   the four billable services phases with owner-tagged steps.
4. **`03-production-footprint.md`** — sourced minimum hardware floors; where a GPU
   changes the number; air-gapped delivery.

`assets/dashboard.png` — the ops console the partner sees (for slides/leave-behind).

The demo these documents hand off lives in `../demo/`. The whole point: the demo
is a faithful proof, not a throwaway — the topology, the workflow, the manifests,
and the model contract are identical from laptop to fab floor. Only the
components are swapped for their supported SUSE equivalents.
