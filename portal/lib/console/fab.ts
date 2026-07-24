/**
 * fab.ts — presentation-layer fab domain mapping for the console.
 *
 * This file translates the DemoEngine's neutral identifiers into the
 * vocabulary a fab engineer expects (SEMI E10 tool states, process-module
 * chamber names, SPC control limits) WITHOUT touching the engine: display
 * names map onto engine tool ids, E10 chips are derived from the SPC state,
 * and control limits come from the simulator's own healthy operating point
 * (BASE mean ± 3σ) — nothing here is invented beyond the simulation's own
 * fiction, which the console labels as simulated.
 */
import { BASE } from "@/lib/demo/simulator";
import type { ToolState } from "@/lib/demo/types";

/** Engine id → chamber (process module) display name. Display-only. */
export function chamberName(toolId: string): string {
  const n = toolId.match(/(\d+)$/)?.[1];
  return n ? `ETCH-PM${Number(n)}` : toolId.toUpperCase();
}

/** The simulated context strip — clearly part of the simulated fab. */
export const FAB_CONTEXT = {
  bay: "ETCH BAY A",
  lot: "LOT W30-A2419",
  recipe: "OXIDE-ETCH-45B",
  wafers: "14/25",
} as const;

/** SEMI E10-style tool state derived from the SPC verdict state. The mapping
 * is presentation: a chamber in CRITICAL is down unscheduled; a WARNING
 * excursion puts it under engineering investigation. */
export type E10State =
  | "PRODUCTIVE"
  | "ENGINEERING"
  | "UNSCHEDULED DOWN"
  | "NON-SCHEDULED";

export function e10State(state: ToolState, warming: boolean): E10State {
  if (warming) return "NON-SCHEDULED";
  switch (state) {
    case "CRITICAL":
      return "UNSCHEDULED DOWN";
    case "WARNING":
      return "ENGINEERING";
    default:
      return "PRODUCTIVE";
  }
}

export type SensorMeta = {
  key: string;
  label: string;
  unit: string;
  decimals: number;
  /** Control limits from the simulator's healthy operating point: mean ± 3σ. */
  mean: number;
  ucl: number;
  lcl: number;
};

const SENSOR_LABELS: Record<string, { label: string; unit: string; decimals: number }> = {
  chamber_pressure_mtorr: { label: "Chamber pressure", unit: "mTorr", decimals: 1 },
  rf_forward_power_w: { label: "RF forward power", unit: "W", decimals: 0 },
  rf_reflected_power_w: { label: "RF reflected power", unit: "W", decimals: 1 },
  chamber_temp_c: { label: "Electrode temp", unit: "°C", decimals: 1 },
  endpoint_signal: { label: "Endpoint signal", unit: "a.u.", decimals: 3 },
  he_backside_flow_sccm: { label: "He backside flow", unit: "sccm", decimals: 2 },
};

export const SENSOR_META: SensorMeta[] = Object.entries(BASE).map(
  ([key, [mean, sigma]]) => {
    const meta = SENSOR_LABELS[key] ?? { label: key, unit: "", decimals: 2 };
    return {
      key,
      label: meta.label,
      unit: meta.unit,
      decimals: meta.decimals,
      mean,
      ucl: mean + 3 * sigma,
      lcl: mean - 3 * sigma,
    };
  },
);

export function fmt(value: number, decimals: number): string {
  return value.toFixed(decimals);
}
