/** Read-only GitHub REST collection. Never clones or executes repository code. */
import type { Observation, RepositoryEvidence } from "../shared/types.js";

export interface RepoBundle extends RepositoryEvidence { owner: string; repo: string }
export class GitHubError extends Error {}

export function parseGitHubUrl(input: string): { owner: string; repo: string; url: string } {
  let url: URL;
  try { url = new URL(input); } catch { throw new GitHubError("Enter a public repository URL: https://github.com/owner/repo"); }
  const match = /^\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+?)\/?$/.exec(url.pathname);
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password || url.search || url.hash || !match) {
    throw new GitHubError("Use an HTTPS github.com repository URL without credentials, query, or extra path.");
  }
  const owner = match[1]!;
  const repo = match[2]!.replace(/\.git$/, "");
  if (!repo || repo === "." || repo === "..") throw new GitHubError("Invalid repository name.");
  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}

async function github<T>(path: string): Promise<T> {
  const token = process.env["GITHUB_TOKEN"];
  let response: Response;
  try {
    response = await fetch(`https://api.github.com${path}`, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ShipClaw-read-only", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(10_000), redirect: "error",
    });
  } catch { throw new GitHubError("GitHub request failed or timed out. Retry when the API is available."); }
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) throw new GitHubError("GitHub API rate limit or access restriction. Retry later; a configured GITHUB_TOKEN may improve access.");
    if (response.status === 404) throw new GitHubError("Public GitHub repository or resource not found.");
    if (response.status === 409) throw new GitHubError("Repository is empty; no commit or file tree can be measured.");
    throw new GitHubError(`GitHub API returned HTTP ${response.status}.`);
  }
  try { return await response.json() as T; } catch { throw new GitHubError("GitHub returned an invalid response."); }
}

export async function getRepoBundle(repoUrl: string, options: { demo?: boolean } = {}): Promise<RepoBundle> {
  if (options.demo ?? process.env["DEMO_MODE"] === "true") return getDemoBundle();
  const { owner, repo, url } = parseGitHubUrl(repoUrl);
  const root = `/repos/${owner}/${repo}`;
  const metadata = await github<{ full_name: string; default_branch: string; private: boolean }>(root);
  if (metadata.private) throw new GitHubError("This version supports public repositories only.");
  if (!metadata.full_name || !metadata.default_branch) throw new GitHubError("GitHub repository metadata is incomplete.");
  const bundle: RepoBundle = {
    owner, repo, source: "github", repository: `https://github.com/${metadata.full_name}`, collectedAt: new Date().toISOString(),
    defaultBranch: metadata.default_branch, latestCommitSha: null, latestCommitDate: null,
    openIssueCount: null, openPRCount: null, hasCI: null, ciStatus: "unknown", filePaths: [], treeComplete: false, observations: [],
    limitations: ["No repository code was executed. Test results, coverage, typecheck, vulnerabilities, exposed secrets, and dependency freshness are unmeasured.", "Open issue and PR counts are context, not proof of release blockers. Release-specific blocker triage is unmeasured.", "File names indicate presence only, not documentation quality, effective tests, or security assurance. External CI providers and inherited organization policies are not inspected."],
  };
  const attempt = async (work: () => Promise<void>) => { try { await work(); } catch (error) { bundle.limitations.push(error instanceof GitHubError ? error.message : "GitHub evidence response could not be interpreted."); } };
  await Promise.all([
    attempt(async () => {
      const commit = await github<{ sha: string; commit: { committer: { date: string }; tree: { sha: string } } }>(`${root}/commits/${encodeURIComponent(metadata.default_branch)}`);
      bundle.latestCommitSha = commit.sha; bundle.latestCommitDate = commit.commit.committer.date;
      await Promise.all([
        attempt(async () => {
          const tree = await github<{ truncated: boolean; tree: Array<{ path: string; type: string; mode: string }> }>(`${root}/git/trees/${commit.commit.tree.sha}?recursive=1`);
          bundle.treeComplete = tree.truncated === false;
          bundle.filePaths = tree.tree.filter(f => f.type === "blob" && f.mode !== "120000").map(f => f.path);
          bundle.hasCI = bundle.filePaths.some(p => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(p)) ? true : bundle.treeComplete ? false : null;
          if (!bundle.treeComplete) bundle.limitations.push("GitHub truncated the file tree: absent files and exact counts are unknown.");
        }),
        attempt(async () => {
          const runs = await github<{ total_count: number; workflow_runs: Array<{ name: string; html_url: string; workflow_id: number; run_number: number; run_attempt: number; head_sha: string; status: string; conclusion: string | null }> }>(`${root}/actions/runs?branch=${encodeURIComponent(metadata.default_branch)}&head_sha=${commit.sha}&per_page=100`);
          const latest = new Map<number, (typeof runs.workflow_runs)[number]>();
          for (const run of runs.workflow_runs) {
            if (run.head_sha !== commit.sha) continue;
            const previous = latest.get(run.workflow_id);
            if (!previous || run.run_number > previous.run_number || (run.run_number === previous.run_number && run.run_attempt > previous.run_attempt)) latest.set(run.workflow_id, run);
          }
          const checks = [...latest.values()];
          bundle.actionsRuns = checks.map(r => ({ name: r.name, status: r.status, conclusion: r.conclusion, url: r.html_url, headSha: r.head_sha }));
          if (checks.some(r => r.status === "completed" && ["failure", "timed_out", "action_required", "startup_failure"].includes(r.conclusion ?? ""))) bundle.ciStatus = "failing";
          else if (runs.total_count <= 100 && checks.length > 0 && checks.every(r => r.status === "completed" && r.conclusion === "success")) bundle.ciStatus = "passing";
          bundle.limitations.push("CI status summarizes the latest observed run per workflow at the inspected commit; it does not prove all required workflows ran or branch protection passed.");
        }),
      ]);
    }),
    ...(["issue", "pr"] as const).map(type => attempt(async () => {
      const result = await github<{ total_count: number; incomplete_results: boolean }>(`/search/issues?q=${encodeURIComponent(`repo:${owner}/${repo} is:open is:${type}`)}&per_page=1`);
      if (result.incomplete_results || !Number.isInteger(result.total_count)) throw new GitHubError(`Open ${type} count is incomplete.`);
      if (type === "issue") bundle.openIssueCount = result.total_count; else bundle.openPRCount = result.total_count;
    })),
  ]);
  bundle.observations.push({ category: "ci_health", signal: "ci_status", value: bundle.ciStatus, status: bundle.ciStatus === "unknown" ? "unknown" : "measured", reason: bundle.ciStatus === "unknown" ? "No conclusive Actions results for the inspected commit (missing, pending, skipped, inaccessible, or incomplete)." : undefined, weight: .25, source: "github", url: `${url}/actions` });
  bundle.observations.push({ category: "open_blockers", signal: "release_blocker_triage", value: "unknown", status: "unknown", reason: "Issue and PR counts do not identify release-blocking work.", weight: .2, source: "github" });
  return bundle;
}

function getDemoBundle(): RepoBundle {
  return {
    owner: "acme", repo: "payments-api", repository: "https://github.com/acme/payments-api", source: "fixture", collectedAt: new Date().toISOString(),
    defaultBranch: "main", openIssueCount: 3, openPRCount: 1, latestCommitSha: "sample-abc1234", latestCommitDate: null,
    hasCI: true, ciStatus: "failing", filePaths: ["README.md", "package.json", "package-lock.json", "tests/a.test.ts", "tests/b.test.ts", "tests/c.test.ts", "tests/d.test.ts", ".github/workflows/ci.yml"], treeComplete: true,
    limitations: ["Synthetic sample only. No GitHub requests or repository code execution. Tests, coverage, vulnerability and freshness checks are unmeasured."],
    observations: [
      { category: "ci_health", signal: "ci_status", value: "failing", weight: .25, source: "github" },
      { category: "open_blockers", signal: "open_issues", value: 3, weight: .2, source: "github" },
      { category: "open_blockers", signal: "open_prs", value: 1, weight: .2, source: "github" },
    ],
  };
}
