-- Definer-function grant audit (follow-up to the storage_usage fix). Supabase's default privileges grant EXECUTE on new public functions
-- to authenticated, so `revoke … from public, anon` alone is not enough for internal helpers.

-- deletion_blockers(p_user): users may only ask about themselves (or support admins about anyone); service role unrestricted.
create or replace function public.deletion_blockers(p_user uuid default null) returns table (code text, detail text)
language plpgsql stable security definer set search_path = '' as $$
declare target uuid := coalesce(p_user, auth.uid());
begin
  if auth.uid() is not null and target <> auth.uid() and not public.has_admin_permission('support') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select 'workspace_owner'::text, ('You own “' || w.name || '”, which has other active members. Transfer ownership or remove them first.')::text
    from public.workspaces w where w.owner_id = target and w.status = 'active'
      and exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id <> target and m.status = 'active')
  union all
  select 'open_dispute', 'A booking dispute (' || d.reference || ') is still open.' from public.booking_disputes d
    where d.status not in ('resolved','closed') and d.opened_by = target
  union all
  select 'upcoming_tickets', count(*)::text || ' ticket(s) for upcoming events would be cancelled. Transfer them or wait until the events have passed.'
    from public.tickets t join public.events e on e.id = t.event_id where t.holder_id = target and t.status = 'valid' and e.starts_at > now() having count(*) > 0
  union all
  select 'platform_admin', 'Platform administrator accounts are deleted by another administrator.' from public.platform_admins p where p.user_id = target;
end $$;
revoke all on function public.deletion_blockers(uuid) from public, anon;
grant execute on function public.deletion_blockers(uuid) to authenticated, service_role;

-- Internal helpers: service role / other definer functions only.
revoke execute on function public.storage_owner_of(text, text, uuid) from authenticated;
revoke execute on function public.queue_admit_check(uuid, text, boolean) from authenticated;
revoke execute on function public.entitlement(uuid, text) from authenticated;
revoke execute on function public.has_capability(uuid, text) from authenticated;
grant execute on function public.storage_owner_of(text, text, uuid), public.queue_admit_check(uuid, text, boolean), public.entitlement(uuid, text), public.has_capability(uuid, text) to service_role;
