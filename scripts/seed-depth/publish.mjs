// W11 / Q38: moves the new representative events through the REAL lifecycle command (event_transition as the organiser), so
// every precondition (date, venue, stream, capacity, programme, tickets, payouts, ticketing mode, ops/compliance, map,
// composition) is checked exactly as in the product. Anything still blocked is reported, never forced.
// Only the past "Halloween Rave 2025" is historical: it goes straight to completed via service_set_event_status (explicit,
// audited lifecycle override; reason recorded in event_lifecycle_overrides). Its tiers are closed (paused) with no sales rows:
// paid history waits for the Stripe test onboarding (Q07), so no orders/tickets/ledger rows are fabricated.
import { block } from "./lib.mjs";

const OWNER = "alex.events@example.com";

const TIERS = {
  "hope-starts-here-charity-ball": [["Individual dinner ticket", "general", 150, 200, 4], ["Table of ten", "group", 1500, 16, 1]],
  "warehouse-sessions-bassline": [["Early entry (before 23:30)", "early", 15, 300, 6], ["General admission", "general", 22, 800, 6], ["VIP mezzanine", "vip", 40, 100, 4]],
  "soho-late-lounge-fridays": [["Guest list (before 23:00)", "general", 0, 80, 2], ["Entry", "general", 12, 180, 6], ["Booth for six", "vip", 240, 4, 1]],
};
const PROGRAMME = {
  "warehouse-sessions-bassline": [[0, 120, "Doors + warm-up: Kayla Rae"], [120, 120, "Main room: DJ Pivot b2b Saffron"], [240, 120, "Closing: Bassline Collective"]],
  "soho-late-lounge-fridays": [[0, 150, "Residents: Lou Marsh"], [150, 150, "Guest: Midnight Soul Society"]],
  "hope-starts-here-charity-ball": [[0, 60, "Champagne reception"], [60, 90, "Three-course dinner"], [150, 45, "Live auction"], [195, 105, "String quartet and dancing"]],
};

export async function run() {
  const tiers = Object.entries(TIERS).map(([slug, ts]) => `
  v := pg_temp._ev('${slug}');
  if v is not null and not exists (select 1 from public.ticket_tiers where event_id = v) then
    insert into public.ticket_tiers(event_id, name, kind, price, quantity, status, sale_start, sale_end, order_limit, per_customer_limit, sort)
      values ${ts.map(([n, k, p, q, lim], i) => `(v, '${n}', '${k}', ${p}, ${q}, 'on_sale', now() - interval '1 day', (select starts_at from public.events where id = v), ${lim}, ${lim}, ${i + 1})`).join(", ")};
    perform pg_temp._n('tiers', ${ts.length});
  end if;`).join("");
  const programme = Object.entries(PROGRAMME).map(([slug, ps]) => `
  v := pg_temp._ev('${slug}');
  if v is not null and not exists (select 1 from public.programme_items where event_id = v) then
    insert into public.programme_items(event_id, starts_at, duration_minutes, title, kind)
      select v, e.starts_at + make_interval(mins => x.o), x.d, x.t, 'programme' from public.events e, (values ${ps.map(([o, d, t]) => `(${o}, ${d}, '${t.replace(/'/g, "''")}')`).join(", ")}) x(o, d, t) where e.id = v;
    perform pg_temp._n('programme_items', ${ps.length});
  end if;`).join("");
  return block(`
  ${tiers}
  ${programme}
  perform pg_temp._as('${OWNER}');
  for t in select unnest(array['future-of-live-events-webinar','hope-starts-here-charity-ball','warehouse-sessions-bassline','soho-late-lounge-fridays']) loop
    v := pg_temp._ev(t);
    continue when v is null or (select status from public.events where id = v) in ('on_sale', 'live', 'completed');
    if (select status from public.events where id = v) = 'draft' then
      r := public.event_transition(v, 'published', 'draft', 'Q38 demo: ready to publish');
      if not coalesce((r->>'ok')::boolean, false) then perform pg_temp._n('blocked_publish:' || t || ':' || coalesce((select string_agg(x->>'key', '+') from jsonb_array_elements(r->'blockers') x), r::text)); continue; end if;
      perform pg_temp._n('published');
    end if;
    r := public.event_transition(v, 'on_sale', 'published', 'Q38 demo: tickets live');
    if not coalesce((r->>'ok')::boolean, false) then perform pg_temp._n('blocked_on_sale:' || t || ':' || coalesce((select string_agg(x->>'key', '+') from jsonb_array_elements(r->'blockers') x), r::text)); continue; end if;
    perform pg_temp._n('on_sale');
  end loop;
  -- customer's children's party: draft → planning (private; invite-only)
  perform pg_temp._as('alex.thompson@example.com');
  v := pg_temp._ev('little-explorers-6th');
  if v is not null and (select status from public.events where id = v) = 'draft' then
    r := public.event_transition(v, 'planning', 'draft', 'Planning started'); perform pg_temp._n('planning');
  end if;
  -- historical: last year's Halloween rave, completed and sold out
  perform pg_temp._as(null);
  v := pg_temp._ev('halloween-rave-2025');
  if v is not null and (select status from public.events where id = v) = 'draft' then
    insert into public.ticket_tiers(event_id, name, kind, price, quantity, sold, status, sale_start, sale_end, order_limit, sort)
      select v, x.n, x.k, x.p, x.q, 0, 'paused', e.starts_at - interval '45 days', e.starts_at, 6, x.s
      from public.events e, (values ('Early bird', 'early', 12, 400, 1), ('General admission', 'general', 20, 1000, 2), ('Last entry', 'general', 25, 100, 3)) x(n, k, p, q, s)
      where e.id = v and not exists (select 1 from public.ticket_tiers t where t.event_id = v);
    update public.events set settings = settings || '{"ticketed": true}' where id = v;
    perform public.service_set_event_status(v, 'published', 'Q38 depth seed: historical demo event (Halloween Rave 2025, held last year)');
    perform public.service_set_event_status(v, 'completed', 'Q38 depth seed: historical demo event (Halloween Rave 2025, held last year)');
    perform pg_temp._n('historical_completed');
  end if;
  `);
}
