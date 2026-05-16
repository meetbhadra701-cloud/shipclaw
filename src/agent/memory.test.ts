import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { InMemoryDb } from "../storage/db.js";
import { MEMORY_KEYS, MemoryManager } from "./memory.js";

describe("MemoryManager", () => {
  it("writes empty before snapshots and visible added/updated diff artifacts", () => {
    const artifactDir = mkdtempSync(join(tmpdir(), "shipclaw-memory-"));
    const db = new InMemoryDb();
    const memory = new MemoryManager(db, "memory-test-run", artifactDir);

    const before = memory.captureBeforeSnapshot();
    memory.set(MEMORY_KEYS.totalRuns, "1");
    memory.set(MEMORY_KEYS.lastDecision, "hold");
    memory.recordRunCompletion(42, "ship");

    const { after, changes } = memory.captureAfterSnapshot(before);

    expect(before.items).toEqual([]);
    expect(after.items.map((item) => item.key)).toEqual([
      MEMORY_KEYS.totalRuns,
      MEMORY_KEYS.lastDecision,
      MEMORY_KEYS.lastRunId,
      MEMORY_KEYS.lastScore,
    ]);
    expect(changes.map((change) => change.changeType)).toEqual(["added", "added", "added", "added"]);
    expect(readFileSync(join(artifactDir, "memory_before.jsonl"), "utf-8")).toBe("");
    expect(readFileSync(join(artifactDir, "memory_after.jsonl"), "utf-8")).toContain(`"key":"${MEMORY_KEYS.totalRuns}"`);
    expect(readFileSync(join(artifactDir, "memory_diff.md"), "utf-8")).toContain("| ➕ Added | 4 |");
  });

  it("records updated and unchanged memory entries across snapshots", () => {
    const artifactDir = mkdtempSync(join(tmpdir(), "shipclaw-memory-"));
    const db = new InMemoryDb();
    const memory = new MemoryManager(db, "memory-update-run", artifactDir);

    memory.set(MEMORY_KEYS.lastDecision, "hold");
    memory.set(MEMORY_KEYS.knownBlockers, "ci_health");
    const before = memory.captureBeforeSnapshot();
    memory.set(MEMORY_KEYS.lastDecision, "ship");

    const { changes } = memory.captureAfterSnapshot(before);

    expect(changes).toEqual(
      expect.arrayContaining([
        {
          key: MEMORY_KEYS.lastDecision,
          before: "hold",
          after: "ship",
          changeType: "updated",
        },
        {
          key: MEMORY_KEYS.knownBlockers,
          before: "ci_health",
          after: "ci_health",
          changeType: "unchanged",
        },
      ])
    );
    expect(readFileSync(join(artifactDir, "memory_diff.md"), "utf-8")).toContain("| ✏️ Updated | 1 |");
  });
});
