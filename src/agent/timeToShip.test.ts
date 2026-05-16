import { describe, expect, it } from "vitest";
import { estimateTimeToShip } from "./timeToShip.js";
import type { RiskFingerprint } from "../shared/types.js";

const baseFingerprint: RiskFingerprint = {
  generatedAt: "2026-05-16T00:00:00.000Z",
  basedOnMemory: false,
  memoryGenerationCount: 0,
  items: [],
};

describe("estimateTimeToShip", () => {
  it("uses blocker severity constants to build the estimate range", () => {
    const estimate = estimateTimeToShip({
      mode: "demo",
      riskFingerprint: {
        ...baseFingerprint,
        items: [
          { signal: "ci_health", severity: "critical", detail: "CI failing", fromMemory: false },
          { signal: "security", severity: "high", detail: "Missing policy", fromMemory: false },
          { signal: "docs", severity: "medium", detail: "No changelog", fromMemory: false },
        ],
      },
    });

    expect(estimate.minMinutes).toBe(185);
    expect(estimate.maxMinutes).toBe(278);
    expect(estimate.mode).toBe("demo");
    expect(estimate.reasons).toContain("1 critical blocker(s) × 120min each");
    expect(estimate.reasons).toContain("1 high-severity issue(s) × 45min each");
    expect(estimate.reasons).toContain("1 medium issue(s) × 20min each");
  });

  it("keeps a minimum 30 minute estimate when no blockers are found", () => {
    const estimate = estimateTimeToShip({
      mode: "live",
      riskFingerprint: baseFingerprint,
    });

    expect(estimate.minMinutes).toBe(30);
    expect(estimate.maxMinutes).toBe(45);
    expect(estimate.reasons).toEqual(["No significant blockers detected — minimal remediation expected"]);
  });
});
