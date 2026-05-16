/**
 * ShipClaw — Safe Shell Tool
 * Codex-primary file (X-005). Claude provides interface + stub.
 *
 * IMPORTANT: runSafeCommand() must NEVER run arbitrary shell commands.
 * Only an explicit allowlist of safe, read-only commands is permitted.
 */

const SAFE_COMMANDS = new Set(["npm test", "npm run typecheck", "git log", "git status"]);

export interface ShellResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

// ─── STUB ─────────────────────────────────────────────────────────────────────

export async function runSafeCommand(command: string): Promise<ShellResult> {
  const isDemoMode = process.env["DEMO_MODE"] === "true";
  const baseCmd = command.split(" ").slice(0, 2).join(" ");

  if (!SAFE_COMMANDS.has(baseCmd)) {
    return {
      command,
      stdout: "",
      stderr: `Command not in allowlist: ${command}`,
      exitCode: 1,
      durationMs: 0,
    };
  }

  if (isDemoMode) {
    return {
      command,
      stdout: `[DEMO] Simulated output for: ${command}`,
      stderr: "",
      exitCode: 0,
      durationMs: 100,
    };
  }

  // TODO(Codex X-005): implement real safe shell execution with timeout
  return {
    command,
    stdout: `[STUB] Not yet implemented`,
    stderr: "",
    exitCode: 0,
    durationMs: 0,
  };
}
