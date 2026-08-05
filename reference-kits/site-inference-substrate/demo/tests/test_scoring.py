"""Host-side unit tests: model scoring + outage-policy dispositions.

Zero dependencies; plain `python3 tests/test_scoring.py` or pytest.
Python 3.6 compatible.
"""

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "images", "inference-serving"))

from app.scoring import (  # noqa: E402
    MODELS,
    POLICY_CONTINUE,
    POLICY_FLAG,
    POLICY_SUPPRESS,
    disposition,
    infer,
)

NOMINAL_TAGS = {"temperature": 65.0, "pressure": 11.0, "cycle_count": 12.0}
HOT_TAGS = {"temperature": 112.0, "pressure": 11.0, "cycle_count": 12.0}


def test_three_models_cover_all_three_policies():
    policies = sorted(m["outage_policy"] for m in MODELS.values())
    assert policies == sorted([POLICY_CONTINUE, POLICY_FLAG, POLICY_SUPPRESS])


def test_equipment_health_nominal_is_healthy():
    out = infer("equipment-health", NOMINAL_TAGS)
    assert out["result"]["health"] == 100.0
    assert out["result"]["anomaly"] is False
    assert out["model_version"] == MODELS["equipment-health"]["version"]


def test_equipment_health_hot_is_anomalous():
    out = infer("equipment-health", HOT_TAGS)
    assert out["result"]["health"] < 70.0
    assert out["result"]["anomaly"] is True


def test_thermal_precursor_fires_on_overtemp():
    assert infer("thermal-precursor", HOT_TAGS)["result"]["watch"] is True
    assert infer("thermal-precursor", NOMINAL_TAGS)["result"]["watch"] is False


def test_storage_optimization_prefers_cool_idle():
    idle = infer("storage-optimization",
                 {"temperature": 60.0, "cycle_count": 2.0})
    busy = infer("storage-optimization",
                 {"temperature": 95.0, "cycle_count": 38.0})
    assert idle["result"]["charge_window_score"] > busy["result"]["charge_window_score"]


def test_unknown_model_rejected():
    try:
        infer("nope", NOMINAL_TAGS)
        assert False, "expected KeyError"
    except KeyError:
        pass


def test_dispositions_uplink_up_all_queue():
    for policy in (POLICY_CONTINUE, POLICY_FLAG, POLICY_SUPPRESS):
        assert disposition(policy, True) == "queued"


def test_dispositions_uplink_down_follow_policy():
    assert disposition(POLICY_CONTINUE, False) == "queued"
    assert disposition(POLICY_FLAG, False) == "queued-flagged"
    assert disposition(POLICY_SUPPRESS, False) == "held"


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
