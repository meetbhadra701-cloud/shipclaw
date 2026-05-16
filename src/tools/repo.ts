/**
 * ShipClaw — Repo Scanner Tool
 * Codex-primary file (X-005). Claude provides interface + stub.
 */
import type { Observation } from "../shared/types.js";

export interface RepoScanResult {
  hasReadme: boolean;
  hasChangelog: boolean;
  hasTests: boolean;
  testFileCount: number;
  hasLockFile: boolean;
  hasSecurityPolicy: boolean;
  observations: Observation[];
}

// ─── STUB ─────────────────────────────────────────────────────────────────────

export async function scanImportantFiles(repoPath: string): Promise<RepoScanResult> {
  const isDemoMode = process.env["DEMO_MODE"] === "true";
  if (isDemoMode || !repoPath) {
    return getDemoScan();
  }
  // TODO(Codex X-005): implement real file scan
  return getDemoScan();
}

function getDemoScan(): RepoScanResult {
  return {
    hasReadme: true,
    hasChangelog: false,
    hasTests: true,
    testFileCount: 4,
    hasLockFile: true,
    hasSecurityPolicy: false,
    observations: [
      { category: "documentation", signal: "has_readme", value: true, weight: 0.15, source: "repo_scan" },
      { category: "documentation", signal: "has_changelog", value: false, weight: 0.15, source: "repo_scan" },
      { category: "test_coverage", signal: "test_file_count", value: 4, weight: 0.20, source: "repo_scan" },
      { category: "security", signal: "has_security_policy", value: false, weight: 0.10, source: "repo_scan" },
    ],
  };
}
