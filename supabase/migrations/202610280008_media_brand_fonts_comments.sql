-- Media Studio: brand kit, custom font upload, design comments (media spec §34–35, §44, §46). Tables exist (202610260001);
-- this adds the write paths, font storage and logo access.
begin;

-- Fonts live in the private workspace-files bucket, in the uploader's folder like other uploads.
update storage.buckets set allowed_mime_types = (select array(select distinct unnest(coalesce(allowed_mime_types, '{}') || array['font/woff2','font/woff','font/ttf','font/otf'])))
  where id = 'workspace-files';

-- Brand kit content is validated in the database too: hex colours, known font names, logo paths from the uploader folder layout.
create or replace function public.save_brand_kit(p_workspace uuid, p_colors jsonb, p_fonts jsonb, p_logos jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_workspace_role(p_workspace, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if jsonb_typeof(p_colors) <> 'array' or jsonb_array_length(p_colors) > 24
     or exists (select 1 from jsonb_array_elements(p_colors) c where jsonb_typeof(c) <> 'object' or coalesce(c->>'hex', '') !~ '^#[0-9a-fA-F]{6}$' or length(coalesce(c->>'name', '')) > 40) then
    raise exception 'invalid_colors' using errcode = '22023'; end if;
  if jsonb_typeof(p_fonts) <> 'array' or jsonb_array_length(p_fonts) > 12
     or exists (select 1 from jsonb_array_elements(p_fonts) f where jsonb_typeof(f) <> 'object' or coalesce(f->>'family', '') !~ '^[A-Za-z0-9 \-]{2,60}$' or coalesce(f->>'role', 'body') not in ('heading','body','accent')) then
    raise exception 'invalid_fonts' using errcode = '22023'; end if;
  if jsonb_typeof(p_logos) <> 'array' or jsonb_array_length(p_logos) > 12
     or exists (select 1 from jsonb_array_elements(p_logos) l where jsonb_typeof(l) <> 'object' or coalesce(l->>'path', '') !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpe?g|webp)$' or length(coalesce(l->>'name', '')) > 60) then
    raise exception 'invalid_logos' using errcode = '22023'; end if;
  insert into public.brand_kits(workspace_id, colors, fonts, logos, updated_by, updated_at) values (p_workspace, p_colors, p_fonts, p_logos, auth.uid(), now())
    on conflict (workspace_id) do update set colors = excluded.colors, fonts = excluded.fonts, logos = excluded.logos, updated_by = excluded.updated_by, updated_at = now();
end $$;
revoke all on function public.save_brand_kit(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_brand_kit(uuid, jsonb, jsonb, jsonb) to authenticated;

-- Workspace members can read brand-kit logos (in addition to the uploader and anyone who can open a design using the file).
create or replace function public.can_read_media_path(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpe?g|webp|gif|svg)$' and (
    split_part(p_path, '/', 1) = (select auth.uid())::text
    or exists (select 1 from public.designs d where d.deleted_at is null and position(p_path in d.document::text) > 0 and public.design_access(d.id) is not null)
    or exists (select 1 from public.design_templates t where t.status = 'active' and position(p_path in t.document::text) > 0
               and (t.owner_id = (select auth.uid()) or (t.workspace_id is not null and public.is_workspace_member(t.workspace_id))))
    or exists (select 1 from public.brand_kits b where position(p_path in b.logos::text) > 0 and public.is_workspace_member(b.workspace_id)));
$$;

-- Comments: anyone who can open the design can comment; editors and the author can resolve; only the author can delete.
create or replace function public.add_design_comment(p_design uuid, p_body text, p_page text default null, p_layer text default null, p_x numeric default null, p_y numeric default null, p_parent uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare cid uuid; d public.designs; who text; root_author uuid;
begin
  if auth.uid() is null or public.design_access(p_design) is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_body, ''))) not between 1 and 4000 then raise exception 'invalid_body' using errcode = '22023'; end if;
  if p_parent is not null then
    select author_id into root_author from public.design_comments where id = p_parent and design_id = p_design and parent_id is null;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  if (select count(*) from public.design_comments where author_id = auth.uid() and created_at > now() - interval '1 minute') >= 20 then raise exception 'rate_limited' using errcode = '54000'; end if;
  insert into public.design_comments(design_id, page_id, layer_id, x, y, parent_id, author_id, body)
    values (p_design, left(p_page, 40), left(p_layer, 40), p_x, p_y, p_parent, auth.uid(), trim(p_body)) returning id into cid;
  select * into d from public.designs where id = p_design;
  select coalesce(nullif(p.full_name, ''), 'Someone') into who from public.profiles p where p.id = auth.uid();
  -- Notify the design owner and, for a reply, the thread starter (never the commenter).
  insert into public.notifications(user_id, kind, title, body, link)
    select distinct u, 'design_comment', coalesce(who, 'Someone') || case when p_parent is null then ' commented on ' else ' replied on ' end || d.title, left(trim(p_body), 200), '/studio/' || p_design || '?comments=1'
    from unnest(array[d.owner_id, root_author]) u where u is not null and u <> auth.uid();
  return cid;
end $$;

create or replace function public.resolve_design_comment(p_comment uuid, p_resolved boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.design_comments;
begin
  select * into c from public.design_comments where id = p_comment;
  if not found or (c.author_id is distinct from auth.uid() and coalesce(public.design_access(c.design_id), '') not in ('owner','edit')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.design_comments set resolved = coalesce(p_resolved, true) where id = p_comment or parent_id = p_comment;
end $$;

create or replace function public.delete_design_comment(p_comment uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.design_comments where id = p_comment and author_id = auth.uid();
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
end $$;
revoke all on function public.add_design_comment(uuid, text, text, text, numeric, numeric, uuid), public.resolve_design_comment(uuid, boolean), public.delete_design_comment(uuid) from public, anon;
grant execute on function public.add_design_comment(uuid, text, text, text, numeric, numeric, uuid), public.resolve_design_comment(uuid, boolean), public.delete_design_comment(uuid) to authenticated;

commit;
