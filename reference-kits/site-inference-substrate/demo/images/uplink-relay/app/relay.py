"""uplink-relay — the enclave's outbound voice, plus the site console.

Applies each model's outage policy at enqueue time (continue / flag /
suppress), delivers queued outputs and sealed evidence bundles outbound to
the central side, and tracks uplink state from its own delivery results.
The filesystem is the queue: a severed uplink grows it, a restored uplink
drains it, and suppressed outputs stay on site pending review — they are
never auto-delivered. Serves the site console on :8083 (NodePort).
"""

import json
import os
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

WORK_DIR = os.environ.get("WORK_DIR", "/work")
WORM_DIR = os.environ.get("WORM_DIR", "/worm")
OUTBOX = os.path.join(WORK_DIR, "outbox")
HELD = os.path.join(WORK_DIR, "held")
CENTRAL_URL = os.environ.get(
    "CENTRAL_URL", "http://central.substrate-central.svc.cluster.local:8090")
SERVING_URL = os.environ.get("SERVING_URL", "http://127.0.0.1:8081")
HTTP_PORT = int(os.environ.get("HTTP_PORT", "8083"))
POLL_S = float(os.environ.get("POLL_S", "0.5"))
TIMEOUT_S = float(os.environ.get("TIMEOUT_S", "1.0"))

_lock = threading.Lock()
_state = {
    "uplink_up": True,
    "uplink_since": time.time(),
    "delivered": 0,
    "delivered_flagged": 0,
    "held_total": 0,
    "evidence_shipped": 0,
    "delivery_failures": 0,
    "enqueued": 0,
}
_seq = 0


def _uplink(up):
    with _lock:
        if _state["uplink_up"] != up:
            _state["uplink_up"] = up
            _state["uplink_since"] = time.time()


def _post_central(path, payload):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        CENTRAL_URL + path, data=body,
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        return resp.status == 200


def _fetch_json(url, timeout=0.8):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:  # noqa: BLE001 — unreachable peers are a demo state
        return None


def pump():
    shipped_marker = os.path.join(WORK_DIR, "evidence.shipped")
    while True:
        # 1. outputs
        for fn in sorted(os.listdir(OUTBOX)):
            path = os.path.join(OUTBOX, fn)
            try:
                with open(path) as f:
                    rec = json.load(f)
                if not _post_central("/outputs", rec):
                    raise OSError("non-200")
                os.remove(path)
                with _lock:
                    _state["delivered"] += 1
                    if rec.get("flagged_stale_context"):
                        _state["delivered_flagged"] += 1
                _uplink(True)
            except Exception:  # noqa: BLE001
                with _lock:
                    _state["delivery_failures"] += 1
                _uplink(False)
                break
        # 2. evidence bundles (WORM dir is read-only here; track a marker)
        try:
            last = int(open(shipped_marker).read().strip())
        except (IOError, OSError, ValueError):
            last = -1
        for fn in sorted(os.listdir(WORM_DIR)):
            if not fn.endswith(".json"):
                continue
            seq = int(fn.split("-")[1].split(".")[0])
            if seq <= last:
                continue
            try:
                with open(os.path.join(WORM_DIR, fn)) as f:
                    bundle = json.load(f)
                if not _post_central("/evidence", bundle):
                    raise OSError("non-200")
                last = seq
                with open(shipped_marker + ".tmp", "w") as f:
                    f.write(str(last))
                os.replace(shipped_marker + ".tmp", shipped_marker)
                with _lock:
                    _state["evidence_shipped"] += 1
                _uplink(True)
            except Exception:  # noqa: BLE001
                _uplink(False)
                break
        time.sleep(POLL_S)


class Handler(BaseHTTPRequestHandler):
    server_version = "uplink-relay/1.0"

    def log_message(self, fmt, *args):
        pass

    def _json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        global _seq
        if not self.path.startswith("/enqueue"):
            self._json(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length", "0"))
        rec = json.loads(self.rfile.read(length).decode("utf-8"))
        policy = rec.get("outage_policy", "continue")
        with _lock:
            up = _state["uplink_up"]
            _state["enqueued"] += 1
            _seq += 1
            seq = _seq
        # Disposition per the model's outage policy (mirrors scoring.disposition).
        if up or policy == "continue":
            dest, rec["disposition"] = OUTBOX, "queued"
        elif policy == "flag":
            dest, rec["disposition"] = OUTBOX, "queued-flagged"
            rec["flagged_stale_context"] = True
        else:  # suppress
            dest, rec["disposition"] = HELD, "held"
            with _lock:
                _state["held_total"] += 1
        fn = os.path.join(dest, "out-%08d.json" % seq)
        with open(fn + ".tmp", "w") as f:
            json.dump(rec, f)
        os.replace(fn + ".tmp", fn)
        self._json(200, {"disposition": rec["disposition"]})

    def do_GET(self):
        if self.path.startswith("/status"):
            with _lock:
                payload = dict(_state)
            payload.update({
                "reachable": True,
                "outbox_queued": len(os.listdir(OUTBOX)),
                "held_pending_review": len(os.listdir(HELD)),
                "worm_bundles": sum(1 for f in os.listdir(WORM_DIR)
                                    if f.endswith(".json")),
                "feed": _read_small(os.path.join(WORK_DIR, "feed.state")),
                "serving": _fetch_json(SERVING_URL + "/stats") or {},
                "models": (_fetch_json(SERVING_URL + "/v2/models")
                           or {}).get("models", []),
            })
            self._json(200, payload)
        elif self.path.startswith("/panorama"):
            central = _fetch_json(CENTRAL_URL + "/status", timeout=0.8)
            self._json(200, {
                "central": central if central is not None
                else {"reachable": False},
                "wan_reachable": central is not None,
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


def _read_small(path):
    try:
        with open(path) as f:
            return f.read().strip()
    except (IOError, OSError):
        return "unknown"


CONSOLE_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><title>Site inference substrate</title>
<style>
body{background:#0f1114;color:#d6dae1;font-family:ui-monospace,Consolas,monospace;
     margin:0;padding:18px;font-size:13px}
h1{font-size:15px;margin:0 0 4px}
.chip{border:1px solid #262b33;color:#8f97a3;font-size:10px;padding:2px 6px}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:14px}
.panel{background:#15181d;border:1px solid #262b33;padding:10px}
.panel h2{font-size:10px;letter-spacing:.08em;text-transform:uppercase;
          color:#5c6470;margin:0 0 8px}
.row{display:flex;justify-content:space-between;margin:3px 0;gap:8px}
.k{color:#8f97a3}.v{color:#d6dae1;text-align:right}
.down{color:#e07a2f}.warn{color:#d9a514}.held{color:#4d9fdc}
table{width:100%;border-collapse:collapse;font-size:11px}
td,th{text-align:left;padding:2px 4px;border-bottom:1px solid #1d222a}
th{color:#5c6470;font-weight:normal;text-transform:uppercase;font-size:9px}
footer{margin-top:14px;color:#5c6470;font-size:11px}
</style></head><body>
<h1>Site AI Inference Substrate — analytics enclave
 <span class="chip">SYNTHETIC TELEMETRY · REAL PIPELINE · single-node demo cluster</span></h1>
<div class="grid">
<div class="panel"><h2>Models on the serving tier (KServe v2)</h2>
 <table><thead><tr><th>model</th><th>ver</th><th>outage policy</th><th>scored</th></tr></thead>
 <tbody id="models"></tbody></table>
 <div class="row"><span class="k">historian feed</span><span class="v" id="feed">-</span></div>
</div>
<div class="panel"><h2>Uplink — outbound only</h2>
 <div class="row"><span class="k">uplink</span><span class="v" id="wan">-</span></div>
 <div class="row"><span class="k">outputs queued</span><span class="v" id="qd">-</span></div>
 <div class="row"><span class="k">delivered (flagged)</span><span class="v"><span id="dl">-</span> (<span id="fl" class="warn">-</span>)</span></div>
 <div class="row"><span class="k">held for review (suppress)</span><span class="v held" id="held">-</span></div>
</div>
<div class="panel"><h2>Evidence — signed, chained, WORM</h2>
 <div class="row"><span class="k">bundles sealed on site</span><span class="v" id="worm">-</span></div>
 <div class="row"><span class="k">shipped to central</span><span class="v" id="ship">-</span></div>
 <div class="row"><span class="k">central: verified / chain</span><span class="v"><span id="ver">-</span> / <span id="chain">-</span></span></div>
 <div class="row"><span class="k">central outputs received</span><span class="v" id="rec">-</span></div>
</div>
</div>
<footer>Enclave flows are outbound-initiated · OT crossing is a read-only replica ·
models are customer/ISV workloads the substrate hosts · no control signals leave here</footer>
<script>
async function tick(){
 try{
  const s=await (await fetch('/status')).json();
  const p=await (await fetch('/panorama')).json();
  const tb=document.getElementById('models');tb.innerHTML='';
  (s.models||[]).forEach(m=>{
   const tr=document.createElement('tr');
   const scored=(s.serving&&s.serving.scored&&s.serving.scored[m.name])||0;
   tr.innerHTML='<td>'+m.name+'</td><td>'+m.versions[0]+'</td><td>'+
     m.parameters.outage_policy+'</td><td>'+scored+'</td>';
   tb.appendChild(tr);});
  feed.textContent=s.feed;
  wan.textContent=s.uplink_up&&p.wan_reachable?'UP — site dialing out':'SEVERED — scoring continues';
  wan.className='v'+((s.uplink_up&&p.wan_reachable)?'':' down');
  qd.textContent=s.outbox_queued; dl.textContent=s.delivered;
  fl.textContent=s.delivered_flagged; held.textContent=s.held_pending_review;
  worm.textContent=s.worm_bundles; ship.textContent=s.evidence_shipped;
  const c=p.central||{};
  ver.textContent=(c.evidence_verified!==undefined)?c.evidence_verified:'unreachable';
  chain.textContent=(c.chain_ok!==undefined)?(c.chain_ok?'OK':'BROKEN'):'-';
  rec.textContent=(c.outputs_total!==undefined)?c.outputs_total:'unreachable';
 }catch(e){}
}
setInterval(tick,1000);tick();
</script></body></html>
"""


def main():
    for d in (OUTBOX, HELD):
        os.makedirs(d, exist_ok=True)
    threading.Thread(target=pump, daemon=True).start()
    print("uplink-relay up · central %s" % CENTRAL_URL, flush=True)
    ThreadingHTTPServer(("", HTTP_PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
