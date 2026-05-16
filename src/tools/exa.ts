/**
 * ShipClaw — Exa External Evidence Tool
 * Codex-primary file (X-005). Claude provides interface + stub.
 *
 * Exa is DISABLED by default (EXA_ENABLED=false).
 * Max 3 searches per run (EXA_MAX_SEARCHES_PER_RUN).
 * Never send private code, secrets, or full file contents to Exa.
 */
import type { ExternalEvidence } from "../shared/types.js";
import { EXA_ENABLED, EXA_MAX_SEARCHES_PER_RUN } from "../shared/constants.js";

// ─── STUB ─────────────────────────────────────────────────────────────────────

export async function searchExternalEvidence(
  queries: string[],
  _runId: string
): Promise<ExternalEvidence[]> {
  if (!EXA_ENABLED) return [];
  if (queries.length === 0) return [];

  const safeQueries = queries.slice(0, EXA_MAX_SEARCHES_PER_RUN);

  // TODO(Codex X-005): implement real Exa search using EXA_API_KEY
  // Cache results in external_evidence_cache table
  // Never send: secrets, .env contents, full source files, private data
  return safeQueries.map((q, i) => ({
    source: "exa" as const,
    query: q,
    snippet: `[STUB] Exa result ${i + 1} for: ${q}`,
    url: `https://exa.ai/search?q=${encodeURIComponent(q)}`,
    relevanceScore: 0.8,
    fetchedAt: new Date().toISOString(),
  }));
}
