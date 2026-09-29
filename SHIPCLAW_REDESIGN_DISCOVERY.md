# ShipClaw — Redesign Discovery

> Date: 2026-09-29 · Branch `claude/lucid-tesla-ns2znk` · Base commit `e52e9b7`
> Rule applied throughout: **when docs and code disagree, current code wins.**

## 1. Environment & repository

| Item | Value |
|---|---|
| Canonical repo | `/home/user/shipclaw` (remote `github.com/meetbhadra701-cloud/shipclaw`) |
| Branch / commit | `claude/lucid-tesla-ns2znk` at `e52e9b7` (same as `main`), clean working tree |
| Package manager | npm (`package-lock.json`) · Node 22 here (docs say 24; `node:sqlite` works on both) |
| Frontend entry | `src/ui/index.html` → `src/ui/main.tsx` → `src/ui/App.tsx` (Vite, root `src/ui`) |
| Backend entry | `src/server/index.ts` (Express, `:8787`, serves `dist/ui` in production) |
| Agent entry | `src/agent/loop.ts` (`runAgentLoop`), CLI `src/agent/run.ts` |
| Scripts | `typecheck`, `test` (vitest), `smoke`, `build`, `dev`, `server`, `start` |
| Baseline gates | typecheck ✅ · tests 34/34 ✅ · smoke 20/20 ✅ (HOLD 55/100) · build ✅ |

### About "search my computer"

This session ran in an **ephemeral Linux cloud container**, not your Windows machine. The only
ShipClaw material reachable was the cloned repository and its git history (40 commits,
2026‑05‑15 → 2026‑05‑16). I searched the container file system (`/home`, `/root`, `/tmp`)
for `shipclaw`, `nemotron`, `nemoclaw` and `shortesthack`. There were no hits outside the repo,
apart from vitest temp databases. The only file ever deleted in git history is a reverted early
`DEMO_QA_TRACKER.md`. **Desktop, Documents, Downloads and OneDrive could not be searched.** To
include that material, run a session on your machine, or copy the relevant files into the repo.

## 2. Source inventory (repo docs)

| Source | Date | What it tells us | Still true? |
|---|---|---|---|
| `README.md` | 05‑16 | Product pitch, 17 states, API, 13 panels, env vars | Mostly. **"Real shell checks run against ShipClaw itself" is false**, because the shell tool is a stub. The 13-panel list is superseded by this redesign |
| `FINAL_SHIPCLAW_AUDIT.md` | 05‑16 | Judging criteria from shortesthack.com, "not a wrapper" proof | Partly. Claims the risk fingerprint "labels signals `fromMemory: true`", but code always sets `false`. Claims "AWAITING_APPROVAL holds execution", but the loop does not wait |
| `FINAL_DEMO_PROOF.md` | 05‑16 | **Live Nemotron call recorded** (run `mU2a6_IXV3aC`, confidence 0.85, decision matched threshold) | True as history. Live calls need `NEMOTRON_API_KEY` and must *not* have `DEMO_MODE=true` together with `ALLOW_LLM_FALLBACK=true` |
| `DEPLOYMENT_PLAN.md` | 05‑16 | Render deploy, auto-deploy on push to `main`; env `DEMO_MODE=true`, `ALLOW_LLM_FALLBACK=true` | True. **Consequence: the deployed demo never calls Nemotron** (see §4) |
| `UI_POLISH_PLAN.md`, `UI_REDESIGN_PLAN.md`, `UI_*QA.md` | 05‑16 | Rule "do not remove any panel", fixed 13-panel order, NVIDIA green, glass hero, hex overlay | Historical. The fixed 13-panel rule is the core UX problem; capabilities are kept, the panels are not |
| `docs/demo-script.md` | 05‑15 | 3-minute CLI-first demo | Stale. Promises "click Approve — show the action executing" and "watch real GitHub data flow in", neither of which exists |
| `TASK_STATE.md` | 05‑16 | X‑003 (memory-aware fingerprint), X‑004, **X‑005 (real GitHub/repo tools)**, X‑007 still `todo` | True, and it matches the code |
| `COMMUNICATION_LOG.md` | 05‑15/16 | Two-agent (Claude + Codex) build log | Historical |
| `fixtures/demo/*.json` | 05‑15 | Fixture observation files | **Not read by any code**. Fixture evidence is hardcoded in `src/tools/github.ts` and `repo.ts` |

## 3. What the product actually does (verified in code)

The pipeline is **evidence → deterministic analysis → score → LLM explanation**, and the code
enforces it:

1. **17-state loop** (`loop.ts`): INIT → LOAD_MEMORY → PLAN → FETCH_GITHUB_DATA → SCAN_REPO →
   RUN_SAFE_CHECKS → CALCULATE_SCORE → BUILD_RISK_FINGERPRINT → ESTIMATE_TIME_TO_SHIP →
   OPTIONAL_EXA_EXTERNAL_EVIDENCE → ASSESS_WITH_NEMOTRON → PROPOSE_ACTIONS → WAIT_FOR_APPROVAL →
   EXECUTE_APPROVED_ACTIONS → UPDATE_MEMORY → WRITE_ARTIFACTS → FINALIZE. Each emitted event goes to
   SQLite and `runs/<id>/audit.jsonl`.
2. **Deterministic scorer** (`scorer.ts`): six weighted categories (CI 25, tests 20, blockers 20,
   docs 15, security 10, deps 10). Each observation maps to 0–100 with fixed rules. A category with
   no observations gets a **conservative default of 50**. A category passes at ≥ 60. Bands:
   ≤ 40 NOT_READY, ≤ 70 RISKY, ≥ 71 READY. No LLM is involved.
3. **Risk fingerprint** (`riskFingerprint.ts`): one item per failing category, with severity
   `<30 critical`, `<50 high`, otherwise medium. It records how many prior runs exist
   (`basedOnMemory`, `memoryGenerationCount`), but **items are not derived from memory yet**
   (`fromMemory` is always `false`; X‑003 is open).
4. **Time-to-ship** (`timeToShip.ts`): critical × 120 + high × 45 + medium × 20 minutes (min 30),
   max = min × 1.5.
5. **Assessor** (`assessor.ts`): Nemotron receives the finished score and returns JSON validated by
   zod. **If Nemotron's decision disagrees with the threshold, the code overrides it** and appends
   an uncertainty note. Nemotron is not called, and a templated explanation is used instead
   (`mode: "fallback"`, fixed confidence 0.7), when `DEMO_MODE && ALLOW_LLM_FALLBACK`, or when the
   call fails and fallback is allowed. If it fails and fallback is not allowed, the assessor output
   is `null` and the decision comes from the threshold.
6. **Memory** (`memory.ts`, SQLite `data/shipclaw.sqlite`): before/after snapshots, run counter,
   last score and decision, per-repo last-seen, and a diff artifact. It persists across runs.
7. **Approval**: `PROPOSE_ACTIONS` creates a pending approval from up to three recommended actions.
   **The loop does not block on it.** Without `autoApproveLocal` it continues immediately, and
   "execute" only writes an audit line. Nothing is ever executed against a repository.
8. **Artifacts**: `SHIPCLAW_READINESS.md` (14 sections), `github_issue_draft.md`, `audit.jsonl`,
   `memory_before/after.jsonl`, `memory_diff.md`.
9. **Exa**: fully implemented, sanitized, capped at 3 searches, and **off by default**.

### Implemented vs fixture

| Capability | Status |
|---|---|
| GitHub metadata (`github.getRepoBundle`) | **Fixture in every mode**: CI failing, 3 open issues, 1 open PR |
| Repo scan (`repo.scanImportantFiles`) | **Fixture in every mode**: README yes, CHANGELOG no, 4 test files, no SECURITY.md |
| Safe checks (`shell.runSafeCommand`) | **Simulated**: allowlist-checked, never executes a process |
| Scoring, fingerprint, estimate, memory, report, audit, SSE | Real, running on the evidence above |
| Nemotron | Real client; used only when configured and not in demo + fallback |

## 4. Bugs and honesty problems found

| # | Problem | Impact | Action |
|---|---|---|---|
| B1 | Shell allowlist checks only the first two words, so `npm run typecheck` becomes `npm run` and is rejected | ShipClaw records **its own rejection as a failing typecheck** and adds false CI evidence | Fixed (exact-match allowlist) + test |
| B2 | `POST /api/runs` found the new run ID via `listRuns(1)` after 50 ms | Concurrent runs could return the wrong run | Fixed: the server generates the run ID and passes it into the loop |
| B3 | A loop that throws leaves `status: running` | SSE never ends and the UI spins forever | Fixed: the run is marked `error` with a message |
| B4 | Approve/reject endpoints write no audit entry | Human decisions are not auditable | Fixed: audit rows `approval_approved` / `approval_rejected` |
| H1 | The old UI says **"Nemotron: Online — mistral-nemotron"** whenever the assessor did not report fallback, including when it returned `null` because no key is set | False claim | New UI shows the real explanation source |
| H2 | Non-demo runs are labelled **"Live GitHub + shell"** | False: the tools are fixtures | The UI always discloses the fixture evidence source |
| H3 | Banner: "Nemotron reasoning … all real" in demo mode | False on the deployed config (demo + fallback) | Replaced by per-run facts |
| H4 | Fallback confidence (always 70 %) is displayed as if measured | Invented number | Confidence is shown only when Nemotron produced it |
| H5 | "Time-to-Demo-Ready" vs "Time-to-ship" naming | Inconsistent | The UI uses "Time to ship" |

## 5. Current UX failures (from the running app, see `docs/redesign/before/`)

- **5-second test fails.** The first viewport is dominated by brand, six capability pills, five
  status pills and a decorative glass background. The only call to action is a small sidebar form.
  Nothing says what the product answers.
- **15-second test fails.** After a run, the verdict appears in three places: hero metrics,
  sidebar "Decision" and the report. None of them is dominant. The biggest blocker requires reading
  a table. The time estimate is shown as "105–158 min".
- **Trust test fails.** "Deterministic" appears as a pill label, not as a demonstrated fact. The
  evidence behind each category score is hidden in the markdown report. A category scored by
  *default* (no evidence) looks the same as a measured one.
- **Agent test is weak.** A full-screen hexagon overlay hides the UI while the agent runs. The
  timeline is a raw event log (`tool_call_finished ← shell.runSafeCommand ✗ (0ms)`) that shows
  internal event names rather than the 17 workflow states.
- **Density.** Thirteen equal-weight panels stacked vertically: 6,234 px of scroll at laptop
  width. The report duplicates the score, fingerprint and time estimate a second time.
- **Mobile.** The sticky demo banner covers content, the verdict scrolls away, and the form comes
  after the metrics.
- **Approval** appears as `role="alert"` with auto-focus. The UI implies "Approve" executes
  something, which it does not.

## 6. Strongest features to foreground

1. The **deterministic score with visible per-signal evidence**, and the rule that the LLM cannot change it (enforced in code, not just prompted).
2. The **17-state bounded workflow**, streamed live over SSE.
3. The **explicit time-to-ship formula**.
4. **Persistent memory** with before/after diffs.
5. The **audit trail and six artifacts**, including a paste-ready GitHub issue.

## 7. Product narrative

> **Is this repo ready to ship?** ShipClaw collects release evidence, scores it with fixed rules,
> estimates the remediation effort, and lets an AI model explain the result without being able
> to change it. Every step is streamed and logged.

## 8. Technical constraints

- Evidence tools are fixtures until X‑005 lands. The UI must say so on every run.
- The approval gate records decisions but does not pause the loop. The UI must not claim it
  executes anything.
- A demo run completes in about 50 ms, which is too fast to watch. The UI replays the *real*
  event stream at a readable pace and states the real duration.
- UI code must not import `src/shared/constants.ts`, which reads `process.env`. Heuristic
  constants were moved to a pure module shared by the server and the UI.
