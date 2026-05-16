import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { SqliteDb } from "./db.js";

function tempDbPath() {
  return join(mkdtempSync(join(tmpdir(), "shipclaw-sqlite-")), "shipclaw.sqlite");
}

describe("SqliteDb", () => {
  it("persists global memory across database instances", () => {
    const dbPath = tempDbPath();
    const first = new SqliteDb(dbPath);
    first.setMemory("meta:totalRuns", "1");
    first.setMemory("meta:lastScore", "59");
    first.close();

    const second = new SqliteDb(dbPath);
    expect(second.getMemory("meta:totalRuns")).toBe("1");
    expect(second.getMemory("meta:lastScore")).toBe("59");
    second.close();
  });

  it("captures run-scoped memory snapshots from persisted global memory", () => {
    const db = new SqliteDb(tempDbPath());
    db.setMemory("repo:demo:lastSeen", "2026-05-16T00:00:00.000Z");
    db.snapshotMemory("run-1:before");

    const snapshot = db.getMemorySnapshot("run-1:before");
    expect(snapshot.items).toEqual([
      {
        key: "repo:demo:lastSeen",
        value: "2026-05-16T00:00:00.000Z",
        updatedAt: expect.any(String),
      },
    ]);
    db.close();
  });
});
