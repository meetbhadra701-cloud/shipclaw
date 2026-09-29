import React from "react";
import { SHIP_THRESHOLD } from "../../shared/heuristics.js";
import type { DerivedRun } from "../lib/derive.js";
import type { ExplainSource } from "./ScoreDrivers.js";
import { Icon } from "./Icon.js";

interface Props {
  derived: DerivedRun;
  explainSource: ExplainSource;
  eventCount: number;
  artifactCount: number;
  onOpenTab: (tab: string) => void;
}

/** Five facts about *this* run that a skeptical engineer can verify in the detail tabs. */
export function TrustFacts({ derived, explainSource, eventCount, artifactCount, onOpenTab }: Props) {
  const signals = derived.score?.categories.reduce((n, c) => n + c.evidence.length, 0) ?? 0;
  const actions = derived.approval?.actionDescription.split(" | ").length ?? 0;
  const totalRuns = derived.memoryChanges?.find((c) => c.key === "meta:totalRuns")?.after ?? null;
  const changed = derived.memoryChanges?.filter((c) => c.changeType === "added" || c.changeType === "updated").length ?? 0;

  const facts: Array<{ icon: Parameters<typeof Icon>[0]["name"]; title: string; body: React.ReactNode; tab: string; tabLabel: string }> = [
    {
      icon: "list",
      title: "Deterministic score",
      body: <>Scored from {signals} evidence lines by fixed, weighted rules before any model call. Same evidence, same score.</>,
      tab: "evidence",
      tabLabel: "Evidence",
    },
    {
      icon: "cpu",
      title: "Bounded AI",
      body: explainSource === "nemotron"
        ? <>Nemotron explained the finished score. A verdict that disagrees with the {SHIP_THRESHOLD}-point threshold is overridden in code.</>
        : explainSource === "template"
          ? <>Nemotron was not called for this run, so the explanation is templated. The verdict would be identical either way: it comes from the threshold.</>
          : <>The explanation step returned nothing (see the audit trail). The verdict does not depend on it: it comes from the {SHIP_THRESHOLD}-point threshold.</>,
      tab: "system",
      tabLabel: "How it works",
    },
    {
      icon: "user-check",
      title: "Human approval",
      body: actions > 0
        ? <>{actions} proposed action{actions === 1 ? "" : "s"} held for your decision. ShipClaw never modifies your repository.</>
        : <>No actions proposed. ShipClaw never modifies your repository.</>,
      tab: "audit",
      tabLabel: "Audit trail",
    },
    {
      icon: "database",
      title: "Persistent memory",
      body: totalRuns
        ? <>Run {totalRuns} in ShipClaw's memory; {changed} key{changed === 1 ? "" : "s"} written this run, with before/after snapshots.</>
        : <>Before/after memory snapshots are captured on every run.</>,
      tab: "memory",
      tabLabel: "Memory",
    },
    {
      icon: "file",
      title: "Auditable",
      body: <>{eventCount} events streamed and stored{artifactCount > 0 ? <>; {artifactCount} artifacts written to disk</> : null}.</>,
      tab: "audit",
      tabLabel: "Audit trail",
    },
  ];

  return (
    <section className="trust" aria-labelledby="trust-title">
      <h2 id="trust-title" className="section-title">Why you can trust this verdict</h2>
      <ul className="trust__list">
        {facts.map((f) => (
          <li key={f.title} className="trust__item">
            <span className="trust__icon" aria-hidden="true"><Icon name={f.icon} size={16} /></span>
            <h3 className="trust__title">{f.title}</h3>
            <p className="trust__body">{f.body}</p>
            <button type="button" className="link-btn link-btn--sm trust__link" onClick={() => onOpenTab(f.tab)}>
              {f.tabLabel} <Icon name="arrow-right" size={12} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
