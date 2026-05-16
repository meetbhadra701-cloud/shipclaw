/**
 * ShipClaw — Nemotron Prompt Contract
 * Claude-primary file. All prompts sent to Nemotron are defined here.
 *
 * INVARIANT: Nemotron receives a deterministic score object.
 *            Nemotron NEVER returns a new numeric score.
 *            Nemotron returns ONLY: decision, confidence, explanation,
 *            blockers, recommendedActions, uncertaintyNotes.
 */
import type { ReadinessScore, RiskFingerprint, TimeToShipEstimate, ExternalEvidence } from "../shared/types.js";
import { FALLBACK_BANNER } from "../shared/constants.js";

// ─── System Prompt ────────────────────────────────────────────────────────────

export const ASSESSOR_SYSTEM_PROMPT = `You are ShipClaw's release-readiness explainer.

Your ONLY job is to explain a deterministic release-readiness score that has already been computed. You do NOT invent, recalculate, or modify the numeric score. The score is final before you are called.

Rules:
1. NEVER return a field called "score", "total", "numeric_score", or any variant.
2. Your "decision" field must be "ship" if the provided score.total >= 71, and "hold" if it is < 71. Do not override this threshold.
3. Return ONLY valid JSON matching the schema below. No markdown, no prose outside the JSON.
4. Do NOT expose internal reasoning steps. Provide concise public-facing explanations only.
5. Keep "explanation" under 120 words. Each blocker under 60 words.
6. If you are uncertain, say so in "uncertaintyNotes" — do not invent facts.

Output schema (return this exact JSON, no extra fields):
{
  "decision": "ship" | "hold",
  "confidence": <number 0-1>,
  "explanation": "<string>",
  "blockers": ["<string>", ...],
  "recommendedActions": ["<string>", ...],
  "uncertaintyNotes": ["<string>", ...]
}`;

// ─── User Prompt Builder ──────────────────────────────────────────────────────

export interface AssessorContext {
  score: ReadinessScore;
  riskFingerprint: RiskFingerprint;
  timeToShip: TimeToShipEstimate;
  evidence?: ExternalEvidence[];
  goal: string;
  repo: string;
}

export function buildAssessorUserPrompt(ctx: AssessorContext): string {
  const { score, riskFingerprint, timeToShip, evidence, goal, repo } = ctx;

  const categorySummary = score.categories
    .map(
      (c) =>
        `  - ${c.name}: ${c.rawScore}/100 (weight ${(c.weight * 100).toFixed(0)}%) — ${c.pass ? "PASS" : "FAIL"}` +
        (c.evidence.length ? `\n    Evidence: ${c.evidence.slice(0, 2).join("; ")}` : "")
    )
    .join("\n");

  const riskSummary = riskFingerprint.items
    .slice(0, 5)
    .map((r) => `  [${r.severity.toUpperCase()}] ${r.signal}: ${r.detail}`)
    .join("\n");

  const evidenceSummary =
    evidence && evidence.length > 0
      ? evidence
          .slice(0, 3)
          .map((e) => `  - ${e.snippet} (${e.url})`)
          .join("\n")
      : "  None available.";

  return `Explain the release-readiness assessment below. Do not change the score.

GOAL: ${goal}
REPO: ${repo}

DETERMINISTIC SCORE (computed before this call — do NOT modify):
  Total: ${score.total}/100
  Band: ${score.band}
  Mode: ${score.mode}

SCORE BREAKDOWN:
${categorySummary}

RISK FINGERPRINT (based on ${riskFingerprint.basedOnMemory ? `${riskFingerprint.memoryGenerationCount} prior run(s)` : "first run — no memory"}):
${riskSummary || "  No risk signals detected."}

TIME-TO-SHIP ESTIMATE:
  ${timeToShip.minMinutes}–${timeToShip.maxMinutes} minutes
  Heuristic: ${timeToShip.heuristic}
  Reasons: ${timeToShip.reasons.slice(0, 3).join("; ")}

EXTERNAL EVIDENCE:
${evidenceSummary}

Remember: decision must be "ship" if total >= 71, else "hold". Return JSON only.`;
}

// ─── Few-shot example (appended to system prompt in tests) ───────────────────

export const ASSESSOR_EXAMPLE_EXCHANGE = {
  user: `GOAL: Check repo readiness
DETERMINISTIC SCORE: Total: 55/100, Band: RISKY
(rest omitted for brevity)`,
  assistant: JSON.stringify(
    {
      decision: "hold",
      confidence: 0.85,
      explanation:
        "The repository sits in the RISKY band at 55/100 primarily due to failing CI pipelines and insufficient test coverage. These blockers present meaningful risk before a production release.",
      blockers: [
        "CI health at 40/100 — pipelines are failing or absent",
        "Test coverage at 35/100 — core paths lack automated tests",
      ],
      recommendedActions: [
        "Stabilize CI by fixing failing pipeline steps",
        "Add unit tests for the three highest-risk modules",
        "Review and close or label any open blocker-tagged issues",
      ],
      uncertaintyNotes: [
        "Security score based on surface-level scan; deeper audit recommended before release",
      ],
    },
    null,
    2
  ),
};

// ─── Fallback explanation (used when Nemotron is unavailable) ─────────────────

export function buildFallbackExplanation(
  score: ReadinessScore,
  goal: string
): string {
  const isShip = score.total >= 71;
  const failingCats = score.categories.filter((c) => !c.pass);
  return (
    `${FALLBACK_BANNER}\n\n` +
    `Goal: ${goal}\n` +
    `Score: ${score.total}/100 (${score.band})\n` +
    `Decision: ${isShip ? "ship" : "hold"} (threshold: 71)\n` +
    (failingCats.length
      ? `Failing categories: ${failingCats.map((c) => c.name).join(", ")}`
      : "All categories passing.")
  );
}
