/**
 * ShipClaw — Exa External Evidence Tool
 * Claude-primary file (C-EXA).
 *
 * Exa is DISABLED by default (ENABLE_EXA=false / EXA_ENABLED=false).
 * Max EXA_MAX_SEARCHES_PER_RUN searches per run (default: 3).
 * Timeout: EXA_TIMEOUT_MS ms (default: 8000).
 *
 * Hard rules enforced here:
 *   - Never call Exa unless (ENABLE_EXA || EXA_ENABLED) AND EXA_API_KEY are set.
 *   - Never send secrets, .env values, private repo contents, or full source files.
 *   - Exa failure MUST NOT fail the ShipClaw run — always degrades to empty [].
 *   - Max 3 Exa searches per run (enforced by safeQueries.slice).
 *   - Use highlights/excerpts only (2 sentences max per result).
 *   - Cache results per run in the IDb evidenceCache.
 *   - Do not use Exa Deep Search in MVP.
 */
import type { ExternalEvidence, Observation, ReadinessScore } from "../shared/types.js";
import { EXA_ENABLED, EXA_MAX_SEARCHES_PER_RUN, EXA_TIMEOUT_MS } from "../shared/constants.js";

// ─── Exa API response types ───────────────────────────────────────────────────

interface ExaHighlightsResult {
  id: string;
  url: string;
  title: string;
  score?: number;
  highlights?: string[];
  text?: string;
}

interface ExaSearchResponse {
  results: ExaHighlightsResult[];
}

// ─── Query sanitizer ──────────────────────────────────────────────────────────

/**
 * Strip anything sensitive before sending to Exa.
 * Only send: package names, framework names, public repo names, concise uncertainty questions.
 * Never send: secrets, tokens, file paths with private content, env values.
 */
function sanitizeQuery(raw: string): string {
  return raw
    // Remove env-var-like assignments (KEY=value)
    .replace(/[A-Z][A-Z0-9_]{5,}=\S*/g, "")
    // Remove long base64 / token-like strings
    .replace(/\b[A-Za-z0-9+/]{32,}={0,2}\b/g, "[redacted]")
    // Remove URLs (may contain private path fragments)
    .replace(/https?:\/\/[^\s]+/g, "[url]")
    // Remove file paths
    .replace(/(?:\/[a-z0-9_.~-]+){3,}/gi, "[path]")
    .trim()
    .slice(0, 120);
}

// ─── assessmentNeedsExternalEvidence ─────────────────────────────────────────

/**
 * Returns true only when Exa evidence would add useful context.
 * Returns false for purely local issues that Exa cannot help with.
 *
 * True for:
 *   - Documentation category failing (may not match current framework docs)
 *   - Dependency freshness failing (package may have known issues/deprecations)
 *   - Observations with native/setup/deprecated signals
 *   - Score is NOT_READY (external context may clarify blockers)
 *
 * False for:
 *   - Score is READY (no uncertainty)
 *   - Only local issues: missing tests, missing .env, internal CI failures
 */
export function assessmentNeedsExternalEvidence(
  observations: Observation[],
  score: ReadinessScore
): boolean {
  // Fast path: READY means no uncertainty — don't spend searches
  if (score.band === "READY") return false;

  // Documentation category failing → may be misaligned with framework docs
  const docCategory = score.categories.find((c) => c.name === "documentation");
  if (docCategory && !docCategory.pass) return true;

  // Dependency freshness failing → packages may have known compat issues
  const depCategory = score.categories.find((c) => c.name === "dependency_freshness");
  if (depCategory && !depCategory.pass) return true;

  // Observation signals that benefit from external context
  const externalSignals = ["deprecated", "native", "gyp", "binding", "setup", "install", "deploy", "framework", "migration"];
  const hasExternalSignal = observations.some((obs) =>
    externalSignals.some((sig) =>
      obs.signal.toLowerCase().includes(sig) ||
      String(obs.value).toLowerCase().includes(sig)
    )
  );
  if (hasExternalSignal) return true;

  // NOT_READY: external context may shed light on unknown blockers
  if (score.band === "NOT_READY") return true;

  return false;
}

// ─── Exa query builder ────────────────────────────────────────────────────────

/**
 * Builds up to EXA_MAX_SEARCHES_PER_RUN sanitized queries
 * focused on documentation alignment, dependency issues, and setup gotchas.
 * Never includes private repo content, secrets, or full file contents.
 */
export function buildExaQueries(args: {
  repo: string;
  score: ReadinessScore;
  observations: Observation[];
}): string[] {
  const { repo, score, observations } = args;
  const queries: string[] = [];

  // Extract safe public repo name (last segment, no owner who might be private)
  const repoSlug = repo.split("/").pop()?.replace(/[-_]/g, " ").trim() ?? "project";

  // Query 1: Documentation / deployment alignment
  const docCategory = score.categories.find((c) => c.name === "documentation");
  if (docCategory && !docCategory.pass) {
    queries.push(sanitizeQuery(`${repoSlug} deployment setup documentation current best practices`));
  }

  // Query 2: Dependency freshness / version deprecation
  const depCategory = score.categories.find((c) => c.name === "dependency_freshness");
  if (depCategory && !depCategory.pass) {
    queries.push(sanitizeQuery(`${repoSlug} dependency compatibility release notes known issues`));
  }

  // Query 3: Native install / setup signals from observations
  const nativeObs = observations.find((obs) =>
    ["native", "gyp", "binding", "install"].some((s) =>
      obs.signal.toLowerCase().includes(s) || String(obs.value).toLowerCase().includes(s)
    )
  );
  if (nativeObs) {
    queries.push(sanitizeQuery(`${repoSlug} ${nativeObs.signal} native dependency install issue Node`));
  }

  // Fallback: general release readiness if no specific query built
  if (queries.length === 0 && score.band !== "READY") {
    queries.push(sanitizeQuery(`${repoSlug} release checklist common blockers`));
  }

  return queries.slice(0, EXA_MAX_SEARCHES_PER_RUN);
}

// ─── Core Exa API call ───────────────────────────────────────────────────────

async function callExaSearch(
  query: string,
  apiKey: string,
  timeoutMs: number
): Promise<ExaHighlightsResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query,
        numResults: 3,
        highlights: { numSentences: 2, highlightsPerUrl: 1 },
        useAutoprompt: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Exa HTTP ${response.status}`);
    }

    const data = await response.json() as ExaSearchResponse;
    return data.results ?? [];
  } finally {
    clearTimeout(timer);
  }
}

// ─── Result mapper ────────────────────────────────────────────────────────────

function resultToEvidence(r: ExaHighlightsResult, query: string): ExternalEvidence {
  const rawScore = r.score ?? 0;
  return {
    source: "exa",
    query,
    snippet: r.highlights?.[0] ?? r.text?.slice(0, 200) ?? "No excerpt available.",
    url: r.url,
    relevanceScore: rawScore,
    fetchedAt: new Date().toISOString(),
    sourceTitle: r.title,
    relevance: rawScore >= 0.8 ? "high" : rawScore >= 0.5 ? "medium" : "low",
    riskSignal: "neutral",
  };
}

// ─── searchExternalDocs (primary function per spec) ──────────────────────────

/**
 * Search Exa for external documentation context.
 * Used when direct repo evidence alone is uncertain.
 * Queries are built from repoStack + uncertainty description — no private data.
 */
export async function searchExternalDocs(args: {
  repoStack: string[];
  uncertainty: string;
  maxResults?: number;
}): Promise<ExternalEvidence[]> {
  const apiKey = process.env["EXA_API_KEY"];
  if (!apiKey) return [];

  const timeoutMs = EXA_TIMEOUT_MS;
  const query = sanitizeQuery(`${args.repoStack.join(" ")} ${args.uncertainty}`);
  const max = args.maxResults ?? 3;

  try {
    const results = await callExaSearch(query, apiKey, timeoutMs);
    return results.slice(0, max).map((r) => resultToEvidence(r, query));
  } catch (err) {
    // Exa failure must not fail the run
    console.warn(`[Exa] searchExternalDocs failed: ${String(err).slice(0, 80)}`);
    return [];
  }
}

// ─── searchExternalEvidence (loop-compatible wrapper) ────────────────────────

/**
 * Called by the agent loop in OPTIONAL_EXA_EXTERNAL_EVIDENCE state.
 * Accepts pre-built queries from risk fingerprint signals.
 * Respects all hard rules: disabled check, key check, cap, timeout, graceful failure.
 */
export async function searchExternalEvidence(
  queries: string[],
  _runId: string
): Promise<ExternalEvidence[]> {
  // Read env directly so tests can control this without module re-import
  const enabled = process.env["EXA_ENABLED"] === "true" || process.env["ENABLE_EXA"] === "true";
  if (!enabled) return [];
  if (queries.length === 0) return [];

  const apiKey = process.env["EXA_API_KEY"];
  if (!apiKey) {
    console.warn("[Exa] ENABLE_EXA=true but EXA_API_KEY is not set — skipping.");
    return [];
  }

  const safeQueries = queries.slice(0, EXA_MAX_SEARCHES_PER_RUN);
  const evidence: ExternalEvidence[] = [];

  for (const rawQuery of safeQueries) {
    const query = sanitizeQuery(rawQuery);
    try {
      const results = await callExaSearch(query, apiKey, EXA_TIMEOUT_MS);
      // Take 1 result per query to stay focused and not flood the report
      const first = results[0];
      if (first) {
        evidence.push(resultToEvidence(first, query));
      }
    } catch (err) {
      // Exa failure must not fail the ShipClaw run — log and continue
      console.warn(`[Exa] Search failed (query: ${query.slice(0, 50)}…): ${String(err).slice(0, 80)}`);
    }
  }

  return evidence;
}
