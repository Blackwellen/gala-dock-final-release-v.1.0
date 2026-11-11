-- Owner decisions 2026-11-11 (DEC-107 for tickets):
--   1. Ticket money is never released before the event. It stays in the organiser's own Stripe balance (Gala Dock never holds it;
--      the organiser is responsible for refunds) and is released event end + ticket_payout_delay_business_days (default 5 UK
--      business days, the UK norm). The hold-limit default rule must not pay ticket money out before the event, so ticket sales
--      may only open from ticket_sales_open_from(event) = event end + delay − (hold limit − margin). Enforced on ticket tiers
--      (on-sale / scheduled paid tiers), on events going on sale, and as a backstop on every ticket charge. Demo/QA exempt.
--   3. Losses: the seller carries chargebacks; for ticket sales the whole ticket balance is effectively held until the post-event
--      release (manual payouts), then the standard reserve applies. A shortfall the seller's balance/reserve/later releases don't
--      cover falls to Gala Dock (platform-managed fallback): recorded in dec107_covered_liabilities, recovered from later releases
--      first, then absorbed by Gala Dock with a staff decision (second factor, audited).
-- Re-issues dec107_bind_release_model and dec107_release_sweep (6001 bodies + the changes marked "owner 2026-11-11").

alter table public.dec107_settings add column if not exists ticket_payout_delay_business_days integer not null default 5 check (ticket_payout_delay_business_days between 1 and 20);

/** Adds UK business days (Mon–Fri; bank holidays not yet excluded, so a release can come one day early around them). */
create or replace function public.dec107_add_business_days(p_from timestamptz, p_days integer)
returns timestamptz language plpgsql immutable set search_path to '' as $$
declare d timestamptz := p_from; n integer := 0;
begin
  while n < greatest(p_days, 0) loop
    d := d + interval '1 day';
    if extract(isodow from (d at time zone 'Europe/London')) < 6 then n := n + 1; end if;
  end loop;
  return d;
end $$;

/** Earliest moment paid tickets for this event may be sold so that their money is never released before the event. */
create or replace function public.ticket_sales_open_from(p_event uuid)
returns timestamptz language sql stable security definer set search_path to '' as $$
  select public.dec107_add_business_days(coalesce(e.ends_at, e.starts_at + interval '6 hours'), s.ticket_payout_delay_business_days)
         - make_interval(days => s.hold_limit_days - s.default_rule_margin_days)
    from public.events e, public.dec107_settings s where e.id = p_event and s.id;
$$;
revoke all on function public.ticket_sales_open_from(uuid) from public, anon;
grant execute on function public.ticket_sales_open_from(uuid) to authenticated;

/** Tier guard: a paid tier can't be on sale (or scheduled to start) before ticket_sales_open_from. Plain message with the date. */
create or replace function public.ticket_tier_sale_window_guard()
returns trigger language plpgsql security definer set search_path to '' as $$
declare open_from timestamptz; ws uuid;
begin
  if coalesce(new.price, 0) <= 0 or new.status not in ('on_sale','scheduled') then return new; end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status and new.sale_start is not distinct from old.sale_start and new.price is not distinct from old.price then return new; end if;
  select workspace_id into ws from public.events where id = new.event_id;
  if public.dec107_gate_exempt(ws) then return new; end if;
  open_from := public.ticket_sales_open_from(new.event_id);
  if open_from is not null and (case when new.status = 'on_sale' then greatest(coalesce(new.sale_start, now()), now()) else coalesce(new.sale_start, now()) end) < open_from then
    raise exception 'tickets_on_sale_from:%', to_char(open_from at time zone 'Europe/London', 'YYYY-MM-DD') using errcode = '22023',
      hint = 'Ticket money stays in your Stripe balance until after the event; sales can open once the payout falls inside the payment provider''s hold limit.';
  end if;
  return new;
end $$;
revoke all on function public.ticket_tier_sale_window_guard() from public, anon, authenticated;
drop trigger if exists ticket_tier_sale_window_guard on public.ticket_tiers;
create trigger ticket_tier_sale_window_guard before insert or update of status, sale_start, price on public.ticket_tiers for each row execute function public.ticket_tier_sale_window_guard();

-- ───────────── losses (owner decision 3) ─────────────
create table if not exists public.dec107_covered_liabilities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stripe_account_id text not null,
  event_id uuid,
  amount_minor bigint not null check (amount_minor > 0),
  recovered_minor bigint not null default 0 check (recovered_minor >= 0),
  reason text not null default 'chargeback_or_refund_shortfall',
  status text not null default 'recovering' check (status in ('recovering','recovered','absorbed_by_platform')),
  livemode boolean not null default false,
  decided_by uuid,
  decision_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.dec107_covered_liabilities enable row level security;
drop policy if exists dec107_covered_liabilities_read on public.dec107_covered_liabilities;
create policy dec107_covered_liabilities_read on public.dec107_covered_liabilities for select to authenticated
  using (public.is_platform_admin() or public.has_workspace_role(workspace_id, array['owner','manager','finance']));
revoke all on public.dec107_covered_liabilities from anon, authenticated;
grant select on public.dec107_covered_liabilities to authenticated;

/** Staff decision: Gala Dock absorbs what the seller couldn't cover (platform-managed fallback). Second factor; audited. */
create or replace function public.adm_covered_liability_absorb(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path to '' as $$
declare c public.dec107_covered_liabilities;
begin
  perform public.admin_mfa_required();
  if not public.has_admin_permission('commerce') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_note, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.dec107_covered_liabilities set status = 'absorbed_by_platform', decided_by = auth.uid(), decision_note = left(p_note, 1000), resolved_at = now()
   where id = p_id and status = 'recovering' returning * into c;
  if not found then raise exception 'not_open' using errcode = '22023'; end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'admin', c.workspace_id, 'payout.liability_absorbed',
    jsonb_build_object('liability', c.id, 'outstanding_minor', c.amount_minor - c.recovered_minor, 'note', left(p_note, 300)));
end $$;
revoke all on function public.adm_covered_liability_absorb(uuid, text) from public, anon;
grant execute on function public.adm_covered_liability_absorb(uuid, text) to authenticated;

create or replace function public.dec107_bind_release_model()
returns trigger language plpgsql security definer set search_path to '' as $$
declare j jsonb := to_jsonb(new); o jsonb; acct text; ws uuid; interval_ text; paid boolean; was_paid boolean; s public.dec107_settings;
begin
  o := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  acct := coalesce(j->>'payee_connected_account_id', j->>'connected_account_id');
  ws := coalesce(j->>'payee_workspace_id', j->>'seller_workspace_id', j->>'workspace_id')::uuid;
  if acct is not null and new.release_model is null
     and (tg_table_name = 'invoice_card_payments' or j->>'strategy' = 'direct')
     and (tg_op = 'INSERT' or acct is distinct from coalesce(o->>'payee_connected_account_id', o->>'connected_account_id')) then
    select c.payout_interval into interval_ from public.connect_accounts c where c.stripe_account_id = acct order by c.updated_at desc limit 1;
    select * into s from public.dec107_settings where id;
    if interval_ = 'manual' then new.release_model := 'manual_release';
    elsif coalesce(s.require_manual_payout_accounts, false) and not public.dec107_gate_exempt(ws) then
      raise exception 'seller_not_ready' using errcode = '22023', detail = 'COM_SELLER_NOT_READY', hint = 'The seller''s payout account is not a DEC-107 (manual payout) account yet.';
    else new.release_model := 'seller_schedule';
    end if;
  end if;
  -- Owner 2026-11-11: ticket money is never released before the event, so a ticket may only be charged once event end + payout
  -- delay fits inside the hold limit (ticket_sales_open_from). Backstop for every ticket charge; demo/QA exempt.
  if tg_table_name = 'checkout_orders' and acct is not null and j->>'strategy' = 'direct'
     and (tg_op = 'INSERT' or acct is distinct from coalesce(o->>'payee_connected_account_id', o->>'connected_account_id'))
     and not public.dec107_gate_exempt(ws) and now() < public.ticket_sales_open_from((j->>'event_id')::uuid) then
    raise exception 'tickets_on_sale_from:%', to_char(public.ticket_sales_open_from((j->>'event_id')::uuid) at time zone 'Europe/London', 'YYYY-MM-DD') using errcode = '22023';
  end if;
  paid := case tg_table_name when 'payment_orders' then j->>'status' in ('payment_succeeded','protected_pending_delivery')
                             when 'checkout_orders' then j->>'status' in ('paid','issued')
                             when 'merch_orders' then j->>'status' in ('paid','collected')
                             else j->>'status' = 'succeeded' end;
  was_paid := case tg_table_name when 'payment_orders' then o->>'status' in ('payment_succeeded','protected_pending_delivery')
                                 when 'checkout_orders' then o->>'status' in ('paid','issued')
                                 when 'merch_orders' then o->>'status' in ('paid','collected')
                                 else o->>'status' = 'succeeded' end;
  if paid and not coalesce(was_paid, false) and new.charged_at is null then new.charged_at := now(); end if;
  return new;
end $$;
create or replace function public.dec107_release_sweep()
returns jsonb language plpgsql security definer set search_path to '' as $$
declare s public.dec107_settings; created integer := 0; due integer := 0; blocked integer := 0; defaults integer := 0; cancelled integer := 0;
  r record; rv record; hold interval;
begin
  select * into s from public.dec107_settings where id;
  hold := make_interval(days => s.hold_limit_days - s.default_rule_margin_days);

  -- (a) one main release per charged DEC-107 record
  with ins as (
    insert into public.payout_releases(source_type, source_ref, workspace_id, stripe_account_id, payment_intent, event_id, sale_kind, currency, livemode, charged_at, hold_limit_at)
    select 'payment_order', po.reference, po.payee_workspace_id, po.payee_connected_account_id, po.stripe_payment_intent, po.event_id, 'booking', upper(po.currency), coalesce(po.livemode, false), po.charged_at, po.charged_at + hold
      from public.payment_orders po
     where po.release_model = 'manual_release' and po.strategy = 'direct' and po.charged_at is not null and po.payee_connected_account_id is not null
    union all
    select 'checkout_order', co.order_ref, co.seller_workspace_id, co.connected_account_id, co.stripe_payment_intent, co.event_id,
           case co.kind when 'resale' then 'ticket_resale' else 'ticket_sale' end, upper(co.currency), coalesce(co.livemode, false), co.charged_at, co.charged_at + hold
      from public.checkout_orders co
     where co.release_model = 'manual_release' and co.strategy = 'direct' and co.charged_at is not null
    union all
    select 'merch_order', mo.order_ref, mo.seller_workspace_id, mo.connected_account_id, mo.stripe_payment_intent, mo.event_id, 'merch', upper(mo.currency), coalesce(mo.livemode, false), mo.charged_at, mo.charged_at + hold
      from public.merch_orders mo
     where mo.release_model = 'manual_release' and mo.strategy = 'direct' and mo.charged_at is not null and mo.connected_account_id is not null
    union all
    select 'invoice_card_payment', ic.id::text, ic.workspace_id, ic.connected_account_id, ic.stripe_payment_intent, i.event_id, 'invoice', upper(ic.currency), coalesce(ic.livemode, false), ic.charged_at, ic.charged_at + hold
      from public.invoice_card_payments ic join public.invoices i on i.id = ic.invoice_id
     where ic.release_model = 'manual_release' and ic.charged_at is not null and ic.connected_account_id is not null
    on conflict (source_type, source_ref, part) do nothing
    returning 1)
  select count(*) into created from ins;

  -- (b) fully refunded records release nothing
  with c as (
    update public.payout_releases pr set status = 'cancelled', blocked_reason = 'fully_refunded', updated_at = now()
     where pr.status in ('held','due','blocked') and pr.part = 'main' and (
       (pr.source_type = 'checkout_order' and exists (select 1 from public.checkout_orders co where co.order_ref = pr.source_ref and co.status = 'refunded'))
       or (pr.source_type = 'payment_order' and exists (select 1 from public.payment_orders po where po.reference = pr.source_ref and po.status in ('refunded','cancelled')))
       or (pr.source_type = 'merch_order' and exists (select 1 from public.merch_orders mo where mo.order_ref = pr.source_ref and mo.status in ('refunded','cancelled'))))
    returning 1)
  select count(*) into cancelled from c;

  -- (c) triggers. Tickets / resales / merch: event completed + review window. Bookings: customer confirmation (item fulfilled or
  --     completed) or event completed + review window. Invoices: event + review, else charge + review.
  update public.payout_releases pr set trigger_at = x.trigger_at, trigger = x.trigger, updated_at = now()
    from (
      select pr2.id,
        case
          when pr2.sale_kind in ('ticket_sale','ticket_resale','merch') then public.dec107_add_business_days(coalesce(e.ends_at, e.starts_at + interval '6 hours'), s.ticket_payout_delay_business_days)
          when pr2.sale_kind = 'booking' and b.status in ('fulfilled','completed') then least(coalesce(b.updated_at, now()), coalesce(e.ends_at, e.starts_at + interval '6 hours') + make_interval(hours => s.booking_review_hours))
          when pr2.sale_kind = 'booking' then coalesce(e.ends_at, e.starts_at + interval '6 hours') + make_interval(hours => s.booking_review_hours)
          else coalesce(coalesce(e.ends_at, e.starts_at + interval '6 hours'), pr2.charged_at) + make_interval(hours => s.booking_review_hours)
        end trigger_at,
        case when pr2.sale_kind = 'booking' and b.status in ('fulfilled','completed') then 'customer_confirmed'
             when e.id is not null then 'event_completed_review' else 'review_window' end trigger
      from public.payout_releases pr2
      left join public.events e on e.id = pr2.event_id
      left join public.payment_orders po on pr2.source_type = 'payment_order' and po.reference = pr2.source_ref
      left join public.build_items b on b.id = po.build_item_id
      where pr2.part = 'main' and pr2.status in ('held','blocked') and pr2.trigger not in ('settlement','accepted_recommendation','independent_award','default_rule') is not false
    ) x
   where pr.id = x.id and (pr.trigger_at is distinct from x.trigger_at or pr.trigger is distinct from x.trigger);

  -- (d) blocks: an open booking dispute, an open card dispute or a pending cancellation stop the release (until the hold limit)
  update public.payout_releases pr set status = 'blocked', blocked_reason = y.reason, updated_at = now()
    from (
      select pr2.id, case
        when exists (select 1 from public.booking_disputes d where d.build_item_id = po.build_item_id and d.status <> 'resolved') then 'booking_dispute_open'
        when exists (select 1 from public.stripe_disputes sd where sd.payment_intent_id = pr2.payment_intent and sd.outcome is null) then 'card_dispute_open'
        when exists (select 1 from public.booking_cancellations bc where bc.build_item_id = po.build_item_id and bc.status in ('requested','manual_review')) then 'cancellation_pending'
        end reason
      from public.payout_releases pr2
      left join public.payment_orders po on pr2.source_type = 'payment_order' and po.reference = pr2.source_ref
      where pr2.status in ('held','due','blocked')) y
   where pr.id = y.id and y.reason is not null and pr.trigger is distinct from 'default_rule' and (pr.status <> 'blocked' or pr.blocked_reason is distinct from y.reason);
  update public.payout_releases pr set status = 'held', blocked_reason = null, updated_at = now()
   where pr.status = 'blocked' and pr.blocked_reason in ('booking_dispute_open','card_dispute_open','cancellation_pending')
     and not exists (select 1 from public.payment_orders po join public.booking_disputes d on d.build_item_id = po.build_item_id
                      where pr.source_type = 'payment_order' and po.reference = pr.source_ref and d.status <> 'resolved')
     and not exists (select 1 from public.stripe_disputes sd where sd.payment_intent_id = pr.payment_intent and sd.outcome is null)
     and not exists (select 1 from public.payment_orders po join public.booking_cancellations bc on bc.build_item_id = po.build_item_id
                      where pr.source_type = 'payment_order' and po.reference = pr.source_ref and bc.status in ('requested','manual_review'));
  select count(*) into blocked from public.payout_releases where status = 'blocked';

  -- (e) hold-limit default rule: an open booking dispute at the default-rule day → refund the disputed amount (capped by the
  --     worker at what is held), release the rest. Runs whatever the policy version (the provider forces the money out).
  for r in
    select pr.*, d.id dispute_id, d.amount_claimed, po.build_item_id, d.workspace_id dws, d.event_id dev
      from public.payout_releases pr
      join public.payment_orders po on pr.source_type = 'payment_order' and po.reference = pr.source_ref
      join lateral (select * from public.booking_disputes d where d.build_item_id = po.build_item_id and d.status <> 'resolved' order by d.created_at desc limit 1) d on true
     where pr.part = 'main' and pr.status = 'blocked' and pr.blocked_reason = 'booking_dispute_open' and now() >= pr.hold_limit_at
  loop
    if coalesce(r.amount_claimed, 0) > 0 then
      insert into public.dec107_refund_instructions(basis, dispute_id, build_item_id, amount_minor, idempotency_key)
        values ('default_rule', r.dispute_id, r.build_item_id, round(r.amount_claimed * 100)::bigint, 'default_rule:' || r.dispute_id)
        on conflict (idempotency_key) do nothing;
    end if;
    update public.payout_releases set status = 'held', blocked_reason = 'default_rule_refund_first', trigger = 'default_rule', trigger_at = now(), updated_at = now() where id = r.id;
    perform public.dec107_default_rule_notice(r.dispute_id, coalesce(r.amount_claimed, 0));
    defaults := defaults + 1;
  end loop;

  -- (e2) owner 2026-11-11: ticket money is NEVER paid out before the event, even at the hold limit (sales only open inside the
  --      window, so this only happens if an event is postponed). Block and alert staff instead of releasing.
  update public.payout_releases pr set status = 'blocked', blocked_reason = 'hold_limit_before_event', updated_at = now()
    from public.events e
   where pr.event_id = e.id and pr.sale_kind in ('ticket_sale','ticket_resale','merch') and pr.status = 'held'
     and now() >= pr.hold_limit_at and now() < coalesce(e.ends_at, e.starts_at + interval '6 hours');
  insert into public.notifications(user_id, kind, title, body, link, dedupe_key)
    select pa.user_id, 'admin.ops_alert', 'Ticket money at the hold limit before its event',
           'A ticket release reached the payment hold limit before the event ended (event moved?). It is blocked, not paid out. Decide with the organiser: refund buyers or agree a new date.',
           '/admin/commerce/payouts', 'hold-before-event:' || pr.id || ':' || pa.user_id
      from public.payout_releases pr cross join public.platform_admins pa
     where pr.status = 'blocked' and pr.blocked_reason = 'hold_limit_before_event'
    on conflict (dedupe_key) where dedupe_key is not null do nothing;

  -- (f) due: trigger reached (or hold limit), not blocked, and no default-rule refund still outstanding
  with d as (
    update public.payout_releases pr set status = 'due',
           due_at = least(coalesce(pr.trigger_at, pr.hold_limit_at), pr.hold_limit_at),
           trigger = case when pr.trigger_at is null or pr.hold_limit_at < pr.trigger_at then case when pr.trigger = 'default_rule' then 'default_rule' else 'hold_limit' end else pr.trigger end,
           blocked_reason = null, updated_at = now()
     where pr.status = 'held' and pr.part = 'main' and now() >= least(coalesce(pr.trigger_at, pr.hold_limit_at), pr.hold_limit_at)
       and not (pr.sale_kind in ('ticket_sale','ticket_resale','merch') and exists (select 1 from public.events e where e.id = pr.event_id and now() < coalesce(e.ends_at, e.starts_at + interval '6 hours')))
       and not exists (select 1 from public.dec107_refund_instructions ri join public.payment_orders po on po.build_item_id = ri.build_item_id
                        where pr.source_type = 'payment_order' and po.reference = pr.source_ref and ri.status in ('due','processing'))
    returning 1)
  select count(*) into due from d;
  -- card disputes still open at the hold limit: the disputed amount has already left the seller's balance; release the rest
  update public.payout_releases pr set status = 'due', due_at = pr.hold_limit_at, trigger = 'hold_limit', blocked_reason = null, updated_at = now()
   where pr.status = 'blocked' and pr.blocked_reason = 'card_dispute_open' and now() >= pr.hold_limit_at;
  -- reserve parts come due at their end
  update public.payout_releases pr set status = 'due', due_at = pr.reserve_until, trigger = 'reserve_end', updated_at = now()
   where pr.status = 'held' and pr.part = 'reserve' and now() >= pr.reserve_until;

  -- (g) warning before the default-rule day (both parties), once
  for rv in
    select pr.id, d.id dispute_id from public.payout_releases pr
      join public.payment_orders po on pr.source_type = 'payment_order' and po.reference = pr.source_ref
      join public.booking_disputes d on d.build_item_id = po.build_item_id and d.status <> 'resolved'
     where pr.status = 'blocked' and pr.warning_sent_at is null and now() >= pr.hold_limit_at - make_interval(days => s.warning_days)
  loop
    perform public.dec107_dispute_notice(rv.dispute_id, 'dispute_hold_limit_warning', 'Payment hold limit in ' || s.warning_days || ' days',
      'The payment provider''s hold limit for this booking is reached in ' || s.warning_days || ' days. If the dispute is not settled by then, the default rule in the Gala Dock Payment Terms applies: the disputed amount is refunded to the customer and the rest is released to the provider. Settle in the dispute to avoid this.');
    update public.payout_releases set warning_sent_at = now() where id = rv.id;
  end loop;

  return jsonb_build_object('created', created, 'due', due, 'blocked', blocked, 'default_rule', defaults, 'cancelled', cancelled);
end $$;
revoke all on function public.dec107_bind_release_model() from public, anon, authenticated;
revoke all on function public.dec107_release_sweep() from public, anon, authenticated;
