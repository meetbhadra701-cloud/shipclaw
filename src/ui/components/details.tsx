/**
 * Detail views behind the tabs: the full evidence, risk, report, memory, audit and system
 * information. Everything here is secondary to the verdict, but nothing is hidden.
 */
import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentEvent, MemoryChange } from "../../shared/types.js";
import {
  MINUTES_PER_CRITICAL_BLOCKER,
  MINUTES_PER_HIGH_BLOCKER,
  MINUTES_PER_MEDIUM_BLOCKER,
  SCORE_WEIGHTS,
  TIME_BUFFER_MULTIPLIER,
} from "../../shared/heuristics.js";
import type { DerivedRun } from "../lib/derive.js";
import {
  SOURCE_LABEL,
  categoryLabel,
  formatMinutes,
  formatMs,
  formatTime,
  parseEvidence,
  shortRepo,
  signalLabel,
  valueLabel,
} from "../lib/format.js";
import type { AuditEntry, Health, MemoryItem, RunSummary } from "../lib/useRun.js";
import type { ExplainSource } from "./ScoreDrivers.js";
import { rankBlockers } from "./VerdictCard.js";
import { Icon } from "./Icon.js";

/** Horizontally scrollable table container that keyboard users can focus and scroll. */
function TableWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="table-wrap" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}

// ─── Evidence ─────────────────────────────────────────────────────────────────

export function EvidenceView({ derived, fixture }: { derived: DerivedRun; fixture: boolean }) {
  const { score, toolCalls, externalEvidence } = derived;
  if (!score) return <p className="muted">Evidence appears once the score is calculated.</p>;
  return (
    <div className="stack">
      <p className="view-intro">
        Every observation the scorer used, and the fixed rule's output for it. The category score is the average of its
        measured observations. Unknown categories earn no points and are never marked as measured failures.
        {fixture && <> <strong>Source data is a built-in fixture</strong> (no GitHub requests or repository execution).</>}
      </p>
      {derived.evidence && <>
        <h3 className="sub-title">What we measured</h3>
        <TableWrap label="Repository snapshot"><table className="table"><tbody>
          <tr><th scope="row">Repository</th><td><a href={derived.evidence.repository} target="_blank" rel="noreferrer">{derived.evidence.repository}</a></td></tr>
          <tr><th scope="row">Snapshot</th><td className="mono break">{derived.evidence.latestCommitSha ?? "Unmeasured"} · {derived.evidence.defaultBranch} · collected {formatTime(derived.evidence.collectedAt)}</td></tr>
          <tr><th scope="row">Open issues / PRs</th><td>{derived.evidence.openIssueCount ?? "unknown"} / {derived.evidence.openPRCount ?? "unknown"} · contextual counts, not scored as blockers</td></tr>
          <tr><th scope="row">Actions files / status</th><td>{derived.evidence.hasCI === null ? "unknown" : derived.evidence.hasCI ? "present" : "absent"} / {derived.evidence.ciStatus}</td></tr>
          <tr><th scope="row">File tree</th><td>{derived.evidence.filePaths.length} regular file paths · {derived.evidence.treeComplete ? "complete" : "incomplete or unavailable"}</td></tr>
        </tbody></table></TableWrap>
        {derived.evidence.actionsRuns && derived.evidence.actionsRuns.length > 0 && <ul className="plain-list small">{derived.evidence.actionsRuns.map((run, i) => <li key={i}><a href={run.url} target="_blank" rel="noreferrer">{run.name}</a>: {run.status} / {run.conclusion ?? "pending"} · not necessarily a test workflow</li>)}</ul>}
        <h3 className="sub-title">What we could not measure</h3>
        <ul className="plain-list small">{derived.evidence.limitations.map((note, i) => <li key={i}>{note}</li>)}</ul>
        <details><summary>Observed file paths (read-only snapshot)</summary><pre className="events__json">{derived.evidence.filePaths.join("\n") || "No file tree available"}</pre></details>
      </>}
      <h3 className="sub-title">How evidence produced the score</h3>
      <TableWrap label="Scored evidence">
        <table className="table">
          <caption className="visually-hidden">Scored evidence by category</caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Source</th>
              <th scope="col">Signal</th>
              <th scope="col">Observed</th>
              <th scope="col" className="num-col">Rule score</th>
            </tr>
          </thead>
          <tbody>
            {score.categories.flatMap((c) =>
              c.evidence.map((raw, i) => {
                const e = parseEvidence(raw);
                return (
                  <tr key={`${c.name}-${i}`}>
                    <td>{i === 0 ? <strong>{categoryLabel(c.name)}</strong> : <span className="visually-hidden">{categoryLabel(c.name)}</span>}</td>
                    {e.kind === "observation" ? (
                      <>
                        <td>
                          {SOURCE_LABEL[e.source] ?? e.source}
                          {fixture && <span className="chip chip--fixture chip--xs">{e.source === "shell" ? "simulated" : "fixture"}</span>}
                        </td>
                        <td>{signalLabel(e.signal)} <span className="mono muted">{e.signal}</span></td>
                        <td className="mono">{valueLabel(e.signal, e.value)}</td>
                        <td className="num-col num">{e.score}</td>
                      </>
                    ) : (
                      <>
                        <td className="muted">—</td>
                        <td colSpan={2} className="muted">{raw}</td>
                        <td className="num-col num muted">Unmeasured</td>
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </TableWrap>

      <h3 className="sub-title">Tool calls</h3>
      <TableWrap label="Tool calls">
        <table className="table">
          <thead>
            <tr><th scope="col">Tool</th><th scope="col">Arguments</th><th scope="col">Result</th><th scope="col" className="num-col">Duration</th></tr>
          </thead>
          <tbody>
            {toolCalls.map((c, i) => (
              <tr key={i}>
                <td className="mono">{c.tool}</td>
                <td className="mono muted">{Object.entries(c.args).map(([k, v]) => `${k}=${String(v)}`).join(" ")}</td>
                <td>{c.success === null ? "running" : c.success ? "ok" : "failed"}</td>
                <td className="num-col num">{c.durationMs !== null ? formatMs(c.durationMs) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <h3 className="sub-title">External evidence</h3>
      <p className="muted">
        {externalEvidence?.enabled
          ? `Exa enabled: ${externalEvidence.count} result(s) attached as context. External evidence never changes the score.`
          : "Exa is disabled for this deployment, so no external searches were made. When enabled, it is capped at 3 sanitized searches per run and cannot change the score."}
      </p>
    </div>
  );
}

// ─── Risks ────────────────────────────────────────────────────────────────────

export function RiskView({ derived }: { derived: DerivedRun }) {
  const { fingerprint, score, timeToShip } = derived;
  if (!fingerprint) return <p className="muted">The risk fingerprint appears after scoring.</p>;
  const blockers = rankBlockers(score, fingerprint.items);
  return (
    <div className="stack">
      <p className="view-intro">
        One risk per measured category below bar. Severity: below 30 is critical, below 50 high, otherwise medium. Built with context
        from {fingerprint.memoryGenerationCount} prior run{fingerprint.memoryGenerationCount === 1 ? "" : "s"}; signals are
        currently derived from this run's scores (history-derived signals are not implemented yet).
      </p>
      {blockers.length === 0 ? <p>No measured categories below bar. Unknown evidence is not a pass.</p> : (
        <TableWrap label="Risks">
          <table className="table">
            <thead>
              <tr><th scope="col">Severity</th><th scope="col">Category</th><th scope="col">Evidence</th><th scope="col" className="num-col">Score</th><th scope="col" className="num-col">Effort</th></tr>
            </thead>
            <tbody>
              {blockers.map((b) => (
                <tr key={b.item.signal}>
                  <td><span className={`sev sev--${b.item.severity}`}>{b.item.severity}</span></td>
                  <td>{categoryLabel(b.item.signal)}</td>
                  <td>{b.evidence}</td>
                  <td className="num-col num">{b.score ?? "—"}</td>
                  <td className="num-col num">{b.minutes ? formatMinutes(b.minutes) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {timeToShip && (
        <div className="formula">
          <h3 className="sub-title">Illustrative effort formula</h3>
          <p className="mono formula__expr">
            min = no measured weaknesses ? 0 : max(30, critical×{MINUTES_PER_CRITICAL_BLOCKER} + high×{MINUTES_PER_HIGH_BLOCKER} + medium×{MINUTES_PER_MEDIUM_BLOCKER}) = {timeToShip.minMinutes} min
            <br />max = min × {TIME_BUFFER_MULTIPLIER} = {timeToShip.maxMinutes} min
          </p>
          <ul className="plain-list">{timeToShip.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

// ─── Report ───────────────────────────────────────────────────────────────────

const mdComponents = {
  h1: ({ children, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => <h3 {...p}>{children}</h3>,
  h2: ({ children, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => <h4 {...p}>{children}</h4>,
  h3: ({ children, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => <h5 {...p}>{children}</h5>,
  table: ({ children, ...p }: React.TableHTMLAttributes<HTMLTableElement>) => <TableWrap label="Memory changes"><table className="table" {...p}>{children}</table></TableWrap>,
  th: ({ children, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => <th scope="col" {...p}>{children}</th>,
};

const ARTIFACT_DESC: Record<string, string> = {
  "SHIPCLAW_READINESS.md": "Full 14-section readiness report",
  "github_issue_draft.md": "Paste-ready GitHub issue",
  "audit.jsonl": "Every agent event, one JSON per line",
  "memory_before.jsonl": "Memory snapshot before the run",
  "memory_after.jsonl": "Memory snapshot after the run",
  "memory_diff.md": "Human-readable memory diff",
};

export function ReportView({ runId, report, artifacts }: { runId: string | null; report: string | null; artifacts: string[] }) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const doCopy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
    window.setTimeout(() => setCopy("idle"), 2500);
  };
  if (!report) return <p className="muted">The report is written at the end of the run.</p>;
  return (
    <div className="report-layout">
      <aside className="artifacts" aria-labelledby="artifacts-title">
        <h3 id="artifacts-title" className="sub-title">Artifacts <span className="muted mono">runs/{runId}/</span></h3>
        <ul className="artifacts__list">
          {artifacts.map((a) => (
            <li key={a}>
              <a href={`/api/reports/${runId}/files/${a}`} target="_blank" rel="noreferrer" className="artifacts__link">
                <span className="mono">{a}</span>
                <Icon name="external" size={12} />
                <span className="visually-hidden">(opens in a new tab)</span>
              </a>
              <span className="artifacts__desc">{ARTIFACT_DESC[a] ?? ""}</span>
            </li>
          ))}
        </ul>
      </aside>
      <div className="report">
        <div className="report__bar">
          <span className="mono">SHIPCLAW_READINESS.md</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={doCopy}>
            <Icon name="copy" size={13} /> {copy === "copied" ? "Copied" : copy === "failed" ? "Copy failed" : "Copy markdown"}
          </button>
          <span className="visually-hidden" role="status">{copy === "copied" ? "Report copied to clipboard" : copy === "failed" ? "Copy failed" : ""}</span>
        </div>
        <div className="markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{report}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

// ─── Memory & history ─────────────────────────────────────────────────────────

export function MemoryView({ storage, changes, memory, history, currentRunId, onOpen }: {
  storage?: "sqlite" | "volatile";
  changes: MemoryChange[] | null;
  memory: MemoryItem[];
  history: RunSummary[];
  currentRunId: string | null;
  onOpen: (run: RunSummary) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = (changes ?? []).filter((c) => showAll || c.changeType !== "unchanged");
  return (
    <div className="stack">
      <p className="view-intro">
        ShipClaw keeps {storage === "sqlite" ? "SQLite memory on the server data volume" : "volatile session memory (lost on restart)"}. Each run snapshots it before and after and writes the diff as
        an artifact, so later runs know what earlier runs saw.
      </p>
      <div className="split">
        <div>
          <h3 className="sub-title">Changed by this run</h3>
          {changes === null ? <p className="muted">Memory is updated near the end of the run.</p> : (
            <>
              <TableWrap label="Audit log">
                <table className="table table--compact">
                  <thead><tr><th scope="col">Key</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Change</th></tr></thead>
                  <tbody>
                    {visible.map((c) => (
                      <tr key={c.key}>
                        <td className="mono">{c.key}</td>
                        <td className="mono muted">{c.before ?? "—"}</td>
                        <td className="mono">{c.after ?? "—"}</td>
                        <td>{c.changeType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              <button type="button" className="link-btn link-btn--sm" onClick={() => setShowAll((s) => !s)}>
                {showAll ? "Hide unchanged keys" : `Show unchanged keys (${(changes ?? []).filter((c) => c.changeType === "unchanged").length})`}
              </button>
            </>
          )}
          <p className="muted small">{memory.length} keys in the memory store.</p>
        </div>
        <div>
          <h3 className="sub-title">Release history</h3>
          {history.length === 0 ? <p className="muted">No earlier runs.</p> : (
            <ul className="history history--compact">
              {history.map((run) => (
                <li key={run.id}>
                  <button type="button" className="history__row" onClick={() => onOpen(run)} disabled={run.id === currentRunId} aria-current={run.id === currentRunId ? "true" : undefined}>
                    <span className="history__repo mono">{shortRepo(run.repo)}</span>
                    <span className={`history__verdict tone-${run.decision === "ship" ? "ready" : run.band === "NOT_READY" ? "not-ready" : run.decision ? "risky" : "neutral"}`}>
                      {run.decision ? run.decision.toUpperCase() : run.status}
                    </span>
                    <span className="history__score num">{run.score ?? "—"}</span>
                    <span className="history__time muted">{run.id === currentRunId ? "this run" : formatTime(run.startedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Audit ────────────────────────────────────────────────────────────────────

function summarize(e: AgentEvent): string {
  switch (e.type) {
    case "state_entered": return e.state;
    case "goal_received": return e.goal;
    case "memory_loaded": return `${e.itemCount} items · basedOnMemory=${e.basedOnMemory}`;
    case "plan_created": return `${e.plan.steps.length} steps`;
    case "tool_call_started": return `${e.tool} ${JSON.stringify(e.args)}`;
    case "tool_call_finished": return `${e.tool} success=${e.success} ${e.durationMs}ms`;
    case "readiness_score_calculated": return `total=${e.score.total} band=${e.score.band}`;
    case "risk_fingerprint_created": return `${e.fingerprint.items.length} items`;
    case "time_to_ship_estimated": return `${e.estimate.minMinutes}–${e.estimate.maxMinutes} min`;
    case "external_evidence_status": return `enabled=${e.enabled} count=${e.count}`;
    case "approval_requested": return `${e.approval.id} ${e.approval.riskLevel}`;
    case "approval_resolved": return `${e.approval.id} ${e.approval.status} by ${e.approval.resolvedBy}`;
    case "memory_updated": return `${e.changes.length} keys`;
    case "repository_evidence": return `${e.evidence.source}: ${e.evidence.repository} @ ${e.evidence.latestCommitSha ?? "unknown commit"}`;
    case "final_result": return `decision=${e.decision} total=${e.score.total}`;
  }
}

export function AuditView({ events, audit }: { events: AgentEvent[]; audit: AuditEntry[] }) {
  const t0 = events[0] ? Date.parse(events[0].ts) : 0;
  return (
    <div className="stack">
      <p className="view-intro">
        The raw record: every event the agent emitted (also in <span className="mono">audit.jsonl</span>), and the audit
        log of system, agent and human actions. Expand an event for its JSON payload.
      </p>
      <h3 className="sub-title">Event stream <span className="muted">({events.length})</span></h3>
      <ol className="events">
        {events.map((e, i) => (
          <li key={i} className={`events__item${e.type === "state_entered" ? " events__item--state" : ""}`}>
            <details>
              <summary>
                <span className="events__t mono num">+{Math.max(0, Date.parse(e.ts) - t0)}ms</span>
                <span className="events__type mono">{e.type}</span>
                <span className="events__sum">{summarize(e)}</span>
              </summary>
              <pre className="events__json">{JSON.stringify(e, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ol>
      <h3 className="sub-title">Audit log <span className="muted">({audit.length})</span></h3>
      {audit.length === 0 ? <p className="muted">Loaded when the run completes.</p> : (
        <TableWrap label="Implementation status">
          <table className="table table--compact">
            <thead><tr><th scope="col">Time</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Detail</th></tr></thead>
            <tbody>
              {audit.map((a, i) => (
                <tr key={i}>
                  <td className="mono muted">{a.createdAt}</td>
                  <td>{a.actor}</td>
                  <td className="mono">{a.action}</td>
                  <td className="break">{a.detail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}

// ─── How it works ─────────────────────────────────────────────────────────────

type Status = "real" | "fixture" | "off" | "partial";
const STATUS_LABEL: Record<Status, string> = { real: "Implemented", fixture: "Fixture data", off: "Off", partial: "Partial" };

export function SystemView({ health, explainSource }: { health: Health | null; explainSource: ExplainSource | null }) {
  const fixture = health?.evidenceSource === "fixture";
  const nemotronConfigured = health?.nemotron === "configured";
  const rows: Array<{ area: string; what: string; status: Status; where: string }> = [
    { area: "Agent", what: "17-state bounded state machine; every transition is an event", status: "real", where: "src/agent/loop.ts" },
    { area: "Evidence", what: "Read-only GitHub metadata, commit-pinned tree and Actions results; no code execution", status: fixture ? "fixture" : "real", where: "src/tools/" },
    { area: "Analysis", what: `Weighted scoring: ${Object.entries(SCORE_WEIGHTS).map(([k, w]) => `${categoryLabel(k)} ${Math.round(w * 100)}%`).join(", ")}`, status: "real", where: "src/agent/scorer.ts" },
    { area: "Risk", what: "Severity-ranked fingerprint of failing categories, with prior-run context", status: "partial", where: "src/agent/riskFingerprint.ts" },
    { area: "Estimation", what: "Explicit time-to-remediation formula with buffer", status: "real", where: "src/agent/timeToShip.ts" },
    {
      area: "AI",
      what: `Nemotron (${health?.model ?? "nvidia/nemotron-3.5-lightning-30b-a3b"}) explains the score; zod-validated; verdict forced to the threshold`,
      status: nemotronConfigured ? "real" : "off",
      where: "src/agent/assessor.ts",
    },
    { area: "Safety", what: "Proposed actions become approval requests; decisions are audited; nothing is executed", status: "partial", where: "src/server/routes.ts" },
    { area: "Memory", what: health?.storage === "sqlite" ? "SQLite storage with before/after snapshots; persistence depends on keeping the data volume" : "Volatile in-memory storage; lost on restart", status: health?.storage === "sqlite" ? "real" : "partial", where: "src/agent/memory.ts" },
    { area: "Observability", what: "Server-sent event stream, events table, audit log, audit.jsonl", status: "real", where: "src/server/routes.ts" },
    { area: "Outputs", what: "Readiness report, GitHub issue draft, memory diff", status: "real", where: "src/agent/report.ts" },
    { area: "External evidence", what: "Exa search, ≤3 sanitized queries, cannot change the score", status: health?.exa === "enabled" ? "real" : "off", where: "src/tools/exa.ts" },
  ];
  return (
    <div className="stack">
      <p className="view-intro">
        The trust model is <strong>evidence → fixed rules → score → model explanation</strong>, never
        prompt → model verdict. The table below states what runs today, honestly.
      </p>
      <TableWrap label="Table">
        <table className="table">
          <thead><tr><th scope="col">Area</th><th scope="col">What it does</th><th scope="col">Status</th><th scope="col">Code</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.area}>
                <th scope="row">{r.area}</th>
                <td>{r.what}</td>
                <td><span className={`pill pill--${r.status}`}>{STATUS_LABEL[r.status]}</span></td>
                <td className="mono muted">{r.where}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <ul className="plain-list small">
        <li><strong>Evidence:</strong> {fixture ? "sample mode uses a built-in fixture." : "public GitHub API reads; missing signals stay unknown; no repository code is executed."}</li>
        <li><strong>Model:</strong> {nemotronConfigured ? "API key configured." : "no API key configured."} {health?.llmFallbackAllowed ? "Live requests may fall back to a template. Sample runs always use a template." : ""} {explainSource ? `This run: ${explainSource === "nemotron" ? "explained by Nemotron" : explainSource === "template" ? "templated explanation" : "no explanation returned"}.` : ""}</li>
        <li><strong>Risk:</strong> the fingerprint records prior-run count; deriving signals from memory is not implemented yet.</li>
        <li><strong>Approval:</strong> proposal review records acceptance or rejection only. It never executes changes or blocks the read-only analysis.</li>
      </ul>
    </div>
  );
}

