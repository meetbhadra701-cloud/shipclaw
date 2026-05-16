# ShipClaw Task State

## Global Status
- Current MVP phase: Phase 0 — Bootstrap
- Last green validation: none
- Known blockers: none
- Frozen files: none

## Active Tasks

| Task ID | Owner | Status | Files | Depends on | Notes |
|---|---|---|---|---|---|
| C-000 | Claude | in-progress | COMMUNICATION_LOG.md, TASK_STATE.md, .gitignore, .env.example | none | Initialize git message bus |
| C-001 | Claude | todo | package.json, tsconfig.json, vite.config.ts, folder scaffold | C-000 | Scaffold architecture + deps |
| C-002 | Claude | todo | src/shared/types.ts, src/shared/constants.ts | C-001 | Define shared type contracts |
| C-003 | Claude | todo | src/storage/schema.sql, scripts/migrate.ts | C-002 | Storage schema |
| C-004 | Claude | todo | src/agent/prompts.ts, src/agent/assessor.ts, src/llm/nemotron.ts | C-003 | Nemotron prompt contract + assessor |
| C-005 | Claude | todo | src/agent/loop.ts, src/agent/run.ts, src/agent/memory.ts | C-004 | Agent loop spine (17-state machine) |
| C-006 | Claude | todo | src/agent/report.ts | C-005 | Report generation + 6 artifacts per run |
| C-007 | Claude | todo | src/server/index.ts, src/server/routes.ts | C-006 | Express API (9 routes) |
| C-008 | Claude | todo | src/ui/App.tsx, src/ui/components/*.tsx stubs | C-007 | React dashboard composition |
| C-009 | Claude | todo | openclaw/skills/shipclaw/SKILL.md, scripts/install-openclaw-skill.ts | C-005 | OpenClaw skill |
| C-010 | Claude | todo | README.md, docs/demo-script.md | all | Docs + submission package |
| X-000 | Codex | todo | fixtures/, src/shared/redaction.ts | C-002 | Fixture scaffolding + redaction tests |
| X-001 | Codex | todo | src/storage/db.ts | C-003 | DB helper implementation + tests |
| X-002 | Codex | todo | src/agent/scorer.ts, scorer.test.ts | C-002 | Deterministic scorer + rubric tests |
| X-003 | Codex | todo | src/agent/riskFingerprint.ts, timeToShip.ts | C-002 | Risk fingerprint + time-to-ship impl |
| X-004 | Codex | todo | src/llm/mock.ts, nemotron.test.ts | C-004 | LLM mock + nemotron tests |
| X-005 | Codex | todo | src/tools/{github,repo,shell,exa}.ts | C-002 | Tool implementations |
| X-006 | Codex | todo | src/ui/components/*.tsx | C-008 | UI component internals |
| X-007 | Codex | todo | scripts/smoke.ts, scripts/seed-demo.ts | C-005 | Smoke test + seed demo script |

## Completed Tasks

| Task ID | Owner | Commit | Validation |
|---|---|---|---|
