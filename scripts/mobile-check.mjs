import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const manifest=JSON.parse(await fs.readFile('artifacts/visual/manifest.json','utf8'));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[];
try {
 for(const row of manifest){
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://localhost:3107'+row.url,{waitUntil:'networkidle'});
  const layout=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth}));
  results.push({key:row.key,...layout,errors});
  if(layout.overflow||errors.length)console.log(row.key,JSON.stringify({...layout,errors}));
  await page.close();
 }
 await fs.writeFile('artifacts/testing/mobile.json',JSON.stringify(results,null,2));
 console.log(`${results.length} screens checked; ${results.filter(r=>r.overflow||r.errors.length).length} failures.`);
}finally{await browser.close();}
