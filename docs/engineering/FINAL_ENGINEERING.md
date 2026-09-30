# Final engineering verification — 2026-09-29

Base: `1dc89e5ef3c79204a2288cc9c1a3d26d1ac47438`, branch `codex/final-engineering`.
No push, merge, reset, or redesign replacement. Incoming text files had CRLF-only differences; content was preserved and normalized. The implementation retains the existing layout, CSS, navigation, and information hierarchy.

## 1. Issues found in the inherited implementation

- GitHub and file tools returned identical fixtures for every repository, including purported live runs.
- Empty score categories received 50 points; unknowns looked like measured evidence and produced invented risks/effort.
- UI always requested sample mode; POST mutated the process-wide DEMO_MODE flag, contaminating later/concurrent runs.
- The wait state never waited; the execution state wrote a misleading `actions_executed` audit record without doing work.
- Approval endpoints allowed a recorded decision to be overwritten; decisions were absent from the downloadable event log.
- Model/evidence modes were coupled. Fallback confidence was fixed at 0.7; generated reports misattributed it to Nemotron.
- Test files were called coverage, ordinary issue/PR counts were penalized as blockers, and shell stubs were presented as checks.
- Empty evidence implied minimal remediation and no risks; storage was always called persistent even on the volatile fallback.
- Reduced-motion runs were incorrectly labelled as historical replay. Long unknown descriptions reduced mobile readability.
- Environment-dependent constants/model configuration loaded before .env files; the start script targeted a platform-dependent shim.

## 2. Real GitHub functionality

Read-only REST calls collect identity, default branch, commit SHA/date, recursive tree, separate open issue/PR counts, workflow files, and latest observed Actions conclusions at the pinned commit. Tree inspection detects README, changelog, repository security policy, lockfiles, dependency manifests, and test-file/directory indicators. GitHub response failures, pending or incomplete Actions, truncated trees, and unsupported measures remain explicit unknowns. Metadata lookup failures terminate with a useful error instead of sample evidence.

`evidence.json` and `repository_evidence` SSE events expose source, timestamp, SHA, paths, observations, workflow links and limitations. No clone, package install, or remote command execution exists.

### Captured public evidence (no GitHub token)

| Repository | Commit | Files | Test indicators | Issues / PRs | Evidence points |
|---|---|---:|---:|---:|---:|
| octocat/Hello-World | `7fd1a60b01f91b314f59955a4e4d4e80d8edf11d` | 1 | 0 | 5997 / 1248 | 41 |
| expressjs/express | `7ef98448f8b38099ab1ded55e458538ad47a51e7` | 214 | 112 | 106 / 129 | 63 |

Both snapshots measured 70% of category weight. Hello-World: docs 70, tests 0, repository policy 50, observed Actions 100 → **41** points. Express: docs 100, tests 90, repository policy 50, observed Actions 100 → **63** points. Their templates name different measured weaknesses. Contextual issue counts do not change the score. Hello-World had successful platform-managed Pages Actions despite no checked-in workflow file; these facts are shown separately and are not called passing tests.

See [raw browser capture](browser-results.json). Values are snapshots and may change.

## 3. Remaining fixtures

Only explicitly selected sample evidence is synthetic (hardcoded sample bundle, shared real tree scanner). The existing fixture JSON files remain historical assets. Legacy shell helper demo output remains explicitly simulated, but the analysis loop never calls it. The helper's live result is unmeasured with a null exit code. Fault-server responses and model stubs are confined to QA/tests. No production error falls back to repository fixtures.

## 4. Approval choice

**B: proposed-action review / approval recording.** There are no real repository write actions, so adding an asynchronous job system would protect nothing. `RECORD_REVIEW` and `COMPLETE_READ_ONLY` replace pretend wait/execution states. Analysis completes with a pending optional review. Human acceptance/rejection is recorded in SQLite audit, events and audit.jsonl. A second decision gets 409. No action executes. Reports remain immutable completion snapshots and explain where later decisions live.

## 5. Files changed

Source/config/documentation inventory (plus QA snapshots and result JSON under this directory):

- `.env.example`
- `COMMUNICATION_LOG.md`
- `README.md`
- `docs/demo-script.md`
- `package.json`
- `scripts/browser-fault-qa.mjs`
- `scripts/browser-fixtures.ts`
- `scripts/browser-qa.mjs`
- `scripts/live-nemotron-qa.mjs`
- `src/agent/assessor.test.ts`
- `src/agent/assessor.ts`
- `src/agent/loop.ts`
- `src/agent/prompts.ts`
- `src/agent/report.ts`
- `src/agent/riskFingerprint.ts`
- `src/agent/run.ts`
- `src/agent/scorer.test.ts`
- `src/agent/scorer.ts`
- `src/agent/timeToShip.test.ts`
- `src/agent/timeToShip.ts`
- `src/llm/nemotron.ts`
- `src/llm/nemotron.test.ts`
- `src/server/index.ts`
- `src/server/routes.test.ts`
- `src/server/routes.ts`
- `src/shared/constants.ts`
- `src/shared/env.ts`
- `src/shared/heuristics.ts`
- `src/shared/types.ts`
- `src/tools/github.test.ts`
- `src/tools/github.ts`
- `src/tools/repo.ts`
- `src/tools/shell.test.ts`
- `src/tools/shell.ts`
- `src/ui/App.tsx`
- `src/ui/components/ActionsPanel.tsx`
- `src/ui/components/Landing.tsx`
- `src/ui/components/ScoreDrivers.tsx`
- `src/ui/components/TrustFacts.tsx`
- `src/ui/components/VerdictCard.tsx`
- `src/ui/components/Workflow.tsx`
- `src/ui/components/details.tsx`
- `src/ui/lib/derive.test.ts`
- `src/ui/lib/derive.ts`
- `src/ui/lib/format.ts`
- `src/ui/lib/useRun.ts`

## 6. Tests added

49 additional tests (46 → 95): 26 collector/parser/scan tests, 5 API/integration tests, 5 unknown/scoring-policy tests, 4 model-boundary tests, 1 disabled-live-shell test, and 8 NVIDIA transport tests. Existing fallback-confidence, estimation, and workflow-state tests were updated to the truthful contracts. Transport tests inspect the actual JavaScript SDK request body, configured model selection, truncation/filter/tool finish reasons, refusal, invalid JSON, sanitized HTTP errors and absence of retries.

Coverage includes malformed URLs, SSRF-like destinations, unauthenticated public access, exact separate counts, pinned tree reads, no fixture contamination, stale/pending/skipped CI, workflow reruns, incomplete result sets, truncated trees, empty repos, partial failures, HTTP errors, redacted errors, unknown scoring, incomplete-evidence HOLD, model score injection, conflicting verdict correction, fallback/unavailable assessor, pending review completion, single immutable decisions, missing-run SSE termination, and no shell calls in a remote run.

## 7. Exact verification results

Environment: Windows Node **26.7.0**, npm **11.19.0**, Vite **5.4.21**, Vitest **1.6.1**, installed Edge controlled by bundled Playwright. No product dependencies added.

| Check | Result |
|---|---|
| `npm run typecheck` | PASS, exit 0 |
| `npm test` | PASS, **95/95 tests**, **12/12 files** |
| `npm run smoke` | PASS, **20/20 checks**, sample HOLD **50/100** |
| `npm run build` | PASS, Vite **300 modules**, TypeScript exit 0; JS **375.30 kB**, gzip **116.36 kB** |
| Real browser QA | PASS, **23 assertions** in browser-results.json |
| Browser fault QA | PASS, **3 scenarios** in browser-fault-results.json: 429, 503, empty/unmeasured with unavailable assessor |
| Viewports | Desktop **1920×1080**, laptop **1366×768**, mobile **390×844**; no horizontal page overflow |
| Interaction | Approval/rejection, audit, evidence links, keyboard tab arrows, reduced motion, actual light/dark toggle, invalid URLs and nonexistent repository all passed |
| Runtime | No JavaScript page exceptions in browser QA |
| Supplemental visual check | Mobile landing fits; reopening the persisted Express run retains its approved review; final laptop/mobile viewport screenshots inspected |
| Live Nemotron | PASS, **one real request**, HTTP **200**, finish reason **stop**, existing Zod validation succeeded, score **63** unchanged, independently recomputed **63**, UI shows the requested live model, **0** page errors |

Browser fault tests use the real routes/loop/collector against injected GitHub responses in a separate test-only server. Public repository tests call GitHub itself. Unit tests also verify SQLite survives close/reopen. This is not a claim of full accessibility certification or exhaustive browser-engine compatibility.

### Live NVIDIA follow-up — 2026-09-30 UTC / 2026-09-29 Pacific

After credentials became available in ignored `.env.local`, the integration was updated to `nvidia/nemotron-3.5-lightning-30b-a3b` at `https://integrate.api.nvidia.com/v1`. One real browser-driven assessment of Express called NVIDIA with temperature **0.3**, top-p **0.95**, max tokens **4096**, `response_format: {type: "json_object"}`, and top-level `chat_template_kwargs: {enable_thinking: false}`. No streaming or automatic retries. The live QA server disabled fallback so a template could not mask a failure.

The response used **887 prompt tokens / 179 completion tokens** and passed the assessor's existing Zod schema. The pre-model score event, final result, stored score, and independent calculation from captured GitHub evidence all matched **63 / HOLD**. The UI labelled the explanation **Live Nemotron response** with the saved model identifier and described its confidence as uncalibrated. Only safe transport metadata was captured; credentials and reasoning traces were neither logged nor included in artifacts.

Evidence: [browser assertions](live-nemotron-results.json), [sanitized wire metadata](live-nemotron-transport.json), [rendered explanation](live-nemotron.png). The earlier desktop/laptop/mobile and failure-matrix QA remains from the initial engineering pass; this follow-up additionally checked the live explanation at 1366×900 with reduced motion. Full unit tests, typecheck, production build and 20-check smoke were rerun after the transport change. Fallback and unavailable branches remain covered by unit tests and the earlier browser fault scenarios.

## 8. Known limitations

- Public GitHub repositories only; GitHub limits and search index lag apply. Counts/Actions state can move during collection; the file tree is commit-pinned.
- No actual test execution, coverage, dependency registry audit, vulnerability/secret scanning, branch protection evaluation, external CI, or inherited organization policy lookup.
- Category rules are coarse presence proxies. Raw numeric fields remain backward compatible: unknown uses zero contribution and `measurement: "unknown"`; consumers must honor that discriminator. Possible score is a policy range, not statistical confidence.
- **Current public inspection returns HOLD even for strong repositories**, because release-blocker triage and dependency freshness are not measured. Nothing falsely advertises SHIP from incomplete evidence.
- Estimates are illustrative effort for measured weaknesses, not a delivery forecast; unknown effort is excluded. No measured weaknesses means unmeasured effort.
- A live model's prose can be imperfect. It cannot modify stored score or structured verdict. One live NVIDIA response was verified; this does not establish model reliability across all repositories or guarantee future provider availability.
- Trusted local/demo server: no authentication, multi-tenant isolation, restart recovery for interrupted runs, or persistent-volume provisioning was added. Preserve SQLite and runs/ on the deployment volume. Global memory records history but does not infer historical risk signals.
- Historical saved runs retain their original score policy; do not compare them as if rescored.

## 9. Demo judgment

**Yes — technically honest enough for a skeptical senior-engineer demo as a read-only evidence triage tool.** It now proves two different repositories produce different captured observations and scores. Its limitations, unknowns, score policy, model source, and non-executing review are visible. It is not a release certification or security scanner.

## 10. Recommended 90-second flow

Follow [the exact timed script](../demo-script.md): Hello-World (0–25s), Express comparison (25–40s), score and unknowns (40–55s), model boundary (55–65s), recorded review/audit (65–80s), raw artifact and history (80–90s). Use saved snapshots if rate-limited and explicitly call them historical. Sample mode is an explicitly synthetic offline backup.
