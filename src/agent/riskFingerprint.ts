/**
 * ShipClaw — Risk Fingerprint Builder
 * Codex-primary file (X-003). Claude provides this fallback stub.
 *
 * Codex: implement buildRiskFingerprint() using memory + observations.
 * basedOnMemory must be true only when prior runs exist in memory.
 */
import type { RiskFingerprint, ReadinessScore, MemorySnapshot } from "../shared/types.js";

export interface RiskFingerprintInput {
  score: ReadinessScore;
  memorySnapshot: MemorySnapshot;
  priorRunCount: number;
}

// ─── STUB — replace with real implementation (Codex X-003) ───────────────────

export function buildRiskFingerprint(input: RiskFingerprintInput): RiskFingerprint {
  const { score, priorRunCount } = input;
  const basedOnMemory = priorRunCount > 0;

  const items = score.categories
    .filter((c) => !c.pass)
    .map((c) => ({
      signal: c.name,
      severity: (c.rawScore < 30 ? "critical" : c.rawScore < 50 ? "high" : "medium") as RiskFingerprint["items"][0]["severity"],
      detail: c.evidence[0] ?? `${c.name} below passing threshold`,
      fromMemory: false,
    }));

  return {
    items,
    basedOnMemory,
    memoryGenerationCount: priorRunCount,
    generatedAt: new Date().toISOString(),
  };
}
