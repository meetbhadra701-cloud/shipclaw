/**
 * ShipClaw — Database migration script
 * Usage: npm run migrate
 *
 * Uses Node 24's built-in node:sqlite module. This avoids better-sqlite3's
 * native binding failure on Node 24 while still creating the production DB.
 */
import "../src/shared/env.js";
import { SqliteDb } from "../src/storage/db.js";
import { getStoragePaths } from "../src/storage/paths.js";

const DB_PATH = getStoragePaths().databasePath;

const db = new SqliteDb(DB_PATH);
db.close();

console.log(`✅  Migration complete (SQLite): ${DB_PATH}`);
