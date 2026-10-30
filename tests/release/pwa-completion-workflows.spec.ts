import {test,expect} from '@playwright/test';
import type {SupabaseClient} from '@supabase/supabase-js';
import AxeBuilder from '@axe-core/playwright';
import {PDFDocument} from 'pdf-lib';
import {admin,createUser,seedWorkspace,signedIn,login,cleanup,BASE} from '../phase1/helpers';
test.describe('PWA completed planning and request controls',()=>{
 test.describe.configure({mode:'serial'});
 let owner:Awaited<ReturnType<typeof createUser>>,other:Awaited<ReturnType<typeof createUser>>,provider:Awaited<ReturnType<typeof createUser>>,consumer:string,professional:string,workspace:string,providerWs:string,requestId:string,attachmentPath:string;const listings:string[]=[];
 const db=admin as unknown as SupabaseClient;
// login() submits the password form without waiting; page.request needs the session cookie, so wait until the app has left /login.
const signedInPage=(page:import('@playwright/test').Page)=>page.waitForURL(u=>!u.pathname.startsWith('/login'),{timeout:60000});const providerNames:string[]=[];
 test.beforeAll(async()=>{
  owner=await createUser('max-workflows','PWA Workflow Owner');other=await createUser('max-other');provider=await createUser('max-provider');
  await admin.from('profiles').update({onboarding_complete:true}).eq('id',owner.id);
  workspace=await seedWorkspace(owner.id,'organizer','Isolated PWA completion');providerWs=await seedWorkspace(provider.id,'provider','Isolated request providers');
  const c=await db.from('events').insert({owner_id:owner.id,management:'consumer',name:'Date change fixture',status:'planning',guest_count:30,starts_at:'2027-03-20T18:00:00Z',ends_at:'2027-03-20T22:00:00Z',timezone:'Europe/London',event_type:'birthday'}).select('id').single();if(c.error)throw c.error;consumer=c.data.id;
  const p=await db.from('events').insert({owner_id:owner.id,workspace_id:workspace,management:'professional',name:'RFQ completion fixture',status:'planning',starts_at:'2027-07-20T18:00:00Z',ends_at:'2027-07-20T22:00:00Z',city:'London',location:'London',capacity:100}).select('id').single();if(p.error)throw p.error;professional=p.data.id;
  for(const suffix of ['A','B','C']){const name=`Maximum Provider ${suffix} ${owner.id.slice(0,8)}`;const row=await db.from('listings').insert({workspace_id:providerWs,kind:'service',name,category:'Production & AV',published:true,city:'London',location:'London',response_hours:2,rating:5,verified:true,price_from:100,image:'/assets/gd/hero-wedding-compact.webp'}).select('id').single();if(row.error)throw row.error;listings.push(row.data.id);providerNames.push(name);}
 });
 test.afterAll(async()=>{if(owner){const files=await db.storage.from('workspace-files').list(owner.id,{limit:100});if(files.data?.length)await db.storage.from('workspace-files').remove(files.data.map(file=>`${owner.id}/${file.name}`));}if(consumer)await db.from('events').delete().eq('id',consumer);if(listings.length)await db.from('listings').delete().in('id',listings);if(workspace)await db.from('workspaces').delete().eq('id',workspace);if(providerWs)await db.from('workspaces').delete().eq('id',providerWs);await cleanup();});
 test('date-impact dialog opens from Plan and changes an uncommitted event preserving local time and duration',async({page})=>{
  await login(page,owner.email,`/account/events/${consumer}/plan`);await page.setViewportSize({width:320,height:844});
  await page.getByRole('button',{name:'Check new dates',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Change event date',exact:true});await expect(dialog).toBeVisible();
  await dialog.getByLabel('New date',{exact:true}).fill('2027-04-05');await dialog.getByRole('button',{name:'Check date impact',exact:true}).click();
  await expect(dialog.getByText('No ticket or provider commitments prevent this date change.')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await dialog.getByRole('button',{name:'Confirm new date',exact:true}).click();await expect(dialog).toBeHidden();
  const record=await db.from('events').select('starts_at,ends_at').eq('id',consumer).single();if(record.error||!record.data)throw new Error("Date fixture was not persisted");expect(new Date(record.data.starts_at).toISOString()).toBe('2027-04-05T17:00:00.000Z');expect(new Date(record.data.ends_at).getTime()-new Date(record.data.starts_at).getTime()).toBe(4*36e5);
 });
 test('date RPC denies a different owner and direct edits cannot bypass provider commitments',async()=>{
  const attacker=await signedIn(other.email) as unknown as SupabaseClient;expect((await attacker.rpc('change_my_event_date',{p_event:consumer,p_date:'2027-04-06'})).error).not.toBeNull();
  const client=await signedIn(owner.email) as unknown as SupabaseClient;
  for(const status of ['confirmed','quote_received','conditionally_held','active','partially_refunded']){
   const item=await db.from('build_items').insert({event_id:consumer,listing_id:listings[0],category:'production',title:'Committed date fixture',status}).select('id').single();if(item.error)throw item.error;
   try{expect((await client.rpc('change_my_event_date',{p_event:consumer,p_date:'2027-04-06'})).error?.message).toContain('provider_date_commitments');expect((await client.from('events').update({starts_at:'2027-04-06T17:00:00Z'}).eq('id',consumer)).error?.message).toContain('provider_date_commitments');}finally{await db.from('build_items').delete().eq('id',item.data.id);}
  }
 });
 test('London booking availability sees the actual summer window without exposing private calendar blocks',async()=>{
  const block=await db.from('availability_blocks').insert({workspace_id:providerWs,listing_id:listings[2],kind:'blocked',starts_at:'2027-07-20T17:00:00Z',ends_at:'2027-07-20T18:00:00Z',created_by:provider.id}).select('id').single();if(block.error)throw block.error;
  try{const client=await signedIn(owner.email) as unknown as SupabaseClient;
   expect((await client.from('availability_blocks').select('id').eq('id',block.data.id)).data).toEqual([]);
   expect((await client.rpc('listing_availability_local',{p_listing:listings[2],p_date:'2027-07-20',p_start:'18:00',p_end:'19:00'})).data).toBe('unavailable');
   expect((await client.rpc('listing_availability',{p_listing:listings[2],p_start:'2027-07-20T18:00:00Z',p_end:'2027-07-20T19:00:00Z'})).data).toBe('available');
   expect((await client.rpc('listing_availability_local',{p_listing:listings[2],p_date:'2027-03-28',p_start:'01:30',p_end:'03:30'})).error?.message).toContain('invalid_local_time');
  }finally{await db.from('availability_blocks').delete().eq('id',block.data.id);}
 });
 test('request selections, strategy and priority survive reload and create the authoritative ordered request',async({page})=>{
  await page.setViewportSize({width:390,height:844});await login(page,owner.email,`/organizer/marketplace/requests/new?event=${professional}&listing=${listings[0]}&step=1`);
  await page.locator('input[placeholder="e.g. Main Stage Production & AV"]').fill('Maximum workflow request');
  const pdf=await PDFDocument.create();pdf.addPage().drawText('Isolated PWA request attachment');
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Attach a file',exact:true}).click();await (await chooser).setFiles({name:'request-brief.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  await expect(page.getByRole('button',{name:'Remove request-brief.pdf',exact:true})).toBeVisible();
  // D01: four steps — Requirement → Specifications → Suppliers → Review & send. Required brief fields are filled when the event did not prefill them.
  await page.getByPlaceholder(/Describe your requirements/).fill('Stage, sound and lighting for the main hall.');
  for(const [sel,val] of [['form.wz-grid input[type=date]','2027-07-20'],['form.wz-grid input[aria-invalid][inputmode=numeric]','300']] as const){const f=page.locator(sel).first();if(!(await f.inputValue()))await f.fill(val);}
  const where=page.locator('form.wz-grid .k-input-icon input').nth(1);if(!(await where.inputValue()))await where.fill('London, UK');
  await page.getByRole('button',{name:'Continue to specifications',exact:false}).click();await page.waitForURL(/step=2/);
  await page.getByRole('button',{name:'Continue to suppliers',exact:false}).click();await page.waitForURL(/step=3/);
  await expect(page.getByRole('heading',{name:/Selected recipients/})).toBeVisible();
  const defaults=page.locator('.rf-table input[type=checkbox]:checked');while(await defaults.count())await defaults.first().uncheck();
  await expect(page.getByRole('heading',{name:'Selected recipients (0)',exact:true})).toBeVisible();
  await page.getByRole('checkbox',{name:`Select ${providerNames[0]}`,exact:true}).check();await page.getByRole('checkbox',{name:`Select ${providerNames[1]}`,exact:true}).check();
  await expect(page.getByRole('heading',{name:'Selected recipients (2)',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Reorder',exact:true}).click();const moveUp=page.getByRole('button',{name:`Move ${providerNames[1]} up`,exact:true});if(!await moveUp.isEnabled())await page.getByRole('button',{name:`Move ${providerNames[1]} down`,exact:true}).click();await moveUp.click();await page.getByRole('button',{name:'Done reordering',exact:true}).click();
  await page.getByRole('button',{name:'4 hours',exact:true}).click();await page.getByRole('switch',{name:'Conditional hold',exact:true}).uncheck();
  await page.getByRole('button',{name:'Save as draft',exact:true}).click();await page.reload();
  await expect(page.getByRole('checkbox',{name:`Select ${providerNames[1]}`,exact:true})).toBeChecked();await expect(page.getByRole('button',{name:'4 hours',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('switch',{name:'Conditional hold',exact:true})).not.toBeChecked();
  const chosen=page.getByRole('heading',{name:/Selected recipients/}).locator('..').locator('..').locator('..');await expect(chosen.locator('ul > li').first()).toContainText(providerNames[1]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.getByRole('button',{name:'Continue to review',exact:false}).click();await page.waitForURL(/step=4/);
  await page.getByRole('button',{name:'Send request',exact:true}).click();await page.waitForURL(/\/organizer\/marketplace\/requests\/[0-9a-f-]+$/,{timeout:30000});
  const request=await db.from('provider_requests').select('id,response_hours,hold_strategy').eq('event_id',professional).eq('title','Maximum workflow request').single();expect(request.error).toBeNull();if(!request.data)throw new Error("Request was not persisted");expect(request.data.response_hours).toBe(4);expect(request.data.hold_strategy).toBe('none');
  requestId=request.data.id;const attached=await db.from('provider_requests').select('requirements').eq('id',requestId).single();attachmentPath=attached.data?.requirements.attachments[0].path;
  expect(attachmentPath.startsWith(`${owner.id}/`)).toBe(true);await expect(page.getByRole('link',{name:'request-brief.pdf',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  const items=await db.from('build_items').select('listing_id,sort').eq('request_id',request.data.id).order('sort');if(items.error||!items.data)throw new Error("Request recipients were not persisted");expect(items.data.map((i:{listing_id:string})=>i.listing_id)).toEqual([listings[1],listings[0]]);
 });
 test('a customer can attach a brief and request a hold without a saved card',async({page})=>{
  const item=await db.from('build_items').insert({event_id:consumer,listing_id:listings[2],category:'production',title:'Customer hold fixture',status:'suggested'}).select('id').single();if(item.error)throw item.error;
  try{
   await page.setViewportSize({width:390,height:844});await login(page,owner.email,`/account/events/${consumer}/book?item=${item.data.id}&step=1`);
   const pdf=await PDFDocument.create();pdf.addPage().drawText('Customer hold brief');const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Attach a file',exact:true}).click();await (await chooser).setFiles({name:'customer-brief.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});await expect(page.getByRole('button',{name:'Remove customer-brief.pdf',exact:true})).toBeVisible();
   const scope=page.getByRole('radio',{name:'Their standard package',exact:true});await scope.focus();await page.keyboard.press('Space');await expect(scope).toBeChecked();await page.getByRole('button',{name:'Continue to Review & Quote',exact:false}).click();await page.waitForURL(/step=2/,{timeout:30000});
   await page.getByRole('radio',{name:/Request a conditional hold/}).click();await page.getByRole('checkbox',{name:/I agree to the/}).check();
   await expect(page.getByRole('button',{name:'Request Hold',exact:false})).toBeEnabled();await page.getByRole('button',{name:'Request Hold',exact:false}).click();await page.waitForURL(/step=3/,{timeout:30000});
   const saved=await db.from('build_items').select('request_id,status').eq('id',item.data.id).single();expect(saved.error).toBeNull();expect(saved.data?.request_id).toBeTruthy();
   const request=await db.from('provider_requests').select('hold_strategy,requirements').eq('id',saved.data?.request_id).single();expect(request.data?.hold_strategy).toBe('conditional');expect(request.data?.requirements.attachments[0].name).toBe('customer-brief.pdf');await db.storage.from('workspace-files').remove(request.data?.requirements.attachments.map((file:{path:string})=>file.path)??[]);
  }finally{await db.from('build_items').delete().eq('id',item.data.id);}
 });
 test('a current quote state offers secure checkout without requiring a saved card',async({page})=>{
  const item=await db.from('build_items').insert({event_id:consumer,listing_id:listings[2],category:'production',title:'Current quote fixture',status:'quote_received',amount:120,deposit:36,quote:{deposit_pct:30}}).select('id').single();if(item.error)throw item.error;
  try{await page.setViewportSize({width:390,height:844});await login(page,owner.email,`/account/events/${consumer}/book?item=${item.data.id}&step=2`);await expect(page.getByRole('button',{name:/Book & pay/})).toBeEnabled();await expect(page.getByRole('radio',{name:/Accept quote & book/})).toHaveAttribute('aria-checked','true');}
  finally{await db.from('build_items').delete().eq('id',item.data.id);}
 });
 test('private request attachment downloads permit the recipient and deny another user and forged metadata',async({page})=>{
  if(!requestId||!attachmentPath)throw new Error('The preceding request integration did not create its attachment');
  const download=`${BASE}/api/requests/${requestId}/files?path=${encodeURIComponent(attachmentPath)}`;
  // Private documents fail closed until the AV gateway records a verdict (Q04); dev has no CLAMAV_SCAN_URL, so record the clean verdict the
  // gateway would write for this fixture object (as trust-verification.spec's scanClean does). Authorisation is what this test checks.
  {const scanned=await db.from('storage_attribution').update({av_verdict:'clean',scan_status:'clean',scanned_at:new Date().toISOString()}).eq('bucket','workspace-files').eq('name',attachmentPath).select('name');expect(scanned.error).toBeNull();expect(scanned.data?.length).toBe(1);}
  await login(page,provider.email,'/provider');await signedInPage(page);{const res=await page.request.get(download,{maxRedirects:0});expect(res.status(),await res.text()).toBe(307);}
  await page.context().clearCookies();await login(page,other.email,'/discover');await signedInPage(page);expect((await page.request.get(download,{maxRedirects:0})).status()).toBe(404);
  const client=await signedIn(owner.email) as unknown as SupabaseClient;
  expect((await client.from('provider_requests').update({created_by:other.id}).eq('id',requestId)).error?.message).toContain('request_creator_immutable');
  expect((await client.from('provider_requests').update({requirements:{attachments:[{path:`${other.id}/00000000-0000-4000-8000-000000000000.pdf`,name:'forged.pdf'}]}}).eq('id',requestId)).error?.message).toContain('invalid_request_attachment');
  const removed=await client.storage.from('workspace-files').remove([attachmentPath]);expect(removed.error).toBeNull();
  const proof=await client.from('verified_private_uploads').select('path').eq('path',attachmentPath);expect(proof.data).toEqual([]);
  const replacement=await client.storage.from('workspace-files').upload(attachmentPath,Buffer.from('%PDF-1.7\nUnverified direct upload'),{contentType:'application/pdf'});expect(replacement.error).toBeNull();
  await page.context().clearCookies();await login(page,provider.email,'/provider');await signedInPage(page);expect((await page.request.get(download,{maxRedirects:0})).status()).toBe(404);
 });
 test('event file uploads are private, share with authorized members and reject forged or replaced sources',async({page})=>{
  await page.setViewportSize({width:390,height:844});await login(page,owner.email,`/organizer/events/${professional}?tab=plan&section=files`);
  const pdf=await PDFDocument.create();pdf.addPage().drawText('Isolated event file');const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Upload file',exact:true}).click();await (await chooser).setFiles({name:'event-brief.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  await expect(page.getByText('event-brief.pdf',{exact:true})).toBeVisible();
  const record=await db.from('media_assets').select('id,url,storage_object_id,source_verified').eq('event_id',professional).eq('title','event-brief.pdf').single();if(record.error||!record.data)throw new Error('Event file did not persist');expect(record.data.source_verified).toBe(true);expect(record.data.storage_object_id).toBeTruthy();{const scanned=await db.from('storage_attribution').update({av_verdict:'clean',scan_status:'clean',scanned_at:new Date().toISOString()}).eq('bucket','workspace-files').eq('name',record.data.url).select('name');expect(scanned.error).toBeNull();expect(scanned.data?.length).toBe(1);}   /* no AV gateway in dev: record the gateway's clean verdict (Q04 fail-closed) */const endpoint=`${BASE}/api/files/${record.data.id}`;
  expect((await page.request.get(endpoint,{maxRedirects:0})).status()).toBe(307);
  const member=await db.from('workspace_members').insert({workspace_id:workspace,user_id:provider.id,role:'member',status:'active'});if(member.error)throw member.error;
  await page.context().clearCookies();await login(page,provider.email,'/provider');await signedInPage(page);expect((await page.request.get(endpoint,{maxRedirects:0})).status()).toBe(307);
  await page.context().clearCookies();await login(page,other.email,'/discover');await signedInPage(page);expect((await page.request.get(endpoint,{maxRedirects:0})).status()).toBe(404);
  const attacker=await signedIn(other.email) as unknown as SupabaseClient;
  const foreign=await db.from('events').insert({owner_id:other.id,management:'consumer',name:'Isolated file privacy fixture',status:'planning'}).select('id').single();if(foreign.error)throw foreign.error;
  try{expect((await attacker.from('media_assets').insert({event_id:foreign.data.id,kind:'file',title:'Forged shared document',url:record.data.url})).error?.message).toContain('private_file_source_not_owned');}finally{await db.from('events').delete().eq('id',foreign.data.id);}
  const client=await signedIn(owner.email) as unknown as SupabaseClient;
  expect((await client.from('media_assets').update({storage_object_id:'00000000-0000-4000-8000-000000000000'}).eq('id',record.data.id)).error?.message).toContain('private_file_source_immutable');
  expect((await client.storage.from('workspace-files').remove([record.data.url])).error).toBeNull();expect((await client.storage.from('workspace-files').upload(record.data.url,Buffer.from('%PDF-1.7\nUnverified replacement'),{contentType:'application/pdf'})).error).toBeNull();
  await page.context().clearCookies();await login(page,owner.email,`/organizer/events/${professional}?tab=plan&section=files`);await signedInPage(page);expect((await page.request.get(endpoint,{maxRedirects:0})).status()).toBe(404);
 });
});
