-- Q23 remainder (lane A, 2026-10-29): Media Studio (146), Event Posters (147), Media Library (148), Brand System (149),
-- campaign assets (139.5), promo landing pages, share cards / link previews. Additive and backward compatible.
--   * media_assets gain rights/licence metadata, alt text, usage scope and subject; anything used publicly (scope public,
--     public gallery, landing page, campaign asset) must pass media_public_problems(): alt text, a usable licence, approved
--     status and a clean Q04 file decision (file_access_decision = 'ok'). Public-scoped assets become readable by anyone.
--   * media_galleries / media_gallery_items (publish checks every item), media_usages (where an asset is used),
--     previous_media(event) for past-event media of the same organiser.
--   * posters: designs.poster_kind, poster_presets, poster_data(event, kind) (QR posters only for listed public events and
--     only to the canonical public URL — never a token; sold-out posters only when sold out; schedule posters in the event
--     timezone with overlaps flagged).
--   * design_exports: export requested (permission checked) → client renders + uploads → completed (permission checked
--     again) → download re-checks access and expiry (7 days); sweep expires artifacts.
--   * brand kits: versioned with history, validated colours/fonts/logos, brand rules, brand_check_design(design).
--   * templates published as link/public are scrubbed of emails, phone numbers and token-like strings; active content
--     (script, javascript:, event handlers) is refused. Community templates stay post-moderated (reports → hidden).
--   * promo_landing_pages (public when published; only listed events; sponsored slots labelled) and event_share_card()
--     (listed public events only; image without query strings; no tokens).

-- ═══ 1. Media library metadata ═══
alter table public.media_assets add column if not exists alt_text text check (alt_text is null or length(alt_text) <= 500);
alter table public.media_assets add column if not exists licence text not null default 'owned' check (licence in ('owned','licensed','cc_by','cc_by_sa','cc0','stock','unknown'));
alter table public.media_assets add column if not exists licence_holder text check (licence_holder is null or length(licence_holder) <= 200);
alter table public.media_assets add column if not exists licence_expires_at timestamptz;
alter table public.media_assets add column if not exists credit text check (credit is null or length(credit) <= 200);
alter table public.media_assets add column if not exists usage_scope text not null default 'event' check (usage_scope in ('private','event','public'));
alter table public.media_assets add column if not exists subject text not null default 'event' check (subject in ('event','venue','provider','sponsor','brand','previous'));
alter table public.media_assets add column if not exists listing_id uuid references public.listings(id) on delete set null;
alter table public.media_assets add column if not exists source_event_id uuid references public.events(id) on delete set null;
alter table public.media_assets add column if not exists updated_at timestamptz not null default now();
create index if not exists media_assets_public on public.media_assets(workspace_id, subject) where usage_scope = 'public';

create or replace function public.media_public_problems(a public.media_assets) returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare p text[] := '{}'; o record; dec text;
begin
  if nullif(btrim(coalesce(a.alt_text, '')), '') is null then p := p || 'alt_text_required'::text; end if;
  if a.licence = 'unknown' then p := p || 'licence_unknown'::text; end if;
  if a.licence_expires_at is not null and a.licence_expires_at < now() then p := p || 'licence_expired'::text; end if;
  if a.licence in ('licensed','stock','cc_by','cc_by_sa') and nullif(btrim(coalesce(a.credit, a.licence_holder, '')), '') is null then p := p || 'credit_required'::text; end if;
  if a.status not in ('approved','published') then p := p || 'not_approved'::text; end if;
  if a.storage_object_id is not null then
    select bucket_id, name into o from storage.objects where id = a.storage_object_id;
    if o.name is null then p := p || 'file_missing'::text;
    else
      dec := public.file_access_decision(o.bucket_id, o.name);
      if dec <> 'ok' then p := p || ('file_' || dec)::text; end if;
    end if;
  elsif coalesce(a.url, '') = '' then p := p || 'file_missing'::text;
  elsif a.url ~ '/storage/v1/object/public/(event-media|listing-media)/[^?#]+$' then
    -- Our own public bucket URL: resolve the object and apply the Q04 decision.
    dec := public.file_access_decision(substring(a.url from '/storage/v1/object/public/(event-media|listing-media)/'), substring(a.url from '/storage/v1/object/public/(?:event-media|listing-media)/([^?#]+)$'));
    if dec <> 'ok' then p := p || ('file_' || dec)::text; end if;
  else
    p := p || 'file_unverified'::text;   -- external or unscanned file: never used publicly
  end if;
  return p;
end $$;

create or replace function public.media_assets_public_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p text[];
begin
  new.updated_at := now();
  if new.usage_scope = 'public' then
    p := public.media_public_problems(new);
    if array_length(p, 1) > 0 then raise exception 'media_not_publishable: %', array_to_string(p, ',') using errcode = '22023'; end if;
  end if;
  return new;
end $$;
drop trigger if exists media_public_guard on public.media_assets;  -- sorts after media_file_source_guard (storage object resolved first)
create trigger media_public_guard before insert or update on public.media_assets for each row execute function public.media_assets_public_guard();

drop policy if exists media_public_read on public.media_assets;
create policy media_public_read on public.media_assets for select to anon, authenticated using (usage_scope = 'public' and status in ('approved','published'));
grant select on table public.media_assets to anon;

-- Members set publication metadata through one command (validation + audit).
create or replace function public.media_asset_publish(p_asset uuid, p_meta jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare a public.media_assets; ws uuid; p text[];
begin
  select * into a from public.media_assets where id = p_asset for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  ws := coalesce(a.workspace_id, (select workspace_id from public.events where id = a.event_id));
  if not ((ws is not null and public.has_permission(ws, 'promotion.manage')) or (ws is null and a.event_id is not null and public.can_access_event(a.event_id))) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.media_assets set alt_text = coalesce(p_meta->>'alt_text', alt_text), licence = coalesce(p_meta->>'licence', licence),
    licence_holder = coalesce(p_meta->>'licence_holder', licence_holder), licence_expires_at = coalesce((p_meta->>'licence_expires_at')::timestamptz, licence_expires_at),
    credit = coalesce(p_meta->>'credit', credit), subject = coalesce(p_meta->>'subject', subject), status = coalesce(p_meta->>'status', status)
   where id = a.id returning * into a;
  p := public.media_public_problems(a);
  if coalesce((p_meta->>'public')::boolean, false) then
    if array_length(p, 1) > 0 then return jsonb_build_object('ok', false, 'problems', to_jsonb(p)); end if;
    update public.media_assets set usage_scope = 'public' where id = a.id;
  elsif p_meta ? 'public' then
    update public.media_assets set usage_scope = 'event' where id = a.id and usage_scope = 'public';
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), ws, 'media.asset_published', jsonb_build_object('asset_id', a.id, 'public', coalesce((p_meta->>'public')::boolean, false)));
  return jsonb_build_object('ok', true, 'problems', to_jsonb(p));
end $$;

-- ═══ 2. Galleries, usage, previous media ═══
create table if not exists public.media_galleries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  title text not null check (length(btrim(title)) between 2 and 120),
  visibility text not null default 'private' check (visibility in ('private','public')),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  version integer not null default 1, created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.media_gallery_items (
  gallery_id uuid not null references public.media_galleries(id) on delete cascade,
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  sort integer not null default 0, caption text check (caption is null or length(caption) <= 300),
  primary key (gallery_id, asset_id)
);
create table if not exists public.media_usages (
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  target_kind text not null check (target_kind in ('event','listing','campaign','design','landing','gallery','sponsor')),
  target_id uuid not null,
  public_use boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (asset_id, target_kind, target_id)
);
alter table public.media_galleries enable row level security;
alter table public.media_gallery_items enable row level security;
alter table public.media_usages enable row level security;
revoke all on table public.media_galleries, public.media_gallery_items, public.media_usages from public, anon, authenticated;
grant select on table public.media_galleries, public.media_gallery_items to anon, authenticated;
grant select on table public.media_usages to authenticated;
grant all on table public.media_galleries, public.media_gallery_items, public.media_usages to service_role;
drop policy if exists media_galleries_public on public.media_galleries;
create policy media_galleries_public on public.media_galleries for select to anon, authenticated using (visibility = 'public' and status = 'published'
  and (event_id is null or exists (select 1 from public.event_distribution d where d.event_id = media_galleries.event_id and d.status = 'listed')));
drop policy if exists media_galleries_members on public.media_galleries;
create policy media_galleries_members on public.media_galleries for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists media_gallery_items_read on public.media_gallery_items;
create policy media_gallery_items_read on public.media_gallery_items for select to anon, authenticated using (exists (select 1 from public.media_galleries g where g.id = gallery_id));
drop policy if exists media_usages_members on public.media_usages;
create policy media_usages_members on public.media_usages for select to authenticated using (exists (select 1 from public.media_assets a where a.id = asset_id));

create or replace function public.save_media_gallery(p_workspace uuid, p_gallery uuid, p_title text, p_event uuid, p_listing uuid, p_items jsonb, p_expected_version integer default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare g public.media_galleries; x jsonb;
begin
  if not public.has_permission(p_workspace, 'promotion.manage') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_event is not null and not exists (select 1 from public.events e where e.id = p_event and e.workspace_id = p_workspace) then raise exception 'event_not_in_workspace' using errcode = '22023'; end if;
  if p_listing is not null and not exists (select 1 from public.listings l where l.id = p_listing and l.workspace_id = p_workspace) then raise exception 'listing_not_in_workspace' using errcode = '22023'; end if;
  if p_gallery is null then
    insert into public.media_galleries(workspace_id, event_id, listing_id, title, created_by) values (p_workspace, p_event, p_listing, btrim(p_title), (select auth.uid())) returning * into g;
  else
    update public.media_galleries set title = coalesce(btrim(p_title), title), version = version + 1, updated_at = now()
     where id = p_gallery and workspace_id = p_workspace and (p_expected_version is null or version = p_expected_version) returning * into g;
    if g.id is null then
      if exists (select 1 from public.media_galleries where id = p_gallery and workspace_id = p_workspace) then return jsonb_build_object('ok', false, 'conflict', true); end if;
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;
  if p_items is not null then
    delete from public.media_gallery_items where gallery_id = g.id;
    for x in select * from jsonb_array_elements(p_items) loop
      if not exists (select 1 from public.media_assets a where a.id = (x->>'asset_id')::uuid and (a.workspace_id = p_workspace or a.event_id in (select id from public.events where workspace_id = p_workspace))) then
        raise exception 'asset_not_in_workspace' using errcode = '22023';
      end if;
      insert into public.media_gallery_items(gallery_id, asset_id, sort, caption) values (g.id, (x->>'asset_id')::uuid, coalesce((x->>'sort')::int, 0), x->>'caption');
      insert into public.media_usages(asset_id, target_kind, target_id) values ((x->>'asset_id')::uuid, 'gallery', g.id) on conflict do nothing;
    end loop;
    if g.visibility = 'public' and g.status = 'published' then
      if exists (select 1 from public.media_gallery_items i join public.media_assets a on a.id = i.asset_id where i.gallery_id = g.id and a.usage_scope <> 'public') then
        raise exception 'gallery_item_not_public' using errcode = '22023';
      end if;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'id', g.id, 'version', g.version);
end $$;

create or replace function public.publish_media_gallery(p_gallery uuid, p_public boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare g public.media_galleries; bad jsonb;
begin
  select * into g from public.media_galleries where id = p_gallery for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission(g.workspace_id, 'promotion.manage') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_public then
    select coalesce(jsonb_agg(jsonb_build_object('asset_id', a.id, 'problems', to_jsonb(public.media_public_problems(a)))), '[]') into bad
      from public.media_gallery_items i join public.media_assets a on a.id = i.asset_id where i.gallery_id = g.id and array_length(public.media_public_problems(a), 1) > 0;
    if jsonb_array_length(bad) > 0 then return jsonb_build_object('ok', false, 'error', 'items_not_publishable', 'items', bad); end if;
    if not exists (select 1 from public.media_gallery_items where gallery_id = g.id) then return jsonb_build_object('ok', false, 'error', 'gallery_empty'); end if;
    update public.media_assets a set usage_scope = 'public' from public.media_gallery_items i where i.gallery_id = g.id and i.asset_id = a.id and a.usage_scope <> 'public';
    update public.media_usages u set public_use = true from public.media_gallery_items i where i.gallery_id = g.id and u.asset_id = i.asset_id and u.target_kind = 'gallery' and u.target_id = g.id;
    update public.media_galleries set visibility = 'public', status = 'published', version = version + 1, updated_at = now() where id = g.id;
  else
    update public.media_galleries set visibility = 'private', status = 'draft', version = version + 1, updated_at = now() where id = g.id;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), g.workspace_id, 'media.gallery_published', jsonb_build_object('gallery_id', g.id, 'public', p_public));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.media_asset_usage(p_asset uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('target_kind', u.target_kind, 'target_id', u.target_id, 'public', u.public_use, 'since', u.created_at) order by u.created_at), '[]'::jsonb)
    from public.media_usages u where u.asset_id = p_asset
$$;

-- Public media from earlier events of the same organiser (most recent first) — "previous media" on listings/event pages.
create or replace function public.previous_media(p_event uuid, p_limit integer default 24) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'url', a.url, 'alt_text', a.alt_text, 'credit', a.credit, 'kind', a.kind, 'event_id', a.event_id) order by a.created_at desc), '[]'::jsonb)
    from (select a.* from public.media_assets a join public.events me on me.id = p_event
           where a.usage_scope = 'public' and a.status in ('approved','published') and a.workspace_id = me.workspace_id
             and (a.subject = 'previous' or (a.event_id is not null and a.event_id <> me.id))
           order by a.created_at desc limit least(greatest(coalesce(p_limit, 24), 1), 100)) a
$$;

-- ═══ 3. Posters ═══
alter table public.designs add column if not exists poster_kind text check (poster_kind is null or poster_kind in ('print','social','story','qr','launch','sold_out','schedule'));
create table if not exists public.poster_presets (
  key text primary key, poster_kind text not null, label text not null, width integer not null, height integer not null,
  unit text not null default 'px' check (unit in ('px','mm')), dpi integer, bleed_mm numeric not null default 0, sort integer not null default 0
);
insert into public.poster_presets(key, poster_kind, label, width, height, unit, dpi, bleed_mm, sort) values
  ('a3_print', 'print', 'A3 print poster', 297, 420, 'mm', 300, 3, 1), ('a4_print', 'print', 'A4 flyer', 210, 297, 'mm', 300, 3, 2),
  ('a2_print', 'print', 'A2 poster', 420, 594, 'mm', 300, 3, 3), ('social_square', 'social', 'Social post (square)', 1080, 1080, 'px', null, 0, 4),
  ('social_portrait', 'social', 'Social post (portrait)', 1080, 1350, 'px', null, 0, 5), ('story', 'story', 'Story / reel cover', 1080, 1920, 'px', null, 0, 6),
  ('qr_a4', 'qr', 'QR poster (A4)', 210, 297, 'mm', 300, 3, 7), ('launch_square', 'launch', 'Launch announcement', 1080, 1080, 'px', null, 0, 8),
  ('sold_out_square', 'sold_out', 'Sold-out announcement', 1080, 1080, 'px', null, 0, 9), ('schedule_a3', 'schedule', 'Schedule / timetable (A3)', 297, 420, 'mm', 300, 3, 10),
  ('schedule_story', 'schedule', 'Schedule story', 1080, 1920, 'px', null, 0, 11)
on conflict (key) do update set label = excluded.label, width = excluded.width, height = excluded.height, unit = excluded.unit, dpi = excluded.dpi, bleed_mm = excluded.bleed_mm;
alter table public.poster_presets enable row level security;
revoke all on table public.poster_presets from public, anon, authenticated;
grant select on table public.poster_presets to authenticated;
grant all on table public.poster_presets to service_role;
drop policy if exists poster_presets_read on public.poster_presets;
create policy poster_presets_read on public.poster_presets for select to authenticated using (true);

create or replace function public.poster_data(p_event uuid, p_kind text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.events; d public.event_distribution; base jsonb; tz text; live int; sold_out boolean; next_sale timestamptz; prog jsonb; ovl jsonb;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into d from public.event_distribution where event_id = p_event;
  tz := coalesce(e.timezone, 'Europe/London');
  base := jsonb_build_object('event_id', e.id, 'name', e.name, 'venue', e.venue_name, 'city', e.city, 'timezone', tz,
    'local_start', to_char(e.starts_at at time zone tz, 'Dy DD Mon YYYY HH24:MI'), 'local_end', to_char(e.ends_at at time zone tz, 'Dy DD Mon YYYY HH24:MI'),
    'public', coalesce(d.status, 'unlisted') = 'listed', 'kind', p_kind);
  if p_kind in ('qr','launch','sold_out','social','story','print') and coalesce(d.status, 'unlisted') <> 'listed' and p_kind = 'qr' then
    return base || jsonb_build_object('ok', false, 'error', 'private_event_no_public_qr');
  end if;
  case p_kind
    when 'qr' then
      return base || jsonb_build_object('ok', true, 'qr_target', '/events/' || coalesce(e.slug, e.id::text), 'qr_note', 'Canonical public URL only; no tokens or tracking secrets.');
    when 'launch' then
      select min(sale_start) into next_sale from public.ticket_tiers where event_id = e.id and status not in ('draft','hidden') and sale_start > now();
      if next_sale is null and not exists (select 1 from public.ticket_tiers where event_id = e.id and status = 'on_sale') then
        return base || jsonb_build_object('ok', false, 'error', 'no_on_sale_date');
      end if;
      return base || jsonb_build_object('ok', true, 'on_sale_at', next_sale, 'on_sale_local', to_char(next_sale at time zone tz, 'Dy DD Mon HH24:MI'), 'on_sale_now', next_sale is null);
    when 'sold_out' then
      select count(*) filter (where status not in ('draft','hidden') and not (status = 'sold_out' or sold >= quantity)) into live from public.ticket_tiers where event_id = e.id;
      sold_out := exists (select 1 from public.ticket_tiers where event_id = e.id and status not in ('draft','hidden')) and live = 0;
      if not sold_out then return base || jsonb_build_object('ok', false, 'error', 'not_sold_out'); end if;
      return base || jsonb_build_object('ok', true, 'waitlist', exists (select 1 from public.ticket_waitlist w where w.event_id = e.id));
    when 'schedule' then
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'area', p.area, 'track', p.track,
               'local_start', to_char(p.starts_at at time zone tz, 'Dy HH24:MI'), 'local_end', to_char((p.starts_at + make_interval(mins => coalesce(p.duration_minutes, 0))) at time zone tz, 'HH24:MI'),
               'day', to_char(p.starts_at at time zone tz, 'YYYY-MM-DD')) order by p.starts_at), '[]') into prog
        from public.programme_items p where p.event_id = e.id and p.kind = 'programme' and p.starts_at is not null;
      select coalesce(jsonb_agg(jsonb_build_object('a', a.id, 'b', b.id, 'area', a.area)), '[]') into ovl
        from public.programme_items a join public.programme_items b on b.event_id = a.event_id and a.id < b.id and coalesce(a.area, '') = coalesce(b.area, '')
       where a.event_id = e.id and a.kind = 'programme' and b.kind = 'programme'
         and tstzrange(a.starts_at, a.starts_at + make_interval(mins => coalesce(a.duration_minutes, 0))) && tstzrange(b.starts_at, b.starts_at + make_interval(mins => coalesce(b.duration_minutes, 0)));
      if jsonb_array_length(prog) = 0 then return base || jsonb_build_object('ok', false, 'error', 'no_programme'); end if;
      return base || jsonb_build_object('ok', true, 'programme', prog, 'overlaps', ovl);
    when 'print', 'social', 'story' then
      return base || jsonb_build_object('ok', true, 'public_url', case when d.status = 'listed' then '/events/' || coalesce(e.slug, e.id::text) end);
    else raise exception 'invalid_poster_kind' using errcode = '22023';
  end case;
end $$;

-- ═══ 4. Export engine ═══
create table if not exists public.design_exports (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs(id) on delete cascade,
  design_version integer not null,
  format text not null check (format in ('png','jpg','pdf','svg','webp')),
  preset text references public.poster_presets(key),
  status text not null default 'requested' check (status in ('requested','ready','failed','expired')),
  path text check (path is null or path ~ '^[0-9a-f-]{36}/exports/[0-9a-f-]{36}\.(png|jpg|pdf|svg|webp)$'),
  size_bytes bigint, error text,
  requested_by uuid not null, requested_at timestamptz not null default now(), completed_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days', download_count integer not null default 0
);
create index if not exists design_exports_design on public.design_exports(design_id, requested_at desc);
alter table public.design_exports enable row level security;
revoke all on table public.design_exports from public, anon, authenticated;
grant select on table public.design_exports to authenticated;
grant all on table public.design_exports to service_role;
drop policy if exists design_exports_read on public.design_exports;
create policy design_exports_read on public.design_exports for select to authenticated using (public.design_access(design_id) is not null);

create or replace function public.request_design_export(p_design uuid, p_format text, p_preset text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare d public.designs; x public.design_exports; acc text := public.design_access(p_design);
begin
  select * into d from public.designs where id = p_design and deleted_at is null;
  if not found or coalesce(acc, '') not in ('owner','edit','duplicate') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not public.hit_rate_limit('export:' || (select auth.uid()), 60, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  insert into public.design_exports(design_id, design_version, format, preset, requested_by) values (d.id, d.version, p_format, p_preset, (select auth.uid())) returning * into x;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), d.workspace_id, 'media.export_requested', jsonb_build_object('export_id', x.id, 'design_id', d.id, 'format', p_format));
  return jsonb_build_object('ok', true, 'id', x.id, 'upload_prefix', (select auth.uid())::text || '/exports/');
end $$;
-- Service-only (upload route, after Q04 checks): records the rendered artifact.
create or replace function public.complete_design_export(p_export uuid, p_actor uuid, p_path text, p_size bigint, p_error text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare x public.design_exports;
begin
  select * into x from public.design_exports where id = p_export for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if x.requested_by <> p_actor then raise exception 'not_authorized' using errcode = '42501'; end if;
  if x.status <> 'requested' then return jsonb_build_object('ok', x.status = 'ready', 'replayed', true, 'status', x.status); end if;
  if p_error is not null then
    update public.design_exports set status = 'failed', error = left(p_error, 300), completed_at = now() where id = x.id;
    return jsonb_build_object('ok', false, 'status', 'failed');
  end if;
  if split_part(p_path, '/', 1) <> p_actor::text then raise exception 'invalid_path' using errcode = '22023'; end if;
  update public.design_exports set status = 'ready', path = p_path, size_bytes = p_size, completed_at = now() where id = x.id;
  return jsonb_build_object('ok', true, 'status', 'ready');
end $$;
-- Download re-checks access to the design at download time (a revoked share loses access) and expiry.
create or replace function public.design_export_download(p_export uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare x public.design_exports;
begin
  select * into x from public.design_exports where id = p_export;
  if not found or public.design_access(x.design_id) is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if x.status = 'expired' or x.expires_at < now() then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  if x.status <> 'ready' then return jsonb_build_object('ok', false, 'error', x.status); end if;
  update public.design_exports set download_count = download_count + 1 where id = x.id;
  insert into public.audit_events(actor_id, event, metadata) values ((select auth.uid()), 'media.export_downloaded', jsonb_build_object('export_id', x.id, 'design_id', x.design_id));
  return jsonb_build_object('ok', true, 'bucket', 'workspace-files', 'path', x.path, 'expires_in', 300);
end $$;
create or replace function public.job_media_exports_sweep(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n int; f int;
begin
  update public.design_exports set status = 'expired' where status = 'ready' and expires_at < now(); get diagnostics n = row_count;
  update public.design_exports set status = 'failed', error = 'not_completed' where status = 'requested' and requested_at < now() - interval '1 hour'; get diagnostics f = row_count;
  return jsonb_build_object('expired', n, 'abandoned', f);
end $$;
insert into public.job_kinds(kind, runtime, handler, max_attempts, description) values
  ('media.exports_sweep', 'db', 'public.job_media_exports_sweep', 3, 'Q23: daily; expire 7-day design export artifacts, fail abandoned requests (the app job deletes expired objects)')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, description = excluded.description, updated_at = now();

-- ═══ 5. Brand system ═══
alter table public.brand_kits add column if not exists version integer not null default 1;
alter table public.brand_kits add column if not exists rules jsonb not null default '{}' check (jsonb_typeof(rules) = 'object');
create table if not exists public.brand_kit_versions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version integer not null, snapshot jsonb not null, created_by uuid, created_at timestamptz not null default now(),
  primary key (workspace_id, version)
);
alter table public.brand_kit_versions enable row level security;
revoke all on table public.brand_kit_versions from public, anon, authenticated;
grant select on table public.brand_kit_versions to authenticated;
grant all on table public.brand_kit_versions to service_role;
drop policy if exists brand_kit_versions_read on public.brand_kit_versions;
create policy brand_kit_versions_read on public.brand_kit_versions for select to authenticated using (public.is_workspace_member(workspace_id));

create or replace function public.save_brand_kit(p_workspace uuid, p_kit jsonb, p_expected_version integer default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare k public.brand_kits; c text; f text; l text; sys text[] := array['Inter','Poppins','Playfair Display','Montserrat','Roboto','Lato','Open Sans','DM Sans','Manrope','Space Grotesk','Lora','Oswald']; rk text;
begin
  if not public.has_workspace_role(p_workspace, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  for c in select jsonb_array_elements_text(coalesce(p_kit->'colors', '[]')) loop
    if c !~* '^#[0-9a-f]{6}$' then raise exception 'invalid_colour: %', c using errcode = '22023'; end if;
  end loop;
  for f in select jsonb_array_elements_text(coalesce(p_kit->'fonts', '[]')) loop
    if not (f = any(sys) or exists (select 1 from public.uploaded_fonts u where u.workspace_id = p_workspace and u.family = f)) then raise exception 'font_not_available: %', f using errcode = '22023'; end if;
  end loop;
  for l in select jsonb_array_elements_text(coalesce(p_kit->'logos', '[]')) loop
    if l !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpe?g|webp|svg)$' then raise exception 'invalid_logo_path' using errcode = '22023'; end if;
  end loop;
  for rk in select jsonb_object_keys(coalesce(p_kit->'rules', '{}')) loop
    if rk not in ('palette_only','kit_fonts_only','min_contrast','min_logo_px','logo_clear_space_pct') then raise exception 'invalid_rule: %', rk using errcode = '22023'; end if;
  end loop;
  select * into k from public.brand_kits where workspace_id = p_workspace for update;
  if found and p_expected_version is not null and k.version <> p_expected_version then return jsonb_build_object('ok', false, 'conflict', true, 'version', k.version); end if;
  insert into public.brand_kits as b(workspace_id, colors, fonts, logos, tokens, sponsor_marks, rules, updated_by, updated_at, version)
    values (p_workspace, coalesce(p_kit->'colors', '[]'), coalesce(p_kit->'fonts', '[]'), coalesce(p_kit->'logos', '[]'), coalesce(p_kit->'tokens', '{}'), coalesce(p_kit->'sponsor_marks', '[]'),
      coalesce(p_kit->'rules', '{}'), (select auth.uid()), now(), 1)
  on conflict (workspace_id) do update set colors = excluded.colors, fonts = excluded.fonts, logos = excluded.logos, tokens = excluded.tokens, sponsor_marks = excluded.sponsor_marks,
    rules = excluded.rules, updated_by = excluded.updated_by, updated_at = now(), version = b.version + 1
  returning * into k;
  insert into public.brand_kit_versions(workspace_id, version, snapshot, created_by) values (p_workspace, k.version, to_jsonb(k) - 'workspace_id', (select auth.uid()))
    on conflict do nothing;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), p_workspace, 'brand.kit_saved', jsonb_build_object('version', k.version));
  return jsonb_build_object('ok', true, 'version', k.version);
end $$;

-- Checks a design against its workspace brand kit rules. Pure read; returns findings for the editor.
create or replace function public.brand_check_design(p_design uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d public.designs; k public.brand_kits; out jsonb := '[]'; c text; f text;
begin
  select * into d from public.designs where id = p_design;
  if not found or public.design_access(p_design) is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into k from public.brand_kits where workspace_id = d.workspace_id;
  if not found then return jsonb_build_object('ok', true, 'kit', false, 'findings', '[]'::jsonb); end if;
  if coalesce((k.rules->>'palette_only')::boolean, false) then
    for c in select distinct lower(v #>> '{}') from jsonb_path_query(d.document, 'lax $.**.color') v where jsonb_typeof(v) = 'string' and (v #>> '{}') ~* '^#[0-9a-f]{6}$' loop
      if not exists (select 1 from jsonb_array_elements_text(k.colors) x where lower(x) = c) then out := out || jsonb_build_object('rule', 'palette_only', 'value', c); end if;
    end loop;
  end if;
  if coalesce((k.rules->>'kit_fonts_only')::boolean, false) then
    for f in select distinct v #>> '{}' from jsonb_path_query(d.document, 'lax $.**.font') v where jsonb_typeof(v) = 'string' loop
      if not exists (select 1 from jsonb_array_elements_text(k.fonts) x where x = f) then out := out || jsonb_build_object('rule', 'kit_fonts_only', 'value', f); end if;
    end loop;
  end if;
  return jsonb_build_object('ok', jsonb_array_length(out) = 0, 'kit', true, 'kit_version', k.version, 'findings', out);
end $$;

-- ═══ 6. Template scrubbing (link/public) ═══
create or replace function public.design_templates_scrub() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if new.visibility in ('link','public') and (tg_op = 'INSERT' or new.document is distinct from old.document or new.visibility is distinct from old.visibility) then
    t := new.document::text;
    if t ~* '<script|javascript:|data:text/html|\son[a-z]+\s*=|<iframe|<object|<embed' then raise exception 'template_active_content' using errcode = '22023'; end if;
    t := regexp_replace(t, '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}', '{{contact.email}}', 'g');
    t := regexp_replace(t, '(\+44\s?7\d{3}|\m07\d{3})\s?\d{3}\s?\d{3}\M', '{{contact.phone}}', 'g');
    t := regexp_replace(t, '([?&](token|t|key|sig|signature|code)=)[A-Za-z0-9_\-\.]{6,}', '\1', 'gi');
    t := regexp_replace(t, '\m[a-f0-9]{32,}\M', '', 'gi');
    new.document := t::jsonb;
  end if;
  return new;
end $$;
drop trigger if exists gd_design_templates_scrub on public.design_templates;
create trigger gd_design_templates_scrub before insert or update on public.design_templates for each row execute function public.design_templates_scrub();

-- ═══ 7. Campaign assets ═══
create table if not exists public.campaign_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  role text not null check (role in ('hero','social','story','email','poster','landing')),
  design_id uuid references public.designs(id) on delete cascade,
  media_asset_id uuid references public.media_assets(id) on delete cascade,
  created_by uuid, created_at timestamptz not null default now(),
  check ((design_id is null) <> (media_asset_id is null))
);
alter table public.campaign_assets enable row level security;
revoke all on table public.campaign_assets from public, anon, authenticated;
grant select on table public.campaign_assets to authenticated;
grant all on table public.campaign_assets to service_role;
drop policy if exists campaign_assets_read on public.campaign_assets;
create policy campaign_assets_read on public.campaign_assets for select to authenticated using (exists (select 1 from public.promotion_campaigns c where c.id = campaign_id and public.campaign_can(c.workspace_id, 'read')));

create or replace function public.campaign_asset_add(p_campaign uuid, p_role text, p_design uuid, p_media uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare c public.promotion_campaigns; a public.media_assets; v uuid; p text[];
begin
  select * into c from public.promotion_campaigns where id = p_campaign;
  if not found or not public.campaign_can(c.workspace_id, 'manage') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_design is not null and not exists (select 1 from public.designs d where d.id = p_design and d.workspace_id = c.workspace_id and d.deleted_at is null) then raise exception 'design_not_in_workspace' using errcode = '22023'; end if;
  if p_media is not null then
    select * into a from public.media_assets where id = p_media and (workspace_id = c.workspace_id or event_id in (select id from public.events where workspace_id = c.workspace_id));
    if not found then raise exception 'asset_not_in_workspace' using errcode = '22023'; end if;
    p := public.media_public_problems(a);
    if array_length(p, 1) > 0 then return jsonb_build_object('ok', false, 'error', 'media_not_publishable', 'problems', to_jsonb(p)); end if;
    insert into public.media_usages(asset_id, target_kind, target_id, public_use) values (a.id, 'campaign', c.id, true) on conflict (asset_id, target_kind, target_id) do update set public_use = true;
  end if;
  insert into public.campaign_assets(campaign_id, role, design_id, media_asset_id, created_by) values (c.id, p_role, p_design, p_media, (select auth.uid())) returning id into v;
  return jsonb_build_object('ok', true, 'id', v);
end $$;

-- ═══ 8. Promo landing pages ═══
create table if not exists public.promo_landing_pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid references public.promotion_campaigns(id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9\-]{2,79}$'),
  title text not null check (length(btrim(title)) between 2 and 120),
  intro text check (intro is null or length(intro) <= 4000),
  hero_asset_id uuid references public.media_assets(id) on delete set null,
  event_ids uuid[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  version integer not null default 1, published_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.promo_landing_pages enable row level security;
revoke all on table public.promo_landing_pages from public, anon, authenticated;
grant select on table public.promo_landing_pages to anon, authenticated;
grant all on table public.promo_landing_pages to service_role;
drop policy if exists promo_landing_public on public.promo_landing_pages;
create policy promo_landing_public on public.promo_landing_pages for select to anon, authenticated using (status = 'published');
drop policy if exists promo_landing_members on public.promo_landing_pages;
create policy promo_landing_members on public.promo_landing_pages for select to authenticated using (public.is_workspace_member(workspace_id));

create or replace function public.save_landing_page(p_workspace uuid, p_page uuid, p_page_data jsonb, p_expected_version integer default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare l public.promo_landing_pages; evs uuid[]; hero uuid;
begin
  if not public.has_permission(p_workspace, 'promotion.manage') then raise exception 'not_authorized' using errcode = '42501'; end if;
  evs := coalesce((select array_agg((x #>> '{}')::uuid) from jsonb_array_elements(coalesce(p_page_data->'event_ids', '[]')) x), '{}');
  if exists (select 1 from unnest(evs) e where not exists (select 1 from public.events v where v.id = e and v.workspace_id = p_workspace)) then raise exception 'event_not_in_workspace' using errcode = '22023'; end if;
  hero := nullif(p_page_data->>'hero_asset_id', '')::uuid;
  if p_page is null then
    insert into public.promo_landing_pages(workspace_id, campaign_id, slug, title, intro, hero_asset_id, event_ids, created_by)
      values (p_workspace, nullif(p_page_data->>'campaign_id', '')::uuid, lower(p_page_data->>'slug'), btrim(p_page_data->>'title'), p_page_data->>'intro', hero, evs, (select auth.uid()))
      returning * into l;
  else
    update public.promo_landing_pages set title = coalesce(btrim(p_page_data->>'title'), title), intro = coalesce(p_page_data->>'intro', intro), hero_asset_id = coalesce(hero, hero_asset_id),
      event_ids = case when p_page_data ? 'event_ids' then evs else event_ids end, version = version + 1, updated_at = now()
     where id = p_page and workspace_id = p_workspace and (p_expected_version is null or version = p_expected_version) returning * into l;
    if l.id is null then
      if exists (select 1 from public.promo_landing_pages where id = p_page) then return jsonb_build_object('ok', false, 'conflict', true); end if;
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;
  return jsonb_build_object('ok', true, 'id', l.id, 'version', l.version, 'slug', l.slug);
end $$;

create or replace function public.publish_landing_page(p_page uuid, p_publish boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare l public.promo_landing_pages; a public.media_assets; bl jsonb := '[]';
begin
  select * into l from public.promo_landing_pages where id = p_page for update;
  if not found or not public.has_permission(l.workspace_id, 'promotion.manage') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_publish then
    if cardinality(l.event_ids) = 0 then bl := bl || jsonb_build_object('key', 'no_events'); end if;
    if exists (select 1 from unnest(l.event_ids) e where not exists (select 1 from public.event_distribution d where d.event_id = e and d.status = 'listed')) then bl := bl || jsonb_build_object('key', 'event_not_listed'); end if;
    if l.hero_asset_id is not null then
      select * into a from public.media_assets where id = l.hero_asset_id;
      if a.usage_scope <> 'public' then bl := bl || jsonb_build_object('key', 'hero_not_public', 'problems', to_jsonb(public.media_public_problems(a))); end if;
    end if;
    if jsonb_array_length(bl) > 0 then return jsonb_build_object('ok', false, 'blockers', bl); end if;
    update public.promo_landing_pages set status = 'published', published_at = now(), version = version + 1, updated_at = now() where id = l.id;
    if l.hero_asset_id is not null then insert into public.media_usages(asset_id, target_kind, target_id, public_use) values (l.hero_asset_id, 'landing', l.id, true) on conflict do nothing; end if;
  else
    update public.promo_landing_pages set status = 'draft', version = version + 1, updated_at = now() where id = l.id;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), l.workspace_id, 'promotion.landing_published', jsonb_build_object('page_id', l.id, 'published', p_publish));
  return jsonb_build_object('ok', true);
end $$;

-- Public read (invoker): page + its listed events in the organiser's order + labelled sponsored slots for the 'landing' surface.
create or replace function public.landing_page(p_slug text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select case when l.id is null then null else jsonb_build_object('slug', l.slug, 'title', l.title, 'intro', l.intro,
    'hero', (select jsonb_build_object('url', a.url, 'alt_text', a.alt_text, 'credit', a.credit) from public.media_assets a where a.id = l.hero_asset_id and a.usage_scope = 'public'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'starts_at', e.starts_at, 'city', e.city, 'cover_image', e.cover_image) order by x.ord)
        from unnest(l.event_ids) with ordinality x(id, ord) join public.events e on e.id = x.id join public.event_distribution d on d.event_id = e.id and d.status = 'listed'), '[]'::jsonb),
    'sponsored', coalesce((select jsonb_agg(jsonb_build_object('event_id', f.event_id, 'label', f.label)) from public.directory_featured f
        where f.surface = 'landing' and f.surface_key = l.slug and f.kind = 'sponsored' and f.status = 'active' and now() between f.starts_at and f.ends_at), '[]'::jsonb)) end
    from (select 1) one left join public.promo_landing_pages l on l.slug = lower(p_slug) and l.status = 'published'
$$;

-- ═══ 9. Share cards / link previews ═══
-- Listed public events only (private, draft, cancelled, restricted → null). Image stripped of query strings, so no signed
-- URL or token can leak into an og:image; canonical URL is the slug page.
create or replace function public.event_share_card(p_event uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('title', left(e.name, 70),
      'description', left(coalesce(nullif(btrim(e.description), ''), e.name || coalesce(' · ' || e.venue_name, '') || coalesce(', ' || e.city, '')), 160),
      'url', '/events/' || coalesce(e.slug, e.id::text),
      'image', case when e.cover_image ~ '^https://[^?#]+$' or e.cover_image ~ '^/[^?#]+$' then e.cover_image when e.cover_image like 'https://%' then split_part(split_part(e.cover_image, '?', 1), '#', 1) end,
      'starts_at', e.starts_at, 'timezone', e.timezone, 'city', e.city, 'indexable', true)
    from public.events e join public.event_distribution d on d.event_id = e.id and d.status = 'listed' where e.id = p_event
$$;

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('media.asset_published', 1, 'media_asset', 'A media asset''s publication metadata changed (payload: asset_id, public).', null),
  ('media.gallery_published', 1, 'media_gallery', 'A gallery was published or unpublished.', null),
  ('media.export_requested', 1, 'design_export', 'A design export was requested (payload: export_id, design_id, format).', null),
  ('media.export_downloaded', 1, 'design_export', 'A design export was downloaded.', null),
  ('brand.kit_saved', 1, 'brand_kit', 'A workspace brand kit was saved (payload: version).', null),
  ('promotion.landing_published', 1, 'promo_landing_page', 'A promo landing page was published or unpublished.', null)
on conflict (event_type) do update set description = excluded.description, aggregate = excluded.aggregate;

-- ═══ Grants ═══
revoke all on function public.media_public_problems(public.media_assets), public.media_assets_public_guard(), public.complete_design_export(uuid, uuid, text, bigint, text),
  public.job_media_exports_sweep(public.job_queue), public.design_templates_scrub() from public, anon, authenticated;
grant execute on function public.media_public_problems(public.media_assets), public.complete_design_export(uuid, uuid, text, bigint, text), public.job_media_exports_sweep(public.job_queue) to service_role;
revoke all on function public.media_asset_publish(uuid, jsonb), public.save_media_gallery(uuid, uuid, text, uuid, uuid, jsonb, integer), public.publish_media_gallery(uuid, boolean),
  public.poster_data(uuid, text), public.request_design_export(uuid, text, text), public.design_export_download(uuid), public.save_brand_kit(uuid, jsonb, integer),
  public.brand_check_design(uuid), public.campaign_asset_add(uuid, text, uuid, uuid), public.save_landing_page(uuid, uuid, jsonb, integer), public.publish_landing_page(uuid, boolean) from public, anon;
grant execute on function public.media_asset_publish(uuid, jsonb), public.save_media_gallery(uuid, uuid, text, uuid, uuid, jsonb, integer), public.publish_media_gallery(uuid, boolean),
  public.poster_data(uuid, text), public.request_design_export(uuid, text, text), public.design_export_download(uuid), public.save_brand_kit(uuid, jsonb, integer),
  public.brand_check_design(uuid), public.campaign_asset_add(uuid, text, uuid, uuid), public.save_landing_page(uuid, uuid, jsonb, integer), public.publish_landing_page(uuid, boolean) to authenticated, service_role;
grant execute on function public.media_asset_usage(uuid), public.previous_media(uuid, integer), public.landing_page(text), public.event_share_card(uuid) to anon, authenticated, service_role;
