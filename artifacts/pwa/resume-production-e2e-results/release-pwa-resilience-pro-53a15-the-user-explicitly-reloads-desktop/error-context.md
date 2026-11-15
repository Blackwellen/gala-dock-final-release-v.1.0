# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: release\pwa-resilience.spec.ts >> production PWA lifecycle >> a worker update preserves form input until the user explicitly reloads
- Location: tests\release\pwa-resilience.spec.ts:36:6

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  -   1
+ Received  + 138

- Array []
+ Array [
+   Object {
+     "description": "Ensure ARIA attributes are not prohibited for an element's role",
+     "help": "Elements must only use permitted ARIA attributes",
+     "helpUrl": "https://dequeuniversity.com/rules/axe/4.13/aria-prohibited-attr?application=playwright",
+     "id": "aria-prohibited-attr",
+     "impact": "serious",
+     "nodes": Array [
+       Object {
+         "all": Array [],
+         "any": Array [],
+         "failureSummary": "Fix all of the following:
+   aria-label attribute cannot be used on a span with no valid role attribute.",
+         "html": "<span class=\"tooltip-anchor\" tabindex=\"0\" aria-label=\"When unchecked, you’ll be signed out when you close your browser.\">",
+         "impact": "serious",
+         "none": Array [
+           Object {
+             "data": Object {
+               "messageKey": "noRoleSingular",
+               "nodeName": "span",
+               "prohibited": Array [
+                 "aria-label",
+               ],
+               "role": null,
+             },
+             "id": "aria-prohibited-attr",
+             "impact": "serious",
+             "message": "aria-label attribute cannot be used on a span with no valid role attribute.",
+             "relatedNodes": Array [],
+           },
+         ],
+         "target": Array [
+           ".tooltip-anchor",
+         ],
+       },
+     ],
+     "tags": Array [
+       "cat.aria",
+       "wcag2a",
+       "wcag412",
+       "EN-301-549",
+       "EN-9.4.1.2",
+       "RGAAv4",
+       "RGAA-7.1.1",
+     ],
+   },
+   Object {
+     "description": "Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds",
+     "help": "Elements must meet minimum color contrast ratio thresholds",
+     "helpUrl": "https://dequeuniversity.com/rules/axe/4.13/color-contrast?application=playwright",
+     "id": "color-contrast",
+     "impact": "serious",
+     "nodes": Array [
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "bgColor": "#fdfdfe",
+               "contrastRatio": 4.2,
+               "expectedContrastRatio": "4.5:1",
+               "fgColor": "#7078a4",
+               "fontSize": "10.5pt (14px)",
+               "fontWeight": "normal",
+               "messageKey": null,
+             },
+             "id": "color-contrast",
+             "impact": "serious",
+             "message": "Element has insufficient color contrast of 4.2 (foreground color: #7078a4, background color: #fdfdfe, font size: 10.5pt (14px), font weight: normal). Expected contrast ratio of 4.5:1",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<section class=\"auth-card\" aria-labelledby=\"auth-title\">",
+                 "target": Array [
+                   "section",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element has insufficient color contrast of 4.2 (foreground color: #7078a4, background color: #fdfdfe, font size: 10.5pt (14px), font weight: normal). Expected contrast ratio of 4.5:1",
+         "html": "<div class=\"auth-divider\">Use another method</div>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           ".auth-divider",
+         ],
+       },
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "bgColor": "#eff2fd",
+               "contrastRatio": 4.47,
+               "expectedContrastRatio": "4.5:1",
+               "fgColor": "#646ca1",
+               "fontSize": "8.3pt (11px)",
+               "fontWeight": "normal",
+               "messageKey": null,
+             },
+             "id": "color-contrast",
+             "impact": "serious",
+             "message": "Element has insufficient color contrast of 4.47 (foreground color: #646ca1, background color: #eff2fd, font size: 8.3pt (11px), font weight: normal). Expected contrast ratio of 4.5:1",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<div class=\"auth-security\">",
+                 "target": Array [
+                   ".auth-security",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element has insufficient color contrast of 4.47 (foreground color: #646ca1, background color: #eff2fd, font size: 8.3pt (11px), font weight: normal). Expected contrast ratio of 4.5:1",
+         "html": "<small>Your data is protected with enterprise-grade security, including optional multi-factor authentication (MFA).</small>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           "small",
+         ],
+       },
+     ],
+     "tags": Array [
+       "cat.color",
+       "wcag2aa",
+       "wcag143",
+       "TTv5",
+       "TT13.c",
+       "EN-301-549",
+       "EN-9.1.4.3",
+       "ACT",
+       "RGAAv4",
+       "RGAA-3.2.1",
+     ],
+   },
+ ]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {createServer,type Server} from 'node:http';
  3  | import {readFileSync} from 'node:fs';
  4  | import type {AddressInfo} from 'node:net';
  5  | import AxeBuilder from '@axe-core/playwright';
  6  | 
  7  | // Isolated local proxy serves the real production app and worker. Only a harmless worker comment
  8  | // changes between revisions; no deployed asset, credential, account or shared cache is modified.
  9  | test.describe('production PWA lifecycle',()=>{
  10 |  test.skip(process.env.PWA_PRODUCTION_E2E!=='1','Requires the isolated production build, not next dev.');
  11 |  let server:Server,origin:string,revision=1;
  12 |  test.beforeAll(async()=>{
  13 |   const upstream=process.env.E2E_BASE_URL??'http://localhost:3119';
  14 |   server=createServer(async(req,res)=>{
  15 |    try{
  16 |     if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  17 |     if(req.url?.startsWith('/sw.js')){res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-store','Service-Worker-Allowed':'/'});res.end(readFileSync('public/sw.js','utf8')+`\n// isolated test revision ${revision}`);return;}
  18 |     const response=await fetch(upstream+(req.url??'/'),{redirect:'manual'});
  19 |     const headers=Object.fromEntries(response.headers);for(const key of ['content-encoding','content-length','transfer-encoding','connection'])delete headers[key];
  20 |     if(headers.location?.startsWith(upstream))headers.location=origin+headers.location.slice(upstream.length);
  21 |     res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()));
  22 |    }catch{res.writeHead(502);res.end('Isolated preview proxy unavailable');}
  23 |   });
  24 |   await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  25 |  });
  26 |  test.afterAll(async()=>{if(server)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});
  27 |  test('offline navigation reveals only the public fallback; API and identity pages are not cached',async({page})=>{
  28 |   await page.goto(`${origin}/login`);await page.evaluate(()=>navigator.serviceWorker.ready);await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  29 |   await page.evaluate(async()=>{await fetch('/icons/icon-192.png');await fetch('/api/maintenance');});
  30 |   await page.context().setOffline(true);await page.goto(`${origin}/organizer`);
  31 |   await expect(page.getByRole('heading',{name:'You’re offline',exact:true})).toBeVisible();await expect(page.getByText('Command Centre',{exact:true})).toHaveCount(0);
  32 |   const requests=await page.evaluate(async()=>{const output:string[]=[];for(const name of await caches.keys())for(const request of await(await caches.open(name)).keys())output.push(new URL(request.url).pathname);return output;});
  33 |   expect(requests).toContain('/offline.html');expect(requests.some(path=>/^\/(api|login|account|organizer|provider|checkout|studio)(\/|$)/.test(path))).toBe(false);
  34 |   await page.context().setOffline(false);await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByRole('heading',{name:'You’re offline',exact:true})).toHaveCount(0);
  35 |  });
  36 |  test('a worker update preserves form input until the user explicitly reloads',async({page})=>{
  37 |   await page.goto(`${origin}/login`);await page.evaluate(()=>navigator.serviceWorker.ready);await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  38 |   await page.getByLabel('Email',{exact:true}).fill('unsaved-pwa-fixture@example.com');revision++;
  39 |   await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration?.update();});
  40 |   await expect(page.getByRole('button',{name:'Reload to update',exact:true})).toBeVisible({timeout:30000});
  41 |   await expect(page.getByLabel('Email',{exact:true})).toHaveValue('unsaved-pwa-fixture@example.com');
> 42 |   expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
     |                                                                                                         ^ Error: expect(received).toEqual(expected) // deep equality
  43 |   await page.getByRole('button',{name:'Reload to update',exact:true}).click();
  44 |   await expect(page.getByRole('button',{name:'Reload to update',exact:true})).toHaveCount(0,{timeout:30000});await expect(page.getByLabel('Email',{exact:true})).toHaveValue('');
  45 |  });
  46 | });
  47 | 
```