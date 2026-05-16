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
