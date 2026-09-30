import "../shared/env.js";
/**
 * ShipClaw — Express Server
 * Claude-primary file.
 */
import express from "express";
import cors from "cors";
import { existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { SERVER_PORT } from "../shared/constants.js";
import { setupRoutes } from "./routes.js";
import { setDb, SqliteDb } from "../storage/db.js";
import { getStoragePaths } from "../storage/paths.js";



// ── Ensure required runtime directories exist ────────────────────────────────
const storage = getStoragePaths();
mkdirSync(storage.runsDir, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json());

try {
  setDb(new SqliteDb());
} catch (err) {
  // A production health check must not hide a broken persistent disk/database.
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("ShipClaw could not initialize SQLite. Check the runtime version and storage directory permissions.");
  }
  console.warn("ShipClaw server using InMemoryDb fallback:", String(err).split("\n")[0]);
}

setupRoutes(app);

// ── Serve built frontend in production ────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// dist/ui is at <project-root>/dist/ui — resolve relative to project root
const distUi = resolve(__dirname, "../../dist/ui");
if (process.env["NODE_ENV"] === "production" && !existsSync(resolve(distUi, "index.html"))) {
  throw new Error("ShipClaw frontend build is missing. Run npm run build before npm start.");
}
if (existsSync(resolve(distUi, "index.html"))) {
  app.use(express.static(distUi));
  // SPA fallback: any non-API GET → index.html
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(resolve(distUi, "index.html"));
  });
  console.log(`ShipClaw: serving frontend from ${distUi}`);
}

app.listen(SERVER_PORT, "0.0.0.0", () => {
  console.log(`ShipClaw server listening on 0.0.0.0:${SERVER_PORT}`);
});

export { app };
