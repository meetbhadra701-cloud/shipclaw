/**
 * ShipClaw — Nemotron Assessor
 * Claude-primary file.
 *
 * Takes the deterministic score + context, calls Nemotron, validates output.
 * On any failure (network, parse, validation) → fallback assessor path.
 * The numeric score is NEVER modified here.
 */
import { z } from "zod";
import type { AssessorOutput, ReadinessScore, RiskFingerprint, TimeToShipEstimate, ExternalEvidence } from "../shared/types.js";
import { MODE_FALLBACK } from "../shared/constants.js";
import * as nemotron from "../llm/nemotron.js";
import {
  ASSESSOR_SYSTEM_PROMPT,
  buildAssessorUserPrompt,
  buildFallbackExplanation,
  type AssessorContext,
} from "./prompts.js";

// ─── Zod validation schema ────────────────────────────────────────────────────

const AssessorOutputSchema = z.object({
  decision: z.enum(["ship", "hold"]),
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(1).max(1000),
  blockers: z.array(z.string()),
  recommendedActions: z.array(z.string()),
  uncertaintyNotes: z.array(z.string()),
});

// ─── Fallback assessor ────────────────────────────────────────────────────────

function fallbackAssess(score: ReadinessScore, goal: string): AssessorOutput {
  const isShip = score.total >= 71;
  const failingCats = score.categories.filter((c) => !c.pass);

  return {
    decision: isShip ? "ship" : "hold",
    confidence: 0.7,
    explanation: buildFallbackExplanation(score, goal),
    blockers: failingCats.map(
      (c) => `${c.name} scored ${c.rawScore}/100 — ${c.evidence[0] ?? "no evidence"}`
    ),
    recommendedActions: failingCats.slice(0, 3).map(
      (c) => `Improve ${c.name}: address evidence signals`
    ),
    uncertaintyNotes: [
      "Nemotron was unavailable. This assessment is generated from deterministic score only.",
    ],
    mode: MODE_FALLBACK,
  };
}

// ─── Live assessor ────────────────────────────────────────────────────────────

export async function assess(ctx: AssessorContext): Promise<AssessorOutput> {
  const allowFallback = process.env["ALLOW_LLM_FALLBACK"] === "true";
  const isDemoMode = process.env["DEMO_MODE"] === "true";

  if (isDemoMode && allowFallback) {
    return fallbackAssess(ctx.score, ctx.goal);
  }

  try {
    const messages: nemotron.NemotronMessage[] = [
      { role: "system", content: ASSESSOR_SYSTEM_PROMPT },
      { role: "user", content: buildAssessorUserPrompt(ctx) },
    ];

    const raw = await nemotron.completeJson<Record<string, unknown>>(messages, {
      temperature: 0.3,
      topP: 0.7,
      maxTokens: 2048,
    });

    const parsed = AssessorOutputSchema.parse(raw);

    // Enforce: decision must match score threshold (Nemotron cannot override)
    const expectedDecision: "ship" | "hold" = ctx.score.total >= 71 ? "ship" : "hold";
    if (parsed.decision !== expectedDecision) {
      parsed.decision = expectedDecision;
      parsed.uncertaintyNotes.push(
        `Decision corrected from Nemotron output to match deterministic threshold (total=${ctx.score.total}).`
      );
    }

    return { ...parsed, mode: ctx.score.mode };
  } catch (err) {
    if (!allowFallback) throw err;
    console.warn("[assessor] Nemotron error, using fallback:", String(err));
    return fallbackAssess(ctx.score, ctx.goal);
  }
}

export type { AssessorContext };
