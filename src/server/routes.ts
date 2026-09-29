/**
 * ShipClaw — Express Routes
 * Claude-primary file. 9 required routes from the manual.
 */
import type { Express, Request, Response } from "express";
import { existsSync, readFileSync, appendFileSync } from "fs";
import { resolve } from "path";
import { nanoid } from "nanoid";
import { runAgentLoop } from "../agent/loop.js";
import { getDb } from "../storage/db.js";
import { EXA_ENABLED } from "../shared/constants.js";
import { parseGitHubUrl } from "../tools/github.js";
import { SqliteDb } from "../storage/db.js";
import type { AgentEvent } from "../shared/types.js";

/** Artifacts a client may download. Anything else is refused (no path traversal). */
const ARTIFACT_FILES = [
  "evidence.json",
  "SHIPCLAW_READINESS.md",
  "github_issue_draft.md",
  "audit.jsonl",
  "memory_before.jsonl",
  "memory_after.jsonl",
  "memory_diff.md",
] as const;

export function setupRoutes(app: Express): void {
  const db = getDb();

  // ── GET /api/health ────────────────────────────────────────────────────────
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "shipclaw",
      timestamp: new Date().toISOString(),
      mode: process.env["DEMO_MODE"] === "true" ? "demo" : "live",
      nemotron: process.env["NEMOTRON_API_KEY"] ? "configured" : "unavailable",
      storage: db instanceof SqliteDb ? "sqlite" : "volatile",
      // Additive, non-secret facts the UI uses to describe a run honestly.
      model: process.env["NEMOTRON_MODEL"] ?? "mistralai/mistral-nemotron",
      // With DEMO_MODE, ALLOW_LLM_FALLBACK=true skips Nemotron entirely (see assessor.ts).
      llmFallbackAllowed: process.env["ALLOW_LLM_FALLBACK"] !== "false",
      exa: EXA_ENABLED && !!process.env["EXA_API_KEY"] ? "enabled" : "disabled",
      evidenceSource: "github",
    });
  });

  // ── POST /api/runs ─────────────────────────────────────────────────────────
  app.post("/api/runs", async (req: Request, res: Response) => {
    const { goal, repo, demo, autoApproveLocal } = req.body as {
      goal?: string; repo?: string; demo?: boolean; autoApproveLocal?: boolean;
    };
    if (typeof goal !== "string" || !goal.trim() || goal.length > 1000 || typeof repo !== "string" || !repo.trim() || repo.length > 300 || (demo !== undefined && typeof demo !== "boolean") || (autoApproveLocal !== undefined && typeof autoApproveLocal !== "boolean")) {
      res.status(400).json({ error: "goal and repo are required" });
      return;
    }
    if (!demo) {
      try { parseGitHubUrl(repo); } catch (err) { res.status(400).json({ error: (err as Error).message }); return; }
    }

    // Assign the ID here so the response can never point at a different, concurrent run.
    const runId = nanoid(12);
    runAgentLoop({
      goal,
      repo: demo ? "https://github.com/acme/payments-api" : repo,
      demo: demo === true,
      runId,
      autoApproveLocal: autoApproveLocal ?? false,
    }).catch((err: unknown) => {
      console.error("Run failed; details recorded in run status.");
      // Mark the run as failed so the SSE stream terminates and clients can show the error.
      if (db.getRun(runId)) {
        db.updateRun(runId, { status: "error", errorMessage: String(err).slice(0, 500) });
        db.audit(runId, "system", "run_failed", String(err).slice(0, 500));
      }
    });

    res.json({ runId });
  });

  // ── GET /api/runs (recent run summaries, newest first) ─────────────────────
  app.get("/api/runs", (req: Request, res: Response) => {
    const limit = Math.min(Math.max(parseInt(String(req.query["limit"] ?? "10"), 10) || 10, 1), 50);
    const runs = db.listRuns(limit).map((run) => {
      const final = db
        .getEvents(run.id)
        .find((e): e is Extract<AgentEvent, { type: "final_result" }> => e.type === "final_result");
      return {
        id: run.id,
        goal: run.goal,
        repo: run.repo,
        mode: run.mode,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt ?? null,
        score: final?.score.total ?? run.readinessScore?.total ?? null,
        band: final?.score.band ?? run.readinessScore?.band ?? null,
        decision: final?.decision ?? run.finalDecision ?? null,
      };
    });
    res.json({ runs });
  });

  // ── GET /api/runs/:id ──────────────────────────────────────────────────────
  app.get("/api/runs/:id", (req: Request, res: Response) => {
    const run = db.getRun(req.params["id"] ?? "");
    if (!run) { res.status(404).json({ error: "Run not found" }); return; }
    res.json(run);
  });

  // ── GET /api/runs/:id/events (SSE) ────────────────────────────────────────
  app.get("/api/runs/:id/events", (req: Request, res: Response) => {
    const runId = req.params["id"] ?? "";
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    if (!db.getRun(runId)) { res.status(404).end(); return; }
    const events = db.getEvents(runId);
    for (const event of events) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    // Poll for new events every 500ms
    let lastCount = events.length;
    const interval = setInterval(() => {
      const all = db.getEvents(runId);
      if (all.length > lastCount) {
        for (const e of all.slice(lastCount)) {
          res.write(`data: ${JSON.stringify(e)}\n\n`);
        }
        lastCount = all.length;
      }
      const run = db.getRun(runId);
      if (run?.status === "complete" || run?.status === "error") {
        res.write(`data: ${JSON.stringify({ type: "stream_end" })}\n\n`);
        clearInterval(interval);
        res.end();
      }
    }, 500);

    req.on("close", () => clearInterval(interval));
  });

  // ── POST /api/approvals/:id/approve ───────────────────────────────────────
  app.post("/api/approvals/:id/approve", (req: Request, res: Response) => {
    const id = req.params["id"] ?? "";
    const approval = db.getApproval(id);
    if (!approval) { res.status(404).json({ error: "Approval not found" }); return; }
    if (approval.status !== "pending") { res.status(409).json({ error: "Review already resolved; the recorded decision cannot be overwritten." }); return; }
    const resolvedAt = new Date().toISOString();
    db.updateApproval(id, { status: "approved", resolvedAt, resolvedBy: "human" });
    db.audit(approval.runId, "human", "approval_approved", `${id}: ${approval.actionDescription}`);
    const event: AgentEvent = { type: "approval_resolved", runId: approval.runId, ts: resolvedAt, approval: { ...approval, status: "approved", resolvedAt, resolvedBy: "human" } };
    db.insertEvent(event);
    const artifactDir = db.getRun(approval.runId)?.artifactDir;
    if (artifactDir && existsSync(artifactDir)) appendFileSync(resolve(artifactDir, "audit.jsonl"), JSON.stringify(event) + "\n");
    res.json({ success: true, approval: { ...approval, status: "approved", resolvedAt, resolvedBy: "human" } });
  });

  // ── POST /api/approvals/:id/reject ────────────────────────────────────────
  app.post("/api/approvals/:id/reject", (req: Request, res: Response) => {
    const id = req.params["id"] ?? "";
    const approval = db.getApproval(id);
    if (!approval) { res.status(404).json({ error: "Approval not found" }); return; }
    if (approval.status !== "pending") { res.status(409).json({ error: "Review already resolved; the recorded decision cannot be overwritten." }); return; }
    const resolvedAt = new Date().toISOString();
    db.updateApproval(id, { status: "rejected", resolvedAt, resolvedBy: "human" });
    db.audit(approval.runId, "human", "approval_rejected", `${id}: ${approval.actionDescription}`);
    const event: AgentEvent = { type: "approval_resolved", runId: approval.runId, ts: resolvedAt, approval: { ...approval, status: "rejected", resolvedAt, resolvedBy: "human" } };
    db.insertEvent(event);
    const artifactDir = db.getRun(approval.runId)?.artifactDir;
    if (artifactDir && existsSync(artifactDir)) appendFileSync(resolve(artifactDir, "audit.jsonl"), JSON.stringify(event) + "\n");
    res.json({ success: true, approval: { ...approval, status: "rejected", resolvedAt, resolvedBy: "human" } });
  });

  // ── GET /api/memory ────────────────────────────────────────────────────────
  app.get("/api/memory", (_req: Request, res: Response) => {
    const items = db.getAllMemory();
    res.json({ items });
  });

  // ── GET /api/audit/:runId ─────────────────────────────────────────────────
  app.get("/api/audit/:runId", (req: Request, res: Response) => {
    const log = db.getAuditLog(req.params["runId"] ?? "");
    res.json({ log });
  });

  // ── GET /api/reports/:runId ───────────────────────────────────────────────
  app.get("/api/reports/:runId", (req: Request, res: Response) => {
    const runId = req.params["runId"] ?? "";
    if (!/^[A-Za-z0-9_-]+$/.test(runId) || !db.getRun(runId)) { res.status(404).json({ error: "Run not found" }); return; }
    const artifactDir = resolve("runs", runId);
    if (!existsSync(artifactDir)) {
      res.status(404).json({ error: "Run artifacts not found" });
      return;
    }
    const artifacts = ARTIFACT_FILES.filter((f) => existsSync(resolve(artifactDir, f)));
    res.json({ runId, artifactDir, artifacts });
  });

  // ── GET /api/reports/:runId/readiness ─────────────────────────────────────
  app.get("/api/reports/:runId/readiness", (req: Request, res: Response) => {
    const runId = req.params["runId"] ?? "";
    if (!/^[A-Za-z0-9_-]+$/.test(runId) || !db.getRun(runId)) { res.status(404).json({ error: "Run not found" }); return; }
    const mdPath = resolve("runs", runId, "SHIPCLAW_READINESS.md");
    if (!existsSync(mdPath)) {
      res.status(404).json({ error: "Report not generated yet" });
      return;
    }
    const markdown = readFileSync(mdPath, "utf-8");
    const run = db.getRun(runId);
    res.json({
      runId,
      path: mdPath,
      markdown,
      mode: run?.mode ?? "unknown",
      generatedAt: run?.finishedAt ?? new Date().toISOString(),
    });
  });

  // ── GET /api/reports/:runId/files/:name (allowlisted artifact download) ───
  app.get("/api/reports/:runId/files/:name", (req: Request, res: Response) => {
    const runId = req.params["runId"] ?? "";
    const name = req.params["name"] ?? "";
    if (!/^[A-Za-z0-9_-]+$/.test(runId) || !(ARTIFACT_FILES as readonly string[]).includes(name)) {
      res.status(400).json({ error: "Unknown artifact" });
      return;
    }
    const path = resolve("runs", runId, name);
    if (!existsSync(path)) {
      res.status(404).json({ error: "Artifact not found" });
      return;
    }
    res.type("text/plain; charset=utf-8").send(readFileSync(path, "utf-8"));
  });
}
