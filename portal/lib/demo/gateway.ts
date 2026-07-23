/**
 * gateway.ts — TypeScript port of the Losant Gateway Edge Agent (GEA) tier:
 *   reference-kits/semiconductor-predictive-maintenance/demo/images/
 *     gateway-edge-agent/app/gateway.py
 *
 * In the k3s kit this tier has three jobs, exactly as the real GEA:
 *   1. Ingest raw OT device telemetry.
 *   2. Normalize + tag it and **buffer on downstream outage** (offline
 *      buffering) — republishing to the inference tier when it recovers.
 *   3. Be the single governed egress point: only derived health verdicts may
 *      ever leave; raw telemetry is structurally incapable of it.
 *
 * In the browser demo the "edge box" is the visitor's tab and there is no
 * Losant credential, so the gateway runs the same air-gapped path the k3s kit
 * defaults to: every derived verdict is counted as *withheld*. The offline
 * buffer is real here too — when the demo simulates a downstream (inference
 * tier) outage, raw frames queue in the gateway (bounded, like gateway.py's
 * deque(maxlen=BUFFER_MAX)) and flush in order on recovery. The counters
 * mirror gateway.py's `stats` dict one-for-one so the dashboard can show the
 * governance ledger live.
 */
import type { GatewayStats, SensorFrame, Verdict } from "./types";

const BUFFER_MAX = 5000; // gateway.py BUFFER_MAX default

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
  private buffer: NormalizedFrame[] = [];
  /** Downstream (inference tier) reachability — false simulates the outage
   * the kit demonstrates with its offline-buffering exercise. */
  downstreamUp = true;

  constructor(site = "fab-1", line = "etch-bay-A") {
    this.stats = {
      raw_ingested: 0,
      normalized_published: 0,
      buffered: 0,
      buffer_depth: 0,
      derived_seen: 0,
      losant_forwarded: 0,
      losant_withheld_airgapped: 0,
      losant_connected: false, // browser demo always runs air-gapped
      site,
      line,
    };
  }

  private normalize(toolId: string, ts: number, sensors: SensorFrame): NormalizedFrame {
    return {
      tool_id: toolId,
      site: this.stats.site,
      line: this.stats.line,
      ts,
      sensors,
      gateway: "losant-gea",
    };
  }

  /** Ingest one raw device frame. Returns the normalized frame when the
   * downstream tier is reachable, or null after buffering it (offline
   * buffering — gateway.py's on_message raw branch). */
  ingestRaw(toolId: string, ts: number, sensors: SensorFrame): NormalizedFrame | null {
    this.stats.raw_ingested += 1;
    const frame = this.normalize(toolId, ts, sensors);
    if (this.downstreamUp) {
      this.stats.normalized_published += 1;
      return frame;
    }
    this.buffer.push(frame);
    if (this.buffer.length > BUFFER_MAX) this.buffer.shift();
    this.stats.buffered += 1;
    this.stats.buffer_depth = this.buffer.length;
    return null;
  }

  /** Drain the offline buffer in order (gateway.py's _flush_buffer). Call
   * after the downstream tier recovers; the caller feeds each frame to
   * inference exactly as if it had just arrived. */
  flushBuffer(): NormalizedFrame[] {
    if (!this.downstreamUp || this.buffer.length === 0) return [];
    const drained = this.buffer;
    this.buffer = [];
    this.stats.normalized_published += drained.length;
    this.stats.buffer_depth = 0;
    return drained;
  }

  /** See a derived verdict at the egress point. Only these fields would ever
   * leave the edge; with no platform connection they are withheld.
   * (Port of gateway.py's _forward_derived.) */
  seeDerived(verdict: Verdict): void {
    // Air-gapped: the verdict is counted, never sent. (A Losant-connected
    // mode would forward derivedFields(verdict) here, as gateway.py does.)
    void verdict;
    this.stats.derived_seen += 1;
    this.stats.losant_withheld_airgapped += 1;
  }

  snapshot(): GatewayStats {
    return { ...this.stats };
  }
}

/** The governance contract itself, as data — the ONLY fields the k3s kit's
 * inference tier publishes for egress (service.py's _derived). The demo UI
 * renders this to show what would cross the boundary vs. what never can, and
 * the AI stand-in routes accept nothing beyond this shape plus the model's
 * own attribution. */
export function derivedFields(verdict: Verdict): Record<string, unknown> {
  return {
    tool_id: verdict.tool_id,
    health: verdict.health,
    state: verdict.state,
    rul_frames: verdict.rul_frames,
    warming: verdict.warming,
  };
}
