# ShipClaw — Deployment QA Report

> Owner: Claude (Deployment Engineer)
> Date: 2026-05-16
> Status: GREEN

---

## Deployment Summary

| Item | Value |
|---|---|
| **Public URL** | https://shipclaw.onrender.com |
| **Platform** | Render Web Service (Free tier) |
| **Commit hash** | `4db0216` |
| **Branch** | `main` |
| **Service ID** | `srv-d84crbjeo5us73e8crdg` |
| **Build command** | `npm install --include=dev && npm run build` |
| **Start command** | `npm start` |
| **Health check path** | `/api/health` |
| **Deploy time** | ~2 minutes (build + start) |

---

## Environment Variables Configured (masked)

| Variable | Status |
|---|---|
| `NEMOTRON_API_KEY` | ✅ Set (secret, masked) |
| `NEMOTRON_BASE_URL` | ✅ `https://integrate.api.nvidia.com/v1` |
| `NEMOTRON_MODEL` | ✅ `mistralai/mistral-nemotron` |
| `ALLOW_LLM_FALLBACK` | ✅ `true` |
| `DEMO_MODE` | ✅ `true` |
| `ENABLE_EXA` | ✅ `false` |
| `EXA_ENABLED` | ✅ `false` |
| `ALLOW_REMOTE_WRITES` | ✅ `false` |
| `NODE_ENV` | ✅ `production` |

---

## Verification Checks

### Health Endpoint
```
GET https://shipclaw.onrender.com/api/health
```
Response:
```json
{
  "status": "ok",
  "service": "shipclaw",
  "timestamp": "2026-05-16T20:09:07.662Z",
  "mode": "demo",
  "nemotron": "configured"
}
```
**Result: PASS**

### Dashboard Load
- URL: https://shipclaw.onrender.com ✅
- No console errors at idle ✅
- SC monogram logo visible ✅
- All capability badges render: Deterministic Score, Persistent Memory, Nemotron Reasoning, Approval-Gated, Audit Logged, Exa Optional ✅
- System status pills: NEMOTRON / EXA / DATA / MEMORY / APPROVAL all present ✅
- Goal panel: repo URL input, release goal textarea, demo mode checkbox, Run Analysis button ✅

### Demo Run Analysis (end-to-end)
- Demo mode checkbox checked ✅
- Run Analysis triggered ✅
- Hex loading overlay appeared ✅
- DEMO MODE banner displayed at top ✅
- Score: 55/100 (RISKY) ✅
- Decision: HOLD ✅
- Agent Timeline streaming with events ✅
- Time-to-Demo-Ready: 105–158 minutes ✅
- Findings table with score breakdown ✅
- Approval Required panel: MEDIUM risk, Approve/Reject buttons ✅
- Live Report Preview: SHIPCLAW_READINESS.md rendered with GENERATED badge ✅
- Nemotron: fallback mode (deterministic score used — clearly labeled) ✅

### Direct Page Reload
- Navigating directly to https://shipclaw.onrender.com loads correctly ✅
- SPA routing works — Express serves index.html for all non-API routes ✅

### No Secrets Visible
- No API keys visible in UI ✅
- No env var values exposed ✅

---

## Known Caveats

| Item | Detail |
|---|---|
| Nemotron in demo | Falls back to deterministic score (labeled clearly). Live Nemotron path available via browser when API key propagates. |
| Free tier sleep | Instance sleeps after 15min inactivity — first request may take 10–20s cold start. Wake it up before demo. |
| Ephemeral filesystem | runs/ and data/ reset on redeploy or sleep. Acceptable for hackathon session. |
| CLI Nemotron | CLI runs (npm run agent:run) need NEMOTRON_API_KEY exported — documented in FINAL_EXECUTION_REPORT.md |

---

## Build Fix Applied

First deploy failed with:
```
Error: Cannot find module '/opt/render/project/src/node_modules/vite/bin/vite.js'
```
Root cause: `NODE_ENV=production` caused `npm install` to skip devDependencies (including vite, typescript, react).

Fix applied: Build command changed from `npm install; npm run build` to `npm install --include=dev && npm run build`. This forces all dependencies to install during the build phase while keeping the runtime lean.

Second deploy: SUCCESS in ~2 minutes.

---

*QA completed: 2026-05-16 by Claude (Deployment Engineer)*
