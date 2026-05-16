/**
 * ShipClaw — Database migration script
 * Usage: npm run migrate
 *
 * Uses Node 24's built-in node:sqlite module. This avoids better-sqlite3's
 * native binding failure on Node 24 while still creating the production DB.
 */
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { SqliteDb } from "../src/storage/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DB_PATH = resolve(ROOT, "data", "shipclaw.sqlite");

mkdirSync(resolve(ROOT, "data"), { recursive: true });

const db = new SqliteDb(DB_PATH);
db.close();

console.log(`✅  Migration complete (SQLite): ${DB_PATH}`);
