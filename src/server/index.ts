/**
 * ShipClaw — Express Server
 * Claude-primary file.
 */
import express from "express";
import cors from "cors";
import { config as loadEnv } from "dotenv";
import { existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { SERVER_PORT } from "../shared/constants.js";
import { setupRoutes } from "./routes.js";
import { setDb, SqliteDb } from "../storage/db.js";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

// ── Ensure required runtime directories exist ────────────────────────────────
for (const dir of ["runs", "data"]) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`ShipClaw: created runtime directory ./${dir}/`);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

try {
  setDb(new SqliteDb());
} catch (err) {
  console.warn("ShipClaw server using InMemoryDb fallback:", String(err).split("\n")[0]);
}

setupRoutes(app);

// ── Serve built frontend in production ────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// dist/ui is at <project-root>/dist/ui — resolve relative to project root
const distUi = resolve(__dirname, "../../dist/ui");
if (existsSync(distUi)) {
  app.use(express.static(distUi));
  // SPA fallback: any non-API GET → index.html
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(resolve(distUi, "index.html"));
  });
  console.log(`ShipClaw: serving frontend from ${distUi}`);
}

app.listen(SERVER_PORT, () => {
  console.log(`ShipClaw server running on http://localhost:${SERVER_PORT}`);
});

export { app };
