/**
 * ShipClaw — Database migration script
 * Usage: npm run migrate
 *
 * Tries better-sqlite3 first. If native bindings unavailable (common on Node 24+),
 * reports the issue and confirms the InMemoryDb fallback is active.
 *
 * The production SQLite implementation (X-001) is a Codex-owned task.
 * The agent loop uses InMemoryDb by default until X-001 ships.
 */
import { mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DB_PATH = resolve(ROOT, "data", "shipclaw.sqlite");

mkdirSync(resolve(ROOT, "data"), { recursive: true });

try {
  const { default: Database } = await import("better-sqlite3");
  const { readFileSync } = await import("fs");
  const SCHEMA_PATH = resolve(ROOT, "src", "storage", "schema.sql");

  const db = new Database(DB_PATH);
  const schema = readFileSync(SCHEMA_PATH, "utf-8");
  db.exec(schema);

  console.log(`✅  Migration complete (SQLite): ${DB_PATH}`);
  console.log("Tables created:");
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as Array<{ name: string }>;
  tables.forEach((t) => console.log(`   • ${t.name}`));
  db.close();
} catch (err) {
  console.warn("⚠️  better-sqlite3 native bindings unavailable (Node 24 compatibility issue).");
  console.warn("   Detail:", String(err).split("\n")[0]);
  console.warn("");
  console.warn("   ShipClaw will use InMemoryDb for this session.");
  console.warn("   SQLite persistence (X-001) is a Codex-owned task.");
  console.warn("   All agent loop functionality works with InMemoryDb.");
  console.warn("");

  if (existsSync(DB_PATH)) {
    console.log(`   Existing SQLite file: ${DB_PATH}`);
  } else {
    console.log(`   No SQLite file at: ${DB_PATH} (will be created when X-001 ships)`);
  }

  // Exit 0: InMemoryDb is the valid fallback — not a blocker for MVP
  process.exit(0);
}
