"""findings-relay — the site's only voice to the outside, outbound only.

Delivers scored results across the "WAN": findings to the ops work-order
endpoint, every record (plus its imagery bytes, standing in for archive
sync) to the custody archive. On delivery failure the record simply stays
on the working volume — that IS the queue, so a severed WAN grows it and a
restored WAN drains it. The image file is deleted only after the archive
accepts the evidence record, which is what frees working storage.
"""

import json
import os
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

WORK_DIR = os.environ.get("WORK_DIR", "/work")
SCORED = os.path.join(WORK_DIR, "scored")
OPS_URL = os.environ.get(
    "OPS_URL", "http://ops-center.corridor-ops.svc.cluster.local:8090")
HTTP_PORT = int(os.environ.get("HTTP_PORT", "8081"))
POLL_S = float(os.environ.get("POLL_S", "0.5"))
TIMEOUT_S = float(os.environ.get("TIMEOUT_S", "1.0"))

_lock = threading.Lock()
_stats = {"delivered_findings": 0, "archived": 0, "delivery_failures": 0}


def _post(path, payload):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        OPS_URL + path, data=body,
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        return resp.status == 200


def deliver_one(rec_id):
    json_path = os.path.join(SCORED, rec_id + ".json")
    ppm_path = os.path.join(SCORED, rec_id + ".ppm")
    with open(json_path) as f:
        rec = json.load(f)
    if rec.get("finding"):
        if not _post("/workorder", rec):
            return False
        with _lock:
            _stats["delivered_findings"] += 1
    # Evidence record always goes to the custody archive (imagery bytes are
    # represented by size_mb — the stub archive accounts, it does not store).
    if not _post("/archive", rec):
        return False
    with _lock:
        _stats["archived"] += 1
    for p in (ppm_path, json_path):
        try:
            os.remove(p)
        except OSError:
            pass
    return True


def pump():
    while True:
        ready = sorted(
            f[:-5] for f in os.listdir(SCORED) if f.endswith(".json"))
        for rec_id in ready:
            try:
                if not deliver_one(rec_id):
                    raise urllib.error.URLError("non-200")
            except Exception:  # noqa: BLE001 — severed WAN is a demo state
                with _lock:
                    _stats["delivery_failures"] += 1
                break  # link is down; stop hammering, keep the queue
        time.sleep(POLL_S)


class Handler(BaseHTTPRequestHandler):
    server_version = "corridor-relay/1.0"

    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        if self.path.startswith("/status"):
            queued = sum(1 for f in os.listdir(SCORED) if f.endswith(".json"))
            with _lock:
                payload = dict(_stats)
            payload["queued"] = queued
            payload["reachable"] = True
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()


def main():
    os.makedirs(SCORED, exist_ok=True)
    threading.Thread(target=pump, daemon=True).start()
    print("findings-relay up · outbound to %s" % OPS_URL, flush=True)
    ThreadingHTTPServer(("", HTTP_PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
