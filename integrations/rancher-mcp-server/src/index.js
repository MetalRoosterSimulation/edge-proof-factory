#!/usr/bin/env node
// Rancher MCP server (stdio). Exposes SUSE Rancher Prime fleet operations as MCP
// tools so an AI assistant can see and act on your clusters — and deploy the
// Edge Proof Kit via Fleet GitOps. Runs against a real Rancher when
// RANCHER_URL + RANCHER_TOKEN are set, otherwise in mock mode for testing.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { rancher } from "./rancher.js";

const server = new McpServer({
  name: "rancher-mcp-server",
  version: "0.1.0",
});

const ok = (obj) => ({
  content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
});
const fail = (e) => ({
  content: [{ type: "text", text: `ERROR: ${e.message || e}` }],
  isError: true,
});

function tool(name, description, schema, handler) {
  server.registerTool(name, { description, inputSchema: schema }, async (args) => {
    try {
      return ok(await handler(args || {}));
    } catch (e) {
      return fail(e);
    }
  });
}

tool(
  "rancher_server_info",
  "Rancher server version / edition and whether the MCP server is talking to a real instance or mock data.",
  {},
  async () => ({ ...(await rancher.serverInfo()), connectedTo: rancher.baseUrl, mock: rancher.mock })
);

tool(
  "rancher_list_clusters",
  "List all clusters managed by Rancher (id, name, state, k8s version, provider, node count, readiness).",
  {},
  async () => ({ clusters: await rancher.listClusters() })
);

tool(
  "rancher_get_cluster",
  "Get one cluster's details and status conditions.",
  { cluster: z.string().describe("cluster id, e.g. 'local' or 'c-edge01'") },
  async ({ cluster }) => rancher.getCluster(cluster)
);

tool(
  "rancher_list_nodes",
  "List nodes, optionally filtered to one cluster (name, roles, state, capacity).",
  { cluster: z.string().optional().describe("cluster id to filter by") },
  async ({ cluster }) => ({ nodes: await rancher.listNodes(cluster) })
);

tool(
  "rancher_list_projects",
  "List Rancher projects (the multi-tenant grouping above namespaces), optionally per cluster.",
  { cluster: z.string().optional() },
  async ({ cluster }) => ({ projects: await rancher.listProjects(cluster) })
);

tool(
  "rancher_list_namespaces",
  "List namespaces in a downstream cluster via the Rancher k8s proxy.",
  { cluster: z.string().describe("cluster id") },
  async ({ cluster }) => ({ namespaces: await rancher.listNamespaces(cluster) })
);

tool(
  "rancher_list_workloads",
  "List Deployments in a namespace of a downstream cluster, with ready/available replica counts and image — use this to read the health of the deployed Edge Proof Kit.",
  {
    cluster: z.string().describe("cluster id"),
    namespace: z.string().describe("namespace, e.g. 'fab-edge'"),
  },
  async ({ cluster, namespace }) => ({
    workloads: await rancher.listWorkloads(cluster, namespace),
  })
);

tool(
  "rancher_list_fleet_gitrepos",
  "List Fleet GitRepos (GitOps deployments) and their readiness across clusters.",
  {},
  async () => ({ gitRepos: await rancher.listFleetGitRepos() })
);

tool(
  "rancher_deploy_via_fleet",
  "Deploy a workload (e.g. the Edge Proof Kit demo) to the fleet by creating a Fleet GitRepo. This is the GitOps deploy path — Rancher/Fleet pulls the repo and applies the manifests to the targeted clusters.",
  {
    name: z.string().describe("GitRepo name, e.g. 'edge-proof-kit'"),
    repo: z.string().describe("git URL of the manifests"),
    branch: z.string().optional().describe("branch (default main)"),
    paths: z
      .array(z.string())
      .describe("paths within the repo to the manifests, e.g. ['reference-kits/semiconductor-predictive-maintenance/demo/k8s/base']"),
    targetNamespace: z.string().optional(),
  },
  async (a) => ({ created: await rancher.createFleetGitRepo(a) })
);

tool(
  "rancher_import_cluster",
  "Create an imported-cluster shell in Rancher and return the `kubectl apply` registration command to run against the downstream cluster (e.g. the local k3d demo cluster) so it joins the fleet.",
  { name: z.string().describe("name for the imported cluster, e.g. 'edge-mvp'") },
  async ({ name }) => rancher.importCluster(name)
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Never log to stdout on stdio transport — it corrupts the JSON-RPC stream.
  console.error(
    `[rancher-mcp] ready — ${rancher.mock ? "MOCK mode (no RANCHER_URL/TOKEN)" : "connected to " + rancher.baseUrl}`
  );
}

main().catch((e) => {
  console.error("[rancher-mcp] fatal:", e);
  process.exit(1);
});
