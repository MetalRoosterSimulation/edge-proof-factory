/**
 * scenario.ts — the guided run-through, as a scripted step list.
 *
 * No tour engine: each step carries operator-voice narration, an optional
 * action against the DemoEngine, and a completion condition evaluated
 * against the live view. The script is the console port of the kit's proven
 * 90-second demo narration (HOW-TO-RUN-THIS-DEMO), extended with the
 * sovereignty exercise. The AI step accepts either the deterministic
 * signature diagnosis (always available) or a hosted-AI explanation.
 */
import type { DemoEngine } from "@/lib/demo/engine";
import { chamberName } from "@/lib/console/fab";

/** The chamber the scenario exercises — distinct from the seeded auto-fault
 * on etch-03 so the fab already shows one organic excursion. */
export const SCENARIO_TOOL = "etch-05";
export const SCENARIO_FAULT = "he_seal_leak" as const;

export type ScenarioView = {
  engine: DemoEngine;
  /** True once an AI explanation or the deterministic diagnosis for the
   * scenario tool has been shown this session. */
  diagnosisShown: boolean;
};

export type ScenarioStep = {
  title: string;
  body: string;
  /** Label for the step's action button, if the step has one. */
  action?: string;
  run?: (engine: DemoEngine) => void;
  /** Completion condition, evaluated every tick. */
  done: (view: ScenarioView) => boolean;
};

const PM = chamberName(SCENARIO_TOOL);

export const SCENARIO: ScenarioStep[] = [
  {
    title: "Meet the bay",
    body:
      `Six etch chambers scored on-device by the SPC model — the same ` +
      `Hotelling T² / EWMA model the on-prem kit runs on K3s. Steady-state ` +
      `traces are deliberately quiet; ETCH-PM3 already carries a seeded RF ` +
      `match drift. Select any chamber to see its sensors.`,
    done: () => true,
  },
  {
    title: `Simulate: He backside leak on ${PM}`,
    body:
      `Inject a helium backside seal leak — flow rises to hold pressure, ` +
      `electrode temperature drifts. The fab/control topic in the kit; a ` +
      `button here.`,
    action: `Inject leak on ${PM}`,
    run: (engine) => engine.injectFault(SCENARIO_TOOL, SCENARIO_FAULT),
    done: ({ engine }) => engine.activeFault(SCENARIO_TOOL) === SCENARIO_FAULT,
  },
  {
    title: "Watch the excursion",
    body:
      `He flow breaches its control limit, the T² statistic crosses the UCL, ` +
      `EWMA confirms, and health falls with a cycles-to-critical forecast. ` +
      `The alarm list logs the excursion; ${PM} drops out of PRODUCTIVE.`,
    done: ({ engine }) => {
      const v = engine.verdict(SCENARIO_TOOL);
      return Boolean(v && !v.warming && v.health < 65);
    },
  },
  {
    title: "Diagnose",
    body:
      `Read the contribution bars — the model attributes the excursion to ` +
      `specific sensors. The signature diagnosis matches it to the fault ` +
      `library deterministically; AI explain adds remediation direction ` +
      `(on-prem Ollama in the kit; labeled hosted stand-in here).`,
    done: ({ diagnosisShown }) => diagnosisShown,
  },
  {
    title: "Remediate",
    body:
      `Maintenance reseats the seal. Heal the fault and watch health recover ` +
      `and the alarm return to normal — the baseline never re-learns, so ` +
      `recovery is the sensors returning to the learned operating point.`,
    action: `Heal ${PM}`,
    run: (engine) => engine.heal(SCENARIO_TOOL),
    done: ({ engine }) => {
      const v = engine.verdict(SCENARIO_TOOL);
      return (
        engine.activeFault(SCENARIO_TOOL) === null &&
        Boolean(v && v.health > 85)
      );
    },
  },
  {
    title: "Prove the boundary",
    body:
      `Simulate a downstream outage: the SUSE Industrial Edge gateway tier ` +
      `buffers raw frames and flushes on recovery — nothing lost. The egress ` +
      `inspector shows the only payload allowed off-site; in the kit, SUSE ` +
      `Security (NeuVector) enforces that boundary at the network layer.`,
    action: "Simulate outage",
    run: (engine) => engine.setOutage(true),
    done: ({ engine }) => {
      // Complete once an outage has buffered frames AND been restored.
      const g = engine.gatewayStats();
      return !engine.outage && g.buffered > 0 && g.buffer_depth === 0;
    },
  },
];
