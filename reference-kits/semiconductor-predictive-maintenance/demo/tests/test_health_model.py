"""
Unit tests for the edge predictive-maintenance model.

Runs two ways:
  * plain:   python3 tests/test_health_model.py     (no deps beyond stdlib)
  * pytest:  pytest tests/                            (if pytest is installed)

The plain runner is what `make test` uses so the kit tests with zero pip installs.
"""
import os
import random
import sys

# Make the inference app importable whether run from repo root or tests/.
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "images", "edge-inference"))

from app.health_model import (  # noqa: E402
    Fleet,
    ToolHealthModel,
    SENSORS,
    classify,
    STATE_HEALTHY,
    STATE_CRITICAL,
    STATE_WARNING,
    STATE_WATCH,
)

# A plausible healthy operating point for a plasma-etch chamber.
HEALTHY = {
    "chamber_pressure_mtorr": 50.0,
    "rf_forward_power_w": 1500.0,
    "rf_reflected_power_w": 8.0,
    "chamber_temp_c": 65.0,
    "endpoint_signal": 0.80,
    "he_backside_flow_sccm": 10.0,
}


def _healthy_frame(rng, scale=1.0):
    """Healthy reading with small Gaussian noise."""
    noise = {
        "chamber_pressure_mtorr": 0.6,
        "rf_forward_power_w": 6.0,
        "rf_reflected_power_w": 0.4,
        "chamber_temp_c": 0.3,
        "endpoint_signal": 0.01,
        "he_backside_flow_sccm": 0.15,
    }
    return {k: HEALTHY[k] + rng.gauss(0, noise[k] * scale) for k in HEALTHY}


def test_classify_bands():
    assert classify(100) == STATE_HEALTHY
    assert classify(85) == STATE_HEALTHY
    assert classify(84.9) == STATE_WATCH
    assert classify(65) == STATE_WATCH
    assert classify(50) == STATE_WARNING
    assert classify(40) == STATE_WARNING
    assert classify(39.9) == STATE_CRITICAL
    assert classify(0) == STATE_CRITICAL


def test_warmup_reports_warming_then_healthy():
    rng = random.Random(1)
    m = ToolHealthModel("etch-01", warmup=30)
    for i in range(30):
        v = m.update(_healthy_frame(rng))
        assert v["warming"] is True
        assert v["health"] == 100.0
    # After warmup, steady healthy input stays healthy.
    for _ in range(50):
        v = m.update(_healthy_frame(rng))
    assert v["warming"] is False
    assert v["state"] == STATE_HEALTHY, v
    assert v["health"] >= 85.0, v


def test_healthy_stream_never_false_alarms():
    """A long healthy run must not drift into WARNING/CRITICAL."""
    rng = random.Random(7)
    m = ToolHealthModel("etch-02", warmup=30)
    worst = STATE_HEALTHY
    order = {STATE_HEALTHY: 0, STATE_WATCH: 1, STATE_WARNING: 2, STATE_CRITICAL: 3}
    for i in range(400):
        v = m.update(_healthy_frame(rng))
        if not v["warming"] and order[v["state"]] > order[worst]:
            worst = v["state"]
    assert order[worst] <= order[STATE_WATCH], (
        "healthy stream false-alarmed to %s" % worst
    )


def test_healthy_tools_mostly_read_healthy():
    """Demo polish: a healthy fleet should sit green, so a real fault pops.
    At least 80% of post-warmup readings across healthy tools are HEALTHY."""
    rng = random.Random(21)
    fleet = Fleet(warmup=30)
    healthy_reads = total = 0
    for step in range(220):
        for tid in ("etch-1", "etch-2", "etch-3", "etch-4"):
            v = fleet.ingest(tid, _healthy_frame(rng))
            if not v["warming"]:
                total += 1
                if v["state"] == STATE_HEALTHY:
                    healthy_reads += 1
    assert healthy_reads / total >= 0.80, (
        "only %.0f%% of healthy reads were HEALTHY" % (100 * healthy_reads / total)
    )


def test_injected_fault_degrades_health_and_escalates_state():
    """
    Simulate a classic etch fault: RF match drifts, reflected power climbs,
    chamber pressure creeps. Health must fall and state must reach WARNING or
    CRITICAL.
    """
    rng = random.Random(3)
    m = ToolHealthModel("etch-03", warmup=30)
    for _ in range(60):  # warmup + settle
        m.update(_healthy_frame(rng))
    healthy_health = m.update(_healthy_frame(rng))["health"]
    assert healthy_health >= 85.0

    v = None
    for step in range(1, 200):
        f = _healthy_frame(rng)
        # progressive degradation
        f["rf_reflected_power_w"] += 0.9 * step
        f["chamber_pressure_mtorr"] += 0.25 * step
        f["endpoint_signal"] -= 0.004 * step
        v = m.update(f)
        if v["state"] == STATE_CRITICAL:
            break
    assert v["health"] < healthy_health - 30, v
    assert v["state"] in (STATE_WARNING, STATE_CRITICAL), v
    # the fault sensors should be named as top contributors
    contributors = {c["sensor"] for c in v["top_contributors"]}
    assert "rf_reflected_power_w" in contributors, v


def test_rul_shrinks_under_sustained_degradation():
    rng = random.Random(11)
    m = ToolHealthModel("etch-04", warmup=30)
    for _ in range(60):
        m.update(_healthy_frame(rng))

    rul_samples = []
    for step in range(1, 400):
        f = _healthy_frame(rng)
        # slow creep: a mechanical/RF-match degradation over hundreds of frames
        f["rf_reflected_power_w"] += 0.03 * step
        f["chamber_temp_c"] += 0.012 * step
        v = m.update(f)
        if v["rul_frames"] is not None and v["state"] != STATE_CRITICAL:
            rul_samples.append(v["rul_frames"])

    assert len(rul_samples) >= 5, "expected a RUL forecast during degradation"
    # RUL should trend downward: last third clearly below first third.
    third = len(rul_samples) // 3
    early = sum(rul_samples[:third]) / max(third, 1)
    late = sum(rul_samples[-third:]) / max(third, 1)
    assert late < early, "RUL did not shrink: early=%.0f late=%.0f" % (early, late)


def test_healthy_tool_reports_no_rul():
    rng = random.Random(5)
    m = ToolHealthModel("etch-05", warmup=30)
    v = None
    for _ in range(200):
        v = m.update(_healthy_frame(rng))
    assert v["rul_frames"] is None, "healthy tool should have nominal (None) RUL"


def test_fleet_snapshot_orders_worst_first():
    rng = random.Random(9)
    fleet = Fleet(warmup=20)
    # one healthy, one failing
    for step in range(1, 160):
        fleet.ingest("good", _healthy_frame(rng))
        f = _healthy_frame(rng)
        f["rf_reflected_power_w"] += 1.2 * step
        f["chamber_pressure_mtorr"] += 0.3 * step
        fleet.ingest("bad", f)
    snap = fleet.snapshot()
    assert snap[0]["tool_id"] == "bad", snap
    assert snap[0]["health"] < snap[-1]["health"]


def test_sensor_contract_is_stable():
    assert SENSORS[0] == "chamber_pressure_mtorr"
    assert len(SENSORS) == 6
    assert len(set(SENSORS)) == 6


def _run_all():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    failed = 0
    for t in tests:
        try:
            t()
            print("  PASS %s" % t.__name__)
        except AssertionError as e:
            failed += 1
            print("  FAIL %s: %s" % (t.__name__, e))
        except Exception as e:  # noqa: BLE001
            failed += 1
            print("  ERROR %s: %r" % (t.__name__, e))
    print("\n%d/%d passed" % (len(tests) - failed, len(tests)))
    return failed


if __name__ == "__main__":
    sys.exit(1 if _run_all() else 0)
