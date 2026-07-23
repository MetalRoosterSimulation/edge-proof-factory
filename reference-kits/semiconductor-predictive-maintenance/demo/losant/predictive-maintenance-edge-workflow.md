# Losant Edge Workflow — predictive-maintenance ingest & governed egress

Build this as an **Edge Workflow** in your Losant Application (Workflows → Create
→ Edge). It is the workflow the `losant/edge-agent` runs locally. It does exactly
what the demo `gateway-edge-agent` does — so the two are interchangeable.

The scaffold export beside this file (`predictive-maintenance-edge-workflow.json`)
is a **starting point** — import it, then confirm the broker addresses and device
mappings for your environment. The node graph:

| # | Node | Config | Purpose |
|---|------|--------|---------|
| 1 | **MQTT Trigger** | topic `fab-devices/+/raw` on the local broker | ingest raw OT telemetry (stand-in for OPC UA / Modbus device outputs) |
| 2 | **Function** (normalize) | add `site`, `line`, units; round; tag `gateway=losant-gea` | normalize + tag; **relay only — never compute the health score here** |
| 3 | **Store & Forward / Buffer** | enable edge buffering | offline buffering when the downstream link is down |
| 4 | **MQTT Output** | topic `fab/{{tool_id}}/telemetry` | hand normalized frames to the on-prem inference tier |
| 5 | **MQTT Trigger** | topic `fab/+/health` | receive the derived health verdicts from inference |
| 6 | **Device State** | report `health`, `state_num`, `rul_frames` only | governed egress: sync **derived** scores to the Losant platform — raw telemetry is never in this path |

Governance is structural: only nodes 5→6 leave the edge, and they carry only the
derived verdict. Raw telemetry (nodes 1→4) never touches a cloud node. This is the
SUSE Industrial Edge data-sovereignty story you demo to a customer.

In production, SUSE deploys this Edge Agent + workflow onto **SUSE Linux Micro**
via the SUSE Edge stack, fleet-managed by **Rancher Prime** (see the hand-off
kit). The workflow itself is unchanged from laptop to fab floor.
