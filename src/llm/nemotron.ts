/** NVIDIA assessor transport: JSON content only; never emit reasoning or raw API errors. */
import OpenAI from "openai";

export const DEFAULT_NEMOTRON_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
export const DEFAULT_NEMOTRON_BASE_URL = "https://integrate.api.nvidia.com/v1";
export function getNemotronModel(): string {
  return process.env["NEMOTRON_MODEL"] || DEFAULT_NEMOTRON_MODEL;
}

export interface NemotronMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
export interface NemotronOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  model?: string;
  timeoutMs?: number;
}

export type NemotronFailureCategory =
  | "timeout" | "http_error" | "invalid_json" | "schema_validation"
  | "incomplete_response" | "refusal" | "not_configured" | "unknown";

/** Fixed message plus allowlisted metadata only; never the SDK error, body, headers, or content. */
export class NemotronError extends Error {
  constructor(message: string, readonly category: NemotronFailureCategory, readonly elapsedMs?: number, readonly status?: number) {
    super(message);
    this.name = "NemotronError";
  }
}

/** One sanitized log line for a failed assessment. Unclassified errors never contribute their text. */
export function describeNemotronFailure(error: unknown): string {
  const e = error instanceof NemotronError ? error : undefined;
  return [
    `[Nemotron] failure category=${e?.category ?? "unknown"}`,
    e?.status !== undefined ? `status=${e.status}` : "",
    e?.elapsedMs !== undefined ? `elapsedMs=${e.elapsedMs}` : "",
    `model=${getNemotronModel()}`,
  ].filter(Boolean).join(" ");
}

async function requestCompletion(messages: NemotronMessage[], opts: NemotronOptions): Promise<{ content: string; elapsedMs: number }> {
  const apiKey = process.env["NEMOTRON_API_KEY"];
  if (!apiKey) throw new NemotronError("NEMOTRON_API_KEY is not configured", "not_configured");
  const client = new OpenAI({
    apiKey,
    baseURL: process.env["NEMOTRON_BASE_URL"] || DEFAULT_NEMOTRON_BASE_URL,
    timeout: opts.timeoutMs ?? 60_000,
    maxRetries: 0,
    // Resolve fetch per request so tests can inspect the actual SDK wire payload.
    fetch: (input, init) => globalThis.fetch(input, init),
  });
  // Python's extra_body merges these fields into the top-level JSON. The JS SDK
  // passes extra body properties directly; nesting under extra_body would be wrong.
  const request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
    chat_template_kwargs: { enable_thinking: false };
  } = {
    model: opts.model ?? getNemotronModel(),
    messages,
    temperature: opts.temperature ?? 0.3,
    top_p: opts.topP ?? 0.95,
    max_tokens: opts.maxTokens ?? 4096,
    response_format: { type: "json_object" },
    chat_template_kwargs: { enable_thinking: false },
    stream: false,
  };
  let response: OpenAI.Chat.Completions.ChatCompletion;
  const started = Date.now();
  try {
    response = await client.chat.completions.create(request);
  } catch (error) {
    // Never propagate the SDK error object: it can contain request/response data.
    const elapsedMs = Date.now() - started;
    if (error instanceof OpenAI.APIConnectionTimeoutError) throw new NemotronError("Nemotron request failed.", "timeout", elapsedMs);
    if (error instanceof OpenAI.APIError && Number.isInteger(error.status)) {
      throw new NemotronError(`Nemotron request failed (HTTP ${error.status}).`, "http_error", elapsedMs, error.status);
    }
    throw new NemotronError("Nemotron request failed.", "unknown", elapsedMs);
  }
  const elapsedMs = Date.now() - started;
  const choice = response.choices[0];
  if (!choice || choice.finish_reason !== "stop" || choice.message.refusal) {
    const category = choice?.message.refusal ? "refusal" : "incomplete_response";
    throw new NemotronError("Nemotron did not return a complete, accepted JSON response.", category, elapsedMs);
  }
  const content = choice.message.content?.trim();
  if (!content) throw new NemotronError("Nemotron returned no JSON content.", "incomplete_response", elapsedMs);
  return { content, elapsedMs };
}

export async function complete(messages: NemotronMessage[], opts: NemotronOptions = {}): Promise<string> {
  return (await requestCompletion(messages, opts)).content;
}

/** Transport JSON parsing is followed by the assessor's existing Zod schema. */
export async function completeJson<T>(messages: NemotronMessage[], opts: NemotronOptions = {}): Promise<T> {
  const { content, elapsedMs } = await requestCompletion(messages, opts);
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new NemotronError("Nemotron returned invalid JSON.", "invalid_json", elapsedMs);
  }
}
