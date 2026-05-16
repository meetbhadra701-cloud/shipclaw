/**
 * ShipClaw — LLM Mock (for tests and offline use)
 * Codex-primary file (X-004). Claude provides this initial stub.
 *
 * Codex: expand with deterministic fixtures for different score inputs.
 */
import type { AssessorOutput } from "../shared/types.js";

/** Returns a deterministic AssessorOutput based on the score total */
export function mockAssessorOutput(scoreTotal: number): AssessorOutput {
  const isShip = scoreTotal >= 71;
  return {
    decision: isShip ? "ship" : "hold",
    confidence: isShip ? 0.88 : 0.82,
    explanation: isShip
      ? `Score of ${scoreTotal}/100 meets the READY threshold. Core quality signals are healthy.`
      : `Score of ${scoreTotal}/100 falls below the READY threshold. Key blockers require remediation before release.`,
    blockers: isShip
      ? []
      : ["CI health below 60/100", "Test coverage insufficient"],
    recommendedActions: isShip
      ? ["Proceed with release pipeline", "Tag a release candidate"]
      : ["Fix failing CI steps", "Add unit tests for critical paths", "Resolve open blocker issues"],
    uncertaintyNotes: ["This is mock/test data — not a real Nemotron response"],
    mode: "fallback",
  };
}
