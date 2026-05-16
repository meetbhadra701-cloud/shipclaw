# ShipClaw — Demo QA Tracker

> Live checklist for demo-day readiness. Update after every meaningful validation run.
> Owner: Claude (architect) + Codex (algorithms/tests). User does final manual UI sweep.

---

## Automated Gate Status

| Gate | Command | Status | Last Run |
|---|---|---|---|
| TypeScript typecheck | `npm run typecheck` | ✅ PASS (0 errors) | 2026-05-16 |
| Unit tests | `npm test` | ✅ PASS (6/6) | 2026-05-16 |
| Smoke test | `npm run smoke` | ✅ PASS (20/20) | 2026-05-16 |
| Demo CLI run | `npm run agent:run -- --demo --auto-approve-local` | ✅ PASS | 2026-05-16 |
| DB migration | `npm run migrate` | ✅ PASS (graceful fallback) | 2026-05-16 |

---

## Artifact Checklist (per demo run)

All 6 artifacts must exist under `runs/<runId>/`:

| Artifact | Required | Status |
|---|---|---|
| `SHIPCLAW_READINESS.md` | ✅ | ✅ Generated |
| `github_issue_draft.md` | ✅ | ✅ Generated |
| `audit.jsonl` | ✅ | ✅ Generated |
| `memory_before.jsonl` | ✅ | ✅ Generated |
| `memory_after.jsonl` | ✅ | ✅ Generated |
| `memory_diff.md` | ✅ | ✅ Generated |

---

## Agent Loop Event Checklist

All 13 event types must be emitted per run:

| Event | Status |
|---|---|
| `goal_received` | ✅ |
| `memory_loaded` | ✅ |
| `plan_created` | ✅ |
| `tool_call_started` | ✅ |
| `tool_call_finished` | ✅ |
| `readiness_score_calculated` | ✅ |
| `risk_fingerprint_created` | ✅ |
| `time_to_ship_estimated` | ✅ |
| `external_evidence_status` | ✅ |
| `approval_requested` | ✅ |
| `approval_resolved` | ✅ |
| `memory_updated` | ✅ |
| `final_result` | ✅ |

---

## Manual UI Sweep (requires `npm run dev` + browser)

Run `npm run dev` → open http://localhost:5173. Check each item:

| Panel | Check | Status |
|---|---|---|
| **Goal panel** | Form renders, repo + goal inputs work, demo mode checkbox | ⬜ Needs user sweep |
| **Plan panel** | 10 steps listed after run starts | ⬜ Needs user sweep |
| **Agent Activity** | Live events stream in timeline, auto-scrolls | ⬜ Needs user sweep |
| **Readiness Score** | Score number + band badge + progress bar visible | ⬜ Needs user sweep |
| **Risk Fingerprint** | Severity table with signal/detail/memory columns | ⬜ Needs user sweep |
| **Time-to-Ship** | Min–max range + reasons list | ⬜ Needs user sweep |
| **Findings** | Score breakdown table + blockers + recommended actions | ⬜ Needs user sweep |
| **Approval panel** | Appears when approval pending, approve/reject buttons work | ⬜ Needs user sweep |
| **Live Report Preview** | react-markdown renders SHIPCLAW_READINESS.md including tables | ⬜ Needs user sweep |
| **Final Decision** | SHIP or HOLD badge visible after run completes | ⬜ Needs user sweep |
| **Memory** | Cross-run key/value items listed | ⬜ Needs user sweep |
| **Audit Log** | Per-run audit entries visible | ⬜ Needs user sweep |
| **External Evidence** | Panel absent when Exa disabled (correct) | ⬜ Needs user sweep |

### Mode Banner checks

| Check | Status |
|---|---|
| Fallback banner (dark red sticky bar) appears in fallback mode | ⬜ Needs user sweep |
| Demo banner (dark blue sticky bar) appears in demo mode | ⬜ Needs user sweep |
| No banner in live mode | ⬜ Needs user sweep |

### Accessibility checks (WCAG AA)

| Check | Status |
|---|---|
| Skip link appears on Tab from fresh page load | ⬜ Needs user sweep |
| All form inputs have visible labels | ⬜ Needs user sweep |
| Score band colours readable (not just colour — text label shown) | ⬜ Needs user sweep |
| Approval panel receives focus automatically when it appears | ⬜ Needs user sweep |
| Tab through all interactive elements without mouse | ⬜ Needs user sweep |
| Focus ring visible on all interactive elements | ⬜ Needs user sweep |

---

## Non-Negotiables from Manual (verify before demo)

| Rule | Verified |
|---|---|
| Nemotron does NOT invent or override the numeric score | ✅ (score set at CALCULATE_SCORE state, Nemotron called later) |
| Score is deterministic — same inputs = same output | ✅ (scorer.test.ts confirms) |
| Fallback mode clearly labeled in UI and report | ✅ (mode banner + FALLBACK_BANNER constant in report) |
| Risky writes require approval before executing | ✅ (approval gate in PROPOSE_ACTIONS state) |
| Exa disabled by default | ✅ (`EXA_ENABLED=false` in .env.example) |
| Reconstruct excluded | ✅ (no dependency, documented in README) |
| Secrets never in repo/logs/reports | ✅ (.gitignore + .env.local user-managed) |
| Memory visible (3 artifact files) | ✅ (memory_before/after/diff per run) |

---

## Known Issues / Blockers

| Issue | Severity | Owner | Status |
|---|---|---|---|
| `better-sqlite3` fails to compile on Node 24 | Medium | Codex (X-001) | InMemoryDb fallback active — no data lost, no persistence across restarts |
| No real GitHub/repo tool (live mode) | Medium | Codex (X-005) | Demo mode uses fixture data |
| No unit tests for riskFingerprint, timeToShip, assessor | Low | Codex (X-006) | Smoke test covers end-to-end |
| UI panels not extracted into separate component files | Low | Codex (X-007) | App.tsx inline — functional, not blocking |

---

## Demo Reset Procedure

Before each demo run:

```bash
# Reset in-memory state (server restart clears InMemoryDb)
# Kill server if running: Ctrl+C

# Remove previous run artifacts
rm -rf runs/*

# Start fresh
npm run dev
# Open http://localhost:5173
# Check demo mode checkbox → enter any GitHub URL → Run Analysis
```

---

## Demo Day Command Reference

```bash
# Full automated gates (run before demo)
npm run typecheck && npm test && npm run smoke

# Demo CLI run (terminal-only demo)
DEMO_MODE=true ALLOW_LLM_FALLBACK=true \
  npm run agent:run -- \
  --repo fixtures/demo \
  --goal "Check release readiness for v1.0" \
  --demo \
  --auto-approve-local

# Full dashboard demo
npm run dev
# → http://localhost:5173

# Inspect artifacts after a run
cat runs/*/SHIPCLAW_READINESS.md
cat runs/*/memory_diff.md
cat runs/*/github_issue_draft.md
```

---

*Last updated: 2026-05-16 by Claude (Senior Architect + Integrator)*
