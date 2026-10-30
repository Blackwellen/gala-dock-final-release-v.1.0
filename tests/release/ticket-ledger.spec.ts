import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
function fixture(kind='resale',allocations=[{seller_id:'seller-a',amount_minor:1200},{seller_id:'seller-b',amount_minor:800}]){
 const calls:Array<{name:string;value:Record<string,unknown>}>=[];
 const order={kind,amount:20,fee:5,commission:kind==='resale'?0:2,fee_vat:.8,commission_vat:kind==='resale'?0:.2,currency:'GBP',event_id:'event'};
 const db={
  from:(table:string)=>({select:()=>({eq:()=>{
   if(table==='checkout_resale_allocations')return Promise.resolve({data:allocations,error:null});
   return {maybeSingle:async()=>({data:table==='events'?{workspace_id:'workspace',owner_id:'creator'}:order,error:null})};
  }})}),
  rpc:async(name:string,value:Record<string,unknown>)=>{calls.push({name,value});return{error:null};},
 };
 const loaded={exports:{} as {ledgerForTicketPayment:(db:unknown,pi:unknown)=>Promise<void>}};
 const code=ts.transpileModule(readFileSync('src/lib/commerce/ticket-ledger.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(code,{module:loaded,exports:loaded.exports,require:()=>({}),Math,Number,String});
 return{calls,run:(amount=2500,currency='gbp')=>loaded.exports.ledgerForTicketPayment(db,{id:'pi_fixture',amount_received:amount,currency,metadata:{order_ref:'GD-FIXTURE'}})};
}
test('resale credits each actual seller, preserves fee/VAT and never increases workspace payable',async()=>{
 const f=fixture();await f.run();const lines=f.calls[0].value.p_lines as {account:string;amount_minor:number;party_type:string;party_id?:string}[];
 expect(lines.reduce((sum,l)=>sum+l.amount_minor,0)).toBe(0);
 expect(lines.filter(l=>l.account==='provider_payable')).toEqual([{account:'provider_payable',amount_minor:-1200,party_type:'user',party_id:'seller-a'},{account:'provider_payable',amount_minor:-800,party_type:'user',party_id:'seller-b'}]);
 expect(lines.find(l=>l.account==='platform_fee')?.amount_minor).toBe(-420);expect(lines.find(l=>l.account==='tax_payable')?.amount_minor).toBe(-80);
 expect(f.calls[1]).toMatchObject({name:'reconcile_resale_liability',value:{p_ref:'GD-FIXTURE'}});
});
test('primary ticket sale still credits the event workspace net of commission',async()=>{
 const f=fixture('primary');await f.run();const lines=f.calls[0].value.p_lines as Record<string,unknown>[];
 expect(lines).toContainEqual({account:'provider_payable',amount_minor:-1800,party_type:'workspace',party_id:'workspace'});
});
test('missing or mismatched seller allocation cannot silently credit the workspace',async()=>{
 const f=fixture('resale',[{seller_id:'seller-a',amount_minor:1900}]);expect(await f.run().then(()=>'',(e:Error)=>e.message)).toBe('resale_allocation_mismatch');expect(f.calls).toHaveLength(0);
});
test('provider amount and currency must match the immutable checkout',async()=>{
 const f=fixture();expect(await f.run(2501).then(()=>'',(e:Error)=>e.message)).toBe('ticket_payment_mismatch');expect(await f.run(2500,'usd').then(()=>'',(e:Error)=>e.message)).toBe('ticket_payment_mismatch');expect(f.calls).toHaveLength(0);
});
