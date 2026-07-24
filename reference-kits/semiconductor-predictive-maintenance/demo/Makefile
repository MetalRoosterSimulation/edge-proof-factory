# Edge Proof Kit — semiconductor predictive-maintenance edge-AI MVP.
# One-command, laptop-class demo on a single-node k3s cluster (k3d).
#
#   make up        create cluster, build+import images, deploy, print URL
#   make open      print the dashboard URL (host:HOSTPORT)
#   make fault     inject a degradation   (TOOL=etch-03 FAULT=rf_match_drift)
#   make heal      clear a degradation    (TOOL=etch-03)
#   make status    pods + live fleet snapshot
#   make test      run the model unit tests (no cluster needed)
#   make ai        add the SUSE AI analog profile (Ollama + Open WebUI)
#   make security  add SUSE Security (NeuVector) with its web console
#   make losant    connect the gateway to the Losant platform (needs creds)
#   make down      delete the cluster
#   make clean     delete cluster + remove built images
#
# Requires: docker, k3d, kubectl. Installs nothing globally.

CLUSTER   ?= edge-mvp
NS        ?= fab-edge
HOSTPORT  ?= 18080
NODEPORT  ?= 30080
REG       ?= edge-proof
IMAGES    := sensor-simulator edge-inference gateway-edge-agent
TOOL      ?= etch-03
FAULT     ?= rf_match_drift
KUBECTL   := kubectl -n $(NS)

.PHONY: up cluster images import deploy wait open status fault heal test ai losant \
        security rancher-import down clean

up: cluster images import deploy wait open

cluster:
	@k3d cluster list $(CLUSTER) >/dev/null 2>&1 || \
	  k3d cluster create $(CLUSTER) --servers 1 --agents 0 \
	    --k3s-arg "--disable=traefik@server:0" \
	    -p "$(HOSTPORT):$(NODEPORT)@server:0" --wait --timeout 180s
	@echo "cluster $(CLUSTER) ready"

images:
	@for i in $(IMAGES); do \
	  echo "building $(REG)/$$i:dev"; \
	  docker build -q -t $(REG)/$$i:dev images/$$i >/dev/null; \
	done

import:
	@k3d image import -c $(CLUSTER) $(foreach i,$(IMAGES),$(REG)/$(i):dev) >/dev/null 2>&1
	@echo "images imported into $(CLUSTER)"

deploy:
	@kubectl apply -k k8s/base >/dev/null
	@echo "manifests applied"

wait:
	@for d in mosquitto gateway-edge-agent sensor-simulator edge-inference; do \
	  $(KUBECTL) rollout status deploy/$$d --timeout=120s; \
	done

open:
	@echo ""
	@echo "  ┌─────────────────────────────────────────────────────────┐"
	@echo "  │  Fab Edge dashboard:  http://localhost:$(HOSTPORT)              │"
	@echo "  │  Inject a fault:      make fault TOOL=etch-03            │"
	@echo "  └─────────────────────────────────────────────────────────┘"
	@echo ""

status:
	@$(KUBECTL) get pods -o wide
	@echo ""
	@$(KUBECTL) exec deploy/edge-inference -- python -c "import urllib.request,json;\
d=json.load(urllib.request.urlopen('http://localhost:8080/api/health'));\
print('frames=%d  %s'%(d['frames_processed'],dict(d['counts'])));\
[print('  %-8s health=%5.1f %-9s rul=%s'%(t['tool_id'],t['health'],t['state'],t['rul_frames'])) for t in d['tools']]" 2>/dev/null || true

fault:
	@$(KUBECTL) exec deploy/mosquitto -- mosquitto_pub -t fab/control \
	  -m '{"tool_id":"$(TOOL)","fault":"$(FAULT)"}'
	@echo "injected $(FAULT) on $(TOOL) — watch http://localhost:$(HOSTPORT)"

heal:
	@$(KUBECTL) exec deploy/mosquitto -- mosquitto_pub -t fab/control \
	  -m '{"tool_id":"$(TOOL)","fault":"clear"}'
	@echo "cleared fault on $(TOOL)"

test:
	@python3 tests/test_health_model.py

ai:
	@kubectl apply -k k8s/ai
	@echo "SUSE AI analog (Ollama + Open WebUI) applied — this pulls a model, give it a few minutes."
	@echo "Open WebUI: run 'make ai-open' once ready."

ai-open:
	@echo "Open WebUI: http://localhost:$(HOSTPORT)  (nodePort $(shell echo $$((NODEPORT+1))) -> add a -p mapping if needed)"

losant:
	@test -f k8s/losant/losant-credentials.env || { \
	  echo "Create k8s/losant/losant-credentials.env first (see k8s/losant/README.md)"; exit 1; }
	@kubectl -n $(NS) create secret generic losant-credentials \
	  --from-env-file=k8s/losant/losant-credentials.env --dry-run=client -o yaml | kubectl apply -f -
	@$(KUBECTL) rollout restart deploy/gateway-edge-agent
	@echo "Losant credentials applied — gateway will sync derived scores to the Losant platform."

security:
	@helm repo add neuvector https://neuvector.github.io/neuvector-helm/ >/dev/null 2>&1 || true
	@helm repo update neuvector >/dev/null 2>&1 || true
	@helm upgrade --install neuvector neuvector/core --version 2.10.2 \
	  --namespace neuvector --create-namespace \
	  --set k3s.enabled=true --set k3s.runtimePath=/run/k3s/containerd/containerd.sock \
	  --set controller.replicas=1 --set controller.pvc.enabled=false \
	  --set manager.svc.type=ClusterIP --set rbac=true
	@echo "SUSE Security (NeuVector) deploying. Console (HTTPS) once ready:"
	@echo "  kubectl -n neuvector port-forward svc/neuvector-service-webui 8443:8443"
	@echo "  then open https://localhost:8443  (default login admin/admin)"

sovereignty-verify:
	@bash tests/verify_sovereignty.sh

rancher-import:
	@echo "Point the Rancher MCP server at your instance, then call rancher_import_cluster."
	@echo "See ../../../integrations/rancher-mcp-server/README.md"

down:
	@k3d cluster delete $(CLUSTER)

clean: down
	@for i in $(IMAGES); do docker rmi $(REG)/$$i:dev 2>/dev/null || true; done
	@echo "cleaned"
