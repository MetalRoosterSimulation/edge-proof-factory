"""central-stub — the far side of the uplink, in one demo container.

Stands in for the central plane's receiving surfaces: the ML platform's
ingestion API (scored outputs + drift context) and the evidence object
store (verifies each shipped bundle's signature and chain position on
arrival). Production separates these across the customer's ML platform and
a WORM object store under the customer's PKI; the colocation and the
shared-key verification are demo simplifications stated in the component map.
"""

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from app.evchain import GENESIS, verify_one

HTTP_PORT = int(os.environ.get("HTTP_PORT", "8090"))
KEY = os.environ.get("EVIDENCE_KEY", "demo-site-signing-key").encode("utf-8")

_lock = threading.Lock()
_outputs_total = 0
_outputs_by_model = {}
_outputs_flagged = 0
_last_output = None
_evidence_verified = 0
_evidence_failed = 0
_chain_ok = True
_expected_prev = GENESIS
_expected_seq = 0


class Handler(BaseHTTPRequestHandler):
    server_version = "central-stub/1.0"

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
        global _outputs_total, _outputs_flagged, _last_output
        global _evidence_verified, _evidence_failed, _chain_ok
        global _expected_prev, _expected_seq
        if self.path.startswith("/outputs"):
            rec = self._read()
            with _lock:
                _outputs_total += 1
                m = rec.get("model_name", "?")
                _outputs_by_model[m] = _outputs_by_model.get(m, 0) + 1
                if rec.get("flagged_stale_context"):
                    _outputs_flagged += 1
                _last_output = {
                    "unit": rec.get("unit"), "model": m,
                    "version": rec.get("model_version"),
                    "disposition": rec.get("disposition"),
                }
            self._json(200, {"accepted": True})
        elif self.path.startswith("/evidence"):
            bundle = self._read()
            hash_ok, sig_ok = verify_one(bundle, KEY)
            with _lock:
                linked = (bundle.get("prev_hash") == _expected_prev
                          and bundle.get("seq") == _expected_seq)
                if hash_ok and sig_ok and linked:
                    _evidence_verified += 1
                    _expected_prev = bundle["hash"]
                    _expected_seq += 1
                else:
                    _evidence_failed += 1
                    _chain_ok = False
            self._json(200, {"verified": hash_ok and sig_ok and linked})
        else:
            self._json(404, {"error": "not found"})

    def do_GET(self):
        if self.path.startswith("/status"):
            with _lock:
                self._json(200, {
                    "reachable": True,
                    "outputs_total": _outputs_total,
                    "outputs_by_model": dict(_outputs_by_model),
                    "outputs_flagged": _outputs_flagged,
                    "last_output": _last_output,
                    "evidence_verified": _evidence_verified,
                    "evidence_failed": _evidence_failed,
                    "chain_ok": _chain_ok,
                })
        elif self.path.startswith("/healthz"):
            self._json(200, {"ok": True})
        else:
            self._json(404, {"error": "not found"})


def main():
    print("central-stub up on :%d" % HTTP_PORT, flush=True)
    ThreadingHTTPServer(("", HTTP_PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
