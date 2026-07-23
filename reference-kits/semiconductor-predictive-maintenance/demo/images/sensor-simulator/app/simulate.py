#!/usr/bin/env python3
"""
sensor-simulator — synthetic plasma-etch fab telemetry.

Publishes one raw device frame per tool per interval to an MQTT broker on topic
    fab-devices/<tool_id>/raw
This is the OT side: it stands in for the fab equipment's PLC / OPC UA / Modbus
outputs. The Losant Gateway Edge Agent (gateway-edge-agent tier) consumes this
raw topic, normalizes and buffers it, and republishes to fab/<tool_id>/telemetry
for the on-prem inference tier — mirroring the real SUSE Industrial Edge pattern.

It is interactive. Publish a JSON control message to `fab/control` to inject or
clear a degradation on a tool, e.g.:
    {"tool_id": "etch-03", "fault": "rf_match_drift"}
    {"tool_id": "etch-03", "fault": "clear"}
The demo `make fault` / `make heal` targets do exactly this.

Env:
  MQTT_HOST (default mosquitto)   MQTT_PORT (1883)
  N_TOOLS   (default 6)           INTERVAL_MS (default 1000)
  AUTO_FAULT_TOOL (default "")    AUTO_FAULT_AFTER (frames, default 0 = off)
"""
import json
import os
import random
import signal
import sys
import time

import paho.mqtt.client as mqtt

MQTT_HOST = os.environ.get("MQTT_HOST", "mosquitto")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
N_TOOLS = int(os.environ.get("N_TOOLS", "6"))
INTERVAL_MS = int(os.environ.get("INTERVAL_MS", "1000"))
AUTO_FAULT_TOOL = os.environ.get("AUTO_FAULT_TOOL", "").strip()
AUTO_FAULT_AFTER = int(os.environ.get("AUTO_FAULT_AFTER", "0"))

# Healthy operating point + per-sensor 1-sigma noise for an etch chamber.
BASE = {
    "chamber_pressure_mtorr": (50.0, 0.6),
    "rf_forward_power_w": (1500.0, 6.0),
    "rf_reflected_power_w": (8.0, 0.4),
    "chamber_temp_c": (65.0, 0.3),
    "endpoint_signal": (0.80, 0.01),
    "he_backside_flow_sccm": (10.0, 0.15),
}

# Fault library: name -> per-frame drift applied per active fault-step.
# Each is a physically-motivated etch failure signature.
FAULTS = {
    # RF matching network degrades: reflected power climbs, pressure creeps,
    # endpoint signal weakens. The classic "match unit going bad".
    "rf_match_drift": {
        "rf_reflected_power_w": +0.05,
        "chamber_pressure_mtorr": +0.02,
        "endpoint_signal": -0.0007,
    },
    # Vacuum/He seal leak: backside He flow rises to hold pressure, temp drifts.
    "he_seal_leak": {
        "he_backside_flow_sccm": +0.03,
        "chamber_temp_c": +0.02,
        "chamber_pressure_mtorr": +0.015,
    },
    # Chiller/temperature-control fault: chamber temp runs away.
    "chiller_fault": {
        "chamber_temp_c": +0.05,
        "rf_reflected_power_w": +0.02,
    },
}


class Tool:
    def __init__(self, tool_id):
        self.tool_id = tool_id
        self.fault = None
        self.fault_step = 0

    def set_fault(self, name):
        if name in ("clear", "none", "", None):
            self.fault, self.fault_step = None, 0
        elif name in FAULTS:
            self.fault, self.fault_step = name, 0
        else:
            print("  [sim] unknown fault %r (have %s)"
                  % (name, ", ".join(FAULTS)), flush=True)

    def frame(self, rng):
        f = {}
        drift = {}
        if self.fault:
            self.fault_step += 1
            for s, per in FAULTS[self.fault].items():
                drift[s] = per * self.fault_step
        for s, (mean, sigma) in BASE.items():
            f[s] = round(mean + rng.gauss(0, sigma) + drift.get(s, 0.0), 4)
        return f


def main():
    rng = random.Random(1234)
    tools = [Tool("etch-%02d" % (i + 1)) for i in range(N_TOOLS)]
    by_id = {t.tool_id: t for t in tools}

    client = mqtt.Client(client_id="sensor-simulator")

    def on_connect(cli, _u, _f, rc):
        print("[sim] connected to %s:%d rc=%s" % (MQTT_HOST, MQTT_PORT, rc),
              flush=True)
        cli.subscribe("fab/control")

    def on_message(_cli, _u, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            print("[sim] bad control msg: %r" % e, flush=True)
            return
        tid = payload.get("tool_id")
        fault = payload.get("fault")
        if tid in by_id:
            by_id[tid].set_fault(fault)
            print("[sim] tool %s fault -> %s" % (tid, fault), flush=True)

    client.on_connect = on_connect
    client.on_message = on_message

    # Connect with retry (broker may still be starting).
    for attempt in range(60):
        try:
            client.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
            break
        except Exception as e:  # noqa: BLE001
            print("[sim] connect retry %d: %r" % (attempt, e), flush=True)
            time.sleep(2)
    else:
        print("[sim] could not connect; exiting", flush=True)
        sys.exit(1)

    client.loop_start()
    running = {"go": True}
    signal.signal(signal.SIGTERM, lambda *_: running.update(go=False))
    signal.signal(signal.SIGINT, lambda *_: running.update(go=False))

    frame_no = 0
    interval = INTERVAL_MS / 1000.0
    while running["go"]:
        frame_no += 1
        if (AUTO_FAULT_TOOL and AUTO_FAULT_AFTER
                and frame_no == AUTO_FAULT_AFTER
                and AUTO_FAULT_TOOL in by_id):
            by_id[AUTO_FAULT_TOOL].set_fault("rf_match_drift")
            print("[sim] auto-injected fault on %s at frame %d"
                  % (AUTO_FAULT_TOOL, frame_no), flush=True)
        for t in tools:
            payload = json.dumps({
                "tool_id": t.tool_id,
                "ts": time.time(),
                "sensors": t.frame(rng),
            })
            client.publish("fab-devices/%s/raw" % t.tool_id, payload, qos=0)
        if frame_no % 30 == 0:
            print("[sim] published frame %d for %d tools"
                  % (frame_no, len(tools)), flush=True)
        time.sleep(interval)

    client.loop_stop()
    client.disconnect()
    print("[sim] stopped", flush=True)


if __name__ == "__main__":
    main()
