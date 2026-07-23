# Hand-off doctrine — how the open demo maps to SUSE, and how to write it

## The mapping rule
Every open component in a demo exists to play a SUSE component's role at zero cost
and zero footprint. The hand-off's job is the swap list. For each demo tier state:
the open component, the role, the **named SUSE-supported product**, and its
**sourced version** (from `suse-edge-ai-stack.md`).

Preferred open stand-ins (use the vendor's own OSS where it exists):
- Edge Kubernetes → **k3s/k3d** → SUSE Edge (SL Micro + K3s/RKE2).
- Local bus / industrial gateway → **mosquitto + the vendor OSS SDK** (e.g. Losant
  `losant-mqtt`, or the real `losant/edge-agent`) → SUSE Industrial Edge.
- Local LLM → **Ollama + Open WebUI** (these *are* the SUSE AI components) → SUSE AI.
- Runtime security → **NetworkPolicy** → SUSE Security (NeuVector).
- Fleet mgmt / GitOps → **kubectl/kustomize** → Rancher Prime + Fleet.

## Three honesty rules (these are load-bearing)
1. **Never sell the laptop footprint as production.** The demo is CPU-only and
   single-node on purpose. Say so. SUSE AI's real floor is 4c/32GB + GPU; a real
   HA edge site is 3 nodes. Put the sourced floors in `03-production-footprint.md`.
2. **Preserve the architecture's truths.** If the source architecture says the
   gateway is a relay (not the compute), the demo's gateway must be a relay too.
   If there's a data-governance boundary (derived data leaves, raw stays), the
   demo must demonstrate it (and be able to *prove* it, e.g. a withheld counter).
3. **Flag every simplification.** Anything the demo does differently from
   production for footprint reasons goes in the component map's notes, not hidden.

## Voice — pilot's manual, not coaching ([[pilots-manual-not-coaching]])
- Every sentence states a sourced fact or gives a step. Cut anything about the
  reader's feelings, reputation, or motivation.
- End with numbered, owner-tagged steps (**[P]** partner / **[S]** SUSE / **[C]**
  customer) and exactly one first action.
- Economics services-first: services are the primary line; resale margin is
  attached, never the headline; size per use case, not per opportunity.
- Banned filler in visible text: *leverage, seamless, robust,* and *end-to-end* as
  an adjective. Write the plain word instead.
- No fabrication: unknown durations/rates/node-counts stay as ranges or `[FILL]`.
