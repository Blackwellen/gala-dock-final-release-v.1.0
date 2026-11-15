# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: marketplace\pwa-editors.spec.ts >> PWA Media Studio, Event Map Studio and Agent detail >> a stale run control cannot retain authority after its creator loses membership
- Location: tests\marketplace\pwa-editors.spec.ts:74:6

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "queued"
Received: "running"
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
  20 |   const e=await db.from('events').insert({owner_id:owner.id,workspace_id:workspace,name:'PWA editor test',management:'professional',starts_at:new Date(Date.now()+30*864e5).toISOString(),capacity:200}).select('id').single();if(e.error)throw e.error;event=e.data.id;
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
  47 |  test('Studio keeps an offline draft, restores after reload and saves it on reconnection',async({page})=>{
  48 |   await fixtureSession(page,owner.email);await page.goto(`${BASE}/studio/${design}`);
  49 |   await expect(page.getByLabel('Design name')).toBeVisible();
  50 |   await page.context().setOffline(true);await page.getByLabel('Design name').fill('Recovered offline design');
  51 |   await expect(page.locator('.st-save')).toHaveText('Unsaved');
  52 |   await expect(page.locator('.st-notice')).toContainText('Offline');
  53 |   const stored=await page.evaluate(id=>JSON.parse(localStorage.getItem(`gd_design_${id}`)??'null'),design);
  54 |   expect(stored.title).toBe('Recovered offline design');
  55 |   // Leave while offline, as with closing a tab. Reopening must offer the unsaved local document.
  56 |   await page.goto('about:blank');await page.context().setOffline(false);await page.goto(`${BASE}/studio/${design}`);
  57 |   await expect(page.getByRole('button',{name:'Restore local draft',exact:true})).toBeVisible();
  58 |   await page.getByRole('button',{name:'Restore local draft',exact:true}).click();
  59 |   await expect(page.getByLabel('Design name')).toHaveValue('Recovered offline design');
  60 |   await expect(page.locator('.st-save')).toHaveText('Saved',{timeout:30000});
  61 |   const saved=await db.from('designs').select('title').eq('id',design).single();expect(saved.error).toBeNull();expect(saved.data?.title).toBe('Recovered offline design');
  62 |   expect(await page.evaluate(id=>localStorage.getItem(`gd_design_${id}`),design)).toBeNull();
  63 |  });
  64 |  test('professional ticket setup exposes three canonical stages and preserves nested allocation/review',async({page})=>{
  65 |   await fixtureSession(page,owner.email);const base=`${BASE}/organizer/events/${event}/tickets/setup`;
  66 |   await page.goto(`${base}?step=1`);await expect(page.locator('.tp-steps>li')).toHaveCount(3);
  67 |   await page.goto(`${base}?step=1&section=seating`);await expect(page.getByRole('link',{name:'Seating & Allocation',exact:true})).toHaveAttribute('aria-current','page');
  68 |   await page.goto(`${base}?step=3`);await expect(page.getByRole('heading',{name:'Transfer & resale',exact:true})).toBeVisible();
  69 |   await page.goto(`${base}?step=4`);await expect(page).toHaveURL(/step=3&section=policies/);
  70 |   await page.goto(`${base}?step=5`);await expect(page).toHaveURL(/step=3&section=review/);
  71 |   await expect(page.getByRole('link',{name:'Review & Publish',exact:true})).toHaveAttribute('aria-current','page');
  72 |   await page.reload();await expect(page.getByRole('link',{name:'Review & Publish',exact:true})).toHaveAttribute('aria-current','page');
  73 |  });
  74 |  test('a stale run control cannot retain authority after its creator loses membership',async({page})=>{
  75 |   await fixtureSession(page,owner.email);await page.waitForURL(/\/organizer$/);
  76 |   await page.goto(`${BASE}/organizer/agent/runs/${run}`);
  77 |   await expect(page.getByRole('button',{name:'Cancel run',exact:true})).toBeVisible();
  78 |   // Revoke after rendering, so the assertion exercises the server action rather than hiding the control.
  79 |   const revoked=await db.from('workspace_members').delete().eq('workspace_id',workspace).eq('user_id',owner.id);
  80 |   if(revoked.error)throw revoked.error;
  81 |   await page.getByRole('button',{name:'Cancel run',exact:true}).click();
  82 |   await expect(page.locator('.ar-controls').getByRole('alert')).toContainText('Run not found.');
  83 |   const unchanged=await db.from('agent_runs').select('status').eq('id',run).single();
> 84 |   expect(unchanged.error).toBeNull();expect(unchanged.data?.status).toBe('queued');
     |                                                                     ^ Error: expect(received).toBe(expected) // Object.is equality
  85 |  });
  86 | });
  87 | 
```