/**
 * ShipClaw — Shared Constants
 * Claude-primary file.
 */

// ─── Run Modes ────────────────────────────────────────────────────────────────
export const MODE_DEMO = "demo" as const;
export const MODE_LIVE = "live" as const;
export const MODE_FALLBACK = "fallback" as const;

// ─── Score Bands ──────────────────────────────────────────────────────────────
export const SCORE_BAND_THRESHOLDS = {
  NOT_READY: { min: 0, max: 40 },
  RISKY: { min: 41, max: 70 },
  READY: { min: 71, max: 100 },
} as const;

export function getScoreBand(total: number): import("./types.js").ScoreBand {
  if (total <= SCORE_BAND_THRESHOLDS.NOT_READY.max) return "NOT_READY";
  if (total <= SCORE_BAND_THRESHOLDS.RISKY.max) return "RISKY";
  return "READY";
}

export function getScoreStatus(total: number): import("./types.js").ScoreStatus {
  if (total <= SCORE_BAND_THRESHOLDS.NOT_READY.max) return "not_ready";
  if (total <= SCORE_BAND_THRESHOLDS.RISKY.max) return "risky";
  return "ready";
}

// ─── Score Category Weights ───────────────────────────────────────────────────
// Must sum to 1.0. Codex scorer must use these weights exactly.
export const SCORE_WEIGHTS = {
  ci_health: 0.25,
  test_coverage: 0.20,
  open_blockers: 0.20,
  documentation: 0.15,
  security: 0.10,
  dependency_freshness: 0.10,
} as const;

export type ScoreCategoryName = keyof typeof SCORE_WEIGHTS;

// ─── Agent Event Types ────────────────────────────────────────────────────────
export const EVENT_TYPES = [
  "goal_received",
  "memory_loaded",
  "plan_created",
  "tool_call_started",
  "tool_call_finished",
  "readiness_score_calculated",
  "risk_fingerprint_created",
  "time_to_ship_estimated",
  "external_evidence_status",
  "approval_requested",
  "approval_resolved",
  "memory_updated",
  "final_result",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

// ─── Server ───────────────────────────────────────────────────────────────────
export const SERVER_PORT = parseInt(process.env["PORT"] ?? "8787", 10);
export const VITE_PORT = 5173;

// ─── Time-to-Ship Heuristics ──────────────────────────────────────────────────
/** Minutes per critical blocker (used by Codex timeToShip impl) */
export const MINUTES_PER_CRITICAL_BLOCKER = 120;
/** Minutes per high-severity blocker */
export const MINUTES_PER_HIGH_BLOCKER = 45;
/** Minutes per medium blocker */
export const MINUTES_PER_MEDIUM_BLOCKER = 20;
/** Buffer multiplier for range max */
export const TIME_BUFFER_MULTIPLIER = 1.5;

// ─── Exa ──────────────────────────────────────────────────────────────────────
export const EXA_MAX_SEARCHES_PER_RUN =
  parseInt(process.env["EXA_MAX_SEARCHES_PER_RUN"] ?? "3", 10);
export const EXA_ENABLED =
  process.env["EXA_ENABLED"] === "true" || process.env["ENABLE_EXA"] === "true";
export const EXA_TIMEOUT_MS =
  parseInt(process.env["EXA_TIMEOUT_MS"] ?? "8000", 10);

// ─── Fallback Labels ──────────────────────────────────────────────────────────
export const FALLBACK_BANNER =
  "⚠️  SYNTHETIC FALLBACK MODE — Score and evidence are illustrative. " +
  "Run with DEMO_MODE=false and a real NEMOTRON_API_KEY for live analysis.";

export const DEMO_BANNER =
  "🔬 DEMO MODE — Using fixture data instead of live GitHub/shell calls.";
