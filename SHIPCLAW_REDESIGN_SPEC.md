# ShipClaw — Redesign Specification

## 1. Positioning

**Know if your repo is actually ready to ship.** ShipClaw is a release command center. It gives
a verdict, proves why, and lays out a controlled path to fix what blocks the release.

Primary audience for this build: a standalone developer product / portfolio piece. NVIDIA
Nemotron is credited where it is used (the explanation layer and system info), not used as brand
color.

## 2. User journey (≈ 60–90 s demo)

1. **Land.** Headline question, one repository input, one button. Below: what ShipClaw checks
   (6 weighted categories) and how a verdict is made (5 steps).
2. **Analyze.** The page switches to the run view. The *agent workflow* (17 states, grouped into
   5 phases) fills in from the SSE stream. The verdict area shows what is pending.
3. **Verdict.** HOLD / SHIP, score /100 on a band scale, time to ship, and the top blockers, all
   inside the first laptop viewport.
4. **Why.** Per-category bars (score, weight, points contributed, pass threshold) plus the
   explanation, labelled with its true source (Nemotron or template).
5. **Trust.** Five run-specific facts: deterministic score, bounded AI, approval, memory, audit.
6. **Act.** Proposed actions await approval; the decision is recorded in the audit trail.
7. **Inspect.** Tabs: Evidence · Risk fingerprint · Report · Memory & history · Audit trail ·
   How it works.

## 3. Information hierarchy

| Level | Content | Placement |
|---|---|---|
| L1 | Verdict, score, time to ship, top blockers | Verdict card, first viewport |
| L2 | Score drivers + explanation; agent workflow | "Why" section; sticky side rail (desktop) |
| L3 | Trust facts; proposed actions + approval | Below "Why" |
| L4 | Evidence, fingerprint, report, memory, audit, architecture | Tabbed detail panel |

## 4. Layout

```
┌ Top bar: mark · ShipClaw · evidence-source chip · theme ───────────────┐
│ Run header: repo (h1) · goal · run id · [New analysis]                 │
├──────────────────────────────────────────────┬─────────────────────────┤
│ VERDICT CARD                                 │ AGENT WORKFLOW (sticky)  │
│  HOLD │ 55/100 + band scale │ ~1h45m–2h38m   │  5 phases / 17 states    │
│  Fix first: 1..3 blockers                    │  durations, expandable   │
│ WHY: category bars + explanation (+source)   │  "completed in 41 ms"    │
│ TRUST: 5 facts                               │                          │
│ ACTIONS: proposed + approve / reject         │                          │
│ DETAILS: tabs                                │                          │
└──────────────────────────────────────────────┴─────────────────────────┘
```

- **≥ 1200 px:** two columns, 1fr + 360 px rail; the rail is sticky.
- **760–1199 px:** single column; the workflow sits after the verdict card, collapsed to a phase summary.
- **< 760 px:** single column, compact verdict (verdict + score on one row), the workflow
  collapsed behind a disclosure, and scrollable tabs.

## 5. Component architecture (`src/ui/`)

| File | Responsibility |
|---|---|
| `App.tsx` | Shell, view switching (landing ↔ run), announcements |
| `lib/useRun.ts` | Start run, SSE, paced replay queue, post-run fetches, history |
| `lib/derive.ts` | Pure `deriveRun(events)` → score, fingerprint, stages, … (unit-tested) |
| `lib/format.ts` | Labels, durations, evidence parsing, fix hints |
| `components/Brand.tsx` | Mark + wordmark |
| `components/Landing.tsx` | Hero question, analyze form, what-we-check, how-it-works |
| `components/VerdictCard.tsx` | Verdict, score scale, time to ship, fix-first list |
| `components/ScoreDrivers.tsx` | Per-category bars + explanation with source |
| `components/Workflow.tsx` | 17-state timeline grouped in phases |
| `components/TrustFacts.tsx` | Run-specific trust facts |
| `components/ActionsPanel.tsx` | Proposed actions + approval |
| `components/DetailTabs.tsx` | Accessible tabs container |
| `components/details/*.tsx` | Evidence, Risks, Report, Memory, Audit, System |
| `components/ThemeToggle.tsx` | Kept, restyled |

Removed: `GlassHeroBackground`, `HexagonLoadingOverlay` (decorative; the overlay hid the agent's work).

## 6. Backend additions (backwards compatible)

- A `state_entered` event per loop state, which gives exact per-state timing in the workflow and audit.
- `LoopConfig.runId?`: the server pre-assigns the ID (fixes a concurrency race).
- `GET /api/runs` (recent run summaries), `GET /api/reports/:runId/files/:name` (allowlisted artifacts).
- `/api/health` adds `model`, `llm` (`configured` / `fallback`), `exa`, `evidenceSource`.
- Approve/reject write audit rows; a failed loop marks the run `error`.
- Shell allowlist exact-match fix.

## 7. Visual system

- Neutral graphite surfaces (dark default) and a paper-white light theme. One accent (signal
  blue) for primary actions and focus. Semantic colors only for state: green = ship/pass,
  amber = risky, red = not ready/fail, gray = no evidence/pending.
- **The verdict color follows the band** (RISKY HOLD = amber; NOT_READY HOLD = red).
- Type: system UI stack; tabular numerals for all numbers; monospace only for identifiers
  (repo, run ID, state names).
- 4 px spacing grid, 8 px radii, 1 px borders, no glass, no glow, no background animation.
- Brand mark: a rounded square holding a hull line and a release check ("ship + verified"), in
  the accent color. It replaces the flat "SC" text monogram.

## 8. States

| State | Behaviour |
|---|---|
| Empty | Landing page with a working form; the example repo can be filled in with one click |
| Starting | Button busy; the view switches when the run ID returns |
| Running | Workflow states tick in; the verdict card shows the stage in progress; the score appears when computed |
| Complete | Everything populated; focus moves to the run heading; screen-reader summary announced |
| Error (start) | Inline alert under the form with the server message |
| Error (run/stream) | Alert in the verdict card + "Retry stream" / "New analysis" |
| No assessor | Explanation area says the assessor was unavailable and why the verdict still stands |

## 9. Accessibility

Skip link; one `h1` per view; landmarks (`header`, `main`, `aside`, `nav` for tabs);
WAI-ARIA tabs with arrow/Home/End keys; workflow as an `ol` with `aria-current="step"`;
category bars with text values (never color only); pass/fail spelled out; polite live region
for progress; no focus stealing for approval; visible `:focus-visible` ring; contrast ≥ 4.5:1
for text in both themes; `prefers-reduced-motion` disables replay pacing, the count-up and
transitions.

## 10. Copy rules

Primary copy uses plain outcomes ("Risks identified", "Explanation generated"). Internal names
(`BUILD_RISK_FINGERPRINT · 2 ms`) appear as secondary mono text. There are no claims the current
run cannot back up.
