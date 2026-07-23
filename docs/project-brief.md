# Project brief — Edge Proof Factory

## The problem
A SUSE partner-facing BD lead needs to help system-integrator partners *build*
with SUSE on Edge/AI use cases. The partners have limited time and limited
infrastructure. The lead must (1) demonstrate a working end-to-end MVP of a use
case with as few resources as possible, and (2) hand off what was shown so the
partner can rebuild it on their own limited hardware.

## Why this is a new factory
The two existing factories produce paper. `~/Work/bd-trigger-to-deal-factory/Edge`
produces the BD messaging package (business case, per-use-case outreach, tech
brief) and explicitly hands pilots/demos/labs to the human. `~/Work/use-case-
factory` produces architecture diagrams + build process + PS playbook, with
footprint left as discovery TODOs and **no runnable artifact**. Neither produces a
running MVP or a rebuild kit. This factory does exactly that, and consumes their
output rather than duplicating it.

## Locked decisions
1. **Output = a Proof Kit** = `demo/` (runnable MVP) + `handoff/` (rebuild kit).
2. **Demo runs on 100% openly-pullable images**, single-node k3s (k3d), CPU-only,
   laptop-class. No SUSE entitlement required to see it work. This is what makes
   "as few resources as possible" true and what makes the hand-off's SUSE upsell
   path clean (every component maps to a supported SUSE equivalent).
3. **Proof before ship.** A kit is not done until its demo `make up`s on a fresh
   cluster, the use case's failure is exercised live, unit tests pass, and the kit
   validator passes.
4. **Faithful to the architecture** the use-case factory produced (governance
   boundary, relay-vs-compute split), simplified only for footprint and always
   flagged in the component map.
5. **Honest hand-off.** Sourced SUSE versions + real hardware floors; never sell
   the laptop footprint as production (SUSE AI floor = 4c/32GB + GPU).
6. **Pilot's-manual voice**, services-first economics — inherited from the
   sibling factories ([[pilots-manual-not-coaching]]).

## Reference kit
`reference-kits/semiconductor-predictive-maintenance/` — the semiconductor
predictive-maintenance edge-AI use case (Technologent / Microchip Technology
worked example). Built and tested end-to-end, with Losant (SUSE Industrial Edge)
as a first-class running tier and Rancher wired via an MCP server.

## Scope boundaries
- The factory does not do account selection or OSINT (that's the BD factory) or
  the architecture design from scratch (that's the use-case factory). It builds
  and hands off the proof for a use case those factories already justified.
- One reference kit is fully built; additional kits are produced on demand via
  `RUN.md`. The reusable machine (docs, templates, validator, Rancher MCP) is in
  place so a new kit is mostly assembly, not invention.
