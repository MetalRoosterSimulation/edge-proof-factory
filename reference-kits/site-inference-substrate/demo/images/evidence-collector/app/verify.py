"""Verify the WORM directory's evidence chain in place (make verify-evidence).

Reads every sealed bundle in order, verifies content hashes, signatures,
chain linkage, and sequence continuity. Exit 0 only if the chain is intact.
"""

import json
import os
import sys

from app.evchain import verify_chain

WORM_DIR = os.environ.get("WORM_DIR", "/worm")
KEY = os.environ.get("EVIDENCE_KEY", "demo-site-signing-key").encode("utf-8")


def main():
    names = sorted(f for f in os.listdir(WORM_DIR) if f.endswith(".json"))
    bundles = []
    for n in names:
        with open(os.path.join(WORM_DIR, n)) as f:
            bundles.append(json.load(f))
    ok, problems = verify_chain(bundles, KEY)
    print("bundles=%d chain=%s" % (len(bundles), "OK" if ok else "BROKEN"))
    for p in problems:
        print("  " + p)
    sys.exit(0 if ok and bundles else 1)


if __name__ == "__main__":
    main()
