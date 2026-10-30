// Q20 / Q22: ticketing depth on Sunset Sessions (nightlife, on sale): presale tier behind an access code, a final release that
// opens when GA sells out, an accessible allocation with its own access code, a public discount code, per-customer limits,
// the high-demand waiting room switched on, and one OPEN risk flag for review. Plus per-customer limits on Neon Nights.
// Tier / code / allocation rows are organiser configuration written like the ticket setup UI writes them (table writes under the
// ticket_tiers guards: ticketing mode, dependency, release chain). The risk flag is detector output (historical) — direct insert.
// Capacity stays at the event's 1,500: GA 1,200 → 1,000 to make room for 100 presale + 100 final release.
import { block } from "./lib.mjs";

export async function run() {
  return block(`
  v := pg_temp._ev('sunset-sessions');
  if v is not null then
    v2 := (select id from public.ticket_tiers where event_id = v and name = 'General Admission');
    update public.ticket_tiers set quantity = 1000, per_customer_limit = 6, order_limit = 6 where id = v2 and quantity = 1200 and sold <= 1000;
    get diagnostics n = row_count; perform pg_temp._n('tiers_updated', n);
    update public.ticket_tiers set per_customer_limit = 4, order_limit = 4 where event_id = v and name = 'VIP Experience' and per_customer_limit is distinct from 4;
    if not exists (select 1 from public.ticket_tiers where event_id = v and release_kind = 'presale') then
      insert into public.ticket_tiers(event_id, name, description, kind, price, quantity, sold, status, sale_start, sale_end, release_kind, release_name, access_code_required, per_customer_limit, order_limit, sort)
        values (v, 'Presale (mailing list)', 'Members-only presale. Use the code from your invitation email.', 'early', 16, 100, 0, 'on_sale',
                now() - interval '10 days', now() + interval '5 days', 'presale', 'Presale', true, 2, 2, 0);
      perform pg_temp._n('tiers');
    end if;
    if not exists (select 1 from public.ticket_tiers where event_id = v and release_kind = 'final') then
      insert into public.ticket_tiers(event_id, name, description, kind, price, quantity, status, release_kind, release_name, after_tier, per_customer_limit, order_limit, sort)
        values (v, 'Final release', 'Opens automatically when General Admission sells out.', 'general', 28, 100, 'scheduled', 'final', 'Final release', v2, 4, 4, 9);
      perform pg_temp._n('tiers');
    end if;
    if not exists (select 1 from public.discount_codes where event_id = v and code = 'SUNSETPRE') then
      insert into public.discount_codes(event_id, code, kind, amount, valid_from, valid_until, max_uses, status, purpose, per_customer_limit, stackable, tier_ids)
        values (v, 'SUNSETPRE', 'percent', 0, now() - interval '10 days', now() + interval '5 days', 300, 'active', 'access', 1, false,
                array[(select id from public.ticket_tiers where event_id = v and release_kind = 'presale')]);
      perform pg_temp._n('access_codes');
    end if;
    if not exists (select 1 from public.ticket_allocations where event_id = v and kind = 'accessible') then
      insert into public.ticket_allocations(event_id, tier_id, kind, label, quantity, status)
        values (v, v2, 'accessible', 'Accessible viewing platform (+1 free companion)', 40, 'active');
      perform pg_temp._n('allocations');
    end if;
    if not exists (select 1 from public.discount_codes where event_id = v and code = 'ACCESS-SUNSET') then
      insert into public.discount_codes(event_id, code, kind, amount, max_uses, status, purpose, per_customer_limit, stackable, tier_ids, allocation_id)
        values (v, 'ACCESS-SUNSET', 'percent', 0, 40, 'active', 'access', 2, false, array[v2],
                (select id from public.ticket_allocations where event_id = v and kind = 'accessible' limit 1));
      perform pg_temp._n('access_codes');
    end if;
    if not exists (select 1 from public.discount_codes where event_id = v and code = 'SUNSET10') then
      insert into public.discount_codes(event_id, code, kind, amount, valid_from, valid_until, max_uses, status, purpose, per_customer_limit, stackable)
        values (v, 'SUNSET10', 'percent', 10, now() - interval '3 days', now() + interval '30 days', 200, 'active', 'discount', 1, false);
      perform pg_temp._n('discount_codes');
    end if;
    if not (coalesce((select settings -> 'launch' -> 'waiting_room' ->> 'enabled' from public.events where id = v), 'false') = 'true') then
      update public.events set settings = coalesce(settings, '{}') || jsonb_build_object('launch', jsonb_build_object(
          'at', to_char((now() - interval '30 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'presale_at', to_char((now() - interval '32 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'waiting_room', jsonb_build_object('enabled', true, 'rate_per_minute', 120, 'admit_minutes', 10)))
        where id = v;
      perform pg_temp._n('waiting_room');
    end if;
    if not exists (select 1 from public.ticket_risk_flags where event_id = v and status = 'open') then
      insert into public.ticket_risk_flags(event_id, order_ref, kind, severity, detail, status, window_start, expires_at)
        values (v, 'GD-DEMO-RISK-0142', 'order_velocity', 'review',
          jsonb_build_object('orders', 7, 'window_minutes', 10, 'tickets', 38, 'distinct_cards', 4, 'note', 'Seven orders from one device in ten minutes (demo flag)'),
          'open', now() - interval '2 hours', now() + interval '5 days');
      perform pg_temp._n('risk_flags');
    end if;
  end if;
  v := pg_temp._ev('neon-nights');
  update public.ticket_tiers set per_customer_limit = 8 where event_id = v and status = 'on_sale' and per_customer_limit is null;
  get diagnostics n = row_count; perform pg_temp._n('neon_limits', n);
  -- Feasibility fix (read model said tickets_over_capacity): unsold allocation trimmed so the tiers fit the approved capacity.
  -- Neon Nights 2,460 → 2,000 (sold counts untouched); Comedy Central Live 864 → 600 (Standard 600 → 336 next to the 264 seats).
  update public.ticket_tiers t set quantity = x.q from (values ('Early Bird', 440), ('General Admission', 850), ('Group (4+)', 150), ('Accessible Ticket', 60), ('Backstage Pass', 40)) x(n, q)
    where t.event_id = v and t.name = x.n and t.quantity > x.q and t.sold + t.held <= x.q
      and (select sum(quantity) from public.ticket_tiers where event_id = v) > (select capacity from public.events where id = v);
  get diagnostics n = row_count; perform pg_temp._n('capacity_fixed', n);
  update public.ticket_tiers set quantity = 336 where event_id = pg_temp._ev('comedy-central-live') and name = 'Standard' and quantity = 600 and sold + held <= 336;
  get diagnostics n = row_count; perform pg_temp._n('capacity_fixed', n);
  `);
}
