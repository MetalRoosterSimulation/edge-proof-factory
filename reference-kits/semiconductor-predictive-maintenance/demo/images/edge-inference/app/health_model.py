"""
health_model.py — on-device predictive-maintenance model for a semiconductor
plasma-etch chamber.

This is a *real* streaming anomaly-detection model, not a mock. It runs on a CPU
in a few kilobytes of state per tool, which is why it fits a single-node edge box.
The production hand-off swaps this for a heavier model served by SUSE AI (Ollama /
vLLM + Milvus on a GPU node) — the interface (sensor frame in, health verdict out)
stays identical, which is the whole point of the demo.

Technique — an EWMA-smoothed multivariate control chart (textbook Hotelling T² /
Mahalanobis SPC, the standard fab statistical-process-control approach):

  1. Baseline learning. For the first `warmup` frames a tool is assumed healthy
     (standard commissioning assumption). We accumulate an exact per-sensor mean
     and variance with Welford's algorithm, then FREEZE that baseline. No training
     data set ships with the model — each tool learns its own baseline in situ.
  2. Per-sensor z-score against the frozen baseline, clipped to +/-Z_CLIP so one
     saturated channel can't dominate.
  3. Mahalanobis-style statistic m = sum(z_i^2) over the sensors present. Under a
     healthy tool E[m] = k (the sensor count); a fault inflates it.
  4. EWMA-smooth m (fast for the live health score, slow for the trend) so healthy
     measurement noise does not trip an alarm but a sustained shift does.
  5. Health 0-100 = 100 * exp(-anomaly / DECAY), where anomaly = sqrt(excess/k)
     and excess = max(0, m_smoothed - k). Healthy => excess ~ 0 => health ~ 100.
  6. Remaining-useful-life (RUL): the slow EWMA gives a degradation trend; RUL =
     frames until projected health crosses CRITICAL, by linear extrapolation. A
     flat / improving trend reports RUL = None (nominal, beyond horizon).

Everything here is deterministic and unit-tested (see demo/tests/).
"""
import math
from collections import OrderedDict, deque

# --- Sensor contract (must match the simulator; see demo/README.md) -----------
SENSORS = (
    "chamber_pressure_mtorr",
    "rf_forward_power_w",
    "rf_reflected_power_w",
    "chamber_temp_c",
    "endpoint_signal",
    "he_backside_flow_sccm",
)

# --- Verdict states (by health score 0-100) -----------------------------------
STATE_HEALTHY = "HEALTHY"
STATE_WATCH = "WATCH"
STATE_WARNING = "WARNING"
STATE_CRITICAL = "CRITICAL"

_STATE_BANDS = (
    (85.0, STATE_HEALTHY),
    (65.0, STATE_WATCH),
    (40.0, STATE_WARNING),
)
CRITICAL_HEALTH = 40.0

# --- Model constants ----------------------------------------------------------
DECAY = 2.2          # health = 100*exp(-anomaly/DECAY)
Z_CLIP = 8.0         # clip per-sensor z-scores
FAST_ALPHA = 0.15    # EWMA weight for the live health statistic
SLOW_ALPHA = 0.03    # EWMA weight for the degradation-trend statistic
UCL_SIGMA = 2.0      # control-limit offset (sigmas of the statistic's noise)
STD_FLOOR = 1e-3     # guard against a zero-variance (constant) sensor
EPS = 1e-9
DEFAULT_WARMUP = 30
SLOPE_WINDOW = 20    # frames of trend history used to estimate the RUL slope
FORECAST_HORIZON = 100000  # frames; a RUL above this is reported as nominal


def classify(health):
    """Map a 0-100 health score to a discrete state."""
    for threshold, state in _STATE_BANDS:
        if health >= threshold:
            return state
    return STATE_CRITICAL


class _Welford:
    """Exact online mean/variance for one sensor during the warmup window."""

    __slots__ = ("n", "mean", "m2", "std")

    def __init__(self):
        self.n = 0
        self.mean = 0.0
        self.m2 = 0.0
        self.std = STD_FLOOR

    def observe(self, x):
        self.n += 1
        delta = x - self.mean
        self.mean += delta / self.n
        self.m2 += delta * (x - self.mean)

    def freeze(self):
        var = self.m2 / (self.n - 1) if self.n > 1 else 0.0
        self.std = max(math.sqrt(var), STD_FLOOR)

    def zscore(self, x):
        return (x - self.mean) / self.std


class ToolHealthModel:
    """One instance per physical tool. Feed sensor frames, read verdicts."""

    def __init__(self, tool_id, warmup=DEFAULT_WARMUP):
        self.tool_id = tool_id
        self.warmup = warmup
        self.frames = 0
        self._base = OrderedDict((s, _Welford()) for s in SENSORS)
        self._frozen = False
        self._k = len(SENSORS)          # active sensor count, set at freeze
        self._m_fast = float(len(SENSORS))
        self._m_slow = float(len(SENSORS))
        self._slow_hist = deque(maxlen=SLOPE_WINDOW)

    def _mahal(self, frame):
        acc = 0.0
        k = 0
        contribs = {}
        for name, base in self._base.items():
            if name not in frame:
                continue
            z = base.zscore(float(frame[name]))
            z = max(-Z_CLIP, min(Z_CLIP, z))
            contribs[name] = z
            acc += z * z
            k += 1
        return acc, k, contribs

    def update(self, frame):
        """Ingest one sensor frame (dict name->value); return a verdict dict."""
        self.frames += 1

        # --- warmup: learn & freeze baseline, report healthy -----------------
        if self.frames <= self.warmup:
            for name, base in self._base.items():
                if name in frame:
                    base.observe(float(frame[name]))
            if self.frames == self.warmup:
                active = 0
                for base in self._base.values():
                    base.freeze()
                    if base.n > 0:
                        active += 1
                self._k = max(active, 1)
                self._m_fast = float(self._k)
                self._m_slow = float(self._k)
                self._slow_hist.clear()
                self._frozen = True
            return self._verdict(100.0, 0.0, None, [], warming=True)

        # --- scoring against frozen baseline ---------------------------------
        mahal, k, contribs = self._mahal(frame)
        k = k or self._k
        self._m_fast = (1 - FAST_ALPHA) * self._m_fast + FAST_ALPHA * mahal
        self._m_slow = (1 - SLOW_ALPHA) * self._m_slow + SLOW_ALPHA * mahal
        self._slow_hist.append(self._m_slow)

        anomaly = self._anomaly(self._m_fast, k)
        health = max(0.0, min(100.0, 100.0 * math.exp(-anomaly / DECAY)))
        rul = self._rul(k)

        top = sorted(contribs.items(), key=lambda kv: -abs(kv[1]))[:3]
        top_list = [{"sensor": n, "z": round(z, 2)} for n, z in top]
        return self._verdict(health, anomaly, rul, top_list, warming=False)

    @staticmethod
    def _anomaly(m_smoothed, k):
        # Under a healthy tool the statistic fluctuates around k with a known
        # noise floor (the EWMA variance of a chi-square(k) input). Subtract that
        # floor so healthy noise scores ~0 and only a genuine shift registers —
        # this is the upper-control-limit offset of a Hotelling T-squared chart.
        if not k:
            return 0.0
        noise_std = math.sqrt(FAST_ALPHA / (2.0 - FAST_ALPHA) * 2.0 * k)
        excess = max(0.0, m_smoothed - k - UCL_SIGMA * noise_std)
        return math.sqrt(excess / k)

    def _rul(self, k):
        # Estimate the degradation slope by least-squares over the trend window,
        # in anomaly-space (the quantity health is a function of). A single-step
        # difference of a slow EWMA is too noisy to forecast from.
        hist = self._slow_hist
        if len(hist) < SLOPE_WINDOW:
            return None
        ys = [self._anomaly(m, k) for m in hist]
        n = len(ys)
        xbar = (n - 1) / 2.0
        ybar = sum(ys) / n
        num = sum((i - xbar) * (ys[i] - ybar) for i in range(n))
        den = sum((i - xbar) ** 2 for i in range(n))
        slope = num / den if den > EPS else 0.0
        if slope <= EPS:                     # flat or improving -> nominal
            return None
        cur = ys[-1]
        anom_crit = -DECAY * math.log(CRITICAL_HEALTH / 100.0)
        if cur >= anom_crit:
            return 0
        frames = (anom_crit - cur) / slope
        if frames >= FORECAST_HORIZON or frames < 0:
            return None
        return int(round(frames))

    def _verdict(self, health, anomaly, rul, top_list, warming):
        health = round(health, 2)
        return {
            "tool_id": self.tool_id,
            "frames": self.frames,
            "warming": warming,
            "health": health,
            "state": STATE_HEALTHY if warming else classify(health),
            "anomaly": round(anomaly, 4),
            "rul_frames": rul,
            "top_contributors": top_list,
        }


class Fleet:
    """Holds many tools; used by the inference service and the dashboard."""

    def __init__(self, warmup=DEFAULT_WARMUP):
        self._warmup = warmup
        self._models = {}
        self.last_verdict = {}

    def ingest(self, tool_id, frame):
        m = self._models.get(tool_id)
        if m is None:
            m = ToolHealthModel(tool_id, warmup=self._warmup)
            self._models[tool_id] = m
        verdict = m.update(frame)
        self.last_verdict[tool_id] = verdict
        return verdict

    def snapshot(self):
        """Sorted worst-first — what the dashboard renders."""
        order = {STATE_CRITICAL: 0, STATE_WARNING: 1, STATE_WATCH: 2,
                 STATE_HEALTHY: 3}
        return sorted(
            self.last_verdict.values(),
            key=lambda v: (order.get(v["state"], 9), v["health"]),
        )
