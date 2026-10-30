import { test,expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {admin,createUser,signedIn,cleanup,login,seedWorkspace,BASE, insertEventFixture} from '../phase1/helpers';
const db=admin as unknown as SupabaseClient;
test.describe('official resale policy and reservation integrity',()=>{
 test.describe.configure({mode:'serial'});
 let owner:{id:string;email:string},buyer:{id:string;email:string},outsider:{id:string;email:string};
 let seller:SupabaseClient,buy:SupabaseClient,out:SupabaseClient,event:string,tier:string,ticket:string,ws:string;
 const token=randomUUID().replaceAll('-','');
 test.beforeAll(async()=>{
  [owner,buyer,outsider]=await Promise.all([createUser('resale-seller'),createUser('resale-buyer'),createUser('resale-out')]);
  [seller,buy,out]=await Promise.all([signedIn(owner.email),signedIn(buyer.email),signedIn(outsider.email)]) as unknown as SupabaseClient[];
  // Organiser (professional) event: the test moves the start date with valid tickets, which consumer_event_date_guard refuses for consumer events.
  ws=await seedWorkspace(owner.id,'organizer','Resale policy organiser');
  const e=await insertEventFixture({owner_id:owner.id,workspace_id:ws,management:'professional',name:'Isolated PWA resale policy test',visibility:'public',status:'on_sale',starts_at:new Date(Date.now()+864e5).toISOString(),settings:{resale:false}}, "resale-policy").select('id').single(); if(e.error)throw e.error;event=e.data.id;
  const t=await db.from('ticket_tiers').insert({event_id:event,name:'Test GA',price:20,quantity:2,status:'on_sale'}).select('id').single();if(t.error)throw t.error;tier=t.data.id;
  const ref='PWA-TEST-'+randomUUID();
  const order=await db.from('checkout_orders').insert({order_ref:ref,event_id:event,buyer_id:owner.id,token:randomUUID(),amount:20,status:'issued',stripe_session:'cs_test_'+randomUUID()});if(order.error)throw order.error;
  const tk=await db.from('tickets').insert({event_id:event,tier_id:tier,holder_id:owner.id,code:'GLD-PWA-'+randomUUID(),order_ref:ref,price_paid:20,status:'valid'}).select('id').single();if(tk.error)throw tk.error;ticket=tk.data.id;
 });
 test.afterAll(async()=>{if(event){await db.from('resale_holds').delete().eq('ticket_id',ticket);await db.from('checkout_orders').delete().eq('event_id',event);await db.from('events').delete().eq('id',event);}if(ws)await db.from('workspaces').delete().eq('id',ws);await cleanup();});
 test('event policy, scan state, ownership and window are enforced by the RPC',async()=>{
  expect((await out.rpc('list_ticket_for_resale',{p_ticket:ticket,p_cancel:false})).error?.message).toMatch(/not_authorized/);
  expect((await seller.rpc('list_ticket_for_resale',{p_ticket:ticket,p_cancel:false})).error?.message).toMatch(/resale_disabled/);
  await db.from('events').update({settings:{resale:true}}).eq('id',event);
  await db.from('ticket_tiers').update({price:0}).eq('id',tier);
  expect((await seller.rpc('list_ticket_for_resale',{p_ticket:ticket,p_cancel:false})).error?.message).toMatch(/price_cap_exceeded/);
  await db.from('ticket_tiers').update({price:20}).eq('id',tier);
  await db.from('tickets').update({checked_in_at:new Date().toISOString()}).eq('id',ticket);
  expect((await seller.rpc('list_ticket_for_resale',{p_ticket:ticket,p_cancel:false})).error?.message).toMatch(/not_resellable/);
  await db.from('tickets').update({checked_in_at:null}).eq('id',ticket);
  await db.from('events').update({starts_at:new Date(Date.now()-864e5).toISOString()}).eq('id',event);
  expect((await seller.rpc('list_ticket_for_resale',{p_ticket:ticket,p_cancel:false})).error?.message).toMatch(/resale_window_closed/);
  await db.from('events').update({starts_at:new Date(Date.now()+864e5).toISOString()}).eq('id',event);
  await db.from('tickets').update({holder_id:buyer.id}).eq('id',ticket);
  expect((await buy.rpc('list_ticket_for_resale',{p_ticket:ticket,p_cancel:false})).error?.message).toMatch(/original_payment_required/);
  await db.from('tickets').update({holder_id:owner.id}).eq('id',ticket);
 });
 test('listing rotates the credential; reservation blocks withdrawal; expired reservation allows withdrawal with fresh credential',async()=>{
  const nonce=async()=> (await db.from('tickets').select('qr_nonce').eq('id',ticket).single()).data!.qr_nonce;
  const before=await nonce();
  expect((await seller.rpc('list_ticket_for_resale',{p_ticket:ticket,p_cancel:false})).error).toBeNull();const listed=await nonce();expect(listed).not.toBe(before);
  expect((await buy.rpc('hold_resale',{p_event:event,p_tickets:[ticket],p_token:token})).error).toBeNull();
  expect((await seller.rpc('list_ticket_for_resale',{p_ticket:ticket,p_cancel:true})).error?.message).toMatch(/resale_reserved/);
  const second=await out.rpc('hold_resale',{p_event:event,p_tickets:[ticket],p_token:randomUUID().replaceAll('-','')});expect(second.error?.message).toMatch(/seat_unavailable/);
  const expiry=await db.from('resale_holds').update({expires_at:'2000-01-01T00:00:00Z'}).eq('ticket_id',ticket).select('ticket_id');expect(expiry.error).toBeNull();expect(expiry.data).toHaveLength(1);
  expect((await seller.rpc('list_ticket_for_resale',{p_ticket:ticket,p_cancel:true})).error).toBeNull();expect(await nonce()).not.toBe(listed);
  expect((await db.from('tickets').select('status').eq('id',ticket).single()).data!.status).toBe('valid');
 });
 test('review names the original payment method and transferred holders cannot confirm a listing',async({page})=>{
  await login(page,owner.email);await page.goto(`${BASE}/account/tickets/${ticket}/resale?step=2`);
  await expect(page.getByRole('heading',{name:'Review and list',exact:true})).toBeVisible();
  await expect(page.getByText(/After a completed sale, the ticket price is refunded to your original payment method/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Confirm and list'})).toBeDisabled();
  const transferred=await db.from('tickets').update({holder_id:buyer.id}).eq('id',ticket);if(transferred.error)throw transferred.error;
  try{
   await page.context().clearCookies();await login(page,buyer.email);await page.goto(`${BASE}/account/tickets/${ticket}/resale?step=2`);
   await expect(page.getByRole('heading',{name:'Resale unavailable',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Confirm and list'})).toHaveCount(0);
  }finally{await db.from('tickets').update({holder_id:owner.id}).eq('id',ticket);}
 });
});
