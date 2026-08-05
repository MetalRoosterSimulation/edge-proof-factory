"""evidence-collector — the scheduled evidence job, sealed to a WORM dir.

Assembles the site's evidence bundle on an interval: what was running
(model table + versions + policies from the serving tier), under what
applied revision, with what counters — then chains it to the previous
bundle by hash, signs it with the per-site key, writes it to the
WORM-style directory, and drops write permission on the file (0444).
The relay ships bundles outbound; the WORM copies never leave the site's
custody and the chain makes tampering or gaps detectable.
"""

import json
import os
import stat
import time
import urllib.request

from app.evchain import GENESIS, seal

WORM_DIR = os.environ.get("WORM_DIR", "/worm")
WORK_DIR = os.environ.get("WORK_DIR", "/work")
SERVING_URL = os.environ.get("SERVING_URL", "http://127.0.0.1:8081")
RELAY_URL = os.environ.get("RELAY_URL", "http://127.0.0.1:8083")
SITE_ID = os.environ.get("SITE_ID", "SITE-01")
APPLIED_REVISION = os.environ.get("APPLIED_REVISION", "demo-rev-000")
INTERVAL_S = float(os.environ.get("INTERVAL_S", "15"))
KEY = os.environ.get("EVIDENCE_KEY", "demo-site-signing-key").encode("utf-8")


def _fetch(url):
    try:
        with urllib.request.urlopen(url, timeout=1.5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:  # noqa: BLE001
        return None


def existing_bundles():
    return sorted(f for f in os.listdir(WORM_DIR) if f.endswith(".json"))


def last_state():
    names = existing_bundles()
    if not names:
        return -1, GENESIS
    with open(os.path.join(WORM_DIR, names[-1])) as f:
        b = json.load(f)
    return b["seq"], b["hash"]


def collect(seq):
    models = (_fetch(SERVING_URL + "/v2/models") or {}).get("models", [])
    stats = _fetch(SERVING_URL + "/stats") or {}
    relay = _fetch(RELAY_URL + "/status") or {}
    return {
        "site": SITE_ID,
        "seq": seq,
        "ts": time.time(),
        "applied_revision": APPLIED_REVISION,
        "models": [{"name": m["name"], "version": m["versions"][0],
                    "outage_policy": m["parameters"]["outage_policy"]}
                   for m in models],
        "counters": {
            "scored": (stats.get("scored") or {}),
            "delivered": relay.get("delivered", 0),
            "outbox_queued": relay.get("outbox_queued", 0),
            "held_pending_review": relay.get("held_pending_review", 0),
        },
        "uplink_up": relay.get("uplink_up", None),
    }


def main():
    os.makedirs(WORM_DIR, exist_ok=True)
    print("evidence-collector up · sealing every %.0fs" % INTERVAL_S,
          flush=True)
    while True:
        seq, prev = last_state()
        bundle = seal(collect(seq + 1), KEY, prev)
        path = os.path.join(WORM_DIR, "bundle-%05d.json" % bundle["seq"])
        with open(path + ".tmp", "w") as f:
            json.dump(bundle, f, sort_keys=True)
        os.replace(path + ".tmp", path)
        os.chmod(path, stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)  # 0444
        print("sealed %s prev=%s..." % (os.path.basename(path),
                                        bundle["prev_hash"][:12]), flush=True)
        time.sleep(INTERVAL_S)


if __name__ == "__main__":
    main()
