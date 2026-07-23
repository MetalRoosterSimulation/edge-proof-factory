// Self-test: launch the server over stdio exactly like an MCP client (Claude
// Desktop / Claude Code) would, list its tools, and call several in mock mode.
// Run: npm run selftest
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (cond, msg) => {
  console.log(`  ${cond ? "PASS" : "FAIL"} ${msg}`);
  if (!cond) failures++;
};

const transport = new StdioClientTransport({
  command: "node",
  args: [join(__dirname, "index.js")],
  env: { ...process.env, RANCHER_MOCK: "1" },
});
const client = new Client({ name: "selftest", version: "0.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
const names = tools.map((t) => t.name);
console.log("Discovered tools:", names.join(", "));
check(names.length >= 9, `>=9 tools registered (${names.length})`);
for (const req of [
  "rancher_list_clusters",
  "rancher_list_workloads",
  "rancher_deploy_via_fleet",
  "rancher_import_cluster",
]) {
  check(names.includes(req), `tool present: ${req}`);
}

async function call(name, args) {
  const r = await client.callTool({ name, arguments: args || {} });
  return JSON.parse(r.content[0].text);
}

const clusters = await call("rancher_list_clusters");
check(
  Array.isArray(clusters.clusters) && clusters.clusters.some((c) => c.name === "edge-mvp"),
  "list_clusters returns the edge-mvp cluster"
);

const wl = await call("rancher_list_workloads", { cluster: "c-edge01", namespace: "fab-edge" });
check(
  wl.workloads.some((w) => w.name === "edge-inference") &&
    wl.workloads.every((w) => w.ready === 1),
  "list_workloads shows the 4 kit deployments, all ready"
);

const fleet = await call("rancher_deploy_via_fleet", {
  name: "edge-proof-kit",
  repo: "https://example/edge-proof-kit",
  paths: ["reference-kits/semiconductor-predictive-maintenance/demo/k8s/base"],
});
check(fleet.created?.id?.includes("edge-proof-kit"), "deploy_via_fleet creates a GitRepo");

const imp = await call("rancher_import_cluster", { name: "edge-mvp" });
check(!!imp.command && imp.command.includes("kubectl apply"), "import_cluster returns a registration command");

await client.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
