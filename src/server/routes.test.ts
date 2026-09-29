import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryDb, setDb } from "../storage/db.js";
import { setupRoutes } from "./routes.js";
import type { AgentEvent, Run } from "../shared/types.js";

let server: Server;
let base: string;
let db: InMemoryDb;
const nativeFetch = globalThis.fetch;
beforeEach(async () => {
  db = new InMemoryDb(); setDb(db);
  vi.stubEnv("ALLOW_LLM_FALLBACK", "true"); vi.stubEnv("NEMOTRON_API_KEY", "");
  const app = express(); app.use(express.json()); setupRoutes(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.on("listening", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" ? address?.port : 0}`;
});
afterEach(async () => {
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
const post = (path: string, body: unknown = {}) => nativeFetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function start(demo = false, repo = "https://github.com/owner/repo"): Promise<Run> {
  const response = await post("/api/runs", { repo, goal: "Check release readiness", demo });
  expect(response.status).toBe(200);
  const { runId } = await response.json() as { runId: string };
  for (let i = 0; i < 300; i++) {
    const run = db.getRun(runId)!;
    if (["complete", "error"].includes(run.status)) return run;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("Run did not terminate");
}
describe("run API and review semantics", () => {
  it("rejects invalid URLs and malformed types before creating a run", async () => {
    for (const repo of ["not a URL", "https://example.com/owner/repo", 123]) {
      expect((await post("/api/runs", { repo, goal: "check" })).status).toBe(400);
    }
    expect(db.listRuns(20)).toHaveLength(0);
  });
  it("completes while review is pending, records only one decision, and never claims execution", async () => {
    const run = await start(true);
    expect(run.status).toBe("complete");
    const pending = db.getPendingApprovals(run.id)[0]!;
    expect(pending.status).toBe("pending");
    expect(db.getAuditLog(run.id).some(a => a.action === "actions_executed")).toBe(false);
    expect((await post(`/api/approvals/${pending.id}/approve`)).status).toBe(200);
    expect((await post(`/api/approvals/${pending.id}/reject`)).status).toBe(409);
    expect(db.getApproval(pending.id)?.status).toBe("approved");
    expect(db.getEvents(run.id).some(e => e.type === "approval_resolved" && e.approval.resolvedBy === "human")).toBe(true);
    expect(db.getAuditLog(run.id).filter(a => a.action === "approval_approved")).toHaveLength(1);
    const report = await (await nativeFetch(`${base}/api/reports/${run.id}/readiness`)).json() as { markdown: string };
    expect(report.markdown).toContain("Not measured");
    expect(report.markdown).not.toContain("70%**");
    expect(report.markdown).toContain("No repository writes or action execution exist");
  });
  it("sample requests cannot contaminate simultaneous live requests", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    const [sample, live] = await Promise.all([start(true), start(false)]);
    expect(sample.mode).toBe("demo"); expect(sample.status).toBe("complete");
    expect(live.mode).toBe("live"); expect(live.status).toBe("error");
    expect(live.errorMessage).toContain("rate limit");
    expect(process.env["DEMO_MODE"]).toBe("false");
    expect(db.getEvents(live.id).some(e => e.type === "readiness_score_calculated")).toBe(false);
  });
  it("empty repository completes with all evidence unknown and fallback without confidence", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/search/issues")) return new Response(JSON.stringify({ total_count: 0, incomplete_results: false }));
      if (url.includes("/commits/")) return new Response("{}", { status: 409 });
      return new Response(JSON.stringify({ full_name: "owner/repo", default_branch: "main", private: false }));
    }));
    const run = await start(false);
    expect(run.status).toBe("complete");
    expect(run.readinessScore).toMatchObject({ total: 0, evidenceCoverage: 0, possibleTotal: 100 });
    expect(run.assessorOutput).toMatchObject({ source: "deterministic_fallback", confidence: null });
    expect(run.finalDecision).toBe("hold");
    const events = db.getEvents(run.id);
    expect(events.some(e => e.type === "tool_call_started" && e.tool.startsWith("shell"))).toBe(false);
    expect(events.find(e => e.type === "risk_fingerprint_created")).toMatchObject({ fingerprint: { items: [] } });
    const stream = await nativeFetch(`${base}/api/runs/${run.id}/events`);
    expect(await stream.text()).toContain('"type":"stream_end"');
  });
  it("unknown run SSE terminates with 404", async () => expect((await nativeFetch(`${base}/api/runs/missing/events`)).status).toBe(404));
});
