/**
 * gateway.ts — TypeScript port of the Losant Gateway Edge Agent (GEA) tier:
 *   reference-kits/semiconductor-predictive-maintenance/demo/images/
 *     gateway-edge-agent/app/gateway.py
 *
 * In the k3s kit this tier is the single governed egress point: it ingests raw
 * OT telemetry, normalizes + tags it for the inference tier, and forwards ONLY
 * derived health verdicts to the Losant platform — raw telemetry is
 * structurally incapable of leaving (it only ever republishes the health
 * topic). That is the SUSE Industrial Edge data-sovereignty pattern.
 *
 * In the browser demo the "edge box" is the visitor's tab and there is no
 * Losant credential, so the gateway runs the same air-gapped path the k3s kit
 * defaults to: every derived verdict is counted as *withheld*, every raw frame
 * is counted as staying on-prem. The counters mirror gateway.py's `stats`
 * dict one-for-one so the dashboard can show the governance ledger live.
 */
import type { GatewayStats, SensorFrame, Verdict } from "./types";

export type NormalizedFrame = {
  tool_id: string;
  site: string;
  line: string;
  ts: number;
  sensors: SensorFrame;
  gateway: "losant-gea";
};

export class Gateway {
  private stats: GatewayStats;

  constructor(site = "fab-1", line = "etch-bay-A") {
    this.stats = {
      raw_ingested: 0,
      normalized_published: 0,
      derived_seen: 0,
      losant_forwarded: 0,
      losant_withheld_airgapped: 0,
      losant_connected: false, // browser demo always runs air-gapped
      site,
      line,
    };
  }

  /** Ingest one raw device frame; normalize + tag for the inference tier.
   * (Port of gateway.py's on_message raw branch + _normalize.) */
  normalize(toolId: string, ts: number, sensors: SensorFrame): NormalizedFrame {
    this.stats.raw_ingested += 1;
    this.stats.normalized_published += 1;
    return {
      tool_id: toolId,
      site: this.stats.site,
      line: this.stats.line,
      ts,
      sensors,
      gateway: "losant-gea",
    };
  }

  /** See a derived verdict at the egress point. Only these fields would ever
   * leave the edge; with no platform connection they are withheld.
   * (Port of gateway.py's _forward_derived.) */
  seeDerived(_verdict: Verdict): void {
    this.stats.derived_seen += 1;
    this.stats.losant_withheld_airgapped += 1;
  }

  snapshot(): GatewayStats {
    return { ...this.stats };
  }
}

/** The governance contract itself, as data — the ONLY fields the k3s kit's
 * inference tier publishes for egress (service.py's _derived). The demo UI
 * renders this to show what would cross the boundary vs. what never can. */
export function derivedFields(verdict: Verdict): Record<string, unknown> {
  return {
    tool_id: verdict.tool_id,
    health: verdict.health,
    state: verdict.state,
    rul_frames: verdict.rul_frames,
    warming: verdict.warming,
  };
}
