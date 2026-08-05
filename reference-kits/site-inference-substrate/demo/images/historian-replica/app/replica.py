"""historian-replica — the DMZ read-only replica tier, simulated.

Serves a looping synthetic historian feed (temperature / pressure /
cycle_count per unit) behind a read-only bearer token: the stand-in for the
PI-to-PI-class replica (or hardware unidirectional gateway) the production
design reads through. It is a server only — it never initiates a connection
toward anything, which is the one-way property of the tier it simulates.
"""

import json
import math
import os
import random
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HTTP_PORT = int(os.environ.get("HTTP_PORT", "8070"))
READONLY_TOKEN = os.environ.get("READONLY_TOKEN", "tok-replica-readonly")
SEED = int(os.environ.get("SEED", "42"))
UNITS = os.environ.get("UNITS", "U-1,U-2,U-3").split(",")
LOOP_S = float(os.environ.get("LOOP_S", "120"))  # feed loops on this period

_rng = random.Random(SEED)
_jitter = {u: _rng.uniform(0, math.pi) for u in UNITS}


def tags_for(unit, now):
    """Deterministic-ish looping telemetry; U-2 rides a periodic thermal
    ramp so the thermal-precursor model has something to find."""
    phase = (now % LOOP_S) / LOOP_S * 2 * math.pi + _jitter[unit]
    temp = 66.0 + 8.0 * math.sin(phase) + _rng.uniform(-1.5, 1.5)
    if unit == "U-2" and 0.55 < (now % LOOP_S) / LOOP_S < 0.75:
        temp += 45.0 * math.sin(((now % LOOP_S) / LOOP_S - 0.55) * 5 * math.pi)
    pressure = 11.2 + 1.6 * math.sin(phase * 0.7) + _rng.uniform(-0.4, 0.4)
    cycles = max(0.0, 18.0 + 14.0 * math.sin(phase * 1.3) + _rng.uniform(-3, 3))
    return {
        "temperature": round(temp, 2),
        "pressure": round(pressure, 2),
        "cycle_count": round(cycles, 1),
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "historian-replica/1.0"

    def log_message(self, fmt, *args):
        pass

    def _json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/healthz"):
            self._json(200, {"ok": True})
            return
        auth = self.headers.get("Authorization", "")
        if auth != "Bearer " + READONLY_TOKEN:
            self._json(401, {"error": "read-only credential required"})
            return
        if self.path.startswith("/tags"):
            now = time.time()
            self._json(200, {
                "ts": now,
                "units": {u: tags_for(u, now) for u in UNITS},
            })
        else:
            self._json(404, {"error": "not found"})


def main():
    print("historian-replica up on :%d (read-only)" % HTTP_PORT, flush=True)
    ThreadingHTTPServer(("", HTTP_PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
