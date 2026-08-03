"""Working-storage accounting — the bounded-autonomy core of this kit.

Pure stdlib, Python 3.6 compatible, unit-tested on the host. The degradation
order is the architecture truth this module enforces: a capacity ALERT is
raised before ingest BACKPRESSURE, and backpressure refuses only NEW uploads —
imagery already ingested (and findings queued on it) is never discarded.
"""

ALERT_PCT = 0.80
BACKPRESSURE_PCT = 0.95

STATE_OK = "OK"
STATE_ALERT = "ALERT"
STATE_BACKPRESSURE = "BACKPRESSURE"


def storage_state(used_mb, limit_mb):
    """The site's storage state for a given usage level."""
    if limit_mb <= 0:
        raise ValueError("limit_mb must be positive")
    pct = used_mb / float(limit_mb)
    if pct >= BACKPRESSURE_PCT:
        return STATE_BACKPRESSURE
    if pct >= ALERT_PCT:
        return STATE_ALERT
    return STATE_OK


def should_accept(upload_mb, used_mb, limit_mb):
    """Accept/refuse decision for one upload, from CURRENT usage.

    Refusal happens only in BACKPRESSURE — the alert state still accepts, so
    the alert genuinely precedes the refusal in time. An upload is also
    refused if it alone would blow past the hard limit.
    """
    state = storage_state(used_mb, limit_mb)
    if state == STATE_BACKPRESSURE:
        return False, state
    if used_mb + upload_mb > limit_mb:
        return False, STATE_BACKPRESSURE
    return True, state
