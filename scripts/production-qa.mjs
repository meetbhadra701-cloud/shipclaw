/** Opt-in production QA: built UI + real GitHub reads; NVIDIA is fault-injected locally. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = resolve(process.env.QA_OUTPUT || 'docs/deployment');
mkdirSync(output, { recursive: true });
const storage = mkdtempSync(join(tmpdir(), 'shipclaw-production-'));
const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); console.log(`PASS ${name}`); };
// A local 503 validates fallback without contacting NVIDIA or exposing its key.
let modelRequests = 0;
const fault = createServer((_req, res) => { modelRequests++; res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"error":{"message":"QA injected failure"}}'); });
fault.listen(0, '127.0.0.1'); await once(fault, 'listening');
const portProbe = createServer(); portProbe.listen(0, '127.0.0.1'); await once(portProbe, 'listening');
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, PORT: String(port), NODE_ENV: 'production', SHIPCLAW_DATA_DIR: storage,
  DEMO_MODE: 'false', ENABLE_EXA: 'false', EXA_ENABLED: 'false', EXA_API_KEY: '', ALLOW_LLM_FALLBACK: 'true',
  NEMOTRON_API_KEY: 'qa-local-placeholder', NEMOTRON_BASE_URL: `http://127.0.0.1:${fault.address().port}/v1` };
const pathKey = Object.keys(env).find(k => k.toLowerCase() === 'path') || 'PATH';
env[pathKey] = dirname(process.execPath) + (process.platform === 'win32' ? ';' : ':') + (env[pathKey] || '');
const npm = process.env.QA_NPM_CLI || (process.platform === 'win32'
  ? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  : resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'));
let child;
let browser;
let serverOutput = '';
async function start() {
  serverOutput = '';
  child = spawn(process.execPath, [npm, 'start'], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-8000); });
  for (let i = 0; i < 150; i++) {
    assert.equal(child.exitCode, null, 'Production server exited before health check');
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch { /* startup */ }
    await delay(100);
  }
  throw new Error('Production server did not become healthy');
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
  else process.kill(-child.pid, 'SIGTERM');
  await exited;
}
try {
  await start();
  check('npm start binds the supplied PORT on 0.0.0.0', serverOutput.includes(`0.0.0.0:${port}`));
  const home = await fetch(base);
  check('/ returns the built React HTML with HTTP 200', home.status === 200 && await home.text() === readFileSync('dist/ui/index.html', 'utf8'));
  const healthResponse = await fetch(`${base}/api/health`);
  const health = await healthResponse.json();
  check('/api/health returns 200 with SQLite initialized', healthResponse.status === 200 && health.status === 'ok' && health.storage === 'sqlite');
  check('SQLite is created under the configured root', existsSync(join(storage, 'shipclaw.sqlite')));
  browser = await chromium.launch({ headless: true, ...(process.env.QA_BROWSER_CHANNEL ? { channel: process.env.QA_BROWSER_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  const errors = []; const apiOrigins = []; const assets = [];
  page.on('pageerror', () => errors.push('JavaScript exception'));
  page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/')) apiOrigins.push(new URL(r.url()).origin); });
  page.on('response', r => { if (new URL(r.url()).pathname.startsWith('/assets/')) assets.push({ status: r.status(), type: r.request().resourceType() }); });
  await page.goto(base); await page.locator('#repo-input').waitFor();
  const repo = 'https://github.com/expressjs/express';
  await page.locator('#repo-input').fill(repo);
  const posted = page.waitForResponse(r => r.url().endsWith('/api/runs') && r.request().method() === 'POST');
  const streamed = page.waitForResponse(r => /\/api\/runs\/[^/]+\/events$/.test(r.url()));
  await page.getByRole('button', { name: 'Analyze release', exact: true }).click();
  const { runId } = await (await posted).json();
  const stream = await streamed;
  await page.locator('.verdict__word').waitFor({ timeout: 90000 });
  const events = await stream.text();
  check('live browser SSE delivers final_result and stream_end', stream.headers()['content-type'].includes('text/event-stream') && events.includes('"type":"final_result"') && events.includes('"type":"stream_end"'));
  const run = await (await fetch(`${base}/api/runs/${runId}`)).json();
  check('real public GitHub run completes in live evidence mode', run.status === 'complete' && run.mode === 'live');
  check('NVIDIA failure uses explicit fallback without confidence', modelRequests === 1 && run.assessorOutput?.source === 'deterministic_fallback' && run.assessorOutput.fallbackReason === 'request_failed' && run.assessorOutput.confidence === null);
  const evidence = await (await fetch(`${base}/api/reports/${runId}/files/evidence.json`)).json();
  check('captured evidence comes from a real pinned GitHub commit', evidence.source === 'github' && /^[a-f0-9]{40}$/.test(evidence.latestCommitSha));
  const listing = await (await fetch(`${base}/api/reports/${runId}`)).json();
  check('all seven artifacts are written under the configured disk root', run.artifactDir === join(storage, 'runs', runId) && listing.artifacts.length === 7 && listing.artifacts.every(name => existsSync(join(storage, 'runs', runId, name))));
  check('report API serves the configured artifacts', (await fetch(`${base}/api/reports/${runId}/readiness`)).status === 200);
  check('React JavaScript and CSS assets load successfully', assets.some(a => a.type === 'script') && assets.some(a => a.type === 'stylesheet') && assets.every(a => a.status === 200));
  check('browser API calls and EventSource stay same-origin', apiOrigins.length > 0 && apiOrigins.every(origin => origin === base));
  check('fallback is visibly labelled in the UI', (await page.locator('.explain__source').innerText()).includes('model request failed'));
  await stop();
  await start();
  const history = await (await fetch(`${base}/api/runs`)).json();
  const saved = history.runs.find(r => r.id === runId);
  check('same-storage restart preserves run history and score', saved?.status === 'complete' && saved.score === run.readinessScore.total);
  check('same-storage restart preserves artifacts', (await fetch(`${base}/api/reports/${runId}/files/evidence.json`)).status === 200);
  await page.goto(base);
  await page.locator('.history__row').filter({ hasText: 'expressjs/express' }).first().click();
  await page.locator('.verdict__word').waitFor();
  check('persisted history reopens in React with the saved explanation', (await page.locator('.explain__source').innerText()).includes('model request failed'));
  check('browser has no JavaScript exceptions', errors.length === 0);
  await page.screenshot({ path: join(output, 'production-restart.png'), fullPage: true });
  const result = { testedAt: new Date().toISOString(), node: process.version, platform: process.platform, startCommand: 'npm start', nodeEnv: env.NODE_ENV, checks, repo, runId, commit: evidence.latestCommitSha, score: run.readinessScore.total, decision: run.finalDecision, fallback: run.assessorOutput.source, artifactCount: listing.artifacts.length, realNvidiaRequests: 0, restartedWithSameStorage: true };
  writeFileSync(join(output, 'production-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  // Do not dump child output, env, provider errors, response bodies, or model traces.
  console.error(error instanceof assert.AssertionError ? `Production QA assertion failed: ${error.message.split('\n')[0]}` : 'Production QA failed; server output and response bodies withheld.');
  process.exitCode = 1;
} finally {
  await browser?.close(); await stop(); await new Promise(resolve => fault.close(resolve));
}
