/**
 * ShipClaw — Pure scoring/estimation constants.
 * No process.env access here: this module is imported by both the server and the browser UI,
 * so the numbers the UI explains are the exact numbers the agent uses.
 */

// ─── Score Bands ──────────────────────────────────────────────────────────────
export const SCORE_BAND_THRESHOLDS = {
  NOT_READY: { min: 0, max: 40 },
  RISKY: { min: 41, max: 70 },
  READY: { min: 71, max: 100 },
} as const;

/** SHIP also requires all weighted categories measured (decisionForScore). */
export const SHIP_THRESHOLD = SCORE_BAND_THRESHOLDS.READY.min;

/** A category passes at rawScore >= CATEGORY_PASS_THRESHOLD (mirrors scorer.ts) */
export const CATEGORY_PASS_THRESHOLD = 60;

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

// ─── Time-to-Ship Heuristics ──────────────────────────────────────────────────
/** Minutes per critical blocker (used by Codex timeToShip impl) */
export const MINUTES_PER_CRITICAL_BLOCKER = 120;
/** Minutes per high-severity blocker */
export const MINUTES_PER_HIGH_BLOCKER = 45;
/** Minutes per medium blocker */
export const MINUTES_PER_MEDIUM_BLOCKER = 20;
/** Buffer multiplier for range max */
export const TIME_BUFFER_MULTIPLIER = 1.5;
