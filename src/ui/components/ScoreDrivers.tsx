import React from "react";
import type { AssessorOutput, ReadinessScore } from "../../shared/types.js";
import { CATEGORY_PASS_THRESHOLD, SHIP_THRESHOLD } from "../../shared/heuristics.js";
import { categoryLabel, describeEvidence, parseEvidence } from "../lib/format.js";
import { Icon } from "./Icon.js";

export type ExplainSource = "nemotron" | "template" | "none";

export function explainSourceOf(output: AssessorOutput | null | undefined): ExplainSource {
  if (!output) return "none";
  return output.source === "deterministic_fallback" || output.mode === "fallback" ? "template" : "nemotron";
}

function categoryStatus(c: ReadinessScore["categories"][number]): "pass" | "fail" | "default" {
  const noEvidence = c.evidence.length > 0 && c.evidence.every((e) => parseEvidence(e).kind === "default");
  if (c.measurement === "unknown" || noEvidence) return "default";
  return c.pass ? "pass" : "fail";
}

const STATUS_TEXT = { pass: "Pass", fail: "Below bar", default: "Unknown" } as const;

interface Props {
  score: ReadinessScore;
  decision: string | null;
  assessor: AssessorOutput | null;
  assessorDone: boolean;
  model: string | undefined;
}

export function ScoreDrivers({ score, decision, assessor, assessorDone, model }: Props) {
  const rows = score.categories
    .map((c) => ({ c, lost: c.weight * (100 - c.rawScore), status: categoryStatus(c) }))
    .sort((a, b) => b.lost - a.lost);
  const lostTotal = 100 - score.total;
  const top = rows.filter((r) => r.status !== "default" && r.lost >= 0.5).slice(0, 2);
  const source = explainSourceOf(assessor);

  return (
    <section className="card" aria-labelledby="why-title">
      <header className="card__head">
        <h2 id="why-title" className="card__title">
          {decision ? `Why ShipClaw says ${decision.toUpperCase()}` : "What drives this score"}
        </h2>
        <p className="card__sub">
          {score.total} of 100 evidence points earned. {Math.round((score.evidenceCoverage ?? 1) * 100)}% of category weight measured. Unknown weight earns no points; it is not a failed measurement. Possible score: {score.total}–{score.possibleTotal ?? score.total}.
          {top.length > 0 && (
            <> Biggest losses: {top.map((r, i) => (
              <span key={r.c.name}>{i > 0 ? ", " : ""}{categoryLabel(r.c.name)} <span className="num">−{r.lost.toFixed(1)}</span></span>
            ))}.</>
          )}
        </p>
      </header>

      {/* Weighted composition: each segment = one category, width = weight, fill = score. */}
      <figure className="composition">
        <div className="composition__bar" aria-hidden="true">
          {score.categories.map((c) => (
            <span key={c.name} className={`composition__seg composition__seg--${categoryStatus(c)}`} style={{ flexGrow: c.weight }}>
              <span className="composition__fill" style={{ height: `${c.rawScore}%` }} />
              <span className="composition__name">{categoryLabel(c.name)}</span>
            </span>
          ))}
        </div>
        <figcaption className="composition__cap">
          Each column is a category sized by its weight; the filled part is what it earned. Filled area = {score.total}/100.
        </figcaption>
      </figure>

      <table className="drivers">
        <caption className="visually-hidden">
          Category scores, weights and points lost, sorted by points lost. Categories pass at {CATEGORY_PASS_THRESHOLD}.
        </caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col" className="drivers__bar-col">Score <span className="muted">(pass at {CATEGORY_PASS_THRESHOLD})</span></th>
            <th scope="col" className="num-col">Weight</th>
            <th scope="col" className="num-col">Unawarded</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ c, lost, status }) => {
            const why = c.evidence.map(parseEvidence).find((e) => e.kind === "default" || e.score < CATEGORY_PASS_THRESHOLD) ?? parseEvidence(c.evidence[0] ?? "");
            return (
              <tr key={c.name}>
                <th scope="row">
                  <span className="drivers__name">{categoryLabel(c.name)}</span>
                  <span className="drivers__why">{status === "default" ? "Unmeasured — inspect the evidence below" : describeEvidence(why)}</span>
                </th>
                <td className="drivers__bar-col">
                  <div className="meter-wrap">
                    <div className="meter" aria-hidden="true">
                      <span className={`meter__fill meter__fill--${status}`} style={{ width: `${c.rawScore}%` }} />
                      <span className="meter__tick" style={{ left: `${CATEGORY_PASS_THRESHOLD}%` }} />
                    </div>
                    <span className="meter__value num">{status === "default" ? "—" : c.rawScore}</span>
                  </div>
                </td>
                <td className="num-col num">{Math.round(c.weight * 100)}%</td>
                <td className="num-col num">{status === "default" ? "unknown" : lost > 0 ? `−${lost.toFixed(1)}` : "0"}</td>
                <td>
                  <span className={`status status--${status}`}>
                    <Icon name={status === "pass" ? "check" : status === "fail" ? "x" : "skip"} size={12} />
                    {STATUS_TEXT[status]}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td className="drivers__bar-col muted">Weighted sum, rounded</td>
            <td className="num-col num">100%</td>
            <td className="num-col num">−{lostTotal}</td>
            <td className="num">{score.total}/100</td>
          </tr>
        </tfoot>
      </table>

      <div className={`explain explain--${source}`}>
        <div className="explain__head">
          <h3 className="kicker">Explanation</h3>
          <span className="explain__source">
            {source === "nemotron" && <>Live Nemotron response · <span className="mono">{assessor?.model ?? model ?? ""}</span> from the score above</>}
            {source === "template" && <>Deterministic template · {assessor?.fallbackReason === "request_failed" ? "model request failed" : assessor?.fallbackReason === "demo" ? "sample mode; no model call" : "model not configured"}</>}
            {source === "none" && (assessorDone ? <>Unavailable — the explanation step returned no result</> : <>Pending</>)}
          </span>
        </div>
        {assessor ? (
          <>
            <p className="explain__text">{assessor.explanation}</p>
            {source === "nemotron" && assessor.confidence !== null && (
              <p className="explain__meta">Model-reported confidence (not calibrated) {Math.round(assessor.confidence * 100)}% · the model cannot change the score or the verdict.</p>
            )}
            {assessor.uncertaintyNotes.length > 0 && (
              <ul className="explain__notes">
                {assessor.uncertaintyNotes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            )}
          </>
        ) : assessorDone ? (
          <p className="explain__text muted">
            The verdict above still stands: it requires {SHIP_THRESHOLD} points and all categories measured on the deterministic score, not from a model.
          </p>
        ) : null}
      </div>
    </section>
  );
}
