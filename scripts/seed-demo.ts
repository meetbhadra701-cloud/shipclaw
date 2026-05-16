/**
 * ShipClaw — Seed demo data
 * Creates a synthetic completed run in the DB for UI development/demo.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

process.env["DEMO_MODE"] = "true";
process.env["ALLOW_LLM_FALLBACK"] = "true";

import { runAgentLoop } from "../src/agent/loop.js";

console.log("🌱 Seeding demo run...");

runAgentLoop({
  goal: "Validate release readiness for demo day",
  repo: "fixtures/demo",
  autoApproveLocal: true,
  onEvent: (e) => {
    if (e.type === "readiness_score_calculated") {
      console.log(`   Score: ${e.score.total}/100 (${e.score.band})`);
    }
    if (e.type === "final_result") {
      console.log(`   Decision: ${e.decision.toUpperCase()}`);
    }
  },
})
  .then((result) => {
    console.log(`✅ Demo run seeded: ${result.run.id}`);
    console.log(`   Artifacts: ${result.artifactDir}/`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
