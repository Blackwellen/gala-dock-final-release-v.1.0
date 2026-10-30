// Real browser zoom via an isolated Chrome profile preference, verified against measured DPR.
// Chromium implementation reference: chrome/browser/ui/zoom/chrome_zoom_level_prefs.cc.
// No CSS zoom, transform, page scale or viewport emulation is injected.
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const base=process.env.E2E_BASE_URL??'http://localhost:3119';
const root=path.resolve('artifacts/auth');await fs.mkdir(root,{recursive:true});
const out=path.resolve(process.env.PWA_ZOOM_OUT??'artifacts/pwa/zoom');await fs.mkdir(out,{recursive:true});
const homes={customer:'/discover',organizer:'/organizer',provider:'/provider',admin:'/admin'};
if(process.env.PWA_ZOOM_ROUTE){for(const role of process.argv.slice(2))if(role in homes)homes[role]=process.env.PWA_ZOOM_ROUTE;}
const roles=process.argv.slice(2);const results=[];let baselineDpr;
for(const factor of [1,.8,1.25,1.5,2,4]){
 const profile=path.join(root,`pwa-zoom-${Date.now()}-${Math.round(factor*100)}`);
 if(!profile.startsWith(root+path.sep))throw new Error('Profile escaped the ignored auth directory');
 await fs.mkdir(path.join(profile,'Default'),{recursive:true});
 await fs.writeFile(path.join(profile,'Default','Preferences'),JSON.stringify({partition:{default_zoom_level:{x:Math.log(factor)/Math.log(1.2)}}}));
 const ctx=await chromium.launchPersistentContext(profile,{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',viewport:null,headless:true,args:['--window-size=1280,900'],reducedMotion:'reduce'});
 try{for(const role of roles){
  const state=JSON.parse(await fs.readFile(`artifacts/auth/pwa-resume-${role}.json`,'utf8'));await ctx.clearCookies();await ctx.addCookies(state.cookies);
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+homes[role],{waitUntil:'networkidle',timeout:120000});
  const geometry=await page.evaluate(()=>({width:innerWidth,height:innerHeight,outerWidth,outerHeight,dpr:devicePixelRatio,overflow:document.documentElement.scrollWidth-innerWidth,bodyZoom:getComputedStyle(document.body).zoom,rootZoom:getComputedStyle(document.querySelector('.k-root,.ws-app')??document.body).zoom,nav:document.querySelector('.pwa-tabs')?.getBoundingClientRect().toJSON()}));
  baselineDpr??=geometry.dpr;const issues=[];
  if(Math.abs(geometry.dpr/baselineDpr-factor)>.03)issues.push('Requested native browser zoom was not applied; no zoom pass may be claimed');
  if(new URL(page.url()).pathname!==homes[role])issues.push('Authentication or authorization redirect');
  if(geometry.overflow>1)issues.push(`Horizontal page overflow: ${geometry.overflow}px`);
  if(geometry.width<1280 && (!geometry.nav?.height || geometry.nav.bottom>geometry.height+1))issues.push('Mobile navigation not in viewport');
  if(errors.length)issues.push(...errors);
  results.push({role,requestedZoom:factor,measuredZoom:geometry.dpr/baselineDpr,geometry,issues});
  await page.screenshot({path:path.join(out,`${role}-${Math.round(factor*100)}.png`)});console.log(`${issues.length?'FAIL':'PASS'} ${role} zoom ${Math.round(factor*100)}% measured ${Math.round(geometry.dpr/baselineDpr*100)}%`);await page.close();
 }}finally{await ctx.close();}
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({method:'Native Chrome profile partition default zoom; DPR-verified; no CSS or CDP page scaling',results},null,2));
}
if(results.some(r=>r.issues.length))process.exitCode=1;
