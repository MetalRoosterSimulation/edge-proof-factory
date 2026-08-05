"""Evidence bundles: hash chain + per-site signature — pure, host-unit-tested.

The production design signs bundles with a per-site key from the customer's
PKI and lands them in a WORM (object-lock) bucket. This module is the demo
stand-in: HMAC-SHA256 with a per-site key (a Kubernetes Secret in the kit),
bundles chained by prev_hash so any tamper or gap is detectable, written to
a local write-once-style directory. The simplification is stated in the
component map. Python 3.6 compatible, stdlib only.
"""

import hashlib
import hmac
import json

GENESIS = "0" * 64


def canonical(bundle):
    """Deterministic serialization of everything covered by hash + sig."""
    body = {k: bundle[k] for k in sorted(bundle) if k not in ("hash", "sig")}
    return json.dumps(body, sort_keys=True, separators=(",", ":"))


def bundle_hash(bundle):
    return hashlib.sha256(canonical(bundle).encode("utf-8")).hexdigest()


def sign(bundle, key):
    return hmac.new(key, canonical(bundle).encode("utf-8"),
                    hashlib.sha256).hexdigest()


def seal(bundle, key, prev_hash):
    """Return a sealed copy: prev_hash linked, hash + sig attached."""
    b = dict(bundle)
    b["prev_hash"] = prev_hash
    b["hash"] = ""
    b["sig"] = ""
    b["hash"] = bundle_hash(b)
    b["sig"] = sign(b, key)
    return b


def verify_one(bundle, key):
    """(hash_ok, sig_ok) for a single sealed bundle."""
    return (bundle_hash(bundle) == bundle.get("hash"),
            hmac.compare_digest(sign(bundle, key), bundle.get("sig", "")))


def verify_chain(bundles, key):
    """Verify an ordered bundle list: hashes, signatures, linkage, sequence.

    Returns (ok, problems) where problems is a list of human-readable
    strings — empty when the chain is intact.
    """
    problems = []
    prev = GENESIS
    for i, b in enumerate(bundles):
        hash_ok, sig_ok = verify_one(b, key)
        if not hash_ok:
            problems.append("bundle %d: content hash mismatch" % i)
        if not sig_ok:
            problems.append("bundle %d: signature invalid" % i)
        if b.get("prev_hash") != prev:
            problems.append("bundle %d: chain broken (prev_hash)" % i)
        if b.get("seq") != i:
            problems.append("bundle %d: sequence gap (seq=%s)" % (i, b.get("seq")))
        prev = b.get("hash", "")
    return (not problems), problems
