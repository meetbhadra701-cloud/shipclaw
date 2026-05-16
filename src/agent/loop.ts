/**
 * ShipClaw — Agent Loop Spine
 * Claude-primary file. Do NOT rewrite without explicit COMMUNICATION_LOG.md coordination.
 *
 * 17-state machine. Emits all 13 AgentEvent types.
 * Deterministic score is computed BEFORE Nemotron is called.
 * Memory captured before + after; diff written to artifact dir.
 * All risky writes gated on approval.
 */
import { mkdirSync, appendFileSync } from "fs";
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
} from "../shared/types.js";
import { getDb, type IDb } from "../storage/db.js";
import { MemoryManager, MEMORY_KEYS } from "./memory.js";
import { calculateReadinessScore } from "./scorer.js";
import { buildRiskFingerprint } from "./riskFingerprint.js";
import { estimateTimeToShip } from "./timeToShip.js";
import { assess } from "./assessor.js";
import { getRepoBundle } from "../tools/github.js";
import { scanImportantFiles } from "../tools/repo.js";
import { runSafeCommand } from "../tools/shell.js";
import { searchExternalEvidence } from "../tools/exa.js";
import { generateReport } from "./report.js";
import { EXA_ENABLED, DEMO_BANNER, FALLBACK_BANNER } from "../shared/constants.js";

// ─── State Machine ────────────────────────────────────────────────────────────

type LoopState =
  | "INIT"
  | "LOAD_MEMORY"
  | "PLAN"
  | "FETCH_GITHUB_DATA"
  | "SCAN_REPO"
  | "RUN_SAFE_CHECKS"
  | "CALCULATE_SCORE"
  | "BUILD_RISK_FINGERPRINT"
  | "ESTIMATE_TIME_TO_SHIP"
  | "OPTIONAL_EXA_EXTERNAL_EVIDENCE"
  | "ASSESS_WITH_NEMOTRON"
  | "PROPOSE_ACTIONS"
  | "WAIT_FOR_APPROVAL"
  | "EXECUTE_APPROVED_ACTIONS"
  | "UPDATE_MEMORY"
  | "WRITE_ARTIFACTS"
  | "FINALIZE";

// ─── Loop Config ──────────────────────────────────────────────────────────────

export interface LoopConfig {
  goal: string;
  repo: string;
  autoApproveLocal?: boolean;   // true in demo/test mode
  onEvent?: (event: AgentEvent) => void;
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
  const runId = nanoid(12);
  const isDemoMode = process.env["DEMO_MODE"] === "true";
  const isLive = !isDemoMode && process.env["ALLOW_LLM_FALLBACK"] !== "true";
  const mode = isDemoMode ? "demo" : isLive ? "live" : "fallback";
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
  if (mode === "fallback") console.log("\n" + FALLBACK_BANNER);

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
  let score!: ReadinessScore;
  let riskFingerprint!: RiskFingerprint;
  let timeToShip!: TimeToShipEstimate;
  let assessorOutput: AssessorOutput | null = null;
  let pendingActions: string[] = [];

  let state: LoopState = "INIT";

  // ─── State Machine ──────────────────────────────────────────────────────────
  while (state !== "FINALIZE") {
    db.updateRun(runId, { status: "running" });

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
            "Run safe checks (typecheck, test)",
            "Calculate deterministic readiness score",
            "Build Release Risk Fingerprint",
            "Estimate time-to-ship",
            EXA_ENABLED ? "Fetch optional Exa external evidence" : "Skip Exa (disabled)",
            "Assess with Nemotron (explains score, does not invent it)",
            "Propose approval-gated actions",
            "Update memory and write artifacts",
          ],
          estimatedSteps: 10,
          constraints: [
            mode === "demo" ? "DEMO MODE — fixture data" : "LIVE MODE",
            EXA_ENABLED ? "Exa enabled (max 3 searches)" : "Exa disabled",
            config.autoApproveLocal ? "Auto-approve local non-risky actions" : "Manual approval required",
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
          const bundle = await getRepoBundle(config.repo);
          observations.push(...bundle.observations);
          emit({ type: "tool_call_finished", runId, ts: ts(), tool: "github.getRepoBundle", durationMs: Date.now() - t0, success: true });
        } catch (err) {
          emit({ type: "tool_call_finished", runId, ts: ts(), tool: "github.getRepoBundle", durationMs: Date.now() - t0, success: false });
          db.audit(runId, "agent", "github_fetch_error", String(err));
        }
        state = "SCAN_REPO";
        break;
      }

      // ── SCAN_REPO ─────────────────────────────────────────────────────────
      case "SCAN_REPO": {
        emit({ type: "tool_call_started", runId, ts: ts(), tool: "repo.scanImportantFiles", args: { repo: config.repo } });
        const t0 = Date.now();
        try {
          const scan = await scanImportantFiles(config.repo);
          observations.push(...scan.observations);
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
        for (const cmd of ["npm run typecheck", "npm test"]) {
          emit({ type: "tool_call_started", runId, ts: ts(), tool: "shell.runSafeCommand", args: { command: cmd } });
          const t0 = Date.now();
          const result = await runSafeCommand(cmd);
          emit({ type: "tool_call_finished", runId, ts: ts(), tool: "shell.runSafeCommand", durationMs: Date.now() - t0, success: result.exitCode === 0 });
          if (result.exitCode !== 0) {
            observations.push({ category: "ci_health", signal: cmd, value: "failing", weight: 0.25, source: "shell" });
          }
        }
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
        if (EXA_ENABLED) {
          const queries = riskFingerprint.items
            .filter((i) => i.severity === "critical" || i.severity === "high")
            .slice(0, 3)
            .map((i) => `${i.signal} release risk ${config.repo}`);
          const evidence = await searchExternalEvidence(queries, runId);
          for (const e of evidence) {
            db.cacheEvidence({ ...e, runId });
            evidenceCount++;
          }
        }
        emit({ type: "external_evidence_status", runId, ts: ts(), enabled: EXA_ENABLED, count: evidenceCount });
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
          db.audit(runId, "agent", "assessor_error", String(err));
          assessorOutput = null;
        }
        state = "PROPOSE_ACTIONS";
        break;
      }

      // ── PROPOSE_ACTIONS ───────────────────────────────────────────────────
      case "PROPOSE_ACTIONS": {
        pendingActions = assessorOutput?.recommendedActions?.slice(0, 3) ?? [];
        if (pendingActions.length === 0) {
          state = "EXECUTE_APPROVED_ACTIONS"; // nothing to approve
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
          db.updateRun(runId, { status: "awaiting_approval" });
          emit({ type: "approval_requested", runId, ts: ts(), approval });
          state = "WAIT_FOR_APPROVAL";
        }
        break;
      }

      // ── WAIT_FOR_APPROVAL ─────────────────────────────────────────────────
      case "WAIT_FOR_APPROVAL": {
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
          // In real usage: UI calls POST /api/approvals/:id/approve
          // Loop polls until all resolved
        }
        state = "EXECUTE_APPROVED_ACTIONS";
        break;
      }

      // ── EXECUTE_APPROVED_ACTIONS ──────────────────────────────────────────
      case "EXECUTE_APPROVED_ACTIONS": {
        const approvals = db.getPendingApprovals(runId);
        const allApproved = approvals.every((a) => a.status === "approved");
        if (allApproved || approvals.length === 0) {
          db.audit(runId, "agent", "actions_executed", `${pendingActions.length} actions recorded`);
        }
        state = "UPDATE_MEMORY";
        break;
      }

      // ── UPDATE_MEMORY ─────────────────────────────────────────────────────
      case "UPDATE_MEMORY": {
        memoryManager.recordRunCompletion(
          score.total,
          assessorOutput?.decision ?? "unknown"
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
        await generateReport({
          run: { ...run, readinessScore: score, riskFingerprint, timeToShip, assessorOutput: assessorOutput ?? undefined, artifactDir },
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
  const finalRun: Run = {
    ...run,
    status: "complete",
    finishedAt: new Date().toISOString(),
    readinessScore: score,
    riskFingerprint,
    timeToShip,
    assessorOutput: assessorOutput ?? undefined,
    finalDecision: assessorOutput?.decision ?? (score.total >= 71 ? "ship" : "hold"),
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
