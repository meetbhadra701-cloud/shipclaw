/**
 * ShipClaw — GitHub Tool
 * Codex-primary file (X-005). Claude provides interface + stub.
 *
 * Codex: implement getRepoBundle() using simple-git and octokit/rest.
 * Must work for public repos without a token (rate-limited).
 * Must work for private repos with GITHUB_TOKEN.
 * In DEMO_MODE, read from fixtures/demo/ instead.
 */
import type { Observation } from "../shared/types.js";

export interface RepoBundle {
  owner: string;
  repo: string;
  defaultBranch: string;
  openIssueCount: number;
  openPRCount: number;
  latestCommitSha: string;
  latestCommitDate: string;
  hasCI: boolean;
  ciStatus: "passing" | "failing" | "unknown";
  observations: Observation[];
}

// ─── STUB — replace with real implementation (Codex X-005) ───────────────────

export async function getRepoBundle(repoUrl: string): Promise<RepoBundle> {
  const isDemoMode = process.env["DEMO_MODE"] === "true";
  if (isDemoMode) {
    return getDemoBundle(repoUrl);
  }
  // TODO(Codex X-005): implement live GitHub fetch
  return getDemoBundle(repoUrl);
}

function getDemoBundle(repoUrl: string): RepoBundle {
  const parts = repoUrl.replace("https://github.com/", "").split("/");
  const owner = parts[0] ?? "demo-owner";
  const repo = parts[1] ?? "demo-repo";

  return {
    owner,
    repo,
    defaultBranch: "main",
    openIssueCount: 3,
    openPRCount: 1,
    latestCommitSha: "abc1234",
    latestCommitDate: new Date().toISOString(),
    hasCI: true,
    ciStatus: "failing",
    observations: [
      { category: "ci_health", signal: "ci_status", value: "failing", weight: 0.25, source: "github" },
      { category: "open_blockers", signal: "open_issues", value: 3, weight: 0.20, source: "github" },
      { category: "open_blockers", signal: "open_prs", value: 1, weight: 0.20, source: "github" },
    ],
  };
}
