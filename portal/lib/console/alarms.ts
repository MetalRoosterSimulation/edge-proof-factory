/**
 * alarms.ts — ISA-18.2-style alarm derivation from fleet snapshots.
 *
 * Pure presentation logic: watches SPC state transitions between successive
 * engine snapshots and emits alarm entries (activation on worsening,
 * return-to-normal on recovery). No engine changes — the alarm list is a
 * client-side journal of what the model already decided.
 */
import type { ToolState, Verdict } from "@/lib/demo/types";

export type AlarmSeverity = "WATCH" | "WARNING" | "CRITICAL";

export type Alarm = {
  id: number;
  frame: number;
  toolId: string;
  severity: AlarmSeverity;
  kind: "excursion" | "rtn";
  message: string;
  acked: boolean;
};

const RANK: Record<ToolState, number> = {
  HEALTHY: 0,
  WATCH: 1,
  WARNING: 2,
  CRITICAL: 3,
};

export const MAX_ALARMS = 50;

/** Compare previous and current verdicts; append alarms for transitions. */
export function deriveAlarms(
  prev: Map<string, ToolState>,
  tools: Verdict[],
  frame: number,
  existing: Alarm[],
  nextId: number,
): { alarms: Alarm[]; nextId: number; states: Map<string, ToolState> } {
  const states = new Map<string, ToolState>();
  let id = nextId;
  const added: Alarm[] = [];
  for (const v of tools) {
    states.set(v.tool_id, v.state);
    if (v.warming) continue;
    const before = prev.get(v.tool_id);
    if (before === undefined || before === v.state) continue;
    if (RANK[v.state] > RANK[before] && v.state !== "HEALTHY") {
      const top = v.top_contributors[0]?.sensor?.replaceAll("_", " ") ?? "";
      added.push({
        id: id++,
        frame,
        toolId: v.tool_id,
        severity: v.state as AlarmSeverity,
        kind: "excursion",
        message: top ? `SPC excursion — ${top}` : "SPC excursion",
        acked: false,
      });
    } else if (RANK[v.state] < RANK[before] && v.state === "HEALTHY") {
      added.push({
        id: id++,
        frame,
        toolId: v.tool_id,
        severity: "WATCH",
        kind: "rtn",
        message: "Return to normal",
        acked: true, // RTN entries are informational, pre-acked
      });
    }
  }
  const alarms = [...added.reverse(), ...existing].slice(0, MAX_ALARMS);
  return { alarms, nextId: id, states };
}

export function ackAlarm(alarms: Alarm[], id: number): Alarm[] {
  return alarms.map((a) => (a.id === id ? { ...a, acked: true } : a));
}

export function unackedCount(alarms: Alarm[]): number {
  return alarms.filter((a) => !a.acked).length;
}
