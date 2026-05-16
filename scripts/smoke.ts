/**
 * ShipClaw — Smoke test
 * Runs a full end-to-end agent loop in demo mode with no network calls.
 * Exit 0 = pass, exit 1 = fail.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

process.env["DEMO_MODE"] = "true";
process.env["ALLOW_LLM_FALLBACK"] = "true";
process.env["EXA_ENABLED"] = "false";

import { existsSync } from "fs";
import { resolve } from "path";
import { runAgentLoop } from "../src/agent/loop.js";

const REQUIRED_ARTIFACTS = [
  "SHIPCLAW_READINESS.md",
  "github_issue_draft.md",
  "audit.jsonl",
  "memory_before.jsonl",
  "memory_after.jsonl",
  "memory_diff.md",
];

const eventsReceived: string[] = [];
let passed = 0;
let failed = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`   ✅ ${label}`);
    passed++;
  } else {
    console.error(`   ❌ ${label}`);
    failed++;
  }
}

console.log("\n🚢 ShipClaw smoke test starting...\n");

try {
  const result = await runAgentLoop({
    goal: "Smoke test run — check demo readiness",
    repo: "fixtures/demo",
    autoApproveLocal: true,
    onEvent: (e) => {
      eventsReceived.push(e.type);
    },
  });

  console.log("Checking run result...");
  check("run.status === 'complete'", result.run.status === "complete");
  check("score.total is numeric", typeof result.score.total === "number");
  check("score.total >= 0 and <= 100", result.score.total >= 0 && result.score.total <= 100);
  check("score.deterministic === true", result.score.deterministic === true);
  check("riskFingerprint.items is array", Array.isArray(result.riskFingerprint.items));
  check("timeToShip.minMinutes > 0", result.timeToShip.minMinutes > 0);
  check("artifactDir set", !!result.artifactDir);

  console.log("\nChecking artifact files...");
  for (const artifact of REQUIRED_ARTIFACTS) {
    const path = resolve(result.artifactDir, artifact);
    check(`${artifact} exists`, existsSync(path));
  }

  console.log("\nChecking event stream...");
  check("goal_received emitted", eventsReceived.includes("goal_received"));
  check("plan_created emitted", eventsReceived.includes("plan_created"));
  check("readiness_score_calculated emitted", eventsReceived.includes("readiness_score_calculated"));
  check("risk_fingerprint_created emitted", eventsReceived.includes("risk_fingerprint_created"));
  check("time_to_ship_estimated emitted", eventsReceived.includes("time_to_ship_estimated"));
  check("final_result emitted", eventsReceived.includes("final_result"));
  check("memory_updated emitted", eventsReceived.includes("memory_updated"));

  console.log(`\n─────────────────────────────────────────`);
  if (failed === 0) {
    console.log(`✅ Smoke test PASSED (${passed} checks)`);
    console.log(`   Decision: ${result.run.finalDecision?.toUpperCase()}`);
    console.log(`   Score:    ${result.score.total}/100`);
    console.log(`   Artifacts: ${result.artifactDir}/`);
  } else {
    console.error(`❌ Smoke test FAILED: ${failed} check(s) failed, ${passed} passed`);
  }
  console.log("─────────────────────────────────────────\n");

  process.exit(failed === 0 ? 0 : 1);
} catch (err) {
  console.error("❌ Smoke test threw:", err);
  process.exit(1);
}
