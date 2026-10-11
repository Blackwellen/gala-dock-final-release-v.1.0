-- Public organiser profile (/organizers/[id]): safe fields only, and only for workspaces with public events.
create or replace function public.public_workspace(p_workspace uuid)
returns table(id uuid, name text, cover_image text, verified boolean, created_at timestamptz, events_count bigint, upcoming bigint)
language sql stable security definer set search_path = '' as $$
  select w.id, w.name, w.cover_image, w.verification_status = 'verified', w.created_at,
    count(e.id) filter (where e.status in ('published','on_sale','live','completed')),
    count(e.id) filter (where e.status in ('published','on_sale','live') and e.starts_at > now())
  from public.workspaces w join public.events e on e.workspace_id = w.id and e.visibility = 'public'
  where w.id = p_workspace and w.status <> 'suspended'
  group by w.id;
$$;
revoke all on function public.public_workspace(uuid) from public;
grant execute on function public.public_workspace(uuid) to anon, authenticated;
