import React, { useRef } from "react";

export interface TabDef {
  id: string;
  label: string;
  count?: number | null;
  render: () => React.ReactNode;
}

interface Props {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}

/** WAI-ARIA tabs: arrow keys move between tabs, Home/End jump, Tab moves into the panel. */
export function DetailTabs({ tabs, active, onChange }: Props) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    const t = tabs[next];
    if (t) {
      onChange(t.id);
      refs.current[t.id]?.focus();
    }
  };

  return (
    <section className="card details" aria-labelledby="details-title" id="details">
      <h2 id="details-title" className="visually-hidden">Run details</h2>
      <div className="tabs" role="tablist" aria-label="Run details">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => { refs.current[t.id] = el; }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={t.id === current?.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={t.id === current?.id ? 0 : -1}
            className="tabs__tab"
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.label}
            {t.count != null && <span className="tabs__count num">{t.count}</span>}
          </button>
        ))}
      </div>
      {current && (
        <div
          role="tabpanel"
          id={`panel-${current.id}`}
          aria-labelledby={`tab-${current.id}`}
          tabIndex={0}
          className="tabs__panel"
        >
          {current.render()}
        </div>
      )}
    </section>
  );
}
