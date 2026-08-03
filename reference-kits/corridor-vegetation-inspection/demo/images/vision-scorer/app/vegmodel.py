"""Corridor imagery scoring — the swappable "vision model" of this kit.

Pure stdlib, Python 3.6 compatible, unit-tested on the host. Parses P6 PPM
imagery (the campaign generator emits PPM precisely so this module needs no
imaging dependency) and scores vegetation encroachment / hardware wear from
pixel statistics.

This module is deliberately an obviously replaceable stand-in: in production
the container it ships in is swapped for a third-party vision pipeline. The
platform contract is only (image bytes in) -> (score record out).
"""

MODEL_NAME = "open-veg-scorer"
DEFAULT_MODEL_VERSION = "1.4"

VEGETATION_RATIO_THRESHOLD = 0.35
WEAR_RATIO_THRESHOLD = 0.25
SAMPLE_STEP = 7  # sample every Nth pixel — keeps scoring O(small)


def parse_ppm(data):
    """Return (width, height, pixel_bytes) for a binary P6 PPM. Raises
    ValueError on anything else."""
    if not data.startswith(b"P6"):
        raise ValueError("not a P6 PPM")
    # Header: P6 <ws> width <ws> height <ws> maxval <single ws> pixels
    fields = []
    i = 2
    while len(fields) < 3:
        while i < len(data) and data[i:i + 1].isspace():
            i += 1
        if i < len(data) and data[i:i + 1] == b"#":  # comment line
            while i < len(data) and data[i:i + 1] != b"\n":
                i += 1
            continue
        start = i
        while i < len(data) and not data[i:i + 1].isspace():
            i += 1
        fields.append(data[start:i])
    i += 1  # single whitespace after maxval
    width, height, maxval = (int(f) for f in fields)
    if maxval != 255:
        raise ValueError("only maxval 255 supported")
    pixels = data[i:]
    if len(pixels) < width * height * 3:
        raise ValueError("truncated pixel data")
    return width, height, pixels


def channel_ratios(data):
    """Sampled fraction of green-dominant and rust-dominant pixels."""
    width, height, pixels = parse_ppm(data)
    total = 0
    green = 0
    rust = 0
    n = width * height
    for p in range(0, n, SAMPLE_STEP):
        o = p * 3
        r = pixels[o]
        g = pixels[o + 1]
        b = pixels[o + 2]
        if not isinstance(r, int):  # py2-style safety; never hit on py3
            r, g, b = ord(r), ord(g), ord(b)
        total += 1
        if g > r + 16 and g > b + 16:
            green += 1
        elif r > g + 24 and r > b + 8:
            rust += 1
    if total == 0:
        return 0.0, 0.0
    return green / float(total), rust / float(total)


def score(data, model_version=DEFAULT_MODEL_VERSION):
    """Score one corridor image. Returns a plain dict (the record contract)."""
    green_ratio, rust_ratio = channel_ratios(data)
    finding = False
    kind = "none"
    value = max(green_ratio, rust_ratio)
    if green_ratio >= VEGETATION_RATIO_THRESHOLD:
        finding = True
        kind = "vegetation encroachment"
        value = min(1.0, green_ratio * 1.4)
    elif rust_ratio >= WEAR_RATIO_THRESHOLD:
        finding = True
        kind = "hardware wear"
        value = min(1.0, rust_ratio * 1.6)
    return {
        "model": MODEL_NAME,
        "model_version": model_version,
        "green_ratio": round(green_ratio, 4),
        "rust_ratio": round(rust_ratio, 4),
        "score": round(value, 4),
        "finding": finding,
        "kind": kind,
    }
