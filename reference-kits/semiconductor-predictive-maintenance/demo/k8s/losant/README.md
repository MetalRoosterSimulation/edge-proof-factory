# Connecting the demo to the Losant platform (SUSE Industrial Edge)

The demo ships with a **gateway-edge-agent** tier that already runs the real
`losant-mqtt` Python SDK. It has two levels of Losant fidelity — pick one.

## Level 1 — governed cloud egress via the Losant SDK (fast, recommended first)

The gateway forwards **only derived health scores** (never raw telemetry) to a
Losant Application, using the real SDK. Raw fab telemetry stays on-prem — this is
the SUSE Industrial Edge data-sovereignty pattern, made literal and observable at
`GET /stats` on the gateway (`losant_forwarded` vs `losant_withheld_airgapped`).

1. In Losant: create an Application, add a Standalone **Device**, and create an
   **Access Key/Secret** (see `losant-credentials.env.example`).
2. `cp losant-credentials.env.example losant-credentials.env` and fill it in.
3. `make losant` — creates the `losant-credentials` Secret and restarts the
   gateway. Watch `losant_forwarded` climb in the gateway `/stats`.
4. Build a Losant **Dashboard** on the device's `health` / `state_num` /
   `rul_frames` attributes for the cross-site fleet view.

## Level 2 — the genuine Losant Gateway Edge Agent (full product)

Swap the gateway container for the real `losant/edge-agent` image and run the
predictive-maintenance **Edge Workflow** on it (this is exactly what SUSE ships
as SUSE Industrial Edge).

1. Import `../../losant/predictive-maintenance-edge-workflow.md` into your Losant
   Application as an **Edge Workflow** (build it node-by-node per that spec, or
   import the scaffold JSON beside it and finish the wiring).
2. Fill `losant-credentials.env`, then:
   `kubectl -n fab-edge create secret generic losant-credentials --from-env-file=losant-credentials.env`
3. `kubectl apply -f edge-agent.yaml` and scale the demo gateway to zero:
   `kubectl -n fab-edge scale deploy/gateway-edge-agent --replicas=0`
4. The agent connects to Losant, pulls the Edge Workflow, and runs it locally —
   ingesting `fab-devices/+/raw`, republishing `fab/<tool>/telemetry`, buffering
   on disconnect, and syncing derived scores to the platform.

Either level, the topic contract is identical, so nothing else in the demo
changes. In production SUSE deploys the Edge Agent onto SUSE Linux Micro via the
SUSE Edge stack (see the hand-off kit's component map and scale-up path).
