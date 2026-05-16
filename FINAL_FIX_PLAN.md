# ShipClaw — Final Fix Plan

> Owner: Claude (Final Verification Lead)
> Date: 2026-05-16
> Source: FINAL_SHIPCLAW_AUDIT.md findings FIND-001 through FIND-004

---

## Fixes to Execute

### FIX-001 — Remove emoji from report.ts section headings

| Field | Value |
|---|---|
| **Finding** | FIND-001 |
| **Severity** | Medium |
| **Blocks demo?** | No — but judges see these in Live Report Preview |
| **Safe to defer?** | No — should fix before demo; inconsistent with emoji-free UI panels |
| **Owner** | Claude |
| **File** | `src/agent/report.ts` |

**Exact fix:** Remove emoji prefix from every `#`/`##` heading template literal in `buildReadinessMd()`. Replace `verdictEmoji` (✅ / 🔴) with plain text in the heading. Remove `⚠️` from the issue draft footer in `buildIssueDraftMd()`. Keep `✅`/`❌` in table data cells (pass/fail indicators) — these are informative data, not decorative.

Headings to fix (14 total):

| Before | After |
|---|---|
| `# 🚢 ShipClaw Release Readiness Report` | `# ShipClaw Release Readiness Report` |
| `## ${verdictEmoji} Verdict: …` (where verdictEmoji = ✅ or 🔴) | `## Verdict: SHIP` / `## Verdict: HOLD` |
| `## 📊 Readiness Score` | `## Readiness Score` |
| `## 🎯 Score Band` | `## Score Band` |
| `## 🎲 Confidence` | `## Confidence` |
| `## ⏱️ Time-to-Demo-Ready` | `## Time-to-Demo-Ready` |
| `## 🔬 Readiness Score Breakdown` | `## Readiness Score Breakdown` |
| `## 🚧 Top Blockers` | `## Top Blockers` |
| `## 🔍 Release Risk Fingerprint` | `## Release Risk Fingerprint` |
| `## ⏳ Time-to-Ship Estimate` | `## Time-to-Ship Estimate` |
| `## 🛠️ Recommended Fix Order` | `## Recommended Fix Order` |
| `## 🔐 Approval-Gated Actions` | `## Approval-Gated Actions` |
| `## 🌐 External Evidence Check` | `## External Evidence Check` |
| `## 📋 Audit Summary` | `## Audit Summary` |

Issue draft footer:
| Before | After |
|---|---|
| `` > ⚠️ ${mode === "fallback" ? "SYNTHETIC FALLBACK" : "DEMO"} MODE — not real analysis`` | `` > ${mode === "fallback" ? "SYNTHETIC FALLBACK" : "DEMO"} MODE — not real analysis`` |

---

### FIX-002 — Create UI_REDESIGN_PLAN.md in repo

| Field | Value |
|---|---|
| **Finding** | FIND-002 |
| **Severity** | Low |
| **Blocks demo?** | No |
| **Safe to defer?** | Yes — documentation only |
| **Owner** | Claude |
| **File** | `UI_REDESIGN_PLAN.md` (new file in repo root) |

**Exact fix:** Create the in-repo mirror of the UI redesign plan (Phase 0 step 7 deliverable). Content: summary of the Command Center Polish redesign, phases executed, key design decisions, and links to QA report. Does not need to be the full plan document — a concise in-repo reference suffices.

---

## Deferred / No-Action Items

### FIND-003 — CLI subprocess env loading (Low)

| Field | Value |
|---|---|
| **Severity** | Low |
| **Blocks demo?** | No — browser path (which judges see) works live |
| **Action** | Document in DEPLOYMENT_UI_NOTES.md: "For CLI runs, export NEMOTRON_API_KEY before invoking npm run agent:run" |
| **Safe to defer?** | Yes |

### FIND-004 — Theme toggle coordinate (Info)

| Field | Value |
|---|---|
| **Severity** | Info |
| **Blocks demo?** | No — JS-confirmed present and accessible |
| **Action** | No fix needed |

---

## Post-Fix Verification

After executing FIX-001 and FIX-002:

1. `npm run typecheck` — 0 errors
2. `npm test` — 34/34
3. `npm run smoke` — 20/20
4. `npm run build` — success
5. Smoke-check generated `SHIPCLAW_READINESS.md` — confirm no emoji in section headings
6. Commit and push

---

## Status

| Fix | Status |
|---|---|
| FIX-001 (report.ts emoji) | ✅ complete — 14 headings cleaned, ⚠️ removed from issue draft |
| FIX-002 (UI_REDESIGN_PLAN.md) | ✅ complete — file created at repo root |
| FIND-003 (CLI env note) | ✅ documented in FINAL_EXECUTION_REPORT.md |
| Gates (typecheck/test/smoke/build) | ✅ all green — typecheck 0 errors, 34/34, 20/20, build 287 modules |
