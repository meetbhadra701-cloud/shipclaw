import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeJson, DEFAULT_NEMOTRON_MODEL, describeNemotronFailure, NemotronError } from "./nemotron.js";

const messages = [{ role: "user" as const, content: "Return a JSON object." }];
const response = (content: string | null, finish_reason = "stop", refusal: string | null = null) => new Response(JSON.stringify({
  choices: [{ finish_reason, message: { content, refusal, reasoning_content: "PRIVATE-TRACE-DO-NOT-RETURN" } }],
}), { headers: { "content-type": "application/json" } });
beforeEach(() => {
  vi.stubEnv("NEMOTRON_API_KEY", "test-only-secret");
  vi.stubEnv("NEMOTRON_MODEL", "");
  vi.stubEnv("NEMOTRON_BASE_URL", "");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const failure = (p: Promise<unknown>) => p.then(() => { throw new Error("expected a Nemotron failure"); }, (e: unknown) => e as NemotronError);

describe("Nemotron structured JSON transport", () => {
  it("sends the requested NVIDIA model and JSON controls through the actual SDK", async () => {
    const fetch = vi.fn(async () => response('{"ok":true}'));
    vi.stubGlobal("fetch", fetch);
    expect(await completeJson(messages)).toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: DEFAULT_NEMOTRON_MODEL, temperature: .3, top_p: .95, max_tokens: 4096, stream: false, response_format: { type: "json_object" }, chat_template_kwargs: { enable_thinking: false } });
    expect(body).not.toHaveProperty("extra_body");
    expect(body).not.toHaveProperty("reasoning_budget");
    expect(JSON.stringify(body)).not.toContain("test-only-secret");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(["length", "content_filter", "tool_calls"])("rejects incomplete/non-content response: %s", async reason => {
    vi.stubGlobal("fetch", vi.fn(async () => response('{"ok":true}', reason)));
    await expect(completeJson(messages)).rejects.toThrow("complete, accepted JSON");
  });
  it("rejects invalid JSON without exposing content or reasoning", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response("PRIVATE-RESPONSE")));
    await expect(completeJson(messages)).rejects.toThrow(/^Nemotron returned invalid JSON\.$/);
  });
  it("rejects a refusal even if content happens to be valid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response('{}', 'stop', 'private refusal detail')));
    await expect(completeJson(messages)).rejects.toThrow("complete, accepted JSON");
  });
  it("does not print or propagate API errors, and does not retry", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: "test-only-secret PRIVATE-TRACE" } }), { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    await expect(completeJson(messages)).rejects.toThrow(/^Nemotron request failed \(HTTP 401\)\.$/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("classifies a request timeout with measured duration (accelerated, no retry)", async () => {
    const fetch = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("PRIVATE-ABORT"), { name: "AbortError" })));
    }));
    vi.stubGlobal("fetch", fetch);
    const error = await failure(completeJson(messages, { timeoutMs: 25 }));
    expect(error).toBeInstanceOf(NemotronError);
    expect(error).toMatchObject({ category: "timeout", status: undefined, message: "Nemotron request failed." });
    expect(error.elapsedMs).toBeGreaterThanOrEqual(20);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(describeNemotronFailure(error)).toMatch(/^\[Nemotron\] failure category=timeout elapsedMs=\d+ model=nvidia\/nemotron-3\.5-lightning-30b-a3b$/);
  });
  it("retains HTTP status without leaking the provider body, key, or prompt", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "PRIVATE-BODY test-only-secret" } }), { status: 503 })));
    const error = await failure(completeJson(messages));
    expect(error).toMatchObject({ category: "http_error", status: 503 });
    const line = describeNemotronFailure(error);
    expect(line).toMatch(/^\[Nemotron\] failure category=http_error status=503 elapsedMs=\d+ model=/);
    for (const secret of ["PRIVATE-BODY", "test-only-secret", "Return a JSON object", "Bearer"]) {
      expect(line).not.toContain(secret);
      expect(JSON.stringify({ ...error, message: error.message })).not.toContain(secret);
    }
  });
  it("classifies an unknown transport failure without its text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("PRIVATE-TRANSPORT test-only-secret"); }));
    const error = await failure(completeJson(messages));
    expect(error).toMatchObject({ category: "unknown", message: "Nemotron request failed." });
    expect(describeNemotronFailure(error)).not.toContain("PRIVATE-TRANSPORT");
  });
  it.each([
    ["invalid_json", response("PRIVATE-RESPONSE")],
    ["incomplete_response", response('{"ok":true}', "length")],
    ["incomplete_response", response(null)],
    ["refusal", response("{}", "stop", "private refusal detail")],
  ])("classifies response failure as %s", async (category, res) => {
    vi.stubGlobal("fetch", vi.fn(async () => res));
    const error = await failure(completeJson(messages));
    expect(error).toMatchObject({ category });
    expect(describeNemotronFailure(error)).not.toMatch(/PRIVATE|private refusal/);
  });
  it("classifies missing configuration before any request", async () => {
    vi.stubEnv("NEMOTRON_API_KEY", "");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(await failure(completeJson(messages))).toMatchObject({ category: "not_configured" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never forwards text from unclassified errors", () => {
    expect(describeNemotronFailure(new Error("PRIVATE test-only-secret"))).toBe(`[Nemotron] failure category=unknown model=${DEFAULT_NEMOTRON_MODEL}`);
  });
  it("honors locally configured model selection", async () => {
    vi.stubEnv("NEMOTRON_MODEL", "configured-model");
    const fetch = vi.fn(async () => response('{}')); vi.stubGlobal("fetch", fetch);
    await completeJson(messages);
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).model).toBe("configured-model");
  });
});
