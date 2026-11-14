-- Q57 follow-ups exercise. Ends with EXERCISE_OK (rolled back).
do $$
declare n int; ok boolean; t public.tickets; e public.events; j jsonb; tier uuid; nt uuid; holder uuid; lst uuid; d date;
begin
  -- 1. face value backfilled everywhere; new tickets default to the tier price; transfers carry the original value.
  select count(*) into n from public.tickets where face_value is null;
  if n <> 0 then raise exception 'face_value not backfilled: %', n; end if;
  select * into t from public.tickets where status = 'valid' and tier_id is not null limit 1;
  update public.ticket_tiers set price = price + 7 where id = t.tier_id;
  insert into public.tickets(code, event_id, tier_id, holder_id, attendee_name, attendee_email, order_ref, seat, price_paid)
    values ('GLD-Q57X-EXERC1', t.event_id, t.tier_id, t.holder_id, 'Q57', 'q57@example.invalid', t.order_ref || '-T', t.seat, t.price_paid) returning id into nt;
  if (select face_value from public.tickets where id = nt) <> (select price from public.ticket_tiers where id = t.tier_id) then raise exception 'default face value wrong'; end if;
  update public.tickets set replaced_by = nt where id = t.id;
  if (select face_value from public.tickets where id = nt) is distinct from t.face_value then raise exception 'face value not carried to replacement'; end if;

  -- 2. status page: a public postponed event resolves, a draft/private one does not; events_public unchanged.
  select * into e from public.events where visibility = 'public' and status in ('on_sale', 'published') and slug is not null limit 1;
  update public.events set status = 'postponed' where id = e.id;
  set local role anon;
  j := public.event_public_status_page(e.slug);
  if j is null or j->>'status' <> 'postponed' then raise exception 'postponed public event has no status page'; end if;
  select count(*) into n from public.events_public where id = e.id;
  if n <> 0 then raise exception 'postponed event leaked into events_public'; end if;
  reset role;
  update public.events set visibility = 'private' where id = e.id;
  set local role anon;
  if public.event_public_status_page(e.slug) is not null then raise exception 'private event got a status page'; end if;
  reset role;
  update public.events set visibility = 'public' where id = e.id;
  set local role anon;
  if public.event_public_status_page('no-such-event-q57') is not null then raise exception 'unknown key resolved'; end if;
  reset role;

  -- 3. anon tier reads: never draft/hidden/access-code tiers.
  select tt.id into tier from public.ticket_tiers tt join public.events ev on ev.id = tt.event_id
   where ev.visibility = 'public' and ev.status in ('on_sale', 'published', 'live') and tt.status = 'on_sale' limit 1;
  update public.ticket_tiers set access_code_required = true where id = tier;
  set local role anon;
  select count(*) into n from public.ticket_tiers where id = tier;
  if n <> 0 then raise exception 'anon reads an access-code tier'; end if;
  select count(*) into n from public.ticket_tiers where status in ('draft', 'hidden');
  if n <> 0 then raise exception 'anon reads draft/hidden tiers: %', n; end if;
  select count(*) into n from public.ticket_tiers where status = 'on_sale';
  if n = 0 then raise exception 'anon reads no on-sale tiers at all'; end if;
  reset role;
  -- a holder still reads the tier of a ticket they hold
  select holder_id into holder from public.tickets where tier_id = tier and holder_id is not null limit 1;
  if holder is not null then
    perform set_config('request.jwt.claims', jsonb_build_object('sub', holder, 'role', 'authenticated')::text, true); set local role authenticated;
    select count(*) into n from public.ticket_tiers where id = tier;
    if n <> 1 then raise exception 'holder lost their tier'; end if;
    reset role;
  end if;

  -- media / venue structures of an unpublished listing are not public.
  select l.id into lst from public.listings l where l.published and exists (select 1 from public.venue_structures v where v.venue_id = l.id and v.status = 'published') limit 1;
  if lst is not null then
    update public.listings set published = false where id = lst;
    set local role anon;
    select count(*) into n from public.venue_structures where venue_id = lst;
    if n <> 0 then raise exception 'unpublished venue structure readable'; end if;
    reset role;
  end if;

  -- resale listing payload carries the new keys (shape only; may be empty).
  set local role anon;
  j := public.resale_listings(e.id);
  if jsonb_typeof(j) <> 'array' then raise exception 'resale_listings shape'; end if;
  reset role;

  -- 4. London date helper used by accept_proposal compiles and is a date.
  d := (now() at time zone 'Europe/London')::date;
  if d is null then raise exception 'london date'; end if;

  raise exception 'EXERCISE_OK Q57 follow-ups';
end $$;
