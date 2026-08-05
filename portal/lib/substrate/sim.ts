/**
 * Site AI Inference Substrate simulation core.
 *
 * Pure, deterministic, browser-free TypeScript model of the
 * site-inference-substrate kit's pipeline: a looping historian feed
 * (temperature / pressure / cycle counts) -> KServe-class serving with
 * three models -> per-model outage policy (continue / flag / suppress)
 * at the uplink -> central ingestion, plus a signed hash-chained evidence
 * stream sealed to a WORM-style store with in-place verification.
 *
 * The "signature" here is a deterministic toy checksum — this is a labeled
 * presentation layer; the runnable kit uses HMAC-SHA256 and the production
 * design uses per-site PKI keys. No imports from lib/demo/ (FabEdge parity
 * core untouched).
 */

export type OutagePolicy = "continue" | "flag" | "suppress";

export interface ModelInfo {
  name: string;
  version: string;
  policy: OutagePolicy;
  scored: number;
  lastDisposition: string;
}

export interface UnitTags {
  unit: string;
  temperature: number;
  pressure: number;
  cycles: number;
}

export interface EvidenceBundle {
  seq: number;
  t: number;
  prevHash: string;
  hash: string;
  sig: string;
  tampered: boolean;
  counters: { scored: number; delivered: number; held: number };
}

export interface SimEvent {
  t: number;
  kind: "info" | "wan" | "policy" | "evidence" | "alert";
  text: string;
}

export interface SubstrateView {
  t: number;
  seed: number;
  uplinkUp: boolean;
  units: UnitTags[];
  models: ModelInfo[];
  outboxQueued: number;
  heldPendingReview: number;
  delivered: number;
  deliveredFlagged: number;
  centralOutputs: number;
  centralFlagged: number;
  evidenceSealed: number;
  evidenceShipped: number;
  evidenceVerified: number;
  chainStatus: "OK" | "BROKEN" | "UNVERIFIED";
  chainProblem: string | null;
  events: SimEvent[];
}

export const DEFAULT_SEED = 42;
const SEAL_EVERY_TICKS = 24; // one bundle every ~6s at 4 Hz
const MAX_EVENTS = 60;
const GENESIS = "000000";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Toy content checksum standing in for the kit's HMAC (labeled on-page). */
function checksum(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 6);
}

interface QueuedOutput {
  model: string;
  flagged: boolean;
}

export class SubstrateEngine {
  readonly seed: number;
  private rng: () => number;
  private t = 0;
  private uplinkUp = true;

  private models: ModelInfo[] = [
    { name: "equipment-health", version: "1.2.0", policy: "continue", scored: 0, lastDisposition: "—" },
    { name: "storage-optimization", version: "0.9.1", policy: "flag", scored: 0, lastDisposition: "—" },
    { name: "thermal-precursor", version: "2.0.3", policy: "suppress", scored: 0, lastDisposition: "—" },
  ];

  private outbox: QueuedOutput[] = [];
  private held = 0;
  private delivered = 0;
  private deliveredFlagged = 0;
  private centralOutputs = 0;
  private centralFlagged = 0;

  private bundles: EvidenceBundle[] = [];
  private shipped = 0;
  private verified = 0;
  private chainStatus: "OK" | "BROKEN" | "UNVERIFIED" = "UNVERIFIED";
  private chainProblem: string | null = null;

  private events: SimEvent[] = [];

  constructor(seed: number = DEFAULT_SEED) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.log("info", "site enclave up — three models scoring the looping historian feed");
  }

  // ------------------------------------------------------------- controls

  severUplink(): void {
    if (!this.uplinkUp) return;
    this.uplinkUp = false;
    this.log("wan", "uplink severed — scoring continues on the local feed; outage policies act per model");
  }

  healUplink(): void {
    if (this.uplinkUp) return;
    this.uplinkUp = true;
    this.log("wan", "uplink restored — queues drain, evidence ships; held outputs stay held (suppress = pending review)");
  }

  sealNow(): void {
    this.seal();
  }

  tamperBundle(): void {
    const candidates = this.bundles.filter((b) => !b.tampered);
    if (candidates.length < 2) return;
    const target = candidates[Math.floor(this.rng() * (candidates.length - 1))];
    target.tampered = true;
    target.counters = { ...target.counters, scored: target.counters.scored + 9999 };
    this.chainStatus = "UNVERIFIED";
    this.log("alert", `bundle #${target.seq} content altered after sealing — run chain verification to see it caught`);
  }

  verifyChain(): void {
    let prev = GENESIS;
    for (const b of this.bundles) {
      const recomputed = checksum(
        `${b.seq}|${b.prevHash}|${b.counters.scored}|${b.counters.delivered}|${b.counters.held}`,
      );
      if (recomputed !== b.hash) {
        this.chainStatus = "BROKEN";
        this.chainProblem = `bundle #${b.seq}: content hash mismatch (tamper detected)`;
        this.log("evidence", `chain verification FAILED at bundle #${b.seq} — tamper detected, later links orphaned`);
        return;
      }
      if (b.prevHash !== prev) {
        this.chainStatus = "BROKEN";
        this.chainProblem = `bundle #${b.seq}: chain linkage broken`;
        this.log("evidence", `chain verification FAILED at bundle #${b.seq} — linkage broken`);
        return;
      }
      prev = b.hash;
    }
    this.chainStatus = "OK";
    this.chainProblem = null;
    this.log("evidence", `chain verified — ${this.bundles.length} bundles, every hash, link, and sequence intact`);
  }

  // ---------------------------------------------------------------- tick

  tick(): void {
    this.t += 1;

    // Score each unit with each model every 2 ticks.
    if (this.t % 2 === 0) {
      for (const unit of this.unitTags()) {
        for (const m of this.models) {
          m.scored += 1;
          void unit;
          if (this.uplinkUp) {
            m.lastDisposition = "delivered";
            this.outbox.push({ model: m.name, flagged: false });
          } else if (m.policy === "continue") {
            m.lastDisposition = "queued";
            this.outbox.push({ model: m.name, flagged: false });
          } else if (m.policy === "flag") {
            m.lastDisposition = "queued — stale context";
            this.outbox.push({ model: m.name, flagged: true });
          } else {
            m.lastDisposition = "held for review";
            this.held += 1;
          }
        }
      }
    }

    // Delivery pump: only when the uplink is up.
    if (this.uplinkUp) {
      let n = 0;
      while (this.outbox.length > 0 && n < 12) {
        const out = this.outbox.shift();
        if (!out) break;
        this.delivered += 1;
        this.centralOutputs += 1;
        if (out.flagged) {
          this.deliveredFlagged += 1;
          this.centralFlagged += 1;
        }
        n += 1;
      }
      while (this.shipped < this.bundles.length) {
        this.shipped += 1;
        this.verified += 1;
      }
    }

    // Evidence seals on schedule regardless of the uplink.
    if (this.t % SEAL_EVERY_TICKS === 0) {
      this.seal();
    }
  }

  private seal(): void {
    const prev = this.bundles.length
      ? this.bundles[this.bundles.length - 1].hash
      : GENESIS;
    const counters = {
      scored: this.models.reduce((a, m) => a + m.scored, 0),
      delivered: this.delivered,
      held: this.held,
    };
    const seq = this.bundles.length;
    const hash = checksum(
      `${seq}|${prev}|${counters.scored}|${counters.delivered}|${counters.held}`,
    );
    this.bundles.push({
      seq,
      t: this.t,
      prevHash: prev,
      hash,
      sig: checksum(`sig|${hash}|site-key`),
      tampered: false,
      counters,
    });
    if (this.chainStatus === "OK") this.chainStatus = "UNVERIFIED";
  }

  run(ticks: number): void {
    for (let i = 0; i < ticks; i += 1) this.tick();
  }

  // ---------------------------------------------------------------- view

  unitTags(): UnitTags[] {
    const loop = (this.t % 480) / 480;
    return ["U-1", "U-2", "U-3"].map((unit, i) => {
      const phase = loop * 2 * Math.PI + i * 1.7;
      let temp = 66 + 8 * Math.sin(phase) + (this.rng() - 0.5) * 2;
      if (unit === "U-2" && loop > 0.55 && loop < 0.75) {
        temp += 45 * Math.sin((loop - 0.55) * 5 * Math.PI);
      }
      return {
        unit,
        temperature: Math.round(temp * 10) / 10,
        pressure: Math.round((11.2 + 1.6 * Math.sin(phase * 0.7)) * 10) / 10,
        cycles: Math.round(Math.max(0, 18 + 14 * Math.sin(phase * 1.3))),
      };
    });
  }

  private log(kind: SimEvent["kind"], text: string): void {
    this.events.unshift({ t: this.t, kind, text });
    if (this.events.length > MAX_EVENTS) this.events.pop();
  }

  view(): SubstrateView {
    return {
      t: this.t,
      seed: this.seed,
      uplinkUp: this.uplinkUp,
      units: this.unitTags(),
      models: this.models.map((m) => ({ ...m })),
      outboxQueued: this.outbox.length,
      heldPendingReview: this.held,
      delivered: this.delivered,
      deliveredFlagged: this.deliveredFlagged,
      centralOutputs: this.centralOutputs,
      centralFlagged: this.centralFlagged,
      evidenceSealed: this.bundles.length,
      evidenceShipped: this.shipped,
      evidenceVerified: this.verified,
      chainStatus: this.chainStatus,
      chainProblem: this.chainProblem,
      events: [...this.events],
    };
  }
}
