# ShipClaw Communication Log

> Message bus for Claude Code ↔ Codex collaboration.
> Format: `## YYYY-MM-DD HH:MM PT — <AGENT> — <TYPE>`

---

## 2026-05-15 19:55 PT — Claude — INIT

**Task ID:** C-000
**Files touched:**
- COMMUNICATION_LOG.md
- TASK_STATE.md
- .gitignore
- .env.example

**Message:**
Bootstrapping the ShipClaw repository. Repo was empty on remote. Initialized git, set remote to HTTPS origin, created message bus files and secrets-safe environment template.

Architecture mandate:
- Deterministic scorer → Nemotron explains (never invents score)
- Memory visible: SQLite + memory_before/after/diff artifacts per run
- SHIPCLAW_READINESS.md generated per run, rendered live in UI
- Fallback mode is labeled; Exa disabled by default; Reconstruct excluded

**Dependency / ask:**
None at this stage.

**Validation run:**
- `npm run typecheck` — not run yet (no source files)
- `npm test` — not run yet

**Next action:**
Claude proceeding to C-001 (scaffold architecture + deps), then C-002 (shared types).
Codex may begin X-000 (fixture/test scaffolding) once C-002 types are committed and pushed.

---

## 2026-05-16 04:00 PT — Claude — COMPLETE

**Task IDs:** C-001, C-002, C-003, C-004, C-005, C-006, C-007, C-008, C-009, C-010

**Files touched:**
- package.json (all scripts, all deps)
- tsconfig.json
- vite.config.ts
- src/shared/types.ts (14 types, all stable)
- src/shared/constants.ts (score bands, weights, event types)
- src/storage/schema.sql (6 tables with WAL + FK)
- src/storage/db.ts (IDb interface + InMemoryDb fallback)
- src/llm/nemotron.ts (OpenAI-compatible NVIDIA client)
- src/llm/mock.ts (deterministic offline responder)
- src/agent/prompts.ts (ASSESSOR_SYSTEM_PROMPT + few-shot example)
- src/agent/assessor.ts (Nemotron call → zod validation → fallback)
- src/agent/scorer.ts (calculateReadinessScore stub with fallback)
- src/agent/riskFingerprint.ts (buildRiskFingerprint stub)
- src/agent/timeToShip.ts (estimateTimeToShip stub)
- src/agent/memory.ts (MemoryManager: before/after snapshots + diff)
- src/agent/loop.ts (17-state machine, 13 AgentEvent types)
- src/agent/report.ts (SHIPCLAW_READINESS.md 14-section + issue draft 7-section)
- src/agent/run.ts (CLI entry: --repo --goal --demo --auto-approve-local)
- src/server/index.ts (Express :8787 with CORS + dotenv)
- src/server/routes.ts (9 endpoints including SSE + approval gates)
- src/ui/index.html (semantic HTML, skip link, lang=en)
- src/ui/main.tsx
- src/ui/App.tsx (13 panels, WCAG AA, accessibility-lead reviewed)
- src/ui/styles.css (WCAG AA colours, focus indicators, reduced motion)
- src/tools/github.ts (stub, demo reads fixtures/)
- src/tools/repo.ts (stub, demo returns hardcoded observations)
- src/tools/shell.ts (allowlisted runSafeCommand)
- src/tools/exa.ts (disabled by default)
- scripts/migrate.ts (graceful fallback for better-sqlite3 Node 24 issue)
- scripts/smoke.ts (20-check end-to-end validator)
- scripts/seed-demo.ts (seeds a demo run)
- scripts/install-openclaw-skill.ts
- fixtures/demo/repo_bundle.json
- fixtures/demo/scan_result.json
- openclaw/skills/shipclaw/SKILL.md
- README.md (17 sections)
- docs/demo-script.md (3-min beat sheet)

**Message:**
Full MVP C-000 → C-010 complete. Smoke test passes 20/20 checks. TypeCheck clean. All 6 artifacts generated per run.

Key invariant confirmed: score calculated at CALCULATE_SCORE state → Nemotron called later at ASSESS_WITH_NEMOTRON, receives score as input, explains it, never overrides it.

Fallback note: better-sqlite3 fails to compile on Node 24 (gyp issue). InMemoryDb is the valid fallback for demo day — all 20 smoke checks pass, including all 6 artifacts and all 7 event types. SQLite persistence remains X-001 for Codex.

**Dependency / ask for Codex:**
- X-001: SqliteDb — implement IDb against schema.sql. setDb(new SqliteDb()) in server/index.ts.
- X-002: Scorer — replace calculateReadinessScore stub with real weighted algorithm using SCORE_WEIGHTS from constants.ts.
- X-003: RiskFingerprint — replace stub with real memory-aware implementation.
- X-004: TimeToShip — replace stub with real MINUTES_PER_* heuristic.
- X-005: GitHub/Repo tools — real Octokit + simple-git implementation.
- X-006: Tests — vitest tests for scorer, riskFingerprint, timeToShip, assessor fallback, memory diff.
- X-007: UI component internals — Codex may refactor App.tsx panels into separate files in src/ui/components/.

**Validation run:**
```
✅ npm run typecheck — 0 errors
✅ npm run smoke     — 20/20 checks passed
✅ npm run migrate   — exits 0 (graceful fallback message for Node 24)
```

**Next action:**
Codex: please implement X-001 through X-006 in parallel. Coordinate score weights via constants.ts (SCORE_WEIGHTS).
Claude: reviewing post-MVP stretch items (Exa integration C-EXA, NemoClaw story C-NEMO).
