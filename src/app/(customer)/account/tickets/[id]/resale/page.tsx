import {notFound} from 'next/navigation';
import Link from 'next/link';
import {getCustomer} from '@/lib/data/context';
import {untyped} from '@/lib/workspace/db';
import {requestTime} from '@/lib/workspace/format';
import {ResaleReview} from './review';
import '@/styles/agent-run.css';
export const metadata={title:'Official resale'};
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {id}=await params,sp=await searchParams; const ctx=await getCustomer(`/account/tickets/${id}/resale?step=${sp.step==='2'?'2':'1'}`);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))notFound();
 const db=untyped(ctx.supabase);const {data:t,error}=await db.from('tickets').select('id,status,price_paid,checked_in_at,seat,tier:ticket_tiers(price),event:events!inner(name,starts_at,status,currency,settings)').eq('id',id).eq('holder_id',ctx.user.id).maybeSingle();
 if(error)throw new Error('Could not load your ticket. Try again.');if(!t)notFound();
 const e=t.event as unknown as {name:string;starts_at:string|null;status:string;currency:string|null;settings:Record<string,unknown>};
 const {data:cfg}=await db.from('platform_settings').select('value').eq('section','ticketing').eq('status','published').order('version',{ascending:false}).limit(1).maybeSingle();
 const tier=t.tier as unknown as {price:number}|null;
 const cap=Number(tier?.price??0)*Number(cfg?.value?.resale_cap_pct??100)/100;
 const reason=t.status!=='valid'||t.checked_in_at?'Only valid, unused tickets can be listed.':Number(t.price_paid)<=0?'Free tickets cannot be listed for paid resale.':e.settings.resale===false||cfg?.value?.resale_enabled===false?'Official resale is turned off for this event.':!e.starts_at||Date.parse(e.starts_at)<=requestTime()||!['published','on_sale'].includes(e.status)?'The resale window is closed.':Number(t.price_paid)>cap?'The price paid exceeds the current configured resale cap. This resale flow supports the original price only. Contact ticket support.':null;
 const price=new Intl.NumberFormat('en-GB',{style:'currency',currency:e.currency||'GBP'}).format(Number(t.price_paid));const step=sp.step==='2'?2:1;
 return <article className="ar"><Link href={`/account/tickets/${id}`}>← Ticket details</Link><header><p>Step {step} of 2 · Official resale</p><h1>{step===1?'Eligibility and price':'Review and list'}</h1><p>{e.name}</p></header><progress max={2} value={step} aria-label={`Step ${step} of 2`} />
  {reason?<section><h2>Resale unavailable</h2><p role="status">{reason}</p><Link href="/help?topic=tickets">Ticket help</Link></section>:<><section><h2>Your ticket</h2><dl className="ar-stats"><div><dt>Admission</dt><dd>{t.seat||'General admission'}</dd></div><div><dt>Price paid and asking price</dt><dd>{price}</dd></div><div><dt>Seller proceeds</dt><dd>{price} pending after sale</dd></div></dl><p>Gala Dock currently supports resale at the price paid. Buyer fees are calculated at checkout. Your original credential is paused while listed and replaced after a completed sale.</p></section>
   <section><h2>Payout and withdrawal</h2><p>Completed sales record proceeds as a pending payout. This page does not confirm a payout destination or payment date. You can withdraw while no buyer has an active reservation.</p></section>
   {step===1?<Link className="k-btn primary" href={`?step=2`}>Review listing</Link>:<ResaleReview ticketId={id} />}</>}
 </article>;
}
