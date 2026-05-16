# ShipClaw — Demo Backup Plan

> Owner: Claude (Deployment Engineer)
> Date: 2026-05-16

---

## Primary Demo Path

**URL:** https://shipclaw.onrender.com

**Pre-demo checklist:**
1. Open URL 5 minutes before demo (wake the free instance from sleep)
2. Verify health: `curl https://shipclaw.onrender.com/api/health`
3. Verify dashboard loads and DEMO MODE banner is visible
4. Check Nemotron status pill in header

**Demo flow:**
1. Navigate to https://shipclaw.onrender.com
2. Check "Demo mode" checkbox
3. Enter repo: `https://github.com/meetbhadra701-cloud/shipclaw`
4. Enter goal: `Check if this repo is ready to ship v1.0`
5. Click Run Analysis
6. Walk through: hex overlay → Score → Decision → Agent Timeline → Findings → Approval Gate → Live Report Preview

---

## Backup Path: Local Dev Server

If Render is down or sleeping:

```bash
cd /Users/meetbhadra/shipclaw
npm run dev
```

Opens:
- Backend: http://localhost:8787
- Frontend: http://localhost:5173

**With live Nemotron:**
```bash
export NEMOTRON_API_KEY=$(grep NEMOTRON_API_KEY .env.local | cut -d= -f2-)
npm run dev
```

---

## Backup Path: Pre-built Production Server

Run Express serving the built frontend (no Vite needed):

```bash
cd /Users/meetbhadra/shipclaw
npm run build  # if dist/ui is stale
npm start
```

Opens at: http://localhost:8787

---

## Emergency Path: CLI Demo

If browser UI is unavailable entirely:

```bash
cd /Users/meetbhadra/shipclaw
DEMO_MODE=true ALLOW_LLM_FALLBACK=true npm run agent:run -- \
  --repo https://github.com/meetbhadra701-cloud/shipclaw \
  --goal "Check if this repo is ready to ship v1.0" \
  --demo \
  --auto-approve-local
```

Produces 6 artifacts in `runs/<id>/`:
- `SHIPCLAW_READINESS.md` — full 14-section report
- `github_issue_draft.md`
- `audit.jsonl`
- `memory_before.jsonl` / `memory_after.jsonl` / `memory_diff.md`

Read the report:
```bash
cat runs/$(ls -t runs/ | head -1)/SHIPCLAW_READINESS.md
```

---

## Decision Tree

```
Render URL working? → YES → Use primary path
       ↓ NO
Laptop at venue? → YES → npm run dev
       ↓ NO
Can share screen? → YES → Pre-recorded terminal session
       ↓ NO
Paste SHIPCLAW_READINESS.md content into chat
```

---

## Render Service Details

| Item | Value |
|---|---|
| URL | https://shipclaw.onrender.com |
| Service ID | srv-d84crbjeo5us73e8crdg |
| Dashboard | https://dashboard.render.com/web/srv-d84crbjeo5us73e8crdg |
| Manual redeploy | Click "Manual Deploy" → Deploy latest commit |
| Restart | Settings → Restart Service |

---

## Cold Start Warning

Render free instances sleep after 15 minutes of inactivity. The first request after sleep takes 10–20 seconds. **Always open the URL at least 1 minute before the demo starts.**

Quick wake command:
```bash
curl -s https://shipclaw.onrender.com/api/health
```
