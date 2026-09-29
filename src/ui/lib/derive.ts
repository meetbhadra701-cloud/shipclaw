/**
 * deriveRun — turns the agent's SSE event stream into view state.
 * Pure and deterministic so it can be unit-tested and re-run on replayed history.
 */
import {
  AGENT_STATES,
  type AgentEvent,
  type AgentState,
  type Approval,
  type AssessorOutput,
  type MemoryChange,
  type PublicPlan,
  type RepositoryEvidence,
  type ReadinessScore,
  type ReleaseDecision,
  type RiskFingerprint,
  type TimeToShipEstimate,
} from "../../shared/types.js";

export type StageStatus = "done" | "active" | "pending" | "skipped";

export interface Stage {
  state: AgentState;
  status: StageStatus;
  enteredAt: string | null;
  durationMs: number | null;
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  durationMs: number | null;
  success: boolean | null;
}

export interface DerivedRun {
  evidence: RepositoryEvidence | null;
  goal: string | null;
  memoryLoaded: { itemCount: number; basedOnMemory: boolean } | null;
  plan: PublicPlan | null;
  toolCalls: ToolCall[];
  score: ReadinessScore | null;
  fingerprint: RiskFingerprint | null;
  timeToShip: TimeToShipEstimate | null;
  externalEvidence: { enabled: boolean; count: number } | null;
  approval: Approval | null;
  memoryChanges: MemoryChange[] | null;
  final: { decision: ReleaseDecision; assessorOutput: AssessorOutput | null } | null;
  stages: Stage[];
  activeState: AgentState | null;
  /** Wall-clock time the agent took, from first to last event (real timestamps). */
  elapsedMs: number | null;
}

/** Legacy mapping for runs recorded before `state_entered` existed. */
function legacyStateFor(e: AgentEvent): AgentState | null {
  switch (e.type) {
    case "goal_received": return "INIT";
    case "memory_loaded": return "LOAD_MEMORY";
    case "plan_created": return "PLAN";
    case "tool_call_started":
    case "tool_call_finished":
      if (e.tool.startsWith("github")) return "FETCH_GITHUB_DATA";
      if (e.tool.startsWith("repo")) return "SCAN_REPO";
      return "RUN_SAFE_CHECKS";
    case "readiness_score_calculated": return "CALCULATE_SCORE";
    case "risk_fingerprint_created": return "BUILD_RISK_FINGERPRINT";
    case "time_to_ship_estimated": return "ESTIMATE_TIME_TO_SHIP";
    case "external_evidence_status": return "OPTIONAL_EXA_EXTERNAL_EVIDENCE";
    case "approval_requested": return "PROPOSE_ACTIONS";
    case "approval_resolved": return "RECORD_REVIEW";
    case "memory_updated": return "UPDATE_MEMORY";
    case "final_result": return "FINALIZE";
    default: return null;
  }
}

export function deriveRun(events: AgentEvent[]): DerivedRun {
  const out: DerivedRun = {
    evidence: null,
    goal: null,
    memoryLoaded: null,
    plan: null,
    toolCalls: [],
    score: null,
    fingerprint: null,
    timeToShip: null,
    externalEvidence: null,
    approval: null,
    memoryChanges: null,
    final: null,
    stages: [],
    activeState: null,
    elapsedMs: null,
  };

  const entered = new Map<AgentState, string>();
  let legacyMax = -1;

  for (const e of events) {
    switch (e.type) {
      case "state_entered":
        if (!entered.has(e.state)) entered.set(e.state, e.ts);
        break;
      case "repository_evidence": out.evidence = e.evidence; break;
      case "goal_received": out.goal = e.goal; break;
      case "memory_loaded": out.memoryLoaded = { itemCount: e.itemCount, basedOnMemory: e.basedOnMemory }; break;
      case "plan_created": out.plan = e.plan; break;
      case "tool_call_started":
        out.toolCalls.push({ tool: e.tool, args: e.args, durationMs: null, success: null });
        break;
      case "tool_call_finished": {
        const open = [...out.toolCalls].reverse().find((c) => c.tool === e.tool && c.success === null);
        if (open) { open.durationMs = e.durationMs; open.success = e.success; }
        else out.toolCalls.push({ tool: e.tool, args: {}, durationMs: e.durationMs, success: e.success });
        break;
      }
      case "readiness_score_calculated": out.score = e.score; break;
      case "risk_fingerprint_created": out.fingerprint = e.fingerprint; break;
      case "time_to_ship_estimated": out.timeToShip = e.estimate; break;
      case "external_evidence_status": out.externalEvidence = { enabled: e.enabled, count: e.count }; break;
      case "approval_requested": out.approval = e.approval; break;
      case "approval_resolved": out.approval = e.approval; break;
      case "memory_updated": out.memoryChanges = e.changes; break;
      case "final_result": out.final = { decision: e.decision, assessorOutput: e.assessorOutput }; break;
    }
    const legacy = legacyStateFor(e);
    if (legacy) legacyMax = Math.max(legacyMax, AGENT_STATES.indexOf(legacy));
  }

  const complete = out.final !== null;
  const lastEvent = [...events].reverse().find(e => e.type === "final_result") ?? events[events.length - 1];

  if (entered.size > 0) {
    // Precise path: every state announces itself with a timestamp.
    const enteredStates = AGENT_STATES.filter((s) => entered.has(s));
    const lastEntered = enteredStates[enteredStates.length - 1] ?? null;
    out.stages = AGENT_STATES.map((state) => {
      const at = entered.get(state) ?? null;
      if (!at) {
        const passed = lastEntered !== null && AGENT_STATES.indexOf(state) < AGENT_STATES.indexOf(lastEntered);
        return { state, status: passed ? "skipped" : "pending", enteredAt: null, durationMs: null };
      }
      const nextAt = enteredStates
        .slice(enteredStates.indexOf(state) + 1)
        .map((s) => entered.get(s))
        .find((t): t is string => !!t);
      const endAt = nextAt ?? (complete && lastEvent ? lastEvent.ts : null);
      const durationMs = endAt ? Math.max(0, Date.parse(endAt) - Date.parse(at)) : null;
      const status: StageStatus = state === lastEntered && !complete ? "active" : "done";
      return { state, status, enteredAt: at, durationMs };
    });
    out.activeState = complete ? null : lastEntered;
  } else {
    out.stages = AGENT_STATES.map((state, i) => ({
      state,
      status: complete || i < legacyMax ? "done" : i === legacyMax ? "active" : "pending",
      enteredAt: null,
      durationMs: null,
    }));
    out.activeState = complete || legacyMax < 0 ? null : AGENT_STATES[legacyMax] ?? null;
  }

  const first = events[0];
  if (first && lastEvent && complete) out.elapsedMs = Math.max(0, Date.parse(lastEvent.ts) - Date.parse(first.ts));

  return out;
}

// ─── Workflow phases (presentation grouping of the 17 states) ────────────────

export interface Phase {
  id: string;
  title: string;
  states: AgentState[];
}

export const PHASES: Phase[] = [
  { id: "prepare", title: "Prepare", states: ["INIT", "LOAD_MEMORY", "PLAN"] },
  { id: "collect", title: "Collect evidence", states: ["FETCH_GITHUB_DATA", "SCAN_REPO", "RUN_SAFE_CHECKS"] },
  {
    id: "analyze",
    title: "Deterministic analysis",
    states: ["CALCULATE_SCORE", "BUILD_RISK_FINGERPRINT", "ESTIMATE_TIME_TO_SHIP", "OPTIONAL_EXA_EXTERNAL_EVIDENCE"],
  },
  { id: "explain", title: "AI explanation", states: ["ASSESS_WITH_NEMOTRON"] },
  { id: "control", title: "Proposal review", states: ["PROPOSE_ACTIONS", "RECORD_REVIEW", "COMPLETE_READ_ONLY"] },
  { id: "record", title: "Record", states: ["UPDATE_MEMORY", "WRITE_ARTIFACTS", "FINALIZE"] },
];

export const STATE_LABEL: Record<AgentState, { done: string; active: string }> = {
  INIT: { done: "Goal received", active: "Receiving goal" },
  LOAD_MEMORY: { done: "Memory loaded", active: "Loading memory" },
  PLAN: { done: "Plan created", active: "Planning" },
  FETCH_GITHUB_DATA: { done: "Repository metadata collected", active: "Collecting repository metadata" },
  SCAN_REPO: { done: "Repository files scanned", active: "Scanning repository files" },
  RUN_SAFE_CHECKS: { done: "Execution checks unmeasured", active: "Recording unmeasured checks" },
  CALCULATE_SCORE: { done: "Readiness score calculated", active: "Calculating readiness score" },
  BUILD_RISK_FINGERPRINT: { done: "Release risks identified", active: "Identifying release risks" },
  ESTIMATE_TIME_TO_SHIP: { done: "Time to ship estimated", active: "Estimating time to ship" },
  OPTIONAL_EXA_EXTERNAL_EVIDENCE: { done: "External evidence checked", active: "Checking external evidence" },
  ASSESS_WITH_NEMOTRON: { done: "Explanation generated", active: "Explaining the score" },
  PROPOSE_ACTIONS: { done: "Actions proposed", active: "Proposing actions" },
  RECORD_REVIEW: { done: "Review request recorded", active: "Recording review request" },
  COMPLETE_READ_ONLY: { done: "Read-only analysis confirmed", active: "Completing read-only analysis" },
  UPDATE_MEMORY: { done: "Memory updated", active: "Updating memory" },
  WRITE_ARTIFACTS: { done: "Report and artifacts written", active: "Writing report and artifacts" },
  FINALIZE: { done: "Verdict finalized", active: "Finalizing verdict" },
};
