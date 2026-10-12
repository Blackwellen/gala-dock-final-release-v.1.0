-- PWA audit: the previous listing RPC ignored the event's resale switch and active buyer reservations.
-- Keep the existing face-value model; ticket row locks serialize scan, transfer, listing and withdrawal.
begin;
create or replace function public.list_ticket_for_resale(p_ticket uuid, p_cancel boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare tk public.tickets; ev public.events; cap numeric;
begin
  select * into tk from public.tickets where id=p_ticket and holder_id=auth.uid() for update;
  if not found then raise exception 'not_authorized' using errcode='42501'; end if;
  if p_cancel then
    if tk.status <> 'resale_listed' then raise exception 'not_listed' using errcode='22023'; end if;
    if exists(select 1 from public.resale_holds where ticket_id=tk.id and expires_at>now()) then
      raise exception 'resale_reserved' using errcode='23P01';
    end if;
    update public.tickets set status='valid', qr_nonce=encode(extensions.gen_random_bytes(16),'hex') where id=tk.id;
  else
    select * into ev from public.events where id=tk.event_id;
    if tk.status <> 'valid' or tk.checked_in_at is not null then raise exception 'not_resellable' using errcode='22023'; end if;
    if ev.settings->>'resale'='false' or coalesce((select value->>'resale_enabled' from public.platform_settings where section='ticketing' and status='published' order by version desc limit 1),'true')='false' then
      raise exception 'resale_disabled' using errcode='22023';
    end if;
    if ev.starts_at is null or ev.starts_at<=now() or ev.status not in ('published','on_sale') then raise exception 'resale_window_closed' using errcode='22023'; end if;
    if coalesce(tk.price_paid,0)<=0 then raise exception 'not_resellable' using errcode='22023'; end if;
    select tt.price * coalesce((select (value->>'resale_cap_pct')::numeric from public.platform_settings where section='ticketing' and status='published' order by version desc limit 1),100)/100 into cap from public.ticket_tiers tt where tt.id=tk.tier_id;
    if tk.price_paid>coalesce(cap,0) then raise exception 'price_cap_exceeded' using errcode='22023'; end if;
    update public.tickets set status='resale_listed', qr_nonce=encode(extensions.gen_random_bytes(16),'hex') where id=tk.id;
  end if;
  insert into public.audit_events(actor_id,actor_type,event,metadata)
    values(auth.uid(),'user',case when p_cancel then 'ticket.resale_withdrawn' else 'ticket.resale_listed' end,jsonb_build_object('event_id',tk.event_id,'ticket_id',tk.id,'price',tk.price_paid));
  return case when p_cancel then 'valid' else 'resale_listed' end;
end $$;
revoke all on function public.list_ticket_for_resale(uuid,boolean) from public,anon;
grant execute on function public.list_ticket_for_resale(uuid,boolean) to authenticated,service_role;

-- The same ticket locks also prevent a seller withdrawing between the buyer's status check and reservation.
create or replace function public.hold_resale(p_event uuid,p_tickets uuid[],p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n int:=coalesce(array_length(p_tickets,1),0); got int; exp timestamptz:=now()+interval '10 minutes'; ev public.events;
begin
  if auth.uid() is null then raise exception 'not_authorized' using errcode='42501'; end if;
  if n=0 or n>10 then raise exception 'invalid_quantity' using errcode='22023'; end if;
  if length(coalesce(p_token,''))<16 then raise exception 'invalid_token' using errcode='22023'; end if;
  select * into ev from public.events where id=p_event;
  if ev.starts_at is null or ev.starts_at<=now() or ev.status not in ('published','on_sale') or ev.settings->>'resale'='false'
    or coalesce((select value->>'resale_enabled' from public.platform_settings where section='ticketing' and status='published' order by version desc limit 1),'true')='false' then
    raise exception 'resale_window_closed' using errcode='22023';
  end if;
  perform 1 from public.tickets where id=any(p_tickets) order by id for update;
  if exists(select 1 from public.tickets t join public.ticket_tiers tt on tt.id=t.tier_id where t.id=any(p_tickets)
    and t.price_paid>tt.price*coalesce((select (value->>'resale_cap_pct')::numeric from public.platform_settings where section='ticketing' and status='published' order by version desc limit 1),100)/100) then
    raise exception 'price_cap_exceeded' using errcode='22023';
  end if;
  delete from public.resale_holds where expires_at<now() or token=p_token;
  if exists(select 1 from public.tickets where id=any(p_tickets) and holder_id=auth.uid()) then raise exception 'own_ticket' using errcode='22023'; end if;
  insert into public.resale_holds(ticket_id,token,expires_at)
    select id,p_token,exp from public.tickets where id=any(p_tickets) and event_id=p_event and status='resale_listed'
    on conflict(ticket_id) do nothing;
  get diagnostics got=row_count;
  if got<>n then raise exception 'seat_unavailable' using errcode='23P01'; end if;
  return jsonb_build_object('held',got,'expires_at',exp);
end $$;
revoke all on function public.hold_resale(uuid,uuid[],text) from public,anon;
grant execute on function public.hold_resale(uuid,uuid[],text) to authenticated,service_role;

-- The public quote and the held checkout use the same immutable price paid. Unsupported prices are omitted,
-- rather than advertising a lower cap and then charging the higher face value at checkout.
create or replace function public.resale_listings(p_event uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'tier',tt.name,'tier_id',tt.id,'seat',t.seat,'price',t.price_paid) order by t.price_paid),'[]'::jsonb)
 from public.tickets t join public.ticket_tiers tt on tt.id=t.tier_id join public.events e on e.id=t.event_id
 left join lateral(select value from public.platform_settings where section='ticketing' and status='published' order by version desc limit 1) s on true
 where t.event_id=p_event and t.status='resale_listed' and e.visibility='public' and e.status in ('published','on_sale') and e.starts_at>now()
 and coalesce(e.settings->>'resale','true')<>'false' and coalesce(s.value->>'resale_enabled','true')<>'false'
 and t.price_paid>0 and t.price_paid<=tt.price*coalesce((s.value->>'resale_cap_pct')::numeric,100)/100
 and not exists(select 1 from public.resale_holds h where h.ticket_id=t.id and h.expires_at>now())
$$;
revoke all on function public.resale_listings(uuid) from public;
grant execute on function public.resale_listings(uuid) to anon,authenticated,service_role;
commit;

