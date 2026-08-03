"""Synthetic corridor imagery generator (binary P6 PPM).

Pure stdlib, Python 3.6 compatible, unit-tested on the host. Emits imagery
with a controlled fraction of green-dominant (vegetation) or rust-dominant
(hardware wear) pixels so the scorer's behavior is deterministic and
assertable. PPM was chosen so neither end needs an imaging library.
"""

import random

WIDTH = 640
HEIGHT = 480


def make_ppm(green_fraction=0.0, rust_fraction=0.0, seed=1, width=WIDTH, height=HEIGHT):
    """One corridor frame: gray-brown ground, `green_fraction` of rows
    vegetation-dominant, `rust_fraction` of rows rust-dominant."""
    rng = random.Random(seed)
    header = ("P6\n%d %d\n255\n" % (width, height)).encode("ascii")
    rows = []
    green_rows = int(height * green_fraction)
    rust_rows = int(height * rust_fraction)
    for y in range(height):
        row = bytearray()
        if y < green_rows:
            base = (60, 150, 55)  # vegetation
        elif y < green_rows + rust_rows:
            base = (160, 90, 60)  # corroded hardware
        else:
            base = (110, 105, 95)  # ground / structure
        for _ in range(width):
            row.append(_clamp(base[0] + rng.randint(-12, 12)))
            row.append(_clamp(base[1] + rng.randint(-12, 12)))
            row.append(_clamp(base[2] + rng.randint(-12, 12)))
        rows.append(bytes(row))
    return header + b"".join(rows)


def _clamp(v):
    return max(0, min(255, v))
