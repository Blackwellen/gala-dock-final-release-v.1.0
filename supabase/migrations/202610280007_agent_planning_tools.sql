-- Gala Agent planning tools: venues.rank, event.break_even, seating.suggest. All R0 (read/compute only). They extend agent_invoke_ext,
-- which agent_invoke reaches after it has become the human and checked membership + tool permission.
begin;

-- Explainable venue ranking for one event: capacity fit, city, price against budget, rating, responsiveness. 0–100 with reasons.
create or replace function public.rank_venues_for_event(p_event uuid, p_limit int default 8) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.events; out jsonb;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_found' using errcode = 'P0002'; end if;
  with c as (
    select l.*, coalesce(e.guest_count, 0) g,
      -- capacity: 40 pts. Fits and isn't more than twice the size needed → full marks; too small → 0.
      case when coalesce(e.guest_count, 0) = 0 or l.capacity_max is null then 20
           when l.capacity_max < e.guest_count then 0
           when coalesce(l.capacity_min, 0) > e.guest_count then 10
           when l.capacity_max <= e.guest_count * 2 then 40 else 28 end s_cap,
      -- city: 20 pts
      case when e.city is null or e.city = '' then 10 when l.city ilike e.city then 20 else 0 end s_city,
      -- price: 20 pts. Venue at or under 40% of the event budget → full marks, scaled down to 0 at 100%.
      case when coalesce(e.budget_total, 0) = 0 or l.price_from is null then 10
           when l.price_from <= e.budget_total * 0.4 then 20
           when l.price_from >= e.budget_total then 0
           else round(20 * (e.budget_total - l.price_from) / (e.budget_total * 0.6))::int end s_price,
      -- rating: 15 pts (needs at least one review)
      case when coalesce(l.review_count, 0) = 0 then 7 else round(least(coalesce(l.rating, 0), 5) * 3)::int end s_rating,
      -- responsiveness: 5 pts
      case when l.response_hours is null then 2 when l.response_hours <= 4 then 5 when l.response_hours <= 24 then 3 else 1 end s_resp
    from public.listings l
    where l.kind = 'venue' and l.published and l.paused_at is null
  )
  select coalesce(jsonb_agg(r order by (r->>'score')::int desc), '[]') into out from (
    select jsonb_build_object('listing_id', c.id, 'name', c.name, 'city', c.city, 'capacity', jsonb_build_object('min', c.capacity_min, 'max', c.capacity_max),
      'price_from', c.price_from, 'rating', c.rating, 'reviews', c.review_count,
      'score', c.s_cap + c.s_city + c.s_price + c.s_rating + c.s_resp,
      'reasons', jsonb_strip_nulls(jsonb_build_object(
        'capacity', case when c.g = 0 then 'Guest count not set' when c.capacity_max is null then 'Capacity not listed'
                         when c.capacity_max < c.g then 'Too small for ' || c.g || ' guests' when coalesce(c.capacity_min, 0) > c.g then 'Minimum is ' || c.capacity_min || ' guests'
                         when c.capacity_max <= c.g * 2 then 'Good fit for ' || c.g || ' guests' else 'Larger than needed' end,
        'city', case when e.city is null or e.city = '' then null when c.city ilike e.city then 'In ' || e.city else 'Outside ' || e.city end,
        'price', case when coalesce(e.budget_total, 0) = 0 or c.price_from is null then null
                      else 'From ' || c.price_from || ' (' || round(100 * c.price_from / e.budget_total) || '% of budget)' end)),
      'link', '/marketplace/' || coalesce(c.slug, c.id::text)) r
    from c order by c.s_cap + c.s_city + c.s_price + c.s_rating + c.s_resp desc, c.rating desc nulls last limit greatest(1, least(coalesce(p_limit, 8), 20))) x;
  return jsonb_build_object('event', e.name, 'guests', e.guest_count, 'city', e.city, 'budget', e.budget_total, 'venues', out,
    'method', 'Capacity 40 · city 20 · price vs budget 20 · rating 15 · response time 5');
end $$;

-- Break-even: committed + pending supplier costs (plus optional extra fixed costs) against average net ticket price.
create or replace function public.event_break_even(p_event uuid, p_extra_costs numeric default 0, p_fee_pct numeric default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.events; committed numeric; pending numeric; costs numeric; avg_price numeric; v_cap int; v_sold int; v_rev numeric; fee numeric; net numeric; be int; tgt int;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_see_event_money(p_event) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select coalesce(sum(amount) filter (where status in ('confirmed','held','conditionally_held','awaiting_payment','awaiting_confirmation','active','completion_pending','completed','fulfilled','standby_accepted')), 0),
         coalesce(sum(amount) filter (where status in ('suggested','draft','sent','awaiting','awaiting_provider','available','quoted','quote_received','quote_revised','customer_reviewing','clarification','clarification_requested','conditional_hold_requested','enquiry_created')), 0)
    into committed, pending from public.build_items where event_id = p_event and role = 'primary';
  costs := committed + pending + greatest(coalesce(p_extra_costs, 0), 0);
  select case when sum(quantity) filter (where price > 0) > 0 then sum(price * quantity) filter (where price > 0) / sum(quantity) filter (where price > 0) end,
         coalesce(sum(quantity), 0), coalesce(sum(sold), 0), coalesce(sum(sold * price), 0)
    into avg_price, v_cap, v_sold, v_rev from public.ticket_tiers where event_id = p_event and status <> 'cancelled';
  fee := greatest(least(coalesce(p_fee_pct, 0), 50), 0) / 100;
  net := avg_price * (1 - fee);
  if net is not null and net > 0 then
    be := ceil(round(costs / net, 6));   -- round first: 9000 / 83.333… must be 108, not 109
    tgt := ceil(round((costs + greatest(coalesce(e.target_profit, 0), 0)) / net, 6));
  end if;
  return jsonb_build_object('event', e.name, 'currency', coalesce(e.currency, 'GBP'),
    'costs', jsonb_build_object('committed', committed, 'pending', pending, 'extra', greatest(coalesce(p_extra_costs, 0), 0), 'total', costs),
    'tickets', jsonb_build_object('average_price', round(avg_price, 2), 'average_net_price', round(net, 2), 'capacity', v_cap, 'sold', v_sold, 'revenue', v_rev),
    'break_even_tickets', be,
    'tickets_for_target_profit', case when coalesce(e.target_profit, 0) > 0 then tgt end,
    'remaining_to_break_even', case when be is not null then greatest(be - v_sold, 0) end,
    'achievable', case when be is null then null else be <= v_cap end,
    'note', case when avg_price is null then 'Add a paid ticket tier to calculate break-even.'
                 when be > v_cap then 'Break-even needs more tickets than are on sale: raise prices, add capacity or cut costs.'
                 when v_sold >= be then 'Already past break-even on tickets sold.'
                 else (be - v_sold) || ' more tickets to break even.' end,
    'link', '/organizer/events/' || p_event || '?tab=money');
end $$;

-- Seating suggestion: confirmed/pending guests (plus-ones count as a seat) packed into tables, keeping groups together where they fit.
-- First-fit decreasing; a group bigger than one table is split across consecutive tables. Read-only — nothing is saved.
create or replace function public.suggest_seating(p_event uuid, p_table_size int default 10, p_include_pending boolean default true) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.events; size int := greatest(2, least(coalesce(p_table_size, 10), 30)); grp record; g record;
  tables jsonb := '[]'; free int[] := '{}'; i int; placed boolean; seats int; total int := 0; n int;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_found' using errcode = 'P0002'; end if;
  for grp in
    select coalesce(nullif(trim(group_name), ''), 'guest:' || id) k, nullif(trim(group_name), '') label,
           sum(1 + case when plus_one then 1 else 0 end)::int seats,
           jsonb_agg(jsonb_build_object('name', name, 'plus_one', plus_one, 'dietary', nullif(dietary, '')) order by name) people
    from public.guests where event_id = p_event and (status = 'confirmed' or (p_include_pending and status in ('pending','invited')))
    group by 1, 2 order by 3 desc, 1
  loop
    total := total + grp.seats; placed := false;
    if grp.seats <= size then
      for i in 1 .. coalesce(array_length(free, 1), 0) loop
        if free[i] >= grp.seats then
          tables := jsonb_set(tables, array[(i - 1)::text, 'guests'], (tables->(i - 1)->'guests') || grp.people);
          if grp.label is not null then tables := jsonb_set(tables, array[(i - 1)::text, 'groups'], (tables->(i - 1)->'groups') || to_jsonb(grp.label)); end if;
          free[i] := free[i] - grp.seats; placed := true; exit;
        end if;
      end loop;
    end if;
    if not placed then
      -- New table(s); a large group fills whole tables, its remainder starts one more.
      seats := grp.seats; n := 0;
      for g in select value v, ordinality o from jsonb_array_elements(grp.people) with ordinality loop
        if n = 0 or (n + 1 + case when (g.v->>'plus_one')::boolean then 1 else 0 end) > size then
          tables := tables || jsonb_build_array(jsonb_build_object('guests', '[]'::jsonb, 'groups', case when grp.label is null then '[]'::jsonb else jsonb_build_array(grp.label) end));
          free := free || size; n := 0;
        end if;
        i := jsonb_array_length(tables) - 1;
        tables := jsonb_set(tables, array[i::text, 'guests'], (tables->i->'guests') || jsonb_build_array(g.v));
        n := n + 1 + case when (g.v->>'plus_one')::boolean then 1 else 0 end;
        free[i + 1] := size - n;
      end loop;
    end if;
  end loop;
  return jsonb_build_object('event', e.name, 'table_size', size, 'seats_needed', total, 'tables_needed', jsonb_array_length(tables),
    'tables', (select coalesce(jsonb_agg(jsonb_build_object('table', o, 'seats_used', size - free[o::int], 'groups', t->'groups', 'guests', t->'guests',
        'dietary', (select coalesce(jsonb_agg(distinct x->>'dietary'), '[]') from jsonb_array_elements(t->'guests') x where x->>'dietary' is not null)) order by o), '[]')
      from jsonb_array_elements(tables) with ordinality as a(t, o)),
    'note', 'Suggestion only — nothing is saved. Groups stay together where they fit at one table.',
    'link', '/organizer/events/' || p_event || '?tab=guests');
end $$;

revoke all on function public.rank_venues_for_event(uuid, int), public.event_break_even(uuid, numeric, numeric), public.suggest_seating(uuid, int, boolean) from public, anon;
grant execute on function public.rank_venues_for_event(uuid, int), public.event_break_even(uuid, numeric, numeric), public.suggest_seating(uuid, int, boolean) to authenticated, service_role;

create or replace function public.agent_invoke_ext(p_workspace uuid, p_tool text, p_args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare out jsonb; v uuid;
begin
  -- Event-scoped tools: the event must belong to the workspace the agent is acting in.
  if p_tool in ('media.event_poster', 'venues.rank', 'event.break_even', 'seating.suggest')
     and not exists (select 1 from public.events e where e.id = (p_args->>'event_id')::uuid and e.workspace_id = p_workspace) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  case p_tool
  when 'media.list_designs' then
    select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'status', d.status, 'source', d.source, 'updated_at', d.updated_at, 'link', '/studio/' || d.id) order by d.updated_at desc), '[]') into out
      from (select * from public.designs x where x.workspace_id = p_workspace and x.deleted_at is null
              and (p_args->>'event_id' is null or x.event_id = (p_args->>'event_id')::uuid) order by x.updated_at desc limit 30) d;
  when 'media.event_poster' then
    v := public.create_design(p_workspace, (p_args->>'event_id')::uuid, coalesce(p_args->>'title', 'Agent draft poster'), p_args->'document', 'agent', null, null);
    out := jsonb_build_object('design_id', v, 'status', 'draft', 'link', '/studio/' || v);
  when 'venues.rank' then out := public.rank_venues_for_event((p_args->>'event_id')::uuid, coalesce((p_args->>'limit')::int, 8));
  when 'event.break_even' then out := public.event_break_even((p_args->>'event_id')::uuid, coalesce((p_args->>'extra_costs')::numeric, 0), nullif(p_args->>'fee_pct', '')::numeric);
  when 'seating.suggest' then out := public.suggest_seating((p_args->>'event_id')::uuid, coalesce((p_args->>'table_size')::int, 10), coalesce((p_args->>'include_pending')::boolean, true));
  else raise exception 'tool_not_executable:%', p_tool using errcode = '22023';
  end case;
  return out;
end $$;
revoke all on function public.agent_invoke_ext(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.agent_invoke_ext(uuid, text, jsonb) to service_role;

commit;
