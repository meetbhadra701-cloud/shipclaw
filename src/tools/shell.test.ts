import { afterEach, describe, expect, it } from "vitest";
import { isSafeCommand, runSafeCommand } from "./shell.js";

describe("shell allowlist", () => {
  const originalDemo = process.env["DEMO_MODE"];
  afterEach(() => {
    if (originalDemo === undefined) delete process.env["DEMO_MODE"];
    else process.env["DEMO_MODE"] = originalDemo;
  });

  it("accepts the exact commands the agent loop runs", () => {
    expect(isSafeCommand("npm run typecheck")).toBe(true);
    expect(isSafeCommand("npm test")).toBe(true);
  });

  it("rejects commands that only share a prefix with an allowlisted command", () => {
    expect(isSafeCommand("npm run build")).toBe(false);
    expect(isSafeCommand("npm run")).toBe(false);
    expect(isSafeCommand("npm test && rm -rf /")).toBe(false);
  });

  it("does not report the allowlisted typecheck as a failure", async () => {
    process.env["DEMO_MODE"] = "true";
    const result = await runSafeCommand("npm run typecheck");
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("refuses non-allowlisted commands without executing them", async () => {
    const result = await runSafeCommand("curl http://example.com");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/not in allowlist/);
  });
});
