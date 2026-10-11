import {createClient} from '@supabase/supabase-js';
import {chromium} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const client=()=>createClient(url,key,{auth:{persistSession:false}});
const ids=[],checks=[];let browser;
function assert(ok,label){if(!ok)throw new Error(label);checks.push(label);console.log('PASS '+label);}
const password='Gala-QA-'+randomUUID()+'!aA7';
try {
 const users=[];
 for(let i=0;i<2;i++){const email=`gala-qa-${randomUUID()}@example.invalid`;const result=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Design QA'}});assert(!result.error&&!!result.data.user,'Create disposable account '+(i+1));ids.push(result.data.user.id);const sdk=client();assert(!(await sdk.auth.signInWithPassword({email,password})).error,'Password authentication '+(i+1));users.push({id:result.data.user.id,email,sdk});}
 const [a,b]=users;
 assert((await a.sdk.from('profiles').select('id')).data?.length===1,'Profiles are isolated by RLS');
 const w=await a.sdk.from('workspaces').insert({owner_id:a.id,name:'QA Workspace',kind:'organizer'}).select('id').single();assert(!w.error&&!!w.data,'Owner can create workspace');
 assert(!(await a.sdk.from('workspace_members').insert({workspace_id:w.data.id,user_id:a.id,role:'owner'})).error,'Owner can create membership');
 const invite=await a.sdk.from('workspace_invites').insert({workspace_id:w.data.id,email:b.email,role:'member'}).select('token').single();assert(!invite.error&&!!invite.data,'Owner can create invitation');
 const invalidInvite=await fetch('http://localhost:3107/api/invites?token=invalid');assert(invalidInvite.status===400,'Invitation metadata rejects malformed tokens');
 const absentInvite=await fetch('http://localhost:3107/api/invites?token='+randomUUID());assert(absentInvite.status===404,'Invitation metadata rejects unknown tokens');
 const inviteResponse=await fetch('http://localhost:3107/api/invites?token='+invite.data.token);const inviteDetails=await inviteResponse.json();assert(inviteResponse.status===200&&inviteDetails.name==='QA Workspace'&&inviteDetails.role==='member'&&!inviteDetails.expired&&!('email' in inviteDetails),'Invitation metadata resolves workspace without exposing recipient email');assert(inviteResponse.headers.get('cache-control')==='private, no-store','Invitation metadata cannot be cached');
 assert((await b.sdk.from('workspaces').select('id').eq('id',w.data.id)).data?.length===0,'Other account cannot read private workspace');
 assert(!!(await b.sdk.from('workspace_members').insert({workspace_id:w.data.id,user_id:b.id,role:'owner'})).error,'Other account cannot add itself to workspace');
 assert(!!(await b.sdk.from('platform_admins').insert({user_id:b.id})).error,'Account cannot grant itself platform admin');
 const save=await a.sdk.from('saved_items').insert({user_id:a.id,item_key:'qa-event'});assert(!save.error,'Save favourite');assert((await b.sdk.from('saved_items').select('item_key')).data?.length===0,'Saved items are isolated');
 const path=`${a.id}/${randomUUID()}.png`;const png=await fs.readFile('public/assets/brand-purple.png');assert(!(await a.sdk.storage.from('workspace-files').upload(path,png,{contentType:'image/png'})).error,'Owner can upload private workspace file');assert(!!(await b.sdk.storage.from('workspace-files').download(path)).error,'Other account cannot download private file');await a.sdk.storage.from('workspace-files').remove([path]);
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage();
 await page.goto('http://localhost:3107/auth/login',{waitUntil:'networkidle'});await page.locator('input[name=email]').fill(b.email);await page.locator('input[name=password]').fill(password);await page.getByRole('button',{name:'Log in',exact:true}).click();await page.waitForURL('**/onboarding/experience',{timeout:30000});assert(true,'Browser login establishes server session and routes to onboarding');
 await page.goto('http://localhost:3107/onboarding/preferences',{waitUntil:'networkidle'});await page.locator('input[name=full_name]').fill('Browser QA');await page.locator('input[name=home_area]').fill('London');await page.getByRole('button',{name:'Complete setup',exact:false}).click();await page.waitForURL('**/app/customer',{timeout:30000});assert(true,'Preferences save and customer dashboard opens');
 const profile=await admin.from('profiles').select('full_name,home_area,onboarding_complete').eq('id',b.id).single();assert(profile.data?.full_name==='Browser QA'&&profile.data?.home_area==='London'&&profile.data?.onboarding_complete,'Browser preferences persisted in Supabase');
 const favourite=await page.evaluate(async()=>{const r=await fetch('/api/saved',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:'browser-qa',saved:true})});return r.status;});assert(favourite===200,'Session-authenticated favourite API');
 const accepted=await page.evaluate(async token=>{const r=await fetch('/api/invites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({acceptToken:token})});return r.status;},invite.data.token);assert(accepted===200,'Matching signed-in recipient can accept invitation');assert((await b.sdk.from('workspace_members').select('role').eq('workspace_id',w.data.id).eq('user_id',b.id).single()).data?.role==='member','Accepted invitation persists membership');
 await page.goto('http://localhost:3107/app/admin',{waitUntil:'networkidle'});assert(page.url().endsWith('/auth/secure-access'),'Server blocks unauthorized admin dashboard');
 await page.goto('http://localhost:3107/app/customer',{waitUntil:'networkidle'});await page.locator('.profile-menu').click();await page.getByRole('button',{name:'Sign out',exact:false}).click();await page.waitForURL('**/auth/login');await page.goto('http://localhost:3107/app/customer',{waitUntil:'networkidle'});assert(page.url().includes('/auth/login'),'Sign out clears protected access');
} finally {if(browser)await browser.close();for(const id of ids){const {error}=await admin.auth.admin.deleteUser(id);if(error)throw new Error('Disposable account cleanup failed');}await fs.mkdir('artifacts/testing',{recursive:true});await fs.writeFile('artifacts/testing/integration.json',JSON.stringify({checks,disposableAccountsRemoved:ids.length},null,2));}
