import { afterEach, describe, expect, it, vi } from "vitest";
import * as nemotron from "../llm/nemotron.js";
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
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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
    expect(result.confidence).toBeNull();
    expect(result.blockers).toEqual(["ci_health scored 40/100 — CI failing"]);
    expect(result.recommendedActions).toEqual(["Improve ci_health: address evidence signals"]);
    expect(result.uncertaintyNotes[0]).toContain("no model was called");
  });
});


describe("model boundary", () => {
  it("ignores model numeric scores and corrects an incompatible verdict", async () => {
    const input = structuredClone(ctx);
    input.score.mode = "live";
    const before = JSON.stringify(input.score);
    vi.spyOn(nemotron, "completeJson").mockResolvedValue({ decision: "ship", total: 100, score: 100, confidence: .9, explanation: "An explanation", blockers: [], recommendedActions: [], uncertaintyNotes: [] });
    const result = await assess(input);
    expect(JSON.stringify(input.score)).toBe(before);
    expect(result).toMatchObject({ decision: "hold", mode: "live", source: "nemotron" });
    expect(result).not.toHaveProperty("total");
    expect(result).not.toHaveProperty("score");
  });
  it("holds an otherwise high score with unmeasured categories", async () => {
    const input = structuredClone(ctx); input.score.mode = "live"; input.score.total = 80; input.score.evidenceCoverage = .9;
    vi.spyOn(nemotron, "completeJson").mockResolvedValue({ decision: "ship", confidence: .8, explanation: "Review needed", blockers: [], recommendedActions: [], uncertaintyNotes: [] });
    expect((await assess(input)).decision).toBe("hold");
  });
  it("reports request-failure fallback independently of live evidence", async () => {
    process.env["ALLOW_LLM_FALLBACK"] = "true";
    const input = structuredClone(ctx); input.score.mode = "live";
    vi.spyOn(nemotron, "completeJson").mockRejectedValue(new Error("do not expose this"));
    const result = await assess(input);
    expect(result).toMatchObject({ mode: "fallback", source: "deterministic_fallback", confidence: null });
    expect(input.score.mode).toBe("live");
  });
  it.each([
    ["timeout", () => vi.spyOn(nemotron, "completeJson").mockRejectedValue(new nemotron.NemotronError("Nemotron request failed.", "timeout", 60012)), /category=timeout elapsedMs=60012 model=/],
    ["schema_validation", () => vi.spyOn(nemotron, "completeJson").mockResolvedValue({ decision: "ship", confidence: 2, explanation: "PRIVATE-MODEL-TEXT" }), /category=schema_validation model=/],
  ])("logs sanitized %s diagnostics and keeps the honest fallback", async (_category, arrange, expected) => {
    process.env["ALLOW_LLM_FALLBACK"] = "true";
    vi.stubEnv("NEMOTRON_API_KEY", "test-only-secret");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const input = structuredClone(ctx); input.score.mode = "live";
    const before = JSON.stringify(input.score);
    arrange();
    const result = await assess(input);
    expect(result).toMatchObject({ source: "deterministic_fallback", fallbackReason: "request_failed", confidence: null, decision: "hold" });
    expect(JSON.stringify(input.score)).toBe(before);
    const logged = warn.mock.calls.map(args => args.join(" ")).join("\n");
    expect(logged).toMatch(expected);
    expect(logged).not.toContain("PRIVATE-MODEL-TEXT");
  });
  it("leaves the assessor unavailable when fallback is disabled", async () => {
    process.env["ALLOW_LLM_FALLBACK"] = "false";
    const input = structuredClone(ctx); input.score.mode = "live";
    vi.spyOn(nemotron, "completeJson").mockRejectedValue(new Error("API unavailable"));
    await expect(assess(input)).rejects.toThrow("API unavailable");
  });
});
