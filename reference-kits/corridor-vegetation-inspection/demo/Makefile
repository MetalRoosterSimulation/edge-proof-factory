# corridor-vegetation-inspection demo — single-node k3d MVP
#
# Requires: docker, k3d, kubectl. Installs nothing globally.
#
#   make up         cluster + images + deploy + wait + open
#   make campaign   fly a campaign (COUNT uploads under the station credential)
#   make revoked    prove the per-station credential (revoked station -> 401)
#   make fault      sever the WAN (deletes the allow-wan NetworkPolicy)
#   make heal       restore the WAN (re-applies it)
#   make fill       oversized campaign -> capacity ALERT, then 507 backpressure
#   make status     pods + live site counters
#   make test       host-side unit tests (no cluster needed)
#   make down       delete the k3d cluster
#   make clean      down + remove built images
#
# The proof sequence CI runs end-to-end: tests/e2e_proof.sh

CLUSTER  ?= corridor-mvp
HOSTPORT ?= 18082
NODEPORT ?= 30082
REG      ?= edge-proof
COUNT    ?= 12
SEED     ?= 42
STATION  ?= GS-11
TOKEN    ?= tok-corridor-a
EXPECT   ?= 200
NAME     ?= campaign

IMAGES   := site-ingest vision-scorer findings-relay ops-center ground-station
KSITE    := kubectl -n corridor-site
KOPS     := kubectl -n corridor-ops

.PHONY: up cluster images import deploy wait open status campaign revoked fill \
        shot fault heal test down clean

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
	@$(KSITE) rollout status deploy/site --timeout=120s
	@$(KOPS) rollout status deploy/ops-center --timeout=120s

open:
	@echo "+----------------------------------------------------------+"
	@echo "|  Corridor site console:  http://localhost:$(HOSTPORT)         |"
	@echo "|  make campaign -> uploads; make fault/heal -> sever WAN   |"
	@echo "+----------------------------------------------------------+"

status:
	@$(KSITE) get pods -o wide
	@$(KOPS) get pods -o wide
	@$(KSITE) exec deploy/site -c site-ingest -- python -c \
	  "import json,urllib.request;\
s=json.load(urllib.request.urlopen('http://127.0.0.1:8080/status'));\
p=json.load(urllib.request.urlopen('http://127.0.0.1:8080/panorama'));\
print('site  :', s);\
print('relay :', p.get('relay'));\
print('ops   :', p.get('ops'))" 2>/dev/null || true

# One-shot ground-station pod (campaign / revoked / fill all route here).
shot:
	@$(KSITE) delete pod $(NAME) --ignore-not-found >/dev/null 2>&1 || true
	@$(KSITE) run $(NAME) --image=$(REG)/ground-station:dev --restart=Never \
	  --image-pull-policy=IfNotPresent --labels=app=ground-station \
	  --env=STATION=$(STATION) --env=TOKEN=$(TOKEN) --env=COUNT=$(COUNT) \
	  --env=SEED=$(SEED) --env=EXPECT=$(EXPECT) >/dev/null
	@phase=""; for i in $$(seq 1 60); do \
	  phase=$$($(KSITE) get pod $(NAME) -o jsonpath='{.status.phase}' 2>/dev/null); \
	  if [ "$$phase" = "Succeeded" ] || [ "$$phase" = "Failed" ]; then break; fi; \
	  sleep 2; \
	done; \
	$(KSITE) logs pod/$(NAME); \
	$(KSITE) delete pod $(NAME) --ignore-not-found >/dev/null 2>&1; \
	[ "$$phase" = "Succeeded" ]

campaign:
	@$(MAKE) --no-print-directory shot NAME=campaign COUNT=$(COUNT) SEED=$(SEED)

revoked:
	@$(MAKE) --no-print-directory shot NAME=revoked STATION=GS-99 \
	  TOKEN=tok-revoked COUNT=1 EXPECT=401

fill:
	@$(MAKE) --no-print-directory shot NAME=fill COUNT=60 SEED=44

fault:
	@$(KSITE) delete networkpolicy allow-wan
	@echo "WAN severed — the site keeps ingesting and scoring; queues grow."

heal:
	@kubectl apply -f k8s/base/35-allow-wan.yaml
	@echo "WAN restored — queues drain."

test:
	@python3 tests/test_vegmodel.py
	@python3 tests/test_store.py

down:
	@k3d cluster delete $(CLUSTER) 2>/dev/null || true

clean: down
	@for i in $(IMAGES); do docker rmi $(REG)/$$i:dev 2>/dev/null || true; done
