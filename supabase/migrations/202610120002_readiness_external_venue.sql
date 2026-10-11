-- Readiness: a venue confirmed outside the marketplace counts when the organizer records it
-- (events.settings.venue_confirmed = true, set only via the event's venue section with audit).
begin;
create or replace function public.event_readiness(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.events; checks jsonb := '[]'; done int := 0; total int := 0; c record;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode='42501'; end if;
  for c in select * from (values
    ('details','Event details & date', e.starts_at is not null and length(e.name) > 0, 'high'),
    ('venue','Venue confirmed', exists(select 1 from public.build_items b where b.event_id=p_event and b.category='venue' and b.status in ('confirmed','fulfilled')) or coalesce((e.settings->>'venue_confirmed')::boolean, false), 'critical'),
    ('providers','Key providers confirmed', (select count(*) from public.build_items b where b.event_id=p_event and b.status in ('confirmed','fulfilled') and b.role='primary') >= greatest(1,(select count(distinct category) from public.build_items b where b.event_id=p_event and b.role='primary' and b.status not in ('cancelled','declined','suggested'))), 'high'),
    ('guests','Guests or tickets set up', exists(select 1 from public.guests g where g.event_id=p_event) or exists(select 1 from public.ticket_tiers t where t.event_id=p_event), 'medium'),
    ('payments','No overdue payments', not exists(select 1 from public.payments p where p.event_id=p_event and p.status='overdue'), 'high'),
    ('tasks','Critical tasks complete', not exists(select 1 from public.tasks t where t.event_id=p_event and t.priority in ('high','critical') and t.status<>'done' and t.due_at < now()), 'medium')
  ) as v(key,label,ok,severity) loop
    total := total + 1; if c.ok then done := done + 1; end if;
    checks := checks || jsonb_build_object('key',c.key,'label',c.label,'ok',c.ok,'severity',c.severity);
  end loop;
  return jsonb_build_object('score', round(100.0*done/greatest(total,1)), 'checks', checks);
end; $$;
commit;
