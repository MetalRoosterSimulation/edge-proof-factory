#!/usr/bin/env bash
# verify_sovereignty.sh — prove the data-sovereignty boundary, live.
#
# 1. A pod inside the fab namespace attempts external egress -> must be
#    BLOCKED (default-deny NetworkPolicy; maps to SUSE Security/NeuVector
#    enforcement in production).
# 2. A control pod in an unprotected namespace attempts the same egress ->
#    must SUCCEED, proving the block is the policy, not the lab network.
set -u
NS=${NS:-fab-edge}
CONTROL_NS=sovereignty-control
FAIL=0

echo "[1/2] egress from $NS (sensor-simulator) — expecting BLOCKED"
if kubectl -n "$NS" exec deploy/sensor-simulator -- timeout 5 python3 -c \
  "import urllib.request; urllib.request.urlopen('http://1.1.1.1', timeout=4)" 2>/dev/null; then
  echo "  FAIL: egress from the fab namespace SUCCEEDED — boundary not enforced"; FAIL=1
else
  echo "  PASS: egress blocked at the network layer"
fi

echo "[2/2] control egress from unprotected namespace — expecting ALLOWED"
kubectl create ns "$CONTROL_NS" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n "$CONTROL_NS" create deployment probe --image=busybox -- sleep 3600 >/dev/null 2>&1 || true
kubectl -n "$CONTROL_NS" rollout status deploy/probe --timeout=120s >/dev/null
if kubectl -n "$CONTROL_NS" exec deploy/probe -- timeout 5 wget -q -T 4 -O /dev/null http://1.1.1.1 2>/dev/null; then
  echo "  PASS: control egress succeeded — the block above is the policy, not the lab"
else
  echo "  FAIL: control egress blocked — lab networking problem, result inconclusive"; FAIL=1
fi
kubectl delete ns "$CONTROL_NS" --wait=false >/dev/null 2>&1

if [ "$FAIL" = 0 ]; then
  echo "SOVEREIGNTY VERIFIED: raw telemetry has no egress path out of the fab namespace."
else
  echo "SOVEREIGNTY CHECK FAILED — see above."
fi
exit "$FAIL"
