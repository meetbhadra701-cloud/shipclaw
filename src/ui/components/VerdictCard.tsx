import React, { useEffect, useState } from "react";
import type { ReadinessScore, RiskItem } from "../../shared/types.js";
import {
  MINUTES_PER_CRITICAL_BLOCKER,
  MINUTES_PER_HIGH_BLOCKER,
  MINUTES_PER_MEDIUM_BLOCKER,
  SCORE_BAND_THRESHOLDS,
  SHIP_THRESHOLD,
  TIME_BUFFER_MULTIPLIER,
} from "../../shared/heuristics.js";
import type { DerivedRun } from "../lib/derive.js";
import { STATE_LABEL } from "../lib/derive.js";
import {
  BAND_LABEL,
  bandTone,
  categoryLabel,
  describeEvidence,
  fixHint,
  formatMinutes,
  weakEvidence,
} from "../lib/format.js";
import { Icon } from "./Icon.js";

const SEVERITY_ORDER: Record<RiskItem["severity"], number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_MINUTES: Record<RiskItem["severity"], number> = {
  critical: MINUTES_PER_CRITICAL_BLOCKER,
  high: MINUTES_PER_HIGH_BLOCKER,
  medium: MINUTES_PER_MEDIUM_BLOCKER,
  low: 0,
};

function useCountUp(target: number | null, enabled: boolean): number | null {
  const [value, setValue] = useState<number | null>(target);
  useEffect(() => {
    if (target === null) { setValue(null); return; }
    let reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* ignore */ }
    if (!enabled || reduce) { setValue(target); return; }
    const start = performance.now();
    const dur = 700;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled]);
  return value;
}

export interface Blocker {
  item: RiskItem;
  score: number | null;
  evidence: string;
  signal: string | null;
  minutes: number;
}

export function rankBlockers(score: ReadinessScore | null, items: RiskItem[]): Blocker[] {
  return items
    .map((item) => {
      const cat = score?.categories.find((c) => c.name === item.signal);
      const weak = cat ? weakEvidence(cat.evidence)[0] : undefined;
      return {
        item,
        score: cat?.rawScore ?? null,
        evidence: weak ? describeEvidence(weak) : item.detail,
        signal: weak && weak.kind === "observation" ? weak.signal : null,
        minutes: SEVERITY_MINUTES[item.severity],
      };
    })
    // Most severe first; at equal severity, measured failures before "no evidence" defaults.
    .sort((a, b) =>
      SEVERITY_ORDER[a.item.severity] - SEVERITY_ORDER[b.item.severity] ||
      Number(a.signal === null) - Number(b.signal === null) ||
      (a.score ?? 0) - (b.score ?? 0));
}

function ScoreScale({ total }: { total: number }) {
  const { NOT_READY, RISKY } = SCORE_BAND_THRESHOLDS;
  return (
    <div className="scale" aria-hidden="true">
      <div className="scale__track">
        <span className="scale__seg scale__seg--not-ready" style={{ width: `${NOT_READY.max}%` }} />
        <span className="scale__seg scale__seg--risky" style={{ width: `${RISKY.max - NOT_READY.max}%` }} />
        <span className="scale__seg scale__seg--ready" style={{ width: `${100 - RISKY.max}%` }} />
        <span className="scale__marker" style={{ left: `${total}%` }} />
      </div>
      <div className="scale__labels">
        <span style={{ left: "0%" }}>0</span>
        <span style={{ left: `${NOT_READY.max}%` }}>{NOT_READY.max}</span>
        <span style={{ left: `${SHIP_THRESHOLD}%` }}>{SHIP_THRESHOLD}</span>
        <span style={{ left: "100%" }}>100</span>
      </div>
    </div>
  );
}

interface Props {
  derived: DerivedRun;
  running: boolean;
  animate: boolean;
  onShowRisks: () => void;
}

export function VerdictCard({ derived, running, animate, onShowRisks }: Props) {
  const { score, timeToShip, fingerprint, final, activeState } = derived;
  const shown = useCountUp(score?.total ?? null, animate);
  const tone = bandTone(score?.band);
  const decision = final?.decision ?? null;
  const blockers = score && fingerprint ? rankBlockers(score, fingerprint.items) : [];
  const pendingLabel = activeState ? STATE_LABEL[activeState].active : "Starting agent";
  const shortfall = score ? SHIP_THRESHOLD - score.total : 0;

  return (
    <section className={`verdict tone-${decision ? tone : "neutral"}`} aria-labelledby="verdict-title">
      <div className="verdict__grid">
        {/* Decision */}
        <div className="verdict__cell verdict__cell--decision">
          <h2 id="verdict-title" className="kicker">Release verdict</h2>
          {decision ? (
            <>
              <p className="verdict__word">
                <span className="verdict__icon" aria-hidden="true">
                  <Icon name={decision === "ship" ? "check" : "pause"} size={30} />
                </span>
                {decision === "ship" ? "SHIP" : decision === "hold" ? "HOLD" : "UNKNOWN"}
              </p>
              <p className="verdict__sub">
                {decision === "ship"
                  ? `Score clears the ${SHIP_THRESHOLD}-point release bar.`
                  : `${shortfall} point${shortfall === 1 ? "" : "s"} below the ${SHIP_THRESHOLD}-point release bar.`}
              </p>
            </>
          ) : (
            <div className="verdict__pending" aria-live="off">
              <span className="spinner" aria-hidden="true" />
              <span>{running ? `${pendingLabel}…` : "No verdict"}</span>
            </div>
          )}
        </div>

        {/* Score */}
        <div className="verdict__cell">
          <h3 className="kicker">Readiness score</h3>
          {score ? (
            <>
              <p className="verdict__score">
                <span className="num tone-text" aria-hidden="true">{shown ?? score.total}</span>
                <span className="verdict__of" aria-hidden="true">/100</span>
                <span className="visually-hidden">{score.total} out of 100</span>
                <span className="badge tone-bg">{BAND_LABEL[score.band]}</span>
              </p>
              <ScoreScale total={score.total} />
              <p className="verdict__foot">Deterministic · computed before any model call</p>
            </>
          ) : (
            <Skeleton label="Waiting for evidence" />
          )}
        </div>

        {/* Time to ship */}
        <div className="verdict__cell">
          <h3 className="kicker">Time to ship</h3>
          {timeToShip ? (
            <>
              <p className="verdict__eta num">
                <span className="nowrap">{formatMinutes(timeToShip.minMinutes)}</span>
                <span className="verdict__eta-sep"> – </span>
                <span className="nowrap">{formatMinutes(timeToShip.maxMinutes)}</span>
              </p>
              <p className="verdict__foot">
                Estimated remediation ·{" "}
                {blockers.length > 0
                  ? (["critical", "high", "medium"] as const)
                      .map((sev) => ({ sev, n: blockers.filter((b) => b.item.severity === sev).length }))
                      .filter((x) => x.n > 0)
                      .map((x) => `${x.n} ${x.sev} × ${formatMinutes(SEVERITY_MINUTES[x.sev])}`)
                      .join(" + ") + `, ×${TIME_BUFFER_MULTIPLIER} buffer`
                  : timeToShip.reasons[0]}
              </p>
            </>
          ) : (
            <Skeleton label="Waiting for risk analysis" />
          )}
        </div>
      </div>

      {/* Fix first */}
      {fingerprint && (
        <div className="fixfirst">
          <div className="fixfirst__head">
            <h3 className="kicker">{blockers.length > 0 ? "Fix first" : "Blockers"}</h3>
            {blockers.length > 3 && (
              <button type="button" className="link-btn" onClick={onShowRisks}>
                All {blockers.length} risks <Icon name="arrow-right" size={13} />
              </button>
            )}
          </div>
          {blockers.length === 0 ? (
            <p className="muted">No failing categories. Review the evidence before shipping.</p>
          ) : (
            <ol className="fixfirst__list">
              {blockers.slice(0, 3).map((b) => (
                <li key={b.item.signal} className="fixfirst__item">
                  <span className={`sev sev--${b.item.severity}`}>{b.item.severity}</span>
                  <div className="fixfirst__body">
                    <p className="fixfirst__title">
                      {categoryLabel(b.item.signal)}
                      {b.score !== null && <span className="fixfirst__score num"> · {b.score}/100</span>}
                    </p>
                    <p className="fixfirst__why">{b.evidence}</p>
                  </div>
                  <div className="fixfirst__fix">
                    <span>{fixHint(b.signal)}</span>
                    {b.minutes > 0 && <span className="fixfirst__mins num">~{formatMinutes(b.minutes)}</span>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

function Skeleton({ label }: { label: string }) {
  return (
    <div className="skeleton" role="presentation">
      <span className="skeleton__bar" />
      <span className="skeleton__label">{label}</span>
    </div>
  );
}
