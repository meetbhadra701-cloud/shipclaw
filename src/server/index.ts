/**
 * ShipClaw — Express Server
 * Claude-primary file.
 */
import express from "express";
import cors from "cors";
import { config as loadEnv } from "dotenv";
import { SERVER_PORT } from "../shared/constants.js";
import { setupRoutes } from "./routes.js";
import { setDb, SqliteDb } from "../storage/db.js";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const app = express();
app.use(cors());
app.use(express.json());

try {
  setDb(new SqliteDb());
} catch (err) {
  console.warn("ShipClaw server using InMemoryDb fallback:", String(err).split("\n")[0]);
}

setupRoutes(app);

app.listen(SERVER_PORT, () => {
  console.log(`🚢 ShipClaw server running on http://localhost:${SERVER_PORT}`);
});

export { app };
