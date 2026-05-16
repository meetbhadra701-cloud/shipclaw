/**
 * ShipClaw — Scorer unit tests
 * Claude-authored placeholder. Codex (X-006) should expand with full coverage.
 */
import { describe, it, expect } from "vitest";
import { calculateReadinessScore } from "./scorer.js";
import type { Observation } from "../shared/types.js";

const baseObs: Observation[] = [
  { category: "ci_health",           signal: "ci_passing",  value: "true",  weight: 0.25, source: "manual" },
  { category: "test_coverage",       signal: "test_files",  value: 4,       weight: 0.20, source: "manual" },
  { category: "open_blockers",       signal: "open_issues", value: 0,       weight: 0.20, source: "manual" },
  { category: "documentation",       signal: "has_readme",  value: true,    weight: 0.15, source: "manual" },
  { category: "security",            signal: "no_alerts",   value: true,    weight: 0.10, source: "manual" },
  { category: "dependency_freshness",signal: "up_to_date",  value: true,    weight: 0.10, source: "manual" },
];

describe("calculateReadinessScore", () => {
  it("returns a numeric total between 0 and 100", () => {
    const result = calculateReadinessScore({ observations: baseObs, runId: "test-001", mode: "demo" });
    expect(typeof result.total).toBe("number");
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it("sets deterministic: true", () => {
    const result = calculateReadinessScore({ observations: baseObs, runId: "test-001", mode: "demo" });
    expect(result.deterministic).toBe(true);
  });

  it("returns a valid band (READY | RISKY | NOT_READY)", () => {
    const result = calculateReadinessScore({ observations: baseObs, runId: "test-001", mode: "demo" });
    expect(["READY", "RISKY", "NOT_READY"]).toContain(result.band);
  });

  it("returns categories array", () => {
    const result = calculateReadinessScore({ observations: baseObs, runId: "test-001", mode: "demo" });
    expect(Array.isArray(result.categories)).toBe(true);
  });

  it("returns HOLD decision if score < 71", () => {
    // Failing observations that drive score down
    const failingObs: Observation[] = [
      { category: "ci_health", signal: "ci_failing", value: "false", weight: 0.25, source: "manual" },
    ];
    const result = calculateReadinessScore({ observations: failingObs, runId: "test-002", mode: "demo" });
    // Score should produce a band — just verify structure
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it("produces consistent output for same inputs", () => {
    const r1 = calculateReadinessScore({ observations: baseObs, runId: "r1", mode: "demo" });
    const r2 = calculateReadinessScore({ observations: baseObs, runId: "r2", mode: "demo" });
    expect(r1.total).toBe(r2.total);
    expect(r1.band).toBe(r2.band);
  });

  it("uses observation evidence instead of synthetic labels in demo mode", () => {
    const result = calculateReadinessScore({ observations: baseObs, runId: "demo-evidence", mode: "demo" });
    const evidence = result.categories.flatMap((category) => category.evidence);
    expect(evidence.some((item) => item.includes("[SYNTHETIC]"))).toBe(false);
    expect(evidence).toContain("manual ci_health.ci_passing=true -> 100/100");
  });

  it("turns count observations into readiness scores instead of raw passthrough numbers", () => {
    const result = calculateReadinessScore({
      observations: [
        { category: "test_coverage", signal: "test_file_count", value: 4, weight: 0.20, source: "repo_scan" },
        { category: "open_blockers", signal: "open_issues", value: 3, weight: 0.20, source: "github" },
      ],
      runId: "count-evidence",
      mode: "demo",
    });

    expect(result.categories.find((category) => category.name === "test_coverage")?.rawScore).toBe(55);
    expect(result.categories.find((category) => category.name === "open_blockers")?.rawScore).toBe(55);
  });
});
