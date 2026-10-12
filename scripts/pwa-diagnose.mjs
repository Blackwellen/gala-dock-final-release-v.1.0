import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {resolveUrl} from './ws-resolve.mjs';
const [role,route,width='320']=process.argv.slice(2);
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const ctx=await browser.newContext({storageState:process.env.PWA_AUTH_STATE??`artifacts/auth/${role}.json`,viewport:{width:Number(width),height:844}});
const page=await ctx.newPage(); await page.goto((process.env.E2E_BASE_URL??'http://localhost:3107')+await resolveUrl(route),{waitUntil:'networkidle',timeout:120000});
if(process.argv.includes('--buttons')) {console.log(JSON.stringify(await page.locator('.cb-cta').evaluateAll(nodes=>nodes.map(el=>({text:el.textContent,rect:el.getBoundingClientRect().toJSON(),minHeight:getComputedStyle(el).minHeight,overflow:getComputedStyle(el.parentElement).overflow,overlapping:[...el.parentElement.parentElement.querySelectorAll('button,a')].filter(s=>s!==el).map(s=>({text:s.textContent,rect:s.getBoundingClientRect().toJSON()}))}))),null,2));await browser.close();process.exit();}
if(process.argv.includes('--axe')) {
 console.log(JSON.stringify((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,html:n.html}))})),null,2));
 await browser.close();process.exit();
}
console.log(JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('main *')].map(e=>({e,r:e.getBoundingClientRect(),s:getComputedStyle(e)})).filter(({r,s})=>r.width&&r.height&&(r.right>innerWidth+1||r.left<0)&&s.position!=='fixed').slice(0,30).map(({e,r,s})=>({tag:e.tagName,class:e.className,text:e.textContent?.slice(0,65),x:r.x,width:r.width,right:r.right,minWidth:s.minWidth,grid:s.gridTemplateColumns,whiteSpace:s.whiteSpace,overflow:s.overflowX}))),null,2));
await page.screenshot({path:`artifacts/pwa/shell/diagnose-${role}.png`}); await browser.close();
