/**
 * ShipClaw — Memory adapter
 * Claude-primary file.
 *
 * Provides a clean API for reading/writing cross-run memory via IDb.
 * Also writes the three visible artifacts per run:
 *   runs/<runId>/memory_before.jsonl
 *   runs/<runId>/memory_after.jsonl
 *   runs/<runId>/memory_diff.md
 */
import { writeFileSync } from "fs";
import { resolve } from "path";
import type { MemoryChange, MemorySnapshot } from "../shared/types.js";
import type { IDb } from "../storage/db.js";

// ─── Memory Keys ──────────────────────────────────────────────────────────────
// Use namespaced keys to avoid collisions

export const MEMORY_KEYS = {
  lastRunId: "meta:lastRunId",
  totalRuns: "meta:totalRuns",
  lastScore: "meta:lastScore",
  lastDecision: "meta:lastDecision",
  knownBlockers: "blockers:known",
  repoLastSeen: (repo: string) => `repo:${repo}:lastSeen`,
  repoScoreHistory: (repo: string) => `repo:${repo}:scoreHistory`,
} as const;

// ─── Memory helpers ───────────────────────────────────────────────────────────

export class MemoryManager {
  constructor(private db: IDb, private runId: string, private artifactDir: string) {}

  /** Capture a before-snapshot and write memory_before.jsonl */
  captureBeforeSnapshot(): MemorySnapshot {
    this.db.snapshotMemory(`${this.runId}:before`);
    const snapshot = this.db.getMemorySnapshot(`${this.runId}:before`);
    this.writeJsonl(
      resolve(this.artifactDir, "memory_before.jsonl"),
      snapshot.items
    );
    return snapshot;
  }

  /** Capture an after-snapshot and write memory_after.jsonl + memory_diff.md */
  captureAfterSnapshot(before: MemorySnapshot): { after: MemorySnapshot; changes: MemoryChange[] } {
    this.db.snapshotMemory(`${this.runId}:after`);
    const after = this.db.getMemorySnapshot(`${this.runId}:after`);
    this.writeJsonl(
      resolve(this.artifactDir, "memory_after.jsonl"),
      after.items
    );

    const changes = this.diff(before, after);
    this.writeDiff(resolve(this.artifactDir, "memory_diff.md"), changes);
    return { after, changes };
  }

  /** Get a global memory value */
  get(key: string): string | undefined {
    return this.db.getMemory(key);
  }

  /** Set a global memory value */
  set(key: string, value: string): void {
    this.db.setMemory(key, value);
  }

  /** Update run-completion metadata */
  recordRunCompletion(score: number, decision: string): void {
    const totalRuns = parseInt(this.db.getMemory(MEMORY_KEYS.totalRuns) ?? "0", 10);
    this.db.setMemory(MEMORY_KEYS.totalRuns, String(totalRuns + 1));
    this.db.setMemory(MEMORY_KEYS.lastRunId, this.runId);
    this.db.setMemory(MEMORY_KEYS.lastScore, String(score));
    this.db.setMemory(MEMORY_KEYS.lastDecision, decision);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private writeJsonl(path: string, items: Array<Record<string, unknown>>) {
    const lines = items.map((item) => JSON.stringify(item)).join("\n");
    writeFileSync(path, lines + "\n", "utf-8");
  }

  private diff(before: MemorySnapshot, after: MemorySnapshot): MemoryChange[] {
    const beforeMap = new Map(before.items.map((i) => [i.key, i.value]));
    const afterMap = new Map(after.items.map((i) => [i.key, i.value]));
    const changes: MemoryChange[] = [];

    for (const [key, afterVal] of afterMap) {
      const beforeVal = beforeMap.get(key) ?? null;
      if (beforeVal === null) {
        changes.push({ key, before: null, after: afterVal, changeType: "added" });
      } else if (beforeVal !== afterVal) {
        changes.push({ key, before: beforeVal, after: afterVal, changeType: "updated" });
      } else {
        changes.push({ key, before: beforeVal, after: afterVal, changeType: "unchanged" });
      }
    }
    for (const [key, beforeVal] of beforeMap) {
      if (!afterMap.has(key)) {
        changes.push({ key, before: beforeVal, after: null, changeType: "removed" });
      }
    }
    return changes;
  }

  private writeDiff(path: string, changes: MemoryChange[]) {
    const added = changes.filter((c) => c.changeType === "added");
    const updated = changes.filter((c) => c.changeType === "updated");
    const removed = changes.filter((c) => c.changeType === "removed");
    const unchanged = changes.filter((c) => c.changeType === "unchanged");

    const lines: string[] = [
      `# Memory Diff — Run ${this.runId}`,
      `Generated: ${new Date().toISOString()}`,
      "",
      `## Summary`,
      `| Change | Count |`,
      `|---|---|`,
      `| ➕ Added | ${added.length} |`,
      `| ✏️ Updated | ${updated.length} |`,
      `| ❌ Removed | ${removed.length} |`,
      `| ═ Unchanged | ${unchanged.length} |`,
      "",
    ];

    if (added.length > 0) {
      lines.push("## Added");
      added.forEach((c) => lines.push(`- \`${c.key}\` = \`${c.after}\``));
      lines.push("");
    }
    if (updated.length > 0) {
      lines.push("## Updated");
      updated.forEach((c) =>
        lines.push(`- \`${c.key}\`: \`${c.before}\` → \`${c.after}\``)
      );
      lines.push("");
    }
    if (removed.length > 0) {
      lines.push("## Removed");
      removed.forEach((c) => lines.push(`- \`${c.key}\` (was: \`${c.before}\`)`));
      lines.push("");
    }

    writeFileSync(path, lines.join("\n"), "utf-8");
  }
}
