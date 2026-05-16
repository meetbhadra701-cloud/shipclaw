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
  type ScoreCategoryName,
} from "../shared/constants.js";

export interface ScorerInput {
  observations: Observation[];
  runId: string;
  mode: import("../shared/types.js").RunMode;
}

export function calculateReadinessScore(input: ScorerInput): ReadinessScore {
  const now = new Date().toISOString();
  const categories = (Object.keys(SCORE_WEIGHTS) as ScoreCategoryName[]).map(
    (name) => {
      const relevant = input.observations.filter((o) => o.category === name);
      const scored = relevant.map(scoreObservation);
      const rawScore = scored.length > 0
        ? Math.round(scored.reduce((sum, item) => sum + item.score, 0) / scored.length)
        : 50;
      const weight = SCORE_WEIGHTS[name];
      return {
        name,
        weight,
        rawScore,
        weightedScore: rawScore * weight,
        evidence: scored.length > 0
          ? scored.map((item) => item.evidence)
          : [`No ${name} observations found; using conservative default score 50.`],
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

function scoreObservation(observation: Observation): { score: number; evidence: string } {
  const signal = observation.signal;
  const value = observation.value;
  const normalized = String(value).toLowerCase();
  const numeric = Number(value);
  let score: number;

  switch (signal) {
    case "ci_passing":
    case "has_readme":
    case "no_alerts":
    case "up_to_date":
      score = truthyScore(value);
      break;
    case "ci_status":
    case "npm run typecheck":
    case "npm test":
      score = statusScore(normalized);
      break;
    case "last_workflow_run":
      score = normalized === "success" ? 100 : normalized === "failure" ? 0 : 50;
      break;
    case "test_files_found":
    case "test_file_count":
    case "test_files":
      score = testFileCountScore(numeric);
      break;
    case "coverage_percent":
      score = Number.isFinite(numeric) ? clamp(numeric) : 50;
      break;
    case "open_critical_issues":
      score = countPenalty(numeric, 35);
      break;
    case "open_prs_without_review":
    case "open_prs":
      score = countPenalty(numeric, 25);
      break;
    case "open_issues":
      score = countPenalty(numeric, 15);
      break;
    case "changelog_exists":
    case "has_changelog":
      score = truthyScore(value);
      if (!truthy(value)) score = 40;
      break;
    case "env_secrets_exposed":
      score = truthy(value) ? 0 : 100;
      break;
    case "has_security_policy":
      score = truthy(value) ? 100 : 50;
      break;
    case "dependabot_alerts":
      score = countPenalty(numeric, 20);
      break;
    case "outdated_major":
      score = countPenalty(numeric, 30);
      break;
    default:
      score = genericScore(value);
      break;
  }

  return {
    score,
    evidence: `${observation.source} ${observation.category}.${signal}=${String(value)} -> ${score}/100`,
  };
}

function genericScore(value: Observation["value"]): number {
  if (typeof value === "boolean") return value ? 100 : 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return clamp(numeric);
  const normalized = String(value).toLowerCase();
  if (normalized === "passing" || normalized === "success") return 100;
  if (normalized === "failing" || normalized === "failure") return 40;
  return truthy(value) ? 100 : 0;
}

function truthyScore(value: Observation["value"]): number {
  return truthy(value) ? 100 : 0;
}

function truthy(value: Observation["value"]): boolean {
  return value === true || String(value).toLowerCase() === "true" || String(value).toLowerCase() === "success";
}

function countPenalty(value: number, penalty: number): number {
  if (!Number.isFinite(value)) return 50;
  return clamp(100 - Math.max(0, value) * penalty);
}

function statusScore(value: string): number {
  if (value === "passing" || value === "success" || value === "true") return 100;
  if (value === "failing" || value === "failure" || value === "false") return 40;
  return 50;
}

function testFileCountScore(value: number): number {
  if (!Number.isFinite(value)) return 50;
  if (value <= 0) return 0;
  if (value <= 2) return 30;
  if (value <= 5) return 55;
  if (value <= 9) return 75;
  return 90;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
