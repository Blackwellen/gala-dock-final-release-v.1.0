-- Media Studio (media spec §1–59): canonical design documents (never just a JPG), versions, templates + community moderation,
-- brand kits, custom fonts, shares and comments. Uploaded originals stay private (workspace-files); published community
-- templates only ever reference public derivatives.
begin;

create table if not exists public.designs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  title text not null default 'Untitled design' check (length(title) between 1 and 140),
  kind text not null default 'poster',
  document jsonb not null,                       -- {unit, dpi, pages:[{id,name,width,height,background,layers:[...]}]}
  version integer not null default 1,
  status text not null default 'draft' check (status in ('draft','approved','published','archived')),
  source text not null default 'blank' check (source in ('blank','template','import','agent','duplicate','variant')),
  template_id uuid,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  thumbnail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (jsonb_typeof(document->'pages') = 'array' and jsonb_array_length(document->'pages') between 1 and 60),
  check (length(document::text) < 4000000)
);
create index if not exists designs_ws_idx on public.designs(workspace_id, updated_at desc) where deleted_at is null;
create index if not exists designs_event_idx on public.designs(event_id) where deleted_at is null;

create table if not exists public.design_versions (
  design_id uuid not null references public.designs(id) on delete cascade,
  version integer not null,
  label text not null default 'Auto-save',
  auto boolean not null default true,
  document jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (design_id, version)
);
create table if not exists public.design_shares (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  link_token_hash text unique,
  permission text not null check (permission in ('view','comment','edit','duplicate')),
  expires_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check ((user_id is null) <> (link_token_hash is null))
);
create table if not exists public.design_comments (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs(id) on delete cascade,
  page_id text, layer_id text, x numeric, y numeric,
  parent_id uuid references public.design_comments(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null check (length(body) between 1 and 4000),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.design_access(p_design uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when d.owner_id = (select auth.uid()) then 'owner'
    when d.workspace_id is not null and public.has_workspace_role(d.workspace_id, array['owner','manager','member']) then 'edit'
    when d.event_id is not null and public.can_edit_event(d.event_id) then 'edit'
    when exists (select 1 from public.design_shares s where s.design_id = d.id and s.user_id = (select auth.uid()) and (s.expires_at is null or s.expires_at > now()) and s.permission = 'edit') then 'edit'
    when d.workspace_id is not null and public.is_workspace_member(d.workspace_id) then 'view'
    when exists (select 1 from public.design_shares s where s.design_id = d.id and s.user_id = (select auth.uid()) and (s.expires_at is null or s.expires_at > now())) then 'view'
    when public.has_admin_permission('trust') then 'view'
    else null end
  from public.designs d where d.id = p_design and d.deleted_at is null;
$$;
revoke all on function public.design_access(uuid) from public, anon;
grant execute on function public.design_access(uuid) to authenticated, service_role;

alter table public.designs enable row level security;
alter table public.design_versions enable row level security;
alter table public.design_shares enable row level security;
alter table public.design_comments enable row level security;
drop policy if exists designs_read on public.designs;
create policy designs_read on public.designs for select using (public.design_access(id) is not null);
drop policy if exists design_versions_read on public.design_versions;
create policy design_versions_read on public.design_versions for select using (public.design_access(design_id) is not null);
drop policy if exists design_shares_read on public.design_shares;
create policy design_shares_read on public.design_shares for select using (public.design_access(design_id) in ('owner','edit') or user_id = (select auth.uid()));
drop policy if exists design_comments_read on public.design_comments;
create policy design_comments_read on public.design_comments for select using (public.design_access(design_id) is not null);

-- Create: blank, from a template (independent copy), or duplicate. Workspace membership is checked.
create or replace function public.create_design(p_workspace uuid, p_event uuid, p_title text, p_document jsonb, p_source text default 'blank', p_template uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare did uuid; doc jsonb := p_document; t record;
begin
  if auth.uid() is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_workspace is not null and not public.has_workspace_role(p_workspace, array['owner','manager','member']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_event is not null and not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_template is not null then
    select * into t from public.design_templates where id = p_template and status = 'active'
      and (visibility = 'public' or owner_id = auth.uid() or (workspace_id is not null and public.is_workspace_member(workspace_id)) or workspace_id is null);
    if not found then raise exception 'template_not_found' using errcode = 'P0002'; end if;
    doc := t.document;
    update public.design_templates set usage_count = usage_count + 1 where id = p_template;
  end if;
  if jsonb_typeof(doc->'pages') <> 'array' then raise exception 'invalid_document' using errcode = '22023'; end if;
  insert into public.designs(workspace_id, owner_id, event_id, title, document, source, template_id)
    values (p_workspace, auth.uid(), p_event, left(coalesce(nullif(trim(p_title), ''), 'Untitled design'), 140), doc, p_source, p_template) returning id into did;
  insert into public.design_versions(design_id, version, label, auto, document, created_by) values (did, 1, 'Created', false, doc, auth.uid());
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', p_workspace, 'design.created', jsonb_build_object('design_id', did, 'source', p_source));
  return did;
end $$;

-- Autosave with optimistic concurrency: a stale tab gets a conflict instead of overwriting newer work.
create or replace function public.save_design(p_design uuid, p_document jsonb, p_expected_version integer, p_title text default null, p_label text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare d public.designs; v integer;
begin
  select * into d from public.designs where id = p_design and deleted_at is null for update;
  if not found or coalesce(public.design_access(p_design), '') not in ('owner','edit') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if d.version <> p_expected_version then raise exception 'version_conflict:%', d.version using errcode = 'P0001'; end if;
  if jsonb_typeof(p_document->'pages') <> 'array' then raise exception 'invalid_document' using errcode = '22023'; end if;
  v := d.version + 1;
  update public.designs set document = p_document, version = v, title = coalesce(nullif(left(trim(p_title), 140), ''), title), updated_at = now() where id = d.id;
  -- Named versions always; automatic checkpoints every 15 saves (bounded history, no bitmap snapshots).
  if p_label is not null or v % 15 = 0 then
    insert into public.design_versions(design_id, version, label, auto, document, created_by) values (d.id, v, coalesce(left(p_label, 80), 'Auto-save'), p_label is null, p_document, auth.uid())
      on conflict do nothing;
  end if;
  return v;
end $$;

create or replace function public.restore_design_version(p_design uuid, p_version integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare d public.designs; doc jsonb; v integer;
begin
  select * into d from public.designs where id = p_design for update;
  if not found or coalesce(public.design_access(p_design), '') not in ('owner','edit') then raise exception 'not_authorized' using errcode = '42501'; end if;
  select document into doc from public.design_versions where design_id = p_design and version = p_version;
  if doc is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- Save the current state first so restoring never destroys work.
  insert into public.design_versions(design_id, version, label, auto, document, created_by) values (d.id, d.version, 'Before restore', false, d.document, auth.uid()) on conflict do nothing;
  v := d.version + 1;
  update public.designs set document = doc, version = v, updated_at = now() where id = d.id;
  insert into public.design_versions(design_id, version, label, auto, document, created_by) values (d.id, v, 'Restored v' || p_version, false, doc, auth.uid());
  return v;
end $$;

-- ───────────────────────── templates & community (§6–9) ─────────────────────────
create table if not exists public.design_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,     -- null = Gala Dock template
  owner_id uuid references auth.users(id) on delete set null,
  source_design_id uuid references public.designs(id) on delete set null,
  title text not null check (length(title) between 2 and 120),
  description text not null default '',
  category text not null default 'event',
  event_type text, tags text[] not null default '{}',
  width numeric not null, height numeric not null,
  document jsonb not null,
  placeholders text[] not null default '{}',
  preview text,
  visibility text not null default 'private' check (visibility in ('private','workspace','link','public')),
  link_token_hash text unique,
  status text not null default 'active' check (status in ('active','hidden','removed')),
  usage_count integer not null default 0, save_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists design_templates_public_idx on public.design_templates(category, created_at desc) where visibility = 'public' and status = 'active';
create table if not exists public.template_reports (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.design_templates(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('inappropriate','copyright','spam','impersonation','malicious','unsafe','other')),
  detail text not null default '' check (length(detail) <= 2000),
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  decided_by uuid references auth.users(id), decision_note text, decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (template_id, reporter_id)
);
create table if not exists public.template_saves (user_id uuid not null references auth.users(id) on delete cascade, template_id uuid not null references public.design_templates(id) on delete cascade, created_at timestamptz not null default now(), primary key (user_id, template_id));
create table if not exists public.template_creator_restrictions (user_id uuid primary key references auth.users(id) on delete cascade, reason text not null, created_by uuid references auth.users(id), created_at timestamptz not null default now());

alter table public.design_templates enable row level security;
alter table public.template_reports enable row level security;
alter table public.template_saves enable row level security;
alter table public.template_creator_restrictions enable row level security;
drop policy if exists design_templates_read on public.design_templates;
create policy design_templates_read on public.design_templates for select using (
  (status = 'active' and (visibility = 'public' or workspace_id is null)) or owner_id = (select auth.uid())
  or (workspace_id is not null and visibility in ('workspace','link','public') and public.is_workspace_member(workspace_id)) or public.has_admin_permission('trust'));
drop policy if exists template_reports_read on public.template_reports;
create policy template_reports_read on public.template_reports for select using (reporter_id = (select auth.uid()) or public.has_admin_permission('trust'));
drop policy if exists template_saves_rw on public.template_saves;
create policy template_saves_rw on public.template_saves for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists template_restrictions_read on public.template_creator_restrictions;
create policy template_restrictions_read on public.template_creator_restrictions for select using (public.has_admin_permission('trust'));

-- Publishing strips event-specific bindings (§51): bound values revert to {{placeholders}}, private uploads are dropped unless the
-- app has already copied them to a public derivative (asset.public = true).
create or replace function public.publish_template(p_design uuid, p_title text, p_description text, p_category text, p_tags text[], p_visibility text, p_link_hash text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare d public.designs; doc jsonb; tid uuid; ph text[];
begin
  select * into d from public.designs where id = p_design and deleted_at is null;
  if not found or coalesce(public.design_access(p_design), '') not in ('owner','edit') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_visibility not in ('private','workspace','link','public') then raise exception 'invalid_visibility' using errcode = '22023'; end if;
  if p_visibility = 'public' and exists (select 1 from public.template_creator_restrictions r where r.user_id = auth.uid()) then raise exception 'publishing_restricted' using errcode = '42501'; end if;
  if p_visibility = 'public' and d.workspace_id is not null and not public.has_workspace_role(d.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select jsonb_set(d.document, '{pages}', coalesce((
    select jsonb_agg(jsonb_set(pg, '{layers}', coalesce((
      select jsonb_agg(case when l->>'bind' is not null then l || jsonb_build_object('text', '{{' || (l->>'bind') || '}}') else l end)
      from jsonb_array_elements(pg->'layers') l
      where not (l->>'type' = 'image' and coalesce((l->'asset'->>'public')::boolean, false) = false and p_visibility in ('public','link'))), '[]'::jsonb)))
    from jsonb_array_elements(d.document->'pages') pg), '[]'::jsonb)) into doc;
  select coalesce(array_agg(distinct m[1]), '{}') into ph from regexp_matches(doc::text, '\{\{([a-z_]+\.[a-z_]+)\}\}', 'g') m;
  insert into public.design_templates(workspace_id, owner_id, source_design_id, title, description, category, tags, width, height, document, placeholders, preview, visibility, link_token_hash)
    values (d.workspace_id, auth.uid(), d.id, left(trim(p_title), 120), left(coalesce(p_description, ''), 1000), left(coalesce(p_category, 'event'), 40), coalesce(p_tags[1:10], '{}'),
      (d.document->'pages'->0->>'width')::numeric, (d.document->'pages'->0->>'height')::numeric, doc, ph, d.thumbnail, p_visibility, p_link_hash)
    returning id into tid;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', d.workspace_id, 'template.published', jsonb_build_object('template_id', tid, 'visibility', p_visibility));
  return tid;
end $$;

create or replace function public.report_template(p_template uuid, p_reason text, p_detail text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  insert into public.template_reports(template_id, reporter_id, reason, detail) values (p_template, auth.uid(), p_reason, left(coalesce(p_detail, ''), 2000)) on conflict (template_id, reporter_id) do nothing;
  -- Several independent reports hide a public template pending review.
  update public.design_templates set status = 'hidden' where id = p_template and status = 'active' and (select count(*) from public.template_reports r where r.template_id = p_template and r.status = 'open') >= 3;
end $$;

create or replace function public.moderate_template(p_template uuid, p_action text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.design_templates;
begin
  if not public.has_admin_permission('trust') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_note, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into t from public.design_templates where id = p_template for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_action in ('hide','remove','reinstate') then
    update public.design_templates set status = case p_action when 'hide' then 'hidden' when 'remove' then 'removed' else 'active' end where id = t.id;
  elsif p_action = 'restrict_creator' and t.owner_id is not null then
    insert into public.template_creator_restrictions(user_id, reason, created_by) values (t.owner_id, left(p_note, 500), auth.uid()) on conflict (user_id) do update set reason = excluded.reason;
    update public.design_templates set status = 'hidden' where owner_id = t.owner_id and visibility = 'public';
  else raise exception 'invalid_action' using errcode = '22023'; end if;
  update public.template_reports set status = case when p_action = 'reinstate' then 'dismissed' else 'actioned' end, decided_by = auth.uid(), decided_at = now(), decision_note = left(p_note, 500)
    where template_id = t.id and status = 'open';
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'template.' || p_action, jsonb_build_object('template_id', t.id, 'note', left(p_note, 500)));
end $$;

-- ───────────────────────── brand kit & custom fonts (§34–35, §44) ─────────────────────────
create table if not exists public.brand_kits (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  colors jsonb not null default '[]', fonts jsonb not null default '[]', logos jsonb not null default '[]', tokens jsonb not null default '{}', sponsor_marks jsonb not null default '[]',
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create table if not exists public.uploaded_fonts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  family text not null check (family ~ '^[A-Za-z0-9 \-]{2,60}$'),
  weight integer not null default 400 check (weight between 100 and 900), style text not null default 'normal' check (style in ('normal','italic')),
  path text not null check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(woff2|woff|ttf|otf)$'),
  licence_acknowledged boolean not null check (licence_acknowledged),
  created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
alter table public.brand_kits enable row level security;
alter table public.uploaded_fonts enable row level security;
drop policy if exists brand_kits_read on public.brand_kits;
create policy brand_kits_read on public.brand_kits for select using (public.is_workspace_member(workspace_id));
drop policy if exists brand_kits_write on public.brand_kits;
create policy brand_kits_write on public.brand_kits for all using (public.has_workspace_role(workspace_id, array['owner','manager'])) with check (public.has_workspace_role(workspace_id, array['owner','manager']));
drop policy if exists uploaded_fonts_read on public.uploaded_fonts;
create policy uploaded_fonts_read on public.uploaded_fonts for select using (public.is_workspace_member(workspace_id));
drop policy if exists uploaded_fonts_write on public.uploaded_fonts;
create policy uploaded_fonts_write on public.uploaded_fonts for all using (public.has_workspace_role(workspace_id, array['owner','manager'])) with check (public.has_workspace_role(workspace_id, array['owner','manager']) and created_by = (select auth.uid()));

revoke all on function public.create_design(uuid, uuid, text, jsonb, text, uuid), public.save_design(uuid, jsonb, integer, text, text), public.restore_design_version(uuid, integer),
  public.publish_template(uuid, text, text, text, text[], text, text), public.report_template(uuid, text, text), public.moderate_template(uuid, text, text) from public, anon;
grant execute on function public.create_design(uuid, uuid, text, jsonb, text, uuid), public.save_design(uuid, jsonb, integer, text, text), public.restore_design_version(uuid, integer),
  public.publish_template(uuid, text, text, text, text[], text, text), public.report_template(uuid, text, text), public.moderate_template(uuid, text, text) to authenticated, service_role;
grant select on public.designs, public.design_versions, public.design_shares, public.design_comments, public.design_templates, public.template_reports, public.template_saves, public.brand_kits, public.uploaded_fonts to authenticated;
grant insert, delete on public.template_saves to authenticated;
grant insert, update, delete on public.brand_kits, public.uploaded_fonts to authenticated;
grant select on public.design_templates to anon;
grant all on public.designs, public.design_versions, public.design_shares, public.design_comments, public.design_templates, public.template_reports, public.template_saves, public.template_creator_restrictions, public.brand_kits, public.uploaded_fonts to service_role;
commit;

-- Private design assets are served via short-lived signed URLs only to someone who uploaded them or can open a design /
-- template that references them (§10, §51: originals private, no cross-workspace asset access).
create or replace function public.can_read_media_path(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpe?g|webp|gif|svg)$' and (
    split_part(p_path, '/', 1) = (select auth.uid())::text
    or exists (select 1 from public.designs d where d.deleted_at is null and position(p_path in d.document::text) > 0 and public.design_access(d.id) is not null)
    or exists (select 1 from public.design_templates t where t.status = 'active' and position(p_path in t.document::text) > 0
               and (t.owner_id = (select auth.uid()) or (t.workspace_id is not null and public.is_workspace_member(t.workspace_id)))));
$$;
revoke all on function public.can_read_media_path(text) from public, anon;
grant execute on function public.can_read_media_path(text) to authenticated, service_role;
