/**
 * ShipClaw — Install OpenClaw Skill
 * Copies openclaw/skills/shipclaw/SKILL.md to ~/.openclaw/workspace/skills/shipclaw/
 */
import { mkdirSync, copyFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SRC = resolve(ROOT, "openclaw", "skills", "shipclaw", "SKILL.md");
const DEST_DIR = resolve(homedir(), ".openclaw", "workspace", "skills", "shipclaw");
const DEST = resolve(DEST_DIR, "SKILL.md");

if (!existsSync(SRC)) {
  console.error(`❌ Source skill not found: ${SRC}`);
  process.exit(1);
}

mkdirSync(DEST_DIR, { recursive: true });
copyFileSync(SRC, DEST);

console.log(`✅ ShipClaw skill installed to: ${DEST}`);
console.log("");
console.log("To invoke via OpenClaw:");
console.log('  openclaw agent --message "Check release readiness for https://github.com/owner/repo"');
console.log("");
console.log("Or use the CLI directly:");
console.log('  npm run agent:run -- --repo https://github.com/owner/repo --goal "Check release readiness"');
