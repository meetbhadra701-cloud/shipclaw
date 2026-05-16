# ShipClaw — Release Readiness Skill

## When to invoke

Invoke this skill when the user asks any of the following:
- "Is [repo] ready to ship?"
- "Check release readiness for [repo]"
- "What's blocking [repo] from shipping?"
- "Generate a release readiness report for [repo]"
- "How long will it take to fix [repo] for release?"
- "Run ShipClaw on [repo]"

## What this skill does

ShipClaw runs a bounded autonomous release-readiness agent that:

1. Fetches GitHub repository metadata (CI status, open issues, PR health)
2. Scans important repository files (README, tests, CHANGELOG, security policy)
3. Runs safe local checks (typecheck, test)
4. Calculates a **deterministic** readiness score (0–100) across 6 weighted categories
5. Builds a Release Risk Fingerprint using memory from prior runs
6. Estimates time-to-ship using visible heuristics
7. Optionally fetches external evidence via Exa (off by default)
8. Calls Nemotron to explain the score (Nemotron does NOT invent or override the numeric score)
9. Proposes approval-gated actions for human review
10. Writes 6 artifacts: `SHIPCLAW_READINESS.md`, `github_issue_draft.md`, `audit.jsonl`, `memory_before.jsonl`, `memory_after.jsonl`, `memory_diff.md`

## Command to run

```bash
# Live mode (requires NEMOTRON_API_KEY and GITHUB_TOKEN in .env.local)
npm run agent:run -- --repo https://github.com/owner/repo --goal "Check release readiness"

# Demo mode (fixture data, no API calls)
npm run agent:run -- --repo https://github.com/owner/repo --goal "Check release readiness" --demo --auto-approve-local
```

## Public plan rules

- The score is ALWAYS deterministic. Nemotron explains it; it does not set it.
- Score threshold: ≥71 → READY (ship), <71 → hold
- Score bands: 0–40 NOT_READY, 41–70 RISKY, 71–100 READY
- Risky/destructive writes require explicit human approval via `POST /api/approvals/:id/approve`
- Memory persists cross-run. Risk Fingerprint uses memory when available.
- In demo mode, fixture data is used and results are clearly labeled as synthetic.
- Exa external evidence is off by default (set `EXA_ENABLED=true` to enable).

## Score categories and weights

| Category | Weight |
|---|---|
| CI Health | 25% |
| Test Coverage | 20% |
| Open Blockers | 20% |
| Documentation | 15% |
| Security | 10% |
| Dependency Freshness | 10% |

## Output artifacts

All artifacts are written to `runs/<runId>/`:

| File | Contents |
|---|---|
| `SHIPCLAW_READINESS.md` | Full 14-section polished report (judge-visible) |
| `github_issue_draft.md` | 7-section GitHub issue draft |
| `audit.jsonl` | Per-event audit trail |
| `memory_before.jsonl` | Memory snapshot before this run |
| `memory_after.jsonl` | Memory snapshot after this run |
| `memory_diff.md` | Human-readable memory diff |

## API endpoints

The dashboard server runs on `:8787`:

| Endpoint | Description |
|---|---|
| `POST /api/runs` | Start a new run |
| `GET /api/runs/:id` | Get run status |
| `GET /api/runs/:id/events` | SSE event stream |
| `POST /api/approvals/:id/approve` | Approve an action |
| `POST /api/approvals/:id/reject` | Reject an action |
| `GET /api/memory` | Get cross-run memory |
| `GET /api/audit/:runId` | Get audit log |
| `GET /api/reports/:runId` | List artifacts |
| `GET /api/reports/:runId/readiness` | Get readiness report markdown |

## Safety constraints

- No `rm -rf`, force-push, or destructive commands without explicit approval
- No paid resources without explicit user approval
- Secrets never written to repos, logs, reports, or commits
- All risky actions gated on `/api/approvals/:id/approve`
- Synthetic data clearly labeled in UI and reports
