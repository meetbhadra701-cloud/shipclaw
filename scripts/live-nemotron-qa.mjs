/** One opt-in real model request. Never prints API responses, keys, or reasoning. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { calculateReadinessScore, decisionForScore } from '../src/agent/scorer.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:8793';
const model = 'nvidia/nemotron-3.5-lightning-30b-a3b';
const browser = await chromium.launch({ headless: true, ...(process.env.QA_BROWSER_CHANNEL ? { channel: process.env.QA_BROWSER_CHANNEL } : {}) });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
const pageErrors = []; page.on('pageerror', () => pageErrors.push('Browser JavaScript exception'));
try {
  await page.goto(base);
  const health = await (await page.request.get(`${base}/api/health`)).json();
  assert.equal(health.nemotron, 'configured'); assert.equal(health.model, model);
  await page.locator('#repo-input').fill('https://github.com/expressjs/express');
  const started = page.waitForResponse(r => r.url().endsWith('/api/runs') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Analyze release', exact: true }).click();
  const { runId } = await (await started).json();
  await page.locator('.verdict__word').waitFor({ timeout: 100000 });
  const run = await (await page.request.get(`${base}/api/runs/${runId}`)).json();
  // source=nemotron can only be emitted after the existing Zod schema parses.
  assert.equal(run.assessorOutput?.source, 'nemotron', 'A validated live response is required; fallback cannot pass this test.');
  assert.equal(run.assessorOutput.mode, 'live'); assert.equal(run.assessorOutput.model, model);
  const evidence = await (await page.request.get(`${base}/api/reports/${runId}/files/evidence.json`)).json();
  const recomputed = calculateReadinessScore({ observations: evidence.observations, runId, mode: 'live' });
  assert.deepEqual(recomputed.categories, run.readinessScore.categories);
  assert.equal(recomputed.total, run.readinessScore.total);
  assert.equal(run.finalDecision, decisionForScore(recomputed));
  assert.equal(run.assessorOutput.decision, decisionForScore(recomputed));
  const events = (await (await page.request.get(`${base}/api/runs/${runId}/events`)).text()).split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
  const beforeModel = events.find(e => e.type === 'readiness_score_calculated');
  const final = events.find(e => e.type === 'final_result');
  assert.deepEqual(beforeModel.score, final.score);
  assert.deepEqual(final.score, run.readinessScore);
  assert(events.indexOf(beforeModel) < events.findIndex(e => e.type === 'state_entered' && e.state === 'ASSESS_WITH_NEMOTRON'));
  const label = await page.locator('.explain__source').innerText();
  assert(label.includes('Live Nemotron response') && label.includes(model));
  assert.equal(await page.locator('.explain__meta').count(), 1);
  assert.equal(Object.hasOwn(run.assessorOutput, 'score'), false);
  assert.equal(Object.hasOwn(run.assessorOutput, 'reasoning_content'), false);
  assert.equal(pageErrors.length, 0);
  await page.locator('.explain').screenshot({ path: 'docs/engineering/live-nemotron.png' });
  const result = { runId, testedAt: new Date().toISOString(), repo: run.repo, model, source: run.assessorOutput.source, validatedByExistingZodSchema: true, score: run.readinessScore.total, scoreUnchangedBeforeAndAfterModel: true, independentlyRecomputedScore: recomputed.total, decision: run.finalDecision, uiLabel: label, pageErrors: 0 };
  writeFileSync('docs/engineering/live-nemotron-results.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch {
  // An assertion can contain actual values. Do not dump errors or response payloads.
  console.error('Live Nemotron QA failed; no secrets or model payload printed. Inspect sanitized run status and transport diagnostics.');
  process.exitCode = 1;
} finally { await browser.close(); }
