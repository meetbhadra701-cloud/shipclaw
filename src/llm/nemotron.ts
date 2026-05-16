/**
 * ShipClaw — Nemotron LLM client
 * Uses OpenAI-compatible SDK against NVIDIA's inference endpoint.
 * Model: mistralai/mistral-nemotron
 *
 * Shared file — Claude owns integration semantics, Codex owns tests.
 * Log any interface changes in COMMUNICATION_LOG.md.
 */
import OpenAI from "openai";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env["NEMOTRON_API_KEY"];
  const baseURL =
    process.env["NEMOTRON_BASE_URL"] ?? "https://integrate.api.nvidia.com/v1";
  if (!apiKey) throw new Error("NEMOTRON_API_KEY is not set");
  _client = new OpenAI({ apiKey, baseURL });
  return _client;
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

const DEFAULT_MODEL =
  process.env["NEMOTRON_MODEL"] ?? "mistralai/mistral-nemotron";

/**
 * Call Nemotron and return the full text response (non-streaming).
 * Throws on API error so callers can fall back to fallback assessor.
 */
export async function complete(
  messages: NemotronMessage[],
  opts: NemotronOptions = {}
): Promise<string> {
  const client = getClient();
  const {
    temperature = 0.3,
    topP = 0.7,
    maxTokens = 2048,
    model = DEFAULT_MODEL,
  } = opts;

  // Collect streaming chunks
  const stream = await client.chat.completions.create({
    model,
    messages,
    temperature,
    top_p: topP,
    max_tokens: maxTokens,
    stream: true,
  });

  let text = "";
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) text += delta;
  }
  return text.trim();
}

/**
 * Convenience: call Nemotron and parse the response as JSON.
 * Strips markdown code fences if present.
 */
export async function completeJson<T>(
  messages: NemotronMessage[],
  opts: NemotronOptions = {}
): Promise<T> {
  const raw = await complete(messages, opts);
  // Strip optional ```json … ``` wrapper
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as T;
}
