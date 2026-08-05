"""inference-serving — KServe-class serving container, v2 inference protocol.

Speaks the KServe/Triton open inference protocol surface the production
substrate hosts (/v2/health/*, /v2/models, /v2/models/<m>, /v2/models/<m>/infer)
so the platform contract on display is the real one. The models inside are
stand-ins (app/scoring.py); production serves the customer's or an ISV's
models on KServe- or Triton-class runtimes — this kit claims none of them.
Per-model outage policy is model metadata, visible at /v2/models.
"""

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from app.scoring import MODELS, infer

HTTP_PORT = int(os.environ.get("HTTP_PORT", "8081"))

_lock = threading.Lock()
_scored = {name: 0 for name in MODELS}


def model_metadata(name):
    meta = MODELS[name]
    return {
        "name": name,
        "versions": [meta["version"]],
        "platform": "demo-python",
        "inputs": [{"name": t, "datatype": "FP64", "shape": [1]}
                   for t in meta["inputs"]],
        "outputs": [{"name": "result", "datatype": "BYTES", "shape": [1]}],
        "parameters": {"outage_policy": meta["outage_policy"]},
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "inference-serving/1.0"

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
        if self.path in ("/v2/health/live", "/v2/health/ready", "/healthz"):
            self._json(200, {"live": True, "ready": True})
        elif self.path == "/v2/models" or self.path == "/v2/models/":
            self._json(200, {"models": [model_metadata(n)
                                        for n in sorted(MODELS)]})
        elif self.path.startswith("/v2/models/"):
            name = self.path.split("/")[3]
            if name in MODELS:
                self._json(200, model_metadata(name))
            else:
                self._json(404, {"error": "unknown model"})
        elif self.path.startswith("/stats"):
            with _lock:
                self._json(200, {"scored": dict(_scored)})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        parts = self.path.split("/")
        if (len(parts) == 5 and parts[1] == "v2" and parts[2] == "models"
                and parts[4] == "infer" and parts[3] in MODELS):
            name = parts[3]
            length = int(self.headers.get("Content-Length", "0"))
            try:
                req = json.loads(self.rfile.read(length).decode("utf-8"))
                tags = {t["name"]: t["data"][0] for t in req.get("inputs", [])}
                out = infer(name, tags)
            except (ValueError, KeyError, IndexError, TypeError) as exc:
                self._json(400, {"error": "bad infer request: %r" % exc})
                return
            with _lock:
                _scored[name] += 1
            self._json(200, {
                "model_name": out["model_name"],
                "model_version": out["model_version"],
                "parameters": {"outage_policy": out["outage_policy"]},
                "outputs": [{
                    "name": "result",
                    "datatype": "BYTES",
                    "shape": [1],
                    "data": [json.dumps(out["result"])],
                }],
            })
        else:
            self._json(404, {"error": "not found"})


def main():
    print("inference-serving up on :%d · models: %s"
          % (HTTP_PORT, ", ".join(sorted(MODELS))), flush=True)
    ThreadingHTTPServer(("", HTTP_PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
