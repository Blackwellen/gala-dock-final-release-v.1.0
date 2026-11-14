-- Q57 follow-ups (lane bughunt-marketplace; coordinator decisions 2026-11-14). Additive: one nullable column + backfill, two new
-- trigger functions, two new read RPCs, same-signature replacements, and narrower public read policies.
--
-- 1. Resale face value (CRA 2015 s.90): tickets.face_value = the ticket's list price when it was bought (checkout line unit price,
--    before any discount code), carried to the new ticket on transfer/resale. Backfilled from primary order lines, then along
--    replaced_by chains, then the tier price. Resale caps, the listing snapshot and the public listing use it (falling back to the
--    tier price only for rows that somehow lack it). resale_listings also gains a unique listing reference and a masked ticket number
--    (last 4 characters only: the full code works for manual entry at the door, so it is never published).
-- 2. event_public_status_page(key): postponed and cancelled PUBLIC events get a read-only page (holders keep their links). Drafts,
--    private and demo-hidden events stay invisible. events_public is unchanged, so Discover / directory / checkout still list only
--    bookable events.
-- 3. Public reads: ticket tiers only when visible (on sale, sold out, scheduled, paused) and never access-code tiers; holders still read
--    the tier of a ticket they hold; checkout reads access-code tiers its own applied codes unlock (checkout_unlocked_tiers, by the
--    httpOnly checkout token). media_assets / venue_structures of an unpublished or paused listing are no longer public.
-- 4. accept_proposal: "valid until" compared with today in London (was the UTC date).
-- Rollback: drop the triggers/functions added here; restore resale_listings / hold_resale / list_ticket_for_resale /
-- tickets_resale_policy_guard / tickets_resale_listing_record from 202610294017 + 202610280025, accept_proposal with current_date,
-- and the three original policies (tiers_public_read = event_is_public(event_id); media_public_read without the listing check;
-- venue_structures_public_read = status = 'published'). The face_value column is inert if unused.

-- ── 1. Face value ───────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.tickets add column if not exists face_value numeric(12,2);
comment on column public.tickets.face_value is 'List price of this ticket when bought (checkout line unit, before discounts); carried to transfers/resales. CRA 2015 s.90 face value.';

create or replace function public.tickets_face_value_default() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.face_value is null then select tt.price into new.face_value from public.ticket_tiers tt where tt.id = new.tier_id; end if;
  return new;
end $$;
revoke all on function public.tickets_face_value_default() from public, anon, authenticated;
drop trigger if exists gd_face_value_default on public.tickets;
create trigger gd_face_value_default before insert on public.tickets for each row execute function public.tickets_face_value_default();

-- A transfer / resale issues a new ticket and points the old one at it: the new ticket keeps the original face value.
create or replace function public.tickets_face_value_carry() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.replaced_by is not null and new.replaced_by is distinct from old.replaced_by and new.face_value is not null then
    update public.tickets set face_value = new.face_value where id = new.replaced_by and face_value is distinct from new.face_value;
  end if;
  return null;
end $$;
revoke all on function public.tickets_face_value_carry() from public, anon, authenticated;
drop trigger if exists gd_face_value_carry on public.tickets;
create trigger gd_face_value_carry after update of replaced_by on public.tickets for each row execute function public.tickets_face_value_carry();

-- Backfill: primary order line unit for the ticket's tier (order_ref without the transfer suffix), then chains, then the tier price.
update public.tickets t set face_value = x.unit
  from (select o.order_ref, (l->>'tier_id')::uuid tier_id, max((l->>'unit')::numeric) unit
          from public.checkout_orders o, jsonb_array_elements(coalesce(o.lines, '[]')) l
         where o.kind = 'primary' and l ? 'tier_id' and l ? 'unit' and (l->>'tier_id') ~ '^[0-9a-f-]{36}$' and (l->>'unit') ~ '^[0-9]+(\.[0-9]+)?$'
         group by 1, 2) x
 where t.face_value is null and t.tier_id = x.tier_id and regexp_replace(t.order_ref, '-T.*$', '') = x.order_ref;
do $$ declare n int; i int := 0; begin
  loop
    update public.tickets nt set face_value = ot.face_value from public.tickets ot
     where ot.replaced_by = nt.id and ot.face_value is not null and nt.face_value is distinct from ot.face_value and nt.face_value is null;
    get diagnostics n = row_count; i := i + 1; exit when n = 0 or i >= 10;
  end loop;
end $$;
update public.tickets t set face_value = tt.price from public.ticket_tiers tt where t.face_value is null and tt.id = t.tier_id;

create or replace function public.tickets_resale_policy_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.resale_policies; face numeric; ev public.events; n int;
begin
  if new.status = 'resale_listed' and old.status is distinct from 'resale_listed' then
    p := public.resale_policy_for(new.event_id);
    if p.id is null then return new; end if;
    select coalesce(new.face_value, price) into face from public.ticket_tiers where id = new.tier_id;
    if coalesce(new.price_paid, 0) > coalesce(face, 0) * p.price_cap_pct / 100 then raise exception 'price_cap_exceeded' using errcode = '22023'; end if;
    select * into ev from public.events where id = new.event_id;
    if p.listing_cutoff_hours > 0 and ev.starts_at - make_interval(hours => p.listing_cutoff_hours) <= now() then raise exception 'resale_window_closed' using errcode = '22023'; end if;
    if p.max_active_listings_per_user is not null then
      select count(*) into n from public.tickets where holder_id = new.holder_id and event_id = new.event_id and status = 'resale_listed' and id <> new.id;
      if n >= p.max_active_listings_per_user then raise exception 'resale_limit' using errcode = '22023'; end if;
    end if;
  end if;
  return new;
end $$;

create or replace function public.tickets_resale_listing_record()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.resale_policies; tt public.ticket_tiers;
begin
  if new.status = 'resale_listed' and old.status is distinct from 'resale_listed' then
    p := public.resale_policy_for(new.event_id);
    select * into tt from public.ticket_tiers where id = new.tier_id;
    update public.ticket_resale_listings set status = 'lapsed', closed_at = now() where ticket_id = new.id and status = 'listed';
    insert into public.ticket_resale_listings(ticket_id, event_id, seller_id, policy_id, policy_version, jurisdiction, face_value_minor, price_minor, tier_name, seat, restrictions)
      values (new.id, new.event_id, new.holder_id, p.id, p.version, p.jurisdiction, round(coalesce(new.face_value, tt.price, 0) * 100)::bigint, round(coalesce(new.price_paid, 0) * 100)::bigint,
        coalesce(tt.name, ''), new.seat, coalesce(public.ticket_resale_restrictions(new.id), '{}'));
  elsif old.status = 'resale_listed' and new.status is distinct from 'resale_listed' then
    update public.ticket_resale_listings set status = case new.status when 'valid' then 'withdrawn' when 'resold' then 'sold' else 'lapsed' end,
      buyer_ticket_id = case when new.status = 'resold' then new.replaced_by end, closed_at = now()
    where ticket_id = new.id and status = 'listed';
  end if;
  return null;
end $$;

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
    select coalesce(tk.face_value, tt.price) * coalesce((select (value->>'resale_cap_pct')::numeric from public.platform_settings where section='ticketing' and status='published' order by version desc limit 1),100)/100 into cap from public.ticket_tiers tt where tt.id=tk.tier_id;
    if tk.price_paid>coalesce(cap,0) then raise exception 'price_cap_exceeded' using errcode='22023'; end if;
    update public.tickets set status='resale_listed', qr_nonce=encode(extensions.gen_random_bytes(16),'hex') where id=tk.id;
  end if;
  insert into public.audit_events(actor_id,actor_type,event,metadata)
    values(auth.uid(),'user',case when p_cancel then 'ticket.resale_withdrawn' else 'ticket.resale_listed' end,jsonb_build_object('event_id',tk.event_id,'ticket_id',tk.id,'price',tk.price_paid));
  return case when p_cancel then 'valid' else 'resale_listed' end;
end $$;

create or replace function public.hold_resale(p_event uuid, p_tickets uuid[], p_token text) returns jsonb
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
    and t.price_paid>coalesce(t.face_value, tt.price)*coalesce((select (value->>'resale_cap_pct')::numeric from public.platform_settings where section='ticketing' and status='published' order by version desc limit 1),100)/100) then
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

create or replace function public.resale_listings(p_event uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'tier', tt.name, 'tier_id', tt.id, 'seat', t.seat, 'price', t.price_paid,
   'face_value', coalesce(l.face_value_minor / 100.0, t.face_value, tt.price), 'restrictions', coalesce(l.restrictions, public.ticket_resale_restrictions(t.id)), 'policy_version', coalesce(l.policy_version, p.version),
   'jurisdiction', coalesce(l.jurisdiction, p.jurisdiction),
   'listing_ref', case when l.id is null then null else 'RSL-' || upper(left(replace(l.id::text, '-', ''), 8)) end,
   'ticket_ref', 'GLD-••••-••' || upper(right(t.code, 4))) order by t.price_paid), '[]'::jsonb)
 from public.tickets t join public.ticket_tiers tt on tt.id = t.tier_id join public.events e on e.id = t.event_id
 join public.checkout_orders o on o.order_ref = t.order_ref and o.buyer_id = t.holder_id and o.status = 'issued' and o.refund_status = 'none' and o.stripe_session is not null and upper(o.currency) = 'GBP'
 left join lateral (select value from public.platform_settings where section = 'ticketing' and status = 'published' order by version desc limit 1) s on true
 left join lateral (select * from public.resale_policy_for(p_event)) p on true
 left join public.ticket_resale_listings l on l.ticket_id = t.id and l.status = 'listed'
 where t.event_id = p_event and t.status = 'resale_listed' and e.visibility = 'public' and e.status in ('published', 'on_sale') and e.starts_at > now()
 and coalesce(e.settings->>'resale', 'true') <> 'false' and coalesce(s.value->>'resale_enabled', 'true') <> 'false'
 and t.price_paid > 0 and t.price_paid <= coalesce(t.face_value, tt.price) * coalesce(p.price_cap_pct, (s.value->>'resale_cap_pct')::numeric, 100) / 100
 and not exists (select 1 from public.resale_holds h where h.ticket_id = t.id and h.expires_at > now())
$$;

-- ── 2. Postponed / cancelled public event page ──────────────────────────────────────────────────────────────────────────────
create or replace function public.event_public_status_page(p_key text)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'description', e.description, 'event_type', e.event_type, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'venue_name', e.venue_name, 'location', e.location, 'city', e.city, 'cover_image', e.cover_image, 'tags', e.tags, 'settings', e.public_settings, 'status', e.status,
    'workspace_id', e.workspace_id, 'venue_listing_id', e.venue_listing_id, 'capacity', e.capacity, 'series_id', e.series_id, 'parent_event_id', e.parent_event_id,
    'organizer_name', w.name, 'organizer_verified', w.verification_status = 'verified')
  from public.events e left join public.workspaces w on w.id = e.workspace_id
  where (e.slug = p_key or e.id::text = p_key) and e.visibility = 'public' and e.status in ('postponed', 'cancelled')
    and not public.demo_hidden_for_viewer(e.workspace_id)
  limit 1
$$;
revoke all on function public.event_public_status_page(text) from public;
grant execute on function public.event_public_status_page(text) to anon, authenticated, service_role;

-- ── 3. Public read policies ─────────────────────────────────────────────────────────────────────────────────────────────────
drop policy if exists tiers_public_read on public.ticket_tiers;
create policy tiers_public_read on public.ticket_tiers for select to anon, authenticated
  using (event_is_public(event_id) and status in ('on_sale', 'sold_out', 'scheduled', 'paused') and not access_code_required);
drop policy if exists tiers_holder_read on public.ticket_tiers;
create policy tiers_holder_read on public.ticket_tiers for select to authenticated
  using (exists (select 1 from public.tickets t where t.tier_id = ticket_tiers.id and t.holder_id = (select auth.uid())));

-- Access-code tiers this checkout's applied codes unlock (same matching as hold_tickets). The token is the httpOnly checkout cookie.
create or replace function public.checkout_unlocked_tiers(p_event uuid, p_token text)
returns setof public.ticket_tiers language sql stable security definer set search_path to '' as $$
  select distinct tt.* from public.ticket_tiers tt
   join public.checkout_code_applications a on a.event_id = tt.event_id and a.token = p_token
   join public.discount_codes d on d.id = a.code_id and d.purpose = 'access' and public.discount_code_live(d)
   left join public.ticket_allocations x on x.id = d.allocation_id
  where tt.event_id = p_event and length(coalesce(p_token, '')) >= 16 and public.event_is_public(p_event)
    and tt.access_code_required and tt.status in ('on_sale', 'sold_out', 'scheduled', 'paused')
    and (d.tier_ids is null or tt.id = any(d.tier_ids)) and (d.allocation_id is null or (x.tier_id = tt.id and x.status = 'active'))
$$;
revoke all on function public.checkout_unlocked_tiers(uuid, text) from public;
grant execute on function public.checkout_unlocked_tiers(uuid, text) to anon, authenticated, service_role;

drop policy if exists media_public_read on public.media_assets;
create policy media_public_read on public.media_assets for select to anon, authenticated
  using (usage_scope = 'public' and status = any (array['approved', 'published'])
    and (listing_id is null or exists (select 1 from public.listings l where l.id = media_assets.listing_id and l.published and l.paused_at is null)));
drop policy if exists venue_structures_public_read on public.venue_structures;
create policy venue_structures_public_read on public.venue_structures for select to anon, authenticated
  using (status = 'published' and exists (select 1 from public.listings l where l.id = venue_structures.venue_id and l.published and l.paused_at is null));

-- ── 4. Proposal expiry in London time (otherwise identical to the live definition) ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_proposal(p_token text, p_name text, p_email text, p_version integer, p_package text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.proposals; snap jsonb; pkgs jsonb; pk jsonb; v_rate numeric; v_sub numeric; v_tax numeric; v_tot numeric;
begin
  if p_token !~ '^[0-9a-f]{36}$' or length(coalesce(p_name,'')) < 2 or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_input' using errcode='22023'; end if;
  select * into p from public.proposals where id = public.proposal_share_lookup(p_token) for update;
  if not found then raise exception 'not_found' using errcode='P0002'; end if;
  if p.status = 'accepted' or p.status = 'converted' then return 'already_accepted'; end if;
  if p.status not in ('sent','viewed') then raise exception 'not_open' using errcode='22023'; end if;
  if p.version <> p_version then raise exception 'version_changed' using errcode='22023'; end if;
  if p.valid_until is not null and p.valid_until < (now() at time zone 'Europe/London')::date then update public.proposals set status='expired' where id=p.id; return 'expired'; end if;
  select v.snapshot into snap from public.proposal_versions v where v.proposal_id = p.id and v.version = p.version;
  snap := coalesce(snap, to_jsonb(p));
  pkgs := coalesce(snap #> '{content,packages}', '[]'::jsonb);
  v_rate := coalesce(nullif(snap #>> '{content,tax_rate}', '')::numeric, 20);
  v_sub := coalesce((snap ->> 'subtotal')::numeric, p.subtotal);
  if jsonb_typeof(pkgs) = 'array' and jsonb_array_length(pkgs) > 0 then
    if p_package is null then raise exception 'package_required' using errcode='22023'; end if;
    select x into pk from jsonb_array_elements(pkgs) x where x ->> 'key' = p_package limit 1;
    if pk is null then raise exception 'invalid_package' using errcode='22023'; end if;
    v_sub := v_sub + greatest(coalesce((pk ->> 'price')::numeric, 0), 0);
    v_tax := round(v_sub * v_rate) / 100; v_tot := round(v_sub + v_tax, 2);
  else
    v_tax := coalesce((snap ->> 'tax')::numeric, p.tax); v_tot := coalesce((snap ->> 'total')::numeric, p.total);
  end if;
  update public.proposals set status='accepted', signature_status='signed', accepted_at=now(), accepted_total = v_tot,
    acceptance = jsonb_build_object('name', left(p_name,120), 'email', lower(left(p_email,200)), 'version', p.version, 'at', now(),
      'package', case when pk is null then null else jsonb_build_object('key', pk ->> 'key', 'name', pk ->> 'name', 'price', (pk ->> 'price')::numeric) end,
      'subtotal', v_sub, 'tax', v_tax, 'total', v_tot)
  where id = p.id;
  insert into public.audit_events(workspace_id, event, metadata) values (p.workspace_id, 'proposal.accepted',
    jsonb_build_object('proposal_id', p.id, 'client_id', p.client_id, 'version', p.version, 'email', lower(p_email), 'package', pk ->> 'key', 'total', v_tot));
  return 'accepted';
end; $function$;
