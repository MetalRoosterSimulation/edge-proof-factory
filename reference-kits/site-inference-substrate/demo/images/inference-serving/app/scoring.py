"""Model scoring + outage-policy dispositions — pure, host-unit-tested.

Three stand-in models (the production substrate hosts the customer's or an
ISV's models; this kit claims none of them). Each carries the per-model
outage policy the architecture names: what happens to its outputs while the
site's uplink is severed.

  continue  -> outputs queue for delivery as normal
  flag      -> outputs queue, marked flagged_stale_context
  suppress  -> outputs are held on site pending review, never auto-delivered

Python 3.6 compatible, stdlib only.
"""

POLICY_CONTINUE = "continue"
POLICY_FLAG = "flag"
POLICY_SUPPRESS = "suppress"

MODELS = {
    "equipment-health": {
        "version": "1.2.0",
        "outage_policy": POLICY_CONTINUE,
        "inputs": ["temperature", "pressure", "cycle_count"],
    },
    "storage-optimization": {
        "version": "0.9.1",
        "outage_policy": POLICY_FLAG,
        "inputs": ["temperature", "cycle_count"],
    },
    "thermal-precursor": {
        "version": "2.0.3",
        "outage_policy": POLICY_SUPPRESS,
        "inputs": ["temperature"],
    },
}

# Nominal bands for the synthetic historian tags.
NOMINAL = {
    "temperature": (55.0, 80.0),   # degC
    "pressure": (9.0, 14.0),       # bar
    "cycle_count": (0.0, 40.0),    # cycles/window
}


def _band_deviation(name, value):
    """0 inside the nominal band; grows linearly outside it."""
    lo, hi = NOMINAL[name]
    if value < lo:
        return (lo - value) / (hi - lo)
    if value > hi:
        return (value - hi) / (hi - lo)
    return 0.0


def score_equipment_health(tags):
    """Health 0-100 from band deviations; anomaly under 70."""
    dev = sum(_band_deviation(k, float(tags[k]))
              for k in MODELS["equipment-health"]["inputs"])
    health = max(0.0, 100.0 - 120.0 * dev)
    return {"health": round(health, 1), "anomaly": health < 70.0}


def score_storage_optimization(tags):
    """Advisory 0-1: favorable charge/dispatch window when cool and idle."""
    t = _band_deviation("temperature", float(tags["temperature"]))
    c = float(tags["cycle_count"]) / NOMINAL["cycle_count"][1]
    advisory = max(0.0, 1.0 - (t * 2.0 + max(0.0, min(c, 1.5)) * 0.5))
    return {"charge_window_score": round(min(advisory, 1.0), 3)}


def score_thermal_precursor(tags):
    """Risk 0-1 from how far temperature runs above band."""
    over = _band_deviation("temperature", float(tags["temperature"]))
    risk = min(1.0, over * 2.5)
    return {"precursor_risk": round(risk, 3), "watch": risk >= 0.5}


SCORERS = {
    "equipment-health": score_equipment_health,
    "storage-optimization": score_storage_optimization,
    "thermal-precursor": score_thermal_precursor,
}


def infer(model_name, tags):
    if model_name not in SCORERS:
        raise KeyError("unknown model: %s" % model_name)
    result = SCORERS[model_name](tags)
    meta = MODELS[model_name]
    return {
        "model_name": model_name,
        "model_version": meta["version"],
        "outage_policy": meta["outage_policy"],
        "result": result,
    }


def disposition(policy, uplink_up):
    """Where an output goes, per the model's outage policy."""
    if uplink_up:
        return "queued"                     # normal delivery path
    if policy == POLICY_CONTINUE:
        return "queued"
    if policy == POLICY_FLAG:
        return "queued-flagged"             # delivered, marked stale-context
    if policy == POLICY_SUPPRESS:
        return "held"                       # site-side, pending review
    raise ValueError("unknown policy: %s" % policy)
