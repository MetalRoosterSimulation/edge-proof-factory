# Rancher MCP server

A Model Context Protocol server for **SUSE Rancher Prime**. It lets an AI assistant
(Claude Desktop, Claude Code, or any MCP client) see and act on your Rancher fleet
— list clusters/nodes/projects, read workload health, deploy the Edge Proof Kit
via **Fleet GitOps**, and import a cluster. Runs against a real Rancher when
credentials are set, otherwise in a mock mode for testing.

This is the SUSE analog of Losant's own `losant-mcp-server`: the fleet becomes
legible and operable to an AI assistant — a concrete "SUSE AI + Edge" story to
show a partner.

## Tools

| Tool | What it does |
|---|---|
| `rancher_server_info` | version / edition / connection status |
| `rancher_list_clusters` | all managed clusters (state, k8s version, nodes) |
| `rancher_get_cluster` | one cluster's details + conditions |
| `rancher_list_nodes` | nodes, optionally per cluster |
| `rancher_list_projects` | Rancher projects |
| `rancher_list_namespaces` | namespaces in a downstream cluster (k8s proxy) |
| `rancher_list_workloads` | Deployments + ready/available replicas + image |
| `rancher_list_fleet_gitrepos` | Fleet GitOps deployments + readiness |
| `rancher_deploy_via_fleet` | create a Fleet `GitRepo` — deploy the kit by GitOps |
| `rancher_import_cluster` | create an imported cluster + return the registration command |

## Setup

```bash
cd integrations/rancher-mcp-server
npm install
cp .rancher-env.example .rancher-env   # then edit it (gitignored)
npm run selftest                       # mock-mode check — should print ALL PASS
```

`.rancher-env`:
```
RANCHER_URL=https://<your-rancher-host>
RANCHER_TOKEN=token-xxxxx:xxxxxxxxxxxx   # UI: avatar -> Account & API Keys -> Create
RANCHER_INSECURE_TLS=true                # if the cert is self-signed
```

## Register with an MCP client

Claude Code:
```bash
claude mcp add rancher -- node /home/kibby/Work/edge-proof-factory/integrations/rancher-mcp-server/src/index.js
```

Claude Desktop (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "rancher": {
      "command": "node",
      "args": ["/home/kibby/Work/edge-proof-factory/integrations/rancher-mcp-server/src/index.js"],
      "env": {
        "RANCHER_URL": "https://your-rancher-host",
        "RANCHER_TOKEN": "token-xxxxx:xxxxxxxxxxxx",
        "RANCHER_INSECURE_TLS": "true"
      }
    }
  }
}
```

## Wire the demo through Rancher, end to end

### One command (recommended)

With `.rancher-env` set and the k3d demo running (`make up`):

```bash
./scripts/wire-rancher.sh              # import cluster + deploy via Fleet, to 1/1
```

It authenticates, imports the k3d cluster, deploys the kit as a Fleet `GitRepo`
from GitHub, and polls to `1/1`. It is **safe to re-run after `make down`/`make up`**:
a re-created k3d cluster gets a new identity and can't reattach to the old Rancher
object, so the script auto-detects the orphaned (non-active) object, deletes it +
its stale GitRepo, and imports fresh. The kit's `fleet.yaml` sets
`helm.takeOwnership: true`, so Fleet **adopts** the resources a local `make up`
already deployed instead of erroring on ownership — no namespace deletion needed.

Env overrides: `DEPLOY_FLEET=0` (import only), `GITREPO_URL`, `GITREPO_BRANCH`,
`GITREPO_PATH`, `GITREPO_NAME`.

### Manual / via the MCP tools

1. `make up` in the reference kit (creates the k3d `edge-mvp` cluster).
2. `rancher_import_cluster { name: "edge-mvp" }` → run the returned
   `kubectl apply -f <url>` against the k3d cluster → it joins your fleet.
3. `rancher_deploy_via_fleet { name, repo, paths: ["reference-kits/semiconductor-predictive-maintenance/demo/k8s/base"] }`
   → Rancher/Fleet applies the kit. Now the running MVP is Rancher-managed.
4. `rancher_list_workloads { cluster, namespace: "fab-edge" }` to read its health
   from inside Rancher.

> Re-import gotcha: after `make down`/`make up`, delete the old (now "unavailable")
> cluster object in Rancher before importing again — the one-command script above
> does this for you.

## Notes
- On the stdio transport, never write to stdout except JSON-RPC — the server logs
  status to stderr only.
- Mock mode (`RANCHER_MOCK=1`, or no URL/token) returns representative fleet data
  so the tools are fully testable without an instance.
