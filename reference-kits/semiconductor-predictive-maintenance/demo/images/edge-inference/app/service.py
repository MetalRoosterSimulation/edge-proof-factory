#!/usr/bin/env python3
"""
edge-inference — subscribes to fab telemetry over MQTT, scores every frame with
the on-device predictive-maintenance model, and serves:

    GET /                 the ops dashboard (self-contained HTML)
    GET /api/health       JSON fleet snapshot (worst tool first)
    GET /api/tool/<id>    JSON detail + recent health/sensor history for one tool
    GET /metrics          Prometheus exposition (tool health, state, RUL)
    GET /healthz          liveness

This is the on-prem inference tier — the analog of SUSE AI. It runs CPU-only in a
single small pod, which is what lets the whole demo fit on a laptop. The model
lives in health_model.py; this file is just wiring (MQTT in, HTTP out).
"""
import json
import os
import threading
import time
import urllib.request
import urllib.error
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import paho.mqtt.client as mqtt

from app.health_model import Fleet, SENSORS

MQTT_HOST = os.environ.get("MQTT_HOST", "mosquitto")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
HTTP_PORT = int(os.environ.get("HTTP_PORT", "8080"))
WARMUP = int(os.environ.get("WARMUP", "30"))
HISTORY = int(os.environ.get("HISTORY", "120"))  # frames kept per tool for trend
# Optional SUSE AI analog: a local LLM (Ollama) that explains an anomaly in plain
# language. On-prem — the prompt never leaves the cluster. Empty => feature off.
OLLAMA_URL = os.environ.get("OLLAMA_URL", "").strip()
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:0.5b")

_HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(_HERE, "dashboard.html"), "r") as fh:
    DASHBOARD_HTML = fh.read()

# --- shared state (guarded by a lock) -----------------------------------------
_lock = threading.Lock()
_fleet = Fleet(warmup=WARMUP)
_history = defaultdict(lambda: deque(maxlen=HISTORY))  # tool -> deque of samples
_stats = {"frames": 0, "started": time.time()}


def _ingest(tool_id, ts, sensors):
    with _lock:
        verdict = _fleet.ingest(tool_id, sensors)
        _history[tool_id].append({
            "ts": ts,
            "health": verdict["health"],
            "state": verdict["state"],
            "sensors": sensors,
        })
        _stats["frames"] += 1
    return verdict


def _derived(verdict):
    """Only non-sensitive, derived fields ever leave this tier (governance)."""
    return {
        "tool_id": verdict["tool_id"],
        "health": verdict["health"],
        "state": verdict["state"],
        "rul_frames": verdict["rul_frames"],
        "warming": verdict["warming"],
    }


# --- MQTT ---------------------------------------------------------------------
def _start_mqtt():
    client = mqtt.Client(client_id="edge-inference")

    def on_connect(cli, _u, _f, rc):
        print("[inf] MQTT connected rc=%s; subscribing fab/+/telemetry" % rc,
              flush=True)
        cli.subscribe("fab/+/telemetry", qos=0)

    def on_message(cli, _u, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
            verdict = _ingest(payload["tool_id"],
                              payload.get("ts", time.time()),
                              payload["sensors"])
            # Publish the derived verdict for the governed-egress tier (the
            # Losant gateway forwards ONLY this to the Losant platform; raw
            # telemetry never leaves the fab).
            cli.publish("fab/%s/health" % verdict["tool_id"],
                        json.dumps(_derived(verdict)), qos=0)
        except Exception as e:  # noqa: BLE001
            print("[inf] bad telemetry: %r" % e, flush=True)

    client.on_connect = on_connect
    client.on_message = on_message
    for attempt in range(60):
        try:
            client.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
            break
        except Exception as e:  # noqa: BLE001
            print("[inf] MQTT connect retry %d: %r" % (attempt, e), flush=True)
            time.sleep(2)
    client.loop_forever(retry_first_connection=True)


# --- HTTP ---------------------------------------------------------------------
_STATE_NUM = {"HEALTHY": 0, "WATCH": 1, "WARNING": 2, "CRITICAL": 3}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, code, body, ctype="application/json"):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):  # silence default noisy logging
        pass

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/" or path == "/index.html":
            return self._send(200, DASHBOARD_HTML, "text/html; charset=utf-8")
        if path == "/healthz":
            return self._send(200, json.dumps({"ok": True}))
        if path == "/api/health":
            return self._api_health()
        if path.startswith("/api/tool/"):
            return self._api_tool(path[len("/api/tool/"):])
        if path.startswith("/api/explain/"):
            return self._api_explain(path[len("/api/explain/"):])
        if path == "/metrics":
            return self._metrics()
        return self._send(404, json.dumps({"error": "not found"}))

    def _api_explain(self, tool_id):
        with _lock:
            verdict = _fleet.last_verdict.get(tool_id)
        if verdict is None:
            return self._send(404, json.dumps({"error": "unknown tool"}))
        if not OLLAMA_URL:
            return self._send(200, json.dumps({
                "tool_id": tool_id,
                "explanation": None,
                "available": False,
                "note": "Local LLM tier not enabled. Run `make ai` to add the "
                        "SUSE AI analog (Ollama + Open WebUI); set OLLAMA_URL.",
            }))
        contribs = ", ".join(
            "%s (z=%s)" % (c["sensor"], c["z"]) for c in verdict["top_contributors"]
        ) or "no dominant signal"
        prompt = (
            "You are a semiconductor fab maintenance assistant. A plasma-etch "
            "tool '%s' has health %s/100 (state %s). The strongest anomaly "
            "signals are: %s. In 2-3 sentences, explain the most likely failure "
            "mode and the first maintenance action. Be specific and concise."
            % (tool_id, verdict["health"], verdict["state"], contribs)
        )
        try:
            body = json.dumps({
                "model": OLLAMA_MODEL, "prompt": prompt, "stream": False,
            }).encode("utf-8")
            req = urllib.request.Request(
                OLLAMA_URL.rstrip("/") + "/api/generate", data=body,
                headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                out = json.loads(r.read().decode("utf-8"))
            return self._send(200, json.dumps({
                "tool_id": tool_id, "available": True,
                "explanation": out.get("response", "").strip(),
                "model": OLLAMA_MODEL,
            }))
        except urllib.error.HTTPError as e:  # ollama up, but request failed
            detail = ""
            try:
                detail = e.read().decode("utf-8")[:200]
            except Exception:  # noqa: BLE001
                pass
            model_missing = "model" in detail.lower() and (
                "not found" in detail.lower() or "try pulling" in detail.lower())
            note = ("SUSE AI model '%s' is still downloading — try again shortly."
                    % OLLAMA_MODEL) if model_missing else \
                   ("SUSE AI request failed (HTTP %s): %s" % (e.code, detail))
            return self._send(200, json.dumps({
                "tool_id": tool_id, "available": False, "explanation": None,
                "note": note,
            }))
        except Exception as e:  # noqa: BLE001  (connection refused, DNS, timeout)
            return self._send(200, json.dumps({
                "tool_id": tool_id, "available": False, "explanation": None,
                "note": "SUSE AI tier not reachable at %s — deploy the AI profile "
                        "(`make ai`, or add the Fleet k8s/ai path). Detail: %s"
                        % (OLLAMA_URL, e),
            }))

    def _api_health(self):
        with _lock:
            snap = _fleet.snapshot()
            frames = _stats["frames"]
            uptime = int(time.time() - _stats["started"])
        counts = defaultdict(int)
        for v in snap:
            counts[v["state"]] += 1
        return self._send(200, json.dumps({
            "generated": time.time(),
            "frames_processed": frames,
            "uptime_s": uptime,
            "counts": counts,
            "tools": snap,
            "sensors": list(SENSORS),
        }))

    def _api_tool(self, tool_id):
        with _lock:
            hist = list(_history.get(tool_id, []))
            verdict = _fleet.last_verdict.get(tool_id)
        if verdict is None:
            return self._send(404, json.dumps({"error": "unknown tool"}))
        return self._send(200, json.dumps({
            "tool_id": tool_id,
            "verdict": verdict,
            "history": hist,
        }))

    def _metrics(self):
        with _lock:
            snap = _fleet.snapshot()
            frames = _stats["frames"]
        lines = [
            "# HELP edge_frames_processed_total Telemetry frames scored.",
            "# TYPE edge_frames_processed_total counter",
            "edge_frames_processed_total %d" % frames,
            "# HELP tool_health_score Predictive-maintenance health (0-100).",
            "# TYPE tool_health_score gauge",
            "# HELP tool_state Tool state (0 healthy .. 3 critical).",
            "# TYPE tool_state gauge",
            "# HELP tool_rul_frames Forecast remaining useful life in frames.",
            "# TYPE tool_rul_frames gauge",
        ]
        for v in snap:
            t = v["tool_id"]
            lines.append('tool_health_score{tool="%s"} %s' % (t, v["health"]))
            lines.append('tool_state{tool="%s"} %d'
                         % (t, _STATE_NUM.get(v["state"], 0)))
            if v["rul_frames"] is not None:
                lines.append('tool_rul_frames{tool="%s"} %d'
                             % (t, v["rul_frames"]))
        return self._send(200, "\n".join(lines) + "\n",
                          "text/plain; version=0.0.4")


def main():
    t = threading.Thread(target=_start_mqtt, daemon=True)
    t.start()
    server = ThreadingHTTPServer(("0.0.0.0", HTTP_PORT), Handler)
    print("[inf] serving dashboard + API on :%d" % HTTP_PORT, flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
