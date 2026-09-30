/**
 * ShipClaw — Report Generator
 * Claude-primary file.
 *
 * Writes 6 artifacts per run to runs/<runId>/:
 *   SHIPCLAW_READINESS.md  — polished judge-visible artifact (14 sections)
 *   github_issue_draft.md  — 7-section draft
 *   audit.jsonl            — written incrementally by loop; finalized here
 *   memory_before.jsonl    — written by MemoryManager
 *   memory_after.jsonl     — written by MemoryManager
 *   memory_diff.md         — written by MemoryManager
 */
import { writeFileSync } from "fs";
import { resolve } from "path";
import type {
  Run,
  ReadinessScore,
  RiskFingerprint,
  TimeToShipEstimate,
  AssessorOutput,
  ExternalEvidence,
} from "../shared/types.js";
import { decisionForScore } from "./scorer.js";
import { FALLBACK_BANNER, DEMO_BANNER, EXA_ENABLED } from "../shared/constants.js";

// ─── Report Input ─────────────────────────────────────────────────────────────

export interface ReportInput {
  run: Run;
  artifactDir: string;
  score: ReadinessScore;
  riskFingerprint: RiskFingerprint;
  timeToShip: TimeToShipEstimate;
  assessorOutput: AssessorOutput | null;
  evidence: ExternalEvidence[];
  auditLog: Array<{ actor: string; action: string; detail?: string; createdAt: string }>;
  mode: import("../shared/types.js").RunMode;
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export async function generateReport(input: ReportInput): Promise<void> {
  const { run, artifactDir } = input;
  if (!artifactDir) throw new Error("artifactDir must be set before generateReport()");

  writeFileSync(resolve(artifactDir, "SHIPCLAW_READINESS.md"), buildReadinessMd(input));
  writeFileSync(resolve(artifactDir, "github_issue_draft.md"), buildIssueDraftMd(input));
  // audit.jsonl is written incrementally by the loop; we don't overwrite it here
}

// ─── SHIPCLAW_READINESS.md (14 sections) ─────────────────────────────────────

function buildReadinessMd(input: ReportInput): string {
  const { run, score, riskFingerprint, timeToShip, assessorOutput, evidence, auditLog, mode } = input;
  const { id: runId, goal, repo, startedAt, finishedAt } = run;
  const decision = decisionForScore(score);
  const confidence = assessorOutput?.mode === "live" && assessorOutput.confidence !== null ? `${Math.round(assessorOutput.confidence * 100)}% (model-reported, not calibrated)` : "Not measured";
  const isShip = decision === "ship";

  const modeNote =
    mode === "fallback"
      ? `> ${FALLBACK_BANNER}\n`
      : mode === "demo"
      ? `> ${DEMO_BANNER}\n`
      : "";

  // Section 1: Title + Metadata
  const header = [
    `# ShipClaw Release Readiness Report`,
    ``,
    modeNote,
    `| Field | Value |`,
    `|---|---|`,
    `| **Run ID** | \`${runId}\` |`,
    `| **Goal** | ${goal} |`,
    `| **Repository** | ${repo} |`,
    `| **Mode** | ${mode} |`,
    `| **Started** | ${startedAt} |`,
    `| **Finished** | ${finishedAt ?? "—"} |`,
    ``,
  ].join("\n");

  // Section 2: Verdict
  const verdict = [
    `## Verdict: ${decision.toUpperCase()}`,
    ``,
    assessorOutput?.explanation ?? `Earned evidence points: ${score.total}/100. SHIP requires 71 points and all categories measured; unknowns are not failures.`,
    ``,
  ].join("\n");

  // Section 3: Score
  const scoreSection = [
    `## Readiness Score`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| **Total** | **${score.total} / 100** |`,
    `| **Band** | ${score.band} |`,
    `| **Status** | ${score.status.toUpperCase()} |`,
    `| **Deterministic** | ✅ Yes (computed before LLM) |`,
    `| **Measured category weight** | ${Math.round((score.evidenceCoverage ?? 1) * 100)}% |`,
    `| **Possible score including unknowns** | ${score.total}–${score.possibleTotal ?? score.total} |`,
    `Unknown categories earn no points, not a failing measurement. SHIP requires 71+ AND all categories measured. File presence is a proxy, never proof of coverage or security. Raw observations and limitations: evidence.json.`,
    ``,
  ].join("\n");

  // Section 4: Score Band
  const bandSection = [
    `## Score Band`,
    ``,
    `\`\`\``,
    `0──────40──────71──────100`,
    `│ NOT_READY │ RISKY │ READY │`,
    `${"▲".padStart(Math.round((score.total / 100) * 24) + 1)}  ← ${score.total}`,
    `\`\`\``,
    ``,
  ].join("\n");

  // Section 5: Confidence
  const confidenceSection = [
    `## Confidence`,
    ``,
    `| Confidence | Source |`,
    `|---|---|`,
    `| ${confidence} | ${assessorOutput?.source ?? (assessorOutput?.mode === "fallback" ? "deterministic_fallback" : "unavailable")} |`,
    ``,
  ].join("\n");

  // Section 6: Illustrative remediation effort
  const ttsSection = [
    `## Illustrative remediation effort`,
    `Not a ship date. Unknown work is excluded. ${timeToShip.minMinutes === 0 ? "No measured weaknesses to estimate; effort unmeasured." : ""}`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| **Min** | ${timeToShip.status === "unmeasured" ? "Unmeasured" : timeToShip.minMinutes + " minutes"} |`,
    `| **Max** | ${timeToShip.status === "unmeasured" ? "Unmeasured" : timeToShip.maxMinutes + " minutes"} |`,
    `| **Heuristic** | ${timeToShip.heuristic} |`,
    ``,
    `**Reasons:**`,
    timeToShip.reasons.map((r) => `- ${r}`).join("\n"),
    ``,
  ].join("\n");

  // Section 7: Score Breakdown Table
  const breakdownSection = [
    `## Readiness Score Breakdown`,
    ``,
    `| Category | Weight | Raw Score | Weighted | Pass? | Evidence |`,
    `|---|---|---|---|---|---|`,
    ...score.categories.map(
      (c) =>
        `| ${c.name} | ${(c.weight * 100).toFixed(0)}% | ${c.measurement === "unknown" ? "Unmeasured" : c.rawScore + "/100"} | ${c.weightedScore.toFixed(1)} | ${c.measurement === "unknown" ? "Unknown" : c.pass ? "✅" : "❌"} | ${c.evidence.slice(0, 2).join("; ") || "—"} |`
    ),
    `| **TOTAL** | 100% | — | **${score.total}** | ${isShip ? "✅" : "❌"} | — |`,
    ``,
  ].join("\n");

  // Section 8: Top Blockers
  const blockers = assessorOutput?.blockers ?? score.categories.filter((c) => c.measurement !== "unknown" && !c.pass).map((c) => c.name);
  const blockersSection = [
    `## Top Blockers`,
    ``,
    blockers.length > 0
      ? blockers.map((b) => `- ${b}`).join("\n")
      : "_No measured weaknesses identified; unknown evidence is not a pass._",
    ``,
  ].join("\n");

  // Section 9: Release Risk Fingerprint
  const fingerprintSection = [
    `## Release Risk Fingerprint`,
    ``,
    `> Current measured categories only. ${riskFingerprint.memoryGenerationCount} prior run(s) recorded; memory does not alter risk signals.`,
    ``,
    `| Severity | Signal | Detail | From Memory? |`,
    `|---|---|---|---|`,
    ...(riskFingerprint.items.length > 0
      ? riskFingerprint.items.map(
          (r) =>
            `| ${r.severity.toUpperCase()} | ${r.signal} | ${r.detail} | ${r.fromMemory ? "✅" : "—"} |`
        )
      : [`| — | No risk signals detected | — | — |`]),
    ``,
  ].join("\n");

  // Section 10: Time-to-Ship Table
  const ttsTableSection = [
    `## Effort heuristic (not a ship date)`,
    ``,
    `| Range | Minutes |`,
    `|---|---|`,
    `| Minimum | ${timeToShip.status === "unmeasured" ? "Unmeasured" : timeToShip.minMinutes} |`,
    `| Maximum | ${timeToShip.status === "unmeasured" ? "Unmeasured" : timeToShip.maxMinutes} |`,
    ``,
  ].join("\n");

  // Section 11: Recommended Fix Order
  const fixOrderSection = [
    `## Recommended Fix Order`,
    ``,
    (assessorOutput?.recommendedActions ?? []).length > 0
      ? assessorOutput!.recommendedActions.map((a, i) => `${i + 1}. ${a}`).join("\n")
      : "_No specific actions recommended._",
    ``,
  ].join("\n");

  // Section 12: Approval-Gated Actions
  const approvalSection = [
    `## Proposed-action review`,
    ``,
    `Review records acceptance or rejection only. No repository writes or action execution exist. The run does not pause. The report is a completion snapshot; subsequent review decisions are in the audit log.`,
    `\`POST /api/approvals/:id/approve\``,
    ``,
  ].join("\n");

  // Section 13: External Evidence Status
  const exaApiKey = !!process.env["EXA_API_KEY"];
  const exaStatusLabel = mode === "demo" ? "disabled for sample mode" : !EXA_ENABLED
    ? "skipped — set `ENABLE_EXA=true` to enable"
    : !exaApiKey
    ? "skipped — `EXA_API_KEY` not configured"
    : evidence.length > 0
    ? `live — ${evidence.length} result(s) retrieved from Exa`
    : "no results — not requested, unavailable, or no matches (see audit log)";

  const evidenceSection = [
    `## External Evidence Check`,
    ``,
    `**Status:** ${exaStatusLabel}`,
    ``,
    evidence.length > 0
      ? [
          `> All results are labeled as External Evidence. Exa does not override direct repo evidence.`,
          `> If Exa disagrees with repo findings, both are shown and uncertainty is noted.`,
          ``,
          `| Source | Title | Query | Excerpt | Relevance | Risk Signal |`,
          `|---|---|---|---|---|---|`,
          ...evidence.map(
            (e) =>
              `| External Evidence (${e.source}) | ${(e.sourceTitle ?? e.source).slice(0, 40)} | ${e.query.slice(0, 35)}… | ${e.snippet.slice(0, 70)}… | ${e.relevance ?? ((e.relevanceScore * 100).toFixed(0) + "%")} | ${e.riskSignal ?? "neutral"} |`
          ),
        ].join("\n")
      : !EXA_ENABLED
      ? `_External evidence is disabled. No Exa searches were performed._\n\n_To enable: set \`ENABLE_EXA=true\` and \`EXA_API_KEY\` in \`.env.local\`._`
      : `_No external evidence retrieved._`,
    ``,
  ].join("\n");

  // Section 14: Audit Summary + Mode Label
  const auditSection = [
    `## Audit Summary`,
    ``,
    `| Actor | Action | Detail | Time |`,
    `|---|---|---|---|`,
    ...auditLog.slice(-10).map(
      (a) => `| ${a.actor} | ${a.action} | ${a.detail ?? "—"} | ${a.createdAt} |`
    ),
    ``,
    `---`,
    ``,
    `*Generated by ShipClaw · Run \`${runId}\` · Mode: \`${mode}\`*`,
    mode !== "live"
      ? `\n> **${mode === "fallback" ? FALLBACK_BANNER : DEMO_BANNER}**`
      : "",
    ``,
  ].join("\n");

  return [
    header,
    verdict,
    scoreSection,
    bandSection,
    confidenceSection,
    ttsSection,
    breakdownSection,
    blockersSection,
    fingerprintSection,
    ttsTableSection,
    fixOrderSection,
    approvalSection,
    evidenceSection,
    auditSection,
  ].join("\n");
}

// ─── github_issue_draft.md (7 sections) ──────────────────────────────────────

function buildIssueDraftMd(input: ReportInput): string {
  const { run, score, timeToShip, assessorOutput, mode } = input;
  const decision = decisionForScore(score);
  const blockers = assessorOutput?.blockers ?? score.categories.filter((c) => c.measurement !== "unknown" && !c.pass).map((c) => c.name);

  return [
    `## ShipClaw Release Readiness Assessment`,
    ``,
    `**Verdict:** ${decision.toUpperCase()} | **Score:** ${score.total}/100 (${score.band}) | **Mode:** ${mode}`,
    ``,
    `### Illustrative remediation effort`,
    timeToShip.status === "unmeasured" ? "Unmeasured; no measured weaknesses to estimate." : `${timeToShip.minMinutes}–${timeToShip.maxMinutes} illustrative minutes for observed weaknesses only; unknown work excluded. Not a release ETA.`,
    ``,
    `### Blocker Checklist`,
    blockers.length > 0
      ? blockers.map((b) => `- [ ] ${b}`).join("\n")
      : "- [ ] Verify unmeasured areas; no measured weaknesses identified",
    ``,
    `### Evidence`,
    score.categories
      .flatMap((c) => c.evidence)
      .slice(0, 5)
      .map((e) => `- ${e}`)
      .join("\n"),
    ``,
    `### Suggested Fix Order`,
    (assessorOutput?.recommendedActions ?? []).map((a, i) => `${i + 1}. ${a}`).join("\n") || "_No specific actions._",
    ``,
    `---`,
    `*Generated by [ShipClaw](https://github.com/meetbhadra701-cloud/shipclaw) · Run \`${run.id}\`*`,
    mode !== "live"
      ? `\n> ${mode === "fallback" ? "SYNTHETIC FALLBACK" : "DEMO"} MODE — not real analysis`
      : "",
    ``,
  ].join("\n");
}
