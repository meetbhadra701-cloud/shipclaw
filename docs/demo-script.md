# ShipClaw — 90-Second Demo

Setup: `npm run build && DEMO_MODE=true ALLOW_LLM_FALLBACK=true npm start` → http://localhost:8787
(or `npm run dev` → http://localhost:5173). Laptop resolution is fine; everything below is above the fold at 1366×768.
To show a live Nemotron explanation instead of the template, set `NEMOTRON_API_KEY` and leave `ALLOW_LLM_FALLBACK` unset.

| Time | On screen | Say |
|---|---|---|
| 0–10 s | Landing page | "This is ShipClaw. Give it a repository and it tells you whether you're actually ready to ship, and proves why." |
| 10–15 s | Click **Use sample repository**, then **Analyze release** | "Evidence collection is fixture-backed today, and the product says so on every run. Everything on top of that evidence is real." |
| 15–30 s | The **Agent workflow** rail fills in state by state | "This is a bounded 17-state agent: load memory, plan, collect evidence, run allowlisted checks, then score. Each state is a real streamed event with a real timing." |
| 30–45 s | The verdict lands: **HOLD · 55/100 · 1h 45m – 2h 38m** | "HOLD, 16 points below the 71-point release bar. About two hours of work. Fix first: CI is failing, there's no SECURITY.md, and test coverage is thin." |
| 45–60 s | Scroll to **Why ShipClaw says HOLD** | "Every category is sized by its weight and filled by what it earned. CI health cost 15 points. Dependencies has *no evidence*, so it's hatched: it got a conservative 50 instead of pretending." |
| 60–75 s | Point at the **Explanation** source label, then the **Bounded AI** trust row | "The important part: the AI doesn't invent this score. Fixed rules compute it before any model call. Nemotron only explains it, and if its verdict disagrees with the threshold, the code overrides it." |
| 75–90 s | Click **Approve** on Proposed actions → open **Audit trail** (shows `approval_approved`) → **Memory & history** | "Actions wait for a human, and ShipClaw never touches your repo. The approval is audited, memory persists across runs, and the report and GitHub issue draft are real artifacts on disk." |

## Backup

- A past run can be reopened instantly from **Recent analyses** on the landing page (no replay delay).
- `npm run smoke` runs the full loop headless: 20 checks, HOLD 55/100.
- Screenshots: `docs/redesign/after/`.

## Reset between demos

```bash
rm -rf runs/* data/shipclaw.sqlite   # clears run history and memory
```
