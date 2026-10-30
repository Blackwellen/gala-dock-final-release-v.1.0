-- Dry-run exercise for 202610294060 (always rolled back by migrate.mjs).
--   anon on Neon Nights (public, on sale)  → partners (confirmed only), approved accessibility, no private keys anywhere in the payload
--   anon on a draft / private event         → null
--   outsider (authenticated, not a member)  → same public payload as anon; null for the draft / private event
--   a sponsor moved to 'negotiating'        → disappears; a cancelled-only event payload never carries fee / contact values
create temp table _ex(k text, v text) on commit drop;
grant all on _ex to anon, authenticated;

do $$
declare neon uuid := '392fdf17-4e5c-4473-987c-251dc0a97228'; priv uuid; drf uuid; outsider uuid; j jsonb; t text; n int; party uuid;
begin
  -- Fixtures: a private and a draft event borrowed from existing rows inside this rolled-back transaction.
  -- (status changes go through the event state machine, so pick rows already in those states)
  select id into priv from public.events where id <> neon and workspace_id is not null and visibility <> 'public' and status in ('published','on_sale','live') order by created_at limit 1;
  if priv is null then
    select id into priv from public.events where id <> neon and workspace_id is not null and status in ('published','on_sale','live') order by created_at limit 1;
    update public.events set visibility = 'private' where id = priv;
  end if;
  select id into drf from public.events where id not in (neon, priv) and workspace_id is not null and status = 'draft' order by created_at limit 1;
  if priv is null or drf is null then raise exception 'exercise: need a private and a draft event'; end if;
  -- Give both a confirmed sponsor + approved accessibility so "nothing" proves the event rule, not missing data.
  insert into public.event_parties(event_id, workspace_id, kind, name, status, fee, contact_email, contact_name, notes)
    select x, (select workspace_id from public.events where id = x), 'sponsor', 'EX4060 hidden sponsor', 'confirmed', 999.99, 'ex4060-secret@example.com', 'EX4060 Contact', 'EX4060 private note'
    from unnest(array[priv, drf]) x;
  -- A Neon sponsor with secrets we must never see.
  select p.id into party from public.event_parties p where p.event_id = neon and p.kind = 'sponsor' and p.status = 'confirmed' order by p.name limit 1;
  if party is null then raise exception 'exercise: Neon needs a confirmed sponsor'; end if;
  update public.event_parties set contact_email = 'ex4060-secret@example.com', contact_phone = '+44 7700 940600', notes = 'EX4060 private note', fee = 4060.06 where id = party;

  select id into outsider from auth.users u where not exists (select 1 from public.workspace_members m where m.user_id = u.id and m.workspace_id in (select workspace_id from public.events where id in (neon, priv, drf))) order by created_at limit 1;
  if outsider is null then raise exception 'exercise: need an outsider user'; end if;

  -- anon
  set local role anon;
  j := public.public_event_extras(neon);
  if j is null then raise exception 'anon: Neon returned null'; end if;
  if jsonb_array_length(j->'partners') = 0 then raise exception 'anon: no partners'; end if;
  if (j->'accessibility'->>'summary') is null then raise exception 'anon: approved accessibility missing'; end if;
  t := j::text;
  if t ~* 'ex4060-secret|7700 940600|EX4060 private|4060\.06|contact|fee|price|benefit|currency|rider|contract|notes|email|phone|portal' then raise exception 'anon: private value or key leaked: %', left(t, 400); end if;
  if public.public_event_extras(priv) is not null then raise exception 'anon: private event returned data'; end if;
  if public.public_event_extras(drf) is not null then raise exception 'anon: draft event returned data'; end if;
  if public.public_event_extras(gen_random_uuid()) is not null then raise exception 'anon: unknown id returned data'; end if;
  reset role;
  insert into _ex values ('anon_public', 'partners=' || jsonb_array_length(j->'partners') || ',a11y=approved,no_private'), ('anon_private_draft', 'null');

  -- outsider (authenticated, not a member of any of these workspaces)
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.public_event_extras(neon)::text is distinct from j::text then raise exception 'outsider: payload differs from anon'; end if;
  if public.public_event_extras(priv) is not null or public.public_event_extras(drf) is not null then raise exception 'outsider: private/draft returned data'; end if;
  reset role;
  insert into _ex values ('outsider', 'same as anon; private/draft null');

  -- Prospect / negotiating parties are not public (Neon already has a negotiating exhibitor; add a prospect sponsor too).
  insert into public.event_parties(event_id, workspace_id, kind, name, status) values (neon, (select workspace_id from public.events where id = neon), 'sponsor', 'EX4060 prospect', 'prospect');
  set local role anon;
  j := public.public_event_extras(neon);
  reset role;
  select count(*) into n from jsonb_array_elements(j->'partners') x
    where x->>'name' in (select name from public.event_parties where event_id = neon and status not in ('confirmed','completed'));
  if n <> 0 then raise exception 'prospect/negotiating party listed'; end if;
  insert into _ex values ('prospect_negotiating', 'hidden');

  -- Unapproved accessibility summary is not public.
  update public.event_accessibility set summary_status = 'draft' where event_id = neon;
  set local role anon;
  if public.public_event_extras(neon)->'accessibility' <> 'null'::jsonb then raise exception 'unapproved accessibility shown'; end if;
  reset role;
  insert into _ex values ('a11y_unapproved', 'hidden');
end $$;

do $$ begin raise exception 'EXERCISE_OK %', (select string_agg(k || '=' || v, '; ' order by k) from _ex); end $$;
