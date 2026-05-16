/**
 * ShipClaw — Database migration script
 * Usage: npm run migrate
 * Creates data/shipclaw.sqlite and applies schema.sql.
 */
import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DB_PATH = resolve(ROOT, "data", "shipclaw.sqlite");
const SCHEMA_PATH = resolve(ROOT, "src", "storage", "schema.sql");

mkdirSync(resolve(ROOT, "data"), { recursive: true });

const db = new Database(DB_PATH);
const schema = readFileSync(SCHEMA_PATH, "utf-8");

db.exec(schema);

console.log(`✅  Migration complete: ${DB_PATH}`);
console.log("Tables created:");
const tables = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  )
  .all() as Array<{ name: string }>;
tables.forEach((t) => console.log(`   • ${t.name}`));

db.close();
