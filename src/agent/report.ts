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
import { FALLBACK_BANNER, DEMO_BANNER } from "../shared/constants.js";

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
  const decision = assessorOutput?.decision ?? (score.total >= 71 ? "ship" : "hold");
  const confidence = assessorOutput?.confidence ?? 0;
  const isShip = decision === "ship";

  const modeNote =
    mode === "fallback"
      ? `> ⚠️ ${FALLBACK_BANNER}\n`
      : mode === "demo"
      ? `> 🔬 ${DEMO_BANNER}\n`
      : "";

  // Section 1: Title + Metadata
  const header = [
    `# 🚢 ShipClaw Release Readiness Report`,
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
  const verdictEmoji = isShip ? "✅" : "🔴";
  const verdict = [
    `## ${verdictEmoji} Verdict: ${decision.toUpperCase()}`,
    ``,
    assessorOutput?.explanation ?? `Score of ${score.total}/100 — threshold is 71 for READY.`,
    ``,
  ].join("\n");

  // Section 3: Score
  const scoreSection = [
    `## 📊 Readiness Score`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| **Total** | **${score.total} / 100** |`,
    `| **Band** | ${score.band} |`,
    `| **Status** | ${score.status.toUpperCase()} |`,
    `| **Deterministic** | ✅ Yes (computed before LLM) |`,
    ``,
  ].join("\n");

  // Section 4: Score Band
  const bandSection = [
    `## 🎯 Score Band`,
    ``,
    `\`\`\``,
    `0──────40──────71──────100`,
    `│ NOT_READY │ RISKY │ READY │`,
    `             ${"▲".padStart(Math.max(1, Math.min(score.total, 99)))}  ← ${score.total}`,
    `\`\`\``,
    ``,
  ].join("\n");

  // Section 5: Confidence
  const confidenceSection = [
    `## 🎲 Confidence`,
    ``,
    `| Confidence | Source |`,
    `|---|---|`,
    `| **${(confidence * 100).toFixed(0)}%** | ${mode === "fallback" ? "Deterministic fallback" : "Nemotron assessor"} |`,
    ``,
  ].join("\n");

  // Section 6: Time-to-Demo-Ready
  const ttsSection = [
    `## ⏱️ Time-to-Demo-Ready`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| **Min** | ${timeToShip.minMinutes} minutes |`,
    `| **Max** | ${timeToShip.maxMinutes} minutes |`,
    `| **Heuristic** | ${timeToShip.heuristic} |`,
    ``,
    `**Reasons:**`,
    timeToShip.reasons.map((r) => `- ${r}`).join("\n"),
    ``,
  ].join("\n");

  // Section 7: Score Breakdown Table
  const breakdownSection = [
    `## 🔬 Readiness Score Breakdown`,
    ``,
    `| Category | Weight | Raw Score | Weighted | Pass? | Evidence |`,
    `|---|---|---|---|---|---|`,
    ...score.categories.map(
      (c) =>
        `| ${c.name} | ${(c.weight * 100).toFixed(0)}% | ${c.rawScore}/100 | ${c.weightedScore.toFixed(1)} | ${c.pass ? "✅" : "❌"} | ${c.evidence.slice(0, 2).join("; ") || "—"} |`
    ),
    `| **TOTAL** | 100% | — | **${score.total}** | ${isShip ? "✅" : "❌"} | — |`,
    ``,
  ].join("\n");

  // Section 8: Top Blockers
  const blockers = assessorOutput?.blockers ?? score.categories.filter((c) => !c.pass).map((c) => c.name);
  const blockersSection = [
    `## 🚧 Top Blockers`,
    ``,
    blockers.length > 0
      ? blockers.map((b) => `- ${b}`).join("\n")
      : "_No blockers detected._",
    ``,
  ].join("\n");

  // Section 9: Release Risk Fingerprint
  const fingerprintSection = [
    `## 🔍 Release Risk Fingerprint`,
    ``,
    `> Based on: ${riskFingerprint.basedOnMemory ? `${riskFingerprint.memoryGenerationCount} prior run(s)` : "first run — no prior memory"}`,
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
    `## ⏳ Time-to-Ship Estimate`,
    ``,
    `| Range | Minutes |`,
    `|---|---|`,
    `| Minimum | ${timeToShip.minMinutes} |`,
    `| Maximum | ${timeToShip.maxMinutes} |`,
    ``,
  ].join("\n");

  // Section 11: Recommended Fix Order
  const fixOrderSection = [
    `## 🛠️ Recommended Fix Order`,
    ``,
    (assessorOutput?.recommendedActions ?? []).length > 0
      ? assessorOutput!.recommendedActions.map((a, i) => `${i + 1}. ${a}`).join("\n")
      : "_No specific actions recommended._",
    ``,
  ].join("\n");

  // Section 12: Approval-Gated Actions
  const approvalSection = [
    `## 🔐 Approval-Gated Actions`,
    ``,
    `All destructive or external-write actions require human approval via:`,
    `\`POST /api/approvals/:id/approve\``,
    ``,
  ].join("\n");

  // Section 13: External Evidence Status
  const evidenceSection = [
    `## 🌐 External Evidence Status`,
    ``,
    evidence.length > 0
      ? [
          `| Source | Query | Snippet | Relevance |`,
          `|---|---|---|---|`,
          ...evidence.map(
            (e) =>
              `| ${e.source} | ${e.query.slice(0, 40)} | ${e.snippet.slice(0, 60)}… | ${(e.relevanceScore * 100).toFixed(0)}% |`
          ),
        ].join("\n")
      : "_Exa external evidence disabled or no results._",
    ``,
  ].join("\n");

  // Section 14: Audit Summary + Mode Label
  const auditSection = [
    `## 📋 Audit Summary`,
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
  const decision = assessorOutput?.decision ?? (score.total >= 71 ? "ship" : "hold");
  const blockers = assessorOutput?.blockers ?? score.categories.filter((c) => !c.pass).map((c) => c.name);

  return [
    `## ShipClaw Release Readiness Assessment`,
    ``,
    `**Verdict:** ${decision.toUpperCase()} | **Score:** ${score.total}/100 (${score.band}) | **Mode:** ${mode}`,
    ``,
    `### Time-to-Demo-Ready`,
    `${timeToShip.minMinutes}–${timeToShip.maxMinutes} minutes`,
    ``,
    `### Blocker Checklist`,
    blockers.length > 0
      ? blockers.map((b) => `- [ ] ${b}`).join("\n")
      : "- [x] No blockers detected",
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
      ? `\n> ⚠️ ${mode === "fallback" ? "SYNTHETIC FALLBACK" : "DEMO"} MODE — not real analysis`
      : "",
    ``,
  ].join("\n");
}
