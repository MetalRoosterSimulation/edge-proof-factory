# Partner hand-off runbook — build it yourself

Facts and steps only. Owner tags: **[P]** partner, **[S]** SUSE, **[C]** customer.

## What you were shown
<one paragraph: the running use case and the minimal footprint it ran on>

## Rebuild the demo (any laptop, ~15 min)
1. **[P]** Install `docker`, `k3d`, `kubectl`.
2. **[P]** Clone this kit; `cd reference-kits/<use-case>/demo`.
3. **[P]** `make up` → open the dashboard.
4. **[P]** `make fault ...` to exercise the use case; `make heal ...`.
5. **[P]** `make test`.

## Turn it into a customer pilot
6. **[P]** `01-component-map.md` — swap each open component for its SUSE equivalent.
7. **[P]** `02-scale-up-path.md` — the four-phase services plan.
8. **[P]** `03-production-footprint.md` — resolve HA + GPU before quoting hardware.
9. **[S]** <where SUSE field/pre-sales carries the first pilot>.
10. **[C]** <what the customer provides: hardware, network, security review>.

## Connect the real products
11. **[P]** <vendor platform connection, e.g. Losant / SUSE AI / Rancher>.

## How you make money (services-first)
- Primary: assessment, architecture, pilot, deployment, day-2. Resale attached.
- Recurring: day-2 ops, Fleet Scale, new use cases. Renews per site.
- Size per use case, not per opportunity.

## First action
<the one first action, same-day>
