# ShipClaw — Deployment UI Notes

> Date: 2026-05-16
> Audience: Demo presenter, hackathon judges, future deployers

---

## Quick Start (Local Demo — Recommended)

```bash
# 1. Ensure .env.local exists with keys
cp .env.example .env.local
# Edit .env.local — add NEMOTRON_API_KEY, set DEMO_MODE=true, ALLOW_LLM_FALLBACK=true

# 2. Install dependencies
npm install

# 3. Apply database schema
npm run migrate

# 4. Start dev server (Vite UI + Express API together)
npm run dev
# → UI:  http://localhost:5173  (or 5174/5175 if port taken)
# → API: http://localhost:8787

# 5. Open browser → fill form → check "Demo mode" → Run Analysis
```

**Important:** Start `npm run dev` AFTER `.env.local` is populated. dotenv reads it at startup. If you add the key after starting, restart the server.

---

## Environment Variables for Demo

```env
# .env.local (gitignored — never committed)
NEMOTRON_API_KEY=nvapi-...          # Required for live Nemotron (85% confidence)
NEMOTRON_BASE_URL=https://integrate.api.nvidia.com/v1
NEMOTRON_MODEL=mistralai/mistral-nemotron
DEMO_MODE=true                      # Use fixture repo data
ALLOW_LLM_FALLBACK=true             # Continue even if Nemotron times out
ENABLE_EXA=false                    # Exa off by default
```

---

## Deployment Targets

### Option A — Local (Primary, Recommended for Hackathon Demo)

Run entirely on the presenter's laptop. Zero egress latency. Fastest demo experience.

```bash
npm run dev
```

Pros: No cloud config, API keys stay local, no cold start.
Cons: Requires Node 20+ on presenter machine.

---

### Option B — Brev.dev (Cloud GPU, Recommended for Live NVIDIA Demo)

Brev gives access to NVIDIA hardware and is the natural fit for a Nemotron hackathon demo.

```bash
# On Brev instance:
git clone git@github.com:meetbhadra701-cloud/shipclaw.git
cd shipclaw
npm install && npm run migrate

# Set env vars in Brev secrets dashboard (never CLI)
# Then:
npm run dev -- --host 0.0.0.0
```

Expose port 5173 (Vite) and 8787 (Express) via Brev's port forwarding.

---

### Option C — Render.com (Persistent Cloud, Secondary)

Good for a shareable judge link that stays up for the hackathon duration.

1. Create two Render services:
   - **Web Service** (Express API): `npm run server`, root dir `/`, port 8787
   - **Static Site** (Vite UI): build command `npm run build`, publish dir `dist/ui`

2. Set environment variables in Render dashboard (never in repo).

3. Update `vite.config.ts` proxy target to point at the Render API URL.

**Note:** The Vite dev proxy (`/api → localhost:8787`) only works in development. For production, set `VITE_API_BASE` or hardcode the API URL.

---

### Option D — Netlify (Static UI only — No Backend)

Netlify can host only the static Vite build. The Express API must run elsewhere.

Not recommended as a standalone option — the SSE event stream, approval API, and memory API all require the Express backend.

---

## Hero Video Slot

If you have a `hero-loop.mp4` file (looping animation of ship/data visualization):

```bash
cp your-video.mp4 public/assets/hero-loop.mp4
```

The video will auto-play as a subtle background (opacity 0.08) in the hero section. CSS fallback gradient is always shown — build never fails if the file is absent.

Recommended video spec: 1920×400px, H.264, <5MB, no audio.

---

## Projector / Large-Screen Notes

- The layout switches from `300px + 1fr` to `340px + 1fr` at 1280px+ (projector).
- Font size increases: hero title to 3rem, panel padding to 24px.
- All colors pass WCAG AA at 1280px width.
- Test at 1920×1080 before the demo. Chrome DevTools → Responsive → 1920×1080.

---

## Demo Run Best Practices

1. **Pre-run**: open the UI, verify system status shows all green dots.
2. **Check "Demo mode"** to avoid live GitHub API calls during the demo.
3. **Keep Exa disabled** (`ENABLE_EXA=false`) unless you have a valid Exa API key.
4. **Expected output**: 55/100 RISKY — HOLD — 105–158 min (fixture data is static).
5. **Approval gate**: if Nemotron proposes actions, the approval panel appears with `role="alert"`. Click "Approve Selected" or "Reject All" to continue.
6. **Copy report**: after run completes, click "Copy" in the Live Report Preview header to copy the full SHIPCLAW_READINESS.md to clipboard.

---

## Secrets Checklist (Pre-Demo)

- [ ] `.env.local` exists and has NEMOTRON_API_KEY
- [ ] `.env.local` is in `.gitignore` — verify with `git status` (should not appear)
- [ ] `git log --oneline -5` — confirm no .env file in recent commits
- [ ] Browser DevTools → Network → no API key visible in request headers (key is server-side only)

---

*Notes written: 2026-05-16*
