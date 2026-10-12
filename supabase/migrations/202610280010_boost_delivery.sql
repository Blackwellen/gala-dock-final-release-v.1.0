-- Ad boost delivery and analytics (organizer promotion → public surfaces).
-- promotion_boosts is member/admin-only under RLS; public pages need a narrow, read-only view of what is live right now,
-- and a bounded counter for impressions/clicks. Both are security definer with explicit grants.

create or replace function public.active_boosts(p_placement text, p_city text default null, p_category text default null, p_limit int default 6)
returns table (boost_id uuid, event_id uuid, placement text)
language sql stable security definer set search_path = public as $$
  select b.id, b.event_id, b.placement
    from public.promotion_boosts b
    join public.events e on e.id = b.event_id
   where b.status = 'active' and b.placement = p_placement
     and now() >= coalesce(b.starts_at, now()) and now() < coalesce(b.ends_at, now() + interval '1 second')
     and e.visibility = 'public' and e.status in ('published', 'on_sale', 'live')
     -- Targeting is optional; when set, the visitor's city / category must match one of the targets.
     and (p_city is null or coalesce(jsonb_array_length(b.targeting->'cities'), 0) = 0
          or exists (select 1 from jsonb_array_elements_text(b.targeting->'cities') t(v) where lower(t.v) = lower(p_city)))
     and (p_category is null or coalesce(jsonb_array_length(b.targeting->'categories'), 0) = 0
          or exists (select 1 from jsonb_array_elements_text(b.targeting->'categories') t(v) where lower(t.v) = lower(p_category)))
   order by b.amount_minor desc, b.starts_at
   limit least(greatest(coalesce(p_limit, 6), 1), 12);
$$;

create or replace function public.record_boost_event(p_boost uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('impression', 'click') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  update public.promotion_boosts
     set impressions = impressions + (p_kind = 'impression')::int,
         clicks = clicks + (p_kind = 'click')::int
   where id = p_boost and status = 'active'
     and now() >= coalesce(starts_at, now()) and now() < coalesce(ends_at, now() + interval '1 second');
end $$;

revoke all on function public.active_boosts(text, text, text, int) from public;
revoke all on function public.record_boost_event(uuid, text) from public;
grant execute on function public.active_boosts(text, text, text, int) to anon, authenticated;
grant execute on function public.record_boost_event(uuid, text) to anon, authenticated;
