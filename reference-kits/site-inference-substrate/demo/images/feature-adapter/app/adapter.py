"""feature-adapter — reads the DMZ replica, feeds the serving tier.

The containerized read-only client of the architecture: queries the
historian replica under the read-only credential (outbound connection,
inbound data — the only OT-derived flow), builds KServe v2 infer requests
for every model, and hands each scored output to the uplink relay, which
applies the model's outage policy. If the replica is unreachable the feed
is marked stale and nothing is scored — a distinct failure from WAN loss.
"""

import json
import os
import time
import urllib.error
import urllib.request

REPLICA_URL = os.environ.get(
    "REPLICA_URL", "http://historian-replica.substrate-dmz.svc.cluster.local:8070")
READONLY_TOKEN = os.environ.get("READONLY_TOKEN", "tok-replica-readonly")
SERVING_URL = os.environ.get("SERVING_URL", "http://127.0.0.1:8081")
RELAY_URL = os.environ.get("RELAY_URL", "http://127.0.0.1:8083")
WORK_DIR = os.environ.get("WORK_DIR", "/work")
POLL_S = float(os.environ.get("POLL_S", "2.0"))
FEED_STATE = os.path.join(WORK_DIR, "feed.state")


def _get(url, headers=None, timeout=2.0):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _post(url, payload, timeout=2.0):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _set_feed(state):
    with open(FEED_STATE + ".tmp", "w") as f:
        f.write(state)
    os.replace(FEED_STATE + ".tmp", FEED_STATE)


def models():
    return _get(SERVING_URL + "/v2/models")["models"]


def infer_request(model, tags):
    return {"inputs": [{"name": t["name"], "datatype": "FP64", "shape": [1],
                        "data": [tags[t["name"]]]}
                       for t in model["inputs"]]}


def main():
    os.makedirs(WORK_DIR, exist_ok=True)
    print("feature-adapter up · replica %s" % REPLICA_URL, flush=True)
    model_list = None
    while True:
        try:
            if model_list is None:
                model_list = models()
            feed = _get(REPLICA_URL + "/tags",
                        headers={"Authorization": "Bearer " + READONLY_TOKEN})
            _set_feed("fresh")
            for unit, tags in sorted(feed["units"].items()):
                for m in model_list:
                    try:
                        resp = _post(
                            SERVING_URL + "/v2/models/%s/infer" % m["name"],
                            infer_request(m, tags))
                    except (urllib.error.URLError, OSError):
                        continue
                    record = {
                        "unit": unit,
                        "ts": feed["ts"],
                        "model_name": resp["model_name"],
                        "model_version": resp["model_version"],
                        "outage_policy": resp["parameters"]["outage_policy"],
                        "result": json.loads(resp["outputs"][0]["data"][0]),
                    }
                    try:
                        _post(RELAY_URL + "/enqueue", record)
                    except (urllib.error.URLError, OSError):
                        pass  # relay restarting; next cycle re-scores
        except (urllib.error.URLError, OSError, ValueError, KeyError):
            _set_feed("stale")
        time.sleep(POLL_S)


if __name__ == "__main__":
    main()
