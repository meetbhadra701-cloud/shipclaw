import React, { useEffect, useState } from "react";
import type { AgentState } from "../../shared/types.js";
import { PHASES, STATE_LABEL, type DerivedRun, type Stage } from "../lib/derive.js";
import { formatMinutes, formatMs } from "../lib/format.js";
import type { ExplainSource } from "./ScoreDrivers.js";
import { Icon } from "./Icon.js";

interface Props {
  derived: DerivedRun;
  explainSource: ExplainSource;
  fixture: boolean;
  replayed: boolean;
  failed: boolean;
}

function stageDetail(state: AgentState, d: DerivedRun, explainSource: ExplainSource, fixture: boolean): React.ReactNode {
  const calls = (prefix: string) => d.toolCalls.filter((c) => c.tool.startsWith(prefix));
  switch (state) {
    case "INIT":
      return d.goal ? <>Goal: “{d.goal}”</> : null;
    case "LOAD_MEMORY":
      return d.memoryLoaded
        ? <>{d.memoryLoaded.itemCount} memory keys loaded · {d.memoryLoaded.basedOnMemory ? "prior runs found" : "first run, no history"}</>
        : null;
    case "PLAN":
      return d.plan ? (
        <>
          {d.plan.steps.length}-step public plan · {d.plan.constraints.join(" · ")}
        </>
      ) : null;
    case "FETCH_GITHUB_DATA":
    case "SCAN_REPO": {
      const c = calls(state === "FETCH_GITHUB_DATA" ? "github" : "repo")[0];
      return c ? (
        <><span className="mono">{c.tool}</span> · {c.success ? "ok" : "failed"}{c.durationMs !== null ? ` · ${formatMs(c.durationMs)}` : ""}{fixture ? " · fixture data" : ""}</>
      ) : null;
    }
    case "RUN_SAFE_CHECKS": {
      const cs = calls("shell");
      if (cs.length === 0) return null;
      return (
        <>
          {cs.map((c, i) => (
            <span key={i}>{i > 0 ? " · " : ""}<span className="mono">{String(c.args["command"] ?? c.tool)}</span> {c.success ? "passed" : "failed"}</span>
          ))}
          {fixture ? " · simulated, allowlisted; no process is executed" : ""}
        </>
      );
    }
    case "CALCULATE_SCORE":
      return d.score ? <>{d.score.total}/100 · {d.score.band.replace("_", " ").toLowerCase()} · {d.score.categories.reduce((n, c) => n + c.evidence.length, 0)} evidence lines · no model involved</> : null;
    case "BUILD_RISK_FINGERPRINT":
      return d.fingerprint ? <>{d.fingerprint.items.length} risks · context from {d.fingerprint.memoryGenerationCount} prior run{d.fingerprint.memoryGenerationCount === 1 ? "" : "s"}</> : null;
    case "ESTIMATE_TIME_TO_SHIP":
      return d.timeToShip ? <>{formatMinutes(d.timeToShip.minMinutes)}–{formatMinutes(d.timeToShip.maxMinutes)} · <span className="mono">{d.timeToShip.heuristic}</span></> : null;
    case "OPTIONAL_EXA_EXTERNAL_EVIDENCE":
      return d.externalEvidence
        ? d.externalEvidence.enabled ? <>Exa enabled · {d.externalEvidence.count} results</> : <>Exa disabled · no external calls made</>
        : null;
    case "ASSESS_WITH_NEMOTRON":
      return explainSource === "nemotron" ? <>Nemotron explained the score; verdict checked against the threshold</>
        : explainSource === "template" ? <>Nemotron not called · templated explanation</>
        : d.final ? <>No explanation returned · verdict from threshold</> : null;
    case "PROPOSE_ACTIONS":
      return d.approval ? <>{d.approval.actionDescription.split(" | ").length} actions proposed · {d.approval.riskLevel} risk</> : d.memoryChanges ? <>No actions to propose</> : null;
    case "WAIT_FOR_APPROVAL":
      return d.approval ? <>Approval {d.approval.status === "pending" ? "requested · recorded as pending, the run does not block" : `${d.approval.status} by ${d.approval.resolvedBy}`}</> : null;
    case "EXECUTE_APPROVED_ACTIONS":
      return d.approval?.status === "approved"
        ? <>Approved actions recorded in the audit trail · no repository changes are made</>
        : d.approval ? <>Nothing executed: the approval is still pending when the run ends</>
        : <>No actions to execute</>;
    case "UPDATE_MEMORY": {
      const ch = d.memoryChanges;
      if (!ch) return null;
      const n = (t: string) => ch.filter((c) => c.changeType === t).length;
      return <>{n("added")} added · {n("updated")} updated · {n("unchanged")} unchanged</>;
    }
    case "WRITE_ARTIFACTS":
      return <>Readiness report, GitHub issue draft, audit log, memory snapshots and diff</>;
    case "FINALIZE":
      return d.final ? <>Decision: {d.final.decision.toUpperCase()}</> : null;
  }
}

/** Done-labels that depend on what actually happened in the run. */
function doneLabel(state: AgentState, d: DerivedRun): string {
  if (state === "EXECUTE_APPROVED_ACTIONS") {
    if (d.approval?.status === "approved") return "Approved actions recorded";
    return d.approval ? "Nothing executed (pending approval)" : "No actions to execute";
  }
  if (state === "WAIT_FOR_APPROVAL" && d.approval?.status === "approved") return "Approval granted (auto)";
  return STATE_LABEL[state].done;
}

function StageRow({ stage, detail, done }: { stage: Stage; detail: React.ReactNode; done: string }) {
  const [open, setOpen] = useState(false);
  const label = stage.status === "active" ? STATE_LABEL[stage.state].active : done;
  const expandable = stage.status === "done" && detail != null;
  const icon = stage.status === "done" ? "check" : stage.status === "skipped" ? "skip" : "dot";
  const statusText = stage.status === "done" ? "done" : stage.status === "active" ? "in progress" : stage.status === "skipped" ? "skipped" : "pending";

  const inner = (
    <>
      <span className={`stage__icon stage__icon--${stage.status}`} aria-hidden="true">
        {stage.status === "active" ? <span className="stage__pulse" /> : <Icon name={icon} size={12} />}
      </span>
      <span className="stage__label">
        {stage.status === "pending" ? STATE_LABEL[stage.state].done : label}
        <span className="visually-hidden">, {statusText}</span>
      </span>
      <span className="stage__meta mono">
        {stage.durationMs !== null && stage.status === "done" ? formatMs(stage.durationMs) : stage.status === "skipped" ? "skipped" : ""}
      </span>
    </>
  );

  return (
    <li className={`stage stage--${stage.status}`} aria-current={stage.status === "active" ? "step" : undefined}>
      {expandable ? (
        <button type="button" className="stage__row" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {inner}
        </button>
      ) : (
        <div className="stage__row">{inner}</div>
      )}
      {expandable && open && (
        <div className="stage__detail">
          <span className="stage__state mono">{stage.state}</span>
          <span>{detail}</span>
        </div>
      )}
    </li>
  );
}

export function Workflow({ derived, explainSource, fixture, replayed, failed }: Props) {
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    try {
      if (window.matchMedia("(max-width: 1199px)").matches) setExpanded(false);
    } catch { /* ignore */ }
  }, []);

  const byState = new Map(derived.stages.map((s) => [s.state, s]));
  const done = derived.stages.filter((s) => s.status === "done" || s.status === "skipped").length;
  const total = derived.stages.length;
  const complete = derived.final !== null;
  const activeIndex = derived.stages.findIndex((s) => s.status === "active");

  return (
    <section className="card workflow" aria-labelledby="workflow-title">
      <header className="workflow__head">
        <div>
          <h2 id="workflow-title" className="card__title">Agent workflow</h2>
          <p className="card__sub">
            {complete
              ? <>All {total} states completed{derived.elapsedMs !== null ? <> in <span className="num">{formatMs(derived.elapsedMs)}</span></> : null}{replayed ? "" : " · replayed at readable speed"}</>
              : failed ? <>Stopped at step {Math.max(done, 1)} of {total}</>
              : <>Step {activeIndex >= 0 ? activeIndex + 1 : done} of {total} · bounded state machine</>}
          </p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm workflow__toggle" aria-expanded={expanded} aria-controls="workflow-list" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Summary" : `Show all ${total} states`}
        </button>
      </header>

      <div
        className="progress"
        role="progressbar"
        aria-label="Workflow progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${total} states complete`}
      >
        <span className="progress__fill" style={{ width: `${(done / total) * 100}%` }} />
      </div>

      <div id="workflow-list">
        {PHASES.map((phase) => {
          const stages = phase.states.map((s) => byState.get(s)).filter((s): s is Stage => !!s);
          const pDone = stages.filter((s) => s.status === "done" || s.status === "skipped").length;
          const pActive = stages.some((s) => s.status === "active");
          const pStatus = pDone === stages.length ? "done" : pActive ? "active" : "pending";
          return (
            <div key={phase.id} className={`phase phase--${pStatus}`}>
              <h3 className="phase__title">
                <span>{phase.title}</span>
                <span className="phase__count num">{pDone}/{stages.length}</span>
              </h3>
              {expanded && (
                <ol className="stages">
                  {stages.map((s) => (
                    <StageRow key={s.state} stage={s} done={doneLabel(s.state, derived)} detail={stageDetail(s.state, derived, explainSource, fixture)} />
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
