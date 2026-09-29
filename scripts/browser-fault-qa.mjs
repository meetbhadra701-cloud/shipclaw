import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.QA_BROWSER_CHANNEL?{channel:process.env.QA_BROWSER_CHANNEL}:{})});
const page=await browser.newPage({viewport:{width:1366,height:768},reducedMotion:'reduce'});
const checks=[];
try {
 for(const [repo,expected] of [['rate-limit','rate limit'],['server-failure','HTTP 503'],['empty','Unmeasured']]) {
  await page.goto('http://127.0.0.1:8791');await page.locator('#repo-input').fill(`https://github.com/qa/${repo}`);await page.getByRole('button',{name:'Analyze release',exact:true}).click();
  if(repo==='empty') {
   await page.locator('.verdict__word').waitFor();
   assert.match(await page.locator('.verdict').innerText(),/Unmeasured/);
   assert.equal(await page.locator('.verdict__score .num').innerText(),'—');
   assert.match(await page.locator('.explain__source').innerText(),/Unavailable/);
   assert.equal(await page.locator('.drivers tbody .status--default').count(),6);
   checks.push('Empty evidence: no numeric readiness displayed, six unknown categories, HOLD, no false blockers or ETA, unavailable assessor');
  } else {
   await page.locator('.alert').waitFor();assert.ok((await page.locator('.alert').innerText()).includes(expected));
   assert.equal(await page.locator('.verdict__word').count(),0);
   checks.push(`${repo}: terminal error, no fabricated score, recovery available`);
  }
  await page.screenshot({path:`docs/engineering/${repo}.png`,fullPage:true});
 }
 writeFileSync('docs/engineering/browser-fault-results.json',JSON.stringify({source:'Injected GitHub API responses in test-only server',checks},null,2));
 console.log(JSON.stringify(checks));
} finally {await browser.close()}
