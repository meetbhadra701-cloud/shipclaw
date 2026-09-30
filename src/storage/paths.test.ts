import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SqliteDb } from "./db.js";
import { getRunArtifactDir, getStoragePaths } from "./paths.js";

afterEach(() => { vi.unstubAllEnvs(); });

describe("runtime storage configuration", () => {
  it.each([undefined, "", "   "])("preserves local storage when the disk root is %s", root => {
    vi.stubEnv("SHIPCLAW_DATA_DIR", root ?? "");
    if (root === undefined) delete process.env["SHIPCLAW_DATA_DIR"];
    expect(getStoragePaths()).toEqual({ databasePath: resolve("data/shipclaw.sqlite"), runsDir: resolve("runs") });
    expect(getRunArtifactDir("run-1")).toBe(resolve("runs/run-1"));
  });

  it("uses the configured disk for SQLite and artifacts, and reopens existing SQLite data", () => {
    const root = mkdtempSync(join(tmpdir(), "shipclaw-storage-"));
    vi.stubEnv("SHIPCLAW_DATA_DIR", root);
    try {
      expect(getRunArtifactDir("run-1")).toBe(join(root, "runs", "run-1"));
      const first = new SqliteDb();
      try { first.setMemory("persisted", "yes"); } finally { first.close(); }
      expect(existsSync(join(root, "shipclaw.sqlite"))).toBe(true);
      const reopened = new SqliteDb();
      try { expect(reopened.getMemory("persisted")).toBe("yes"); } finally { reopened.close(); }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
