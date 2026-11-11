-- Exercise for 202610295030 (runs inside the dry-run transaction, after the migration; always rolled back).
do $ex$
declare leaked int; pub int; pub_event uuid; priv_event uuid;
begin
  select m.event_id into pub_event from public.merch_items m where m.status = 'on_sale' and public.event_is_public(m.event_id) limit 1;
  select m.event_id into priv_event from public.merch_items m where m.status = 'on_sale' and not public.event_is_public(m.event_id) limit 1;

  -- anon: no on_sale item of a non-public event is visible; items of public events still are.
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select count(*) into leaked from public.merch_items m where m.event_id not in (select id from public.events_public);
  select count(*) into pub from public.merch_items m where m.event_id = pub_event;
  reset role;
  if leaked <> 0 then raise exception 'anon still sees % merch row(s) of non-public events', leaked; end if;
  if pub_event is not null and pub = 0 then raise exception 'anon lost merch of public event %', pub_event; end if;

  -- outsider (authenticated, member of nothing): same rule.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', gen_random_uuid())::text, true);
  set local role authenticated;
  select count(*) into leaked from public.merch_items m where m.event_id not in (select id from public.events_public);
  reset role;
  if leaked <> 0 then raise exception 'outsider still sees % merch row(s) of non-public events', leaked; end if;

  raise exception 'EXERCISE_OK merch_items_public: anon/outsider leak 0; public event % visible (% rows); private sample event %', pub_event, pub, priv_event;
end $ex$;
