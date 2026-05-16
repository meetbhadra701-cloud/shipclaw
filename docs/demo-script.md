# ShipClaw — 3-Minute Demo Script

## Beat sheet

### 0:00 – 0:20 | Hook

> "You're about to ship. But is your repo actually ready? ShipClaw tells you in under 3 minutes."

- Open the terminal
- Show the dashboard URL (http://localhost:5173)

---

### 0:20 – 0:45 | Start a demo run

```bash
DEMO_MODE=true ALLOW_LLM_FALLBACK=true \
  npm run agent:run -- \
  --repo https://github.com/owner/repo \
  --goal "Check release readiness for v1.0" \
  --demo \
  --auto-approve-local
```

- Point out the 17 state machine events streaming in real time
- Highlight: **"The score is computed here — before any LLM is called."**

---

### 0:45 – 1:15 | Dashboard walkthrough

Open http://localhost:5173 (or show a pre-seeded run)

1. **Goal panel** — explain repo + goal inputs
2. **Agent Activity** — live event stream (role="log")
3. **Readiness Score** — score bar, band badge, category breakdown table
4. **Risk Fingerprint** — per-signal severity with memory provenance
5. **Time-to-Ship** — "65–98 minutes to fix these blockers"

Key talking point:
> "Everything you see — score, fingerprint, time estimate — is deterministic. Nemotron explains it. It doesn't invent it."

---

### 1:15 – 1:45 | Report preview

Scroll to the **Live Report Preview** panel.

- Show the rendered markdown: verdict, score breakdown table, blockers, fix order, audit trail
- Show the artifacts on disk:

```bash
cat runs/<runId>/SHIPCLAW_READINESS.md
cat runs/<runId>/github_issue_draft.md
cat runs/<runId>/memory_diff.md
```

Key talking point:
> "One click from this GitHub issue draft into your tracker. Memory means the second run knows what the first run saw."

---

### 1:45 – 2:10 | Approval gate

Show the Approval panel:
- "Before ShipClaw does anything destructive, it asks."
- Click **Approve** — show the action executing
- Or click **Reject** — show it stopping cleanly

---

### 2:10 – 2:35 | Live mode teaser

```bash
# Switch off demo mode (requires real keys in .env.local)
npm run agent:run -- \
  --repo https://github.com/your-real-repo \
  --goal "Is this ready to ship v2?"
```

- Watch real GitHub data flow in
- Score changes based on actual CI, issues, PRs
- Nemotron narrates: "Your CI is red. 3 unreviewed PRs. 2 Dependabot alerts..."

---

### 2:30 – 2:50 | Live rendered report

Open the **Live Report Preview** panel (already visible in dashboard).

- Point to the markdown table rendering in-browser from `SHIPCLAW_READINESS.md`
- "This is the same file that lands in your `runs/` directory — it's not a screenshot."

```bash
cat runs/ssXN5vTGx8cB/memory_diff.md   # show memory delta
cat runs/ssXN5vTGx8cB/audit.jsonl | head -5  # show audit trail
```

---

### 2:50 – 3:00 | Close

> "ShipClaw: deterministic score, human approval, memory across runs, polished report. Under 3 minutes from repo URL to ship/hold decision."

- Show the final verdict badge: ✅ SHIP or 🔴 HOLD
- Leave the dashboard open showing the full report render

---

## Backup slides (if live demo fails)

1. Screenshot: Dashboard with score 84/100 READY → SHIP decision
2. Screenshot: SHIPCLAW_READINESS.md rendered in GitHub
3. Screenshot: memory_diff.md showing score improved run-over-run
4. Terminal recording: smoke test passing 20/20 checks

## Reset between demos

```bash
# Clear runs and reset memory (in-memory DB resets on restart)
rm -rf runs/*
npm run server  # fresh InMemoryDb
```
