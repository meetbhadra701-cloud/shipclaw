import { afterEach, describe, expect, it } from "vitest";
import { isSafeCommand, runSafeCommand } from "./shell.js";

describe("shell allowlist", () => {
  const originalDemo = process.env["DEMO_MODE"];
  afterEach(() => {
    if (originalDemo === undefined) delete process.env["DEMO_MODE"];
    else process.env["DEMO_MODE"] = originalDemo;
  });

  it("recognizes the legacy exact allowlist (not used by the agent loop)", () => {
    expect(isSafeCommand("npm run typecheck")).toBe(true);
    expect(isSafeCommand("npm test")).toBe(true);
  });

  it("rejects commands that only share a prefix with an allowlisted command", () => {
    expect(isSafeCommand("npm run build")).toBe(false);
    expect(isSafeCommand("npm run")).toBe(false);
    expect(isSafeCommand("npm test && rm -rf /")).toBe(false);
  });

  it("labels legacy sample output as simulated", async () => {
    process.env["DEMO_MODE"] = "true";
    const result = await runSafeCommand("npm run typecheck");
    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("simulated");
    expect(result.stderr).toBe("");
  });

  it("cannot report an unexecuted live command as passing", async () => {
    process.env["DEMO_MODE"] = "false";
    expect(await runSafeCommand("npm test")).toMatchObject({ status: "unmeasured", exitCode: null });
  });

  it("refuses non-allowlisted commands without executing them", async () => {
    const result = await runSafeCommand("curl http://example.com");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/not in allowlist/);
  });
});
