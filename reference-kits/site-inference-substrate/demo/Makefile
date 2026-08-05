# site-inference-substrate demo — single-node k3d MVP
#
# Requires: docker, k3d, kubectl. Installs nothing globally.
#
#   make up               cluster + images + deploy + wait + open
#   make fault            sever the uplink (deletes the allow-wan NetworkPolicy)
#                         — scoring continues on the DMZ feed; outputs and
#                         evidence queue per each model's outage policy
#   make heal             restore the uplink (queues drain, evidence ships)
#   make verify-evidence  verify the WORM directory's signed hash chain in place
#   make reset            fresh demo state (restart pods, heal uplink)
#   make status           pods + live site/central counters
#   make test             host-side unit tests (no cluster needed)
#   make down / clean     delete the cluster / also remove built images
#
# The proof sequence CI runs end-to-end: tests/e2e_proof.sh

CLUSTER  ?= substrate-mvp
HOSTPORT ?= 18083
NODEPORT ?= 30083
REG      ?= edge-proof

IMAGES   := historian-replica feature-adapter inference-serving uplink-relay \
            evidence-collector central-stub
KSITE    := kubectl -n substrate-site
KDMZ     := kubectl -n substrate-dmz
KCENT    := kubectl -n substrate-central

.PHONY: up cluster images import deploy wait open status fault heal \
        verify-evidence reset test down clean

up: cluster images import deploy wait open

cluster:
	@k3d cluster list $(CLUSTER) >/dev/null 2>&1 || \
	  k3d cluster create $(CLUSTER) --servers 1 --agents 0 \
	    --k3s-arg "--disable=traefik@server:0" \
	    -p "$(HOSTPORT):$(NODEPORT)@server:0" --wait --timeout 180s

images:
	@for i in $(IMAGES); do \
	  echo "build $(REG)/$$i:dev"; \
	  docker build -q -t $(REG)/$$i:dev images/$$i; \
	done

import:
	@k3d image import -c $(CLUSTER) $(foreach i,$(IMAGES),$(REG)/$(i):dev)

deploy:
	@kubectl apply -k k8s/base

wait:
	@$(KDMZ) rollout status deploy/historian-replica --timeout=120s
	@$(KSITE) rollout status deploy/site --timeout=120s
	@$(KCENT) rollout status deploy/central --timeout=120s

open:
	@echo "+------------------------------------------------------------+"
	@echo "|  Site console:  http://localhost:$(HOSTPORT)                    |"
	@echo "|  make fault / heal -> sever + restore the uplink            |"
	@echo "|  make verify-evidence -> check the signed WORM chain        |"
	@echo "+------------------------------------------------------------+"

status:
	@$(KDMZ) get pods -o wide
	@$(KSITE) get pods -o wide
	@$(KCENT) get pods -o wide
	@$(KSITE) exec deploy/site -c uplink-relay -- python -c \
	  "import json,urllib.request;\
s=json.load(urllib.request.urlopen('http://127.0.0.1:8083/status'));\
p=json.load(urllib.request.urlopen('http://127.0.0.1:8083/panorama'));\
print('site    :', {k:s[k] for k in ('uplink_up','outbox_queued','delivered','delivered_flagged','held_pending_review','worm_bundles','feed')});\
print('serving :', s.get('serving'));\
print('central :', p.get('central'))" 2>/dev/null || true

fault:
	@$(KSITE) delete networkpolicy allow-wan
	@echo "Uplink severed — scoring continues on the DMZ feed; outputs and"
	@echo "evidence queue per each model's outage policy (continue/flag/suppress)."

heal:
	@kubectl apply -f k8s/base/45-allow-wan.yaml
	@echo "Uplink restored — queues drain, evidence ships and verifies centrally."

verify-evidence:
	@$(KSITE) exec deploy/site -c evidence-collector -- python -m app.verify

reset:
	@kubectl apply -f k8s/base/45-allow-wan.yaml >/dev/null 2>&1 || true
	@$(KSITE) delete pod -l app=site --wait=false >/dev/null 2>&1 || true
	@$(KCENT) delete pod -l app=central --wait=false >/dev/null 2>&1 || true
	@$(KSITE) rollout status deploy/site --timeout=120s
	@$(KCENT) rollout status deploy/central --timeout=120s
	@echo "Demo state reset (fresh volumes, uplink up)."

test:
	@python3 tests/test_scoring.py
	@python3 tests/test_evchain.py

down:
	@k3d cluster delete $(CLUSTER) 2>/dev/null || true

clean: down
	@for i in $(IMAGES); do docker rmi $(REG)/$$i:dev 2>/dev/null || true; done
