import type { NextConfig } from "next";

const REPO = "https://github.com/MetalRoosterSimulation/edge-proof-factory";

const nextConfig: NextConfig = {
  // Documentation lives in GitHub; old portal URLs keep working.
  async redirects() {
    return [
      { source: "/demo", destination: "/", permanent: true },
      {
        source: "/ledger",
        destination: `${REPO}/blob/main/BUILD-LEDGER.md`,
        permanent: false,
      },
      {
        source: "/kits/:slug",
        destination: `${REPO}/tree/main/reference-kits/:slug`,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
