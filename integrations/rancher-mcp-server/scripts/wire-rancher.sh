#!/usr/bin/env bash
# wire-rancher.sh — one command to make the running k3d demo Rancher-managed.
# Reads .rancher-env, verifies the token, imports the k3d cluster into Rancher,
# applies the registration manifest to the cluster, waits, and verifies.
#
# Usage:  ./scripts/wire-rancher.sh [k3d-cluster-name]   (default: edge-mvp)
# Safe to re-run (idempotent-ish: skips import if the cluster already exists).
set -euo pipefail
cd "$(dirname "$0")/.."

K3D_CLUSTER="${1:-edge-mvp}"
RANCHER_CLUSTER_NAME="${RANCHER_CLUSTER_NAME:-$K3D_CLUSTER}"
# Fleet GitOps deploy (set DEPLOY_FLEET=0 to only import the cluster).
DEPLOY_FLEET="${DEPLOY_FLEET:-1}"
GITREPO_NAME="${GITREPO_NAME:-edge-proof-kit}"
GITREPO_URL="${GITREPO_URL:-https://github.com/MetalRoosterSimulation/edge-proof-factory.git}"
GITREPO_BRANCH="${GITREPO_BRANCH:-main}"
GITREPO_PATH="${GITREPO_PATH:-reference-kits/semiconductor-predictive-maintenance/demo/k8s/base}"
[ -f .rancher-env ] || { echo "ERROR: .rancher-env not found (copy .rancher-env.example)"; exit 1; }
set -a; . ./.rancher-env; set +a
: "${RANCHER_URL:?set RANCHER_URL in .rancher-env}"
# Accept combined RANCHER_TOKEN or separate RANCHER_ACCESS_KEY + RANCHER_SECRET_KEY,
# and auto-add the 'token-' prefix if missing.
if [ -z "${RANCHER_TOKEN:-}" ] && [ -n "${RANCHER_ACCESS_KEY:-}" ] && [ -n "${RANCHER_SECRET_KEY:-}" ]; then
  RANCHER_TOKEN="${RANCHER_ACCESS_KEY}:${RANCHER_SECRET_KEY}"
fi
: "${RANCHER_TOKEN:?set RANCHER_TOKEN (or RANCHER_ACCESS_KEY+RANCHER_SECRET_KEY) in .rancher-env}"
case "$RANCHER_TOKEN" in token-*) : ;; *:*) RANCHER_TOKEN="token-$RANCHER_TOKEN";; esac
CURL=(curl -sk); [ "${RANCHER_INSECURE_TLS:-}" = "true" ] || CURL=(curl -s)
AUTH=(-H "Authorization: Bearer $RANCHER_TOKEN")

echo "==> preflight: authenticate to $RANCHER_URL"
me_code=$("${CURL[@]}" -o /dev/null -w "%{http_code}" "${AUTH[@]}" "$RANCHER_URL/v3/users?me=true")
if [ "$me_code" != "200" ]; then
  echo "ERROR: token not accepted (HTTP $me_code on /v3/users?me=true)."
  echo "Mint a fresh key: Rancher UI -> top-right avatar -> Account & API Keys ->"
  echo "Create API Key -> Scope: 'no scope' -> copy the Bearer Token (token-xxxxx:secret)."
  exit 1
fi
echo "    authenticated OK"

echo "==> ensure kubeconfig points at the k3d cluster"
export KUBECONFIG="$(mktemp)"
k3d kubeconfig get "$K3D_CLUSTER" > "$KUBECONFIG"

echo "==> find or create imported cluster '$RANCHER_CLUSTER_NAME' in Rancher"
read -r CID CSTATE < <("${CURL[@]}" "${AUTH[@]}" "$RANCHER_URL/v3/clusters?name=$RANCHER_CLUSTER_NAME" \
  | python3 -c "import sys,json;d=json.load(sys.stdin).get('data',[]);print(d[0]['id'],d[0].get('state','')) if d else print('','')")
# A re-created k3d cluster gets a new identity, so it can NOT reattach to an old
# Rancher object. If the existing object isn't active, it's orphaned — delete it
# (and any GitRepo that targeted it) and import fresh.
if [ -n "$CID" ] && [ "$CSTATE" != "active" ]; then
  echo "    existing object $CID is '$CSTATE' (orphaned) — deleting for a clean re-import"
  "${CURL[@]}" "${AUTH[@]}" -X DELETE "$RANCHER_URL/v1/fleet.cattle.io.gitrepos/fleet-default/${GITREPO_NAME}" >/dev/null 2>&1 || true
  "${CURL[@]}" "${AUTH[@]}" -X DELETE "$RANCHER_URL/v3/clusters/$CID" >/dev/null 2>&1 || true
  # wipe any leftover agent so the fresh registration is clean
  kubectl delete namespace cattle-system cattle-fleet-system --ignore-not-found --wait=true --timeout=90s >/dev/null 2>&1 || true
  CID=""
  sleep 3
fi
if [ -z "$CID" ]; then
  CID=$("${CURL[@]}" "${AUTH[@]}" -H "Content-Type: application/json" -X POST \
    -d "{\"type\":\"cluster\",\"name\":\"$RANCHER_CLUSTER_NAME\",\"import\":true}" \
    "$RANCHER_URL/v3/clusters" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
  echo "    created cluster $CID"
else
  echo "    cluster already active: $CID (re-applying agent is harmless)"
fi

echo "==> get registration manifest URL"
# Ensure a registration token exists (Rancher auto-creates one on cluster create;
# POST is idempotent enough). manifestUrl is populated asynchronously, so poll.
"${CURL[@]}" "${AUTH[@]}" -H "Content-Type: application/json" -X POST \
  -d "{\"type\":\"clusterRegistrationToken\",\"clusterId\":\"$CID\"}" \
  "$RANCHER_URL/v3/clusterRegistrationTokens" >/dev/null 2>&1 || true
REG=""
for i in $(seq 1 15); do
  REG=$("${CURL[@]}" "${AUTH[@]}" "$RANCHER_URL/v3/clusterRegistrationTokens?clusterId=$CID" \
    | python3 -c "import sys,json;d=json.load(sys.stdin).get('data',[]);print(next((t['manifestUrl'] for t in d if t.get('manifestUrl')), ''))")
  [ -n "$REG" ] && break
  sleep 4
done
[ -n "$REG" ] || { echo "ERROR: no manifestUrl after 60s"; exit 1; }
echo "    manifest: $REG"

echo "==> apply Rancher agent to the k3d cluster"
# self-signed Rancher -> agent must skip TLS verify; use the insecure manifest fetch
curl -sk "$REG" | kubectl apply -f -

echo "==> waiting for cattle-cluster-agent to come up (up to 3 min)"
kubectl -n cattle-system rollout status deploy/cattle-cluster-agent --timeout=180s || true

echo "==> verify cluster state in Rancher"
for i in $(seq 1 18); do
  STATE=$("${CURL[@]}" "${AUTH[@]}" "$RANCHER_URL/v3/clusters/$CID" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('state','?'))")
  echo "    [$i] cluster state: $STATE"
  [ "$STATE" = "active" ] && break
  sleep 10
done

echo ""
echo "Cluster '$K3D_CLUSTER' is managed by Rancher as '$RANCHER_CLUSTER_NAME' ($CID)."

if [ "$DEPLOY_FLEET" = "1" ]; then
  echo "==> deploy the kit via Fleet GitOps (targeting $CID)"
  # The Fleet cluster resource shares the mgmt cluster id ($CID) as its name.
  # Create-or-replace the GitRepo so the target is always the current cluster.
  "${CURL[@]}" "${AUTH[@]}" -X DELETE \
    "$RANCHER_URL/v1/fleet.cattle.io.gitrepos/fleet-default/${GITREPO_NAME}" >/dev/null 2>&1 || true
  sleep 2
  body=$(python3 -c "
import json
print(json.dumps({
  'type':'fleet.cattle.io.gitrepo',
  'metadata':{'name':'${GITREPO_NAME}','namespace':'fleet-default'},
  'spec':{'repo':'${GITREPO_URL}','branch':'${GITREPO_BRANCH}',
          'paths':['${GITREPO_PATH}'],
          'targets':[{'clusterName':'${CID}'}]}
}))")
  echo "$body" | "${CURL[@]}" "${AUTH[@]}" -H "Content-Type: application/json" -X POST \
    "$RANCHER_URL/v1/fleet.cattle.io.gitrepos" -d @- >/dev/null
  echo "    GitRepo ${GITREPO_NAME} created; waiting for it to reach 1/1 (fleet.yaml"
  echo "    takeOwnership adopts any resources a local 'make up' already deployed)"
  for i in $(seq 1 30); do
    R=$("${CURL[@]}" "${AUTH[@]}" "$RANCHER_URL/v1/fleet.cattle.io.gitrepos/fleet-default/${GITREPO_NAME}" \
      | python3 -c "import sys,json;st=json.load(sys.stdin).get('status',{});print('%s/%s'%(st.get('readyClusters'),st.get('desiredReadyClusters')))" 2>/dev/null)
    echo "    [$i] readyClusters=$R"
    echo "$R" | grep -q '^1/1' && break
    sleep 10
  done
  echo ""
  echo "DONE. The kit is deployed and managed by Fleet GitOps."
  echo "Rancher UI -> Continuous Delivery -> Git Repos -> ${GITREPO_NAME} should show 1/1."
else
  echo "Skipped Fleet deploy (DEPLOY_FLEET=0). The cluster is imported and visible in Rancher."
fi
