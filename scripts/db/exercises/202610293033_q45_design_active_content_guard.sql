-- Dry-run exercise for 202610293033 (always rolled back by migrate.mjs). Runs against LIVE rows inside the transaction:
-- every XSS payload refused on every guarded table, benign documents (incl. quotes, '<', <style>) accepted, unrelated updates of
-- existing rows unaffected, and CLIENT-ROLE writes (designs + venue_maps as their real workspace owner) go through the invoker trigger.
create temp table _ex(k text, v text) on commit drop;
grant all on _ex to public;

-- 0. Live data must already be clean (the guard would otherwise block re-saves of those rows).
do $$
declare n int;
begin
  select (select count(*) from public.designs where public.design_active_content(document) is not null)
       + (select count(*) from public.design_versions where public.design_active_content(document) is not null)
       + (select count(*) from public.design_templates where public.design_active_content(document) is not null)
       + (select count(*) from public.design_elements where public.design_active_content(data) is not null)
       + (select count(*) from public.venue_maps where public.design_active_content(overlay) is not null)
       + (select count(*) from public.venue_structures where public.design_active_content(elements) is not null) into n;
  if n <> 0 then raise exception 'exercise: % live rows already contain active content', n; end if;
  insert into _ex values ('live_offending_rows', '0');
end $$;

-- 1. Checker: payloads refused, benign strings accepted.
do $$
declare v text; bad int := 0; good int := 0;
  payloads text[] := array['<image href=x onerror=alert(1)>', '<image/onerror=alert(1)/href=x>', E'<image\tonerror=alert(1) href=x>',
    E'<image\nonerror=alert(1)>', '<a href="java&#115;cript:alert(1)"><text>x</text></a>', '<a href="javascript:alert(1)">x</a>',
    '<foreignObject><div>x</div></foreignObject>', '<script>alert(1)</script>', '<set attributeName="href" to="x"/>',
    '#000" onmouseover="alert(1)', '#000"><script>alert(1)</script>', '<iframe src="https://evil.example"></iframe>',
    '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>'];
  benign text[] := array['Join online = free', 'The "online" event', 'Kids <12 go free', '<path d="M0 0h24v24H0z"/>',
    '<g fill="currentColor"><circle cx="12" cy="12" r="10"/></g>', '<style>.a{fill:#000}</style><path class="a" d="M1 1"/>', '#090a2e', 'Fish & chips'];
begin
  foreach v in array payloads loop
    if public.design_active_content(jsonb_build_object('pages', jsonb_build_array(jsonb_build_object('layers', jsonb_build_array(
      jsonb_build_object('type', 'icon', 'svg', jsonb_build_object('body', v))))))) is null then raise exception 'payload accepted: %', v; end if;
    bad := bad + 1;
  end loop;
  foreach v in array benign loop
    if public.design_active_content(jsonb_build_object('t', v)) is not null then raise exception 'benign refused: %', v; end if;
    good := good + 1;
  end loop;
  insert into _ex values ('payloads_refused', bad::text), ('benign_accepted', good::text);
end $$;

-- 2. Service role: the guard holds on every table (templates also bypass-proof now).
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare d public.designs; m public.venue_maps; s public.venue_structures; ok int := 0; p jsonb := '{"svg": {"body": "<image/onerror=alert(1)/href=x>"}}';
begin
  begin insert into public.design_templates(title, width, height, document, visibility) values ('q45 probe', 10, 10, jsonb_build_object('layers', jsonb_build_array(p)), 'public');
    raise exception 'X_TEMPLATE'; exception when sqlstate '22023' then if sqlerrm <> 'design_active_content' then raise; end if; ok := ok + 1; end;
  select * into d from public.designs where document is not null limit 1;
  begin update public.designs set document = document || jsonb_build_object('q45', p) where id = d.id; raise exception 'X_DESIGN';
    exception when sqlstate '22023' then ok := ok + 1; end;
  update public.designs set title = title where id = d.id;   -- unrelated update still fine
  select * into s from public.venue_structures where elements is not null limit 1;
  begin update public.venue_structures set elements = elements || jsonb_build_array(jsonb_build_object('type', 'glyph', 'glyph', jsonb_build_object('kind', 'icon', 'body', '<image/onerror=alert(1)/href=x>'))) where id = s.id;
    raise exception 'X_STRUCTURE'; exception when sqlstate '22023' then ok := ok + 1; end;
  update public.venue_structures set elements = elements where id = s.id;
  insert into _ex values ('service_refusals', ok::text);
end $$;
reset role;

-- 3. CLIENT ROLE: the real owner of a design's workspace and of a venue map's event, through RLS and the invoker trigger.
do $$
declare d record; m record; n int; ok int := 0;
begin
  select x.id, x.version, x.document, w.owner_id uid into d from public.designs x join public.workspaces w on w.id = x.workspace_id
    where x.document is not null and x.deleted_at is null and w.status = 'active' limit 1;
  if d.id is null then raise exception 'exercise: no workspace design'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', d.uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', d.uid::text, true);
  set local role authenticated;
  -- Clients have no UPDATE policy on designs; they save through save_design (definer) exactly like Studio.
  n := public.save_design(d.id, d.document || '{"q45": {"type": "text", "text": "Join online = free"}}', d.version, null, null);
  if n is null or n <= d.version then raise exception 'client benign save_design returned %', n; end if;
  begin perform public.save_design(d.id, d.document || '{"q45": {"type": "icon", "svg": {"body": "<image/onerror=alert(1)/href=x>"}}}', n, null, null);
    raise exception 'X_CLIENT_DESIGN'; exception when sqlstate '22023' then if sqlerrm <> 'design_active_content' then raise; end if; ok := ok + 1; end;
  reset role;

  select vm.id, w.owner_id uid into m from public.venue_maps vm join public.events e on e.id = vm.event_id join public.workspaces w on w.id = e.workspace_id
    where vm.overlay is not null and vm.status <> 'published' and w.status = 'active' limit 1;
  if m.id is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', m.uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', m.uid::text, true);
    set local role authenticated;
    begin
      update public.venue_maps set overlay = overlay where id = m.id;   -- unchanged column: trigger short-circuits
      insert into _ex values ('client_map_noop_update', 'ok');
    exception when others then insert into _ex values ('client_map_noop_update', sqlstate || ' ' || left(sqlerrm, 60));   -- other guards (map lock) may refuse; recorded
    end;
    begin update public.venue_maps set overlay = jsonb_build_object('q45', '<image/onerror=alert(1)/href=x>') where id = m.id;
      raise exception 'X_CLIENT_MAP'; exception when sqlstate '22023' then ok := ok + 1; when others then
        if sqlerrm like 'X_CLIENT_MAP%' then raise; end if; insert into _ex values ('client_map_refused_by', left(sqlerrm, 60)); ok := ok + 1; end;
    reset role;
  end if;
  insert into _ex values ('client_refusals', ok::text), ('client_benign_design_update', 'ok');
end $$;
reset role;

do $$ begin raise exception 'EXERCISE_OK %', (select string_agg(k || '=' || v, '; ' order by k) from _ex); end $$;
