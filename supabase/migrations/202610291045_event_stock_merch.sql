-- Q40 part 4 (lane A, 2026-10-29): Inventory (253) and Merchandise (254). Additive, backward compatible.
--   * stock_items (consumables, equipment — optionally linked to Q12 provider_equipment —, furniture, bar stock, merchandise)
--     with on_hand / reserved; stock_movements is append-only and is the only way on_hand changes (receive, issue, return,
--     transfer, waste, sale, refund, adjust, count) — row-locked, never negative, idempotent per request id.
--   * merch_items sell stock items; merch_orders (machine merch_order): reserve (stock reserved under lock, 15-min expiry) →
--     paid (service hook for the Q07 payment confirmation; reserved → sold through a 'sale' movement) → collected at the
--     event with a one-time code (hash stored) → full/partial refunds that can restock. Money moves stay in Q07 (hook):
--     nothing here charges or refunds a card.

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  category text not null check (category in ('consumable','equipment','furniture','bar_stock','merchandise')),
  name text not null check (length(btrim(name)) between 2 and 120),
  sku text check (sku is null or sku ~ '^[A-Za-z0-9\-_.]{1,40}$'),
  unit text not null default 'each' check (length(unit) between 1 and 20),
  on_hand integer not null default 0 check (on_hand >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  reorder_level integer check (reorder_level is null or reorder_level >= 0),
  provider_equipment_id uuid references public.provider_equipment(id) on delete set null,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (reserved <= on_hand)
);
create unique index if not exists stock_items_sku on public.stock_items(workspace_id, sku) where sku is not null;
create table if not exists public.stock_movements (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.stock_items(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  kind text not null check (kind in ('receive','issue','return','transfer_out','transfer_in','waste','sale','refund','adjust','count')),
  quantity integer not null check (quantity >= 0),
  delta integer not null default 0,
  on_hand_after integer,
  reason text check (reason is null or length(reason) <= 300),
  ref text, request_id text, actor_id uuid, created_at timestamptz not null default now()
);
create unique index if not exists stock_movements_request on public.stock_movements(item_id, request_id) where request_id is not null;
create index if not exists stock_movements_item on public.stock_movements(item_id, created_at);

create or replace function public.stock_movements_apply() returns trigger
language plpgsql security definer set search_path = '' as $$
declare it public.stock_items;
begin
  if tg_op <> 'INSERT' then raise exception 'stock_movements_append_only' using errcode = '22023'; end if;
  select * into it from public.stock_items where id = new.item_id for update;
  new.delta := case new.kind when 'receive' then new.quantity when 'return' then new.quantity when 'transfer_in' then new.quantity when 'refund' then new.quantity
    when 'issue' then -new.quantity when 'transfer_out' then -new.quantity when 'waste' then -new.quantity when 'sale' then -new.quantity
    when 'count' then new.quantity - it.on_hand else new.delta end;   -- adjust: caller-signed delta; count: absolute stock-take
  if it.on_hand + new.delta < (case when new.kind = 'sale' then it.reserved - new.quantity else it.reserved end) or it.on_hand + new.delta < 0 then
    raise exception 'insufficient_stock' using errcode = '22023';
  end if;
  update public.stock_items set on_hand = on_hand + new.delta, reserved = case when new.kind = 'sale' then greatest(0, reserved - new.quantity) else reserved end, updated_at = now()
   where id = it.id;
  new.on_hand_after := it.on_hand + new.delta;
  return new;
end $$;
drop trigger if exists stock_movements_apply on public.stock_movements;
create trigger stock_movements_apply before insert or update or delete on public.stock_movements for each row execute function public.stock_movements_apply();

create or replace function public.save_stock_item(p_workspace uuid, p_item uuid, p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v uuid;
begin
  if not public.has_permission(p_workspace, 'events.write') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if nullif(p_data->>'event_id', '') is not null and not exists (select 1 from public.events e where e.id = (p_data->>'event_id')::uuid and e.workspace_id = p_workspace) then raise exception 'event_not_in_workspace' using errcode = '22023'; end if;
  if p_item is null then
    insert into public.stock_items(workspace_id, event_id, category, name, sku, unit, reorder_level, provider_equipment_id)
      values (p_workspace, nullif(p_data->>'event_id', '')::uuid, p_data->>'category', btrim(p_data->>'name'), nullif(p_data->>'sku', ''), coalesce(p_data->>'unit', 'each'),
        nullif(p_data->>'reorder_level', '')::int, nullif(p_data->>'provider_equipment_id', '')::uuid) returning id into v;
  else
    update public.stock_items set name = coalesce(btrim(p_data->>'name'), name), reorder_level = coalesce(nullif(p_data->>'reorder_level', '')::int, reorder_level),
      status = coalesce(p_data->>'status', status), updated_at = now() where id = p_item and workspace_id = p_workspace returning id into v;
    if v is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v);
end $$;

create or replace function public.record_stock_movement(p_item uuid, p_kind text, p_quantity integer, p_event uuid default null, p_reason text default null, p_request_id text default null, p_delta integer default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare it public.stock_items; m public.stock_movements;
begin
  select * into it from public.stock_items where id = p_item;
  if not found or not public.has_permission(it.workspace_id, 'events.write') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_kind in ('sale','refund','transfer_in','transfer_out') then raise exception 'use_dedicated_command' using errcode = '22023'; end if;
  if p_event is not null and not exists (select 1 from public.events e where e.id = p_event and e.workspace_id = it.workspace_id) then raise exception 'event_not_in_workspace' using errcode = '22023'; end if;
  if p_request_id is not null then
    select * into m from public.stock_movements where item_id = it.id and request_id = p_request_id;
    if found then return jsonb_build_object('ok', true, 'replayed', true, 'on_hand', m.on_hand_after); end if;
  end if;
  insert into public.stock_movements(item_id, event_id, kind, quantity, delta, reason, request_id, actor_id)
    values (it.id, p_event, p_kind, abs(coalesce(p_quantity, 0)), case when p_kind = 'adjust' then coalesce(p_delta, 0) else 0 end, p_reason, p_request_id, (select auth.uid())) returning * into m;
  return jsonb_build_object('ok', true, 'on_hand', m.on_hand_after, 'delta', m.delta);
end $$;

create or replace function public.transfer_stock(p_from uuid, p_to uuid, p_quantity integer, p_reason text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare a public.stock_items; b public.stock_items; ref text := gen_random_uuid()::text;
begin
  select * into a from public.stock_items where id = least(p_from, p_to) for update;
  select * into b from public.stock_items where id = greatest(p_from, p_to) for update;
  select * into a from public.stock_items where id = p_from; select * into b from public.stock_items where id = p_to;
  if a.id is null or b.id is null or a.workspace_id <> b.workspace_id or a.category <> b.category or not public.has_permission(a.workspace_id, 'events.write') then raise exception 'not_authorized' using errcode = '42501'; end if;
  insert into public.stock_movements(item_id, event_id, kind, quantity, reason, ref, actor_id) values (a.id, a.event_id, 'transfer_out', p_quantity, p_reason, ref, (select auth.uid()));
  insert into public.stock_movements(item_id, event_id, kind, quantity, reason, ref, actor_id) values (b.id, b.event_id, 'transfer_in', p_quantity, p_reason, ref, (select auth.uid()));
  return jsonb_build_object('ok', true, 'ref', ref);
end $$;

create or replace function public.stock_report(p_workspace uuid, p_event uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission(p_workspace, 'events.read') then raise exception 'not_authorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('item_id', i.id, 'name', i.name, 'category', i.category, 'on_hand', i.on_hand, 'reserved', i.reserved,
      'low_stock', i.reorder_level is not null and i.on_hand <= i.reorder_level,
      'issued', (select coalesce(sum(m.quantity), 0) from public.stock_movements m where m.item_id = i.id and m.kind = 'issue' and (p_event is null or m.event_id = p_event)),
      'returned', (select coalesce(sum(m.quantity), 0) from public.stock_movements m where m.item_id = i.id and m.kind = 'return' and (p_event is null or m.event_id = p_event)),
      'wasted', (select coalesce(sum(m.quantity), 0) from public.stock_movements m where m.item_id = i.id and m.kind = 'waste' and (p_event is null or m.event_id = p_event)),
      'sold', (select coalesce(sum(m.quantity), 0) from public.stock_movements m where m.item_id = i.id and m.kind = 'sale' and (p_event is null or m.event_id = p_event))) order by i.category, i.name)
    from public.stock_items i where i.workspace_id = p_workspace and i.status = 'active' and (p_event is null or i.event_id is null or i.event_id = p_event)), '[]'::jsonb);
end $$;

-- ═══ Merchandise ═══
create table if not exists public.merch_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  stock_item_id uuid not null references public.stock_items(id) on delete restrict,
  name text not null check (length(btrim(name)) between 2 and 120),
  price_minor integer not null check (price_minor between 0 and 1000000),
  vat_rate_bps integer not null default 2000 check (vat_rate_bps between 0 and 10000),
  per_order_limit integer not null default 10 check (per_order_limit between 1 and 100),
  status text not null default 'draft' check (status in ('draft','on_sale','off_sale')),
  created_at timestamptz not null default now()
);
create table if not exists public.merch_orders (
  id uuid primary key default gen_random_uuid(),
  order_ref text not null unique default ('GD-M-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  buyer_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','paid','collected','refunded','partially_refunded','cancelled','expired')),
  total_minor integer not null default 0, refunded_minor integer not null default 0,
  collection_code_hash text, payment_ref text, request_id text,
  expires_at timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now(), paid_at timestamptz, collected_at timestamptz
);
create unique index if not exists merch_orders_request on public.merch_orders(buyer_id, request_id) where request_id is not null;
create table if not exists public.merch_order_lines (
  order_id uuid not null references public.merch_orders(id) on delete cascade,
  merch_item_id uuid not null references public.merch_items(id) on delete restrict,
  qty integer not null check (qty between 1 and 100), unit_minor integer not null, refunded_qty integer not null default 0 check (refunded_qty >= 0),
  primary key (order_id, merch_item_id), check (refunded_qty <= qty)
);

delete from public.state_transitions where machine = 'merch_order';
delete from public.state_machines where machine = 'merch_order';
insert into public.state_machines(machine, table_name, column_name, mode, initial_states, terminal_states) values
  ('merch_order', 'merch_orders', 'status', 'enforce', array['pending']::text[], array['refunded','cancelled','expired']::text[]);
insert into public.state_transitions(machine, from_state, to_state) values
  ('merch_order','pending','paid'),('merch_order','pending','cancelled'),('merch_order','pending','expired'),
  ('merch_order','paid','collected'),('merch_order','paid','refunded'),('merch_order','paid','partially_refunded'),
  ('merch_order','partially_refunded','refunded'),('merch_order','partially_refunded','collected'),('merch_order','partially_refunded','partially_refunded'),
  ('merch_order','collected','refunded'),('merch_order','collected','partially_refunded');
drop trigger if exists merch_orders_state_guard on public.merch_orders;
create trigger merch_orders_state_guard before insert or update of status on public.merch_orders for each row execute function public.enforce_state_transition('merch_order', 'status');

create or replace function public.save_merch_item(p_workspace uuid, p_item uuid, p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v uuid;
begin
  if not public.has_permission(p_workspace, 'tickets.manage') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.stock_items s where s.id = (p_data->>'stock_item_id')::uuid and s.workspace_id = p_workspace and s.category = 'merchandise') and p_item is null then
    raise exception 'stock_item_required' using errcode = '22023';
  end if;
  if p_item is null then
    insert into public.merch_items(workspace_id, event_id, stock_item_id, name, price_minor, vat_rate_bps, per_order_limit, status)
      values (p_workspace, nullif(p_data->>'event_id', '')::uuid, (p_data->>'stock_item_id')::uuid, btrim(p_data->>'name'), (p_data->>'price_minor')::int,
        coalesce((p_data->>'vat_rate_bps')::int, 2000), coalesce((p_data->>'per_order_limit')::int, 10), coalesce(p_data->>'status', 'draft')) returning id into v;
  else
    update public.merch_items set name = coalesce(btrim(p_data->>'name'), name), price_minor = coalesce((p_data->>'price_minor')::int, price_minor), status = coalesce(p_data->>'status', status)
     where id = p_item and workspace_id = p_workspace returning id into v;
  end if;
  return jsonb_build_object('ok', true, 'id', v);
end $$;

-- Buyer reserves stock (row locks in id order); returns the order and a one-time collection code (only its hash is stored).
create or replace function public.merch_reserve(p_event uuid, p_items jsonb, p_request_id text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); e public.events; o public.merch_orders; x record; mi public.merch_items; si public.stock_items; total int := 0; code text;
begin
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event;
  if not found or e.visibility <> 'public' or e.status not in ('published','on_sale','live') then raise exception 'not_on_sale' using errcode = '22023'; end if;
  if p_request_id is not null then
    select * into o from public.merch_orders where buyer_id = uid and request_id = p_request_id;
    if found then return jsonb_build_object('ok', true, 'order_ref', o.order_ref, 'total_minor', o.total_minor, 'replayed', true); end if;
  end if;
  if not public.hit_rate_limit('merch:' || uid, 30, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.merch_orders(workspace_id, event_id, buyer_id, request_id, collection_code_hash) values (e.workspace_id, e.id, uid, p_request_id, encode(extensions.digest(code, 'sha256'), 'hex')) returning * into o;
  for x in select (j->>'merch_item_id')::uuid id, (j->>'qty')::int qty from jsonb_array_elements(p_items) j order by 1 loop
    select * into mi from public.merch_items where id = x.id and workspace_id = e.workspace_id and status = 'on_sale' and (event_id is null or event_id = e.id);
    if not found then raise exception 'merch_not_on_sale' using errcode = '22023'; end if;
    if x.qty < 1 or x.qty > mi.per_order_limit then raise exception 'order_limit' using errcode = '22023'; end if;
    select * into si from public.stock_items where id = mi.stock_item_id for update;
    if si.on_hand - si.reserved < x.qty then raise exception 'sold_out' using errcode = '22023'; end if;
    update public.stock_items set reserved = reserved + x.qty, updated_at = now() where id = si.id;
    insert into public.merch_order_lines(order_id, merch_item_id, qty, unit_minor) values (o.id, mi.id, x.qty, mi.price_minor);
    total := total + x.qty * mi.price_minor;
  end loop;
  if total = 0 and not exists (select 1 from public.merch_order_lines where order_id = o.id) then raise exception 'empty_order' using errcode = '22023'; end if;
  update public.merch_orders set total_minor = total where id = o.id;
  return jsonb_build_object('ok', true, 'order_ref', o.order_ref, 'total_minor', total, 'collection_code', code, 'expires_at', o.expires_at);
end $$;

create or replace function public.merch_release_lines(p_order uuid) returns void
language sql volatile security definer set search_path = '' as $$
  update public.stock_items s set reserved = greatest(0, s.reserved - l.qty), updated_at = now()
    from public.merch_order_lines l join public.merch_items m on m.id = l.merch_item_id where l.order_id = p_order and s.id = m.stock_item_id
$$;

-- Service-only: the Q07 payment confirmation calls this once the PaymentIntent succeeded (idempotent).
create or replace function public.merch_mark_paid(p_order_ref text, p_payment_ref text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare o public.merch_orders; l record;
begin
  select * into o from public.merch_orders where order_ref = p_order_ref for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if o.status <> 'pending' then return jsonb_build_object('ok', o.status in ('paid','collected'), 'replayed', true, 'status', o.status); end if;
  if o.expires_at < now() then
    perform public.merch_release_lines(o.id);
    update public.merch_orders set status = 'expired' where id = o.id;
    return jsonb_build_object('ok', false, 'error', 'reservation_expired', 'refund_required', true);
  end if;
  for l in select ln.qty, m.stock_item_id from public.merch_order_lines ln join public.merch_items m on m.id = ln.merch_item_id where ln.order_id = o.id order by m.stock_item_id loop
    insert into public.stock_movements(item_id, event_id, kind, quantity, ref) values (l.stock_item_id, o.event_id, 'sale', l.qty, o.order_ref);
  end loop;
  update public.merch_orders set status = 'paid', paid_at = now(), payment_ref = p_payment_ref where id = o.id;
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', o.workspace_id, 'merch.order_paid', jsonb_build_object('order_ref', o.order_ref, 'total_minor', o.total_minor));
  return jsonb_build_object('ok', true, 'status', 'paid');
end $$;

create or replace function public.merch_collect(p_order_ref text, p_code text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare o public.merch_orders;
begin
  select * into o from public.merch_orders where order_ref = p_order_ref for update;
  if not found or not (public.has_permission(o.workspace_id, 'checkin.scan') or public.has_permission(o.workspace_id, 'events.write')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if o.status = 'collected' then return jsonb_build_object('ok', false, 'error', 'already_collected', 'collected_at', o.collected_at); end if;
  if o.status not in ('paid','partially_refunded') then return jsonb_build_object('ok', false, 'error', 'not_paid'); end if;
  if encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex') <> o.collection_code_hash then return jsonb_build_object('ok', false, 'error', 'wrong_code'); end if;
  update public.merch_orders set status = 'collected', collected_at = now() where id = o.id;
  return jsonb_build_object('ok', true);
end $$;

-- Refund lines (finance/refunds.approve). Restock returns units through a 'refund' movement. Card refunds are Q07's job.
create or replace function public.merch_refund(p_order_ref text, p_lines jsonb, p_restock boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare o public.merch_orders; x record; l public.merch_order_lines; amt int := 0; si uuid;
begin
  select * into o from public.merch_orders where order_ref = p_order_ref for update;
  if not found or not public.has_permission(o.workspace_id, 'refunds.approve') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if o.status not in ('paid','collected','partially_refunded') then raise exception 'not_refundable' using errcode = '22023'; end if;
  for x in select (j->>'merch_item_id')::uuid id, (j->>'qty')::int qty from jsonb_array_elements(p_lines) j loop
    select * into l from public.merch_order_lines where order_id = o.id and merch_item_id = x.id for update;
    if not found or x.qty < 1 or l.refunded_qty + x.qty > l.qty then raise exception 'refund_exceeds_order' using errcode = '22023'; end if;
    update public.merch_order_lines set refunded_qty = refunded_qty + x.qty where order_id = o.id and merch_item_id = x.id;
    amt := amt + x.qty * l.unit_minor;
    if p_restock then
      select stock_item_id into si from public.merch_items where id = x.id;
      insert into public.stock_movements(item_id, event_id, kind, quantity, ref, actor_id) values (si, o.event_id, 'refund', x.qty, o.order_ref, (select auth.uid()));
    end if;
  end loop;
  update public.merch_orders set refunded_minor = refunded_minor + amt,
    status = case when (select bool_and(refunded_qty = qty) from public.merch_order_lines where order_id = o.id) then 'refunded' else 'partially_refunded' end where id = o.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), o.workspace_id, 'merch.order_refunded', jsonb_build_object('order_ref', o.order_ref, 'amount_minor', amt, 'restock', p_restock));
  return jsonb_build_object('ok', true, 'refund_minor', amt, 'card_refund', 'pending_q07');
end $$;

create or replace function public.merch_expire_sweep() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare o record; n int := 0;
begin
  for o in select id from public.merch_orders where status = 'pending' and expires_at < now() for update skip locked loop
    perform public.merch_release_lines(o.id);
    update public.merch_orders set status = 'expired' where id = o.id; n := n + 1;
  end loop;
  return jsonb_build_object('expired', n);
end $$;
create or replace function public.job_merch_expire(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$ begin return public.merch_expire_sweep(); end $$;
insert into public.job_kinds(kind, runtime, handler, max_attempts, description) values
  ('merch.expire_reservations', 'db', 'public.job_merch_expire', 3, 'Q40: every minute; expire unpaid merchandise reservations and release reserved stock')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, description = excluded.description, updated_at = now();
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then perform cron.schedule('merch-expire-sweep', '* * * * *', $c$select public.merch_expire_sweep()$c$); end if;
end $$;

-- ═══ RLS ═══
alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.merch_items enable row level security;
alter table public.merch_orders enable row level security;
alter table public.merch_order_lines enable row level security;
revoke all on table public.stock_items, public.stock_movements, public.merch_items, public.merch_orders, public.merch_order_lines from public, anon, authenticated;
grant select on table public.stock_items, public.stock_movements, public.merch_orders, public.merch_order_lines to authenticated;
grant select on table public.merch_items to anon, authenticated;
grant all on table public.stock_items, public.stock_movements, public.merch_items, public.merch_orders, public.merch_order_lines to service_role;
drop policy if exists stock_items_read on public.stock_items;
create policy stock_items_read on public.stock_items for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists stock_movements_read on public.stock_movements;
create policy stock_movements_read on public.stock_movements for select to authenticated using (exists (select 1 from public.stock_items i where i.id = item_id and public.is_workspace_member(i.workspace_id)));
drop policy if exists merch_items_public on public.merch_items;
create policy merch_items_public on public.merch_items for select to anon, authenticated using (status = 'on_sale');
drop policy if exists merch_items_members on public.merch_items;
create policy merch_items_members on public.merch_items for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists merch_orders_read on public.merch_orders;
create policy merch_orders_read on public.merch_orders for select to authenticated using (buyer_id = (select auth.uid()) or public.has_permission(workspace_id, 'sales.read') or public.has_permission(workspace_id, 'finance.read'));
drop policy if exists merch_order_lines_read on public.merch_order_lines;
create policy merch_order_lines_read on public.merch_order_lines for select to authenticated using (exists (select 1 from public.merch_orders o where o.id = order_id));

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('merch.order_paid', 1, 'merch_order', 'A merchandise order was paid (payload: order_ref, total_minor).', null),
  ('merch.order_refunded', 1, 'merch_order', 'Merchandise lines were refunded (payload: order_ref, amount_minor, restock).', null),
  ('merch_order.state_changed', 1, 'merch_order', 'A merchandise order changed status.', null)
on conflict (event_type) do update set description = excluded.description, aggregate = excluded.aggregate;

revoke all on function public.stock_movements_apply(), public.merch_release_lines(uuid), public.merch_mark_paid(text, text), public.merch_expire_sweep(), public.job_merch_expire(public.job_queue) from public, anon, authenticated;
grant execute on function public.merch_release_lines(uuid), public.merch_mark_paid(text, text), public.merch_expire_sweep(), public.job_merch_expire(public.job_queue) to service_role;
revoke all on function public.save_stock_item(uuid, uuid, jsonb), public.record_stock_movement(uuid, text, integer, uuid, text, text, integer), public.transfer_stock(uuid, uuid, integer, text),
  public.stock_report(uuid, uuid), public.save_merch_item(uuid, uuid, jsonb), public.merch_reserve(uuid, jsonb, text), public.merch_collect(text, text), public.merch_refund(text, jsonb, boolean) from public, anon;
grant execute on function public.save_stock_item(uuid, uuid, jsonb), public.record_stock_movement(uuid, text, integer, uuid, text, text, integer), public.transfer_stock(uuid, uuid, integer, text),
  public.stock_report(uuid, uuid), public.save_merch_item(uuid, uuid, jsonb), public.merch_reserve(uuid, jsonb, text), public.merch_collect(text, text), public.merch_refund(text, jsonb, boolean) to authenticated, service_role;
