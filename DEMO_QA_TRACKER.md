# ShipClaw — Demo QA Tracker

> Owner: Claude (QA Lead, Demo Orchestrator, Senior Integrator)
> Last updated: 2026-05-16 — QA Pass 2 starting (post-Exa + Codex merges)
> **Overall Demo Status: 🔄 IN PROGRESS — QA Pass 2 running**

---

## Overall Summary

| Category | Pass 1 | Pass 2 |
|---|---|---|
| Automated gates | ✅ All green | 🔄 running |
| Artifact generation | ✅ All 6 correct | 🔄 running |
| API endpoints | ✅ All 9 OK | 🔄 running |
| Report content | ✅ 14 sections | 🔄 running |
| Claude-owned bugs fixed | ✅ 4 fixed | 🔄 scanning |
| Codex-assigned issues | ✅ CODEX-001–003 fixed | ✅ X-002 + X-006 merged |
| Exa integration | ⬜ not yet | 🔄 running |
| UI manual sweep | ⬜ browser needed | ⬜ browser needed |
| OpenClaw skill | ✅ present | ⚠️ missing Reconstruct/CoT clauses |
| Memory across runs | ✅ SQLite-backed | 🔄 re-verifying |

---

## QA Pass 2 — Gate Results

| Gate | Command | Result | Details |
|---|---|---|---|
| TypeScript typecheck | `npm run typecheck` | 🔄 | |
| Unit tests | `npm test` | 🔄 | |
| Smoke test | `npm run smoke` | 🔄 | |
| Fallback demo CLI | `ENABLE_EXA=false npm run agent:run --demo` | 🔄 | |
| Exa disabled in report | inspect SHIPCLAW_READINESS.md | 🔄 | |
| Server API routes | curl /api/* | 🔄 | |
| OpenClaw SKILL.md | content review | ⚠️ see BUG-005 | |
| Security check | .gitignore + diff | 🔄 | |

---

## QA Pass 1 — Historical (2026-05-16)

| Gate | Command | Result | Details |
|---|---|---|---|
| TypeScript typecheck | `npm run typecheck` | ✅ PASS | 0 errors |
| Unit tests | `npm test` | ✅ PASS | 6/6 (scorer.test.ts) |
| Smoke test | `npm run smoke` | ✅ PASS | 20/20 checks |
| Demo CLI run | `npm run agent:run --demo` | ✅ PASS | FINALIZE reached, 6 artifacts |
| Artifact presence | all 6 files in `runs/<id>/` | ✅ PASS | all present, correct sizes |
| Report content | 14-section manual inspect | ✅ PASS | all sections present |
| Server start + memory | `GET /api/memory` | ✅ PASS | returns `{"items":[]}` correct shape |
| POST /api/runs | run creation via API | ✅ PASS | returns `{"runId":"..."}` |
| GET /api/runs/:id | run status fetch | ✅ PASS | full run object returned |
| GET /api/reports/:id | artifact list | ✅ PASS | all 6 artifacts listed |
| GET /api/reports/:id/readiness | markdown fetch | ✅ PASS | 3347 chars, correct shape |
| GET /api/audit/:id | audit log | ✅ PASS | 3 entries returned |
| POST /api/approvals/bad/approve | 404 handling | ✅ PASS | returns 404 |
| POST /api/runs missing goal | 400 handling | ✅ PASS | returns `{"error":"..."}` |
| OpenClaw skill | `SKILL.md` exists + correct | ✅ PASS | correct command reference |
| Memory accumulation (server) | 2 runs via API | ✅ PASS | memory grows within session |

---

## Bugs Found — Pass 1 (Claude-owned, all fixed)

### BUG-001 — Double emoji in report mode note ✅ FIXED
**Owner:** Claude | **Severity:** medium | **Status:** ✅ fixed

### BUG-002 — `Finished: —` always in report ✅ FIXED
**Owner:** Claude | **Severity:** high | **Status:** ✅ fixed

### BUG-003 — Score band ASCII art arrow position wrong ✅ FIXED
**Owner:** Claude | **Severity:** medium | **Status:** ✅ fixed

### BUG-004 — `memory_before.jsonl` is 1-byte newline when empty ✅ FIXED
**Owner:** Claude | **Severity:** low | **Status:** ✅ fixed

---

## Codex Issues — Pass 1 (all fixed)

| ID | Issue | Status | Commit |
|---|---|---|---|
| CODEX-001 | SqliteDb — memory not persisting across CLI | ✅ fixed | 8266937 |
| CODEX-002 | Scorer [SYNTHETIC] evidence labels | ✅ fixed | 69b2ec7 |
| CODEX-003 | Thin test coverage | ✅ fixed | 19b503e |

---

## Bugs Found — Pass 2

### BUG-005 — SKILL.md missing Reconstruct exclusion and chain-of-thought clause
**Owner:** Claude
**Severity:** medium — hackathon judges may check for these explicit safety rules
**Status:** open — Claude fixing in this pass
**Found by:** Claude (QA Gate 6)
**Reproduction:** Read `openclaw/skills/shipclaw/SKILL.md` — search for "Reconstruct" or "chain-of-thought"
**Expected:** Skill explicitly states: (1) do not use Reconstruct, (2) do not expose hidden chain-of-thought
**Actual:** Neither phrase appears in the skill file
**Likely files:** `openclaw/skills/shipclaw/SKILL.md`
**Blocks demo?:** no — but required per QA Gate 6 spec
**Notes:** "Exa is optional and disabled by default" is present. "Remote writes require approval" is present. Adding the two missing clauses is a safe text-only fix.

---

## Manual UI Sweep Checklist (requires user + browser)

Run `npm run dev` → http://localhost:5173

| Panel | Check | Status |
|---|---|---|
| App loads | No console errors, renders within 2s | ⬜ user sweep needed |
| Skip link | Tab from fresh page → skip link appears | ⬜ user sweep needed |
| Goal panel | Repo + goal inputs, demo checkbox, submit button | ⬜ user sweep needed |
| Plan panel | 10 steps appear after run starts | ⬜ user sweep needed |
| Agent Activity | Events stream in timeline, auto-scrolls, dark terminal look | ⬜ user sweep needed |
| Readiness Score | Score number, band badge, progress bar, live-region | ⬜ user sweep needed |
| Risk Fingerprint | Severity table, signal/detail/memory columns | ⬜ user sweep needed |
| Time-to-Ship | Min–max range + reasons | ⬜ user sweep needed |
| Findings | Score breakdown table, blockers list, recommended actions | ⬜ user sweep needed |
| Approval panel | Appears with amber border, approve/reject buttons, receives focus | ⬜ user sweep needed |
| Live Report Preview | react-markdown renders SHIPCLAW_READINESS.md including tables | ⬜ user sweep needed |
| Final Decision | HOLD badge (red) or SHIP badge (green) visible after completion | ⬜ user sweep needed |
| Memory panel | Key/value items appear after run | ⬜ user sweep needed |
| Audit Log | Timestamped entries visible | ⬜ user sweep needed |
| External Evidence | Panel shows "Skipped" when Exa disabled | ⬜ user sweep needed |
| Demo banner | Dark blue sticky bar at top in demo mode | ⬜ user sweep needed |
| Fallback banner | Dark red sticky bar at top in fallback mode | ⬜ user sweep needed |
| Focus indicators | 3px blue outline on Tab through all interactive elements | ⬜ user sweep needed |

---

## OpenClaw / CLI Readiness

| Check | Status | Notes |
|---|---|---|
| `openclaw/skills/shipclaw/SKILL.md` exists | ✅ | File present |
| Skill references `npm run agent:run` | ✅ | Both live and demo commands present |
| CLI demo command works | ✅ | Verified in smoke |
| Exa optional + disabled by default | ✅ | Present in skill |
| Remote writes require approval | ✅ | Present in skill |
| No hidden chain-of-thought | ⚠️ | Missing — BUG-005 — fixing this pass |
| No Reconstruct | ⚠️ | Missing — BUG-005 — fixing this pass |
| `openclaw agent --message "..."` live test | ⬜ | manual verification needed |
| Install script present | ✅ | `scripts/install-openclaw-skill.ts` |

---

## Non-Negotiables Status

| Rule | Status |
|---|---|
| Score computed before Nemotron | ✅ confirmed (CALCULATE_SCORE → ASSESS_WITH_NEMOTRON) |
| Nemotron never overrides numeric score | ✅ prompt contract enforced; assessor enforces threshold |
| Fallback mode clearly labeled | ✅ mode banner + report header + report footer |
| Risky writes require approval | ✅ PROPOSE_ACTIONS → WAIT_FOR_APPROVAL gate |
| Exa disabled by default | ✅ `ENABLE_EXA=false` |
| Reconstruct excluded | ✅ no dependency, no API call |
| Secrets not in repo | 🔄 verifying |
| Memory visible in artifacts | ✅ 3 files per run (before/after/diff) |
| Exa never sends private data | ✅ sanitizeQuery() enforced in exa.ts |
| Exa failure degrades gracefully | ✅ all errors → [] return |

---

## Security Status (QA Gate 5)

| Check | Status |
|---|---|
| `.env` in `.gitignore` | 🔄 |
| No API keys in git log | 🔄 |
| No remote GitHub writes | 🔄 |
| No paid resources invoked | 🔄 |
| No destructive commands | 🔄 |

---

*QA Pass 2 started: 2026-05-16 by Claude (QA Lead, Demo Orchestrator, Senior Integrator)*
