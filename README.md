# ShipClaw

A read-only GitHub release-readiness assessment: **repository → evidence → deterministic score → SHIP/HOLD → explanation → proposed-action review**.

The existing UI redesign is preserved. The final engineering pass adds actual public GitHub collection and explicit unknowns. Earlier audit and redesign documents describe historical behavior; see [final engineering verification](docs/engineering/FINAL_ENGINEERING.md) for the current implementation and QA.

## Run locally

Use Node.js 24+ (native `node:sqlite`) and npm.

```sh
npm ci
npm run build
npm start
```

Open http://localhost:8787. Paste a public URL such as `https://github.com/expressjs/express`. No token is required where GitHub permits public API reads. The server needs outbound access to api.github.com.

For development: `npm run dev` (Vite on 5173 and API on 8787).

Optional `.env.local` configuration (see `.env.example`):

- `GITHUB_TOKEN`: improves GitHub API limits. Only public repositories are supported. Never sent to the browser.
- `NEMOTRON_API_KEY`: enables the Nemotron explanation. `NEMOTRON_BASE_URL` and `NEMOTRON_MODEL` may override its endpoint/model.
- `ALLOW_LLM_FALLBACK=true` (default): use a deterministic template if the model is unavailable. Set `false` to expose an unavailable assessor instead. Neither path changes evidence or score.
- `ENABLE_EXA=false`: optional external search is off by default and never changes the numeric score.
- `PORT=8787`.

**Use sample (no network)** explicitly selects a synthetic snapshot. Editing the URL returns to real analysis. Sample selection never changes another run's mode. Sample runs always use a template and skip external calls. The legacy shell helper retains labelled demo simulation for compatibility but is never called by the analysis loop; its live result is explicitly unmeasured.

CLI:

```sh
npm run agent:run -- --repo https://github.com/expressjs/express --goal "Check release readiness"
npm run agent:run -- --repo sample --demo
```

## What is actually measured

- Repository identity and default branch.
- Latest default-branch commit SHA/date and its recursive Git tree.
- Separate open issue / PR counts (GitHub search; contextual, not treated as blockers).
- Workflow-file presence and latest observed GitHub Actions run per workflow **at that commit**.
- README, CHANGELOG/CHANGES/HISTORY, repository SECURITY policy, lockfile, dependency-manifest, and test-file/directory indicators.

Every run writes `evidence.json`: timestamp, commit, file paths, observations, workflow links, scan summary, and limitations. The Evidence tab shows the snapshot, what was measured, what was unmeasured, and the fixed rule output.

No cloning, package installation, shell execution, hooks, or downloaded binaries. Test-file presence is **not test execution or coverage**. Policy-file presence is **not vulnerability scanning**. Lockfiles are **not dependency freshness**. External CI providers, inherited organization policies, branch protection, and release-specific blocker triage are unmeasured.

GitHub requests time out after 10 seconds, use a fixed API origin, and never expose tokens or arbitrary response bodies in errors. Core repository lookup failures end the run with an error. Partial endpoint failures preserve available evidence and record unknowns. Truncated trees never establish absent files or exact counts. Pending, skipped, cancelled, stale, incomplete, or inaccessible Actions evidence cannot produce a passing status. Even successful observed workflows do not prove that all required workflows ran.

API reference: [Git trees](https://docs.github.com/en/rest/git/trees#get-a-tree), [workflow runs](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository).

## Scoring contract

Original category weights and measured-signal rules are retained:

| Category | Weight | Public inspection scope |
|---|---:|---|
| Actions status (`ci_health`) | 25% | Latest observed Actions conclusions at the inspected commit |
| Test indicators (`test_coverage`) | 20% | File-name indicators, not measured coverage |
| Open blockers | 20% | Unknown until release-specific triage is supplied; counts alone do not suffice |
| Documentation | 15% | README and changelog presence |
| Security policy | 10% | Repository policy-file presence only |
| Dependencies | 10% | Freshness unknown; manifests/locks are context |

A category is `measurement: "measured"` only when all supplied observations for it are usable. Otherwise it is `"unknown"`, never a measured failure. The existing numeric fields stay backward compatible: unknown categories store `rawScore: 0`, `weightedScore: 0`, `pass: false`, **meaning no points awarded**, not a measured zero. Consumers must inspect `measurement`.

- `total = round(sum(measured rawScore × category weight))`: earned evidence points, not a probability of shipping safely.
- `evidenceCoverage`: fraction of category weight measured, **not code coverage**.
- `possibleTotal`: total including full possible points for unknown categories. It is a policy range, not a statistical confidence interval.
- `decisionForScore`: SHIP requires ≥71 **and** all category weights measured. Otherwise HOLD.
- Unknown categories produce no fabricated risks or remediation effort. With no measured weaknesses, effort is unmeasured (legacy numeric fields are zero).

Consequently, **the current read-only public collector returns HOLD even for strong repositories**, because release-blocker triage and dependency freshness remain unknown. This is deliberate. A score above 71 is not permission to ship. Existing saved runs use their original policy; comparisons across policy versions require care.

## AI and review boundary

The score is finalized before the model call. The assessor parses an explanation schema that excludes numeric score fields and forces its structured verdict to `decisionForScore`. Model-provided scores are discarded. Repository evidence and the user's goal are treated as untrusted context in the prompt.

API/UI provenance distinguishes `source: "nemotron"`, `"deterministic_fallback"`, and no valid assessor output. Fallback `confidence` is `null`. Live confidence is model-reported and uncalibrated. Explanatory prose is model output and may still be imperfect; use the deterministic evidence table as the source of truth.

**Review is recording only.** Analysis finishes while proposals remain pending. Record approval/rejection writes an audit event; no action runs and no repository changes. Conflicting/repeated decisions receive HTTP 409. Existing `/api/approvals/...` names are retained for compatibility. The workflow uses `RECORD_REVIEW` and `COMPLETE_READ_ONLY`, not a pretend wait/execution gate.

## Storage and API

SQLite: `data/shipclaw.sqlite`. Artifacts: `runs/<id>/`. Preserve both on a persistent volume to retain history. If SQLite cannot open, the server reports volatile storage in health/UI. Memory is global run context; it does not change the score or derive historical risk signals. Report files are completion snapshots; later review decisions are in the audit log and `audit.jsonl`.

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Configuration and storage status, no secrets |
| `POST /api/runs` | `{ "repo": "https://github.com/owner/repo", "goal": "...", "demo": false }` |
| `GET /api/runs`, `GET /api/runs/:id` | History and run state |
| `GET /api/runs/:id/events` | SSE, including repository evidence and explicit end |
| `POST /api/approvals/:id/approve` or `/reject` | Record a review decision only |
| `GET /api/reports/:id/files/evidence.json` | Captured raw evidence and scan summary |
| `GET /api/reports/:id/readiness` | Markdown report |
| `GET /api/reports/:id` | Seven allowlisted artifacts |
| `GET /api/audit/:id`, `GET /api/memory` | Audit and memory |

This remains a trusted local/demo service with no authentication or multi-tenant isolation. GitHub API rate limits and search index lag apply. Counts and workflow state can change after capture. No queue or arbitrary repository execution was introduced.

## Verification

```sh
npm run typecheck
npm test
npm run smoke
npm run build
```

Browser QA is optional and uses Playwright supplied by your environment (no new product dependencies). Set `PLAYWRIGHT_MODULE` to its module path if not installed locally; `QA_BROWSER_CHANNEL=msedge` can use installed Edge. `QA_BASE_URL` defaults to 8787. Run `node scripts/browser-qa.mjs` against a built server. Fault QA uses the **test-only** `scripts/browser-fixtures.ts` server on 8791, then `node scripts/browser-fault-qa.mjs`. These injected failures are clearly identified in the saved QA results.

See [90-second demo](docs/demo-script.md), [verification results](docs/engineering/FINAL_ENGINEERING.md), and screenshots under `docs/engineering/`.
