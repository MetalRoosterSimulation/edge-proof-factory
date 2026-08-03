"""ops-center — the far side of the WAN, in one demo container.

Two roles the production design keeps separate, colocated here for
footprint and mapped honestly in the component map: the work-management
handoff (findings become work orders) and the custody archive (every
evidence record is accounted with its traceability metadata). This stub
accounts records rather than storing imagery; production uses the utility's
work-management/GIS systems and a customer- or third-party-operated
S3-compatible object store under utility custody.
"""

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HTTP_PORT = int(os.environ.get("HTTP_PORT", "8090"))

_lock = threading.Lock()
_work_orders = []
_archived = 0
_archived_mb = 0.0
_last_evidence = None
_wo_seq = 0


class Handler(BaseHTTPRequestHandler):
    server_version = "corridor-ops/1.0"

    def log_message(self, fmt, *args):
        pass

    def _json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_POST(self):
        global _archived, _archived_mb, _last_evidence, _wo_seq
        if self.path.startswith("/workorder"):
            rec = self._read()
            with _lock:
                _wo_seq += 1
                wo = "WO-%03d" % _wo_seq
                _work_orders.append({
                    "wo": wo, "id": rec.get("id"), "span": rec.get("span"),
                    "kind": rec.get("kind"), "score": rec.get("score"),
                    "model_version": rec.get("model_version"),
                })
            self._json(200, {"work_order": wo})
        elif self.path.startswith("/archive"):
            rec = self._read()
            with _lock:
                _archived += 1
                _archived_mb += float(rec.get("size_mb", 0))
                _last_evidence = {
                    "span": rec.get("span"), "flight": rec.get("flight"),
                    "model_version": rec.get("model_version"),
                    "kind": rec.get("kind"),
                    "disposition": rec.get("disposition"),
                }
            self._json(200, {"archived": True})
        else:
            self._json(404, {"error": "not found"})

    def do_GET(self):
        if self.path.startswith("/status"):
            with _lock:
                self._json(200, {
                    "reachable": True,
                    "work_orders": len(_work_orders),
                    "recent_work_orders": _work_orders[-5:],
                    "archived": _archived,
                    "archived_mb": round(_archived_mb, 1),
                    "last_evidence": _last_evidence,
                })
        elif self.path.startswith("/healthz"):
            self._json(200, {"ok": True})
        else:
            self._json(404, {"error": "not found"})


def main():
    print("ops-center up on :%d" % HTTP_PORT, flush=True)
    ThreadingHTTPServer(("", HTTP_PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
