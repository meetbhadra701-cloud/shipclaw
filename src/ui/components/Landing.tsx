import React, { useState } from "react";
import { SCORE_WEIGHTS, SHIP_THRESHOLD } from "../../shared/heuristics.js";
import { CATEGORY_CHECKS, categoryLabel, formatTime, shortRepo } from "../lib/format.js";
import type { Health, RunSummary } from "../lib/useRun.js";
import { Icon } from "./Icon.js";

const SAMPLE_REPO = "https://github.com/acme/payments-api";
const DEFAULT_GOAL = "Prepare the next production release";

interface Props {
  busy: boolean;
  error: string | null;
  health: Health | null;
  history: RunSummary[];
  onAnalyze: (repo: string, goal: string, demo?: boolean) => void;
  onOpen: (run: RunSummary) => void;
}

const STEPS: Array<{ title: string; body: string }> = [
  { title: "Collect evidence", body: "Repository metadata, a pinned file tree and GitHub Actions results become typed observations." },
  { title: "Score with fixed rules", body: "Six weighted categories produce a 0–100 score. No model is involved in this step." },
  { title: "Quantify the risk", body: "Measured weaknesses become ranked risks. Unknown evidence stays unknown; effort estimates are illustrative." },
  { title: "Explain, bounded", body: "Nemotron explains the finished score. If its verdict disagrees with the threshold, the code overrides it." },
  { title: "Stay in control", body: "Review proposed actions and record your decision. Analysis is read-only; no proposal is executed." },
];

export function Landing({ busy, error, health, history, onAnalyze, onOpen }: Props) {
  const [repo, setRepo] = useState("");
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [demo, setDemo] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = repo.trim();
    if (!r || busy) return;
    onAnalyze(r, goal.trim() || DEFAULT_GOAL, demo);
  };

  return (
    <div className="landing">
      <section className="landing__hero" aria-labelledby="landing-title">
        <p className="eyebrow">Release readiness agent</p>
        <h1 id="landing-title" className="landing__title">Is this repo ready to ship?</h1>
        <p className="landing__lede">
          ShipClaw collects release evidence, scores it with fixed rules, estimates the work left,
          and optionally uses Nemotron to explain the result without changing the score.
        </p>

        <form className="analyze" onSubmit={submit} noValidate aria-describedby="fixture-note">
          <label htmlFor="repo-input" className="analyze__label">GitHub repository</label>
          <div className="analyze__row">
            <input
              id="repo-input"
              className="input input--lg"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://github.com/owner/repo"
              value={repo}
              onChange={(e) => { setRepo(e.target.value); setDemo(false); }}
              aria-invalid={error ? true : undefined}
              aria-errormessage={error ? "analyze-error" : undefined}
              disabled={busy}
            />
            <button type="submit" className="btn btn--primary btn--lg" disabled={busy || !repo.trim()} aria-busy={busy}>
              {busy ? <span className="spinner" aria-hidden="true" /> : null}
              {busy ? "Starting…" : "Analyze release"}
            </button>
          </div>
          <div className="analyze__meta">
            <label htmlFor="goal-input" className="analyze__goal-label">Release goal</label>
            <input
              id="goal-input"
              className="input input--sm"
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={busy}
            />
            <button type="button" className="link-btn" onClick={() => { setRepo(SAMPLE_REPO); setDemo(true); }} disabled={busy}>
              Use sample (no network)
            </button>
          </div>
          {error && (
            <p id="analyze-error" className="form-error" role="alert">
              <Icon name="alert" size={14} /> Could not start the analysis: {error}
            </p>
          )}
          {(
            <p id="fixture-note" className="fixture-note">
              <span className="chip chip--fixture">{demo ? "Sample evidence" : "Read-only GitHub"}</span>
              {demo ? "Built-in synthetic snapshot; no GitHub or model requests. Edit the URL to return to real analysis." : "Public repositories, no token required where GitHub permits. No cloning, package installation, or code execution. Missing evidence stays unknown."}
            </p>
          )}
        </form>
      </section>

      <section className="landing__section" aria-labelledby="checks-title">
        <h2 id="checks-title" className="section-title">What ShipClaw checks</h2>
        <ul className="checks">
          {(Object.keys(SCORE_WEIGHTS) as Array<keyof typeof SCORE_WEIGHTS>).map((key) => (
            <li key={key} className="checks__item">
              <span className="checks__name">{categoryLabel(key)}</span>
              <span className="checks__weight">{Math.round(SCORE_WEIGHTS[key] * 100)}%</span>
              <span className="checks__desc">{CATEGORY_CHECKS[key]}</span>
            </li>
          ))}
        </ul>
        <p className="section-note">
          Fixed category weights. Unknown categories earn no points and remain unmeasured. SHIP requires {SHIP_THRESHOLD}+ and all categories measured; a file-presence score is not a release certification.
        </p>
      </section>

      <section className="landing__section" aria-labelledby="how-title">
        <h2 id="how-title" className="section-title">How a verdict is made</h2>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="steps__item">
              <span className="steps__num" aria-hidden="true">{i + 1}</span>
              <div>
                <h3 className="steps__title">{s.title}</h3>
                <p className="steps__body">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {history.length > 0 && (
        <section className="landing__section" aria-labelledby="recent-title">
          <h2 id="recent-title" className="section-title">Recent analyses</h2>
          <ul className="history">
            {history.slice(0, 5).map((run) => (
              <li key={run.id}>
                <button type="button" className="history__row" onClick={() => onOpen(run)}>
                  <span className="history__repo mono">{shortRepo(run.repo)}</span>
                  <span className={`history__verdict tone-${run.decision === "ship" ? "ready" : run.band === "NOT_READY" ? "not-ready" : run.decision ? "risky" : "neutral"}`}>
                    {run.decision ? run.decision.toUpperCase() : run.status}
                  </span>
                  <span className="history__score num">{run.score ?? "—"}<span className="muted">/100</span></span>
                  <span className="history__time muted">{formatTime(run.startedAt)}</span>
                  <Icon name="chevron" size={14} className="history__chev" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
