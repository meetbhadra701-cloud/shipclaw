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

// ─── Singleton factory (swappable by Codex) ───────────────────────────────────

let _db: IDb | null = null;

export function getDb(): IDb {
  if (!_db) _db = new InMemoryDb();
  return _db;
}

export function setDb(db: IDb) { _db = db; }
export function resetDb() { _db = null; }
