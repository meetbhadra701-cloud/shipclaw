# ShipClaw — Deployment Plan

> Owner: Claude (Deployment Engineer + DevOps Architect)
> Date: 2026-05-16
> Status: READY TO DEPLOY

---

## Platform: Render Web Service

### Why Render

| Concern | Render Decision |
|---|---|
| Backend required | Render runs a persistent Node.js process — not a serverless function |
| Filesystem writes | Render has ephemeral local disk; runs/ and data/ survive the session |
| SQLite | Works on Render ephemeral disk; data resets on redeploy (acceptable for hackathon) |
| Port binding | Render injects `PORT` env var; ShipClaw reads it via `process.env["PORT"]` |
| Free tier | Render free web service supports Node; 512 MB RAM, 0.1 CPU — sufficient |
| Vercel | Excluded — serverless functions break SSE streaming, filesystem writes, and SQLite |
| Railway | Backup option if Render fails |

---

## Build Command

```
npm install && npm run build
```

- `npm install` — installs all dependencies (including tsx, now in `dependencies`)
- `npm run build` — runs Vite production build → `dist/ui/`

## Start Command

```
npm start
```

Resolves to: `node node_modules/.bin/tsx src/server/index.ts`

---

## What the Server Does in Production

1. Loads `.env` (if present on Render — not needed; env vars set via Render UI)
2. Creates `runs/` and `data/` directories if missing
3. Initialises SQLite (with in-memory fallback if SQLite native not available)
4. Registers all 9 API routes + `/api/health`
5. Detects `dist/ui/` and serves it as static frontend
6. SPA fallback: any non-API GET → `dist/ui/index.html`
7. Listens on `process.env.PORT` (Render injects this)

---

## Environment Variables (set via Render UI — never committed)

| Variable | Value | Required |
|---|---|---|
| `NEMOTRON_API_KEY` | `<secret>` | For live Nemotron path |
| `NEMOTRON_BASE_URL` | `https://integrate.api.nvidia.com/v1` | Yes |
| `NEMOTRON_MODEL` | `mistralai/mistral-nemotron` | Yes |
| `ALLOW_LLM_FALLBACK` | `true` | Yes — graceful fallback |
| `DEMO_MODE` | `true` | Yes for demo path |
| `ENABLE_EXA` | `false` | Yes |
| `EXA_ENABLED` | `false` | Yes |
| `EXA_TIMEOUT_MS` | `8000` | Optional |
| `EXA_MAX_SEARCHES_PER_RUN` | `3` | Optional |
| `ALLOW_REMOTE_WRITES` | `false` | Yes |
| `NODE_ENV` | `production` | Set by Render |

**Do not set `PORT`** — Render injects it automatically.

---

## Health Check Route

```
GET /api/health
```

Response:
```json
{
  "status": "ok",
  "service": "shipclaw",
  "timestamp": "...",
  "mode": "demo",
  "nemotron": "configured"
}
```

Configure in Render dashboard: Health Check Path = `/api/health`

---

## Persistence Caveats

| Item | Behaviour on Render Free |
|---|---|
| `runs/` directory | Ephemeral — survives during session, resets on redeploy or sleep |
| `data/shipclaw.sqlite` | Ephemeral — memory resets on restart |
| SQLite fallback | In-memory fallback activates if native SQLite fails |
| Production persistence | Add Render Persistent Disk ($7/month) for post-demo persistence |
| Hackathon acceptability | Ephemeral disk is fine — demo runs within a single session |

---

## Known Risks

| Risk | Mitigation |
|---|---|
| Free tier sleeps after 15min inactivity | Wake it up before demo; first request may take 10–20s cold-start |
| SSE streaming with Render | Render supports SSE; no nginx buffering to disable |
| CORS | Wide-open CORS already configured |
| SQLite native module | Falls back to InMemoryDb if `node:sqlite` unavailable in Render's Node version |
| TSX in production | Moved `tsx` to `dependencies` — available post-build |

---

## Render Service Configuration

| Setting | Value |
|---|---|
| Service type | Web Service |
| Runtime | Node |
| Branch | `main` |
| Root directory | (none — repo root) |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |
| Auto-deploy | On push to `main` |
