import React, { useState } from "react";
import type { Approval, AssessorOutput } from "../../shared/types.js";
import { CATEGORY_LABEL } from "../lib/format.js";
import { Icon } from "./Icon.js";

/** Replace raw category keys (e.g. "ci_health") with their display names. */
function humanizeAction(text: string): string {
  return Object.entries(CATEGORY_LABEL).reduce((t, [key, label]) => t.split(key).join(label), text);
}

interface Props {
  approval: Approval | null;
  decision: Approval | null;
  assessor: AssessorOutput | null;
  onResolve: (approval: Approval, action: "approve" | "reject") => Promise<Approval>;
  announce: (msg: string) => void;
}

export function ActionsPanel({ approval, decision, assessor, onResolve, announce }: Props) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!approval) {
    return (
      <section className="card" aria-labelledby="actions-title">
        <header className="card__head">
          <h2 id="actions-title" className="card__title">Proposed actions</h2>
          <p className="card__sub">No actions were proposed for this run, so nothing needs approval.</p>
        </header>
      </section>
    );
  }

  const actions = approval.actionDescription.split(" | ").filter(Boolean);
  const resolved = decision ?? (approval.status !== "pending" ? approval : null);

  const act = async (action: "approve" | "reject") => {
    setBusy(action);
    setError(null);
    try {
      await onResolve(approval, action);
      announce(`Proposed actions ${action === "approve" ? "approved" : "rejected"}. Decision recorded in the audit trail.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={`card actions${resolved ? "" : " actions--pending"}`} aria-labelledby="actions-title">
      <header className="card__head card__head--row">
        <div>
          <h2 id="actions-title" className="card__title">Proposed actions</h2>
          <p className="card__sub">
            {assessor?.mode === "fallback" ? "Generated from failing categories" : "Proposed by the assessor"} · {approval.riskLevel} risk ·
            approval <span className="mono">{approval.id}</span>
          </p>
        </div>
        <span className={`badge ${resolved ? (resolved.status === "approved" ? "badge--ok" : "badge--bad") : "badge--wait"}`}>
          {resolved ? (resolved.status === "approved" ? "Approved" : "Rejected") : "Awaiting approval"}
        </span>
      </header>

      <ol className="actions__list">
        {actions.map((a, i) => <li key={i}>{humanizeAction(a)}</li>)}
      </ol>

      <p className="actions__note">
        <Icon name="shield" size={14} />
        ShipClaw does not change your repository. Your decision is recorded in the audit trail as a human action; the run
        itself has already finished and does not wait on it.
      </p>

      {!resolved ? (
        <div className="actions__buttons">
          <button type="button" className="btn btn--primary" onClick={() => act("approve")} disabled={busy !== null} aria-busy={busy === "approve"}>
            <Icon name="check" size={14} /> Approve
          </button>
          <button type="button" className="btn btn--secondary" onClick={() => act("reject")} disabled={busy !== null} aria-busy={busy === "reject"}>
            <Icon name="x" size={14} /> Reject
          </button>
          {error && <p className="form-error" role="alert">Could not record the decision: {error}</p>}
        </div>
      ) : (
        <p className="actions__resolved" role="status">
          {resolved.status === "approved" ? "Approved" : "Rejected"} by {resolved.resolvedBy ?? "human"}
          {resolved.resolvedAt ? ` at ${new Date(resolved.resolvedAt).toLocaleTimeString()}` : ""} · recorded in the audit trail.
        </p>
      )}
    </section>
  );
}
