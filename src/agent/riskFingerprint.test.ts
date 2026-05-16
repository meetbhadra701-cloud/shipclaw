import { describe, expect, it } from "vitest";
import { buildRiskFingerprint } from "./riskFingerprint.js";
import type { MemorySnapshot, ReadinessScore } from "../shared/types.js";

const baseScore: ReadinessScore = {
  deterministic: true,
  total: 54,
  band: "RISKY",
  status: "risky",
  mode: "demo",
  computedAt: "2026-05-16T00:00:00.000Z",
  categories: [
    {
      name: "ci_health",
      weight: 0.25,
      rawScore: 25,
      weightedScore: 6.25,
      evidence: ["CI failed on main"],
      pass: false,
    },
    {
      name: "test_coverage",
      weight: 0.2,
      rawScore: 45,
      weightedScore: 9,
      evidence: ["Only smoke tests found"],
      pass: false,
    },
    {
      name: "documentation",
      weight: 0.15,
      rawScore: 80,
      weightedScore: 12,
      evidence: ["README present"],
      pass: true,
    },
  ],
};

const memorySnapshot: MemorySnapshot = {
  runId: "risk-before",
  capturedAt: "2026-05-16T00:00:00.000Z",
  items: [{ key: "meta:totalRuns", value: "2", updatedAt: "2026-05-16T00:00:00.000Z" }],
};

describe("buildRiskFingerprint", () => {
  it("turns failing score categories into severity-ranked risk items", () => {
    const result = buildRiskFingerprint({
      score: baseScore,
      memorySnapshot,
      priorRunCount: 2,
    });

    expect(result.basedOnMemory).toBe(true);
    expect(result.memoryGenerationCount).toBe(2);
    expect(result.items).toEqual([
      {
        signal: "ci_health",
        severity: "critical",
        detail: "CI failed on main",
        fromMemory: false,
      },
      {
        signal: "test_coverage",
        severity: "high",
        detail: "Only smoke tests found",
        fromMemory: false,
      },
    ]);
  });

  it("does not imply memory when there are no prior runs", () => {
    const result = buildRiskFingerprint({
      score: { ...baseScore, categories: [] },
      memorySnapshot: { ...memorySnapshot, items: [] },
      priorRunCount: 0,
    });

    expect(result.basedOnMemory).toBe(false);
    expect(result.memoryGenerationCount).toBe(0);
    expect(result.items).toEqual([]);
  });
});
