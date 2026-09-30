# ShipClaw on Render

ShipClaw is one Node/Express service. Express serves the built React frontend from `dist/ui`, the same-origin `/api` routes, and long-lived SSE connections. SQLite and run artifacts require writable storage across requests and restarts.

## Why the Vercel deployment returned 404

The previous deployment reported a successful build, but the repository did not configure a Vercel runtime entrypoint for `src/server/index.ts` or serving/routing for the complete app. Vite writes `dist/ui`, not a complete deployable backend. A successful build therefore did not prove that `/` or Express's API existed on the deployed URL. Merely publishing `dist/ui` would also leave the SQLite-backed API and SSE unavailable. This change targets a continuing Render Node process instead; it does not change Vercel settings or add a serverless adapter.

## Runtime and commands

- Runtime: **Node 24.21.0**, pinned in `.node-version`; `engines.node` is `>=24.21.0 <25`. This includes native `node:sqlite`.
- Build: **`npm ci && npm run build`**.
- Start: **`npm start`** (launches `src/server/index.ts` through the production dependency `tsx`).
- Set **`NPM_CONFIG_INCLUDE=dev`** so `npm ci` includes Vite and TypeScript during the production build.
- Set **`NODE_ENV=production`**. Express binds **`0.0.0.0:$PORT`**; Render supplies `PORT`. Do not copy the local `PORT=8787` setting into Render.
- Health check: **`/api/health`**. Production refuses to start without SQLite or `dist/ui/index.html`, so a missing build cannot silently become a healthy API-only service.
- No separate Vite server, static site, API hostname, rewrite, or frontend API environment variable is needed.

## One persistent disk

Use exactly **`/opt/render/project/src/storage`** as both the Render disk mount path and `SHIPCLAW_DATA_DIR`.

```text
/opt/render/project/src/storage/
  shipclaw.sqlite
  shipclaw.sqlite-wal / shipclaw.sqlite-shm  (while SQLite is active)
  runs/<runId>/
    evidence.json
    SHIPCLAW_READINESS.md
    github_issue_draft.md
    audit.jsonl
    memory_before.jsonl
    memory_after.jsonl
    memory_diff.md
```

The path is configuration, not a Render-specific constant in business logic. No storage root configured means the original local `data/shipclaw.sqlite` and `runs/` layout. `npm run migrate`, the server, the agent, and artifact-download routes share the configuration. The schema initializes automatically at server startup; no pre-deploy migration command is required.

Render persistent disks require a **paid service**. Start with one instance and a 1 GB disk, increasing capacity as run history grows. Only files below the mount persist. A disk supports one service instance and makes redeploys interrupt that instance; builds/pre-deploy commands cannot access the disk. See [Render persistent disk documentation](https://render.com/docs/disks).

Changing the root does not move existing data automatically. To import local history, stop the source server and use SQLite's backup procedure; copy its database and matching run folders into the new layout. Historical audit append paths are stored as absolute paths, so moving old history between machines needs a deliberate migration. This change verifies restart/redeploy at the **same configured path**, not arbitrary relocation of existing databases.

## Environment variables in the Render dashboard

Enter secret values only in Render's Environment UI. Never upload `.env.local` or paste credentials into code, the Blueprint, build commands, or logs.

| Variable | Value / purpose |
|---|---|
| `NODE_ENV` | `production` |
| `NPM_CONFIG_INCLUDE` | `dev` (build tools required) |
| `NODE_VERSION` | Optional override: `24.21.0`; otherwise `.node-version` selects it. Remove any conflicting old override. |
| `SHIPCLAW_DATA_DIR` | `/opt/render/project/src/storage` with a persistent disk mounted there |
| `NEMOTRON_API_KEY` | Secret: provide through the dashboard for live explanations |
| `NEMOTRON_BASE_URL` | `https://integrate.api.nvidia.com/v1` |
| `NEMOTRON_MODEL` | `nvidia/nemotron-3.5-lightning-30b-a3b` |
| `GITHUB_TOKEN` | Secret: recommended for GitHub API limits; public reads work without it where allowed |
| `DEMO_MODE` | `false` |
| `ALLOW_LLM_FALLBACK` | `true` |
| `ENABLE_EXA` | `false` by default; set `true` to enable optional external evidence |
| `EXA_ENABLED` | Alias for the same flag. Either flag being `true` enables Exa; set both `false` to disable. |
| `EXA_API_KEY` | Secret, needed only if Exa is enabled |

Missing or failed NVIDIA credentials use the labelled deterministic fallback. The GitHub evidence collector remains live. Exa is off in the Blueprint. No secrets are included in the repository; `.env.local` remains ignored.

## Exact manual dashboard steps

1. **Review this local deployment commit first.** It has not been pushed or merged. Make the reviewed fix available on GitHub before creating the service. For production, use `main` only once this fix has been approved and merged; current `main` does not yet contain it. To validate a branch before merge, push the reviewed `codex/production-deployment` branch and select that branch explicitly in Render instead.
2. In the [Render dashboard](https://dashboard.render.com/), choose **New → Web Service**, connect GitHub, and select **`meetbhadra701-cloud/shipclaw`**. Choose a **Web Service**, not a Static Site.
3. Name it `shipclaw`, select the reviewed deployment branch, choose runtime **Node**, and leave **Root Directory blank** (repository root). Choose your region and a **paid instance type that supports a disk**, such as Starter. Keep one instance.
4. Set **Build Command** to `npm ci && npm run build`; set **Start Command** to `npm start`.
5. Under **Environment / Advanced**, add the variables above, entering actual secret values only in the dashboard. Leave `PORT` for Render to supply.
6. Add a **persistent disk**, name `shipclaw-storage`, size **1 GB**, mount path **`/opt/render/project/src/storage`**. Verify `SHIPCLAW_DATA_DIR` matches it exactly. Do not mount over the source root, `src/`, or `dist/`.
7. Set **Health Check Path** to **`/api/health`**. Leave pre-deploy command empty. Create the web service and wait for build/start/health checks.
8. Open the service's assigned **`https://<service>.onrender.com/`** URL. Confirm the React application loads and CSS/JS requests return 200. Open `/api/health`: expect HTTP 200, `status: "ok"`, and `storage: "sqlite"`.
9. Analyze a public repository, verify `/api/runs/.../events` streams and completes, inspect the evidence download and explanation source, and record the run ID. Restart the Render service and reopen that run from history; verify report/evidence downloads still work. A green build alone is insufficient.
10. Keep the Vercel deployment/domain unchanged until the Render URL is verified. Domain migration is a separate manual decision.

Alternative: after the reviewed fix is on `main`, use **New → Blueprint** and select this repository. Review `render.yaml` before applying it: it creates a paid Starter web service and persistent disk. Render prompts for the two `sync: false` secret values. Add Exa settings only if desired. The same URL and restart checks still apply.

Current labels and fields are documented in [Render Web Services](https://render.com/docs/web-services), [Node version selection](https://render.com/docs/node-version), [health checks](https://render.com/docs/health-checks), and [Blueprint configuration](https://render.com/docs/blueprint-spec).

## Local production verification

Run the standard suite and build, then the opt-in production QA script:

```sh
npm ci
npm run typecheck
npm test
npm run smoke
npm run build
node scripts/production-qa.mjs
```

QA uses Playwright supplied by your environment: optionally set `PLAYWRIGHT_MODULE` to its module path and `QA_BROWSER_CHANNEL=msedge` for installed Edge. It starts `npm start` under `NODE_ENV=production` on a free port with a fresh temporary storage root, reads a real public GitHub repository, injects a local NVIDIA 503 to prove fallback, checks same-origin API/SSE/assets, and restarts against that root. It saves safe result metadata and a browser screenshot under this directory. It does not call live NVIDIA or alter the configured credentials. `QA_NPM_CLI` can specify npm's CLI script if Node/npm use an unusual installation layout.

See [captured production results](production-results.json) for exact checks. The local checks do not certify a Render deployment: the manual service/domain and restart checks above must still be completed on Render.

### Verified on 2026-09-29 Pacific

Node **24.21.0**, npm **11.19.0**, Windows with installed Edge/Playwright. Production process used `npm start`, `NODE_ENV=production`, a supplied port, and a fresh temporary `SHIPCLAW_DATA_DIR`.

| Check | Result |
|---|---|
| `npm ci` with production env and `NPM_CONFIG_INCLUDE=dev` | PASS, 412 packages installed |
| `npm run typecheck` | PASS |
| `npm test` | **100/100**, 13 test files (five storage/route tests added) |
| `npm run smoke` | **20/20**, sample HOLD 50 |
| `npm run build` | PASS, 300 modules, output `dist/ui`; JS 375.30 kB / gzip 116.36 kB |
| Production browser/server QA | **17/17 checks**, zero browser JavaScript exceptions |
| `/` and `/api/health` | Both HTTP **200**; root exactly matches built index HTML; health reports SQLite |
| Browser assets / API / SSE | JS and CSS load; API and EventSource same-origin; final result and stream end received |
| Real GitHub assessment | Express commit `7ef98448f8b38099ab1ded55e458538ad47a51e7`, **63 / HOLD** |
| Fallback | One locally injected NVIDIA 503; explicit template label, null confidence; no live NVIDIA request |
| Persistence | SQLite and all seven artifacts under configured root; history, score, explanation and artifact downloads survive server process restart |

The first Windows install encountered files locked by existing development processes; after releasing those processes, the clean install passed. `npm ci` also reported **14 dependency advisories** (1 low, 6 moderate, 5 high, 2 critical). No dependency versions were upgraded in this deployment-only change; the lockfile was synchronized with the existing production `tsx` declaration and new engine requirement. These advisories remain a separate dependency-maintenance limitation.

Changed files: `.node-version`, `render.yaml`, `.env.example`, `.gitignore`, `package.json`, `package-lock.json`, `src/storage/paths.ts`, `src/storage/paths.test.ts`, `src/storage/db.ts`, `src/agent/loop.ts`, `src/server/index.ts`, `src/server/routes.ts`, `src/server/routes.test.ts`, `scripts/migrate.ts`, `scripts/production-qa.mjs`, `README.md`, `COMMUNICATION_LOG.md`, and this deployment guide/result JSON/screenshot. No frontend components or styles changed. No Render service or account setting was created or modified.

## Operational limits retained

This change makes the existing app runnable and persistent on a Node host; it does not add authentication, tenant isolation, rate limiting, retention, or restart recovery for runs interrupted mid-analysis. Finished runs survive restart; in-flight jobs do not resume automatically. A disk is persistence, not a backup strategy. Do not treat unauthenticated review recording as access control or expose the service as a multi-user security boundary. All repository analysis remains read-only; private repositories and arbitrary remote execution remain unsupported. Product behavior, UI, scoring, and model boundaries are unchanged.
