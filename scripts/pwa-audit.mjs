// Uses existing Playwright storage states and real app. No writes except notification read state.
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium,webkit,firefox } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const base = process.env.E2E_BASE_URL ?? 'http://localhost:3107';
const widths = process.env.PWA_QUICK === '1' ? [320,390,820,1180,1440] : [320,344,360,375,390,393,412,430,480,600,640,744,768,800,820,834,900,1024,1180,1280,1440,1600];
const browserName=process.env.PWA_BROWSER??'chromium';const dpr=Number(process.env.PWA_DPR)||1;
const roles = process.argv.slice(2).filter(s => !s.startsWith('--'));
const out = 'artifacts/pwa/shell'; await fs.mkdir(out,{recursive:true});
const expected = {
 customer: ['Discover','Plan','My Events','My Tickets','Menu'], organizer:['Home','Events','Calendar','Marketplace','Menu'],
 provider:['Home','Bookings','Calendar','Listings','Menu'], admin:['Overview','Users','Workspaces','Events','Menu']
};
const homes = { customer:'/discover',organizer:'/organizer',provider:'/provider',admin:'/admin' };
const engine={chromium,webkit,firefox}[browserName];if(!engine)throw new Error('Unknown browser');
const browser = await engine.launch({ ...(browserName==='chromium'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{}), headless:true });
const results=[];
try {
 for(const role of roles.length ? roles : Object.keys(homes)) {
  const ctx=await browser.newContext({ storageState:`artifacts/auth/${role}.json`,deviceScaleFactor:dpr, reducedMotion:'reduce',locale:'en-GB',timezoneId:'Europe/London' });
  const page=await ctx.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(base+homes[role],{waitUntil:'networkidle',timeout:120000});
  if(new URL(page.url()).pathname!==homes[role]) { results.push({role,blocked:`authentication redirected to ${new URL(page.url()).pathname}`,status:response?.status()}); await ctx.close(); continue; }
  for(const width of widths) {
   for(const height of width<1280 ? [844,360] : [900]) {
    await page.setViewportSize({width,height});
    const nav=page.getByRole('navigation',{name:'Primary',exact:true});
    const labels=await nav.locator('a>span,button>span').allTextContents();
    const data=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,nav:document.querySelector('.pwa-tabs')?.getBoundingClientRect().toJSON(),top:document.querySelector('.pwa-top')?.getBoundingClientRect().toJSON(),main:document.querySelector('main')?.getBoundingClientRect().toJSON()}));
    const row={role,width,height,browser:browserName,dpr,labels:labels.map(x=>x.trim()),...data,issues:[]};
    if(data.overflow>1) row.issues.push(`page overflow ${data.overflow}px`);
    if(width<1280) {
     if(JSON.stringify(row.labels)!==JSON.stringify(expected[role])) row.issues.push('incorrect five-option navigation');
     if(data.nav?.bottom>height+1 || Math.abs(data.nav?.bottom-height)>1) row.issues.push('nav not anchored to viewport');
     await page.getByRole('button',{name:'Menu',exact:true}).click();
     const dialog=page.getByRole('dialog',{name:'Menu',exact:true});
     row.sheet=await dialog.evaluate(el=>({box:el.getBoundingClientRect().toJSON(),columns:getComputedStyle(el.querySelector('.pwa-grid')).gridTemplateColumns,overflow:getComputedStyle(document.body).overflow,focusInside:el.contains(document.activeElement)}));
     if(row.sheet.columns.split(' ').length!==3) row.issues.push('menu not three columns');
     if(row.sheet.box.bottom>height+1 || row.sheet.box.top<0) row.issues.push('sheet outside viewport');
     if(!row.sheet.focusInside) row.issues.push('focus not in sheet');
     await page.keyboard.press('Escape');
     if(await dialog.isVisible()) row.issues.push('Escape did not dismiss');
     if(!await page.getByRole('button',{name:'Menu',exact:true}).evaluate(el=>el===document.activeElement)) row.issues.push('focus not restored');
     if(width===390 && height===844 || width===1180 && height===360) {
      await page.screenshot({path:`${out}/${role}-${browserName}-dpr${dpr}-${width}x${height}.png`,fullPage:true});
      row.axe=(await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));
      await page.getByRole('button',{name:'Menu',exact:true}).click(); await page.screenshot({path:`${out}/${role}-${browserName}-dpr${dpr}-menu-${width}x${height}.png`});
      row.menuAxe=(await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));
      await page.getByRole('button',{name:'Close menu',exact:true}).click();
     }
    } else if(await nav.isVisible()) row.issues.push('mobile navigation visible on desktop');
    results.push(row); console.log(`${row.issues.length?'FAIL':'PASS'} ${role} ${width}x${height}${row.issues.length?': '+row.issues.join(', '):''}`);
   }
  }
  await fs.writeFile(`${out}/${role}-errors.json`,JSON.stringify(errors,null,2)); await ctx.close();
 }
} finally {
 await browser.close();
 await fs.writeFile(`${out}/report${roles.length?'-'+roles.join('-'):''}${browserName!=='chromium'||dpr!==1?'-'+browserName+'-dpr'+dpr:''}.json`,JSON.stringify({date:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),browser:browserName,dpr,results},null,2));
}
if(results.some(r=>r.blocked||r.issues?.length||r.axe?.length||r.menuAxe?.length)) process.exitCode=1;
