# ShipClaw — Demo QA Tracker

> Owner: Claude (QA Lead, Demo Orchestrator, Senior Integrator)
> Last updated: 2026-05-16 — QA pass complete
> **Overall Demo Status: 🟡 YELLOW — demo-ready with known limitations**

---

## Overall Summary

| Category | Result |
|---|---|
| Automated gates | ✅ All green |
| Artifact generation | ✅ All 6 artifacts generated correctly |
| API endpoints | ✅ All 9 routes functioning |
| Report content | ✅ All 14 required sections present |
| Claude-owned bugs fixed | ✅ 4 bugs fixed this pass |
| Codex-assigned issues | ✅ All fixed |
| UI manual sweep | ⬜ Requires user with browser |
| OpenClaw skill | ✅ SKILL.md present and correct |
| Memory across runs (CLI) | ✅ Persists via SQLite-backed storage |

---

## QA Gate Results

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

## Bugs Found and Fixed This Pass (Claude-owned)

### BUG-001 — Double emoji in report mode note ✅ FIXED
**Owner:** Claude  
**Severity:** medium — looks unprofessional on demo  
**Status:** ✅ fixed  
**Found by:** Claude  
**Reproduction:** Run any demo — inspect `SHIPCLAW_READINESS.md` line 3  
**Expected:** `> 🔬 DEMO MODE — Using fixture data...`  
**Actual (before fix):** `> 🔬 🔬 DEMO MODE — Using fixture data...`  
**Root cause:** `DEMO_BANNER` constant already starts with `🔬`; `report.ts` modeNote was prepending an extra `🔬 `  
**Fix:** Removed extra `🔬 ` prefix from modeNote in `src/agent/report.ts`  
**Commit:** included in QA fix commit  

---

### BUG-002 — `Finished: —` always in report ✅ FIXED
**Owner:** Claude  
**Severity:** high — report shows incomplete metadata; judges will notice  
**Status:** ✅ fixed  
**Found by:** Claude  
**Reproduction:** Run demo → inspect `SHIPCLAW_READINESS.md` → `| **Finished** | — |`  
**Expected:** `| **Finished** | 2026-05-16T04:56:07.619Z |`  
**Actual (before fix):** `| **Finished** | — |` (always)  
**Root cause:** `generateReport()` is called in `WRITE_ARTIFACTS` state; `finishedAt` is only set after the while loop exits in `FINALIZE`, so it's always undefined when the report is written  
**Fix:** Compute `reportFinishedAt = new Date().toISOString()` immediately before `generateReport()` call in `src/agent/loop.ts` and pass it as `run.finishedAt`  
**Commit:** included in QA fix commit  

---

### BUG-003 — Score band ASCII art arrow position wrong ✅ FIXED
**Owner:** Claude  
**Severity:** medium — arrow rendered at column ~70 for score=59; looks broken  
**Status:** ✅ fixed  
**Found by:** Claude  
**Reproduction:** Run demo → `SHIPCLAW_READINESS.md` Score Band section  
**Expected:** Arrow at proportional position relative to 0–100 scale  
**Actual (before fix):** `padStart(score.total)` used absolute score as char count → arrow at column 59+ for every score  
**Fix:** `padStart(Math.round((score.total / 100) * 24) + 1)` — scales to the 24-char ASCII art width  
**Files:** `src/agent/report.ts`  
**Commit:** included in QA fix commit  

---

### BUG-004 — `memory_before.jsonl` is 1-byte newline when empty ✅ FIXED
**Owner:** Claude  
**Severity:** low — 1-byte file looks corrupt; parsers may choke  
**Status:** ✅ fixed  
**Found by:** Claude  
**Reproduction:** First run — `wc -c runs/<id>/memory_before.jsonl` → `1`  
**Expected:** 0-byte empty file (no prior memory on first run)  
**Actual (before fix):** 1 byte (`0x0a` — lone newline) because `"".join([]) + "\n"` = `"\n"`  
**Fix:** Early return with `writeFileSync(path, "")` when `items.length === 0`  
**Files:** `src/agent/memory.ts`  
**Commit:** included in QA fix commit  

---

## Codex-Assigned Issues

### CODEX-001 — Memory does not persist across separate CLI processes
**Owner:** Codex (X-001 — SqliteDb)  
**Severity:** medium — "memory across runs" feature is invisible when using CLI directly  
**Status:** fixed — Codex patch committed 8266937  
**Reproduction:**
```bash
npm run agent:run -- --demo --auto-approve-local  # run 1
npm run agent:run -- --demo --auto-approve-local  # run 2: memory_before.jsonl is STILL empty
```
**Expected:** Run 2's `memory_before.jsonl` contains memory items from run 1  
**Actual:** Each CLI invocation starts a fresh `InMemoryDb` — no persistence  
**Workaround for demo:** Use the API server path: `POST /api/runs` via UI. Multiple runs within one server session accumulate memory correctly.  
**Likely files:** `src/storage/db.ts` (needs `SqliteDb`), `src/server/index.ts` (needs `setDb(new SqliteDb())`)  
**Notes:** `better-sqlite3` fails to compile on Node 24 (gyp error). Codex should try `node-sqlite3-wasm` or `@sqlite.org/sqlite-wasm` as Node 24 compatible alternatives. See `scripts/migrate.ts` for current graceful fallback.  

**Codex progress note:** Claimed for patching. First pass will inspect the existing `IDb` contract, schema, server bootstrap, and Node 24 SQLite options before editing implementation files.

## CODEX-001 Resolution
Owner: Codex
Status: fixed
Files changed:
- `src/storage/db.ts`
- `src/storage/db.test.ts`
- `src/server/index.ts`
- `scripts/migrate.ts`
- `package.json`
- `package-lock.json`
Validation:
- `npm test -- src/storage/db.test.ts`
- `npm run migrate`
- `npm run typecheck`
- `npm test`
- `npm run smoke`
- `DEMO_MODE=true ALLOW_LLM_FALLBACK=true npm run agent:run -- --repo fixtures/demo --goal "Check demo readiness" --demo --auto-approve-local`
Result:
- PASS. SQLite-backed global memory persists across separate CLI processes; second demo CLI run loads prior memory into `memory_before.jsonl`.
Commit:
- 8266937
Notes:
- Implemented `SqliteDb` with Node 24's built-in `node:sqlite`, removed obsolete `better-sqlite3` dependency to avoid native binding failures, and preserved `InMemoryDb` fallback if SQLite is unavailable.

---

### CODEX-002 — Scorer produces only [SYNTHETIC] evidence labels in demo mode
**Owner:** Codex (X-002 — real weighted scorer)  
**Severity:** low for demo (it's labeled synthetic) — medium for live mode  
**Status:** fixed — Codex patch committed 69b2ec7  
**Reproduction:**
```bash
cat runs/<id>/SHIPCLAW_READINESS.md | grep SYNTHETIC
```
**Expected:** Real evidence strings like `"CI passing: last 10 runs green"` or `"3 open critical issues"`  
**Actual:** `[SYNTHETIC] ci_health — demo data only` for all categories  
**Notes:** The stub in `src/agent/scorer.ts` uses `[SYNTHETIC]` labels. Codex X-002 should map `Observation[]` inputs to real category scores and evidence strings. Use `SCORE_WEIGHTS` from `src/shared/constants.ts`.  

**Codex progress note:** Claimed for patching after CODEX-001. First pass will inspect `calculateReadinessScore`, observation shapes, fixtures, and current scorer tests before editing.

## CODEX-002 Resolution
Owner: Codex
Status: fixed
Files changed:
- `src/agent/scorer.ts`
- `src/agent/scorer.test.ts`
Validation:
- `npm test -- src/agent/scorer.test.ts`
- `npm run typecheck`
- `npm test`
- `npm run smoke`
- `DEMO_MODE=true ALLOW_LLM_FALLBACK=true npm run agent:run -- --repo fixtures/demo --goal "Check demo readiness" --demo --auto-approve-local`
- `grep -R "\[SYNTHETIC\]" -n runs/FmPL2fhSGuaj/SHIPCLAW_READINESS.md || true`
Result:
- PASS. Scorer now maps `Observation[]` into deterministic category scores with evidence strings; generated readiness report contains no `[SYNTHETIC]` evidence labels.
Commit:
- 69b2ec7
Notes:
- Count-like observations now use readiness mappings instead of raw passthrough numbers, so signals like `test_file_count=4` and `open_issues=3` produce calibrated evidence scores.

---

### CODEX-003 — Test coverage thin (scorer only)
**Owner:** Codex (X-006 — vitest suite)  
**Severity:** low — smoke passes; no test coverage for riskFingerprint, timeToShip, assessor fallback, memory diff  
**Status:** fixed — Codex patch committed 19b503e  
**Notes:** Starter test at `src/agent/scorer.test.ts`. Codex should add `riskFingerprint.test.ts`, `timeToShip.test.ts`, `assessor.test.ts` (fallback path), `memory.test.ts` (diff logic).  

**Codex progress note:** Claimed after CODEX-002. First pass will add narrow tests around existing behavior for risk fingerprinting, time-to-ship estimation, assessor fallback, and memory diff/snapshot artifacts without changing architecture-heavy files.

## CODEX-003 Resolution
Owner: Codex
Status: fixed
Files changed:
- `src/agent/riskFingerprint.test.ts`
- `src/agent/timeToShip.test.ts`
- `src/agent/assessor.test.ts`
- `src/agent/memory.test.ts`
Validation:
- `npm test -- src/agent/riskFingerprint.test.ts src/agent/timeToShip.test.ts src/agent/assessor.test.ts src/agent/memory.test.ts`
- `npm run typecheck`
- `npm test`
- `npm run smoke`
Result:
- PASS. Added focused coverage for risk severity mapping, blocker-weighted time estimates, demo fallback assessor output, and memory before/after/diff artifact behavior. Full suite now reports 34 passing tests across 7 files.
Commit:
- 19b503e
Notes:
- Tests only; no architecture files or production behavior changed.

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
| External Evidence | Panel absent when Exa disabled | ⬜ user sweep needed |
| Demo banner | Dark blue sticky bar at top in demo mode | ⬜ user sweep needed |
| Fallback banner | Dark red sticky bar at top in fallback mode | ⬜ user sweep needed |
| Focus indicators | 3px blue outline on Tab through all interactive elements | ⬜ user sweep needed |

---

## OpenClaw / CLI Readiness

| Check | Status | Notes |
|---|---|---|
| `openclaw/skills/shipclaw/SKILL.md` exists | ✅ | Correct invoke conditions, command reference |
| Skill references `npm run agent:run` | ✅ | Both live and demo commands present |
| CLI demo command works | ✅ | Verified above |
| `openclaw agent --message "..."` live test | ⬜ manual verification needed | OpenClaw runtime availability unknown |
| Install script present | ✅ | `scripts/install-openclaw-skill.ts` |

---

## Non-Negotiables Status

| Rule | Status |
|---|---|
| Score computed before Nemotron | ✅ confirmed (CALCULATE_SCORE → ASSESS_WITH_NEMOTRON) |
| Nemotron never overrides numeric score | ✅ prompt contract enforced; assessor enforces threshold |
| Fallback mode clearly labeled | ✅ mode banner + report header + report footer |
| Risky writes require approval | ✅ PROPOSE_ACTIONS → WAIT_FOR_APPROVAL gate |
| Exa disabled by default | ✅ `EXA_ENABLED=false` |
| Reconstruct excluded | ✅ no dependency, no API call |
| Secrets not in repo | ✅ .gitignore verified |
| Memory visible in artifacts | ✅ 3 files per run (before/after/diff) |

---

## Demo Recommendation

**Status: 🟡 YELLOW — GO with caveats**

**Green path:** Use `npm run dev` → http://localhost:5173 → demo mode checkbox → run via UI. This path gives:
- Live SSE event stream in dashboard
- Memory accumulation across multiple runs in the same session
- Live Report Preview with markdown tables
- Approval flow visible in UI
- All 13 panels

**Known limitations to acknowledge in demo:**
1. No real GitHub data in demo — fixture data only
2. Live API validation still requires explicit approval and keys

**Would be RED if:** `npm run typecheck` or `npm run smoke` failed, or API endpoints returned wrong shapes. All pass. ✅

---

## Exact Commands Run This QA Pass

```bash
git pull
npm run typecheck                             # ✅ 0 errors
npm test                                      # ✅ 6/6 passed
npm run smoke                                 # ✅ 20/20 passed
npm run agent:run --demo --auto-approve-local # ✅ HOLD 59/100
# Server API checks (curl)
GET /api/memory                               # ✅ {"items":[]}
POST /api/runs                                # ✅ {"runId":"..."}
GET /api/runs/:id                             # ✅ full run object
GET /api/reports/:id                          # ✅ 6 artifacts listed
GET /api/reports/:id/readiness                # ✅ 3347 char markdown
GET /api/audit/:id                            # ✅ 3 audit entries
POST /api/approvals/bad/approve               # ✅ 404
POST /api/runs (missing goal)                 # ✅ 400
```

---

## Changes Made This QA Pass

| File | Change |
|---|---|
| `src/agent/report.ts` | BUG-001: remove duplicate emoji from modeNote |
| `src/agent/report.ts` | BUG-003: fix score band arrow to scaled position |
| `src/agent/loop.ts` | BUG-002: compute `reportFinishedAt` before `generateReport()` |
| `src/agent/memory.ts` | BUG-004: write truly empty file when items=[] |
| `DEMO_QA_TRACKER.md` | this file |

---

*QA pass completed: 2026-05-16 by Claude (QA Lead, Demo Orchestrator, Senior Integrator)*
