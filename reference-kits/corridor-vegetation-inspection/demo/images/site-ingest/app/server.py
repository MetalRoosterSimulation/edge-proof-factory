"""site-ingest — the one inbound flow at the corridor site boundary.

Accepts ground-station imagery uploads under per-station credentials, applies
the bounded-autonomy rules (capacity ALERT before ingest BACKPRESSURE), lands
accepted imagery + campaign metadata on the shared working volume, and serves
the site console (self-contained HTML) plus JSON status.

Working-storage usage is computed from the volume itself (os.walk), so the
filesystem is the single source of truth: storage frees exactly when the
relay deletes an image after its evidence record lands in the archive.
"""

import json
import os
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

WORK_DIR = os.environ.get("WORK_DIR", "/work")
INCOMING = os.path.join(WORK_DIR, "incoming")
SCORED = os.path.join(WORK_DIR, "scored")
HTTP_PORT = int(os.environ.get("HTTP_PORT", "8080"))
LIMIT_MB = float(os.environ.get("WORKING_LIMIT_MB", "24"))
RELAY_STATUS_URL = os.environ.get("RELAY_STATUS_URL", "http://127.0.0.1:8081/status")
OPS_STATUS_URL = os.environ.get(
    "OPS_STATUS_URL", "http://ops-center.corridor-ops.svc.cluster.local:8090/status")
# "GS-11=tok-corridor-a,GS-12=tok-corridor-b"
STATION_TOKENS = dict(
    pair.split("=", 1)
    for pair in os.environ.get("STATION_TOKENS", "GS-11=tok-corridor-a").split(",")
    if "=" in pair)

from app.store import should_accept, storage_state  # noqa: E402

_lock = threading.Lock()
_counters = {"accepted": 0, "rejected_401": 0, "rejected_507": 0}
_first_alert_t = None
_first_backpressure_t = None
_seq = 0


def used_mb():
    total = 0
    for root, _dirs, files in os.walk(WORK_DIR):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total / (1024.0 * 1024.0)


def _fetch_json(url, timeout=0.7):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:  # noqa: BLE001 — unreachable peers are a demo state
        return None


def _note_state(state):
    global _first_alert_t, _first_backpressure_t
    now = time.time()
    if state in ("ALERT", "BACKPRESSURE") and _first_alert_t is None:
        _first_alert_t = now
    if state == "BACKPRESSURE" and _first_backpressure_t is None:
        _first_backpressure_t = now


class Handler(BaseHTTPRequestHandler):
    server_version = "corridor-ingest/1.0"

    def log_message(self, fmt, *args):  # quiet
        pass

    def _json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/status"):
            u = used_mb()
            state = storage_state(u, LIMIT_MB)
            _note_state(state)
            with _lock:
                payload = dict(_counters)
            payload.update({
                "used_mb": round(u, 2),
                "limit_mb": LIMIT_MB,
                "state": state,
                "alert_raised": _first_alert_t is not None,
                "backpressure_raised": _first_backpressure_t is not None,
                "alert_before_backpressure": (
                    _first_alert_t is not None
                    and (_first_backpressure_t is None
                         or _first_alert_t <= _first_backpressure_t)),
                "incoming_backlog": len(os.listdir(INCOMING)) // 2,
                "scored_waiting": sum(
                    1 for f in os.listdir(SCORED) if f.endswith(".json")),
            })
            self._json(200, payload)
        elif self.path.startswith("/panorama"):
            relay = _fetch_json(RELAY_STATUS_URL)
            ops = _fetch_json(OPS_STATUS_URL)
            self._json(200, {
                "relay": relay or {"reachable": False},
                "ops": ops if ops is not None else {"reachable": False},
                "wan_reachable": ops is not None,
            })
        elif self.path == "/" or self.path.startswith("/index"):
            body = CONSOLE_HTML.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path.startswith("/healthz"):
            self._json(200, {"ok": True})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        global _seq
        if not self.path.startswith("/upload"):
            self._json(404, {"error": "not found"})
            return
        # Drain the body BEFORE any refusal: closing the socket mid-upload
        # gives the client a broken pipe instead of the status code.
        length = int(self.headers.get("Content-Length", "0"))
        data = self.rfile.read(length) if length else b""
        station = self.headers.get("X-Station", "")
        auth = self.headers.get("Authorization", "")
        token = auth[7:] if auth.startswith("Bearer ") else ""
        if not station or STATION_TOKENS.get(station) != token:
            with _lock:
                _counters["rejected_401"] += 1
            self._json(401, {"error": "credential refused", "station": station})
            return
        size_mb = len(data) / (1024.0 * 1024.0)
        u = used_mb()
        ok, state = should_accept(size_mb, u, LIMIT_MB)
        _note_state(state)
        if not ok:
            with _lock:
                _counters["rejected_507"] += 1
            self._json(507, {"error": "working storage backpressure",
                             "state": state})
            return
        with _lock:
            _seq += 1
            img_id = "IMG-%04d" % _seq
            _counters["accepted"] += 1
        meta = {
            "id": img_id,
            "station": station,
            "span": self.headers.get("X-Span", "SP-0000"),
            "flight": self.headers.get("X-Flight", "F-0000"),
            "size_mb": round(size_mb, 3),
            "received_t": time.time(),
        }
        tmp = os.path.join(INCOMING, img_id)
        with open(tmp + ".ppm", "wb") as f:
            f.write(data)
        with open(tmp + ".json", "w") as f:
            json.dump(meta, f)
        self._json(200, {"id": img_id, "state": state})


CONSOLE_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><title>Corridor site console</title>
<style>
body{background:#0f1114;color:#d6dae1;font-family:ui-monospace,Consolas,monospace;
     margin:0;padding:18px;font-size:13px}
h1{font-size:15px;margin:0 0 4px}
.chip{border:1px solid #262b33;color:#8f97a3;font-size:10px;padding:2px 6px}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:14px}
.panel{background:#15181d;border:1px solid #262b33;padding:10px}
.panel h2{font-size:10px;letter-spacing:.08em;text-transform:uppercase;
          color:#5c6470;margin:0 0 8px}
.row{display:flex;justify-content:space-between;margin:3px 0}
.k{color:#8f97a3}.v{color:#d6dae1}
.bar{background:#1a1e24;height:14px;position:relative;margin-top:6px}
.bar i{display:block;height:100%;background:#7d8ca1}
.alert .bar i{background:#d9a514}.bp .bar i{background:#e0473d}
.down{color:#e07a2f}.blocked{color:#e0473d}
footer{margin-top:14px;color:#5c6470;font-size:11px}
</style></head><body>
<h1>Corridor Inspection — ground-side site
 <span class="chip">SIMULATED IMAGERY · REAL PIPELINE · single-node demo cluster</span></h1>
<div class="grid">
<div class="panel" id="p-ingest"><h2>Ingest &amp; working storage</h2>
 <div class="row"><span class="k">accepted</span><span class="v" id="acc">-</span></div>
 <div class="row"><span class="k">refused 401 / 507</span><span class="v"><span id="r401">-</span> / <span id="r507" class="blocked">-</span></span></div>
 <div class="row"><span class="k">storage</span><span class="v" id="st">-</span></div>
 <div class="bar"><i id="fill" style="width:0%"></i></div>
 <div class="row"><span class="k">scoring backlog</span><span class="v" id="bk">-</span></div>
</div>
<div class="panel"><h2>Boundary — outbound only</h2>
 <div class="row"><span class="k">wan</span><span class="v" id="wan">-</span></div>
 <div class="row"><span class="k">queued for delivery</span><span class="v" id="qd">-</span></div>
 <div class="row"><span class="k">delivered findings</span><span class="v" id="df">-</span></div>
 <div class="row"><span class="k">evidence archived</span><span class="v" id="ar">-</span></div>
</div>
<div class="panel"><h2>Ops center (far side)</h2>
 <div class="row"><span class="k">work orders</span><span class="v" id="wo">-</span></div>
 <div class="row"><span class="k">last evidence</span><span class="v" id="ev">-</span></div>
</div>
</div>
<footer>Flight tier out of scope · one inbound flow (per-station credential) ·
no data path to protection &amp; control</footer>
<script>
async function tick(){
 try{
  const s=await (await fetch('/status')).json();
  const p=await (await fetch('/panorama')).json();
  acc.textContent=s.accepted; r401.textContent=s.rejected_401;
  r507.textContent=s.rejected_507;
  st.textContent=s.used_mb.toFixed(1)+'/'+s.limit_mb+' MB · '+s.state;
  fill.style.width=Math.min(100,100*s.used_mb/s.limit_mb)+'%';
  bk.textContent=s.incoming_backlog;
  document.getElementById('p-ingest').className=
    'panel'+(s.state==='ALERT'?' alert':s.state==='BACKPRESSURE'?' bp':'');
  wan.textContent=p.wan_reachable?'UP — site dialing out':'SEVERED — autonomous';
  wan.className='v'+(p.wan_reachable?'':' down');
  qd.textContent=(p.relay&&p.relay.queued!==undefined)?p.relay.queued:'-';
  df.textContent=(p.relay&&p.relay.delivered_findings!==undefined)?p.relay.delivered_findings:'-';
  ar.textContent=(p.relay&&p.relay.archived!==undefined)?p.relay.archived:'-';
  wo.textContent=(p.ops&&p.ops.work_orders!==undefined)?p.ops.work_orders:'unreachable';
  ev.textContent=(p.ops&&p.ops.last_evidence)?
    p.ops.last_evidence.span+' · '+p.ops.last_evidence.kind:'-';
 }catch(e){}
}
setInterval(tick,1000);tick();
</script></body></html>
"""


def main():
    os.makedirs(INCOMING, exist_ok=True)
    os.makedirs(SCORED, exist_ok=True)
    ThreadingHTTPServer(("", HTTP_PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
