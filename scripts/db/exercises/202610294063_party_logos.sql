-- Dry-run exercise for 202610294063 (always rolled back by migrate.mjs).
--   member (manager of Neon's workspace) sets a valid logo on a confirmed sponsor → anon sees it in public_event_extras
--   prospect / negotiating parties with a logo never appear; a draft event's confirmed sponsor with a logo never appears
--   bad URLs (http, javascript:, data:, another workspace's folder, non-image, SVG) are refused; the CHECK refuses direct writes too
--   anon cannot execute party_set_logo; an outsider is refused (not_authorized)
create temp table _ex(k text, v text) on commit drop;
grant all on _ex to anon, authenticated;

do $$
declare neon uuid := '392fdf17-4e5c-4473-987c-251dc0a97228'; ws uuid; mgr uuid; outsider uuid; sp uuid; pr uuid; drf uuid; dsp uuid; good text; j jsonb; msg text; bad text; n int;
begin
  select workspace_id into ws from public.events where id = neon;
  select m.user_id into mgr from public.workspace_members m where m.workspace_id = ws and m.role in ('owner','manager') and m.status = 'active' order by (m.role = 'owner') desc limit 1;
  if mgr is null then select owner_id into mgr from public.workspaces where id = ws; end if;
  select u.id into outsider from auth.users u where not exists (select 1 from public.workspace_members m where m.user_id = u.id and m.workspace_id = ws) and u.id <> mgr order by u.created_at limit 1;
  select id into sp from public.event_parties where event_id = neon and kind = 'sponsor' and status = 'confirmed' order by name limit 1;
  insert into public.event_parties(event_id, workspace_id, kind, name, status) values (neon, ws, 'sponsor', 'EX4063 prospect', 'prospect') returning id into pr;
  select id into drf from public.events where workspace_id = ws and status = 'draft' limit 1;
  if drf is null then select id into drf from public.events where workspace_id is not null and status = 'draft' limit 1; end if;
  insert into public.event_parties(event_id, workspace_id, kind, name, status) values (drf, (select workspace_id from public.events where id = drf), 'sponsor', 'EX4063 draft sponsor', 'confirmed') returning id into dsp;
  good := 'https://example.supabase.co/storage/v1/object/public/event-media/' || ws || '/0f0e0d0c-0b0a-4908-8706-050403020100.png';

  -- member sets logos
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.party_set_logo(sp, good);
  perform public.party_set_logo(pr, good);
  foreach bad in array array['http://example.supabase.co/storage/v1/object/public/event-media/' || ws || '/a.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA',
      'https://example.supabase.co/storage/v1/object/public/event-media/' || gen_random_uuid() || '/a.png', 'https://example.supabase.co/storage/v1/object/public/event-media/' || ws || '/a.svg',
      'https://evil.example/x.png'] loop
    begin perform public.party_set_logo(sp, bad); msg := 'accepted'; exception when others then msg := sqlerrm; end;
    if msg = 'accepted' then reset role; raise exception 'bad logo url accepted: %', bad; end if;
  end loop;
  reset role;
  insert into _ex values ('member', 'set; 6 bad urls refused');
  -- the draft event's party gets a logo via the owner role (bypassing the command) — CHECK still applies
  update public.event_parties set logo_url = 'https://x.supabase.co/storage/v1/object/public/event-media/' || (select workspace_id from public.events where id = drf) || '/b.webp' where id = dsp;
  begin update public.event_parties set logo_url = 'javascript:alert(1)' where id = dsp; msg := 'accepted'; exception when check_violation then msg := 'refused'; end;
  if msg <> 'refused' then raise exception 'CHECK accepted javascript:'; end if;
  insert into _ex values ('check', 'javascript: refused');

  -- anon view
  set local role anon;
  j := public.public_event_extras(neon);
  begin perform public.party_set_logo(sp, null); msg := 'ran'; exception when insufficient_privilege then msg := 'refused'; end;
  if public.public_event_extras(drf) is not null then reset role; raise exception 'draft event returned extras'; end if;
  reset role;
  if msg <> 'refused' then raise exception 'anon could run party_set_logo'; end if;
  select count(*) into n from jsonb_array_elements(j->'partners') x where x->>'logo' = good and x->>'name' = (select name from public.event_parties where id = sp);
  if n <> 1 then raise exception 'confirmed sponsor logo missing: %', j->'partners'; end if;
  select count(*) into n from jsonb_array_elements(j->'partners') x where x->>'name' like 'EX4063%';
  if n <> 0 then raise exception 'prospect / draft party leaked'; end if;
  insert into _ex values ('anon', 'confirmed logo shown; prospect + draft hidden; command refused');

  -- outsider
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.party_set_logo(sp, null); msg := 'ran'; exception when others then msg := sqlerrm; end;
  reset role;
  if msg !~ 'not_authorized' then raise exception 'outsider: %', msg; end if;
  insert into _ex values ('outsider', 'not_authorized');
end $$;

do $$ begin raise exception 'EXERCISE_OK %', (select string_agg(k || '=' || v, '; ' order by k) from _ex); end $$;
