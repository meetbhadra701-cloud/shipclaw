/**
 * ShipClaw — CLI Entry Point
 * Usage: npm run agent:run -- --repo <url> --goal "<text>" [--demo] [--auto-approve-local]
 *
 * Shared file — log changes in COMMUNICATION_LOG.md.
 */
import { config as loadEnv } from "dotenv";
import { runAgentLoop } from "./loop.js";
import type { AgentEvent } from "../shared/types.js";

// Load .env.local first, then .env
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

// ─── Parse CLI args ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

const repo = getArg("--repo") ?? "";
const goal = getArg("--goal") ?? "Check release readiness";
const demo = hasFlag("--demo");
const autoApproveLocal = hasFlag("--auto-approve-local");

if (!repo) {
  console.error("Usage: npm run agent:run -- --repo <url-or-path> --goal \"<text>\" [--demo] [--auto-approve-local]");
  process.exit(1);
}

if (demo) process.env["DEMO_MODE"] = "true";

// ─── Event printer ────────────────────────────────────────────────────────────

function printEvent(event: AgentEvent): void {
  const tag = `[${event.type.padEnd(32)}]`;
  switch (event.type) {
    case "goal_received":
      console.log(`${tag} Goal: "${event.goal}"`);
      break;
    case "memory_loaded":
      console.log(`${tag} ${event.itemCount} memory items | prior runs: ${event.basedOnMemory ? "yes" : "no (first run)"}`);
      break;
    case "plan_created":
      console.log(`${tag} ${event.plan.steps.length} steps planned`);
      break;
    case "tool_call_started":
      console.log(`${tag} → ${event.tool}`);
      break;
    case "tool_call_finished":
      console.log(`${tag} ← ${event.tool} ${event.success ? "✓" : "✗"} (${event.durationMs}ms)`);
      break;
    case "readiness_score_calculated":
      console.log(`${tag} Score: ${event.score.total}/100 (${event.score.band})`);
      break;
    case "risk_fingerprint_created":
      console.log(`${tag} ${event.fingerprint.items.length} risk signals`);
      break;
    case "time_to_ship_estimated":
      console.log(`${tag} ${event.estimate.minMinutes}–${event.estimate.maxMinutes} min`);
      break;
    case "external_evidence_status":
      console.log(`${tag} Exa ${event.enabled ? `enabled, ${event.count} results` : "disabled"}`);
      break;
    case "approval_requested":
      console.log(`${tag} Approval needed: ${event.approval.actionDescription.slice(0, 60)}…`);
      break;
    case "approval_resolved":
      console.log(`${tag} Approval ${event.approval.status} by ${event.approval.resolvedBy}`);
      break;
    case "memory_updated":
      console.log(`${tag} ${event.changes.filter((c) => c.changeType !== "unchanged").length} memory changes`);
      break;
    case "final_result":
      console.log(`${tag} Decision: ${event.decision.toUpperCase()} | Score: ${event.score.total}/100`);
      break;
  }
}

// ─── Run ──────────────────────────────────────────────────────────────────────

console.log(`\n🚢 ShipClaw starting...`);
console.log(`   Repo: ${repo}`);
console.log(`   Goal: ${goal}`);
console.log(`   Mode: ${demo ? "demo" : "live"} | Auto-approve: ${autoApproveLocal}\n`);

runAgentLoop({
  goal,
  repo,
  autoApproveLocal,
  onEvent: printEvent,
})
  .then((result) => {
    console.log("\n─────────────────────────────────────────");
    console.log(`✅ Run complete: ${result.run.id}`);
    console.log(`   Score:    ${result.score.total}/100 (${result.score.band})`);
    console.log(`   Decision: ${result.run.finalDecision?.toUpperCase()}`);
    console.log(`   Artifacts: ${result.artifactDir}/`);
    console.log("─────────────────────────────────────────\n");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Run failed:", err);
    process.exit(1);
  });
