/**
 * UI tests for the /demo fab console. ToolCard and the panels are tested as
 * plain components; DemoClient is exercised with fake timers so a real
 * DemoEngine boots, pre-warms, ticks, and responds to fault injection —
 * the whole visitor experience without a browser.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArchitectureXray } from "@/components/demo/ArchitectureXray";
import { GovernancePanel } from "@/components/demo/GovernancePanel";
import { ToolCard } from "@/components/demo/ToolCard";
import { DemoClient } from "@/app/demo/DemoClient";
import { DemoEngine } from "@/lib/demo/engine";
import type { GatewayStats, Verdict } from "@/lib/demo/types";

function liveVerdict(): { verdict: Verdict; history: number[] } {
  const e = new DemoEngine({ seed: 1234 }); // etch-03 auto-degrades
  e.run(220);
  return {
    verdict: e.verdict("etch-03")!,
    history: e.toolHistory("etch-03").map((h) => h.health),
  };
}

describe("ToolCard", () => {
  it("renders a degrading tool: health, state, forecast, attribution, diagnosis", () => {
    const { verdict, history } = liveVerdict();
    render(
      <ToolCard
        verdict={verdict}
        history={history}
        activeFault="rf_match_drift"
        onInject={() => {}}
        onHeal={() => {}}
        onExplain={() => {}}
      />,
    );
    expect(screen.getByText("etch-03")).toBeInTheDocument();
    expect(screen.getByText(String(Math.round(verdict.health)))).toBeInTheDocument();
    expect(screen.getByText(/forecast/)).toBeInTheDocument();
    expect(screen.getByText(/rf reflected power w/)).toBeInTheDocument();
    expect(screen.getByText(/Signature match: RF match drift/)).toBeInTheDocument();
    // A faulted tool offers Heal, not Inject.
    expect(screen.getByRole("button", { name: /Heal/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Inject/ })).toBeNull();
  });

  it("offers one inject button per fault on a healthy tool and wires clicks", () => {
    const e = new DemoEngine({ seed: 1234, autoFaultTool: null });
    e.run(60);
    const onInject = vi.fn();
    render(
      <ToolCard
        verdict={e.verdict("etch-01")!}
        history={e.toolHistory("etch-01").map((h) => h.health)}
        activeFault={null}
        onInject={onInject}
        onHeal={() => {}}
        onExplain={() => {}}
      />,
    );
    const buttons = screen.getAllByRole("button", { name: /Inject/ });
    expect(buttons).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: /Inject Chiller fault/ }));
    expect(onInject).toHaveBeenCalledWith("etch-01", "chiller_fault");
  });
});

describe("GovernancePanel", () => {
  const stats: GatewayStats = {
    raw_ingested: 600,
    normalized_published: 600,
    buffered: 0,
    buffer_depth: 0,
    derived_seen: 600,
    losant_forwarded: 0,
    losant_withheld_airgapped: 600,
    losant_connected: false,
    site: "fab-1",
    line: "etch-bay-A",
  };

  it("shows the air-gapped ledger, outage control, and egress inspector", () => {
    const onToggle = vi.fn();
    render(
      <GovernancePanel
        stats={stats}
        outage={false}
        onToggleOutage={onToggle}
        egressSample={{ tool_id: "etch-03", health: 41.2, state: "WARNING" }}
      />,
    );
    expect(screen.getByText(/Governance boundary — fab-1/)).toBeInTheDocument();
    expect(screen.getByText("withheld (air-gapped)")).toBeInTheDocument();
    expect(screen.getByText("forwarded to cloud")).toBeInTheDocument();
    expect(screen.getByText(/Egress inspector/)).toBeInTheDocument();
    expect(screen.getByText(/"tool_id": "etch-03"/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Simulate downstream outage/ }),
    );
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("shows the buffering state during an outage", () => {
    render(
      <GovernancePanel
        stats={{ ...stats, buffered: 120, buffer_depth: 120 }}
        outage={true}
        onToggleOutage={() => {}}
        egressSample={null}
      />,
    );
    expect(screen.getByText("buffering (outage)")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Restore inference tier/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/offline\s+buffering/)).toBeInTheDocument();
  });
});

describe("ArchitectureXray", () => {
  it("maps every browser tier to a kit tier, production counterpart, and source", () => {
    render(<ArchitectureXray />);
    expect(screen.getByText(/SUSE Industrial Edge \(Losant\)/)).toBeInTheDocument();
    expect(screen.getAllByText(/SUSE AI/).length).toBeGreaterThan(0);
    expect(screen.getByText(/SL Micro \+ K3s\/RKE2/)).toBeInTheDocument();
    // Study map: source files for the model port and the AI stand-in.
    expect(screen.getByText(/health-model\.ts/)).toBeInTheDocument();
    expect(screen.getByText(/_fleet_context/)).toBeInTheDocument();
  });
});

describe("FabAssistant", () => {
  it("sends the derived fleet with the question and renders the reply", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ available: true, reply: "Check etch-03 first." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { FabAssistant } = await import("@/components/demo/FabAssistant");
    render(
      <FabAssistant
        getFleet={() => [
          {
            tool_id: "etch-03",
            health: 40,
            state: "WARNING",
            rul_frames: 12,
            warming: false,
            top_contributors: [],
          },
        ]}
      />,
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "who first?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText("Check etch-03 first.")).toBeInTheDocument();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.fleet[0].tool_id).toBe("etch-03");
    expect(body.messages).toEqual([{ role: "user", content: "who first?" }]);
    vi.unstubAllGlobals();
  });
});

describe("DemoClient (integration, fake timers)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("boots pre-warmed, ticks, and shows the seeded degradation", async () => {
    render(<DemoClient />);
    // Boot effect runs on mount; the fab should be live immediately.
    expect(screen.getByText("etch-01")).toBeInTheDocument();
    expect(screen.getByText(/frames scored/)).toBeInTheDocument();
    expect(screen.getByText(/seed\s*1234/)).toBeInTheDocument();
    // etch-03 was seeded with RF drift well before pre-warm ended.
    expect(screen.getByText(/Signature match: RF match drift/)).toBeInTheDocument();

    const before = screen.getByText(/frames scored/).textContent;
    await act(async () => {
      vi.advanceTimersByTime(2000); // 8 ticks at 4 Hz
    });
    const after = screen.getByText(/frames scored/).textContent;
    expect(after).not.toBe(before);
  });

  it("injects and heals a fault from the UI", async () => {
    render(<DemoClient />);
    screen.getByText("etch-01");
    const inject = screen.getAllByRole("button", { name: /Inject He seal leak/ })[0];
    fireEvent.click(inject);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    const heal = screen.getAllByRole("button", { name: /Heal \(He seal leak\)/ })[0];
    fireEvent.click(heal);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole("button", { name: /Heal \(He seal leak\)/ })).toBeNull();
  });
});
