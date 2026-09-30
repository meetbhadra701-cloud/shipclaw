/** Inspect the pinned GitHub tree; presence is not execution or content quality. */
import type { Observation } from "../shared/types.js";
import { getRepoBundle, type RepoBundle } from "./github.js";

export interface RepoScanResult {
  hasReadme: boolean | null; hasChangelog: boolean | null; hasTests: boolean | null;
  testFileCount: number | null; hasLockFile: boolean | null; hasSecurityPolicy: boolean | null;
  dependencyManifests: string[]; observations: Observation[];
}
export async function scanImportantFiles(repo: string | RepoBundle): Promise<RepoScanResult> {
  const bundle = typeof repo === "string" ? await getRepoBundle(repo) : repo;
  const paths = bundle.filePaths;
  const presence = (pattern: RegExp) => paths.some(p => pattern.test(p)) ? true : bundle.treeComplete ? false : null;
  const hasReadme = presence(/^(?:README(?:\.[^/]+)?|\.github\/README(?:\.[^/]+)?|docs\/README(?:\.[^/]+)?)$/i);
  const hasChangelog = presence(/(?:^|\/)(?:CHANGELOG|CHANGES|HISTORY)(?:\.[^/]+)?$/i);
  const hasSecurityPolicy = presence(/^(?:\.github\/|docs\/)?SECURITY(?:\.md|\.rst|\.txt)?$/i);
  const hasLockFile = presence(/(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|Gemfile\.lock|composer\.lock|go\.sum|packages\.lock\.json)$/);
  const testPaths = paths.filter(p => /(?:^|\/)(?:tests?|__tests__|spec)\/|(?:\.test\.|\.spec\.|_test\.[^/]+$|\/test_[^/]+\.py$)/i.test(p));
  const testFileCount = bundle.treeComplete ? testPaths.length : null;
  const dependencyManifests = paths.filter(p => /(?:^|\/)(?:package\.json|Cargo\.toml|pyproject\.toml|requirements[^/]*\.txt|go\.mod|Gemfile|composer\.json|pom\.xml|build\.gradle(?:\.kts)?|[^/]+\.csproj)$/i.test(p));
  const observations: Observation[] = [];
  for (const [category, signal, value] of [
    ["documentation", "has_readme", hasReadme], ["documentation", "has_changelog", hasChangelog],
    ["test_coverage", "test_file_count", testFileCount], ["security", "has_security_policy", hasSecurityPolicy],
  ] as const) observations.push({ category, signal, value: value ?? "unknown", status: value === null ? "unknown" : "measured", reason: value === null ? "File tree unavailable or truncated." : undefined, source: "repo_scan", weight: 0, url: bundle.latestCommitSha ? `${bundle.repository}/tree/${bundle.latestCommitSha}` : undefined });
  // Manifest/lock presence is useful context but cannot establish dependency freshness.
  observations.push({ category: "dependency_freshness", signal: "outdated_major", value: "unknown", status: "unknown", reason: `Dependency freshness unmeasured; ${dependencyManifests.length} manifest indicator(s), lockfile ${hasLockFile === null ? "unknown" : hasLockFile ? "present" : "absent"}. No package installation or registry audit performed.`, source: "repo_scan", weight: .1 });
  return { hasReadme, hasChangelog, hasSecurityPolicy, hasLockFile, hasTests: testPaths.length ? true : bundle.treeComplete ? false : null, testFileCount, dependencyManifests, observations };
}
