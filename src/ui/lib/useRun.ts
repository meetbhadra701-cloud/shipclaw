/**
 * useRun — owns the lifecycle of one analysis: start → stream → complete.
 *
 * Replay pacing: a fixture-backed run finishes in tens of milliseconds, far faster than a
 * person can follow. Received events are revealed one agent state at a time (REVEAL_MS per
 * state) so the workflow is legible. Nothing is invented: every revealed event is the real
 * event, the UI shows the real elapsed time, and pacing is disabled for reduced motion and
 * when reopening a past run.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentEvent, Approval, RunMode, RunStatus } from "../../shared/types.js";
import { deriveRun, type DerivedRun } from "./derive.js";

const REVEAL_MS = 170;

export interface Health {
  status: string;
  nemotron: "configured" | "fallback";
  model?: string;
  llmFallbackAllowed?: boolean;
  exa?: "enabled" | "disabled";
  evidenceSource?: "fixture" | "live";
}

export interface RunSummary {
  id: string;
  goal: string;
  repo: string;
  mode: RunMode;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  score: number | null;
  band: string | null;
  decision: string | null;
}

export interface MemoryItem { key: string; value: string; updatedAt: string }
export interface AuditEntry { actor: string; action: string; detail?: string; createdAt: string }

export type Phase = "idle" | "starting" | "running" | "complete" | "error";

export interface RunView {
  phase: Phase;
  runId: string | null;
  repo: string;
  goal: string;
  mode: RunMode | null;
  derived: DerivedRun;
  events: AgentEvent[];
  error: string | null;
  streamLost: boolean;
  replayed: boolean;
  report: string | null;
  artifacts: string[];
  memory: MemoryItem[];
  audit: AuditEntry[];
  approvalDecision: Approval | null;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export function useRun() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [repo, setRepo] = useState("");
  const [goal, setGoal] = useState("");
  const [mode, setMode] = useState<RunMode | null>(null);
  const [received, setReceived] = useState<AgentEvent[]>([]);
  const [visible, setVisible] = useState(0);
  const [streamEnded, setStreamEnded] = useState(false);
  const [streamLost, setStreamLost] = useState(false);
  const [paced, setPaced] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<string[]>([]);
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [approvalDecision, setApprovalDecision] = useState<Approval | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [history, setHistory] = useState<RunSummary[]>([]);

  const esRef = useRef<EventSource | null>(null);
  const fetchedFor = useRef<string | null>(null);

  const events = useMemo(() => received.slice(0, visible), [received, visible]);
  const derived = useMemo(() => deriveRun(events), [events]);

  // ── System facts + history ─────────────────────────────────────────────────
  const refreshHistory = useCallback(async () => {
    try {
      const data = await getJson<{ runs: RunSummary[] }>("/api/runs?limit=12");
      setHistory(data.runs);
    } catch { /* history is optional */ }
  }, []);

  useEffect(() => {
    getJson<Health>("/api/health").then(setHealth).catch(() => setHealth(null));
    void refreshHistory();
  }, [refreshHistory]);

  // ── Paced reveal: one agent state per tick ─────────────────────────────────
  useEffect(() => {
    if (visible >= received.length) return;
    const revealNext = () => {
      setVisible((v) => {
        let j = v + 1;
        while (j < received.length && received[j]?.type !== "state_entered") j++;
        return j;
      });
    };
    if (!paced) {
      setVisible(received.length);
      return;
    }
    const t = window.setTimeout(revealNext, visible === 0 ? 60 : REVEAL_MS);
    return () => window.clearTimeout(t);
  }, [received, visible, paced]);

  // ── Load post-run data once the final result is on screen ──────────────────
  const loadArtifacts = useCallback(async (id: string) => {
    const [runRes, reportRes, listRes, memRes, auditRes] = await Promise.allSettled([
      getJson<{ mode: RunMode; status: RunStatus; errorMessage?: string }>(`/api/runs/${id}`),
      getJson<{ markdown: string }>(`/api/reports/${id}/readiness`),
      getJson<{ artifacts: string[] }>(`/api/reports/${id}`),
      getJson<{ items: MemoryItem[] }>("/api/memory"),
      getJson<{ log: AuditEntry[] }>(`/api/audit/${id}`),
    ]);
    if (runRes.status === "fulfilled") setMode(runRes.value.mode);
    if (reportRes.status === "fulfilled") setReport(reportRes.value.markdown);
    if (listRes.status === "fulfilled") setArtifacts(listRes.value.artifacts);
    if (memRes.status === "fulfilled") setMemory(memRes.value.items);
    if (auditRes.status === "fulfilled") setAudit(auditRes.value.log);
  }, []);

  useEffect(() => {
    if (!runId || !derived.final || fetchedFor.current === runId) return;
    fetchedFor.current = runId;
    setPhase("complete");
    void loadArtifacts(runId);
    void refreshHistory();
  }, [runId, derived.final, loadArtifacts, refreshHistory]);

  // Stream ended without a final result → the run failed server-side.
  useEffect(() => {
    if (!runId || !streamEnded || derived.final || visible < received.length) return;
    getJson<{ status: RunStatus; errorMessage?: string }>(`/api/runs/${runId}`)
      .then((run) => {
        setError(run.errorMessage ?? "The agent stopped before producing a verdict.");
        setPhase("error");
      })
      .catch((err: unknown) => {
        setError(String(err));
        setPhase("error");
      });
  }, [runId, streamEnded, derived.final, visible, received.length]);

  // ── SSE ────────────────────────────────────────────────────────────────────
  const connect = useCallback((id: string) => {
    esRef.current?.close();
    setStreamLost(false);
    setStreamEnded(false);
    const es = new EventSource(`/api/runs/${id}/events`);
    esRef.current = es;
    let seen = 0;
    es.onmessage = (msg: MessageEvent<string>) => {
      const data = JSON.parse(msg.data) as AgentEvent | { type: "stream_end" };
      if (data.type === "stream_end") {
        es.close();
        setStreamEnded(true);
        return;
      }
      seen++;
      setReceived((prev) => (prev.length >= seen ? prev : [...prev, data as AgentEvent]));
    };
    es.onerror = () => {
      es.close();
      setStreamLost(true);
    };
  }, []);

  useEffect(() => () => esRef.current?.close(), []);

  const resetRunState = (id: string | null) => {
    esRef.current?.close();
    fetchedFor.current = null;
    setRunId(id);
    setReceived([]);
    setVisible(0);
    setStreamEnded(false);
    setStreamLost(false);
    setError(null);
    setReport(null);
    setArtifacts([]);
    setAudit([]);
    setApprovalDecision(null);
    setMode(null);
  };

  const start = useCallback(async (repoInput: string, goalInput: string) => {
    resetRunState(null);
    setRepo(repoInput);
    setGoal(goalInput);
    setPaced(!prefersReducedMotion());
    setPhase("starting");
    try {
      const { runId: id } = await getJson<{ runId: string }>("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Evidence collection is fixture-backed in every mode today, so the UI always
        // requests demo mode and says so, rather than offering a "live" mode that isn't live.
        body: JSON.stringify({ goal: goalInput, repo: repoInput, demo: true, autoApproveLocal: false }),
      });
      setRunId(id);
      setPhase("running");
      connect(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("idle");
    }
  }, [connect]);

  const open = useCallback((summary: RunSummary) => {
    resetRunState(summary.id);
    setRepo(summary.repo);
    setGoal(summary.goal);
    setPaced(false);
    setPhase("running");
    connect(summary.id);
  }, [connect]);

  const retryStream = useCallback(() => {
    if (runId) connect(runId);
  }, [runId, connect]);

  const reset = useCallback(() => {
    resetRunState(null);
    setPhase("idle");
    void refreshHistory();
  }, [refreshHistory]);

  const resolveApproval = useCallback(async (approval: Approval, action: "approve" | "reject") => {
    const res = await getJson<{ approval: Approval }>(`/api/approvals/${approval.id}/${action}`, { method: "POST" });
    setApprovalDecision(res.approval);
    try {
      const a = await getJson<{ log: AuditEntry[] }>(`/api/audit/${approval.runId}`);
      setAudit(a.log);
    } catch { /* non-critical */ }
    return res.approval;
  }, []);

  // A reopened run's approval may have been resolved after its events were written;
  // the audit trail is the source of truth for that.
  const approvalFromAudit = useMemo<Approval | null>(() => {
    const a = derived.approval;
    if (!a || a.status !== "pending") return null;
    const row = audit.find((r) => (r.action === "approval_approved" || r.action === "approval_rejected") && r.detail?.startsWith(`${a.id}:`));
    if (!row) return null;
    return { ...a, status: row.action === "approval_approved" ? "approved" : "rejected", resolvedAt: row.createdAt, resolvedBy: "human" };
  }, [derived.approval, audit]);

  const view: RunView = {
    phase,
    runId,
    repo,
    goal,
    mode,
    derived,
    events,
    error,
    streamLost: streamLost && !derived.final && !streamEnded,
    replayed: !paced,
    report,
    artifacts,
    memory,
    audit,
    approvalDecision: approvalDecision ?? approvalFromAudit,
  };

  return { view, health, history, start, open, reset, retryStream, resolveApproval };
}
