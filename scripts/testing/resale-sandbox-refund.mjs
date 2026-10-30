// Explicit real-provider integration. Only independently verified Stripe TEST payments qualify.
// Scope is one pending existing sandbox job; never invoke the global payments cron or log keys/card data.
import fs from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
if(process.env.PWA_SANDBOX_REFUND_E2E!=='1')throw new Error('Explicit PWA_SANDBOX_REFUND_E2E=1 is required');
const key=process.env.STRIPE_SECRET_KEY_SANDBOX;
if(!key?.startsWith('sk_test_'))throw new Error('A Stripe sandbox secret key is required');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
async function stripe(path,params,opts={}){
 const response=await fetch(`https://api.stripe.com/v1/${path}`,{method:params?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/x-www-form-urlencoded',...(opts.idempotencyKey?{'Idempotency-Key':opts.idempotencyKey}:{})},body:params?new URLSearchParams(params):undefined,signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(`sandbox_provider_http_${response.status}`);return response.json();
}
function source(file,scoped){
 const loaded={exports:{}};
 const require=name=>name==='server-only'?{}:name==='@/lib/supabase/admin'?{createAdminClient:()=>scoped}:name==='@/lib/workspace/db'?{untyped:v=>v}:name==='@/lib/stripe'?{stripe}:(()=>{throw new Error('Unexpected source dependency');})();
 runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:loaded,exports:loaded.exports,require,Date,Math,Number,String,URLSearchParams,Error});return loaded.exports;
}
const queued=await db.from('resale_payouts').select('*').eq('status','pending').is('stripe_refund_id',null).is('requested_at',null).not('original_order_ref','is',null).limit(100);
if(queued.error)throw new Error('Could not inspect sandbox refund candidates');
let chosen;
for(const job of queued.data??[])try{
 const orders=await db.from('checkout_orders').select('*').in('order_ref',[job.order_ref,job.original_order_ref]);
 const original=orders.data?.find(o=>o.order_ref===job.original_order_ref),resale=orders.data?.find(o=>o.order_ref===job.order_ref);
 if(!original||!resale||original.buyer_id!==job.seller_id||original.status!=='issued'||resale.status!=='issued'||original.refund_status!=='none'||!original.stripe_session?.startsWith('cs_test_')||!resale.stripe_session?.startsWith('cs_test_'))continue;
 if((await db.rpc('resale_refund_ready',{p_job:job.id})).data!==true)continue;
 const oldSession=await stripe(`checkout/sessions/${original.stripe_session}`),newSession=await stripe(`checkout/sessions/${resale.stripe_session}`);
 if(oldSession.livemode!==false||newSession.livemode!==false||oldSession.payment_status!=='paid'||newSession.payment_status!=='paid'||oldSession.metadata?.order_ref!==original.order_ref||newSession.metadata?.order_ref!==resale.order_ref)continue;
 const oldIntent=await stripe(`payment_intents/${oldSession.payment_intent}?expand[]=latest_charge`),newIntent=await stripe(`payment_intents/${newSession.payment_intent}`);
 if(oldIntent.livemode!==false||newIntent.livemode!==false||oldIntent.latest_charge?.disputed||oldIntent.latest_charge.amount-oldIntent.latest_charge.amount_refunded<Math.round(job.amount*100))continue;
 chosen={job,newIntent,oldIntent};break;
}catch{/* Invalid/deleted test sessions are not candidates. No write or refund occurred. */}
if(!chosen)throw new Error('No independently verified, refundable sandbox resale job is available');
const {job,newIntent,oldIntent}=chosen;
await source('src/lib/commerce/ticket-ledger.ts',db).ledgerForTicketPayment(db,newIntent);
const scoped={from:table=>db.from(table),rpc:(name,args)=>name==='claim_resale_refunds'?db.rpc('claim_resale_refund',{p_job:job.id}):db.rpc(name,args)};
const result=await source('src/lib/commerce/resale-refunds.ts',scoped).processResaleRefunds(1);
if(result.refunded!==1)throw new Error(`Sandbox refund not completed: ${JSON.stringify(result)}`);
const completed=await db.from('resale_payouts').select('status,stripe_refund_id').eq('id',job.id).single();
const refund=await stripe(`refunds/${completed.data.stripe_refund_id}`);
if(refund.status!=='succeeded'||refund.amount!==Math.round(job.amount*100)||refund.payment_intent!==oldIntent.id)throw new Error('Sandbox refund verification failed');
// Record authoritative cash delta as a signed webhook would; this records money and never sends another refund.
const charge=await stripe(`charges/${oldIntent.latest_charge.id}`);
const ledger=await db.rpc('post_stripe_refund_delta',{p_charge:charge.id,p_total:charge.amount_refunded,p_currency:charge.currency.toUpperCase(),p_order_ref:job.original_order_ref});if(ledger.error)throw new Error('Could not record sandbox refund cash');
const replay=await source('src/lib/commerce/resale-refunds.ts',scoped).processResaleRefunds(1);if(replay.refunded!==0)throw new Error('Completed job was claimed twice');
console.log(JSON.stringify({result:'PASS',mode:'Stripe test only',job:job.id,refund:refund.id,amountMinor:refund.amount,status:completed.data.status,originalMethodConfirmed:true,replayRefunds:replay.refunded}));
