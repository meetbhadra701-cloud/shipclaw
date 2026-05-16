/**
 * ShipClaw — Time-to-Ship Estimator
 * Codex-primary file (X-003). Claude provides this fallback stub.
 *
 * Codex: implement estimateTimeToShip() using visible heuristics.
 * minutes must use MINUTES_PER_* constants from constants.ts.
 * reasons must be human-readable (shown in UI + report).
 */
import type { TimeToShipEstimate, RiskFingerprint } from "../shared/types.js";
import {
  MINUTES_PER_CRITICAL_BLOCKER,
  MINUTES_PER_HIGH_BLOCKER,
  MINUTES_PER_MEDIUM_BLOCKER,
  TIME_BUFFER_MULTIPLIER,
} from "../shared/constants.js";

export interface TimeToShipInput {
  riskFingerprint: RiskFingerprint;
  mode: import("../shared/types.js").RunMode;
}

// ─── STUB — replace with real implementation (Codex X-003) ───────────────────

export function estimateTimeToShip(input: TimeToShipInput): TimeToShipEstimate {
  const { riskFingerprint, mode } = input;

  const criticalCount = riskFingerprint.items.filter((i) => i.severity === "critical").length;
  const highCount = riskFingerprint.items.filter((i) => i.severity === "high").length;
  const mediumCount = riskFingerprint.items.filter((i) => i.severity === "medium").length;

  const baseMin =
    criticalCount * MINUTES_PER_CRITICAL_BLOCKER +
    highCount * MINUTES_PER_HIGH_BLOCKER +
    mediumCount * MINUTES_PER_MEDIUM_BLOCKER;

  const minMinutes = Math.max(30, baseMin);
  const maxMinutes = Math.round(minMinutes * TIME_BUFFER_MULTIPLIER);

  const reasons: string[] = [];
  if (criticalCount > 0) reasons.push(`${criticalCount} critical blocker(s) × ${MINUTES_PER_CRITICAL_BLOCKER}min each`);
  if (highCount > 0) reasons.push(`${highCount} high-severity issue(s) × ${MINUTES_PER_HIGH_BLOCKER}min each`);
  if (mediumCount > 0) reasons.push(`${mediumCount} medium issue(s) × ${MINUTES_PER_MEDIUM_BLOCKER}min each`);
  if (reasons.length === 0) reasons.push("No significant blockers detected — minimal remediation expected");

  return {
    minMinutes,
    maxMinutes,
    reasons,
    heuristic: `blocker-weighted: critical×${MINUTES_PER_CRITICAL_BLOCKER} + high×${MINUTES_PER_HIGH_BLOCKER} + medium×${MINUTES_PER_MEDIUM_BLOCKER} min, buffer ×${TIME_BUFFER_MULTIPLIER}`,
    mode,
  };
}
