/**
 * ShipClaw — DB helper interface + in-memory fallback adapter
 *
 * Codex owns the production SQLite implementation (X-001).
 * Until then, the InMemoryDb adapter allows the agent loop to run end-to-end.
 *
 * INTERFACE STABILITY: Claude owns this interface. Codex must implement
 * SqliteDb against these exact method signatures. Log any needed changes
 * in COMMUNICATION_LOG.md before altering the interface.
 */
import type {
  Run,
  AgentEvent,
  Approval,
  MemorySnapshot,
  ExternalEvidence,
} from "../shared/types.js";
import { mkdirSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { createRequire } from "module";

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IDb {
  // Runs
  createRun(run: Run): void;
  updateRun(id: string, patch: Partial<Run>): void;
  getRun(id: string): Run | undefined;
  listRuns(limit?: number): Run[];

  // Events
  insertEvent(event: AgentEvent): void;
  getEvents(runId: string): AgentEvent[];

  // Memory (global cross-run)
  getMemory(key: string): string | undefined;
  setMemory(key: string, value: string): void;
  getAllMemory(): Array<{ key: string; value: string; updatedAt: string }>;

  // Run-scoped memory snapshot
  snapshotMemory(runId: string): void;
  getMemorySnapshot(runId: string): MemorySnapshot;

  // Approvals
  createApproval(approval: Approval): void;
  updateApproval(id: string, patch: Partial<Approval>): void;
  getApproval(id: string): Approval | undefined;
  getPendingApprovals(runId: string): Approval[];

  // Audit
  audit(runId: string, actor: string, action: string, detail?: string): void;
  getAuditLog(runId: string): Array<{ actor: string; action: string; detail?: string; createdAt: string }>;

  // External evidence cache
  cacheEvidence(evidence: ExternalEvidence & { runId: string }): void;
  getEvidence(runId: string): ExternalEvidence[];

  close(): void;
}

// ─── In-Memory Fallback ───────────────────────────────────────────────────────
// Used when Codex's SqliteDb is not yet available, or in tests.

export class InMemoryDb implements IDb {
  private runs = new Map<string, Run>();
  private events = new Map<string, AgentEvent[]>();
  private globalMemory = new Map<string, string>();
  private runMemorySnapshots = new Map<string, MemorySnapshot>();
  private approvals = new Map<string, Approval>();
  private auditLog = new Map<string, Array<{ actor: string; action: string; detail?: string; createdAt: string }>>();
  private evidenceCache = new Map<string, Array<ExternalEvidence & { runId: string }>>();

  createRun(run: Run) { this.runs.set(run.id, { ...run }); }
  updateRun(id: string, patch: Partial<Run>) {
    const existing = this.runs.get(id);
    if (existing) this.runs.set(id, { ...existing, ...patch });
  }
  getRun(id: string) { return this.runs.get(id); }
  listRuns(limit = 20) {
    return [...this.runs.values()]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit);
  }

  insertEvent(event: AgentEvent) {
    const list = this.events.get(event.runId) ?? [];
    list.push(event);
    this.events.set(event.runId, list);
  }
  getEvents(runId: string) { return this.events.get(runId) ?? []; }

  getMemory(key: string) { return this.globalMemory.get(key); }
  setMemory(key: string, value: string) { this.globalMemory.set(key, value); }
  getAllMemory() {
    return [...this.globalMemory.entries()].map(([key, value]) => ({
      key,
      value,
      updatedAt: new Date().toISOString(),
    }));
  }

  snapshotMemory(runId: string) {
    this.runMemorySnapshots.set(runId, {
      runId,
      capturedAt: new Date().toISOString(),
      items: this.getAllMemory(),
    });
  }
  getMemorySnapshot(runId: string): MemorySnapshot {
    return this.runMemorySnapshots.get(runId) ?? {
      runId,
      capturedAt: new Date().toISOString(),
      items: [],
    };
  }

  createApproval(approval: Approval) { this.approvals.set(approval.id, { ...approval }); }
  updateApproval(id: string, patch: Partial<Approval>) {
    const existing = this.approvals.get(id);
    if (existing) this.approvals.set(id, { ...existing, ...patch });
  }
  getApproval(id: string) { return this.approvals.get(id); }
  getPendingApprovals(runId: string) {
    return [...this.approvals.values()].filter(
      (a) => a.runId === runId && a.status === "pending"
    );
  }

  audit(runId: string, actor: string, action: string, detail?: string) {
    const log = this.auditLog.get(runId) ?? [];
    log.push({ actor, action, detail, createdAt: new Date().toISOString() });
    this.auditLog.set(runId, log);
  }
  getAuditLog(runId: string) { return this.auditLog.get(runId) ?? []; }

  cacheEvidence(evidence: ExternalEvidence & { runId: string }) {
    const list = this.evidenceCache.get(evidence.runId) ?? [];
    list.push(evidence);
    this.evidenceCache.set(evidence.runId, list);
  }
  getEvidence(runId: string) {
    return (this.evidenceCache.get(runId) ?? []).map(({ runId: _r, ...e }) => e as ExternalEvidence);
  }

  close() { /* no-op for in-memory */ }
}

// ─── SQLite Adapter ──────────────────────────────────────────────────────────
// Uses Node 24's built-in node:sqlite module, avoiding native better-sqlite3.

type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  close(): void;
};

type SqliteRunRow = {
  id: string;
  goal: string;
  repo: string;
  mode: Run["mode"];
  status: Run["status"];
  readiness_score: number | null;
  score_band: string | null;
  time_to_ship_min: number | null;
  time_to_ship_max: number | null;
  final_decision: Run["finalDecision"] | null;
  confidence: number | null;
  artifact_dir: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
};

type SqliteEventRow = {
  type: AgentEvent["type"];
  payload: string;
  created_at: string;
};

type SqliteMemoryRow = {
  key: string;
  value: string;
  updated_at: string;
};

type SqliteApprovalRow = {
  id: string;
  run_id: string;
  action_description: string;
  risk_level: Approval["riskLevel"];
  status: Approval["status"];
  requested_at: string;
  resolved_at: string | null;
  resolved_by: Approval["resolvedBy"] | null;
};

type SqliteAuditRow = {
  actor: string;
  action: string;
  detail: string | null;
  created_at: string;
};

type SqliteEvidenceRow = {
  source: ExternalEvidence["source"];
  query: string;
  snippet: string;
  url: string;
  relevance_score: number | null;
  fetched_at: string;
};

export class SqliteDb implements IDb {
  private db: SqliteDatabase;
  private runCache = new Map<string, Run>();
  private snapshotCache = new Map<string, MemorySnapshot>();

  constructor(dbPath = resolve("data", "shipclaw.sqlite")) {
    mkdirSync(dirname(dbPath), { recursive: true });
    const require = createRequire(import.meta.url);
    const sqlite = require("node:sqlite") as { DatabaseSync: new (path: string) => SqliteDatabase };
    this.db = new sqlite.DatabaseSync(dbPath);
    const schema = readFileSync(resolve("src", "storage", "schema.sql"), "utf-8");
    this.db.exec(schema);
  }

  createRun(run: Run): void {
    this.runCache.set(run.id, { ...run });
    this.db.prepare(
      `INSERT OR REPLACE INTO runs
       (id, goal, repo, mode, status, readiness_score, score_band, time_to_ship_min, time_to_ship_max, final_decision, confidence, artifact_dir, error_message, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      run.id,
      run.goal,
      run.repo,
      run.mode,
      run.status,
      run.readinessScore?.total ?? null,
      run.readinessScore?.band ?? null,
      run.timeToShip?.minMinutes ?? null,
      run.timeToShip?.maxMinutes ?? null,
      run.finalDecision ?? null,
      run.assessorOutput?.confidence ?? null,
      run.artifactDir ?? null,
      run.errorMessage ?? null,
      run.startedAt,
      run.finishedAt ?? null
    );
  }

  updateRun(id: string, patch: Partial<Run>): void {
    // BUG-007 FIX: do NOT call createRun() here.
    // createRun() uses INSERT OR REPLACE which is DELETE+INSERT under the hood.
    // The DELETE triggers ON DELETE CASCADE, wiping audit_logs, events, etc.
    // Instead, use a targeted SQL UPDATE that preserves child rows.
    const existing = this.runCache.get(id) ?? this.getRun(id);
    if (!existing) return;
    const merged = { ...existing, ...patch };
    this.runCache.set(id, merged);
    this.db.prepare(
      `UPDATE runs SET
         status = ?,
         readiness_score = ?,
         score_band = ?,
         time_to_ship_min = ?,
         time_to_ship_max = ?,
         final_decision = ?,
         confidence = ?,
         artifact_dir = ?,
         error_message = ?,
         finished_at = ?
       WHERE id = ?`
    ).run(
      merged.status,
      merged.readinessScore?.total ?? null,
      merged.readinessScore?.band ?? null,
      merged.timeToShip?.minMinutes ?? null,
      merged.timeToShip?.maxMinutes ?? null,
      merged.finalDecision ?? null,
      merged.assessorOutput?.confidence ?? null,
      merged.artifactDir ?? null,
      merged.errorMessage ?? null,
      merged.finishedAt ?? null,
      id
    );
  }

  getRun(id: string): Run | undefined {
    const cached = this.runCache.get(id);
    if (cached) return cached;
    const row = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as SqliteRunRow | undefined;
    return row ? this.rowToRun(row) : undefined;
  }

  listRuns(limit = 20): Run[] {
    const rows = this.db.prepare("SELECT * FROM runs ORDER BY started_at DESC LIMIT ?").all(limit) as SqliteRunRow[];
    return rows.map((row) => this.runCache.get(row.id) ?? this.rowToRun(row));
  }

  insertEvent(event: AgentEvent): void {
    this.db.prepare("INSERT INTO events (run_id, type, payload, created_at) VALUES (?, ?, ?, ?)").run(
      event.runId,
      event.type,
      JSON.stringify(event),
      event.ts
    );
  }

  getEvents(runId: string): AgentEvent[] {
    const rows = this.db.prepare("SELECT type, payload, created_at FROM events WHERE run_id = ? ORDER BY created_at, id").all(runId) as SqliteEventRow[];
    return rows.map((row) => JSON.parse(row.payload) as AgentEvent);
  }

  getMemory(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM global_memory WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value;
  }

  setMemory(key: string, value: string): void {
    this.db.prepare(
      `INSERT INTO global_memory (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, value);
  }

  getAllMemory(): Array<{ key: string; value: string; updatedAt: string }> {
    const rows = this.db.prepare("SELECT key, value, updated_at FROM global_memory ORDER BY key").all() as SqliteMemoryRow[];
    return rows.map((row) => ({ key: row.key, value: row.value, updatedAt: row.updated_at }));
  }

  snapshotMemory(runId: string): void {
    const items = this.getAllMemory();
    const capturedAt = new Date().toISOString();
    this.snapshotCache.set(runId, { runId, capturedAt, items });
    const runExists = this.db.prepare("SELECT id FROM runs WHERE id = ?").get(runId);
    if (!runExists) return;
    for (const item of items) {
      this.db.prepare(
        `INSERT INTO memories (run_id, key, value, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(run_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).run(runId, item.key, item.value, item.updatedAt);
    }
  }

  getMemorySnapshot(runId: string): MemorySnapshot {
    const cached = this.snapshotCache.get(runId);
    if (cached) return cached;
    const rows = this.db.prepare("SELECT key, value, updated_at FROM memories WHERE run_id = ? ORDER BY key").all(runId) as SqliteMemoryRow[];
    return {
      runId,
      capturedAt: new Date().toISOString(),
      items: rows.map((row) => ({ key: row.key, value: row.value, updatedAt: row.updated_at })),
    };
  }

  createApproval(approval: Approval): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO approvals
       (id, run_id, action_description, risk_level, status, requested_at, resolved_at, resolved_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      approval.id,
      approval.runId,
      approval.actionDescription,
      approval.riskLevel,
      approval.status,
      approval.requestedAt,
      approval.resolvedAt ?? null,
      approval.resolvedBy ?? null
    );
  }

  updateApproval(id: string, patch: Partial<Approval>): void {
    const existing = this.getApproval(id);
    if (!existing) return;
    this.createApproval({ ...existing, ...patch });
  }

  getApproval(id: string): Approval | undefined {
    const row = this.db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as SqliteApprovalRow | undefined;
    return row ? this.rowToApproval(row) : undefined;
  }

  getPendingApprovals(runId: string): Approval[] {
    const rows = this.db.prepare("SELECT * FROM approvals WHERE run_id = ? AND status = 'pending' ORDER BY requested_at").all(runId) as SqliteApprovalRow[];
    return rows.map((row) => this.rowToApproval(row));
  }

  audit(runId: string, actor: string, action: string, detail?: string): void {
    this.db.prepare("INSERT INTO audit_logs (run_id, actor, action, detail, created_at) VALUES (?, ?, ?, ?, datetime('now'))").run(
      runId,
      actor,
      action,
      detail ?? null
    );
  }

  getAuditLog(runId: string): Array<{ actor: string; action: string; detail?: string; createdAt: string }> {
    const rows = this.db.prepare("SELECT actor, action, detail, created_at FROM audit_logs WHERE run_id = ? ORDER BY created_at, id").all(runId) as SqliteAuditRow[];
    return rows.map((row) => ({
      actor: row.actor,
      action: row.action,
      detail: row.detail ?? undefined,
      createdAt: row.created_at,
    }));
  }

  cacheEvidence(evidence: ExternalEvidence & { runId: string }): void {
    this.db.prepare(
      `INSERT INTO external_evidence_cache
       (run_id, source, query, snippet, url, relevance_score, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(evidence.runId, evidence.source, evidence.query, evidence.snippet, evidence.url, evidence.relevanceScore, evidence.fetchedAt);
  }

  getEvidence(runId: string): ExternalEvidence[] {
    const rows = this.db.prepare("SELECT source, query, snippet, url, relevance_score, fetched_at FROM external_evidence_cache WHERE run_id = ? ORDER BY fetched_at").all(runId) as SqliteEvidenceRow[];
    return rows.map((row) => ({
      source: row.source,
      query: row.query,
      snippet: row.snippet,
      url: row.url,
      relevanceScore: row.relevance_score ?? 0,
      fetchedAt: row.fetched_at,
    }));
  }

  close(): void {
    this.db.close();
  }

  private rowToRun(row: SqliteRunRow): Run {
    return {
      id: row.id,
      goal: row.goal,
      repo: row.repo,
      mode: row.mode,
      status: row.status,
      startedAt: row.started_at,
      finishedAt: row.finished_at ?? undefined,
      artifactDir: row.artifact_dir ?? undefined,
      finalDecision: row.final_decision ?? undefined,
      errorMessage: row.error_message ?? undefined,
    };
  }

  private rowToApproval(row: SqliteApprovalRow): Approval {
    return {
      id: row.id,
      runId: row.run_id,
      actionDescription: row.action_description,
      riskLevel: row.risk_level,
      status: row.status,
      requestedAt: row.requested_at,
      resolvedAt: row.resolved_at ?? undefined,
      resolvedBy: row.resolved_by ?? undefined,
    };
  }
}

// ─── Singleton factory (swappable by Codex) ───────────────────────────────────

let _db: IDb | null = null;

export function getDb(): IDb {
  if (!_db) {
    try {
      _db = new SqliteDb();
    } catch (err) {
      console.warn("ShipClaw SQLite unavailable; falling back to InMemoryDb:", String(err).split("\n")[0]);
      _db = new InMemoryDb();
    }
  }
  return _db;
}

export function setDb(db: IDb) { _db = db; }
export function resetDb() { _db = null; }
