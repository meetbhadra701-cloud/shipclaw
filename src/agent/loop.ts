/**
 * ShipClaw — Agent Loop Spine
 * Claude-primary file. Do NOT rewrite without explicit COMMUNICATION_LOG.md coordination.
 *
 * 17-state machine. Emits all 14 AgentEvent types (state_entered once per state).
 * Deterministic score is computed BEFORE Nemotron is called.
 * Memory captured before + after; diff written to artifact dir.
 * Read-only repository analysis. Proposed-action review never executes actions.
 */
import { mkdirSync, appendFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { nanoid } from "nanoid";
import type {
  AgentEvent,
  Run,
  ReadinessScore,
  RiskFingerprint,
  TimeToShipEstimate,
  AssessorOutput,
  Approval,
  MemorySnapshot,
  PublicPlan,
  AgentState,
} from "../shared/types.js";
import { getDb, type IDb } from "../storage/db.js";
import { MemoryManager, MEMORY_KEYS } from "./memory.js";
import { calculateReadinessScore, decisionForScore } from "./scorer.js";
import { buildRiskFingerprint } from "./riskFingerprint.js";
import { estimateTimeToShip } from "./timeToShip.js";
import { assess } from "./assessor.js";
import { getRepoBundle, type RepoBundle } from "../tools/github.js";
import { scanImportantFiles } from "../tools/repo.js";
import { searchExternalEvidence, assessmentNeedsExternalEvidence, buildExaQueries } from "../tools/exa.js";
import { generateReport } from "./report.js";
import { EXA_ENABLED, DEMO_BANNER, FALLBACK_BANNER } from "../shared/constants.js";

// ─── State Machine ────────────────────────────────────────────────────────────

type LoopState = AgentState;

// ─── Loop Config ──────────────────────────────────────────────────────────────

export interface LoopConfig {
  demo?: boolean;
  goal: string;
  repo: string;
  autoApproveLocal?: boolean;   // true in demo/test mode
  onEvent?: (event: AgentEvent) => void;
  /** Optional pre-assigned run ID (the API server assigns one so it can respond immediately) */
  runId?: string;
}

// ─── Loop Result ──────────────────────────────────────────────────────────────

export interface LoopResult {
  run: Run;
  score: ReadinessScore;
  riskFingerprint: RiskFingerprint;
  timeToShip: TimeToShipEstimate;
  assessorOutput: AssessorOutput | null;
  artifactDir: string;
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

export async function runAgentLoop(config: LoopConfig): Promise<LoopResult> {
  const db = getDb();
  const runId = config.runId ?? nanoid(12);
  const isDemoMode = config.demo ?? process.env["DEMO_MODE"] === "true";
  const mode = isDemoMode ? "demo" : "live";
  const artifactDir = resolve("runs", runId);

  mkdirSync(artifactDir, { recursive: true });

  const run: Run = {
    id: runId,
    goal: config.goal,
    repo: config.repo,
    mode,
    status: "initializing",
    startedAt: new Date().toISOString(),
    artifactDir,
  };

  db.createRun(run);
  db.audit(runId, "system", "run_created", `goal=${config.goal} repo=${config.repo} mode=${mode}`);

  if (isDemoMode) console.log("\n" + DEMO_BANNER);


  const emit = (event: AgentEvent) => {
    db.insertEvent(event);
    appendFileSync(resolve(artifactDir, "audit.jsonl"), JSON.stringify(event) + "\n");
    config.onEvent?.(event);
  };

  const ts = () => new Date().toISOString();

  // ── Shared state across states ──────────────────────────────────────────────
  let memoryManager!: MemoryManager;
  let memoryBefore!: MemorySnapshot;
  let priorRunCount = 0;
  let observations: import("../shared/types.js").Observation[] = [];
  let bundle!: RepoBundle;
  let score!: ReadinessScore;
  let riskFingerprint!: RiskFingerprint;
  let timeToShip!: TimeToShipEstimate;
  let assessorOutput: AssessorOutput | null = null;
  let pendingActions: string[] = [];

  let state: LoopState = "INIT";

  // ─── State Machine ──────────────────────────────────────────────────────────
  while (state !== "FINALIZE") {
    db.updateRun(runId, { status: "running" });
    // Every state transition is observable (SSE + audit.jsonl) with its own timestamp.
    emit({ type: "state_entered", runId, ts: ts(), state });

    switch (state) {

      // ── INIT ──────────────────────────────────────────────────────────────
      case "INIT": {
        emit({ type: "goal_received", runId, ts: ts(), goal: config.goal });
        state = "LOAD_MEMORY";
        break;
      }

      // ── LOAD_MEMORY ───────────────────────────────────────────────────────
      case "LOAD_MEMORY": {
        memoryManager = new MemoryManager(db, runId, artifactDir);
        memoryBefore = memoryManager.captureBeforeSnapshot();
        priorRunCount = parseInt(db.getMemory(MEMORY_KEYS.totalRuns) ?? "0", 10);

        emit({
          type: "memory_loaded",
          runId,
          ts: ts(),
          itemCount: memoryBefore.items.length,
          basedOnMemory: priorRunCount > 0,
        });
        state = "PLAN";
        break;
      }

      // ── PLAN ──────────────────────────────────────────────────────────────
      case "PLAN": {
        const plan: PublicPlan = {
          goal: config.goal,
          steps: [
            "Fetch GitHub repository metadata",
            "Scan important files in repo",
            "Record checks not run (read-only analysis)",
            "Calculate deterministic readiness score",
            "Build Release Risk Fingerprint",
            "Estimate time-to-ship",
            EXA_ENABLED ? "Fetch optional Exa external evidence" : "Skip Exa (disabled)",
            "Assess with Nemotron (explains score, does not invent it)",
            "Propose actions for review; no execution",
            "Update memory and write artifacts",
          ],
          estimatedSteps: 10,
          constraints: [
            mode === "demo" ? "DEMO MODE — fixture data" : "LIVE MODE",
            EXA_ENABLED ? "Exa enabled (max 3 searches)" : "Exa disabled",
            config.autoApproveLocal ? "Automatically record proposal acceptance; no execution" : "Review records decisions only; no execution",
          ],
        };
        emit({ type: "plan_created", runId, ts: ts(), plan });
        state = "FETCH_GITHUB_DATA";
        break;
      }

      // ── FETCH_GITHUB_DATA ─────────────────────────────────────────────────
      case "FETCH_GITHUB_DATA": {
        emit({ type: "tool_call_started", runId, ts: ts(), tool: "github.getRepoBundle", args: { repo: config.repo } });
        const t0 = Date.now();
        try {
          bundle = await getRepoBundle(config.repo, { demo: isDemoMode });
          observations.push(...bundle.observations);
          emit({ type: "tool_call_finished", runId, ts: ts(), tool: "github.getRepoBundle", durationMs: Date.now() - t0, success: true });
        } catch (err) {
          emit({ type: "tool_call_finished", runId, ts: ts(), tool: "github.getRepoBundle", durationMs: Date.now() - t0, success: false });
          db.audit(runId, "agent", "github_fetch_error", String(err));
          throw err;
        }
        state = "SCAN_REPO";
        break;
      }

      // ── SCAN_REPO ─────────────────────────────────────────────────────────
      case "SCAN_REPO": {
        emit({ type: "tool_call_started", runId, ts: ts(), tool: "repo.scanImportantFiles", args: { repo: config.repo } });
        const t0 = Date.now();
        try {
          const scan = await scanImportantFiles(bundle);
          observations.push(...scan.observations);
          bundle.observations = observations;
          writeFileSync(resolve(artifactDir, "evidence.json"), JSON.stringify({ ...bundle, scan }, null, 2));
          emit({ type: "repository_evidence", runId, ts: ts(), evidence: bundle });
          emit({ type: "tool_call_finished", runId, ts: ts(), tool: "repo.scanImportantFiles", durationMs: Date.now() - t0, success: true });
        } catch (err) {
          emit({ type: "tool_call_finished", runId, ts: ts(), tool: "repo.scanImportantFiles", durationMs: Date.now() - t0, success: false });
          db.audit(runId, "agent", "repo_scan_error", String(err));
        }
        state = "RUN_SAFE_CHECKS";
        break;
      }

      // ── RUN_SAFE_CHECKS ───────────────────────────────────────────────────
      case "RUN_SAFE_CHECKS": {
        db.audit(runId, "agent", "checks_unmeasured", "Read-only analysis: tests, typecheck and repository scripts were not executed.");
        state = "CALCULATE_SCORE";
        break;
      }

      // ── CALCULATE_SCORE ───────────────────────────────────────────────────
      case "CALCULATE_SCORE": {
        score = calculateReadinessScore({ observations, runId, mode });
        db.updateRun(runId, { readinessScore: score });
        emit({ type: "readiness_score_calculated", runId, ts: ts(), score });
        state = "BUILD_RISK_FINGERPRINT";
        break;
      }

      // ── BUILD_RISK_FINGERPRINT ────────────────────────────────────────────
      case "BUILD_RISK_FINGERPRINT": {
        riskFingerprint = buildRiskFingerprint({
          score,
          memorySnapshot: memoryBefore,
          priorRunCount,
        });
        emit({ type: "risk_fingerprint_created", runId, ts: ts(), fingerprint: riskFingerprint });
        state = "ESTIMATE_TIME_TO_SHIP";
        break;
      }

      // ── ESTIMATE_TIME_TO_SHIP ─────────────────────────────────────────────
      case "ESTIMATE_TIME_TO_SHIP": {
        timeToShip = estimateTimeToShip({ riskFingerprint, mode });
        db.updateRun(runId, {
          timeToShip,
        });
        emit({ type: "time_to_ship_estimated", runId, ts: ts(), estimate: timeToShip });
        state = "OPTIONAL_EXA_EXTERNAL_EVIDENCE";
        break;
      }

      // ── OPTIONAL_EXA_EXTERNAL_EVIDENCE ────────────────────────────────────
      case "OPTIONAL_EXA_EXTERNAL_EVIDENCE": {
        let evidenceCount = 0;
        const exaApiKey = process.env["EXA_API_KEY"];
        const needsExternal = !isDemoMode && EXA_ENABLED && !!exaApiKey && assessmentNeedsExternalEvidence(observations, score);

        if (needsExternal) {
          // Prefer queries derived from score/observations over raw risk signals
          // (more targeted, less noisy than raw "signal release risk repo")
          const smartQueries = buildExaQueries({ repo: config.repo, score, observations });
          // Fallback to risk-fingerprint signals if no smart queries built
          const fallbackQueries = riskFingerprint.items
            .filter((i) => i.severity === "critical" || i.severity === "high")
            .slice(0, 3)
            .map((i) => `${i.signal} release risk`);
          const queries = smartQueries.length > 0 ? smartQueries : fallbackQueries;

          const evidence = await searchExternalEvidence(queries, runId);
          for (const e of evidence) {
            db.cacheEvidence({ ...e, runId });
            evidenceCount++;
          }
        } else if (EXA_ENABLED && !exaApiKey) {
          db.audit(runId, "system", "exa_skipped", "EXA_API_KEY not configured");
        } else if (EXA_ENABLED && exaApiKey && !assessmentNeedsExternalEvidence(observations, score)) {
          db.audit(runId, "system", "exa_skipped", "no uncertainty signals detected");
        }

        emit({ type: "external_evidence_status", runId, ts: ts(), enabled: !isDemoMode && EXA_ENABLED, count: evidenceCount });
        state = "ASSESS_WITH_NEMOTRON";
        break;
      }

      // ── ASSESS_WITH_NEMOTRON ──────────────────────────────────────────────
      case "ASSESS_WITH_NEMOTRON": {
        const evidence = db.getEvidence(runId);
        try {
          assessorOutput = await assess({
            score,
            riskFingerprint,
            timeToShip,
            evidence,
            goal: config.goal,
            repo: config.repo,
          });
          db.updateRun(runId, { assessorOutput: assessorOutput ?? undefined });
        } catch (err) {
          db.audit(runId, "agent", "assessor_error", "Assessor unavailable; no valid model explanation returned.");
          assessorOutput = null;
        }
        state = "PROPOSE_ACTIONS";
        break;
      }

      // ── PROPOSE_ACTIONS ───────────────────────────────────────────────────
      case "PROPOSE_ACTIONS": {
        pendingActions = assessorOutput?.recommendedActions?.slice(0, 3) ?? [];
        if (pendingActions.length === 0) {
          state = "COMPLETE_READ_ONLY"; // nothing to approve
        } else {
          // Create approval request for non-trivial actions
          const approval: Approval = {
            id: nanoid(8),
            runId,
            actionDescription: pendingActions.join(" | "),
            riskLevel: score.total < 40 ? "high" : "medium",
            status: "pending",
            requestedAt: new Date().toISOString(),
          };
          db.createApproval(approval);

          emit({ type: "approval_requested", runId, ts: ts(), approval });
          state = "RECORD_REVIEW";
        }
        break;
      }

      // ── RECORD_REVIEW ─────────────────────────────────────────────────
      case "RECORD_REVIEW": {
        const pending = db.getPendingApprovals(runId);
        for (const approval of pending) {
          if (config.autoApproveLocal) {
            const resolved: Approval = {
              ...approval,
              status: "approved",
              resolvedAt: new Date().toISOString(),
              resolvedBy: "auto",
            };
            db.updateApproval(approval.id, resolved);
            db.audit(runId, "system", "auto_approved", approval.id);
            emit({ type: "approval_resolved", runId, ts: ts(), approval: resolved });
          }
        }
        state = "COMPLETE_READ_ONLY";
        break;
      }

      case "COMPLETE_READ_ONLY": {
        db.audit(runId, "agent", "proposals_recorded", `${pendingActions.length} proposed actions; no repository actions executed. Review is optional and does not pause analysis.`);
        state = "UPDATE_MEMORY";
        break;
      }

      // ── UPDATE_MEMORY ─────────────────────────────────────────────────────
      case "UPDATE_MEMORY": {
        memoryManager.recordRunCompletion(
          score.total,
          decisionForScore(score)
        );
        memoryManager.set(
          MEMORY_KEYS.repoLastSeen(config.repo),
          new Date().toISOString()
        );

        const { changes } = memoryManager.captureAfterSnapshot(memoryBefore);
        emit({ type: "memory_updated", runId, ts: ts(), changes });
        state = "WRITE_ARTIFACTS";
        break;
      }

      // ── WRITE_ARTIFACTS ───────────────────────────────────────────────────
      case "WRITE_ARTIFACTS": {
        db.updateRun(runId, { status: "finalizing" });
        const reportFinishedAt = new Date().toISOString();
        await generateReport({
          run: { ...run, readinessScore: score, riskFingerprint, timeToShip, assessorOutput: assessorOutput ?? undefined, artifactDir, finishedAt: reportFinishedAt },
          artifactDir,
          score,
          riskFingerprint,
          timeToShip,
          assessorOutput,
          evidence: db.getEvidence(runId),
          auditLog: db.getAuditLog(runId),
          mode,
        });
        state = "FINALIZE";
        break;
      }

      default:
        // "FINALIZE" — exit condition handled by while() guard
        break;
    }
  }

  // ── Final state ─────────────────────────────────────────────────────────────
  emit({ type: "state_entered", runId, ts: ts(), state: "FINALIZE" });
  const finalRun: Run = {
    ...run,
    status: "complete",
    finishedAt: new Date().toISOString(),
    readinessScore: score,
    riskFingerprint,
    timeToShip,
    assessorOutput: assessorOutput ?? undefined,
    finalDecision: decisionForScore(score),
    artifactDir,
  };

  db.updateRun(runId, {
    status: "complete",
    finishedAt: finalRun.finishedAt,
    finalDecision: finalRun.finalDecision,
  });

  emit({
    type: "final_result",
    runId,
    ts: ts(),
    decision: finalRun.finalDecision ?? "unknown",
    score,
    assessorOutput,
  });

  return { run: finalRun, score, riskFingerprint, timeToShip, assessorOutput, artifactDir };
}
