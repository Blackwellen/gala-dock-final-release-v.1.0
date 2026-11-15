# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: marketplace\pwa-editors.spec.ts >> PWA Media Studio, Event Map Studio and Agent detail >> mobile and tablet editors reflow; inspector stays closed until requested; run refresh and inaccessible ID
- Location: tests\marketplace\pwa-editors.spec.ts:15:6

# Error details

```
Test timeout of 180000ms exceeded.
```

```
Error: page.waitForURL: Test timeout of 180000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
  navigated to "http://localhost:3107/login?next=%2Forganizer"
  navigated to "http://localhost:3107/login?next=%2Forganizer"
  navigated to "http://localhost:3107/login?next=%2Forganizer"
============================================================
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import type {SupabaseClient} from '@supabase/supabase-js';
  3  | import {admin,createUser,seedWorkspace,cleanup,login,BASE} from '../phase1/helpers';
  4  | import {blankDoc} from '../../src/lib/media/document';
  5  | const db=admin as unknown as SupabaseClient;
  6  | test.describe('PWA Media Studio, Event Map Studio and Agent detail',()=>{
  7  |  let owner:{id:string;email:string},workspace:string,event:string,design:string,run:string;
  8  |  test.beforeAll(async()=>{
  9  |   owner=await createUser('pwa-editors');workspace=await seedWorkspace(owner.id,'organizer','Isolated PWA editors');
  10 |   const e=await db.from('events').insert({owner_id:owner.id,workspace_id:workspace,name:'PWA editor test',starts_at:new Date(Date.now()+30*864e5).toISOString(),capacity:200}).select('id').single();if(e.error)throw e.error;event=e.data.id;
  11 |   const d=await db.from('designs').insert({owner_id:owner.id,workspace_id:workspace,title:'PWA Studio test',document:blankDoc(1080,1080)}).select('id').single();if(d.error)throw d.error;design=d.data.id;
  12 |   const r=await db.from('agent_runs').insert({workspace_id:workspace,user_id:owner.id,surface:'organizer',goal:'PWA run detail read-only test',status:'queued',plan:[]}).select('id').single();if(r.error)throw r.error;run=r.data.id;
  13 |  });
  14 |  test.afterAll(async()=>{if(workspace)await db.from('workspaces').delete().eq('id',workspace);await cleanup();});
  15 |  test('mobile and tablet editors reflow; inspector stays closed until requested; run refresh and inaccessible ID',async({page})=>{
> 16 |   await login(page,owner.email,'/organizer');await page.waitForURL(/\/organizer$/);
     |                                                         ^ Error: page.waitForURL: Test timeout of 180000ms exceeded.
  17 |   await page.setViewportSize({width:320,height:844});
  18 |   await page.goto(`${BASE}/organizer/media?create=1`);
  19 |   await expect(page.getByRole('dialog',{name:'New design',exact:true})).toBeVisible();
  20 |   expect(await page.getByRole('dialog',{name:'New design',exact:true}).evaluate(el=>el.contains(document.activeElement))).toBe(true);
  21 |   await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'New design',exact:true})).toBeHidden();
  22 |   await expect(page.getByRole('button',{name:'New design',exact:true})).toBeFocused();
  23 |   for(const size of [{width:320,height:844},{width:820,height:360},{width:1180,height:820}]){
  24 |    await page.setViewportSize(size);
  25 |    await page.goto(`${BASE}/studio/${design}`);await expect(page.getByRole('button',{name:'Export',exact:true})).toBeVisible();
  26 |    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  27 |    if(size.width<=1100){await expect(page.getByRole('complementary',{name:'Properties',exact:true})).toBeHidden();await page.getByRole('button',{name:'Properties',exact:true}).click();await expect(page.getByRole('complementary',{name:'Properties',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close properties',exact:true}).click();}
  28 |    await page.screenshot({path:`artifacts/pwa/studio-${size.width}x${size.height}.png`});
  29 |    await page.goto(`${BASE}/organizer/events/${event}/map`);await expect(page.locator('.mb-svg')).toBeVisible();
  30 |    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  31 |    await expect(page.getByRole('navigation',{name:'Primary',exact:true}).locator(':scope > a,:scope > button')).toHaveCount(5);
  32 |    await page.screenshot({path:`artifacts/pwa/event-map-${size.width}x${size.height}.png`});
  33 |   }
  34 |   await page.goto(`${BASE}/organizer/agent/runs/${run}`);await expect(page.getByRole('heading',{name:'PWA run detail read-only test'})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Change audit'})).toBeVisible();
  35 |   const response=await page.goto(`${BASE}/organizer/agent/runs/00000000-0000-4000-8000-000000000000`);expect(response?.status()).toBe(404);await expect(page.getByText('PWA run detail read-only test')).toHaveCount(0);
  36 |  });
  37 |  test('a stale run control cannot retain authority after its creator loses membership',async({page})=>{
  38 |   await login(page,owner.email,'/organizer');await page.waitForURL(/\/organizer$/);
  39 |   await page.goto(`${BASE}/organizer/agent/runs/${run}`);
  40 |   await expect(page.getByRole('button',{name:'Cancel run',exact:true})).toBeVisible();
  41 |   // Revoke after rendering, so the assertion exercises the server action rather than hiding the control.
  42 |   const revoked=await db.from('workspace_members').delete().eq('workspace_id',workspace).eq('user_id',owner.id);
  43 |   if(revoked.error)throw revoked.error;
  44 |   await page.getByRole('button',{name:'Cancel run',exact:true}).click();
  45 |   await expect(page.getByRole('alert')).toContainText('Run not found.');
  46 |   const unchanged=await db.from('agent_runs').select('status').eq('id',run).single();
  47 |   expect(unchanged.error).toBeNull();expect(unchanged.data?.status).toBe('queued');
  48 |  });
  49 | });
  50 | 
```