import 'server-only';
import type {Db} from '@/lib/workspace/db';

type Payment={id:string;amount_received?:unknown;currency?:unknown;metadata?:Record<string,string>};
/** LEGACY platform-charge ticket orders only (pre-Q07). Immutable checkout allocations work before or after ticket issuance clears the buyer's hold. */
export async function ledgerForTicketPayment(db:Db,pi:Payment){
 const ref=pi.metadata?.order_ref,amount=Number(pi.amount_received??0);if(!ref||!amount)return;
 const loaded=await db.from('checkout_orders').select('amount,fee,commission,fee_vat,commission_vat,currency,event_id,buyer_id,kind,strategy').eq('order_ref',ref).maybeSingle();
 if(loaded.error)throw new Error('Could not load ticket payment.');const order=loaded.data;if(!order)return;
 // Direct charges (Q07) post their memo ledger in checkout_order_direct_paid; this platform-cash posting is legacy only.
 if(order.strategy==='direct')return;
 if(!Number.isSafeInteger(amount)||amount!==Math.round((Number(order.amount)+Number(order.fee))*100)||String(pi.currency??'').toUpperCase()!==order.currency.toUpperCase())throw new Error('ticket_payment_mismatch');
 const eventResult=await db.from('events').select('workspace_id,owner_id').eq('id',order.event_id).maybeSingle();
 if(eventResult.error||!eventResult.data)throw new Error('Could not load ticket payment event.');const event=eventResult.data;
 const fee=Math.min(amount,Math.round((Number(order.fee??0)+Number(order.commission??0))*100));
 const vat=Math.min(fee,Math.round((Number(order.fee_vat??0)+Number(order.commission_vat??0))*100));
 type Entry={account:string;amount_minor:number;party_type:string;party_id?:string|null};
 let liabilities:Entry[];
 if(order.kind==='resale'){
  const snapshot=await db.from('checkout_resale_allocations').select('seller_id,amount_minor').eq('order_ref',ref);
  const allocations=(snapshot.data??[]) as {seller_id:string|null;amount_minor:number}[];
  if(snapshot.error||!allocations.length||allocations.some(a=>!a.seller_id)||allocations.reduce((sum,a)=>sum+Number(a.amount_minor),0)!==amount-fee)throw new Error('resale_allocation_mismatch');
  liabilities=allocations.map(a=>({account:'provider_payable',amount_minor:-Number(a.amount_minor),party_type:'user',party_id:a.seller_id}));
 }else liabilities=[{account:'provider_payable',amount_minor:-(amount-fee),party_type:event.workspace_id?'workspace':'user',party_id:event.workspace_id??event.owner_id}];
 const lines:Entry[]=[{account:'cash_stripe',amount_minor:amount,party_type:'platform'},...(fee-vat?[{account:'platform_fee',amount_minor:-(fee-vat),party_type:'platform'}]:[]),...(vat?[{account:'tax_payable',amount_minor:-vat,party_type:'platform'}]:[]),...liabilities];
 const result=await db.rpc('post_ledger_transaction',{p_idempotency_key:`stripe:pi:${pi.id}`,p_kind:order.kind==='resale'?'ticket_resale':'ticket_order',p_currency:order.currency.toUpperCase(),p_lines:lines,p_workspace:event.workspace_id??null,p_event:order.event_id,p_source_type:'checkout_order',p_source_id:ref,p_description:`Ticket order ${ref}`,p_stripe_ref:pi.id,p_actor_type:'webhook'});
 if(result.error)throw new Error(`ledger: ${result.error.message}`);
 if(order.kind==='resale'){const corrected=await db.rpc('reconcile_resale_liability',{p_ref:ref});if(corrected.error)throw new Error('Could not reconcile resale liability.');}
}
