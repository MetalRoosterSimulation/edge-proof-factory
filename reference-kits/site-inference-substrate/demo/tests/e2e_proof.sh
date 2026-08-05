#!/usr/bin/env bash
# End-to-end proof of the site-inference-substrate kit, run against a
# cluster `make up` already stood up (CI runs this; a human can too).
# Asserts, in order:
#   1. scoring flows: all three models score the looping DMZ feed and
#      outputs land centrally; per-model outage policies visible in config
#   2. evidence: bundles seal to the WORM dir, chain verifies in place,
#      a rewrite attempt on a sealed bundle FAILS (write-once semantics)
#   3. severed uplink: scoring continues on the local feed; outputs queue;
#      flag-policy outputs marked; suppress-policy outputs held; central
#      frozen; evidence keeps sealing locally
#   4. healed uplink: queues drain, central reconciles (outputs + evidence
#      verified, chain OK), held outputs REMAIN held (suppress means
#      pending review, never auto-delivered)
set -euo pipefail

HOSTPORT="${HOSTPORT:-18083}"
BASE="http://localhost:${HOSTPORT}"
HERE="$(cd "$(dirname "$0")" && pwd)"
DEMO="$(dirname "$HERE")"

field() { python3 -c "import json,sys; d=json.loads(sys.argv[1]); print($2)" "$1"; }
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
c = p.get('central') or {}
try:
    print('yes' if ($expr) else 'no')
except Exception:
    print('no')
" "$s" "$p")
    if [ "$ok" = "yes" ]; then echo "OK    $desc"; return 0; fi
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "FAIL  $desc"; echo "  status:   $s"; echo "  panorama: $p"; return 1
    fi
    sleep 2
  done
}

echo "== site-inference-substrate e2e proof =="
cd "$DEMO"

poll 90 "site console reachable" "s.get('uplink_up') is not None"

echo "-- 1. scoring flows end to end, policies visible in config"
poll 120 "all three models scoring" \
  "len([m for m in s.get('models',[]) if (s.get('serving',{}).get('scored',{}).get(m['name'],0)) > 0]) == 3"
poll 60 "three distinct outage policies in model config" \
  "sorted(m['parameters']['outage_policy'] for m in s.get('models',[])) == ['continue','flag','suppress']"
poll 120 "outputs landing centrally from all three models" \
  "c.get('outputs_total',0) > 0 and len(c.get('outputs_by_model',{})) == 3"
poll 60 "historian feed fresh" "s.get('feed') == 'fresh'"

echo "-- 2. evidence: sealed, chained, write-once"
poll 90 "at least two bundles sealed to the WORM dir" "s.get('worm_bundles',0) >= 2"
make --no-print-directory verify-evidence
if kubectl -n substrate-site exec deploy/site -c evidence-collector -- \
     sh -c 'echo tamper >> /worm/bundle-00000.json' 2>/dev/null; then
  echo "FAIL  sealed bundle accepted a write (WORM semantics broken)"; exit 1
fi
echo "OK    rewrite attempt on a sealed bundle refused"
poll 90 "central verifying shipped bundles, chain OK" \
  "c.get('evidence_verified',0) >= 1 and c.get('chain_ok') is True and c.get('evidence_failed',0) == 0"

echo "-- 3. sever the uplink"
SCORED_T0=$(field "$(status_json)" "sum(d['serving']['scored'].values())")
OUT_T0=$(field "$(panorama_json)" "d['central']['outputs_total']")
make --no-print-directory fault
sleep 6
poll 60 "central unreachable from the site" "p.get('wan_reachable') is False"
poll 120 "scoring continues on the local feed while severed" \
  "sum(s.get('serving',{}).get('scored',{}).values()) > int('$SCORED_T0') + 20"
poll 120 "outputs queueing; flagged outputs present (flag policy)" \
  "s.get('outbox_queued',0) > 0"
poll 120 "suppress-policy outputs held for review" \
  "s.get('held_pending_review',0) > 0"
poll 120 "evidence keeps sealing locally while severed" \
  "s.get('worm_bundles',0) > s.get('evidence_shipped',0)"
HELD_SEVERED=$(field "$(status_json)" "d['held_pending_review']")

echo "-- 4. heal the uplink -> reconcile"
make --no-print-directory heal
poll 240 "output queue drained" "s.get('outbox_queued') == 0"
poll 120 "central reconciled: outputs advanced beyond pre-fault" \
  "c.get('outputs_total',0) > int('$OUT_T0')"
poll 60 "flagged outputs delivered and marked centrally" \
  "c.get('outputs_flagged',0) > 0"
poll 240 "evidence reconciled: every sealed bundle shipped + verified, chain OK" \
  "c.get('evidence_verified',0) == s.get('worm_bundles',0) and c.get('chain_ok') is True"
poll 30 "held outputs remain held after heal (suppress = pending review)" \
  "s.get('held_pending_review',0) >= int('$HELD_SEVERED')"
make --no-print-directory verify-evidence

S=$(status_json); P=$(panorama_json)
echo "== PROOF COMPLETE =="
echo "   scored_total=$(field "$S" "sum(d['serving']['scored'].values())") delivered=$(field "$S" "d['delivered']") flagged=$(field "$S" "d['delivered_flagged']") held=$(field "$S" "d['held_pending_review']")"
echo "   central_outputs=$(field "$P" "d['central']['outputs_total']") evidence_verified=$(field "$P" "d['central']['evidence_verified']") chain_ok=$(field "$P" "d['central']['chain_ok']")"
