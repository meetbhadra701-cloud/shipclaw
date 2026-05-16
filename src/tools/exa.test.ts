/**
 * ShipClaw — Exa tool tests
 * Tests: disabled, missing key, assessmentNeedsExternalEvidence, failure degrades gracefully.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  searchExternalEvidence,
  searchExternalDocs,
  assessmentNeedsExternalEvidence,
  buildExaQueries,
} from "./exa.js";
import type { Observation, ReadinessScore } from "../shared/types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeScore(overrides: Partial<ReadinessScore> = {}): ReadinessScore {
  return {
    deterministic: true,
    total: 59,
    band: "RISKY",
    status: "risky",
    mode: "demo",
    computedAt: new Date().toISOString(),
    categories: [
      {
        name: "ci_health",
        weight: 0.25,
        rawScore: 40,
        weightedScore: 10,
        evidence: ["[SYNTHETIC]"],
        pass: false,
      },
      {
        name: "test_coverage",
        weight: 0.2,
        rawScore: 50,
        weightedScore: 10,
        evidence: ["[SYNTHETIC]"],
        pass: false,
      },
      {
        name: "open_blockers",
        weight: 0.2,
        rawScore: 75,
        weightedScore: 15,
        evidence: ["[SYNTHETIC]"],
        pass: true,
      },
      {
        name: "documentation",
        weight: 0.15,
        rawScore: 40,
        weightedScore: 6,
        evidence: ["[SYNTHETIC]"],
        pass: false,
      },
      {
        name: "security",
        weight: 0.1,
        rawScore: 80,
        weightedScore: 8,
        evidence: ["[SYNTHETIC]"],
        pass: true,
      },
      {
        name: "dependency_freshness",
        weight: 0.1,
        rawScore: 100,
        weightedScore: 10,
        evidence: ["[SYNTHETIC]"],
        pass: true,
      },
    ],
    ...overrides,
  };
}

function makeObs(overrides: Partial<Observation> = {}): Observation {
  return {
    category: "ci_health",
    signal: "ci_passing",
    value: "true",
    weight: 0.25,
    source: "github",
    ...overrides,
  };
}

// ─── assessmentNeedsExternalEvidence ─────────────────────────────────────────

describe("assessmentNeedsExternalEvidence", () => {
  it("returns false for READY score", () => {
    const score = makeScore({ band: "READY", total: 80, status: "ready" });
    expect(assessmentNeedsExternalEvidence([], score)).toBe(false);
  });

  it("returns true when documentation category fails", () => {
    const score = makeScore(); // documentation fails in default fixture
    expect(assessmentNeedsExternalEvidence([], score)).toBe(true);
  });

  it("returns true when dependency_freshness fails", () => {
    const score = makeScore({
      categories: makeScore().categories.map((c) =>
        c.name === "dependency_freshness"
          ? { ...c, rawScore: 40, pass: false }
          : c.name === "documentation"
          ? { ...c, rawScore: 80, pass: true } // doc passes
          : c
      ),
    });
    expect(assessmentNeedsExternalEvidence([], score)).toBe(true);
  });

  it("returns true for observation with native signal", () => {
    const score = makeScore({
      band: "RISKY",
      categories: makeScore().categories.map((c) => ({ ...c, pass: true })),
    });
    const obs = makeObs({ signal: "native_binding_gyp_error", value: "failed" });
    expect(assessmentNeedsExternalEvidence([obs], score)).toBe(true);
  });

  it("returns true for NOT_READY score regardless of category state", () => {
    const score = makeScore({
      band: "NOT_READY",
      total: 30,
      status: "not_ready",
      categories: makeScore().categories.map((c) => ({ ...c, pass: true })),
    });
    expect(assessmentNeedsExternalEvidence([], score)).toBe(true);
  });

  it("returns false for RISKY score with all categories passing and no signals", () => {
    const score = makeScore({
      band: "RISKY",
      categories: makeScore().categories.map((c) => ({ ...c, pass: true })),
    });
    expect(assessmentNeedsExternalEvidence([], score)).toBe(false);
  });
});

// ─── buildExaQueries ─────────────────────────────────────────────────────────

describe("buildExaQueries", () => {
  it("builds documentation query when doc category fails", () => {
    const score = makeScore(); // doc fails in fixture
    const queries = buildExaQueries({ repo: "owner/my-project", score, observations: [] });
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.some((q) => q.includes("my project"))).toBe(true);
  });

  it("caps queries at EXA_MAX_SEARCHES_PER_RUN", () => {
    const score = makeScore({
      categories: makeScore().categories.map((c) => ({ ...c, pass: false })),
    });
    const queries = buildExaQueries({ repo: "owner/repo", score, observations: [] });
    expect(queries.length).toBeLessThanOrEqual(3);
  });

  it("sanitizes query to remove sensitive patterns", () => {
    const score = makeScore();
    const queries = buildExaQueries({
      repo: "owner/repo",
      score,
      observations: [makeObs({ signal: "SECRET_KEY=abc123", value: "detected" })],
    });
    queries.forEach((q) => {
      expect(q).not.toMatch(/=abc123/);
    });
  });
});

// ─── searchExternalEvidence — disabled / missing key ─────────────────────────

describe("searchExternalEvidence", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    // Restore env before each test
    Object.assign(process.env, origEnv);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up any env mutations
    delete process.env["EXA_API_KEY"];
    process.env["EXA_ENABLED"] = "false";
    process.env["ENABLE_EXA"] = "false";
  });

  it("returns [] and makes no network call when EXA_ENABLED=false", async () => {
    process.env["EXA_ENABLED"] = "false";
    process.env["ENABLE_EXA"] = "false";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await searchExternalEvidence(["react deprecation"], "run-1");
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns [] and makes no network call when EXA_API_KEY is missing", async () => {
    process.env["EXA_ENABLED"] = "true";
    delete process.env["EXA_API_KEY"];
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await searchExternalEvidence(["some query"], "run-2");
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns [] when queries list is empty", async () => {
    process.env["EXA_ENABLED"] = "true";
    process.env["EXA_API_KEY"] = "test-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await searchExternalEvidence([], "run-3");
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns [] gracefully when Exa API returns non-ok status", async () => {
    process.env["EXA_ENABLED"] = "true";
    process.env["EXA_API_KEY"] = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
    );
    const result = await searchExternalEvidence(["react 18 migration"], "run-4");
    expect(result).toEqual([]);
  });

  it("returns [] gracefully when fetch throws (network timeout)", async () => {
    process.env["EXA_ENABLED"] = "true";
    process.env["EXA_API_KEY"] = "test-key";
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("AbortError"));
    const result = await searchExternalEvidence(["some query"], "run-5");
    expect(result).toEqual([]);
  });

  it("maps Exa results to ExternalEvidence shape", async () => {
    process.env["EXA_ENABLED"] = "true";
    process.env["EXA_API_KEY"] = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              id: "r1",
              url: "https://docs.example.com/setup",
              title: "Setup Guide",
              score: 0.85,
              highlights: ["The setup requires Node 18 or higher."],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const result = await searchExternalEvidence(["setup guide"], "run-6");
    expect(result).toHaveLength(1);
    const first = result[0]!;
    expect(first.source).toBe("exa");
    expect(first.sourceTitle).toBe("Setup Guide");
    expect(first.relevance).toBe("high"); // score 0.85 >= 0.8
    expect(first.snippet).toContain("Node 18");
  });
});

// ─── searchExternalDocs ───────────────────────────────────────────────────────

describe("searchExternalDocs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env["EXA_API_KEY"];
  });

  it("returns [] when EXA_API_KEY is not set", async () => {
    delete process.env["EXA_API_KEY"];
    const result = await searchExternalDocs({ repoStack: ["react", "typescript"], uncertainty: "deploy steps" });
    expect(result).toEqual([]);
  });

  it("returns [] gracefully on network error", async () => {
    process.env["EXA_API_KEY"] = "test-key";
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));
    const result = await searchExternalDocs({ repoStack: ["next.js"], uncertainty: "setup" });
    expect(result).toEqual([]);
  });
});
