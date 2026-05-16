import { afterEach, describe, expect, it } from "vitest";
import { assess } from "./assessor.js";
import type { AssessorContext } from "./prompts.js";

const originalDemoMode = process.env["DEMO_MODE"];
const originalAllowFallback = process.env["ALLOW_LLM_FALLBACK"];

const ctx: AssessorContext = {
  goal: "Check demo readiness",
  repo: "fixtures/demo",
  score: {
    deterministic: true,
    total: 55,
    band: "RISKY",
    status: "risky",
    mode: "demo",
    computedAt: "2026-05-16T00:00:00.000Z",
    categories: [
      {
        name: "ci_health",
        weight: 0.25,
        rawScore: 40,
        weightedScore: 10,
        evidence: ["CI failing"],
        pass: false,
      },
    ],
  },
  riskFingerprint: {
    basedOnMemory: false,
    memoryGenerationCount: 0,
    generatedAt: "2026-05-16T00:00:00.000Z",
    items: [{ signal: "ci_health", severity: "high", detail: "CI failing", fromMemory: false }],
  },
  timeToShip: {
    minMinutes: 45,
    maxMinutes: 68,
    reasons: ["1 high-severity issue(s) × 45min each"],
    heuristic: "test heuristic",
    mode: "demo",
  },
};

afterEach(() => {
  if (originalDemoMode === undefined) delete process.env["DEMO_MODE"];
  else process.env["DEMO_MODE"] = originalDemoMode;

  if (originalAllowFallback === undefined) delete process.env["ALLOW_LLM_FALLBACK"];
  else process.env["ALLOW_LLM_FALLBACK"] = originalAllowFallback;
});

describe("assess", () => {
  it("uses fallback assessment in demo mode without calling Nemotron", async () => {
    process.env["DEMO_MODE"] = "true";
    process.env["ALLOW_LLM_FALLBACK"] = "true";

    const result = await assess(ctx);

    expect(result.mode).toBe("fallback");
    expect(result.decision).toBe("hold");
    expect(result.confidence).toBe(0.7);
    expect(result.blockers).toEqual(["ci_health scored 40/100 — CI failing"]);
    expect(result.recommendedActions).toEqual(["Improve ci_health: address evidence signals"]);
    expect(result.uncertaintyNotes[0]).toContain("Nemotron was unavailable");
  });
});
