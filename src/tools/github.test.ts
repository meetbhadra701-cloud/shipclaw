import { afterEach, describe, expect, it, vi } from "vitest";
import { getRepoBundle, parseGitHubUrl } from "./github.js";
import { scanImportantFiles } from "./repo.js";
import { calculateReadinessScore } from "../agent/scorer.js";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
function mockRepo(options: { paths?: string[]; truncated?: boolean; runs?: unknown[]; total?: number; fail?: string; empty?: boolean } = {}) {
  return vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (options.fail && url.includes(options.fail)) return json({}, 403);
    if (url.includes("/search/issues")) return json({ total_count: url.includes("is%3Apr") ? 2 : 7, incomplete_results: false });
    if (url.includes("/commits/")) return options.empty ? json({}, 409) : json({ sha: "commit123", commit: { committer: { date: "2026-09-29T00:00:00Z" }, tree: { sha: "tree123" } } });
    if (url.includes("/git/trees/")) return json({ truncated: options.truncated ?? false, tree: (options.paths ?? ["README.md", "SECURITY.md", "package.json", "package-lock.json", "tests/a.test.ts"]).map(path => ({ path, type: "blob", mode: "100644" })) });
    if (url.includes("/actions/runs")) return json({ total_count: options.total ?? options.runs?.length ?? 0, workflow_runs: options.runs ?? [] });
    return json({ full_name: "owner/repo", default_branch: "main", private: false });
  }));
}
const run = (conclusion: string | null, overrides = {}) => ({ workflow_id: 1, run_number: 1, run_attempt: 1, head_sha: "commit123", status: conclusion ? "completed" : "in_progress", conclusion, ...overrides });

describe("read-only GitHub evidence", () => {
  it.each(["http://github.com/a/b", "https://evil.com/a/b", "https://github.com/a/b/tree/main", "https://token@github.com/a/b", "https://github.com/a/b?x=y", "file:///etc/passwd", "https://github.com/a/.."])("rejects unsafe/non-repository URL %s", url => {
    expect(() => parseGitHubUrl(url)).toThrow();
  });
  it("normalizes .git suffix without changing identity", () => expect(parseGitHubUrl("https://github.com/a/b.git/").url).toBe("https://github.com/a/b"));
  it("collects pinned identity, exact separate counts, and file indicators", async () => {
    mockRepo({ runs: [run("success")] });
    const bundle = await getRepoBundle("https://github.com/owner/repo", { demo: false });
    const scan = await scanImportantFiles(bundle);
    expect(bundle).toMatchObject({ source: "github", latestCommitSha: "commit123", openIssueCount: 7, openPRCount: 2, ciStatus: "passing" });
    expect(scan).toMatchObject({ hasReadme: true, hasChangelog: false, hasSecurityPolicy: true, hasLockFile: true, testFileCount: 1, dependencyManifests: ["package.json"] });
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/git/trees/tree123"))).toBe(true);
    expect(bundle.observations.some(o => o.signal === "open_issues")).toBe(false);
    expect(scan.observations.find(o => o.signal === "outdated_major")?.status).toBe("unknown");
  });
  it("uses only latest workflow attempts at the inspected head", async () => {
    mockRepo({ runs: [run("failure"), run("success", { run_attempt: 2 }), run("failure", { head_sha: "old" })] });
    expect((await getRepoBundle("https://github.com/owner/repo", { demo: false })).ciStatus).toBe("passing");
  });
  it.each([[], [run(null)], [run("skipped")], [run("success", { head_sha: "old" })]].map(runs => ({ runs })))("keeps missing/pending/skipped/stale CI unknown", async ({ runs }) => {
    mockRepo({ runs });
    expect((await getRepoBundle("https://github.com/owner/repo", { demo: false })).ciStatus).toBe("unknown");
  });
  it("does not claim passing when Actions results are truncated", async () => {
    mockRepo({ runs: [run("success")], total: 101 });
    expect((await getRepoBundle("https://github.com/owner/repo", { demo: false })).ciStatus).toBe("unknown");
  });
  it("preserves measured failure even with incomplete Actions listing", async () => {
    mockRepo({ runs: [run("failure")], total: 101 });
    expect((await getRepoBundle("https://github.com/owner/repo", { demo: false })).ciStatus).toBe("failing");
  });
  it("never turns missing paths in a truncated tree into measured absence", async () => {
    mockRepo({ paths: ["README.md"], truncated: true });
    const scan = await scanImportantFiles(await getRepoBundle("https://github.com/owner/repo", { demo: false }));
    expect(scan).toMatchObject({ hasReadme: true, hasChangelog: null, hasSecurityPolicy: null, testFileCount: null });
  });
  it("partial API failure preserves metadata and marks unmeasured signals", async () => {
    mockRepo({ fail: "/git/trees/" });
    const bundle = await getRepoBundle("https://github.com/owner/repo", { demo: false });
    expect(bundle.latestCommitSha).toBe("commit123");
    expect(bundle.limitations.join(" ")).toContain("rate limit");
    expect((await scanImportantFiles(bundle)).hasReadme).toBeNull();
  });
  it("empty repository never acquires sample evidence", async () => {
    mockRepo({ empty: true });
    const bundle = await getRepoBundle("https://github.com/owner/repo", { demo: false });
    expect(bundle.filePaths).toEqual([]);
    expect(bundle.latestCommitSha).toBeNull();
    const score = calculateReadinessScore({ observations: [...bundle.observations, ...(await scanImportantFiles(bundle)).observations], runId: "empty", mode: "live" });
    expect(score).toMatchObject({ evidenceCoverage: 0, total: 0, possibleTotal: 100 });
  });
  it.each([404, 403, 429, 500, 401])("fails clearly on metadata HTTP %i without fixtures or response-body secrets", async status => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "secret-token" }, status)));
    await expect(getRepoBundle("https://github.com/owner/repo", { demo: false })).rejects.not.toThrow("secret-token");
  });
  it("does not expose fetch error text or tokens", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("secret-token"); }));
    await expect(getRepoBundle("https://github.com/owner/repo", { demo: false })).rejects.toThrow("GitHub request failed");
  });
  it("keeps demo explicit and isolated from live runs", async () => {
    mockRepo(); vi.stubEnv("DEMO_MODE", "true");
    expect((await getRepoBundle("sample", { demo: true })).source).toBe("fixture");
    expect(fetch).not.toHaveBeenCalled();
    expect((await getRepoBundle("https://github.com/owner/repo", { demo: false })).source).toBe("github");
  });
});
