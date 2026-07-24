/**
 * Console UI: panels render real engine output with fab vocabulary, and the
 * full Console boots pre-warmed with the guided scenario, ticks, and drives
 * the scenario from the UI (fake timers, no browser).
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Console } from "@/components/console/Console";
import {
  AlarmPanel,
  HealthPanel,
  SovereigntyPanel,
  ToolGrid,
} from "@/components/console/panels";
import { StripChart } from "@/components/console/StripChart";
import { SENSOR_META } from "@/lib/console/fab";
import { DemoEngine } from "@/lib/demo/engine";

function liveEngine() {
  const e = new DemoEngine({ seed: 1234 });
  e.run(220);
  return e;
}

describe("panels", () => {
  it("ToolGrid shows chambers with E10 states and selects on click", () => {
    const e = liveEngine();
    const onSelect = vi.fn();
    render(
      <ToolGrid tools={e.snapshot().tools} selected="etch-03" onSelect={onSelect} />,
    );
    expect(screen.getByText("ETCH-PM3")).toBeInTheDocument();
    expect(screen.getAllByText("PRODUCTIVE").length).toBeGreaterThan(2);
    fireEvent.click(screen.getByText("ETCH-PM1"));
    expect(onSelect).toHaveBeenCalledWith("etch-01");
  });

  it("HealthPanel renders health, T², RUL, attribution, and fault actions", () => {
    const e = liveEngine();
    const v = e.verdict("etch-03")!;
    render(
      <HealthPanel
        verdict={v}
        healthHistory={e.toolHistory("etch-03").map((h) => h.health)}
        activeFault="rf_match_drift"
        onInject={() => {}}
        onHeal={() => {}}
      />,
    );
    expect(screen.getByText(/Hotelling T² \/ EWMA · ETCH-PM3/)).toBeInTheDocument();
    expect(screen.getByText(/RUL forecast/)).toBeInTheDocument();
    expect(screen.getByText(/rf reflected power w/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Heal/ })).toBeInTheDocument();
  });

  it("StripChart shows the latest reading, units, and control limits", () => {
    const e = liveEngine();
    const meta = SENSOR_META.find((m) => m.key === "chamber_pressure_mtorr")!;
    const values = e.toolHistory("etch-01").map((h) => h.sensors[meta.key]);
    render(<StripChart meta={meta} values={values} latestFrame={e.frame} />);
    expect(screen.getByText("Chamber pressure")).toBeInTheDocument();
    expect(screen.getByText("mTorr")).toBeInTheDocument();
    expect(screen.getByText(/UCL 51\.8 · LCL 48\.2/)).toBeInTheDocument();
  });

  it("SovereigntyPanel names the Industrial Edge gateway and NeuVector", () => {
    const e = liveEngine();
    render(
      <SovereigntyPanel
        stats={e.gatewayStats()}
        outage={false}
        onToggleOutage={() => {}}
        egressSample={{ tool_id: "etch-03" }}
      />,
    );
    expect(screen.getByText(/SUSE Industrial Edge gateway/)).toBeInTheDocument();
    expect(screen.getByText(/NeuVector/)).toBeInTheDocument();
    expect(screen.getByText(/forwarded off-site/)).toBeInTheDocument();
  });

  it("AlarmPanel renders unacked excursions bold-first and ACKs", () => {
    const onAck = vi.fn();
    render(
      <AlarmPanel
        alarms={[
          {
            id: 1,
            frame: 210,
            toolId: "etch-05",
            severity: "WARNING",
            kind: "excursion",
            message: "SPC excursion — he backside flow sccm",
            acked: false,
          },
        ]}
        onAck={onAck}
      />,
    );
    expect(screen.getByText(/SPC excursion/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ACK" }));
    expect(onAck).toHaveBeenCalledWith(1);
  });
});

describe("Console (integration, fake timers)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("boots the bay pre-warmed with credibility chip, scenario, and charts", async () => {
    render(<Console />);
    expect(screen.getByText(/FabEdge FDC/)).toBeInTheDocument();
    expect(screen.getByText(/SIMULATED FAB · same SPC model/)).toBeInTheDocument();
    expect(screen.getByText(/Guided scenario/)).toBeInTheDocument();
    expect(screen.getByText("Chamber pressure")).toBeInTheDocument();
    // Seeded degradation on PM3 already alarmed during pre-warm ticks.
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getAllByText(/t=\d+/).length).toBeGreaterThan(0);
  });

  it("runs the scenario's inject step from the sidebar", async () => {
    render(<Console />);
    // Step 1 auto-completes; advance to step 2.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const injectBtn = screen.getByRole("button", {
      name: /Inject leak on ETCH-PM5/,
    });
    fireEvent.click(injectBtn);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    // Selection jumped to the scenario chamber and the heal action appears.
    expect(
      screen.getByText(/Hotelling T² \/ EWMA · ETCH-PM5/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Heal \(He seal leak\)/ })).toBeInTheDocument();
  });
});
