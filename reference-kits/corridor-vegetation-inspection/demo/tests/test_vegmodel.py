"""Host-side unit tests for the scoring model and imagery generator.

Zero dependencies; runnable as plain `python3 tests/test_vegmodel.py` or via
pytest. Python 3.6 compatible.
"""

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "images", "vision-scorer"))
sys.path.insert(0, os.path.join(_HERE, "..", "images", "ground-station"))

from app.vegmodel import (  # noqa: E402
    DEFAULT_MODEL_VERSION,
    VEGETATION_RATIO_THRESHOLD,
    channel_ratios,
    parse_ppm,
    score,
)

# ground-station's app package shadows the scorer's on a second import path,
# so import the generator by file path instead.
import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location(
    "genimg", os.path.join(_HERE, "..", "images", "ground-station", "app", "genimg.py"))
genimg = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(genimg)


def test_parse_ppm_roundtrip():
    data = genimg.make_ppm(green_fraction=0.5, seed=3, width=32, height=24)
    w, h, pixels = parse_ppm(data)
    assert w == 32 and h == 24
    assert len(pixels) >= 32 * 24 * 3


def test_parse_rejects_non_ppm():
    try:
        parse_ppm(b"\x89PNG not a ppm")
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_green_image_scores_vegetation_finding():
    data = genimg.make_ppm(green_fraction=0.6, seed=7, width=96, height=72)
    rec = score(data)
    assert rec["finding"] is True
    assert rec["kind"] == "vegetation encroachment"
    assert rec["score"] >= VEGETATION_RATIO_THRESHOLD
    assert rec["model_version"] == DEFAULT_MODEL_VERSION


def test_rusty_image_scores_hardware_wear():
    data = genimg.make_ppm(green_fraction=0.0, rust_fraction=0.5, seed=9,
                           width=96, height=72)
    rec = score(data)
    assert rec["finding"] is True
    assert rec["kind"] == "hardware wear"


def test_clear_image_is_not_a_finding():
    data = genimg.make_ppm(green_fraction=0.05, seed=11, width=96, height=72)
    rec = score(data)
    assert rec["finding"] is False
    assert rec["kind"] == "none"


def test_ratios_track_generated_fraction():
    data = genimg.make_ppm(green_fraction=0.4, seed=13, width=96, height=72)
    green, rust = channel_ratios(data)
    assert 0.25 <= green <= 0.55
    assert rust <= 0.1


def test_model_version_passthrough():
    data = genimg.make_ppm(green_fraction=0.6, seed=15, width=48, height=36)
    rec = score(data, model_version="2.0")
    assert rec["model_version"] == "2.0"


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
