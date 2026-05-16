/**
 * ShipClaw — Shared Type Contracts
 * Claude-primary file. Do NOT edit without logging in COMMUNICATION_LOG.md.
 * All numeric scores are deterministic and produced BEFORE Nemotron is called.
 */

// ─── Enums / Literals ────────────────────────────────────────────────────────

export type RunMode = "live" | "demo" | "fallback";

export type ScoreStatus = "not_ready" | "risky" | "ready";

export type ScoreBand = "NOT_READY" | "RISKY" | "READY";

export type TaskStatus =
  | "todo"
  | "in-progress"
  | "blocked"
  | "needs-review"
  | "complete"
  | "dropped";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type ReleaseDecision = "ship" | "hold" | "unknown";

// ─── Score primitives ─────────────────────────────────────────────────────────

export interface ScoreCategory {
  name: string;
  weight: number;       // 0–1, all weights must sum to 1
  rawScore: number;     // 0–100
  weightedScore: number;
  evidence: string[];   // human-readable reasons
  pass: boolean;
}

/**
 * ReadinessScore — fully deterministic, produced by src/agent/scorer.ts
 * BEFORE Nemotron is called. Nemotron reads this but never modifies it.
 */
export interface ReadinessScore {
  readonly deterministic: true;
  total: number;          // 0–100 numeric, computed from weighted categories
  band: ScoreBand;
  status: ScoreStatus;
  categories: ScoreCategory[];
  mode: RunMode;
  computedAt: string;     // ISO timestamp
}

// ─── Risk Fingerprint ─────────────────────────────────────────────────────────

export interface RiskItem {
  signal: string;
  severity: "critical" | "high" | "medium" | "low";
  detail: string;
  fromMemory: boolean;
}

/**
 * RiskFingerprint — uses ACTUAL memory when available.
 * basedOnMemory=false means no prior runs exist — do NOT imply data.
 */
export interface RiskFingerprint {
  items: RiskItem[];
  basedOnMemory: boolean;
  memoryGenerationCount: number;   // how many prior runs informed this
  generatedAt: string;
}

// ─── Time-to-Ship ─────────────────────────────────────────────────────────────

export interface TimeToShipEstimate {
  minMinutes: number;
  maxMinutes: number;
  reasons: string[];       // visible heuristic reasons shown in UI + report
  heuristic: string;       // short label, e.g. "blocker-count × 20min"
  mode: RunMode;
}

// ─── Approvals ────────────────────────────────────────────────────────────────

export interface Approval {
  id: string;
  runId: string;
  actionDescription: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  status: ApprovalStatus;
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: "human" | "auto";
}

// ─── External Evidence ────────────────────────────────────────────────────────

export interface ExternalEvidence {
  source: "exa";
  query: string;
  snippet: string;
  url: string;
  relevanceScore: number;
  fetchedAt: string;
}

// ─── Observations ─────────────────────────────────────────────────────────────

export interface Observation {
  category: string;
  signal: string;
  value: string | number | boolean;
  weight: number;
  source: "github" | "repo_scan" | "shell" | "memory" | "manual";
}

// ─── Public Plan ──────────────────────────────────────────────────────────────

/** Public plan — shown in UI; never contains hidden chain-of-thought */
export interface PublicPlan {
  goal: string;
  steps: string[];
  estimatedSteps: number;
  constraints: string[];   // e.g. "Exa disabled", "Demo mode", "Auto-approve local"
}

// ─── Memory ───────────────────────────────────────────────────────────────────

export interface MemoryChange {
  key: string;
  before: string | null;
  after: string | null;
  changeType: "added" | "updated" | "removed" | "unchanged";
}

export interface MemorySnapshot {
  runId: string;
  capturedAt: string;
  items: Array<{ key: string; value: string; updatedAt: string }>;
}

// ─── Agent Events ─────────────────────────────────────────────────────────────

type EventBase = { runId: string; ts: string };

export type AgentEvent =
  | (EventBase & { type: "goal_received"; goal: string })
  | (EventBase & { type: "memory_loaded"; itemCount: number; basedOnMemory: boolean })
  | (EventBase & { type: "plan_created"; plan: PublicPlan })
  | (EventBase & { type: "tool_call_started"; tool: string; args: Record<string, unknown> })
  | (EventBase & { type: "tool_call_finished"; tool: string; durationMs: number; success: boolean })
  | (EventBase & { type: "readiness_score_calculated"; score: ReadinessScore })
  | (EventBase & { type: "risk_fingerprint_created"; fingerprint: RiskFingerprint })
  | (EventBase & { type: "time_to_ship_estimated"; estimate: TimeToShipEstimate })
  | (EventBase & { type: "external_evidence_status"; enabled: boolean; count: number })
  | (EventBase & { type: "approval_requested"; approval: Approval })
  | (EventBase & { type: "approval_resolved"; approval: Approval })
  | (EventBase & { type: "memory_updated"; changes: MemoryChange[] })
  | (EventBase & { type: "final_result"; decision: ReleaseDecision; score: ReadinessScore; assessorOutput: AssessorOutput | null });

// ─── Nemotron Assessor Output ─────────────────────────────────────────────────

/**
 * AssessorOutput — Nemotron's explanation of the deterministic score.
 * It NEVER contains a new numeric score field. decision is always
 * derived from whether total >= threshold; Nemotron only names "ship"/"hold"
 * after reading the pre-computed score.
 */
export interface AssessorOutput {
  decision: ReleaseDecision;
  confidence: number;          // 0–1
  explanation: string;
  blockers: string[];
  recommendedActions: string[];
  uncertaintyNotes: string[];
  mode: RunMode;               // "fallback" means LLM was not used
}

// ─── Run ──────────────────────────────────────────────────────────────────────

export type RunStatus =
  | "initializing"
  | "running"
  | "awaiting_approval"
  | "finalizing"
  | "complete"
  | "error";

export interface Run {
  id: string;
  goal: string;
  repo: string;              // URL or local path
  mode: RunMode;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  readinessScore?: ReadinessScore;
  riskFingerprint?: RiskFingerprint;
  timeToShip?: TimeToShipEstimate;
  assessorOutput?: AssessorOutput;
  finalDecision?: ReleaseDecision;
  artifactDir?: string;      // path to runs/<runId>/
  errorMessage?: string;
}
