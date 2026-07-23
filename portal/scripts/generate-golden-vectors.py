#!/usr/bin/env python3
"""
generate-golden-vectors.py — parity fixtures for the TypeScript port of the
edge health model.

The browser demo at /demo ports the Python SPC model
(reference-kits/semiconductor-predictive-maintenance/demo/images/edge-inference/
app/health_model.py) to TypeScript. This script is the proof harness for that
port: it drives the REAL Python simulator fault library and the REAL Python
model, and records every input frame and every output verdict to JSON. The
Vitest suite (tests/demo/golden-parity.test.ts) replays the same frames through
the TypeScript model and asserts the verdicts match within float tolerance.

If either side of the port changes, regenerate and re-run:

    python3 scripts/generate-golden-vectors.py
    npm test

Scenarios covered:
  * healthy          — warmup + steady healthy operation (no fault)
  * rf_match_drift   — RF matching-network degradation to CRITICAL
  * he_seal_leak     — He backside seal leak to CRITICAL
  * chiller_fault    — chamber temperature runaway to CRITICAL
  * missing_sensor   — frames with a sensor channel absent (k adapts)
  * constant_sensor  — a zero-variance channel exercises the STD_FLOOR guard

No third-party deps; the simulator's paho-mqtt import is stubbed since only its
BASE/FAULTS tables and Tool.frame() drift math are used, never the network.
"""
import json
import os
import random
import sys
import types

_HERE = os.path.dirname(os.path.abspath(__file__))
_DEMO = os.path.normpath(os.path.join(
    _HERE, "..", "..",
    "reference-kits", "semiconductor-predictive-maintenance", "demo"))

# Stub paho.mqtt.client so the simulator module imports without the dependency.
_paho = types.ModuleType("paho")
_paho_mqtt = types.ModuleType("paho.mqtt")
_paho_client = types.ModuleType("paho.mqtt.client")
_paho_client.Client = object
_paho.mqtt = _paho_mqtt
_paho_mqtt.client = _paho_client
sys.modules.setdefault("paho", _paho)
sys.modules.setdefault("paho.mqtt", _paho_mqtt)
sys.modules.setdefault("paho.mqtt.client", _paho_client)

sys.path.insert(0, os.path.join(_DEMO, "images", "edge-inference"))
sys.path.insert(0, os.path.join(_DEMO, "images", "sensor-simulator", "app"))

from app.health_model import ToolHealthModel, SENSORS, DEFAULT_WARMUP  # noqa: E402
from simulate import BASE, FAULTS, Tool  # noqa: E402

OUT = os.path.join(_HERE, "..", "tests", "demo", "golden-vectors.json")


def run_scenario(name, fault=None, fault_at=40, max_frames=400, seed=1234,
                 mutate=None):
    """Drive one tool with the real simulator drift math + real model."""
    rng = random.Random(seed)
    tool = Tool("etch-01")
    model = ToolHealthModel("etch-01", warmup=DEFAULT_WARMUP)
    steps = []
    for i in range(1, max_frames + 1):
        if fault and i == fault_at:
            tool.set_fault(fault)
        frame = tool.frame(rng)
        if mutate:
            frame = mutate(i, frame)
        verdict = model.update(frame)
        steps.append({"frame": frame, "verdict": verdict})
        if fault and verdict["state"] == "CRITICAL" and i > fault_at + 20:
            break
    return {"name": name, "fault": fault, "fault_at": fault_at if fault else None,
            "warmup": DEFAULT_WARMUP, "steps": steps}


def main():
    scenarios = [run_scenario("healthy", max_frames=130)]
    for fault in sorted(FAULTS):
        scenarios.append(run_scenario(fault, fault=fault))

    def drop_sensor(i, frame):
        f = dict(frame)
        f.pop("endpoint_signal", None)
        return f
    scenarios.append(run_scenario("missing_sensor", max_frames=120,
                                  mutate=drop_sensor))

    def freeze_sensor(i, frame):
        f = dict(frame)
        f["endpoint_signal"] = 0.8
        return f
    scenarios.append(run_scenario("constant_sensor", max_frames=120,
                                  mutate=freeze_sensor))

    payload = {
        "source": ("reference-kits/semiconductor-predictive-maintenance/demo — "
                   "REAL Python model + simulator drift tables"),
        "sensors": list(SENSORS),
        "base": {k: list(v) for k, v in BASE.items()},
        "faults": {k: dict(v) for k, v in FAULTS.items()},
        "scenarios": scenarios,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump(payload, fh)
    total = sum(len(s["steps"]) for s in scenarios)
    print("wrote %s: %d scenarios, %d steps"
          % (os.path.normpath(OUT), len(scenarios), total))
    for s in scenarios:
        last = s["steps"][-1]["verdict"]
        print("  %-16s %4d frames -> health %6.2f  %s  rul=%s"
              % (s["name"], len(s["steps"]), last["health"], last["state"],
                 last["rul_frames"]))


if __name__ == "__main__":
    main()
