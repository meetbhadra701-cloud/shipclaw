/**
 * ShipClaw — Deterministic Readiness Scorer
 * Codex-primary file (X-002). Claude provides this fallback stub.
 *
 * Codex: implement calculateReadinessScore() using SCORE_WEIGHTS from constants.ts.
 * Each category must produce a ScoreCategory with evidence[].
 * total = sum(category.rawScore * category.weight).
 * Do NOT call Nemotron here. Do NOT use LLM for the score.
 * Log any interface changes in COMMUNICATION_LOG.md before editing types.ts.
 */
import type { ReadinessScore, Observation } from "../shared/types.js";
import {
  SCORE_WEIGHTS,
  getScoreBand,
  getScoreStatus,
  FALLBACK_BANNER,
  type ScoreCategoryName,
} from "../shared/constants.js";

export interface ScorerInput {
  observations: Observation[];
  runId: string;
  mode: import("../shared/types.js").RunMode;
}

// ─── STUB — replace with real implementation (Codex X-002) ───────────────────

export function calculateReadinessScore(input: ScorerInput): ReadinessScore {
  const now = new Date().toISOString();
  const isFallback = input.mode !== "live";

  if (isFallback) {
    // Synthetic demo score — clearly labeled, matches non-negotiable rule #9
    const categories = (Object.keys(SCORE_WEIGHTS) as ScoreCategoryName[]).map(
      (name) => {
        const rawScore = name === "ci_health" ? 40 : name === "test_coverage" ? 50 : 70;
        const weight = SCORE_WEIGHTS[name];
        return {
          name,
          weight,
          rawScore,
          weightedScore: rawScore * weight,
          evidence: [`[SYNTHETIC] ${name} — demo data only`],
          pass: rawScore >= 60,
        };
      }
    );

    const total = Math.round(
      categories.reduce((sum, c) => sum + c.weightedScore, 0)
    );

    return {
      deterministic: true,
      total,
      band: getScoreBand(total),
      status: getScoreStatus(total),
      categories,
      mode: "fallback",
      computedAt: now,
    };
  }

  // Live mode: Codex implements this using real observations
  // TODO(Codex X-002): replace stub with real scoring logic
  const categories = (Object.keys(SCORE_WEIGHTS) as ScoreCategoryName[]).map(
    (name) => {
      const relevant = input.observations.filter((o) => o.category === name);
      const rawScore =
        relevant.length > 0
          ? Math.min(100, Math.round(relevant.reduce((s, o) => s + Number(o.value), 0) / relevant.length))
          : 50;
      const weight = SCORE_WEIGHTS[name];
      return {
        name,
        weight,
        rawScore,
        weightedScore: rawScore * weight,
        evidence: relevant.map((o) => `${o.signal}: ${String(o.value)}`),
        pass: rawScore >= 60,
      };
    }
  );

  const total = Math.round(
    categories.reduce((sum, c) => sum + c.weightedScore, 0)
  );

  return {
    deterministic: true,
    total,
    band: getScoreBand(total),
    status: getScoreStatus(total),
    categories,
    mode: input.mode,
    computedAt: now,
  };
}

export { FALLBACK_BANNER };
