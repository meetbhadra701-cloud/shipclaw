import { describe, expect, it } from "vitest";
import type { AgentEvent, AgentState } from "../../shared/types.js";
import { AGENT_STATES } from "../../shared/types.js";
import { deriveRun } from "./derive.js";
import { formatMinutes, parseEvidence, shortRepo, weakEvidence } from "./format.js";

const runId = "r1";
const at = (ms: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, ms)).toISOString();
const enter = (state: AgentState, ms: number): AgentEvent => ({ type: "state_entered", runId, ts: at(ms), state });

describe("deriveRun", () => {
  it("marks the latest entered state active while the run is in progress", () => {
    const d = deriveRun([enter("INIT", 0), enter("LOAD_MEMORY", 5), enter("PLAN", 9)]);
    expect(d.activeState).toBe("PLAN");
    expect(d.stages.find((s) => s.state === "INIT")?.status).toBe("done");
    expect(d.stages.find((s) => s.state === "INIT")?.durationMs).toBe(5);
    expect(d.stages.find((s) => s.state === "PLAN")?.status).toBe("active");
    expect(d.stages.find((s) => s.state === "FINALIZE")?.status).toBe("pending");
    expect(d.final).toBeNull();
  });

  it("marks states the loop jumped over as skipped once later states are entered", () => {
    const states = AGENT_STATES.filter((s) => s !== "WAIT_FOR_APPROVAL");
    const events = states.map((s, i) => enter(s, i));
    const d = deriveRun(events);
    expect(d.stages.find((s) => s.state === "WAIT_FOR_APPROVAL")?.status).toBe("skipped");
  });

  it("completes every entered stage and reports real elapsed time on final_result", () => {
    const score = {
      deterministic: true as const, total: 55, band: "RISKY" as const, status: "risky" as const,
      categories: [], mode: "demo" as const, computedAt: at(0),
    };
    const events: AgentEvent[] = [
      ...AGENT_STATES.map((s, i) => enter(s, i * 2)),
      { type: "final_result", runId, ts: at(40), decision: "hold", score, assessorOutput: null },
    ];
    const d = deriveRun(events);
    expect(d.stages.every((s) => s.status === "done")).toBe(true);
    expect(d.activeState).toBeNull();
    expect(d.elapsedMs).toBe(40);
    expect(d.final?.decision).toBe("hold");
  });

  it("pairs tool call start/finish events", () => {
    const d = deriveRun([
      { type: "tool_call_started", runId, ts: at(0), tool: "shell.runSafeCommand", args: { command: "npm test" } },
      { type: "tool_call_finished", runId, ts: at(3), tool: "shell.runSafeCommand", durationMs: 3, success: true },
    ]);
    expect(d.toolCalls).toEqual([{ tool: "shell.runSafeCommand", args: { command: "npm test" }, durationMs: 3, success: true }]);
  });

  it("falls back to event-based progress for runs recorded without state_entered", () => {
    const d = deriveRun([
      { type: "goal_received", runId, ts: at(0), goal: "g" },
      { type: "memory_loaded", runId, ts: at(1), itemCount: 0, basedOnMemory: false },
    ]);
    expect(d.activeState).toBe("LOAD_MEMORY");
    expect(d.stages[0]?.status).toBe("done");
  });
});

describe("format helpers", () => {
  it("parses scorer evidence strings, including signals with spaces", () => {
    expect(parseEvidence("shell ci_health.npm run typecheck=failing -> 40/100")).toMatchObject({
      kind: "observation", source: "shell", category: "ci_health", signal: "npm run typecheck", value: "failing", score: 40,
    });
    expect(parseEvidence("No dependency_freshness observations found; using conservative default score 50.").kind).toBe("default");
  });

  it("selects the observations that pulled a category below the pass bar", () => {
    const weak = weakEvidence([
      "repo_scan documentation.has_readme=true -> 100/100",
      "repo_scan documentation.has_changelog=false -> 40/100",
    ]);
    expect(weak).toHaveLength(1);
    expect(weak[0]).toMatchObject({ signal: "has_changelog" });
  });

  it("formats minutes and repositories", () => {
    expect(formatMinutes(105)).toBe("1h 45m");
    expect(formatMinutes(158)).toBe("2h 38m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(120)).toBe("2h");
    expect(shortRepo("https://github.com/acme/payments-api.git")).toBe("acme/payments-api");
    expect(shortRepo("fixtures/demo")).toBe("fixtures/demo");
  });
});
