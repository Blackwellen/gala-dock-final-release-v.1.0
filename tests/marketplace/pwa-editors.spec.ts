import {test,expect,type Page} from '@playwright/test';
import {createServerClient} from '@supabase/ssr';
import type {SupabaseClient} from '@supabase/supabase-js';
import {admin,createUser,seedWorkspace,cleanup,BASE} from '../phase1/helpers';
import {blankDoc} from '../../src/lib/media/document';
import AxeBuilder from '@axe-core/playwright';
const db=admin as unknown as SupabaseClient;
// Authentication fixture for disposable, admin-created identities only. This does not test password login
// or disable CAPTCHA. A normal user-scoped OTP exchange creates the cookies used by real RLS assertions.
async function fixtureSession(page:Page,email:string){
 const link=await admin.auth.admin.generateLink({type:'magiclink',email});if(link.error)throw link.error;
 const jar:Array<{name:string;value:string;path:string;domain:string;httpOnly:boolean;secure:boolean;sameSite:'Lax'}>=[];
 const sb=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:values=>{for(const c of values)jar.push({name:c.name,value:c.value,path:'/',domain:new URL(BASE).hostname,httpOnly:false,secure:new URL(BASE).protocol==='https:',sameSite:'Lax'});}}});
 const result=await sb.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token});if(result.error)throw result.error;
 await page.context().addCookies(jar);await page.goto(`${BASE}/organizer`);
}
test.describe('PWA Media Studio, Event Map Studio and Agent detail',()=>{
 let owner:{id:string;email:string},workspace:string,event:string,design:string,run:string;
 test.beforeAll(async()=>{
  owner=await createUser('pwa-editors');workspace=await seedWorkspace(owner.id,'organizer','Isolated PWA editors');
  const e=await db.from('events').insert({owner_id:owner.id,workspace_id:workspace,name:'PWA editor test',management:'professional',starts_at:new Date(Date.now()+30*864e5).toISOString(),capacity:200}).select('id').single();if(e.error)throw e.error;event=e.data.id;
  const d=await db.from('designs').insert({owner_id:owner.id,workspace_id:workspace,title:'PWA Studio test',document:blankDoc(1080,1080)}).select('id').single();if(d.error)throw d.error;design=d.data.id;
  const r=await db.from('agent_runs').insert({workspace_id:workspace,user_id:owner.id,surface:'organizer',goal:'PWA run detail read-only test',status:'paused',plan:[]}).select('id').single();if(r.error)throw r.error;run=r.data.id;
 });
 test.afterAll(async()=>{if(workspace)await db.from('workspaces').delete().eq('id',workspace);await cleanup();});
 test('mobile and tablet editors reflow; inspector stays closed until requested; run refresh and inaccessible ID',async({page})=>{
  await fixtureSession(page,owner.email);await page.waitForURL(/\/organizer$/);
  await page.setViewportSize({width:320,height:844});
  await page.goto(`${BASE}/organizer/media?create=1`);
  await expect(page.getByRole('dialog',{name:'New design',exact:true})).toBeVisible();
  expect(await page.getByRole('dialog',{name:'New design',exact:true}).evaluate(el=>el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'New design',exact:true})).toBeHidden();
  await expect(page.getByRole('button',{name:'New design',exact:true})).toBeFocused();
  for(const size of [{width:320,height:844},{width:820,height:360},{width:1180,height:820}]){
   await page.setViewportSize(size);
   await page.goto(`${BASE}/studio/${design}`);await expect(page.getByRole('button',{name:'Export',exact:true})).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
   if(size.width<=1100){await expect(page.getByRole('complementary',{name:'Properties',exact:true})).toBeHidden();await page.getByRole('button',{name:'Properties',exact:true}).click();await expect(page.getByRole('complementary',{name:'Properties',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close properties',exact:true}).click();}
   await page.screenshot({path:`artifacts/pwa/studio-${size.width}x${size.height}.png`});
   await page.goto(`${BASE}/organizer/events/${event}/map`);await expect(page.locator('.mb-svg')).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
   await expect(page.getByRole('navigation',{name:'Primary',exact:true}).locator(':scope > a,:scope > button')).toHaveCount(5);
   await page.screenshot({path:`artifacts/pwa/event-map-${size.width}x${size.height}.png`});
  }
  await page.goto(`${BASE}/organizer/agent/runs/${run}`);await expect(page.getByRole('heading',{name:'PWA run detail read-only test'})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Change audit'})).toBeVisible();
  // Next 16 loading boundaries stream the shell before notFound: 200 + noindex is documented.
  const response=await page.goto(`${BASE}/organizer/agent/runs/00000000-0000-4000-8000-000000000000`);expect([200,404]).toContain(response?.status());await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();await expect(page.getByText('PWA run detail read-only test')).toHaveCount(0);
 });
 test('upcoming event actions work by keyboard without overflowing the mobile card',async({page})=>{
  await fixtureSession(page,owner.email);await page.setViewportSize({width:320,height:844});await page.goto(`${BASE}/organizer`);
  const menu=page.locator('.omh-event-menu').first();const trigger=menu.locator('summary');
  await expect(page.locator('.pwa-route-loading')).toHaveCount(0);await trigger.press('Enter');await expect(menu).toHaveAttribute('open','');
  await expect(menu.getByRole('link',{name:'Ticket setup',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');await expect(menu).not.toHaveAttribute('open','');await expect(trigger).toBeFocused();await trigger.press('Enter');
  await menu.getByRole('link',{name:'Event Map Studio',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/organizer/events/${event}/map`));
 });
 test('Studio keeps an offline draft, restores after reload and saves it on reconnection',async({page})=>{
  await fixtureSession(page,owner.email);await page.goto(`${BASE}/studio/${design}`);
  await expect(page.getByLabel('Design name')).toBeVisible();
  await page.context().setOffline(true);await page.getByLabel('Design name').fill('Recovered offline design');
  await expect(page.locator('.st-save')).toHaveText('Unsaved');
  await expect(page.locator('.st-notice')).toContainText('Offline');
  const stored=await page.evaluate(id=>JSON.parse(localStorage.getItem(`gd_design_${id}`)??'null'),design);
  expect(stored.title).toBe('Recovered offline design');
  // Leave while offline, as with closing a tab. Reopening must offer the unsaved local document.
  await page.goto('about:blank');await page.context().setOffline(false);await page.goto(`${BASE}/studio/${design}`);
  await expect(page.getByRole('button',{name:'Restore local draft',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Restore local draft',exact:true}).click();
  await expect(page.getByLabel('Design name')).toHaveValue('Recovered offline design');
  await expect(page.locator('.st-save')).toHaveText('Saved',{timeout:30000});
  const saved=await db.from('designs').select('title').eq('id',design).single();expect(saved.error).toBeNull();expect(saved.data?.title).toBe('Recovered offline design');
  expect(await page.evaluate(id=>localStorage.getItem(`gd_design_${id}`),design)).toBeNull();
 });
 test('professional ticket setup exposes the five design steps and keeps old three-stage links working',async({page})=>{
  // Updated 2026-10-30: Ticket Pro follows the 5-step design (owner decision: flows match designs). The earlier three-stage URLs
  // (?section=seating|policies|review) now redirect to steps 3/4/5 (tickets/setup/page.tsx), so the spec asserts that instead.
  await fixtureSession(page,owner.email);const base=`${BASE}/organizer/events/${event}/tickets/setup`;
  await page.goto(`${base}?step=1`);await expect(page.locator('.tp-steps>li')).toHaveCount(5);
  await page.goto(`${base}?step=1&section=seating`);await expect(page).toHaveURL(/step=3/);await expect(page.locator('.tp-steps a[aria-current="step"]')).toContainText('Seating & Allocation');
  await page.goto(`${base}?step=4`);await expect(page.getByRole('heading',{name:'Transfer & resale',exact:true})).toBeVisible();
  await page.goto(`${base}?step=3&section=policies`);await expect(page).toHaveURL(/step=4/);
  await page.goto(`${base}?step=3&section=review`);await expect(page).toHaveURL(/step=5/);
  await expect(page.locator('.tp-steps a[aria-current="step"]')).toContainText('Review & Activate');
  await page.reload();await expect(page.locator('.tp-steps a[aria-current="step"]')).toContainText('Review & Activate');
 });
 test('a stale run control cannot retain authority after its creator loses membership',async({page})=>{
  await fixtureSession(page,owner.email);await page.waitForURL(/\/organizer$/);
  await page.goto(`${BASE}/organizer/agent/runs/${run}`);
  await expect(page.getByRole('button',{name:'Cancel run',exact:true})).toBeVisible();
  // Revoke after rendering, so the assertion exercises the server action rather than hiding the control.
  const revoked=await db.from('workspace_members').delete().eq('workspace_id',workspace).eq('user_id',owner.id);
  if(revoked.error)throw revoked.error;
  await page.getByRole('button',{name:'Cancel run',exact:true}).click();
  await expect(page.locator('.ar-controls').getByRole('alert')).toContainText('Run not found.');
  const unchanged=await db.from('agent_runs').select('status').eq('id',run).single();
  expect(unchanged.error).toBeNull();expect(unchanged.data?.status).toBe('paused');
 });
});
