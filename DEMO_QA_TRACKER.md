# ShipClaw — Demo QA Tracker

> Owner: Claude (QA Lead, Demo Orchestrator, Senior Integrator)
> Last updated: 2026-05-16 — QA Pass 2 COMPLETE
> **Overall Demo Status: ✅ PASS 2 COMPLETE — 3 bugs fixed, all automated gates green**

---

## Overall Summary

| Category | Pass 1 | Pass 2 |
|---|---|---|
| Automated gates | ✅ All green | ✅ All green |
| Artifact generation | ✅ All 6 correct | ✅ All 6 correct |
| API endpoints | ✅ All 9 OK | ✅ All 9 OK |
| Report content | ✅ 14 sections | ✅ 14 sections + audit entries |
| Claude-owned bugs fixed | ✅ 4 fixed | ✅ 3 more fixed (BUG-005, 006, 007) |
| Codex-assigned issues | ✅ CODEX-001–003 fixed | ✅ X-002 + X-006 merged |
| Exa integration | ⬜ not yet | ✅ Complete — 17 tests |
| UI manual sweep | ⬜ browser needed | ⬜ browser needed |
| OpenClaw skill | ✅ present | ✅ Reconstruct/CoT clauses added |
| Memory across runs | ✅ SQLite-backed | ✅ re-verified — persisting |

---

## QA Pass 2 — Gate Results

| Gate | Command | Result | Details |
|---|---|---|---|
| TypeScript typecheck | `npm run typecheck` | ✅ PASS | 0 errors |
| Unit tests | `npm test` | ✅ PASS | 34/34 (7 files) |
| Smoke test | `npm run smoke` | ✅ PASS | 20/20 checks |
| Fallback demo CLI | `ENABLE_EXA=false npm run agent:run --demo` | ✅ PASS | FINALIZE reached, 6 artifacts, Audit Summary populated |
| Exa disabled in report | inspect SHIPCLAW_READINESS.md §13 | ✅ PASS | Shows "skipped — set `ENABLE_EXA=true` to enable" |
| Server API routes | curl /api/* | ✅ PASS (Pass 1 verified) | All 9 routes correct |
| OpenClaw SKILL.md | content review | ✅ PASS | BUG-005 fixed — all 6 safety clauses present |
| Security check | .gitignore + diff | ✅ PASS | No secrets in repo, .env/.env.local gitignored |

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

## Bugs Found — Pass 2 (all fixed)

### BUG-005 — SKILL.md missing Reconstruct exclusion and chain-of-thought clause ✅ FIXED
**Owner:** Claude
**Severity:** medium
**Status:** ✅ FIXED — commit 95ad64e
**Found by:** Claude (QA Gate 6)
**Fix:** Added two safety bullet points to `openclaw/skills/shipclaw/SKILL.md`:
  - "Do not use Reconstruct — ShipClaw has no Reconstruct dependency..."
  - "Do not expose hidden chain-of-thought — all reasoning in audit trail..."

---

### BUG-006 — Verdict section polluted with FALLBACK_BANNER text ✅ FIXED
**Owner:** Claude
**Severity:** medium — Verdict section showed full fallback warning instead of clean explanation
**Status:** ✅ FIXED — commit 95ad64e
**Found by:** Claude (QA Pass 2 report inspection)
**Root cause:** `buildFallbackExplanation()` in `prompts.ts` prepended `FALLBACK_BANNER` to the explanation string, which the report template placed directly in the `## Verdict` section.
**Fix:** Removed `FALLBACK_BANNER` from `buildFallbackExplanation()`. Banner already appears in report header/footer via `modeNote`. Explanation is now clean: goal, score/band, decision, failing categories.

---

### BUG-007 — Audit Summary always empty in SHIPCLAW_READINESS.md ✅ FIXED
**Owner:** Claude (Codex-written code, Claude found + fixed)
**Severity:** high — report section 14 (Audit Summary) showed empty table for every run
**Status:** ✅ FIXED — commit 95ad64e
**Found by:** Claude (QA Pass 2 report inspection + deep investigation)
**Root cause:** `SqliteDb.updateRun()` called `createRun()`, which used `INSERT OR REPLACE INTO runs`. SQLite's `REPLACE` strategy is `DELETE + INSERT`. The `DELETE` triggered `ON DELETE CASCADE` on `audit_logs`, `events`, and `memories` child tables. The agent while-loop calls `updateRun(runId, { status: "running" })` at the top of EVERY iteration — so every state transition cascaded away all audit entries written in the previous state. By the time `getAuditLog(runId)` was called in `WRITE_ARTIFACTS`, the table was empty.
**Fix:** `updateRun()` now uses a targeted `UPDATE SET ...` SQL statement instead of delegating to `createRun()`. Child rows are preserved across run status updates.
**Verified:** Report §14 now shows 3 audit entries (run_created, auto_approved, actions_executed).

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
| No hidden chain-of-thought | ✅ | BUG-005 fixed — clause added |
| No Reconstruct | ✅ | BUG-005 fixed — clause added |
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
| Secrets not in repo | ✅ confirmed — .env/.env.local gitignored, no keys in diffs |
| Memory visible in artifacts | ✅ 3 files per run (before/after/diff) |
| Exa never sends private data | ✅ sanitizeQuery() enforced in exa.ts |
| Exa failure degrades gracefully | ✅ all errors → [] return |

---

## Security Status (QA Gate 5 — Pass 2)

| Check | Status |
|---|---|
| `.env` in `.gitignore` | ✅ confirmed |
| `.env.local` in `.gitignore` | ✅ confirmed |
| `data/*.sqlite` in `.gitignore` | ✅ confirmed |
| `runs/` in `.gitignore` | ✅ confirmed |
| No API keys in git log | ✅ confirmed — grep clean |
| No API keys in source diffs | ✅ confirmed — grep clean |
| No remote GitHub writes | ✅ confirmed — no Octokit write calls in demo mode |
| No paid resources invoked | ✅ confirmed — Nemotron/Exa both disabled in demo |
| No destructive commands | ✅ confirmed — shell allowlist only |

---

*QA Pass 2 completed: 2026-05-16 by Claude (QA Lead, Demo Orchestrator, Senior Integrator)*
*Bugs fixed this pass: BUG-005 (SKILL.md), BUG-006 (Verdict pollution), BUG-007 (audit cascade)*
*All automated gates: ✅ typecheck + 34 tests + 20 smoke checks*
