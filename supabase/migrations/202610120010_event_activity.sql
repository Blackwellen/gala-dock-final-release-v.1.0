-- Event activity feed: audit events tagged with metadata.event_id, readable by anyone who can access the event.
begin;
create index if not exists audit_events_event_idx on public.audit_events ((metadata->>'event_id'), created_at desc);
create or replace function public.event_activity(p_event uuid, p_limit integer default 20)
returns table(id bigint, event text, text text, actor text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode='42501'; end if;
  return query select a.id, a.event, coalesce(a.metadata->>'text', a.event), coalesce(p.full_name, ''), a.created_at
    from public.audit_events a left join public.profiles p on p.id = a.actor_id
    where a.metadata->>'event_id' = p_event::text order by a.created_at desc limit least(greatest(p_limit, 1), 100);
end; $$;
revoke execute on function public.event_activity(uuid, integer) from public, anon;
grant execute on function public.event_activity(uuid, integer) to authenticated;
commit;
