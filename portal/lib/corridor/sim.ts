/**
 * Corridor vegetation-inspection simulation core.
 *
 * Pure, deterministic, browser-free TypeScript model of the ground-side
 * corridor-imagery pipeline the corridor-vegetation-inspection kit
 * demonstrates: per-station upload -> bounded working storage
 * (capacity alert, then ingest backpressure) -> swappable vision scoring ->
 * findings + evidence queues that cross a severable "WAN" to the ops side
 * (work orders + custody archive with traceability metadata).
 *
 * This is presentation-grade simulation, seeded and replayable. It has no
 * relationship to lib/demo/ (the FabEdge parity core) and imports nothing
 * from it.
 */

export type StorageState = "OK" | "ALERT" | "BACKPRESSURE";

export interface CorridorImage {
  id: string;
  span: string; // e.g. SP-1042
  flight: string; // e.g. F-2031
  sizeMb: number;
}

export interface Finding {
  id: string;
  span: string;
  flight: string;
  score: number; // 0..1 encroachment confidence
  kind: "vegetation encroachment" | "hardware wear";
  modelVersion: string;
  disposition: string; // "queued (site)" -> "work order WO-####"
}

export interface EvidenceRecord {
  span: string;
  flight: string;
  modelVersion: string;
  disposition: string;
  sizeMb: number;
}

export interface SimEvent {
  t: number;
  kind: "info" | "alert" | "block" | "wan" | "ops";
  text: string;
}

export interface CorridorView {
  t: number;
  seed: number;
  campaignRunning: boolean;
  wanUp: boolean;
  storageState: StorageState;
  workingUsedMb: number;
  workingLimitMb: number;
  accepted: number;
  rejectedCredential: number;
  rejectedBackpressure: number;
  scoreBacklog: number;
  scored: number;
  modelVersion: string;
  findingsQueued: number;
  evidenceQueued: number;
  workOrders: Finding[];
  archived: number;
  lastEvidence: EvidenceRecord | null;
  events: SimEvent[];
}

export const WORKING_LIMIT_MB = 96;
export const ALERT_PCT = 0.8;
export const BACKPRESSURE_PCT = 0.95;
export const MODEL_V1 = "open-veg-scorer 1.4 (third-party container)";
export const MODEL_V2 = "open-veg-scorer 2.0 (swapped in, platform unchanged)";
export const DEFAULT_SEED = 42;

const FINDING_THRESHOLD = 0.62;
const UPLOAD_EVERY_TICKS = 2;
const SCORE_PER_TICK = 1;
const FINDING_DRAIN_PER_TICK = 2;
const EVIDENCE_DRAIN_PER_TICK = 2;
const MAX_EVENTS = 80;
const MAX_WORK_ORDERS = 10;

/** Same tiny seeded PRNG family the FabEdge console uses (mulberry32). */
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

interface PendingEvidence {
  image: CorridorImage;
  record: EvidenceRecord;
}

export class CorridorEngine {
  readonly seed: number;
  private rng: () => number;
  private t = 0;

  private campaignRunning = true;
  private wanUp = true;

  private workingUsedMb = 0;
  private accepted = 0;
  private rejectedCredential = 0;
  private rejectedBackpressure = 0;

  private scoreBacklog: CorridorImage[] = [];
  private scored = 0;
  private modelVersion = MODEL_V1;

  private findingsQueue: Finding[] = [];
  private evidenceQueue: PendingEvidence[] = [];
  private workOrders: Finding[] = [];
  private archived = 0;
  private lastEvidence: EvidenceRecord | null = null;

  private events: SimEvent[] = [];
  private imageSeq = 0;
  private findingSeq = 0;
  private woSeq = 0;
  private lastStorageState: StorageState = "OK";

  constructor(seed: number = DEFAULT_SEED) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.log("info", "campaign started — station GS-11 uploading under its per-station credential");
  }

  // ------------------------------------------------------------- controls

  toggleCampaign(): void {
    this.campaignRunning = !this.campaignRunning;
    this.log("info", this.campaignRunning ? "campaign resumed" : "campaign paused");
  }

  severWan(): void {
    if (!this.wanUp) return;
    this.wanUp = false;
    this.log("wan", "WAN severed — site keeps ingesting and scoring; findings and evidence queue locally");
  }

  healWan(): void {
    if (this.wanUp) return;
    this.wanUp = true;
    this.log("wan", "WAN restored — queued findings and evidence begin draining");
  }

  attemptRevokedUpload(): void {
    this.rejectedCredential += 1;
    this.log("block", "upload from station GS-99 refused: credential revoked (401) — per-station scope holds");
  }

  swapModel(): void {
    if (this.modelVersion === MODEL_V2) return;
    this.modelVersion = MODEL_V2;
    this.log("info", "vision container swapped to open-veg-scorer 2.0 — no platform change, findings carry the new model version");
  }

  // ---------------------------------------------------------------- tick

  tick(): void {
    this.t += 1;

    // 1. Ground-station upload (the one inbound flow, per-station credential).
    if (this.campaignRunning && this.t % UPLOAD_EVERY_TICKS === 0) {
      const sizeMb = 1.5 + this.rng() * 3.0;
      if (this.storageState() === "BACKPRESSURE") {
        this.rejectedBackpressure += 1;
        if (this.rejectedBackpressure === 1 || this.rejectedBackpressure % 10 === 0) {
          this.log(
            "block",
            `ingest backpressure: upload refused (507) — working storage protects scored imagery and queued findings (${this.rejectedBackpressure} refused)`,
          );
        }
      } else {
        this.imageSeq += 1;
        const img: CorridorImage = {
          id: `IMG-${String(this.imageSeq).padStart(4, "0")}`,
          span: `SP-${1000 + Math.floor(this.rng() * 400)}`,
          flight: `F-${2030 + Math.floor(this.imageSeq / 40)}`,
          sizeMb,
        };
        this.workingUsedMb += sizeMb;
        this.accepted += 1;
        this.scoreBacklog.push(img);
      }
    }

    // 2. Vision inference (swappable third-party workload on the platform).
    for (let i = 0; i < SCORE_PER_TICK; i += 1) {
      const img = this.scoreBacklog.shift();
      if (!img) break;
      this.scored += 1;
      const score = this.rng();
      let disposition = "no action — archived as evidence";
      if (score >= FINDING_THRESHOLD) {
        this.findingSeq += 1;
        const finding: Finding = {
          id: `FND-${String(this.findingSeq).padStart(3, "0")}`,
          span: img.span,
          flight: img.flight,
          score,
          kind: this.rng() < 0.85 ? "vegetation encroachment" : "hardware wear",
          modelVersion: this.modelVersion,
          disposition: "queued (site)",
        };
        this.findingsQueue.push(finding);
        disposition = `finding ${finding.id} (${finding.kind})`;
      }
      this.evidenceQueue.push({
        image: img,
        record: {
          span: img.span,
          flight: img.flight,
          modelVersion: this.modelVersion,
          disposition,
          sizeMb: img.sizeMb,
        },
      });
    }

    // 3. Outbound delivery — only when the site can dial out.
    if (this.wanUp) {
      for (let i = 0; i < FINDING_DRAIN_PER_TICK; i += 1) {
        const f = this.findingsQueue.shift();
        if (!f) break;
        this.woSeq += 1;
        const delivered: Finding = {
          ...f,
          disposition: `work order WO-${String(this.woSeq).padStart(3, "0")}`,
        };
        this.workOrders.unshift(delivered);
        if (this.workOrders.length > MAX_WORK_ORDERS) this.workOrders.pop();
        this.log(
          "ops",
          `${delivered.id} ${delivered.span} -> ${delivered.disposition} (score ${delivered.score.toFixed(2)})`,
        );
      }
      for (let i = 0; i < EVIDENCE_DRAIN_PER_TICK; i += 1) {
        const ev = this.evidenceQueue.shift();
        if (!ev) break;
        this.archived += 1;
        this.lastEvidence = ev.record;
        // Working storage is freed only once the evidence record lands in
        // the archive — the single-node safety trade-off, kept honest.
        this.workingUsedMb = Math.max(0, this.workingUsedMb - ev.image.sizeMb);
      }
    }

    // 4. Storage state transitions (alert first, then backpressure).
    const s = this.storageState();
    if (s !== this.lastStorageState) {
      if (s === "ALERT") {
        this.log("alert", `working storage ${Math.round(this.storagePct() * 100)}% — capacity alert raised (alert precedes backpressure)`);
      } else if (s === "BACKPRESSURE") {
        this.log("block", "working storage at limit — ingest now refusing new uploads; nothing already ingested is lost");
      } else if (this.lastStorageState !== "OK") {
        this.log("info", "working storage back under thresholds — ingest accepting uploads");
      }
      this.lastStorageState = s;
    }
  }

  run(ticks: number): void {
    for (let i = 0; i < ticks; i += 1) this.tick();
  }

  // ---------------------------------------------------------------- view

  private storagePct(): number {
    return this.workingUsedMb / WORKING_LIMIT_MB;
  }

  private storageState(): StorageState {
    const p = this.storagePct();
    if (p >= BACKPRESSURE_PCT) return "BACKPRESSURE";
    if (p >= ALERT_PCT) return "ALERT";
    return "OK";
  }

  private log(kind: SimEvent["kind"], text: string): void {
    this.events.unshift({ t: this.t, kind, text });
    if (this.events.length > MAX_EVENTS) this.events.pop();
  }

  view(): CorridorView {
    return {
      t: this.t,
      seed: this.seed,
      campaignRunning: this.campaignRunning,
      wanUp: this.wanUp,
      storageState: this.storageState(),
      workingUsedMb: this.workingUsedMb,
      workingLimitMb: WORKING_LIMIT_MB,
      accepted: this.accepted,
      rejectedCredential: this.rejectedCredential,
      rejectedBackpressure: this.rejectedBackpressure,
      scoreBacklog: this.scoreBacklog.length,
      scored: this.scored,
      modelVersion: this.modelVersion,
      findingsQueued: this.findingsQueue.length,
      evidenceQueued: this.evidenceQueue.length,
      workOrders: [...this.workOrders],
      archived: this.archived,
      lastEvidence: this.lastEvidence,
      events: [...this.events],
    };
  }
}
