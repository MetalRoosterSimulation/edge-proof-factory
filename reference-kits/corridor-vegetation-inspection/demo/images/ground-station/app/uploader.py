"""ground-station — the simulated capture side, run as a one-shot pod.

Generates synthetic corridor imagery (PPM) and uploads it to the site
ingest endpoint under a per-station credential: the kit's one inbound flow.
Also used for the revoked-credential proof (EXPECT=401 makes a refusal the
success condition).
"""

import os
import random
import sys
import urllib.error
import urllib.request

from app.genimg import make_ppm

INGEST_URL = os.environ.get("INGEST_URL",
                            "http://site-ingest.corridor-site.svc.cluster.local:8080")
STATION = os.environ.get("STATION", "GS-11")
TOKEN = os.environ.get("TOKEN", "tok-corridor-a")
COUNT = int(os.environ.get("COUNT", "12"))
SEED = int(os.environ.get("SEED", "42"))
FLIGHT = os.environ.get("FLIGHT", "F-2031")
EXPECT = int(os.environ.get("EXPECT", "200"))


def upload(idx, rng):
    roll = rng.random()
    if roll < 0.45:
        green, rust = rng.uniform(0.0, 0.15), 0.0          # clear span
    elif roll < 0.85:
        green, rust = rng.uniform(0.4, 0.7), 0.0           # encroachment
    else:
        green, rust = 0.05, rng.uniform(0.3, 0.5)          # hardware wear
    data = make_ppm(green_fraction=green, rust_fraction=rust,
                    seed=SEED * 1000 + idx)
    span = "SP-%d" % (1000 + rng.randint(0, 399))
    req = urllib.request.Request(
        INGEST_URL + "/upload", data=data, method="POST",
        headers={
            "Authorization": "Bearer " + TOKEN,
            "X-Station": STATION,
            "X-Span": span,
            "X-Flight": FLIGHT,
            "Content-Type": "application/octet-stream",
        })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status
    except urllib.error.HTTPError as exc:
        return exc.code


def main():
    rng = random.Random(SEED)
    statuses = {}
    for i in range(COUNT):
        code = upload(i, rng)
        statuses[code] = statuses.get(code, 0) + 1
    print("station=%s uploads=%d statuses=%s" % (STATION, COUNT, statuses),
          flush=True)
    if EXPECT == 200:
        # Normal campaign: at least one accepted upload means the flow works
        # (507 refusals are a legitimate outcome once backpressure engages).
        sys.exit(0 if statuses.get(200, 0) > 0 else 1)
    sys.exit(0 if statuses.get(EXPECT, 0) == COUNT else 1)


if __name__ == "__main__":
    main()
