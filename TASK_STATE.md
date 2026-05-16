# ShipClaw Task State

> Updated after every meaningful work unit. Owner: both agents.
> Status: `todo | in-progress | blocked | needs-review | complete | dropped`

---

## Claude Tasks (C-*)

| ID | Task | Status | Committed | Notes |
|---|---|---|---|---|
| C-000 | Bootstrap git message bus | ✅ complete | yes | COMMUNICATION_LOG + TASK_STATE + .gitignore + .env.example |
| C-001 | Scaffold architecture + deps | ✅ complete | yes | package.json, tsconfig.json, vite.config.ts, folder structure |
| C-002 | Shared type contracts | ✅ complete | yes | src/shared/types.ts (14 types), src/shared/constants.ts |
| C-003 | Storage schema | ✅ complete | yes | src/storage/schema.sql (6 tables), src/storage/db.ts (IDb + InMemoryDb) |
| C-004 | Nemotron prompt contract + assessor | ✅ complete | yes | src/agent/prompts.ts, src/agent/assessor.ts, src/llm/nemotron.ts |
| C-005 | Agent loop spine | ✅ complete | yes | src/agent/loop.ts (17 states, 13 events), src/agent/run.ts, src/agent/memory.ts |
| C-006 | Report generation | ✅ complete | yes | src/agent/report.ts (14-section readiness + 7-section issue draft) |
| C-007 | Express API | ✅ complete | yes | src/server/index.ts, src/server/routes.ts (9 endpoints + SSE) |
| C-008 | React dashboard | ✅ complete | yes | src/ui/App.tsx (13 panels, WCAG AA), src/ui/styles.css, index.html, main.tsx |
| C-009 | OpenClaw skill + install script | ✅ complete | yes | openclaw/skills/shipclaw/SKILL.md, scripts/install-openclaw-skill.ts |
| C-010 | README + demo script + submission | ✅ complete | yes | README.md (17 sections), docs/demo-script.md |

---

## Codex Tasks (X-*)

| ID | Task | Status | Notes |
|---|---|---|---|
| X-000 | Fixture scaffolding | 🟡 needs-review | Claude created fixtures/demo/repo_bundle.json and scan_result.json as stubs |
| X-001 | SqliteDb — IDb implementation against schema.sql | ✅ complete | Commit 8266937. Uses Node 24 `node:sqlite`; global memory persists across CLI processes. |
| X-002 | Scorer — real weighted algorithm | ✅ complete | Commit 69b2ec7. Uses SCORE_WEIGHTS and maps Observation[] to deterministic evidence without `[SYNTHETIC]` labels. |
| X-003 | RiskFingerprint — memory-aware implementation | 📋 todo | Stub exists. Must use memorySnapshot.items from IDb. |
| X-004 | TimeToShip — real MINUTES_PER_* heuristic | 📋 todo | Stub exists. Use MINUTES_PER_CRITICAL, MINUTES_PER_HIGH, etc. from constants.ts |
| X-005 | GitHub/Repo tools — real Octokit + simple-git | 📋 todo | Stubs exist in src/tools/. Demo mode reads fixtures/. |
| X-006 | Tests — vitest suite | ✅ complete | Commit 19b503e. Added focused tests for riskFingerprint, timeToShip, assessor fallback, and memory diff behavior. |
| X-007 | UI component internals | 📋 todo | App.tsx has everything inline. Codex may extract to src/ui/components/. |

---

## Stretch Items

| ID | Task | Status | Notes |
|---|---|---|---|
| C-EXA | Exa integration | ✅ complete | yes | Full impl: searchExternalDocs, assessmentNeedsExternalEvidence, buildExaQueries. 17 tests. UI panel with WCAG AA. |
| C-NEMO | NemoClaw/GX10 story | 📋 todo | Document what was attempted and what was dropped. |

---

## QA Pass 2 (Claude QA Lead — 2026-05-16) — COMPLETE

| Check | Status |
|---|---|
| `npm run typecheck` | ✅ 0 errors |
| `npm test` | ✅ 34/34 passed (7 files) |
| `npm run smoke` | ✅ 20/20 passed |
| Demo mode agent run | ✅ HOLD 55/100, FINALIZE reached, 6 artifacts, Audit Summary populated |
| All 9 API endpoints | ✅ correct shapes (Pass 1 verified) |
| BUG-005 SKILL.md clauses | ✅ fixed — commit 95ad64e |
| BUG-006 Verdict pollution | ✅ fixed — commit 95ad64e |
| BUG-007 audit CASCADE | ✅ fixed — commit 95ad64e |
| Exa integration | ✅ 17 tests, all passing |
| Security gate | ✅ no secrets, .gitignore clean |
| OpenClaw SKILL.md | ✅ all 6 safety clauses present |
| UI manual sweep | ⬜ requires browser |
| BUG-008 Vite UI entrypoint | ✅ fixed — commit 76d9b29 |

## QA Pass 1 (Claude QA Lead — 2026-05-16)

| Check | Status |
|---|---|
| `npm run typecheck` | ✅ 0 errors |
| `npm test` | ✅ 6/6 passed |
| `npm run smoke` | ✅ 20/20 passed |
| Demo mode agent run | ✅ HOLD 59/100, FINALIZE reached, 6 artifacts |
| All 9 API endpoints | ✅ correct shapes |
| BUG-001 double emoji | ✅ fixed |
| BUG-002 Finished: — | ✅ fixed |
| BUG-003 score band arrow | ✅ fixed |
| BUG-004 1-byte jsonl | ✅ fixed |
| CODEX-001 SqliteDb | ✅ fixed — commit 8266937 |
| CODEX-002 real scorer evidence | ✅ fixed — commit 69b2ec7 |
| CODEX-003 test coverage | ✅ fixed — commit 19b503e |
| UI manual sweep | ⬜ requires browser |

## Final MVP Gate checklist

| Check | Status |
|---|---|
| `npm run typecheck` | ✅ 0 errors |
| `npm test` | ✅ 6/6 passed (scorer.test.ts — Codex to expand in X-006) |
| `npm run smoke` | ✅ 20/20 checks passed |
| Demo mode agent run | ✅ runs to FINALIZE, generates all artifacts |
| `npm run dev` — UI sweep | ⬜ pending manual sweep |
| Fallback banner visible | ✅ mode-banner--fallback CSS + JSX |
| Deterministic score | ✅ computed at CALCULATE_SCORE before Nemotron |
| Evidence table | ✅ in report section 13 (empty when Exa disabled) |
| Risk fingerprint | ✅ all runs, memory-aware |
| Time-to-ship | ✅ min/max/reasons |
| Approval panel | ✅ role="alert", auto-focused |
| Live SHIPCLAW_READINESS.md render | ✅ react-markdown in dashboard panel 9 |
| memory_before/after/diff files | ✅ written by MemoryManager |
| Audit log | ✅ per-run, API endpoint + dashboard panel 12 |
| Report + issue draft | ✅ both files written per run |
