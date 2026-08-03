"""Host-side unit tests for working-storage accounting (bounded autonomy).

Zero dependencies; runnable as plain `python3 tests/test_store.py` or via
pytest. Python 3.6 compatible.
"""

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "images", "site-ingest"))

from app.store import (  # noqa: E402
    ALERT_PCT,
    BACKPRESSURE_PCT,
    STATE_ALERT,
    STATE_BACKPRESSURE,
    STATE_OK,
    should_accept,
    storage_state,
)


def test_state_thresholds():
    assert storage_state(0, 100) == STATE_OK
    assert storage_state(ALERT_PCT * 100 - 1, 100) == STATE_OK
    assert storage_state(ALERT_PCT * 100, 100) == STATE_ALERT
    assert storage_state(BACKPRESSURE_PCT * 100 - 1, 100) == STATE_ALERT
    assert storage_state(BACKPRESSURE_PCT * 100, 100) == STATE_BACKPRESSURE
    assert storage_state(150, 100) == STATE_BACKPRESSURE


def test_alert_precedes_backpressure():
    assert ALERT_PCT < BACKPRESSURE_PCT


def test_alert_state_still_accepts():
    ok, state = should_accept(1, ALERT_PCT * 100, 100)
    assert ok is True
    assert state == STATE_ALERT


def test_backpressure_refuses():
    ok, state = should_accept(1, BACKPRESSURE_PCT * 100, 100)
    assert ok is False
    assert state == STATE_BACKPRESSURE


def test_oversize_upload_refused_before_limit():
    ok, state = should_accept(30, 80, 100)
    assert ok is False
    assert state == STATE_BACKPRESSURE


def test_zero_limit_rejected():
    try:
        storage_state(1, 0)
        assert False, "expected ValueError"
    except ValueError:
        pass


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
