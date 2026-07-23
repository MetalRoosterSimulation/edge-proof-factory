// Minimal Rancher API client (v3 management API + Steve /v1 API + the k8s
// downstream proxy). Talks to a real Rancher when RANCHER_URL + RANCHER_TOKEN
// are set; otherwise serves deterministic mock data so the MCP server is fully
// testable without an instance (RANCHER_MOCK=1, or simply no credentials).
//
// Auth: Rancher API keys are bearer tokens of the form `token-xxxxx:secret`.
// Get one from the Rancher UI: avatar -> Account & API Keys -> Create API Key.

const URL = (process.env.RANCHER_URL || "").replace(/\/+$/, "");

// Accept either the single combined bearer token (RANCHER_TOKEN=token-xxxxx:secret)
// or the two separate fields the Rancher UI also shows
// (RANCHER_ACCESS_KEY=token-xxxxx + RANCHER_SECRET_KEY=...). Auto-add the "token-"
// prefix if the access key was pasted without it. These forgive the two common
// paste mistakes; they cannot fix a genuinely wrong key/secret pair.
function resolveToken() {
  let t = (process.env.RANCHER_TOKEN || "").trim();
  const ak = (process.env.RANCHER_ACCESS_KEY || "").trim();
  const sk = (process.env.RANCHER_SECRET_KEY || "").trim();
  if (!t && ak && sk) t = `${ak}:${sk}`;
  if (t && t.includes(":") && !t.startsWith("token-")) t = `token-${t}`;
  return t;
}
const TOKEN = resolveToken();
export const MOCK =
  process.env.RANCHER_MOCK === "1" || !URL || !TOKEN;

if (process.env.RANCHER_INSECURE_TLS === "true") {
  // Local Rancher installs usually present a self-signed cert.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

async function api(path, { method = "GET", body } = {}) {
  if (MOCK) return mock(path, method, body);
  const res = await fetch(`${URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.message || data?.raw || res.statusText;
    throw new Error(`Rancher ${method} ${path} -> ${res.status}: ${msg}`);
  }
  return data;
}

// --- high-level operations ----------------------------------------------------
export const rancher = {
  mock: MOCK,
  baseUrl: URL || "(mock)",

  async serverInfo() {
    if (MOCK) {
      return { version: "v2.14.1 (mock)", edition: "Rancher Prime (mock)", mock: true };
    }
    const v = await api("/v3/settings/server-version");
    return { version: v?.value || "unknown", url: URL, mock: false };
  },

  async listClusters() {
    const d = await api("/v3/clusters");
    return (d.data || []).map((c) => ({
      id: c.id,
      name: c.name,
      state: c.state,
      k8sVersion: c.version?.gitVersion || c.k8sVersion || "?",
      provider: c.provider || c.driver || "?",
      nodeCount: c.nodeCount ?? null,
      ready: c.conditions?.find((x) => x.type === "Ready")?.status === "True",
    }));
  },

  async getCluster(cluster) {
    const d = await api(`/v3/clusters/${encodeURIComponent(cluster)}`);
    return {
      id: d.id,
      name: d.name,
      state: d.state,
      k8sVersion: d.version?.gitVersion || "?",
      provider: d.provider || d.driver,
      nodeCount: d.nodeCount,
      conditions: (d.conditions || []).map((c) => ({
        type: c.type,
        status: c.status,
        message: c.message,
      })),
    };
  },

  async listNodes(cluster) {
    const q = cluster ? `?clusterId=${encodeURIComponent(cluster)}` : "";
    const d = await api(`/v3/nodes${q}`);
    return (d.data || []).map((n) => ({
      name: n.nodeName || n.hostname || n.id,
      cluster: n.clusterId,
      state: n.state,
      roles: [
        n.controlPlane && "controlplane",
        n.etcd && "etcd",
        n.worker && "worker",
      ].filter(Boolean),
      cpu: n.capacity?.cpu,
      memory: n.capacity?.memory,
    }));
  },

  async listProjects(cluster) {
    const q = cluster ? `?clusterId=${encodeURIComponent(cluster)}` : "";
    const d = await api(`/v3/projects${q}`);
    return (d.data || []).map((p) => ({
      id: p.id,
      name: p.name,
      cluster: p.clusterId,
      state: p.state,
    }));
  },

  // k8s downstream proxy: /k8s/clusters/<id>/<kube-api-path>
  async k8s(cluster, kubePath) {
    return api(`/k8s/clusters/${encodeURIComponent(cluster)}${kubePath}`);
  },

  async listNamespaces(cluster) {
    const d = await this.k8s(cluster, "/api/v1/namespaces");
    return (d.items || []).map((n) => n.metadata?.name);
  },

  async listWorkloads(cluster, namespace) {
    const d = await this.k8s(
      cluster,
      `/apis/apps/v1/namespaces/${encodeURIComponent(namespace)}/deployments`
    );
    return (d.items || []).map((w) => ({
      name: w.metadata?.name,
      namespace: w.metadata?.namespace,
      replicas: w.status?.replicas ?? 0,
      ready: w.status?.readyReplicas ?? 0,
      available: w.status?.availableReplicas ?? 0,
      image: w.spec?.template?.spec?.containers?.[0]?.image,
    }));
  },

  async listFleetGitRepos() {
    const d = await api("/v1/fleet.cattle.io.gitrepos");
    return (d.data || []).map((g) => ({
      id: g.id,
      repo: g.spec?.repo,
      branch: g.spec?.branch,
      paths: g.spec?.paths,
      readyClusters: g.status?.readyClusters,
      desiredReady: g.status?.desiredReadyClusters,
      state: g.metadata?.state?.name || g.status?.conditions?.[0]?.type,
    }));
  },

  // Deploy the Edge Proof Kit (or anything) via Fleet GitOps.
  async createFleetGitRepo({ name, repo, branch = "main", paths = [], targetNamespace }) {
    const body = {
      type: "fleet.cattle.io.gitrepo",
      metadata: { name, namespace: "fleet-local" },
      spec: {
        repo,
        branch,
        paths,
        ...(targetNamespace ? { targetNamespace } : {}),
      },
    };
    const d = await api("/v1/fleet.cattle.io.gitrepos", { method: "POST", body });
    return { id: d.id || `fleet-local/${name}`, repo, branch, paths };
  },

  // Create an imported-cluster shell and return the registration command the
  // user runs against their downstream cluster (e.g. the k3d demo cluster).
  async importCluster(name) {
    const cluster = await api("/v3/clusters", {
      method: "POST",
      body: { type: "cluster", name, import: true },
    });
    const clusterId = cluster.id;
    // registration token carries the `kubectl apply -f <url>` command.
    const tok = await api("/v3/clusterRegistrationTokens", {
      method: "POST",
      body: { type: "clusterRegistrationToken", clusterId },
    });
    return {
      clusterId,
      name,
      insecureCommand: tok.insecureCommand,
      command: tok.command,
      manifestUrl: tok.manifestUrl,
    };
  },
};

// --- mock layer ---------------------------------------------------------------
function mock(path, method) {
  const M = {
    "/v3/clusters": {
      data: [
        {
          id: "local",
          name: "local",
          state: "active",
          version: { gitVersion: "v1.35.5+rke2r1" },
          provider: "rke2",
          nodeCount: 3,
          conditions: [{ type: "Ready", status: "True" }],
        },
        {
          id: "c-edge01",
          name: "edge-mvp",
          state: "active",
          version: { gitVersion: "v1.35.5+k3s1" },
          provider: "k3s",
          nodeCount: 1,
          conditions: [{ type: "Ready", status: "True" }],
        },
      ],
    },
    "/v3/nodes": {
      data: [
        { nodeName: "rke2-cp-0", clusterId: "local", state: "active",
          controlPlane: true, etcd: true, worker: true,
          capacity: { cpu: "8", memory: "32Gi" } },
        { nodeName: "edge-mvp-server-0", clusterId: "c-edge01", state: "active",
          controlPlane: true, worker: true,
          capacity: { cpu: "4", memory: "8Gi" } },
      ],
    },
    "/v3/projects": {
      data: [
        { id: "c-edge01:p-fab", name: "fab-edge", clusterId: "c-edge01", state: "active" },
      ],
    },
    "/v1/fleet.cattle.io.gitrepos": {
      data: [
        { id: "fleet-local/edge-proof-kit", spec: { repo: "https://example/edge-proof-kit", branch: "main", paths: ["reference-kits/semiconductor-predictive-maintenance/demo/k8s/base"] },
          status: { readyClusters: 1, desiredReadyClusters: 1 } },
      ],
    },
  };
  if (path.includes("/api/v1/namespaces") && !path.includes("/deployments")) {
    return { items: ["fab-edge", "kube-system", "cattle-system"].map((n) => ({ metadata: { name: n } })) };
  }
  if (path.includes("/deployments")) {
    return {
      items: ["mosquitto", "gateway-edge-agent", "sensor-simulator", "edge-inference"].map(
        (n) => ({
          metadata: { name: n, namespace: "fab-edge" },
          status: { replicas: 1, readyReplicas: 1, availableReplicas: 1 },
          spec: { template: { spec: { containers: [{ image: `edge-proof/${n}:dev` }] } } },
        })
      ),
    };
  }
  if (path.startsWith("/v3/clusters/")) {
    return M["/v3/clusters"].data.find((c) => path.endsWith(c.id)) || M["/v3/clusters"].data[1];
  }
  if (path === "/v3/clusters" && method === "POST") {
    return { id: "c-imported01", type: "cluster" };
  }
  if (path === "/v3/clusterRegistrationTokens") {
    return {
      insecureCommand: "kubectl apply -f https://rancher.example/v3/import/abc123.yaml",
      command: "kubectl apply -f https://rancher.example/v3/import/abc123.yaml",
      manifestUrl: "https://rancher.example/v3/import/abc123.yaml",
    };
  }
  if (path === "/v1/fleet.cattle.io.gitrepos" && method === "POST") {
    return { id: "fleet-local/edge-proof-kit" };
  }
  return M[path] || { data: [] };
}
