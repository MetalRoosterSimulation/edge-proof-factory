# Component map — demo stack → SUSE-supported production stack

Versions from the SUSE Edge <RELEASE> matrix (see `docs/suse-edge-ai-stack.md`);
re-verify before a build.

| Demo component (open) | Role in the use case | Production SUSE component | Pinned version |
|---|---|---|---|
| <open component> | <role> | <SUSE product> | <version> |
| ... | ... | ... | ... |

## Notes that change a build decision
- **K3s vs RKE2:** <HA / datastore decision for this use case>.
- **AI footprint:** <does this need SUSE AI's 4c/32GB + GPU, or does a CPU model
  suffice? state it>.
- **Governance:** <what data crosses which boundary; how the demo proves it>.
- **Simplifications:** <anything the demo does differently from production for
  footprint, named here — never hidden>.
