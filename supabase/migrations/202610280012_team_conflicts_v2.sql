-- Team conflict engine v2 (§85). Same signature and result shape as 202610210001; adds:
--  * unavailability recorded as shifts (status 'unavailable' / 'travel') now conflicts with overlapping work shifts,
--    in addition to availability_blocks;
--  * 'unconfirmed': assigned shifts still in draft (role not confirmed yet);
--  * non-work rows (unavailable / travel / cancelled) are no longer treated as work in overlap, travel, unfilled and qualification checks.
create or replace function public.team_conflicts(p_workspace uuid, p_from timestamptz default now(), p_to timestamptz default now() + interval '60 days')
returns table(kind text, severity text, shift_id uuid, other_id uuid, crew_id uuid, event_id uuid, message text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_workspace_role(p_workspace, array['owner','manager','member','finance']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
  -- Overlapping work shifts for the same person.
  select 'overlap', 'blocker', a.id, b.id, a.crew_id, a.event_id, coalesce(c.name, 'Crew member') || ' is double-booked: ' || a.title || ' and ' || b.title
    from public.shifts a join public.shifts b on b.crew_id = a.crew_id and b.id > a.id and tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)
    left join public.crew_members c on c.id = a.crew_id
    where a.workspace_id = p_workspace and a.crew_id is not null and a.status in ('confirmed','pending','draft') and b.status in ('confirmed','pending','draft')
      and a.starts_at < p_to and a.ends_at > p_from
  union all
  -- Travel-time impossibility: back-to-back work shifts at different locations with under 60 minutes between.
  select 'travel', 'warning', a.id, b.id, a.crew_id, a.event_id, coalesce(c.name, 'Crew member') || ' has ' || greatest(0, round(extract(epoch from (b.starts_at - a.ends_at)) / 60))::int || ' min to get from ' || coalesce(nullif(a.location, ''), a.title) || ' to ' || coalesce(nullif(b.location, ''), b.title)
    from public.shifts a join public.shifts b on b.crew_id = a.crew_id and b.id <> a.id and b.starts_at >= a.ends_at and b.starts_at < a.ends_at + interval '60 minutes'
    left join public.crew_members c on c.id = a.crew_id
    where a.workspace_id = p_workspace and a.crew_id is not null and a.status in ('confirmed','pending','draft') and b.status in ('confirmed','pending','draft')
      and coalesce(a.location, '') <> coalesce(b.location, '') and a.starts_at < p_to and a.ends_at > p_from
  union all
  -- Unavailable staff: availability blocks on the crew member.
  select 'unavailable', 'blocker', s.id, ab.id, s.crew_id, s.event_id, coalesce(c.name, 'Crew member') || ' is unavailable (' || ab.kind || ') during ' || s.title
    from public.shifts s join public.availability_blocks ab on ab.crew_id = s.crew_id and ab.kind in ('blocked','maintenance') and tstzrange(ab.starts_at, ab.ends_at) && tstzrange(s.starts_at, s.ends_at)
    left join public.crew_members c on c.id = s.crew_id
    where s.workspace_id = p_workspace and s.status in ('confirmed','pending','draft') and s.starts_at < p_to and s.ends_at > p_from
  union all
  -- Unavailable staff: unavailability / travel entered on the schedule as a shift row.
  select 'unavailable', 'blocker', s.id, u.id, s.crew_id, s.event_id, coalesce(c.name, 'Crew member') || ' is ' || case when u.status = 'travel' then 'travelling' else 'marked unavailable' end || ' during ' || s.title
    from public.shifts s join public.shifts u on u.crew_id = s.crew_id and u.id <> s.id and u.status in ('unavailable','travel') and tstzrange(u.starts_at, u.ends_at) && tstzrange(s.starts_at, s.ends_at)
    left join public.crew_members c on c.id = s.crew_id
    where s.workspace_id = p_workspace and s.crew_id is not null and s.status in ('confirmed','pending','draft') and s.starts_at < p_to and s.ends_at > p_from
  union all
  -- Insufficient staffing: unassigned work shifts.
  select 'unfilled', case when s.starts_at < now() + interval '3 days' then 'blocker' else 'warning' end, s.id, null::uuid, null::uuid, s.event_id,
         coalesce(nullif(s.role, ''), 'A role') || ' needed for ' || coalesce(ev.name, s.title) || ' (' || to_char(s.starts_at at time zone 'Europe/London', 'FMDD Mon HH24:MI') || '): no one assigned'
    from public.shifts s left join public.events ev on ev.id = s.event_id where s.workspace_id = p_workspace and s.crew_id is null and s.status not in ('cancelled','unavailable','travel') and s.starts_at < p_to and s.ends_at > p_from
  union all
  -- Assigned but not confirmed: the shift is still a draft (never sent / accepted).
  select 'unconfirmed', 'warning', s.id, null::uuid, s.crew_id, s.event_id, coalesce(c.name, 'Crew member') || '’s ' || coalesce(nullif(s.role, ''), 'shift') || ' shift for ' || s.title || ' isn’t confirmed yet'
    from public.shifts s left join public.crew_members c on c.id = s.crew_id
    where s.workspace_id = p_workspace and s.crew_id is not null and s.status = 'draft' and s.starts_at < p_to and s.ends_at > p_from
  union all
  -- Role qualification: crew skills must include the shift role when the role is a regulated one.
  select 'qualification', 'warning', s.id, null::uuid, s.crew_id, s.event_id, coalesce(c.name, 'Crew member') || ' isn’t listed as qualified for ' || s.role
    from public.shifts s join public.crew_members c on c.id = s.crew_id
    where s.workspace_id = p_workspace and s.status in ('confirmed','pending','draft') and s.starts_at < p_to and s.ends_at > p_from and s.role ~* '(security|first aid|medic|bar|driver|rigg|electric)'
      and not exists (select 1 from unnest(coalesce(c.skills, '{}')) k where lower(k) like '%' || lower(split_part(s.role, ' ', 1)) || '%') and lower(coalesce(c.role, '')) not like '%' || lower(split_part(s.role, ' ', 1)) || '%'
  union all
  -- Missing critical role: events over 100 guests with no first aid cover.
  select 'missing_role', 'warning', null::uuid, null::uuid, null::uuid, e.id, e.name || ' (' || e.guest_count || ' guests) has no first-aid cover planned'
    from public.events e where e.workspace_id = p_workspace and e.starts_at between p_from and p_to and coalesce(e.guest_count, 0) > 100
      and not exists (select 1 from public.shifts s where s.event_id = e.id and s.role ~* '(first aid|medic)' and s.status not in ('cancelled','unavailable','travel'))
      and not exists (select 1 from public.build_items b where b.event_id = e.id and b.status in ('confirmed','held') and b.title ~* '(first aid|medic|ambulance)');
end $$;

revoke all on function public.team_conflicts(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.team_conflicts(uuid, timestamptz, timestamptz) to authenticated, service_role;
