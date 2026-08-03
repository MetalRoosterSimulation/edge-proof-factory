#!/usr/bin/env bash
# End-to-end proof of the corridor kit, run against a cluster `make up`
# already stood up (CI runs this; a human can too). Asserts, in order:
#   1. campaign -> findings become work orders, evidence archived, queues drain
#   2. revoked station credential -> 401, nothing ingested
#   3. severed WAN -> site keeps ingesting/scoring, queues grow, ops frozen
#   4. oversized campaign under severed WAN -> capacity ALERT precedes 507
#      BACKPRESSURE; already-ingested imagery and queued findings survive
#   5. healed WAN -> queues drain to zero, work orders + archive advance,
#      working storage frees
set -euo pipefail

HOSTPORT="${HOSTPORT:-18082}"
BASE="http://localhost:${HOSTPORT}"
HERE="$(cd "$(dirname "$0")" && pwd)"
DEMO="$(dirname "$HERE")"

field() { # field <json> <python-expr on d>
  python3 -c "import json,sys; d=json.loads(sys.argv[1]); print($2)" "$1"
}

status_json() { curl -sf "$BASE/status"; }
panorama_json() { curl -sf "$BASE/panorama"; }

poll() { # poll <seconds> <description> <python-bool-expr over s,p>
  local deadline=$(( $(date +%s) + $1 ))
  local desc="$2" expr="$3"
  while true; do
    local s p ok
    s=$(status_json || echo '{}')
    p=$(panorama_json || echo '{}')
    ok=$(python3 -c "
import json, sys
s = json.loads(sys.argv[1] or '{}')
p = json.loads(sys.argv[2] or '{}')
try:
    print('yes' if ($expr) else 'no')
except Exception:
    print('no')
" "$s" "$p")
    if [ "$ok" = "yes" ]; then
      echo "OK    $desc"
      return 0
    fi
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "FAIL  $desc"
      echo "  status:   $s"
      echo "  panorama: $p"
      return 1
    fi
    sleep 2
  done
}

echo "== corridor kit e2e proof =="
cd "$DEMO"

poll 90 "site console reachable" "s.get('state') is not None"

echo "-- 1. campaign: capture -> findings -> work orders -> archive"
make --no-print-directory campaign COUNT=12 SEED=42
poll 120 "12 uploads accepted" "s.get('accepted') == 12"
poll 180 "scoring done + queues drained + work orders exist" \
  "s.get('incoming_backlog') == 0 and p.get('relay',{}).get('queued') == 0 \
   and p.get('ops',{}).get('work_orders', 0) > 0 \
   and p.get('ops',{}).get('archived', 0) == 12"
WO_BEFORE=$(field "$(panorama_json)" "d['ops']['work_orders']")
echo "      work orders after campaign 1: $WO_BEFORE"

echo "-- 2. revoked station credential -> 401"
make --no-print-directory revoked
poll 30 "401 counted, nothing extra ingested" \
  "s.get('rejected_401', 0) >= 1 and s.get('accepted') == 12"

echo "-- 3. sever the WAN mid-campaign"
make --no-print-directory fault
sleep 5
make --no-print-directory campaign COUNT=12 SEED=43
poll 120 "site still ingesting while severed (24 accepted)" \
  "s.get('accepted') == 24"
poll 120 "ops unreachable + findings queue growing" \
  "p.get('wan_reachable') is False and p.get('relay',{}).get('queued', 0) > 0"

echo "-- 4. oversized campaign under severed WAN -> alert, then backpressure"
make --no-print-directory fill || true   # 507 refusals are the point here
poll 120 "backpressure engaged (507s) with alert first" \
  "s.get('rejected_507', 0) > 0 and s.get('state') == 'BACKPRESSURE' \
   and s.get('alert_raised') is True and s.get('alert_before_backpressure') is True"
poll 30 "queued findings survived backpressure" \
  "p.get('relay',{}).get('queued', 0) > 0"

echo "-- 5. heal the WAN -> drain, deliver, free storage"
make --no-print-directory heal
poll 240 "queues drained to zero" \
  "p.get('relay',{}).get('queued') == 0 and s.get('incoming_backlog') == 0"
poll 60 "work orders advanced beyond pre-fault count" \
  "p.get('ops',{}).get('work_orders', 0) > int('$WO_BEFORE')"
poll 60 "working storage freed below alert threshold" \
  "s.get('used_mb', 1e9) < 0.8 * s.get('limit_mb', 0) and s.get('state') == 'OK'"

S=$(status_json); P=$(panorama_json)
echo "== PROOF COMPLETE =="
echo "   accepted=$(field "$S" "d['accepted']") rejected_401=$(field "$S" "d['rejected_401']") rejected_507=$(field "$S" "d['rejected_507']")"
echo "   work_orders=$(field "$P" "d['ops']['work_orders']") archived=$(field "$P" "d['ops']['archived']") archived_mb=$(field "$P" "d['ops']['archived_mb']")"
echo "   alert_before_backpressure=$(field "$S" "d['alert_before_backpressure']")"
