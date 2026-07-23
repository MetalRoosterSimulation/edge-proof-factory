#!/usr/bin/env python3
"""
gateway-edge-agent — the Losant Gateway Edge Agent (GEA) tier.

This is the edge ingest + governed-egress tier that SUSE ships as **SUSE
Industrial Edge** (an OEM of Losant). In this reference MVP it plays the GEA's
real, load-bearing role — and it is a *relay/normalizer/egress point, never the
place the health score is computed* (that is the on-prem inference tier). Three
jobs, exactly as the real GEA:

  1. Ingest raw OT device telemetry from the local broker (fab-devices/+/raw),
     the stand-in for the fab's PLC / OPC UA / Modbus feeds.
  2. Normalize + tag (site/line/units) and **buffer on downstream outage**
     (offline buffering) — then republish to fab/<tool>/telemetry for inference.
  3. Be the single **governed egress point**: subscribe to the derived health
     verdicts (fab/+/health) and, only if Losant credentials are supplied,
     forward *those derived scores* to the Losant platform using the real
     `losant-mqtt` SDK. Raw telemetry is structurally incapable of leaving here
     — this tier only ever forwards the health topic. That is the SUSE
     Industrial Edge data-sovereignty pattern made literal.

Run modes:
  * local / air-gapped (default): no Losant creds -> derived scores are counted
    as "withheld (air-gapped)"; the fab runs fully on-prem. This is the sovereign
    edge story.
  * Losant-connected: set LOSANT_DEVICE_ID / LOSANT_ACCESS_KEY /
    LOSANT_ACCESS_SECRET (see k8s/losant/) -> derived scores sync to a Losant
    Application for cross-site dashboards and workflows.

The `make demo-losant` profile swaps this whole Deployment for the genuine
`losant/edge-agent` image running an imported Losant Edge Workflow; the topics
and contract are identical, so nothing else in the demo changes.
"""
import json
import os
import threading
import time
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import paho.mqtt.client as mqtt

# Real Losant SDK — present in this image (pip install losant-mqtt). Guarded so
# the tier still runs if the platform client is unavailable.
try:
    from losantmqtt import Device as LosantDevice
    _HAVE_LOSANT = True
except Exception:  # noqa: BLE001
    _HAVE_LOSANT = False

MQTT_HOST = os.environ.get("MQTT_HOST", "mosquitto")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
HTTP_PORT = int(os.environ.get("HTTP_PORT", "8081"))
SITE = os.environ.get("SITE", "fab-1")
LINE = os.environ.get("LINE", "etch-bay-A")
BUFFER_MAX = int(os.environ.get("BUFFER_MAX", "5000"))

LOSANT_DEVICE_ID = os.environ.get("LOSANT_DEVICE_ID", "").strip()
LOSANT_ACCESS_KEY = os.environ.get("LOSANT_ACCESS_KEY", "").strip()
LOSANT_ACCESS_SECRET = os.environ.get("LOSANT_ACCESS_SECRET", "").strip()
LOSANT_ENABLED = bool(
    _HAVE_LOSANT and LOSANT_DEVICE_ID and LOSANT_ACCESS_KEY
    and LOSANT_ACCESS_SECRET
)

_STATE_NUM = {"HEALTHY": 0, "WATCH": 1, "WARNING": 2, "CRITICAL": 3}

stats = {
    "raw_ingested": 0,
    "normalized_published": 0,
    "buffered": 0,
    "buffer_depth": 0,
    "derived_seen": 0,
    "losant_forwarded": 0,
    "losant_withheld_airgapped": 0,
    "losant_connected": False,
    "losant_enabled": LOSANT_ENABLED,
    "site": SITE,
    "line": LINE,
}
_buffer = deque(maxlen=BUFFER_MAX)
_lock = threading.Lock()

# --- Losant platform egress (real SDK) ----------------------------------------
_losant_dev = None


def _losant_connect():
    global _losant_dev
    if not LOSANT_ENABLED:
        print("[gea] Losant cloud sync DISABLED (no credentials) — running "
              "local-only / air-gapped. Raw telemetry stays on-prem.",
              flush=True)
        return
    _losant_dev = LosantDevice(LOSANT_DEVICE_ID, LOSANT_ACCESS_KEY,
                               LOSANT_ACCESS_SECRET)
    _losant_dev.connect(blocking=False)
    print("[gea] Losant platform egress ENABLED for device %s"
          % LOSANT_DEVICE_ID, flush=True)


def _losant_loop():
    while True:
        try:
            if _losant_dev is not None:
                _losant_dev.loop()
                with _lock:
                    stats["losant_connected"] = bool(_losant_dev.is_connected())
        except Exception as e:  # noqa: BLE001
            print("[gea] losant loop error: %r" % e, flush=True)
        time.sleep(1)


def _forward_derived(verdict):
    """Forward ONLY derived (non-sensitive) health to Losant, if connected."""
    with _lock:
        stats["derived_seen"] += 1
    if _losant_dev is not None and _losant_dev.is_connected():
        _losant_dev.send_state({
            "tool_id": verdict.get("tool_id"),
            "health": verdict.get("health"),
            "state_num": _STATE_NUM.get(verdict.get("state"), 0),
            "rul_frames": verdict.get("rul_frames"),
        })
        with _lock:
            stats["losant_forwarded"] += 1
    else:
        with _lock:
            stats["losant_withheld_airgapped"] += 1


# --- local broker: ingest raw, normalize, buffer, republish -------------------
def _normalize(tool_id, raw):
    return {
        "tool_id": tool_id,
        "site": SITE,
        "line": LINE,
        "ts": raw.get("ts", time.time()),
        "sensors": raw.get("sensors", {}),
        "gateway": "losant-gea",
    }


def _flush_buffer(client):
    sent = 0
    while _buffer:
        tool_id, frame = _buffer[0]
        res = client.publish("fab/%s/telemetry" % tool_id, json.dumps(frame),
                             qos=0)
        if res.rc != mqtt.MQTT_ERR_SUCCESS:
            break
        _buffer.popleft()
        sent += 1
    if sent:
        with _lock:
            stats["normalized_published"] += sent
            stats["buffer_depth"] = len(_buffer)
        print("[gea] flushed %d buffered frames" % sent, flush=True)


def main():
    _losant_connect()
    threading.Thread(target=_losant_loop, daemon=True).start()

    client = mqtt.Client(client_id="gateway-edge-agent")

    def on_connect(cli, _u, _f, rc):
        print("[gea] local MQTT connected rc=%s" % rc, flush=True)
        cli.subscribe("fab-devices/+/raw", qos=0)
        cli.subscribe("fab/+/health", qos=0)

    def on_message(cli, _u, msg):
        try:
            topic = msg.topic
            payload = json.loads(msg.payload.decode("utf-8"))
            if topic.endswith("/raw"):
                tool_id = payload.get("tool_id") or topic.split("/")[1]
                frame = _normalize(tool_id, payload)
                with _lock:
                    stats["raw_ingested"] += 1
                res = cli.publish("fab/%s/telemetry" % tool_id,
                                  json.dumps(frame), qos=0)
                if res.rc == mqtt.MQTT_ERR_SUCCESS:
                    with _lock:
                        stats["normalized_published"] += 1
                else:  # downstream outage -> buffer (offline buffering)
                    _buffer.append((tool_id, frame))
                    with _lock:
                        stats["buffered"] += 1
                        stats["buffer_depth"] = len(_buffer)
            elif topic.endswith("/health"):
                _forward_derived(payload)
        except Exception as e:  # noqa: BLE001
            print("[gea] message error: %r" % e, flush=True)

    client.on_connect = on_connect
    client.on_message = on_message

    for attempt in range(60):
        try:
            client.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
            break
        except Exception as e:  # noqa: BLE001
            print("[gea] connect retry %d: %r" % (attempt, e), flush=True)
            time.sleep(2)

    threading.Thread(target=lambda: _serve_http(), daemon=True).start()
    client.loop_start()
    try:
        while True:
            _flush_buffer(client)
            time.sleep(2)
    except KeyboardInterrupt:
        pass
    client.loop_stop()


# --- observability ------------------------------------------------------------
class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_):
        pass

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/healthz":
            body = b'{"ok": true}'
        elif path == "/stats":
            with _lock:
                body = json.dumps(dict(stats)).encode("utf-8")
        else:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def _serve_http():
    ThreadingHTTPServer(("0.0.0.0", HTTP_PORT), _Handler).serve_forever()


if __name__ == "__main__":
    main()
