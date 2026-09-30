/** Optional browser QA: npm install --no-save playwright, or set PLAYWRIGHT_MODULE to a bundled installation. */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:8787';
const out = process.env.QA_OUTPUT || 'docs/engineering';
mkdirSync(out, {recursive:true});
const browser = await chromium.launch({headless:true, ...(process.env.QA_BROWSER_CHANNEL ? {channel:process.env.QA_BROWSER_CHANNEL} : {})});
const page = await browser.newPage({viewport:{width:1366,height:768},reducedMotion:'reduce',colorScheme:'dark'});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const checks=[];
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS '+name)};
const captured=[];
async function analyze(repo, sample=false){
 await page.goto(base); await page.locator('#repo-input').waitFor();
 if(sample) await page.getByRole('button',{name:'Use sample (no network)',exact:true}).click();
 else await page.locator('#repo-input').fill(repo);
 const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/runs')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Analyze release',exact:true}).click();
 const response=await responsePromise; const {runId}=await response.json();
 await page.locator('.verdict__word').waitFor({timeout:60000});
 await page.locator('.explain__text').waitFor({timeout:30000});
 const run=await (await page.request.get(`${base}/api/runs/${runId}`)).json();
 const evidence=await (await page.request.get(`${base}/api/reports/${runId}/files/evidence.json`)).json();
 captured.push({run,evidence}); return {run,evidence};
}
try {
 const first=await analyze('https://github.com/octocat/Hello-World');
 check('Hello-World has real evidence',first.evidence.source==='github'&&first.evidence.latestCommitSha?.length===40);
 await page.screenshot({path:`${out}/laptop-hello-world.png`,fullPage:true});
 const second=await analyze('https://github.com/expressjs/express');
 check('Express has different pinned evidence and score',second.evidence.latestCommitSha!==first.evidence.latestCommitSha&&second.evidence.scan.testFileCount!==first.evidence.scan.testFileCount&&second.run.readinessScore.total!==first.run.readinessScore.total);
 check('read-only checks absent',!second.evidence.observations.some(o=>o.source==='shell'));
 check('fallback source and confidence honest',second.run.assessorOutput?.source==='deterministic_fallback'&&second.run.assessorOutput.confidence===null);
 check('unknown category visibly shown',(await page.locator('.drivers').innerText()).includes('Unknown'));
 await page.screenshot({path:`${out}/laptop-express.png`,fullPage:true});
 await page.getByRole('button',{name:'Record approval',exact:true}).click();
 await page.locator('.actions__resolved').waitFor();
 check('approval recorded without execution',(await page.locator('.actions__resolved').innerText()).includes('recorded in the audit trail'));
 await page.getByRole('tab',{name:/Audit trail/}).click();
 check('human review visible in audit',(await page.locator('#details').innerText()).includes('approval_approved'));
 await page.getByRole('tab',{name:/Evidence/}).click();
 check('evidence links, limitations and source visible',(await page.locator('#details').innerText()).includes('What we could not measure'));
 await page.getByRole('tab',{name:/Evidence/}).focus(); await page.keyboard.press('ArrowRight');
 check('keyboard tab navigation',await page.getByRole('tab',{name:/Risks/}).getAttribute('aria-selected')==='true');
 for(const [label,width,height,theme] of [['desktop-dark',1920,1080,'dark'],['laptop-light',1366,768,'light'],['mobile-dark',390,844,'dark'],['mobile-light',390,844,'light']]) {
   await page.setViewportSize({width,height});
   if(await page.locator('html').getAttribute('data-theme')!==theme) await page.getByRole('button',{name:`Switch to ${theme} mode`,exact:true}).click();
   check(`${label} theme toggle`,await page.locator('html').getAttribute('data-theme')===theme);
   await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
   await page.evaluate(()=>window.scrollTo(0,0));
   check(`${label} no horizontal page overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
   await page.screenshot({path:`${out}/${label}.png`,fullPage:true});
 }
 check('reduced motion enabled',await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches));
 await page.setViewportSize({width:1366,height:768});
 const sample=await analyze('',true); check('sample explicit, separate from live',sample.evidence.source==='fixture'&&sample.run.mode==='demo'&&sample.run.assessorOutput.fallbackReason==='demo');
 await page.getByRole('button',{name:'Record rejection',exact:true}).click();await page.locator('.actions__resolved').waitFor();
 check('rejection recorded',(await page.locator('.actions__resolved').innerText()).includes('Rejected'));
 await page.goto(base);await page.locator('#repo-input').fill('https://example.com/not/github');await page.getByRole('button',{name:'Analyze release',exact:true}).click();await page.locator('#analyze-error').waitFor();
 check('invalid URL shown inline',(await page.locator('#analyze-error').innerText()).includes('github.com'));
 await page.locator('#repo-input').fill('https://github.com/shipclaw-nonexistent-20260929/no-such-repository');await page.getByRole('button',{name:'Analyze release',exact:true}).click();await page.locator('.alert').waitFor({timeout:30000});
 check('nonexistent repository ends with actionable error',(await page.locator('.alert').innerText()).includes('not found'));
 await page.screenshot({path:`${out}/invalid-repository.png`,fullPage:true});
 check('no browser exceptions',errors.length===0);
 writeFileSync(`${out}/browser-results.json`,JSON.stringify({checks,errors,liveModel:'Not tested: no credentials configured',runs:captured.map(({run,evidence})=>({id:run.id,repo:run.repo,score:run.readinessScore,assessor:run.assessorOutput,evidence}))},null,2));
} finally { await browser.close(); }
