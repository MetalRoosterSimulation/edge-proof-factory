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
CID=$("${CURL[@]}" "${AUTH[@]}" "$RANCHER_URL/v3/clusters?name=$RANCHER_CLUSTER_NAME" \
  | python3 -c "import sys,json;d=json.load(sys.stdin).get('data',[]);print(d[0]['id'] if d else '')")
if [ -z "$CID" ]; then
  CID=$("${CURL[@]}" "${AUTH[@]}" -H "Content-Type: application/json" -X POST \
    -d "{\"type\":\"cluster\",\"name\":\"$RANCHER_CLUSTER_NAME\",\"import\":true}" \
    "$RANCHER_URL/v3/clusters" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
  echo "    created cluster $CID"
else
  echo "    cluster already exists: $CID"
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
echo "DONE. The k3d cluster '$K3D_CLUSTER' is now managed by Rancher as '$RANCHER_CLUSTER_NAME' ($CID)."
echo "The fab-edge workloads are visible in Rancher. Next: deploy via Fleet with"
echo "rancher_deploy_via_fleet once the kit manifests are in a git repo Rancher can reach."
