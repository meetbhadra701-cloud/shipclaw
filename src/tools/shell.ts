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
  status: "rejected" | "simulated" | "unmeasured";
  exitCode: number | null;
  durationMs: number;
}

export function isSafeCommand(command: string): boolean {
  return SAFE_COMMANDS.has(command.trim().replace(/\s+/g, " "));
}

// ─── STUB ─────────────────────────────────────────────────────────────────────

export async function runSafeCommand(command: string): Promise<ShellResult> {
  const isDemoMode = process.env["DEMO_MODE"] === "true";

  // Exact match only. (Previously only the first two words were compared, so
  // "npm run typecheck" became "npm run", was rejected, and the rejection was
  // then recorded as a failing typecheck in the CI evidence.)
  if (!isSafeCommand(command)) {
    return {
      command,
      stdout: "",
      stderr: `Command not in allowlist: ${command}`,
      status: "rejected",
      exitCode: 1,
      durationMs: 0,
    };
  }

  if (isDemoMode) {
    return {
      command,
      stdout: `[DEMO] Simulated output for: ${command}`,
      stderr: "",
      status: "simulated",
      exitCode: 0,
      durationMs: 100,
    };
  }

  // Deliberately disabled: remote repository scripts are outside this read-only boundary.
  return {
    command,
    stdout: "",
    stderr: "",
    status: "unmeasured",
    exitCode: null,
    durationMs: 0,
  };
}
