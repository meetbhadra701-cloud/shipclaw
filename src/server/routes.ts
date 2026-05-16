/**
 * ShipClaw — Express Routes
 * Claude-primary file. 9 required routes from the manual.
 */
import type { Express, Request, Response } from "express";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { runAgentLoop } from "../agent/loop.js";
import { getDb } from "../storage/db.js";

export function setupRoutes(app: Express): void {
  const db = getDb();

  // ── GET /api/health ────────────────────────────────────────────────────────
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "shipclaw",
      timestamp: new Date().toISOString(),
      mode: process.env["DEMO_MODE"] === "true" ? "demo" : "live",
      nemotron: process.env["NEMOTRON_API_KEY"] ? "configured" : "fallback",
    });
  });

  // ── POST /api/runs ─────────────────────────────────────────────────────────
  app.post("/api/runs", async (req: Request, res: Response) => {
    const { goal, repo, demo, autoApproveLocal } = req.body as {
      goal?: string; repo?: string; demo?: boolean; autoApproveLocal?: boolean;
    };
    if (!goal || !repo) {
      res.status(400).json({ error: "goal and repo are required" });
      return;
    }
    if (demo) process.env["DEMO_MODE"] = "true";

    // Run in background, return run ID immediately
    const runId = await new Promise<string>((resolve_) => {
      // We start the loop without awaiting to return the runId quickly
      const events: unknown[] = [];
      runAgentLoop({
        goal,
        repo,
        autoApproveLocal: autoApproveLocal ?? false,
        onEvent: (e) => { events.push(e); },
      }).catch((err: unknown) => console.error("Run error:", err));

      // Return first run ID from DB after a tick
      setTimeout(() => {
        const runs = db.listRuns(1);
        resolve_(runs[0]?.id ?? "unknown");
      }, 50);
    });

    res.json({ runId });
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
    db.updateApproval(id, {
      status: "approved",
      resolvedAt: new Date().toISOString(),
      resolvedBy: "human",
    });
    res.json({ success: true });
  });

  // ── POST /api/approvals/:id/reject ────────────────────────────────────────
  app.post("/api/approvals/:id/reject", (req: Request, res: Response) => {
    const id = req.params["id"] ?? "";
    const approval = db.getApproval(id);
    if (!approval) { res.status(404).json({ error: "Approval not found" }); return; }
    db.updateApproval(id, {
      status: "rejected",
      resolvedAt: new Date().toISOString(),
      resolvedBy: "human",
    });
    res.json({ success: true });
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
    const artifactDir = resolve("runs", runId);
    if (!existsSync(artifactDir)) {
      res.status(404).json({ error: "Run artifacts not found" });
      return;
    }
    const artifacts = [
      "SHIPCLAW_READINESS.md",
      "github_issue_draft.md",
      "audit.jsonl",
      "memory_before.jsonl",
      "memory_after.jsonl",
      "memory_diff.md",
    ].filter((f) => existsSync(resolve(artifactDir, f)));
    res.json({ runId, artifactDir, artifacts });
  });

  // ── GET /api/reports/:runId/readiness ─────────────────────────────────────
  app.get("/api/reports/:runId/readiness", (req: Request, res: Response) => {
    const runId = req.params["runId"] ?? "";
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
}
