/**
 * ShipClaw — React Dashboard
 * Claude-primary file. Accessibility-first. WCAG AA compliant.
 * Reviewed by accessibility-agents:accessibility-lead (Phase 0 + Phase 1).
 *
 * Layout:
 *  Hero — brand + system status + metrics (full-width)
 *  Sidebar — goal form, plan, score, decision
 *  Main    — timeline, fingerprint, time-to-ship, findings,
 *             approval, report preview, memory, audit, exa
 *  Footer  — technical proof claims
 *
 * UI redesign: emoji-free, SC monogram, ThemeToggle, GlassHeroBackground,
 * HexagonLoadingOverlay, light/dark mode, semantic status classes.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  AgentEvent,
  ReadinessScore,
  RiskFingerprint,
  TimeToShipEstimate,
  AssessorOutput,
  Approval,
  PublicPlan,
} from "../shared/types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RunState {
  runId: string | null;
  status: string;
  events: AgentEvent[];
  score: ReadinessScore | null;
  riskFingerprint: RiskFingerprint | null;
  timeToShip: TimeToShipEstimate | null;
  assessorOutput: AssessorOutput | null;
  approval: Approval | null;
  plan: PublicPlan | null;
  finalDecision: string | null;
  mode: string;
  reportMarkdown: string | null;
  memory: Array<{ key: string; value: string; updatedAt: string }>;
  auditLog: Array<{ actor: string; action: string; detail?: string; createdAt: string }>;
  externalEvidence: Array<{
    source: string;
    query: string;
    snippet: string;
    relevanceScore: number;
    url?: string;
    sourceTitle?: string;
    relevance?: "high" | "medium" | "low";
    riskSignal?: "supports-readiness" | "warns-against-readiness" | "neutral";
  }>;
  exaStatus: "skipped" | "live" | "failed" | null;
  exaCount: number;
}

const initialState: RunState = {
  runId: null,
  status: "idle",
  events: [],
  score: null,
  riskFingerprint: null,
  timeToShip: null,
  assessorOutput: null,
  approval: null,
  plan: null,
  finalDecision: null,
  mode: "live",
  reportMarkdown: null,
  memory: [],
  auditLog: [],
  externalEvidence: [],
  exaStatus: null,
  exaCount: 0,
};

// ── Markdown component overrides ──────────────────────────────────────────────

const markdownComponents = {
  // Remap h1→h3, h2→h4, h3→h5 inside report preview to avoid H1 conflict.
  // Page H1 = hero. Panel headings = H2. Report preview content = H3+.
  h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h3 {...props}>{children}</h3>,
  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h4 {...props}>{children}</h4>,
  h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h5 {...props}>{children}</h5>,
  th: ({ children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th scope="col" {...props}>{children}</th>
  ),
};

// ── Score helpers ─────────────────────────────────────────────────────────────

function scoreBandClass(band: string): string {
  if (band === "READY") return "ready";
  if (band === "RISKY") return "risky";
  return "not-ready";
}

// ── System status pill ────────────────────────────────────────────────────────

interface StatusPillProps {
  label: string;
  value: string;
  dotVariant: "live" | "fallback" | "skipped" | "fixture" | "persistent" | "required" | "unknown";
}

function StatusPill({ label, value, dotVariant }: StatusPillProps) {
  return (
    <div className="system-status-item">
      {/* Dot is purely decorative — label + value text conveys state (WCAG 1.4.1) */}
      <span
        className={`system-status-item__dot system-status-item__dot--${dotVariant}`}
        aria-hidden="true"
      />
      <span className="system-status-item__label">{label}</span>
      <span className="system-status-item__value">{value}</span>
    </div>
  );
}

// ── Hero metrics item ─────────────────────────────────────────────────────────

interface HeroMetricProps {
  label: string;
  value: string;
  valueClass?: string;
}

function HeroMetric({ label, value, valueClass }: HeroMetricProps) {
  return (
    <div className="hero-metric">
      <span className="hero-metric__label">{label}</span>
      <span className={`hero-metric__value${valueClass ? ` ${valueClass}` : ""}`}>{value}</span>
    </div>
  );
}

// ── SC monogram logo ──────────────────────────────────────────────────────────
// Replaces 🚢 emoji. aria-hidden because H1 "ShipClaw" provides the brand label.

function SCMonogram() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="hero-monogram"
    >
      <rect width="36" height="36" rx="8" fill="var(--accent)" />
      <text
        x="18"
        y="24"
        textAnchor="middle"
        fill="white"
        fontSize="14"
        fontWeight="700"
        fontFamily="system-ui, -apple-system, sans-serif"
        letterSpacing="-0.3"
      >
        SC
      </text>
    </svg>
  );
}

// ── App component ─────────────────────────────────────────────────────────────

export default function App() {
  const [runState, setRunState] = useState<RunState>(initialState);
  const [goal, setGoal] = useState("");
  const [repo, setRepo] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const eventSourceRef = useRef<EventSource | null>(null);
  const timelineRef = useRef<HTMLUListElement | null>(null);
  const approvalRef = useRef<HTMLDivElement | null>(null);
  const liveRegionRef = useRef<HTMLDivElement | null>(null);
  const runBtnRef = useRef<HTMLButtonElement | null>(null);

  // ── Live announcement helper (screen reader) ───────────────────────────────

  const announce = useCallback((msg: string) => {
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = "";
      setTimeout(() => {
        if (liveRegionRef.current) liveRegionRef.current.textContent = msg;
      }, 50);
    }
  }, []);

  // ── Auto-scroll timeline ───────────────────────────────────────────────────

  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [runState.events]);

  // ── Focus approval panel when it arrives ──────────────────────────────────

  useEffect(() => {
    if (runState.approval && approvalRef.current) {
      approvalRef.current.focus();
      announce("Approval required. An action needs your review.");
    }
  }, [runState.approval, announce]);

  // ── Fetch post-run data ────────────────────────────────────────────────────

  const fetchPostRunData = useCallback(async (runId: string, mode: string) => {
    try {
      const [memRes, auditRes, reportRes] = await Promise.all([
        fetch("/api/memory"),
        fetch(`/api/audit/${runId}`),
        fetch(`/api/reports/${runId}/readiness`),
      ]);
      const memData = await memRes.json() as { items: Array<{ key: string; value: string; updatedAt: string }> };
      const auditData = await auditRes.json() as { log: Array<{ actor: string; action: string; detail?: string; createdAt: string }> };

      setRunState((prev) => ({
        ...prev,
        memory: memData.items ?? [],
        auditLog: auditData.log ?? [],
        mode,
      }));

      if (reportRes.ok) {
        const reportData = await reportRes.json() as { markdown: string };
        setRunState((prev) => ({ ...prev, reportMarkdown: reportData.markdown }));
      }
    } catch {
      // Non-critical; run already complete
    }
  }, []);

  // ── SSE event processing ───────────────────────────────────────────────────

  const connectSSE = useCallback((runId: string) => {
    if (eventSourceRef.current) eventSourceRef.current.close();

    const es = new EventSource(`/api/runs/${runId}/events`);
    eventSourceRef.current = es;

    es.onmessage = (e: MessageEvent) => {
      const event = JSON.parse(e.data as string) as AgentEvent & { type: string };

      if ((event as { type: string }).type === "stream_end") {
        es.close();
        return;
      }

      setRunState((prev) => {
        const next = { ...prev, events: [...prev.events, event as AgentEvent] };

        switch (event.type) {
          case "plan_created":
            next.plan = event.plan;
            announce("Plan created. Starting analysis.");
            break;
          case "readiness_score_calculated":
            next.score = event.score;
            announce(`Readiness score: ${event.score.total} out of 100. Band: ${event.score.band}.`);
            break;
          case "risk_fingerprint_created":
            next.riskFingerprint = event.fingerprint;
            break;
          case "time_to_ship_estimated":
            next.timeToShip = event.estimate;
            break;
          case "external_evidence_status": {
            const exaStatus: RunState["exaStatus"] =
              !event.enabled ? "skipped"
              : event.count > 0 ? "live"
              : "skipped";
            next.exaStatus = exaStatus;
            next.exaCount = event.count;
            announce(
              exaStatus === "live"
                ? `External evidence: ${event.count} result${event.count === 1 ? "" : "s"} from Exa.`
                : "External evidence: Exa search skipped."
            );
            break;
          }
          case "approval_requested":
            next.approval = event.approval;
            next.status = "awaiting_approval";
            break;
          case "approval_resolved":
            next.approval = event.approval.status === "rejected" ? event.approval : null;
            break;
          case "final_result":
            next.finalDecision = event.decision;
            next.assessorOutput = event.assessorOutput;
            next.status = "complete";
            announce(`Run complete. Decision: ${event.decision.toUpperCase()}. Score: ${event.score.total} out of 100.`);
            setTimeout(() => fetchPostRunData(runId, prev.mode), 800);
            break;
        }

        return next;
      });
    };

    es.onerror = () => {
      es.close();
      setRunState((prev) => ({
        ...prev,
        status: prev.status === "complete" ? "complete" : "error",
      }));
    };
  }, [announce, fetchPostRunData]);

  // ── Start run ─────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim() || !repo.trim()) return;

    setError(null);
    setCopyState("idle");
    setRunState({
      ...initialState,
      status: "starting",
      mode: demoMode ? "demo" : "live",
    });

    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, repo, demo: demoMode, autoApproveLocal: false }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json() as { runId: string };
      setRunState((prev) => ({ ...prev, runId: data.runId, status: "running" }));
      announce("Run started. Agent is analyzing the repository.");
      connectSSE(data.runId);
    } catch (err) {
      setError(String(err));
      setRunState((prev) => ({ ...prev, status: "error" }));
    }
  };

  // ── Approval actions ──────────────────────────────────────────────────────

  const handleApproval = async (action: "approve" | "reject") => {
    if (!runState.approval) return;
    setApproving(true);
    try {
      await fetch(`/api/approvals/${runState.approval.id}/${action}`, { method: "POST" });
      setRunState((prev) => ({ ...prev, approval: null }));
      announce(`Action ${action === "approve" ? "approved" : "rejected"}.`);
    } catch {
      setError("Failed to submit approval decision.");
    } finally {
      setApproving(false);
    }
  };

  // ── Copy report to clipboard ──────────────────────────────────────────────

  const handleCopyReport = async () => {
    if (!runState.reportMarkdown) return;
    try {
      await navigator.clipboard.writeText(runState.reportMarkdown);
      setCopyState("copied");
      announce("Report copied to clipboard.");
      setTimeout(() => setCopyState("idle"), 2500);
    } catch {
      setCopyState("failed");
      announce("Copy failed. Please select and copy the report text manually.");
      setTimeout(() => setCopyState("idle"), 3000);
    }
  };

  // ── Event label helpers ────────────────────────────────────────────────────

  function eventLabel(event: AgentEvent): string {
    switch (event.type) {
      case "goal_received": return `Goal received: ${event.goal.slice(0, 60)}`;
      case "memory_loaded": return `Memory loaded (${event.itemCount} items)`;
      case "plan_created": return `Plan created (${event.plan.steps.length} steps)`;
      case "tool_call_started": return `→ ${event.tool}`;
      case "tool_call_finished": return `← ${event.tool} ${event.success ? "✓" : "✗"} (${event.durationMs}ms)`;
      case "readiness_score_calculated": return `Score: ${event.score.total}/100 (${event.score.band})`;
      case "risk_fingerprint_created": return `Risk fingerprint: ${event.fingerprint.items.length} signals`;
      case "time_to_ship_estimated": return `Time-to-ship: ${event.estimate.minMinutes}–${event.estimate.maxMinutes} min`;
      case "external_evidence_status": return `Exa ${event.enabled ? `enabled (${event.count} results)` : "disabled"}`;
      case "approval_requested": return `Approval needed: ${event.approval.actionDescription.slice(0, 60)}`;
      case "approval_resolved": return `Approval ${event.approval.status} by ${event.approval.resolvedBy}`;
      case "memory_updated": return `Memory updated (${event.changes.length} changes)`;
      case "final_result": return `Final decision: ${event.decision.toUpperCase()} (${event.score.total}/100)`;
      default: return (event as { type: string }).type;
    }
  }

  function eventStatus(event: AgentEvent): "success" | "error" | "info" {
    if (event.type === "tool_call_finished") return event.success ? "success" : "error";
    if (event.type === "final_result") return event.decision === "ship" ? "success" : "error";
    return "info";
  }

  function eventIcon(event: AgentEvent): string {
    const s = eventStatus(event);
    if (s === "success") return "✓";
    if (s === "error") return "✗";
    return "·";
  }

  // ── Derived state helpers ─────────────────────────────────────────────────

  const isRunning = runState.status === "running" || runState.status === "starting" || runState.status === "awaiting_approval";
  const isComplete = runState.status === "complete";

  // System status values
  const nemotronStatus = runState.assessorOutput?.mode === "fallback" ? "fallback"
    : isComplete ? "live" : "unknown";
  const nemotronLabel = nemotronStatus === "live" ? "Online — mistral-nemotron"
    : nemotronStatus === "fallback" ? "Fallback — deterministic"
    : "Not yet called";
  const exaDot: StatusPillProps["dotVariant"] = runState.exaStatus === "live" ? "live"
    : runState.exaStatus === "failed" ? "fallback"
    : "skipped";
  const exaLabel = runState.exaStatus === "live" ? `Online — ${runState.exaCount} results`
    : runState.exaStatus === "failed" ? "Failed — degraded gracefully"
    : "Skipped — disabled";
  const dataLabel = demoMode ? "Fixture data (demo)" : "Live GitHub + shell";
  const dataDot: StatusPillProps["dotVariant"] = demoMode ? "fixture" : "live";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Screen reader live region — must be first, always present */}
      <div
        ref={liveRegionRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="visually-hidden"
      />

      {/* Mode banners */}
      {runState.mode === "fallback" && (
        <div className="mode-banner mode-banner--fallback" role="note" aria-label="Fallback mode active">
          FALLBACK MODE · Nemotron unavailable. Scoring remains deterministic.
          Demo mode uses fixture data. Scoring, memory, approval gate, and report generation are real.
        </div>
      )}
      {runState.mode === "demo" && (
        <div className="mode-banner mode-banner--demo" role="note" aria-label="Demo mode active">
          DEMO MODE · Fixture repo data in use.{" "}
          <strong>Scoring, memory, Nemotron reasoning, approval gate, and report generation are real.</strong>
        </div>
      )}

      {/* ── Hero Section ──────────────────────────────────────────────────── */}
      <header className="hero-section">
        {/* Optional hero video background — CSS fallback gradient used when file absent */}
        <video
          className="hero-video-bg"
          src="/assets/hero-loop.mp4"
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
          onError={(e) => { (e.currentTarget as HTMLVideoElement).style.display = "none"; }}
        />
        <div className="hero-inner">

          {/* Brand row */}
          <div className="hero-brand">
            <SCMonogram />
            <div className="hero-brand-text">
              {/* Single H1 for the page — replaces old app-header h1 */}
              <h1 className="hero-title">
                Ship<span className="hero-title-accent">Claw</span>
              </h1>
              <p className="hero-subtitle">Autonomous Release Readiness Agent</p>
            </div>

            {/* Capability badges — ul/li list (accessibility-lead: not headings) */}
            <ul
              className="hero-badges"
              aria-label="System capabilities"
              style={{ listStyle: "none" }}
            >
              {[
                "Deterministic Score",
                "Persistent Memory",
                "Nemotron Reasoning",
                "Approval-Gated",
                "Audit Logged",
                "Exa Optional",
              ].map((cap) => (
                <li key={cap}>
                  <span className="capability-badge">{cap}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* System status row — text labels + dots (accessibility-lead: color not alone) */}
          <div className="system-status" role="list" aria-label="System status">
            <div role="listitem">
              <StatusPill label="Nemotron" value={nemotronLabel} dotVariant={nemotronStatus === "live" ? "live" : nemotronStatus === "fallback" ? "fallback" : "unknown"} />
            </div>
            <div role="listitem">
              <StatusPill label="Exa" value={exaLabel} dotVariant={exaDot} />
            </div>
            <div role="listitem">
              <StatusPill label="Data" value={dataLabel} dotVariant={dataDot} />
            </div>
            <div role="listitem">
              <StatusPill label="Memory" value="Persistent SQLite" dotVariant="persistent" />
            </div>
            <div role="listitem">
              <StatusPill label="Approval" value="Required for writes" dotVariant="required" />
            </div>
          </div>

          {/* Hero metrics — only shown after a run */}
          {runState.score && (
            <div className="hero-metrics" aria-label="Current run results">
              <HeroMetric
                label="Score"
                value={`${runState.score.total}/100`}
                valueClass={`hero-metric__value--${scoreBandClass(runState.score.band)}`}
              />
              <HeroMetric
                label="Band"
                value={runState.score.band}
                valueClass={`hero-metric__value--${scoreBandClass(runState.score.band)}`}
              />
              {runState.finalDecision && (
                <HeroMetric
                  label="Decision"
                  value={runState.finalDecision.toUpperCase()}
                  valueClass={`hero-metric__value--${runState.finalDecision}`}
                />
              )}
              {runState.timeToShip && (
                <HeroMetric
                  label="Time-to-Ship"
                  value={`${runState.timeToShip.minMinutes}–${runState.timeToShip.maxMinutes} min`}
                />
              )}
              {runState.assessorOutput?.confidence != null && (
                <HeroMetric
                  label="Confidence"
                  value={`${Math.round(runState.assessorOutput.confidence * 100)}%`}
                />
              )}
            </div>
          )}

        </div>
      </header>

      {/* ── Main Layout ───────────────────────────────────────────────────── */}
      <div className="app-layout">

        {/* ── Sidebar ───────────────────────────────────────────────────── */}
        <aside className="app-sidebar" aria-label="Run configuration and score">

          {/* Panel 1: Goal form */}
          <section className="panel" aria-labelledby="panel-goal-heading">
            <h2 id="panel-goal-heading">Goal</h2>
            <form onSubmit={handleSubmit} className="goal-form" noValidate>
              <div className="form-field">
                <label className="form-label" htmlFor="repo-input">
                  Repository URL
                </label>
                <input
                  id="repo-input"
                  type="url"
                  className="form-input"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  required
                  aria-required="true"
                  aria-describedby="repo-hint"
                  disabled={isRunning}
                  autoComplete="url"
                />
                <span id="repo-hint" className="form-hint">
                  GitHub repository URL or local path
                </span>
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="goal-input">
                  Release goal
                </label>
                <textarea
                  id="goal-input"
                  className="form-textarea"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="Check if this repo is ready to ship v1.0"
                  required
                  aria-required="true"
                  rows={3}
                  disabled={isRunning}
                />
              </div>

              <div className="form-field flex items-center gap-2">
                <input
                  id="demo-mode-toggle"
                  type="checkbox"
                  checked={demoMode}
                  onChange={(e) => setDemoMode(e.target.checked)}
                  disabled={isRunning}
                  style={{ width: "18px", height: "18px", cursor: "pointer" }}
                />
                <label htmlFor="demo-mode-toggle" className="form-label" style={{ cursor: "pointer", textTransform: "none", letterSpacing: "normal", fontSize: "0.875rem" }}>
                  Demo mode (fixture data, no API calls)
                </label>
              </div>

              {error && (
                <p role="alert" aria-live="assertive" style={{ color: "var(--color-not-ready)", fontSize: "0.875rem" }}>
                  Error: {error}
                </p>
              )}

              <button
                ref={runBtnRef}
                type="submit"
                className="btn btn--primary w-full"
                disabled={isRunning || !goal.trim() || !repo.trim()}
                aria-busy={isRunning}
              >
                {isRunning ? (
                  <>
                    <span className="loading-spinner" aria-hidden="true" />
                    Analyzing…
                  </>
                ) : (
                  "Run Analysis"
                )}
              </button>
            </form>
          </section>

          {/* Panel 2: Plan */}
          {runState.plan && (
            <section className="panel" aria-labelledby="panel-plan-heading">
              <h2 id="panel-plan-heading">Plan</h2>
              <p className="text-sm text-muted" style={{ marginBottom: "var(--space-2)" }}>
                {runState.plan.constraints.join(" · ")}
              </p>
              <ol
                aria-label="Analysis steps"
                style={{ paddingLeft: "var(--space-5)", fontSize: "0.8125rem", color: "var(--color-text-muted)" }}
              >
                {runState.plan.steps.map((step, i) => (
                  <li key={i} style={{ marginBottom: "3px" }}>{step}</li>
                ))}
              </ol>
            </section>
          )}

          {/* Panel 4: Readiness Score */}
          {runState.score && (
            <section
              className="panel"
              aria-labelledby="panel-score-heading"
              aria-live="polite"
              aria-atomic="true"
            >
              <h2 id="panel-score-heading">Readiness Score</h2>
              <div
                className="score-display"
                role="img"
                aria-label={`Readiness score: ${runState.score.total} out of 100. Band: ${runState.score.band}.`}
              >
                <div
                  className={`score-number score-number--${scoreBandClass(runState.score.band)}`}
                  aria-hidden="true"
                >
                  {runState.score.total}
                  <small style={{ fontSize: "1.25rem", fontWeight: 400, color: "var(--color-text-muted)" }}>/100</small>
                </div>
                <div>
                  <span className={`score-band score-band--${runState.score.band}`}>
                    {runState.score.band}
                  </span>
                </div>
                <p className="text-xs text-muted" style={{ marginTop: "var(--space-2)" }}>
                  Computed deterministically before Nemotron
                </p>
              </div>
              <div className="score-bar-wrapper">
                <div
                  className="score-bar-track"
                  role="progressbar"
                  aria-valuenow={runState.score.total}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Score: ${runState.score.total}/100`}
                >
                  <div
                    className={`score-bar-fill score-bar-fill--${scoreBandClass(runState.score.band)}`}
                    style={{ width: `${runState.score.total}%` }}
                  />
                </div>
                <div className="score-bar-labels" aria-hidden="true">
                  <span>0</span>
                  <span>NOT_READY</span>
                  <span>40</span>
                  <span>RISKY</span>
                  <span>71</span>
                  <span>READY</span>
                  <span>100</span>
                </div>
              </div>
            </section>
          )}

          {/* Panel 10: Final Decision */}
          {runState.finalDecision && (
            <section className="panel" aria-labelledby="panel-decision-heading">
              <h2 id="panel-decision-heading">Decision</h2>
              <div className={`decision-badge decision-badge--${runState.finalDecision}`}>
                {runState.finalDecision.toUpperCase()}
              </div>
              {runState.assessorOutput?.explanation && (
                <p className="text-sm mt-2" style={{ color: "var(--color-text-muted)" }}>
                  {runState.assessorOutput.explanation}
                </p>
              )}
              {runState.assessorOutput?.mode === "fallback" && (
                <p className="text-xs mt-2 status-fallback-note">
                  Assessment generated from deterministic score — Nemotron unavailable.
                </p>
              )}
            </section>
          )}

        </aside>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <main id="main-content" className="app-main" tabIndex={-1} aria-label="Analysis results">

          {/* Idle proof label — shown before first run */}
          {runState.status === "idle" && (
            <>
              <div className="empty-state">
                <p style={{ fontSize: "1.125rem", marginBottom: "var(--space-3)", color: "var(--color-text)" }}>
                  Enter a repository URL and goal to start an analysis.
                </p>
                <p className="text-sm text-muted">
                  ShipClaw assesses release readiness deterministically and produces a polished report.
                </p>
              </div>
              <div className="proof-bar" role="note">
                <strong>What is real in demo mode:</strong>{" "}
                Deterministic scoring (scorer.ts) · Persistent memory (SQLite) ·
                Nemotron reasoning (mistralai/mistral-nemotron) · Approval gate ·
                Audit log · Report generation — <strong>all real.</strong>{" "}
                Only the GitHub/shell tool data is fixture data.
              </div>
            </>
          )}

          {/* Panel 3: Agent Timeline */}
          {runState.events.length > 0 && (
            <section className="panel" aria-labelledby="panel-timeline-heading">
              <h2 id="panel-timeline-heading">Agent Timeline</h2>
              <ul
                ref={timelineRef}
                className="timeline"
                role="log"
                aria-label="Agent event log"
                aria-live="polite"
                aria-relevant="additions"
              >
                {runState.events.map((event, i) => (
                  <li
                    key={i}
                    className={`timeline-item timeline-item--${eventStatus(event)}`}
                  >
                    <span className="timeline-item__icon" aria-hidden="true">
                      {eventIcon(event)}
                    </span>
                    <span className="timeline-item__type">{event.type}</span>
                    <span className="timeline-item__detail">{eventLabel(event)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Panel 5: Release Risk Fingerprint */}
          {runState.riskFingerprint && (
            <section className="panel" aria-labelledby="panel-risk-heading">
              <h2 id="panel-risk-heading">Release Risk Fingerprint</h2>
              <p className="text-sm text-muted" style={{ marginBottom: "var(--space-3)" }}>
                {runState.riskFingerprint.basedOnMemory
                  ? `Memory-aware — based on ${runState.riskFingerprint.memoryGenerationCount} prior run(s)`
                  : "First run — no prior memory context"}
              </p>
              {runState.riskFingerprint.items.length === 0 ? (
                <p className="text-sm text-muted">No risk signals detected.</p>
              ) : (
                <table className="category-table" aria-label="Risk signals">
                  <thead>
                    <tr>
                      <th scope="col">Severity</th>
                      <th scope="col">Signal</th>
                      <th scope="col">Detail</th>
                      <th scope="col">From Memory?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runState.riskFingerprint.items.map((item, i) => (
                      <tr key={i}>
                        <td>
                          <span className={`risk-severity risk-severity--${item.severity}`}>
                            {item.severity}
                          </span>
                        </td>
                        <td>{item.signal}</td>
                        <td>{item.detail}</td>
                        <td>{item.fromMemory ? <span className="status-pass" aria-label="From memory">Yes</span> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          {/* Panel 6: Time-to-Ship */}
          {runState.timeToShip && (
            <section className="panel" aria-labelledby="panel-tts-heading">
              <h2 id="panel-tts-heading">Time-to-Demo-Ready</h2>
              <div
                className="tts-display"
                aria-label={`${runState.timeToShip.minMinutes} to ${runState.timeToShip.maxMinutes} minutes to remediate`}
              >
                <span aria-hidden="true">{runState.timeToShip.minMinutes}–{runState.timeToShip.maxMinutes}</span>
                <span className="tts-display__unit">minutes</span>
              </div>
              <p className="text-xs text-muted" style={{ marginTop: "var(--space-2)" }}>
                {runState.timeToShip.heuristic}
              </p>
              {runState.timeToShip.reasons.length > 0 && (
                <ul
                  aria-label="Time-to-ship breakdown"
                  style={{ paddingLeft: "var(--space-5)", marginTop: "var(--space-3)", fontSize: "0.875rem", color: "var(--color-text-muted)" }}
                >
                  {runState.timeToShip.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Panel 7: Findings — score breakdown + blockers + actions */}
          {(runState.assessorOutput || runState.score) && (
            <section className="panel" aria-labelledby="panel-findings-heading">
              <h2 id="panel-findings-heading">Findings</h2>

              {/* Score breakdown table */}
              {runState.score && runState.score.categories.length > 0 && (
                <>
                  <h3 id="score-breakdown-heading">Score Breakdown</h3>
                  <table className="category-table" style={{ marginTop: "var(--space-2)" }} aria-labelledby="score-breakdown-heading">
                    <thead>
                      <tr>
                        <th scope="col">Category</th>
                        <th scope="col">Weight</th>
                        <th scope="col">Raw</th>
                        <th scope="col">Weighted</th>
                        <th scope="col">Pass?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runState.score.categories.map((cat, i) => (
                        <tr key={i}>
                          <td>{cat.name}</td>
                          <td>{(cat.weight * 100).toFixed(0)}%</td>
                          <td>{cat.rawScore}/100</td>
                          <td>{cat.weightedScore.toFixed(1)}</td>
                          <td>
                            {cat.pass
                              ? <span className="status-pass" aria-label="Pass">Pass</span>
                              : <span className="status-fail" aria-label="Fail">Fail</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight: "bold", color: "var(--color-text)" }}>
                        <td>TOTAL</td>
                        <td>100%</td>
                        <td>—</td>
                        <td>{runState.score.total}</td>
                        <td>
                          {runState.score.total >= 71
                            ? <span className="status-pass" aria-label="Overall pass">Pass</span>
                            : <span className="status-fail" aria-label="Overall fail">Fail</span>}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </>
              )}

              {/* Blockers */}
              {runState.assessorOutput?.blockers && runState.assessorOutput.blockers.length > 0 && (
                <div style={{ marginTop: "var(--space-4)" }}>
                  <h3>Top Blockers</h3>
                  <ul
                    aria-label="Blockers preventing release"
                    style={{ paddingLeft: "var(--space-5)", marginTop: "var(--space-2)", fontSize: "0.875rem" }}
                  >
                    {runState.assessorOutput.blockers.map((b, i) => (
                      <li key={i} style={{ color: "var(--color-not-ready)", marginBottom: "4px" }}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommended actions */}
              {runState.assessorOutput?.recommendedActions && runState.assessorOutput.recommendedActions.length > 0 && (
                <div style={{ marginTop: "var(--space-4)" }}>
                  <h3>Recommended Actions</h3>
                  <ol
                    aria-label="Recommended actions"
                    style={{ paddingLeft: "var(--space-5)", marginTop: "var(--space-2)", fontSize: "0.875rem", color: "var(--color-text-muted)" }}
                  >
                    {runState.assessorOutput.recommendedActions.map((a, i) => (
                      <li key={i} style={{ marginBottom: "4px" }}>{a}</li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
          )}

          {/* Panel 8: Approval Gate — role=alert, no animation (accessibility-lead) */}
          {runState.approval && runState.approval.status === "pending" && (
            <section
              className="approval-panel"
              aria-labelledby="panel-approval-heading"
              role="alert"
              tabIndex={-1}
              ref={approvalRef}
              aria-live="assertive"
            >
              <h2 id="panel-approval-heading">Approval Required</h2>
              <p style={{ marginTop: "var(--space-2)" }}>
                <strong>Risk level:</strong>{" "}
                <span className={`risk-severity risk-severity--${runState.approval.riskLevel}`}>
                  {runState.approval.riskLevel.toUpperCase()}
                </span>
              </p>
              <p className="text-sm" style={{ marginTop: "var(--space-2)", color: "var(--color-text-muted)" }}>
                {runState.approval.actionDescription}
              </p>
              <div className="approval-actions">
                <button
                  className="btn btn--success"
                  onClick={() => handleApproval("approve")}
                  disabled={approving}
                  aria-busy={approving}
                >
                  Approve
                </button>
                <button
                  className="btn btn--danger"
                  onClick={() => handleApproval("reject")}
                  disabled={approving}
                >
                  Reject
                </button>
              </div>
            </section>
          )}

          {/* Panel 9: Live Report Preview — centerpiece */}
          <section
            className="panel report-panel"
            aria-labelledby="panel-report-heading"
          >
            <div className="report-panel-header">
              <div className="report-panel-title-row">
                <h2 id="panel-report-heading">Live Report Preview</h2>
                <span className="report-file-path" aria-hidden="true">SHIPCLAW_READINESS.md</span>
                {isComplete && (
                  <span className="tag tag--live">Generated</span>
                )}
              </div>
              {runState.reportMarkdown && (
                <button
                  className="btn btn--ghost"
                  onClick={handleCopyReport}
                  aria-label={
                    copyState === "copied" ? "Report copied to clipboard"
                    : copyState === "failed" ? "Copy failed — try again"
                    : "Copy report to clipboard"
                  }
                >
                  {copyState === "copied" ? "Copied" : copyState === "failed" ? "Failed" : "Copy"}
                </button>
              )}
            </div>

            {/* Idle: before run */}
            {runState.status === "idle" && (
              <div className="report-state-idle">
                <p>Report will appear here after the agent generates it.</p>
                <p className="text-sm text-muted" style={{ marginTop: "var(--space-2)" }}>
                  The 14-section SHIPCLAW_READINESS.md is written at the end of each run.
                </p>
              </div>
            )}

            {/* Running: generating */}
            {isRunning && !runState.reportMarkdown && (
              <div className="report-state-running" aria-live="polite" aria-label="Report generating">
                <span className="loading-spinner" aria-hidden="true" />
                <p>Generating readiness report…</p>
                <p className="text-xs text-muted">Report will render here when the agent reaches WRITE_ARTIFACTS.</p>
              </div>
            )}

            {/* Complete: render report */}
            {runState.reportMarkdown && (
              <div className="report-preview">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {runState.reportMarkdown}
                </ReactMarkdown>
              </div>
            )}
          </section>

          {/* Panel 11: Cross-Run Memory */}
          {runState.memory.length > 0 && (
            <section className="panel" aria-labelledby="panel-memory-heading">
              <h2 id="panel-memory-heading">Cross-Run Memory</h2>
              <p className="text-xs text-muted" style={{ marginBottom: "var(--space-3)" }}>
                Persistent across runs via SQLite. Captured before and after each run.
              </p>
              <div className="memory-list" role="list" aria-label="Memory items">
                {runState.memory.map((item, i) => (
                  <div key={i} className="memory-item" role="listitem">
                    <span className="memory-item__key">{item.key}</span>
                    <span className="memory-item__value">{item.value}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Panel 12: Audit Log */}
          {runState.auditLog.length > 0 && (
            <section className="panel" aria-labelledby="panel-audit-heading">
              <h2 id="panel-audit-heading">Audit Log</h2>
              <div className="audit-list" role="log" aria-label="Audit log entries" aria-live="off">
                {runState.auditLog.map((entry, i) => (
                  <div key={i} className="audit-item">
                    <span className="audit-item__actor">{entry.actor}</span>
                    <span className="audit-item__action">{entry.action}</span>
                    <span className="audit-item__detail">{entry.detail ?? "—"}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Panel 13: External Evidence / Exa */}
          {runState.status !== "idle" && runState.exaStatus !== null && (
            <section className="panel" aria-labelledby="panel-evidence-heading">
              <h2 id="panel-evidence-heading">External Evidence</h2>

              {/* Status label — text conveys state, not color alone (WCAG 1.4.1) */}
              <p
                className="text-sm"
                style={{ marginTop: "var(--space-2)" }}
                aria-label={
                  runState.exaStatus === "live"
                    ? `Exa status: Live — ${runState.exaCount} result${runState.exaCount === 1 ? "" : "s"} retrieved`
                    : runState.exaStatus === "failed"
                    ? "Exa status: Failed — search encountered an error, degraded gracefully"
                    : "Exa status: Skipped — disabled for this run"
                }
              >
                <span aria-hidden="true">
                  {runState.exaStatus === "live" && (
                    <>
                      <span className="tag tag--live">Live</span>
                      <span className="text-muted text-xs" style={{ marginLeft: "0.5rem" }}>
                        {runState.exaCount} result{runState.exaCount === 1 ? "" : "s"} from Exa
                      </span>
                    </>
                  )}
                  {runState.exaStatus === "skipped" && (
                    <span className="tag">Skipped</span>
                  )}
                  {runState.exaStatus === "failed" && (
                    <span className="risk-severity risk-severity--critical">Failed — degraded gracefully</span>
                  )}
                </span>
              </p>

              {runState.exaStatus === "skipped" && (
                <p className="text-sm text-muted" style={{ marginTop: "var(--space-2)" }}>
                  Exa web search is disabled for this run. Set <code>ENABLE_EXA=true</code> and
                  configure <code>EXA_API_KEY</code> to surface external evidence.
                </p>
              )}

              {runState.exaStatus === "failed" && (
                <p className="text-sm text-muted" style={{ marginTop: "var(--space-2)" }}>
                  The Exa search encountered an error. Assessment completed without external evidence.
                  ShipClaw degrades gracefully — the run still produced a full report.
                </p>
              )}

              {runState.exaStatus === "live" && runState.externalEvidence.length > 0 && (
                <table
                  className="category-table"
                  style={{ marginTop: "var(--space-3)" }}
                  aria-label={`External evidence from Exa — ${runState.exaCount} result${runState.exaCount === 1 ? "" : "s"}`}
                >
                  <thead>
                    <tr>
                      <th scope="col">Source</th>
                      <th scope="col">Title</th>
                      <th scope="col">Query</th>
                      <th scope="col">Excerpt</th>
                      <th scope="col">Relevance</th>
                      <th scope="col">Risk Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runState.externalEvidence.map((ev, i) => {
                      const riskSignalLabel =
                        ev.riskSignal === "supports-readiness" ? "Supports readiness"
                        : ev.riskSignal === "warns-against-readiness" ? "Warns against readiness"
                        : "Neutral";

                      return (
                        <tr key={i}>
                          <td className="text-mono text-xs">
                            {ev.url
                              ? <a href={ev.url} aria-label={`Source: ${ev.url}`}>{ev.source}</a>
                              : ev.source}
                          </td>
                          <td className="text-sm">
                            {ev.sourceTitle ?? <span className="text-muted" aria-label="Not available">—</span>}
                          </td>
                          <td className="text-sm">{ev.query.slice(0, 60)}{ev.query.length > 60 ? "…" : ""}</td>
                          <td className="text-sm">{ev.snippet.slice(0, 120)}{ev.snippet.length > 120 ? "…" : ""}</td>
                          <td aria-label={`Relevance: ${(ev.relevanceScore * 100).toFixed(0)}%${ev.relevance ? `, ${ev.relevance}` : ""}`}>
                            <span aria-hidden="true">
                              {(ev.relevanceScore * 100).toFixed(0)}%
                              {ev.relevance && (
                                <span
                                  className={`risk-severity risk-severity--${ev.relevance === "high" ? "low" : ev.relevance === "medium" ? "medium" : "high"}`}
                                  style={{ marginLeft: "0.25rem", textTransform: "none" }}
                                >
                                  {ev.relevance}
                                </span>
                              )}
                            </span>
                          </td>
                          <td aria-label={`Risk signal: ${riskSignalLabel}`}>
                            <span
                              className={`risk-severity ${ev.riskSignal === "supports-readiness" ? "risk-severity--low" : ev.riskSignal === "warns-against-readiness" ? "risk-severity--critical" : "risk-severity--medium"}`}
                              aria-hidden="true"
                              style={{ textTransform: "none" }}
                            >
                              {riskSignalLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          )}

        </main>
      </div>

      {/* ── Technical Proof Footer ────────────────────────────────────────── */}
      <footer className="tech-footer" aria-label="Technical proof claims">
        <p className="text-xs text-muted">
          ShipClaw — Autonomous Release Readiness Agent · Hack-a-Claw 2026
        </p>
        <div className="tech-footer-claims">
          <span className="tech-claim tech-claim--verified">✓ Deterministic Score</span>
          <span className="tech-claim tech-claim--verified">✓ Persistent Memory</span>
          <span className="tech-claim tech-claim--verified">✓ Nemotron Reasoning</span>
          <span className="tech-claim tech-claim--verified">✓ Approval-Gated Writes</span>
          <span className="tech-claim tech-claim--verified">✓ Audit Logged</span>
          <span className="tech-claim">Exa Optional</span>
          <span className="tech-claim">WCAG AA</span>
        </div>
      </footer>
    </>
  );
}
