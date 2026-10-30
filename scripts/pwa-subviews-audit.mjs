// Follow actual in-page tabs and wizard links from the repository's authenticated route sweeps.
// Read-only: no submit, publish, send, approval or financial buttons are clicked.
import fs from 'node:fs/promises';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const base=process.env.E2E_BASE_URL??'http://localhost:3119';
const output=process.env.PWA_SUBVIEWS_REPORT??'artifacts/pwa/maximum-subviews.json';
const read=async file=>{const raw=await fs.readFile(file);return raw[0]===255&&raw[1]===254?raw.subarray(2).toString('utf16le'):raw.toString('utf8').replace(/^\uFEFF/,'');};
const log=await read('artifacts/pwa/maximum-customer-organizer.log');
const routes=[...log.matchAll(/^OK\s+200\s+(customer|organizer)\s+(\/\S+)/gm)].map(m=>({role:m[1],url:m[2]}));
for(const role of ['organizer','provider'])routes.push({role,url:`/${role}/media`});
const providers=JSON.parse(await read('artifacts/visual/ws-layout/provider-mobile.json')).report;
for(const row of providers)if(row.resolved&&!row.issues.length)routes.push({role:'provider',url:row.resolved});
const recheck=process.env.PWA_SUBVIEWS_RECHECK_REPORT;
if(recheck){const failed=JSON.parse(await read(recheck)).report.filter(row=>row.issues.length);routes.splice(0,routes.length,...failed.map(row=>({role:row.role,url:row.route})));}
const requested=process.argv.slice(2);const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const normalized=route=>{const url=new URL(route,base);url.searchParams.sort();return url.pathname+url.search;};
const report=[];await fs.mkdir('artifacts/pwa/subviews',{recursive:true});
try{for(const role of ['customer','organizer','provider'].filter(role=>!requested.length||requested.includes(role))){
 const ctx=await browser.newContext({storageState:`artifacts/auth/pwa-resume-${role}.json`,viewport:{width:390,height:844},deviceScaleFactor:2,reducedMotion:'reduce',locale:'en-GB',timezoneId:'Europe/London'});
 const page=await ctx.newPage();const queue=[...new Set(routes.filter(r=>r.role===role).map(r=>normalized(r.url)))];const seen=new Set();let errors=[];
 page.on('pageerror',error=>errors.push(error.message.slice(0,160)));
 for(let index=0;index<queue.length;index++){
  const route=queue[index];if(seen.has(route))continue;seen.add(route);errors=[];const issues=[];
  try{
   const response=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:60000});
   await page.locator('main h1,h1').first().waitFor({timeout:30000});
   await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,2000))]));
   if(response?.status()!==200)issues.push(`HTTP ${response?.status()}`);
   const landed=new URL(page.url());if(/^\/(login|mfa|access)/.test(landed.pathname))issues.push('lost authorized session');
   const body=await page.locator('body').innerText();if(/This page could not be found|Application error|This page could not load/.test(body))issues.push('error or not-found screen');
   const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,heading:document.querySelector('main h1')?.textContent??document.querySelector('h1')?.textContent}));
   if(layout.overflow>1)issues.push(`page overflow ${layout.overflow}px`);
   // Static, aria-hidden poster artwork is incidental image content, not interface text.
   // Keep its adjacent title, metadata, opening/report buttons and the editor in scope.
   const axe=(await new AxeBuilder({page}).exclude('.ml-thumb[aria-hidden="true"]').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}));
   if(axe.length)issues.push(...axe.map(v=>`axe:${v.id}`));issues.push(...errors.map(e=>`pageerror:${e}`));
   const links=await page.locator('main nav a[href], main [class*="-tabs"] a[href], main [role="tablist"] a[href], main .k-seg a[href], main .ws-seg a[href]').evaluateAll(nodes=>nodes.map(n=>({href:n.getAttribute('href'),label:n.textContent?.trim()})));
   if(!recheck)for(const link of links){if(!link.href)continue;const next=new URL(link.href,base);if(next.origin!==new URL(base).origin||next.pathname!==landed.pathname)continue;if(!['tab','view','sub','step','section'].some(key=>next.searchParams.has(key)&&next.searchParams.get(key)!==landed.searchParams.get(key)))continue;const candidate=normalized(next.pathname+next.search);if(!queue.includes(candidate))queue.push(candidate);}
   report.push({role,route,landed:landed.pathname+landed.search,status:response?.status(),...layout,issues,axe,subviewLinks:links});
   if(issues.length)await page.screenshot({path:`artifacts/pwa/subviews/${role}-${index}.png`,fullPage:true});
   console.log(`${issues.length?'FAIL':'PASS'} ${role} ${route}${issues.length?' '+issues.join('; '):''}`);
  }catch(error){report.push({role,route,issues:[String(error.message).slice(0,200)]});console.log(`FAIL ${role} ${route}`);}
  await fs.writeFile(output,JSON.stringify({observedUtc:new Date().toISOString(),scope:'Actual authenticated route and in-page query tab/wizard navigation, 390x844 DPR2. No mutation or whole-workflow certification.',report},null,2));
 }
 await ctx.close();
}}finally{await browser.close();}
console.log(`${report.filter(row=>!row.issues.length).length}/${report.length} route/subview cases clean`);
if(report.some(row=>row.issues.length))process.exitCode=1;
