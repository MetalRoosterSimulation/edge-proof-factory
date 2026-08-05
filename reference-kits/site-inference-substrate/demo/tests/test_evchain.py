"""Host-side unit tests: evidence bundle chain + signature.

Zero dependencies; plain `python3 tests/test_evchain.py` or pytest.
Python 3.6 compatible.
"""

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "images", "evidence-collector"))

from app.evchain import (  # noqa: E402
    GENESIS,
    seal,
    verify_chain,
    verify_one,
)

KEY = b"demo-site-key"


def _chain(n):
    bundles = []
    prev = GENESIS
    for i in range(n):
        b = seal({"seq": i, "site": "SITE-01", "counters": {"scored": i * 3}},
                 KEY, prev)
        bundles.append(b)
        prev = b["hash"]
    return bundles


def test_sealed_bundle_verifies():
    b = _chain(1)[0]
    hash_ok, sig_ok = verify_one(b, KEY)
    assert hash_ok and sig_ok


def test_intact_chain_verifies():
    ok, problems = verify_chain(_chain(5), KEY)
    assert ok, problems


def test_tampered_content_detected():
    bundles = _chain(3)
    bundles[1]["counters"]["scored"] = 999999
    ok, problems = verify_chain(bundles, KEY)
    assert not ok
    assert any("hash mismatch" in p for p in problems)


def test_wrong_key_detected():
    ok, problems = verify_chain(_chain(2), b"not-the-site-key")
    assert not ok
    assert any("signature invalid" in p for p in problems)


def test_removed_bundle_breaks_chain():
    bundles = _chain(4)
    del bundles[1]
    ok, problems = verify_chain(bundles, KEY)
    assert not ok
    assert any("chain broken" in p or "sequence gap" in p for p in problems)


def test_reordered_bundles_detected():
    bundles = _chain(3)
    bundles[0], bundles[1] = bundles[1], bundles[0]
    ok, _problems = verify_chain(bundles, KEY)
    assert not ok


def test_central_copy_is_byte_identical():
    """central-stub ships its own copy of evchain (separate build context);
    this test fails the gate if the two copies ever drift."""
    a = os.path.join(_HERE, "..", "images", "evidence-collector", "app", "evchain.py")
    b = os.path.join(_HERE, "..", "images", "central-stub", "app", "evchain.py")
    src = open(a, "rb").read()
    copy = open(b, "rb").read()
    assert src in copy, "central-stub/app/evchain.py drifted from collector's copy"


def _run_all():
    failures = 0
    tests = sorted(n for n in globals() if n.startswith("test_"))
    for name in tests:
        try:
            globals()[name]()
            print("PASS  %s" % name)
        except AssertionError as exc:
            failures += 1
            print("FAIL  %s: %s" % (name, exc))
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print("ERROR %s: %r" % (name, exc))
    print("%d/%d passed" % (len(tests) - failures, len(tests)))
    return failures


if __name__ == "__main__":
    sys.exit(1 if _run_all() else 0)
