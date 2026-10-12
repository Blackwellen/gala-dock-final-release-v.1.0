import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, createUser, cleanup, login, BASE } from "../phase1/helpers";

// Exercise the actual server modules with a deterministic Stripe boundary. No payment/refund is sent.
function serverModule(file:string,db:unknown,stripe:unknown){
 const loaded={exports:{} as {finalise:(ref:string)=>Promise<{ok:boolean;error?:string}>;processTicketRefunds:(limit:number)=>Promise<{refunded:number;failed:number;pending:number}>}};
 const require=(name:string)=>name==='server-only'?{}:name==='@/lib/supabase/admin'?{createAdminClient:()=>db}:name==='@/lib/workspace/db'?{untyped:(v:unknown)=>v}:name==='@/lib/stripe'?{stripe}:(()=>{throw new Error(`Unexpected test dependency: ${name}`);})();
 const compiled=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(compiled,{module:loaded,exports:loaded.exports,require,Date,Map,Math});return loaded.exports;
}

test.describe('refund completion is authoritative',()=>{
 const db=admin as unknown as SupabaseClient;let owner:{id:string;email:string},event:string,ref:string;
 test.beforeAll(async()=>{
  owner=await createUser('refund-ui');
  const e=await db.from('events').insert({owner_id:owner.id,name:'Refund regression',starts_at:new Date(Date.now()+30*864e5).toISOString()}).select('id').single();if(e.error)throw e.error;event=e.data.id;
  ref=`GD-${randomBytes(5).toString('hex').toUpperCase()}`;
  const o=await db.from('checkout_orders').insert({order_ref:ref,buyer_id:owner.id,event_id:event,token:randomBytes(16).toString('hex'),amount:50,fee:5,status:'paid',stripe_session:'cs_test_refund_fixture',lines:[]});if(o.error)throw o.error;
 });
 test.afterAll(async()=>{if(ref)await db.from('checkout_orders').delete().eq('order_ref',ref);if(event)await db.from('events').delete().eq('id',event);await cleanup();});
 test('an expired paid hold queues a durable refund; repeat finalisation cannot issue tickets',async()=>{
  const calls:string[]=[];
  const source=serverModule('src/lib/checkout.ts',db,async(path:string)=>{calls.push(path);return{payment_status:'paid',amount_total:5500,metadata:{order_ref:ref}};});
  expect((await source.finalise(ref)).error).toBe('hold_expired_refund_pending');
  const order=await db.from('checkout_orders').select('status,refund_status,refund_reason').eq('order_ref',ref).single();
  expect(order.error).toBeNull();expect(order.data).toMatchObject({status:'paid',refund_status:'due',refund_reason:'hold_expired'});
  expect((await source.finalise(ref)).error).toBe('hold_expired_refund_pending');
  expect(calls).toEqual(['checkout/sessions/cs_test_refund_fixture']);
 });
 test('forged refund query cannot claim completion; completed state comes from the order',async({page})=>{
  await login(page,owner.email);
  await page.goto(`${BASE}/checkout/${event}/confirmation?order=${ref}&issue=hold_expired_refunded`);
  await expect(page.getByRole('heading',{name:'Refund in progress',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Payment refunded',exact:true})).toHaveCount(0);
  const updated=await db.from('checkout_orders').update({status:'refunded',refund_status:'refunded'}).eq('order_ref',ref);if(updated.error)throw updated.error;
  await page.reload();await expect(page.getByRole('heading',{name:'Payment refunded',exact:true})).toBeVisible();
 });
});

test.describe('refund worker Stripe boundary',()=>{
 for(const status of ['pending','requires_action','failed','succeeded'])test(`Stripe ${status} is not misreported`,async()=>{
  const writes:Array<{table:string;value:Record<string,unknown>}>=[],calls:string[]=[];
  const order={order_ref:'GD-TESTREFUND',stripe_session:'cs_test_boundary',stripe_refund_id:null,refund_reason:'hold_expired',event_id:'test-event'};
  const db={rpc:async()=>({data:[order],error:null}),from:(table:string)=>({update:(value:Record<string,unknown>)=>{writes.push({table,value});return{eq:()=>({error:null,in:async()=>({error:null})})};},select:()=>({eq:()=>({single:async()=>({data:{workspace_id:null}})})}),insert:async(value:Record<string,unknown>)=>{writes.push({table,value});return{error:null};}})};
  const source=serverModule('src/lib/commerce/ticket-refunds.ts',db,async(path:string)=>{calls.push(path);return path.startsWith('checkout/')?{payment_intent:'pi_test_boundary'}:{id:'re_test_boundary',status,amount:5500};});
  const result=await source.processTicketRefunds(1);
  expect(result.refunded).toBe(status==='succeeded'?1:0);expect(result.failed).toBe(status==='failed'?1:0);
  expect(writes.some(w=>w.value.status==='refunded')).toBe(status==='succeeded');
  expect(writes.some(w=>w.value.stripe_refund_id==='re_test_boundary')).toBe(true);expect(calls).toContain('refunds');
 });
 test('a persisted pending refund is retrieved without another create request',async()=>{
  const calls:string[]=[];
  const db={rpc:async()=>({data:[{order_ref:'GD-POLLREFUND',stripe_session:'cs_test_poll',stripe_refund_id:'re_test_poll',event_id:'test-event'}]}),from:()=>({update:()=>({eq:()=>({error:null,in:async()=>({error:null})})}),select:()=>({eq:()=>({single:async()=>({data:{workspace_id:null}})})}),insert:async()=>({error:null})})};
  const source=serverModule('src/lib/commerce/ticket-refunds.ts',db,async(path:string)=>{calls.push(path);return path.startsWith('checkout/')?{payment_intent:'pi_test_poll'}:{id:'re_test_poll',status:'succeeded',amount:5500};});
  expect((await source.processTicketRefunds(1)).refunded).toBe(1);expect(calls).toEqual(['checkout/sessions/cs_test_poll','refunds/re_test_poll']);
 });
});
