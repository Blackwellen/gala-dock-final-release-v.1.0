# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: marketplace\pwa-editors.spec.ts >> PWA Media Studio, Event Map Studio and Agent detail >> a stale run control cannot retain authority after its creator loses membership
- Location: tests\marketplace\pwa-editors.spec.ts:47:6

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('alert')
Expected substring: "Run not found."
Error: strict mode violation: getByRole('alert') resolved to 2 elements:
    1) <p role="alert">Run not found.</p> aka getByText('Run not found.')
    2) <div role="alert" aria-live="assertive" id="__next-route-announcer__"></div> aka locator('[id="__next-route-announcer__"]')

Call log:
  - Expect "toContainText" getByRole('alert') with timeout 30000ms
  - waiting for getByRole('alert')
    3 × locator resolved to <div role="alert" aria-live="assertive" id="__next-route-announcer__"></div>
      - unexpected value ""

```

# Test source

```ts
  1  | import {test,expect,type Page} from '@playwright/test';
  2  | import {createServerClient} from '@supabase/ssr';
  3  | import type {SupabaseClient} from '@supabase/supabase-js';
  4  | import {admin,createUser,seedWorkspace,cleanup,BASE} from '../phase1/helpers';
  5  | import {blankDoc} from '../../src/lib/media/document';
  6  | const db=admin as unknown as SupabaseClient;
  7  | // Authentication fixture for disposable, admin-created identities only. This does not test password login
  8  | // or disable CAPTCHA. A normal user-scoped OTP exchange creates the cookies used by real RLS assertions.
  9  | async function fixtureSession(page:Page,email:string){
  10 |  const link=await admin.auth.admin.generateLink({type:'magiclink',email});if(link.error)throw link.error;
  11 |  const jar:Array<{name:string;value:string;path:string;domain:string;httpOnly:boolean;secure:boolean;sameSite:'Lax'}>=[];
  12 |  const sb=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:values=>{for(const c of values)jar.push({name:c.name,value:c.value,path:'/',domain:new URL(BASE).hostname,httpOnly:false,secure:new URL(BASE).protocol==='https:',sameSite:'Lax'});}}});
  13 |  const result=await sb.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token});if(result.error)throw result.error;
  14 |  await page.context().addCookies(jar);await page.goto(`${BASE}/organizer`);
  15 | }
  16 | test.describe('PWA Media Studio, Event Map Studio and Agent detail',()=>{
  17 |  let owner:{id:string;email:string},workspace:string,event:string,design:string,run:string;
  18 |  test.beforeAll(async()=>{
  19 |   owner=await createUser('pwa-editors');workspace=await seedWorkspace(owner.id,'organizer','Isolated PWA editors');
  20 |   const e=await db.from('events').insert({owner_id:owner.id,workspace_id:workspace,name:'PWA editor test',starts_at:new Date(Date.now()+30*864e5).toISOString(),capacity:200}).select('id').single();if(e.error)throw e.error;event=e.data.id;
  21 |   const d=await db.from('designs').insert({owner_id:owner.id,workspace_id:workspace,title:'PWA Studio test',document:blankDoc(1080,1080)}).select('id').single();if(d.error)throw d.error;design=d.data.id;
  22 |   const r=await db.from('agent_runs').insert({workspace_id:workspace,user_id:owner.id,surface:'organizer',goal:'PWA run detail read-only test',status:'queued',plan:[]}).select('id').single();if(r.error)throw r.error;run=r.data.id;
  23 |  });
  24 |  test.afterAll(async()=>{if(workspace)await db.from('workspaces').delete().eq('id',workspace);await cleanup();});
  25 |  test('mobile and tablet editors reflow; inspector stays closed until requested; run refresh and inaccessible ID',async({page})=>{
  26 |   await fixtureSession(page,owner.email);await page.waitForURL(/\/organizer$/);
  27 |   await page.setViewportSize({width:320,height:844});
  28 |   await page.goto(`${BASE}/organizer/media?create=1`);
  29 |   await expect(page.getByRole('dialog',{name:'New design',exact:true})).toBeVisible();
  30 |   expect(await page.getByRole('dialog',{name:'New design',exact:true}).evaluate(el=>el.contains(document.activeElement))).toBe(true);
  31 |   await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'New design',exact:true})).toBeHidden();
  32 |   await expect(page.getByRole('button',{name:'New design',exact:true})).toBeFocused();
  33 |   for(const size of [{width:320,height:844},{width:820,height:360},{width:1180,height:820}]){
  34 |    await page.setViewportSize(size);
  35 |    await page.goto(`${BASE}/studio/${design}`);await expect(page.getByRole('button',{name:'Export',exact:true})).toBeVisible();
  36 |    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  37 |    if(size.width<=1100){await expect(page.getByRole('complementary',{name:'Properties',exact:true})).toBeHidden();await page.getByRole('button',{name:'Properties',exact:true}).click();await expect(page.getByRole('complementary',{name:'Properties',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close properties',exact:true}).click();}
  38 |    await page.screenshot({path:`artifacts/pwa/studio-${size.width}x${size.height}.png`});
  39 |    await page.goto(`${BASE}/organizer/events/${event}/map`);await expect(page.locator('.mb-svg')).toBeVisible();
  40 |    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  41 |    await expect(page.getByRole('navigation',{name:'Primary',exact:true}).locator(':scope > a,:scope > button')).toHaveCount(5);
  42 |    await page.screenshot({path:`artifacts/pwa/event-map-${size.width}x${size.height}.png`});
  43 |   }
  44 |   await page.goto(`${BASE}/organizer/agent/runs/${run}`);await expect(page.getByRole('heading',{name:'PWA run detail read-only test'})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Change audit'})).toBeVisible();
  45 |   const response=await page.goto(`${BASE}/organizer/agent/runs/00000000-0000-4000-8000-000000000000`);expect(response?.status()).toBe(404);await expect(page.getByText('PWA run detail read-only test')).toHaveCount(0);
  46 |  });
  47 |  test('a stale run control cannot retain authority after its creator loses membership',async({page})=>{
  48 |   await fixtureSession(page,owner.email);await page.waitForURL(/\/organizer$/);
  49 |   await page.goto(`${BASE}/organizer/agent/runs/${run}`);
  50 |   await expect(page.getByRole('button',{name:'Cancel run',exact:true})).toBeVisible();
  51 |   // Revoke after rendering, so the assertion exercises the server action rather than hiding the control.
  52 |   const revoked=await db.from('workspace_members').delete().eq('workspace_id',workspace).eq('user_id',owner.id);
  53 |   if(revoked.error)throw revoked.error;
  54 |   await page.getByRole('button',{name:'Cancel run',exact:true}).click();
> 55 |   await expect(page.getByRole('alert')).toContainText('Run not found.');
     |                                         ^ Error: expect(locator).toContainText(expected) failed
  56 |   const unchanged=await db.from('agent_runs').select('status').eq('id',run).single();
  57 |   expect(unchanged.error).toBeNull();expect(unchanged.data?.status).toBe('queued');
  58 |  });
  59 | });
  60 | 
```