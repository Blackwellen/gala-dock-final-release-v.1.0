// Explicit visual/domain auth fixture for the repository's designated demo identities.
// No email is sent. OTP creates a normal user session; any enrolled TOTP is still verified.
// This does not test password login or CAPTCHA. Secrets/cookies are never logged.
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { totp } from './totp.mjs';
const targets={customer:{email:'alex.thompson@example.com',land:'/discover'},organizer:{email:'alex.events@example.com',land:'/organizer'},provider:{email:'provider.demo@example.com',land:'/provider'},admin:{email:'admin.demo@example.com',land:'/admin',secret:process.env.DEMO_ADMIN_TOTP_SECRET}};
const base=process.env.BASE_URL??'http://localhost:3107';
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
await fs.mkdir('artifacts/auth',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{for(const role of process.argv.slice(2)){
 const target=targets[role];if(!target)throw new Error('Unknown designated demo identity');
 const link=await admin.auth.admin.generateLink({type:'magiclink',email:target.email});if(link.error)throw new Error(`OTP fixture unavailable for ${role}`);
 const jar=new Map();
 const user=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(c=>jar.set(c.name,c.value))}});
 const auth=await user.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token});if(auth.error)throw new Error(`OTP exchange failed for ${role}`);
 const factors=await user.auth.mfa.listFactors();if(factors.error)throw new Error(`Could not inspect MFA for ${role}`);
 if(factors.data.totp.length){if(!target.secret)throw new Error(`An enrolled MFA factor is required for ${role}`);const checked=await user.auth.mfa.challengeAndVerify({factorId:factors.data.totp[0].id,code:totp(target.secret)});if(checked.error)throw new Error(`MFA verification failed for ${role}`);}
 const ctx=await browser.newContext();await ctx.addCookies([...jar].map(([name,value])=>({name,value,domain:new URL(base).hostname,path:'/',secure:new URL(base).protocol==='https:',sameSite:'Lax'})));
 const page=await ctx.newPage();await page.goto(base+target.land,{waitUntil:'networkidle',timeout:120000});
 if(new URL(page.url()).pathname!==target.land)throw new Error(`${role} fixture did not reach its authorized surface`);
 await ctx.storageState({path:`artifacts/auth/pwa-resume-${role}.json`});await ctx.close();console.log(`${role}: user-scoped OTP fixture ready${factors.data.totp.length?' with verified MFA':''}`);
}}finally{await browser.close();}
