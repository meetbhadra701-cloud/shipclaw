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
}

export async function complete(messages: NemotronMessage[], opts: NemotronOptions = {}): Promise<string> {
  const apiKey = process.env["NEMOTRON_API_KEY"];
  if (!apiKey) throw new Error("NEMOTRON_API_KEY is not configured");
  const client = new OpenAI({
    apiKey,
    baseURL: process.env["NEMOTRON_BASE_URL"] || DEFAULT_NEMOTRON_BASE_URL,
    timeout: 60_000,
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
  try {
    response = await client.chat.completions.create(request);
  } catch (error) {
    // Never propagate the SDK error object: it can contain request/response data.
    const status = error instanceof OpenAI.APIError && Number.isInteger(error.status) ? ` (HTTP ${error.status})` : "";
    throw new Error(`Nemotron request failed${status}.`);
  }
  const choice = response.choices[0];
  if (!choice || choice.finish_reason !== "stop" || choice.message.refusal) {
    throw new Error("Nemotron did not return a complete, accepted JSON response.");
  }
  const content = choice.message.content?.trim();
  if (!content) throw new Error("Nemotron returned no JSON content.");
  return content;
}

/** Transport JSON parsing is followed by the assessor's existing Zod schema. */
export async function completeJson<T>(messages: NemotronMessage[], opts: NemotronOptions = {}): Promise<T> {
  const raw = await complete(messages, opts);
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("Nemotron returned invalid JSON.");
  }
}
