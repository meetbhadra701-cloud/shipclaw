/**
 * Presentation helpers. Pure functions only — no React, no process.env.
 */
import type { ScoreBand } from "../../shared/types.js";
import { CATEGORY_PASS_THRESHOLD } from "../../shared/heuristics.js";

export type Tone = "ready" | "risky" | "not-ready" | "neutral";

export function bandTone(band: ScoreBand | null | undefined): Tone {
  if (band === "READY") return "ready";
  if (band === "RISKY") return "risky";
  if (band === "NOT_READY") return "not-ready";
  return "neutral";
}

export const BAND_LABEL: Record<ScoreBand, string> = {
  READY: "Ready",
  RISKY: "Risky",
  NOT_READY: "Not ready",
};

export const CATEGORY_LABEL: Record<string, string> = {
  ci_health: "Actions status",
  test_coverage: "Test indicators",
  open_blockers: "Open blockers",
  documentation: "Documentation",
  security: "Security policy",
  dependency_freshness: "Dependencies",
};

export const CATEGORY_CHECKS: Record<string, string> = {
  ci_health: "Actions results at the inspected commit",
  test_coverage: "File-name indicators; execution and coverage unmeasured",
  open_blockers: "Counts are context; release-blocker triage unmeasured",
  documentation: "README and CHANGELOG",
  security: "Policy presence only; vulnerabilities unmeasured",
  dependency_freshness: "Manifests and locks observed; freshness unmeasured",
};

export function categoryLabel(name: string): string {
  return CATEGORY_LABEL[name] ?? humanize(name);
}

export function humanize(s: string): string {
  const t = s.replace(/[_.]+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** 105 → "1h 45m", 45 → "45m", 120 → "2h" */
export function formatMinutes(total: number): string {
  const m = Math.round(total);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

export function formatMs(ms: number): string {
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

/** "https://github.com/acme/api(.git)" → "acme/api"; anything else is returned trimmed. */
export function shortRepo(repo: string): string {
  const m = /github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i.exec(repo.trim());
  return m ? `${m[1]}/${m[2]}` : repo.trim();
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Evidence parsing ─────────────────────────────────────────────────────────
// scorer.ts writes evidence as: `${source} ${category}.${signal}=${value} -> ${score}/100`
// or, when a category has no observations: `No ${category} observations found; ...`

export interface ParsedEvidence {
  kind: "observation";
  source: string;
  category: string;
  signal: string;
  value: string;
  score: number;
  raw: string;
}

export interface DefaultEvidence {
  kind: "default";
  raw: string;
}

const EVIDENCE_RE = /^(\S+) ([a-z_]+)\.(.+?)=(.*) -> (\d+)\/100$/;

export function parseEvidence(raw: string): ParsedEvidence | DefaultEvidence {
  const m = EVIDENCE_RE.exec(raw);
  if (!m) return { kind: "default", raw };
  return {
    kind: "observation",
    source: m[1] ?? "",
    category: m[2] ?? "",
    signal: m[3] ?? "",
    value: m[4] ?? "",
    score: Number(m[5]),
    raw,
  };
}

const SIGNAL_LABEL: Record<string, string> = {
  ci_status: "Observed Actions status",
  ci_passing: "CI passing",
  last_workflow_run: "Last workflow run",
  "npm run typecheck": "Typecheck",
  "npm test": "Test run",
  open_issues: "Open issues",
  open_critical_issues: "Open critical issues",
  open_prs: "Open pull requests",
  open_prs_without_review: "PRs without review",
  has_readme: "README",
  has_changelog: "CHANGELOG",
  changelog_exists: "CHANGELOG",
  test_file_count: "Test files",
  test_files_found: "Test files",
  test_files: "Test files",
  coverage_percent: "Coverage",
  has_security_policy: "Repository SECURITY policy",
  dependabot_alerts: "Dependabot alerts",
  env_secrets_exposed: "Exposed secrets",
  outdated_major: "Outdated majors",
};

export function signalLabel(signal: string): string {
  return SIGNAL_LABEL[signal] ?? humanize(signal);
}

export function valueLabel(signal: string, value: string): string {
  const v = value.toLowerCase();
  if (signal.startsWith("has_") || signal === "changelog_exists") {
    if (v === "true") return "present";
    if (v === "false") return "missing";
  }
  if (signal === "coverage_percent") return `${value}%`;
  return value;
}

export const SOURCE_LABEL: Record<string, string> = {
  github: "GitHub",
  repo_scan: "Repo scan",
  shell: "Safe check",
  memory: "Memory",
  manual: "Manual",
};

/** Rule-based, evidence-derived suggestion for what to fix. Not model output. */
const FIX_HINT: Record<string, string> = {
  ci_status: "Get the failing CI workflow green",
  ci_passing: "Get the failing CI workflow green",
  last_workflow_run: "Re-run and fix the last failing workflow",
  "npm run typecheck": "Fix type errors",
  "npm test": "Fix failing tests",
  open_issues: "Triage or close open issues before release",
  open_critical_issues: "Resolve open critical issues",
  open_prs: "Review, merge or close open pull requests",
  open_prs_without_review: "Get pending pull requests reviewed",
  has_readme: "Add a README",
  has_changelog: "Add a CHANGELOG entry for this release",
  changelog_exists: "Add a CHANGELOG entry for this release",
  test_file_count: "Add tests for the critical paths",
  test_files_found: "Add tests for the critical paths",
  coverage_percent: "Raise test coverage on changed code",
  has_security_policy: "Add a SECURITY.md disclosure policy",
  dependabot_alerts: "Resolve open Dependabot alerts",
  env_secrets_exposed: "Remove and rotate exposed secrets",
  outdated_major: "Upgrade outdated major dependencies",
};

export function fixHint(signal: string | null): string {
  if (!signal) return "No evidence was collected — verify this area manually";
  return FIX_HINT[signal] ?? `Improve ${signalLabel(signal).toLowerCase()}`;
}

/** The observations in a category that pulled its score down (or the default marker). */
export function weakEvidence(evidence: string[]): Array<ParsedEvidence | DefaultEvidence> {
  const parsed = evidence.map(parseEvidence);
  const weak = parsed.filter((p) => p.kind === "default" || p.score < CATEGORY_PASS_THRESHOLD);
  return weak.length > 0 ? weak : parsed.slice(0, 1);
}

export function describeEvidence(e: ParsedEvidence | DefaultEvidence): string {
  if (e.kind === "default") return e.raw;
  return `${signalLabel(e.signal)}: ${valueLabel(e.signal, e.value)}`;
}
