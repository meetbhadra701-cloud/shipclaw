/**
 * ShipClaw — Express Server
 * Claude-primary file.
 */
import express from "express";
import cors from "cors";
import { config as loadEnv } from "dotenv";
import { SERVER_PORT } from "../shared/constants.js";
import { setupRoutes } from "./routes.js";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const app = express();
app.use(cors());
app.use(express.json());

setupRoutes(app);

app.listen(SERVER_PORT, () => {
  console.log(`🚢 ShipClaw server running on http://localhost:${SERVER_PORT}`);
});

export { app };
