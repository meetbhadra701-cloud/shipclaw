import { resolve } from "node:path";

/** One optional disk root for both SQLite and artifacts; preserve local defaults. */
export function getStoragePaths() {
  const root = process.env["SHIPCLAW_DATA_DIR"]?.trim();
  return {
    databasePath: root ? resolve(root, "shipclaw.sqlite") : resolve("data", "shipclaw.sqlite"),
    runsDir: root ? resolve(root, "runs") : resolve("runs"),
  };
}

export function getRunArtifactDir(runId: string): string {
  return resolve(getStoragePaths().runsDir, runId);
}
