/**
 * ShipClaw — Shared Constants
 * Claude-primary file.
 */

// ─── Run Modes ────────────────────────────────────────────────────────────────
export const MODE_DEMO = "demo" as const;
export const MODE_LIVE = "live" as const;
export const MODE_FALLBACK = "fallback" as const;

// ─── Pure heuristics (shared with the UI) ─────────────────────────────────────
import {
  SCORE_BAND_THRESHOLDS,
  SCORE_WEIGHTS,
  MINUTES_PER_CRITICAL_BLOCKER,
  MINUTES_PER_HIGH_BLOCKER,
  MINUTES_PER_MEDIUM_BLOCKER,
  TIME_BUFFER_MULTIPLIER,
  type ScoreCategoryName,
} from "./heuristics.js";

export {
  SCORE_BAND_THRESHOLDS,
  SCORE_WEIGHTS,
  MINUTES_PER_CRITICAL_BLOCKER,
  MINUTES_PER_HIGH_BLOCKER,
  MINUTES_PER_MEDIUM_BLOCKER,
  TIME_BUFFER_MULTIPLIER,
};
export type { ScoreCategoryName };

// ─── Score Bands ──────────────────────────────────────────────────────────────
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

// ─── Agent Event Types ────────────────────────────────────────────────────────
export const EVENT_TYPES = [
  "state_entered",
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

// ─── Exa ──────────────────────────────────────────────────────────────────────
export const EXA_MAX_SEARCHES_PER_RUN =
  parseInt(process.env["EXA_MAX_SEARCHES_PER_RUN"] ?? "3", 10);
export const EXA_ENABLED =
  process.env["EXA_ENABLED"] === "true" || process.env["ENABLE_EXA"] === "true";
export const EXA_TIMEOUT_MS =
  parseInt(process.env["EXA_TIMEOUT_MS"] ?? "8000", 10);

// ─── Fallback Labels ──────────────────────────────────────────────────────────
export const FALLBACK_BANNER =
  "Deterministic explanation fallback — no model confidence. Evidence source is recorded separately.";

export const DEMO_BANNER =
  "DEMO MODE — Synthetic sample evidence. No GitHub requests or repository execution.";
