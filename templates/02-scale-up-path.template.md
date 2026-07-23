# Scale-up path — laptop demo → production fleet

Four billable phases. Owner tags **[P]**/**[S]**/**[C]**.

## Stage 0 — laptop demo (this kit)
<what it proves; exit criteria>

## Stage 1 — one real edge box (PILOT)
- **[P]** Build a SUSE Edge image (EIB: SL Micro + K3s/RKE2 + charts, air-gapped).
- **[P]** Deploy the real gateway/agent against the customer's OT feeds.
- **[P/S]** Stand up the inference tier (CPU, or SUSE AI + GPU if needed — size here).
- **[C]** Provide the node + OT path + security team.
- Exit: <real data scored on real hardware; failure test; governance verified>.

## Stage 2 — hardening, one zone (ROLL OUT)
- **[P]** Decide HA now (datastore is baked in); Rancher Prime mgmt cluster; Fleet.
- Exit: <zone on the supported stack, fleet-managed, GitOps>.

## Stage 3 — scale to fleet (DAY 2 & SCALE)
- **[P]** Elemental phone-home onboarding; roll the Fleet GitRepo to a ClusterGroup.
- Exit: <steady-state managed fleet; per-site annuity>.

## The one rule
Decide HA (datastore) and GPU (SUSE AI vs CPU model) at image-build time — both
are baked in. Everything else is unchanged from laptop to fleet.
