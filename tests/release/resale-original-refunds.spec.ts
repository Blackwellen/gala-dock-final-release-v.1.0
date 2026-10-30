import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as paymentService from '../../src/lib/payments/service';
import type {StripeRequest} from '../../src/lib/payments/stripe-client';

// Execute the real worker with deterministic database/provider boundaries; never send money.
function fixture(options:{status?:string;stored?:boolean;lost?:boolean;aged?:boolean;wrongBuyer?:boolean;disputed?:boolean;settlementError?:boolean;direct?:boolean}={}){
 const writes:Record<string,unknown>[]=[],calls:Array<{path:string;params?:Record<string,string>;key?:string;account?:string}>=[];
 const job={id:'payout-fixture',seller_id:'seller-fixture',original_order_ref:'GD-ORIGINAL',amount:20,stripe_refund_id:options.stored?'re_fixture':null,requested_at:options.lost||options.aged?new Date(Date.now()-(options.aged?48:1)*3600e3).toISOString():null};
 const refund={id:'re_fixture',status:options.status??'succeeded',amount:2000,currency:'gbp',payment_intent:'pi_fixture',metadata:{resale_payout_id:job.id}};
 const db={rpc:async(name:string)=>{if(name==='claim_resale_refunds')return{data:[job],error:null};if(name==='resale_refund_ready')return{data:true,error:null};if(options.settlementError)return{error:{message:'settlement fixture failure'}};writes.push({status:'paid',settled:true});return{data:true,error:null};},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{buyer_id:options.wrongBuyer?'another-buyer':job.seller_id,status:'issued',stripe_session:'cs_test_fixture',currency:'GBP',amount:40,fee:5,strategy:options.direct?'direct':'platform',connected_account_id:options.direct?'acct_fixtureOrganiser':null}})})}),update:(value:Record<string,unknown>)=>{writes.push(value);return{eq:async()=>({error:null})};}})};
 const stripe=async(path:string,params?:Record<string,string>,opts?:{idempotencyKey?:string;stripeAccount?:string})=>{
  calls.push({path,params,key:opts?.idempotencyKey,account:opts?.stripeAccount});
  if(path.startsWith('checkout/'))return{payment_intent:'pi_fixture',payment_status:'paid',amount_total:4500,currency:'gbp',metadata:{order_ref:job.original_order_ref}};
  if(path.startsWith('payment_intents/'))return{latest_charge:{disputed:!!options.disputed,amount:4500,amount_refunded:0,currency:'gbp'}};
  if(path.startsWith('refunds?'))return{data:options.lost?[refund]:[],has_more:false};
  return refund;
 };
 // Fake Stripe client behind the real refundMerchantCharge (Q07 connected-account refund helper).
 const client={request:async<T,>(r:StripeRequest):Promise<T>=>{calls.push({path:r.path,params:r.params,key:r.idempotencyKey,account:r.stripeAccount});
  return {...refund,metadata:{resale_payout_id:r.params?.['metadata[resale_payout_id]']??''}} as T;}};
 const loaded={exports:{} as {processResaleRefunds:(limit:number)=>Promise<{refunded:number;pending:number;failed:number}>}};
 const require=(name:string)=>name==='server-only'?{}:name==='@/lib/supabase/admin'?{createAdminClient:()=>db}:name==='@/lib/workspace/db'?{untyped:(v:unknown)=>v}:name==='@/lib/stripe'?{stripe}:name==='@/lib/payments/server'?{paymentDeps:()=>({stripe:client,data:{}})}:name==='@/lib/payments/service'?paymentService:(()=>{throw new Error(name);})();
 const code=ts.transpileModule(readFileSync('src/lib/commerce/resale-refunds.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(code,{module:loaded,exports:loaded.exports,require,Date,Math,Number,URLSearchParams});
 return{run:()=>loaded.exports.processResaleRefunds(1),calls,writes};
}

test.describe('resale refunds to original payment',()=>{
 for(const status of ['succeeded','pending','requires_action','failed','canceled'])test(`provider ${status} is recorded truthfully`,async()=>{
  const f=fixture({status});const result=await f.run();
  expect(result.refunded).toBe(status==='succeeded'?1:0);
  expect(f.writes.some(v=>v.status==='paid')).toBe(status==='succeeded');
  const create=f.calls.find(v=>v.path==='refunds');
  expect(create?.params).toMatchObject({payment_intent:'pi_fixture',amount:'2000','metadata[order_ref]':'GD-ORIGINAL'});
  expect(create?.key).toBe('resale-refund:payout-fixture');
  expect(f.writes.some(v=>v.stripe_refund_id==='re_fixture')).toBe(true);
 });
 test('stored pending refund is polled instead of created again',async()=>{
  const f=fixture({stored:true});expect((await f.run()).refunded).toBe(1);expect(f.calls.map(v=>v.path)).toEqual(['checkout/sessions/cs_test_fixture','refunds/re_fixture']);
 });
 test('lost response is reconciled by payout metadata before any new request',async()=>{
  const f=fixture({lost:true});expect((await f.run()).refunded).toBe(1);expect(f.calls.some(v=>v.path.startsWith('refunds?'))).toBe(true);expect(f.calls.some(v=>v.params)).toBe(false);
 });
 test('expired idempotency window with unknown outcome requires reconciliation',async()=>{
  const f=fixture({aged:true});expect((await f.run()).failed).toBe(1);expect(f.calls.some(v=>v.params)).toBe(false);expect(f.writes.at(-1)?.refund_error).toBe('refund_reconciliation_required');
 });
 test('transferred holder cannot refund another buyer payment',async()=>{
  const f=fixture({wrongBuyer:true});expect((await f.run()).failed).toBe(1);expect(f.calls).toHaveLength(0);
 });
 test('a disputed original charge cannot create a seller refund',async()=>{
  const f=fixture({disputed:true});expect((await f.run()).failed).toBe(1);expect(f.calls.some(v=>v.params)).toBe(false);
 });
 test('provider success cannot look paid if liability settlement fails',async()=>{
  const f=fixture({settlementError:true});expect((await f.run()).refunded).toBe(0);expect(f.writes.some(v=>v.status==='paid')).toBe(false);expect(f.writes.at(-1)?.status).toBe('failed');
 });
 test('direct-charge original is refunded on the organiser connected account, fee retained',async()=>{
  const f=fixture({direct:true});const result=await f.run();
  expect(result.refunded).toBe(1);
  expect(f.calls.filter(v=>v.path!=='refunds').every(v=>v.account==='acct_fixtureOrganiser')).toBe(true);
  const create=f.calls.find(v=>v.path==='refunds');
  expect(create?.account).toBe('acct_fixtureOrganiser');
  expect(create?.key).toBe('resale-refund:payout-fixture');
  expect(create?.params).toMatchObject({payment_intent:'pi_fixture',amount:'2000',refund_application_fee:'false','metadata[resale_payout_id]':'payout-fixture','metadata[order_ref]':'GD-ORIGINAL'});
  expect(f.writes.some(v=>v.status==='paid')).toBe(true);
 });
 test('legacy platform original never sends a Stripe-Account header',async()=>{
  const f=fixture();await f.run();expect(f.calls.every(v=>!v.account)).toBe(true);
 });
 test('direct original: a stored refund is polled in the connected account and never re-created',async()=>{
  const f=fixture({direct:true,stored:true});expect((await f.run()).refunded).toBe(1);
  expect(f.calls.map(v=>[v.path,v.account])).toEqual([['checkout/sessions/cs_test_fixture','acct_fixtureOrganiser'],['refunds/re_fixture','acct_fixtureOrganiser']]);
 });
 test('direct original: lost response is recovered from the connected account before any new request',async()=>{
  const f=fixture({direct:true,lost:true});expect((await f.run()).refunded).toBe(1);expect(f.calls.some(v=>v.params)).toBe(false);
  expect(f.calls.find(v=>v.path.startsWith('refunds?'))?.account).toBe('acct_fixtureOrganiser');
 });
});
