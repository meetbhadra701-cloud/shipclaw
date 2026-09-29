/**
 * ShipClaw — Release command center.
 *
 * Information hierarchy (see SHIPCLAW_REDESIGN_SPEC.md):
 *   L1 verdict · score · time to ship · top blockers
 *   L2 score drivers + explanation, live agent workflow
 *   L3 trust facts, proposed actions / approval
 *   L4 evidence · risks · report · memory · audit · how it works (tabs)
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Brand } from "./components/Brand.js";
import { ThemeToggle } from "./components/ThemeToggle.js";
import { Landing } from "./components/Landing.js";
import { VerdictCard } from "./components/VerdictCard.js";
import { ScoreDrivers, explainSourceOf } from "./components/ScoreDrivers.js";
import { Workflow } from "./components/Workflow.js";
import { TrustFacts } from "./components/TrustFacts.js";
import { ActionsPanel } from "./components/ActionsPanel.js";
import { DetailTabs, type TabDef } from "./components/DetailTabs.js";
import { AuditView, EvidenceView, MemoryView, ReportView, RiskView, SystemView } from "./components/details.js";
import { Icon } from "./components/Icon.js";
import { useRun } from "./lib/useRun.js";
import { BAND_LABEL, formatMinutes, shortRepo } from "./lib/format.js";

function prefersReducedMotion(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

export default function App() {
  const { view, health, history, start, open, reset, retryStream, resolveApproval } = useRun();
  const { phase, derived } = view;
  const [tab, setTab] = useState("evidence");
  const liveRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const fixture = derived.evidence?.source === "fixture" || view.mode === "demo";
  const inRun = phase === "running" || phase === "complete" || phase === "error";
  const complete = phase === "complete";
  const explainSource = derived.final ? explainSourceOf(derived.final.assessorOutput) : null;

  const announce = useCallback((msg: string) => {
    const el = liveRef.current;
    if (!el) return;
    el.textContent = "";
    window.setTimeout(() => { el.textContent = msg; }, 40);
  }, []);

  // Move focus to the run heading when a run view opens (the form it replaced is gone).
  useEffect(() => {
    if (view.runId && inRun) headingRef.current?.focus();
  }, [view.runId]);

  useEffect(() => {
    if (view.runId) setTab("evidence");
  }, [view.runId]);

  useEffect(() => {
    if (derived.score) announce(`Readiness score ${derived.score.total} out of 100, ${BAND_LABEL[derived.score.band]}.`);
  }, [derived.score, announce]);

  useEffect(() => {
    if (!derived.final || !derived.score) return;
    const tts = derived.timeToShip && derived.fingerprint?.items.length ? ` Illustrative effort for observed weaknesses ${formatMinutes(derived.timeToShip.minMinutes)} to ${formatMinutes(derived.timeToShip.maxMinutes)}.` : "";
    announce(`Analysis complete. Verdict ${derived.final.decision.toUpperCase()}. Score ${derived.score.total} out of 100.${tts}`);
  }, [derived.final, derived.score, derived.timeToShip, announce]);

  useEffect(() => {
    if (phase === "error" && view.error) announce(`Analysis failed: ${view.error}`);
  }, [phase, view.error, announce]);

  useEffect(() => {
    document.title = derived.final && derived.score
      ? `${derived.final.decision.toUpperCase()} ${derived.score.total}/100 · ${shortRepo(view.repo)} — ShipClaw`
      : inRun ? `Analyzing ${shortRepo(view.repo)} — ShipClaw` : "ShipClaw — Is this repo ready to ship?";
  }, [derived.final, derived.score, inRun, view.repo]);

  const openTab = (id: string) => {
    setTab(id);
    window.setTimeout(() => {
      document.getElementById("details")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      document.getElementById(`tab-${id}`)?.focus({ preventScroll: true });
    }, 0);
  };

  const tabs: TabDef[] = [
    { id: "evidence", label: "Evidence", count: derived.score?.categories.reduce((n, c) => n + c.evidence.length, 0) ?? null, render: () => <EvidenceView derived={derived} fixture={fixture} /> },
    { id: "risks", label: "Risks", count: derived.fingerprint?.items.length ?? null, render: () => <RiskView derived={derived} /> },
    { id: "report", label: "Report", render: () => <ReportView runId={view.runId} report={view.report} artifacts={view.artifacts} /> },
    { id: "memory", label: "Memory & history", render: () => <MemoryView storage={health?.storage} changes={derived.memoryChanges} memory={view.memory} history={history} currentRunId={view.runId} onOpen={open} /> },
    { id: "audit", label: "Audit trail", count: view.events.length, render: () => <AuditView events={view.events} audit={view.audit} /> },
    { id: "system", label: "How it works", render: () => <SystemView health={health} explainSource={explainSource} /> },
  ];

  return (
    <>
      <div ref={liveRef} className="visually-hidden" role="status" aria-live="polite" aria-atomic="true" />

      <header className="topbar">
        <div className="topbar__inner">
          <Brand onHome={inRun ? reset : undefined} />
          <span className="topbar__tag">Release readiness</span>
          <div className="topbar__right">
            <span className="chip chip--fixture">{fixture ? "Sample evidence" : "Read-only GitHub"}</span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="main">
        {!inRun ? (
          <Landing
            busy={phase === "starting"}
            error={view.error}
            health={health}
            history={history}
            onAnalyze={start}
            onOpen={open}
          />
        ) : (
          <div className="run">
            <div className="run-head">
              <div className="run-head__text">
                <p className="kicker">
                  Release readiness{view.runId && <> · run <span className="mono">{view.runId}</span></>}
                  {view.fromHistory && complete ? " · from history" : ""}
                </p>
                <h1 ref={headingRef} tabIndex={-1} className="run-head__repo mono">{shortRepo(view.repo)}</h1>
                <p className="run-head__goal">{view.goal}</p>
              </div>
              <button type="button" className="btn btn--secondary" onClick={reset}>New analysis</button>
            </div>

            {fixture && (
              <p className="notice">
                <span className="chip chip--fixture">Fixture evidence</span>
                <span>
                  Evidence comes from a built-in sample snapshot, not the live contents of{" "}
                  <span className="mono">{shortRepo(view.repo)}</span>. The analysis on top of it is real.{" "}
                  <button type="button" className="link-btn" onClick={() => openTab("system")}>What's implemented</button>
                </span>
              </p>
            )}

            {!fixture && derived.evidence && (
              <p className="notice"><span className="chip">GitHub evidence</span><span>Inspected <span className="mono">{derived.evidence.latestCommitSha?.slice(0, 12) ?? "no commit available"}</span> on {derived.evidence.defaultBranch}. Read-only snapshot; tests, security audits, and dependency freshness were not run.</span></p>
            )}
            {phase === "error" && (
              <div className="alert" role="alert">
                <Icon name="alert" size={16} />
                <div>
                  <strong>The analysis did not finish.</strong> {view.error}
                </div>
                <button type="button" className="btn btn--secondary btn--sm" onClick={reset}>New analysis</button>
              </div>
            )}
            {view.streamLost && phase !== "error" && (
              <div className="alert" role="alert">
                <Icon name="alert" size={16} />
                <div><strong>Lost connection to the agent stream.</strong> The run may still be progressing on the server.</div>
                <button type="button" className="btn btn--secondary btn--sm" onClick={retryStream}>Reconnect</button>
              </div>
            )}

            <div className="run-grid">
              <div className="run-grid__verdict">
                <VerdictCard derived={derived} running={phase === "running"} animate={!view.replayed} onShowRisks={() => openTab("risks")} />
              </div>

              <aside className="run-grid__rail" aria-label="Agent workflow">
                <Workflow derived={derived} explainSource={explainSource ?? "none"} fixture={fixture} replayed={view.replayed} failed={phase === "error"} />
              </aside>

              {derived.score && (
                <div className="run-grid__main">
                  <ScoreDrivers
                    score={derived.score}
                    decision={derived.final?.decision ?? null}
                    assessor={derived.final?.assessorOutput ?? null}
                    assessorDone={derived.final !== null}
                    model={health?.model}
                  />
                  {complete && (
                    <>
                      <TrustFacts storage={health?.storage} derived={derived} explainSource={explainSource ?? "none"} eventCount={view.events.length} artifactCount={view.artifacts.length} onOpenTab={openTab} />
                      <ActionsPanel approval={derived.approval} decision={view.approvalDecision} assessor={derived.final?.assessorOutput ?? null} onResolve={resolveApproval} announce={announce} />
                    </>
                  )}
                  <DetailTabs tabs={tabs} active={tab} onChange={setTab} />
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <span>ShipClaw · deterministic release readiness</span>
        <span className="muted">
          Explanations by NVIDIA Nemotron when configured ({health?.nemotron === "configured" ? "configured" : "not configured"}) ·{" "}
          <a href="https://github.com/meetbhadra701-cloud/shipclaw" target="_blank" rel="noreferrer">Source</a>
        </span>
      </footer>
    </>
  );
}
