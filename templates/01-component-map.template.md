# Component map — demo stack → SUSE-supported production stack

Versions from the SUSE Edge <RELEASE> matrix (see `docs/suse-edge-ai-stack.md`);
re-verify before a build.

| Demo component (open) | Role in the use case | Production SUSE component | Pinned version |
|---|---|---|---|
| <open component> | <role> | <SUSE product> | <version> |
| NeuVector OSS <version> | <security/governance boundary enforcement role> | SUSE Security (NeuVector Prime) | <version from matrix> |
| ... | ... | ... | ... |

## Notes that change a build decision
- **K3s vs RKE2:** <HA / datastore decision for this use case>.
- **AI footprint:** <does this need SUSE AI's 4c/32GB + GPU, or does a CPU model
  suffice? state it>.
- **Governance:** <what data crosses which boundary; how the demo proves it>.
- **Security:** <what NeuVector enforces in the demo (network policy, admission,
  scan) vs. what production adds — keep the demo claim honest>.
- **Simplifications:** <anything the demo does differently from production for
  footprint, named here — never hidden>.
