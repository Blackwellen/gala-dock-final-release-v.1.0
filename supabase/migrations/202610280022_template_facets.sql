-- Template filters (user request): who a template is for, business type, style and colour, plus a format derived from its size.
-- Set by the owner when saving/sharing a template (set_template_facets) and by the starter seed.
begin;
alter table public.design_templates
  add column if not exists audience text not null default 'both' check (audience in ('organiser','provider','both')),
  add column if not exists business_type text not null default '' check (length(business_type) <= 40),
  add column if not exists style text not null default '' check (length(style) <= 40),
  add column if not exists palette text not null default '' check (length(palette) <= 40);
alter table public.design_templates drop column if exists format;
alter table public.design_templates add column format text generated always as (case
  when coalesce(height, 0) = 0 then 'other'
  when width / height >= 2.5 then 'banner'
  when width / height >= 1.2 then 'landscape'
  when width / height >= 0.95 then 'square'
  when width / height >= 0.76 then 'portrait'
  when width / height >= 0.65 then 'poster'
  else 'story' end) stored;
create index if not exists design_templates_facets on public.design_templates(status, audience, format);

-- Owner (or a member of the owning workspace) labels their template. Empty strings clear a facet.
create or replace function public.set_template_facets(p_template uuid, p_audience text, p_event_type text, p_business text, p_style text, p_palette text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.design_templates t where t.id = p_template
      and (t.owner_id = (select auth.uid()) or (t.workspace_id is not null and public.is_workspace_member(t.workspace_id)))) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.design_templates set
    audience = case when p_audience in ('organiser','provider','both') then p_audience else audience end,
    event_type = left(coalesce(p_event_type, ''), 40), business_type = left(coalesce(p_business, ''), 40),
    style = left(coalesce(p_style, ''), 40), palette = left(coalesce(p_palette, ''), 40)
  where id = p_template;
end $$;
revoke all on function public.set_template_facets(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.set_template_facets(uuid, text, text, text, text, text) to authenticated, service_role;
commit;
