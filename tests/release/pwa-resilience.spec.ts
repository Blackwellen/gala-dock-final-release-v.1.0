import {test,expect} from '@playwright/test';
import {createServer,type Server} from 'node:http';
import {readFileSync} from 'node:fs';
import type {AddressInfo} from 'node:net';
import AxeBuilder from '@axe-core/playwright';

// Isolated local proxy serves the real production app and worker. Only a harmless worker comment
// changes between revisions; no deployed asset, credential, account or shared cache is modified.
test.describe('production PWA lifecycle',()=>{
 test.skip(process.env.PWA_PRODUCTION_E2E!=='1','Requires the isolated production build, not next dev.');
 let server:Server,origin:string,revision=1;
 test.beforeAll(async()=>{
  const upstream=process.env.E2E_BASE_URL??'http://localhost:3119';
  server=createServer(async(req,res)=>{
   try{
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    if(req.url?.startsWith('/sw.js')){res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-store','Service-Worker-Allowed':'/'});res.end(readFileSync('public/sw.js','utf8')+`\n// isolated test revision ${revision}`);return;}
    const response=await fetch(upstream+(req.url??'/'),{redirect:'manual'});
    const headers=Object.fromEntries(response.headers);for(const key of ['content-encoding','content-length','transfer-encoding','connection'])delete headers[key];
    if(headers.location?.startsWith(upstream))headers.location=origin+headers.location.slice(upstream.length);
    res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()));
   }catch{res.writeHead(502);res.end('Isolated preview proxy unavailable');}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 });
 test.afterAll(async()=>{if(server)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});
 test('offline navigation reveals only the public fallback; API and identity pages are not cached',async({page})=>{
  await page.goto(`${origin}/login`);await page.evaluate(()=>navigator.serviceWorker.ready);await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  await page.evaluate(async()=>{await fetch('/icons/icon-192.png');await fetch('/api/maintenance');});
  await page.context().setOffline(true);await page.goto(`${origin}/organizer`);
  await expect(page.getByRole('heading',{name:'You’re offline',exact:true})).toBeVisible();await expect(page.getByText('Command Centre',{exact:true})).toHaveCount(0);
  const requests=await page.evaluate(async()=>{const output:string[]=[];for(const name of await caches.keys())for(const request of await(await caches.open(name)).keys())output.push(new URL(request.url).pathname);return output;});
  expect(requests).toContain('/offline.html');expect(requests.some(path=>/^\/(api|login|account|organizer|provider|checkout|studio)(\/|$)/.test(path))).toBe(false);
  await page.context().setOffline(false);await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByRole('heading',{name:'You’re offline',exact:true})).toHaveCount(0);
 });
 test('a worker update preserves form input until the user explicitly reloads',async({page})=>{
  await page.goto(`${origin}/login`);await page.evaluate(()=>navigator.serviceWorker.ready);await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  await page.getByLabel('Email',{exact:true}).fill('unsaved-pwa-fixture@example.com');revision++;
  await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration?.update();});
  await expect(page.getByRole('button',{name:'Reload to update',exact:true})).toBeVisible({timeout:30000});
  await expect(page.getByLabel('Email',{exact:true})).toHaveValue('unsaved-pwa-fixture@example.com');
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  await page.getByRole('button',{name:'Reload to update',exact:true}).click();
  await expect(page.getByRole('button',{name:'Reload to update',exact:true})).toHaveCount(0,{timeout:30000});await expect(page.getByLabel('Email',{exact:true})).toHaveValue('');
 });
});
