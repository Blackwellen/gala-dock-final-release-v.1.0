-- Q76 internationalisation phase 2 (lane i18n-phase2), part 2: money and time in SQL-composed notification and email bodies
-- (gap register C11, T09). Additive. Notification rows feed the email sender (trg_notification_email), so one change covers both.
--
--   1. fmt_money(amount, currency) / fmt_money_minor(minor, currency): the same text as src/lib/i18n/money.ts
--      formatMoney(v, c, { decimals: true }) in en-GB ("£1,234.50", "€25.00", "US$90.00", "CHF 12.00", "JP¥1,235").
--      GBP output is identical to the old '£' || to_char(…) bodies except that amounts always show two decimals and a grouping
--      comma (the old ::text forms printed "£250" or "£1234.5").
--   2. fmt_event_time(ts, tz, format, zone_label): to_char in the zone (invalid/blank zone → Europe/London); with zone_label the
--      zone abbreviation is appended when the zone is not Europe/London ("Fri 12 Jun 19:00 CEST"), so UK copy is unchanged.
--      fmt_tz_abbrev(ts, tz) gives GMT/BST, CET/CEST, EET/EEST, WET/WEST, IST (Dublin), North American, Australian, NZ and a few
--      Asian names, else "UTC+5:30" style. local_tz(event, workspace): the event zone, else the workspace's settings.timezone,
--      else London. dispute_currency(dispute): the booking's charge currency.
--   3. Bodies (reviewed replacements on the live definitions, money): record_invoice_payment (invoice currency),
--      cancel_event_with_refunds + admin_review_force_majeure (event currency), payment_order_succeeded/_transferred (order
--      currency), customer_accept_quote (in part 1), provider_offer_standby, activate_standby, accept_emergency_candidate (booking
--      currency), provider_emergency_respond (the supplier listing's currency), dispute_offer_settlement, dec107_dispute_close,
--      dec107_default_rule_notice (the disputed booking's currency).
--      Times: trg_shift_notify, request_crew_availability, request_leave, decide_leave (workspace/event zone), marketplace_sweep
--      (the provider's zone), create_emergency_request (event zone), team_conflicts (shift's event/workspace zone).
--   Not changed (GBP by rule): trust_reason_text insurance minimums (UK rule), dispute_route consumer arbitration floor, Gala
--   Dock's own GBP ad products (ad_credit_refund_result), admin_request_money (Q75 lane owns it).
-- Rollback: docs/release/i18n/q76-rollback.sql (prior bodies); the helpers are inert.

-- ═══ 1–2. Helpers ═══
create or replace function public.fmt_money(p_amount numeric, p_currency text default 'GBP') returns text
language sql immutable set search_path = '' as $$
  with c as (select upper(coalesce(nullif(trim(p_currency), ''), 'GBP')) code)
  select case when p_amount is null then null else
    (case when round(p_amount, case when c.code in ('JPY','KRW','VND','CLP','PYG','UGX','XAF','XOF','XPF') then 0 else 2 end) < 0 then '-' else '' end)
    || case c.code when 'GBP' then '£' when 'EUR' then '€' when 'USD' then 'US$' when 'CAD' then 'CA$' when 'AUD' then 'A$' when 'NZD' then 'NZ$'
                   when 'HKD' then 'HK$' when 'JPY' then 'JP¥' else c.code || ' ' end
    || case when c.code in ('JPY','KRW','VND','CLP','PYG','UGX','XAF','XOF','XPF') then to_char(round(abs(p_amount)), 'FM999,999,999,999,990')
            else to_char(round(abs(p_amount), 2), 'FM999,999,999,999,990.00') end end
  from c
$$;
grant execute on function public.fmt_money(numeric, text) to anon, authenticated;

create or replace function public.fmt_money_minor(p_minor bigint, p_currency text default 'GBP') returns text
language sql immutable set search_path = '' as $$
  select public.fmt_money(case when upper(coalesce(nullif(trim(p_currency), ''), 'GBP')) in ('JPY','KRW','VND','CLP','PYG','UGX','XAF','XOF','XPF') then p_minor::numeric
                               else p_minor / 100.0 end, p_currency)
$$;
grant execute on function public.fmt_money_minor(bigint, text) to anon, authenticated;

create or replace function public.fmt_safe_tz(p_tz text) returns text
language sql stable set search_path = '' as $$
  select case when nullif(trim(coalesce(p_tz, '')), '') is not null
               and (exists (select 1 from public.ref_timezones z where z.tz = p_tz) or exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_tz))
              then p_tz else 'Europe/London' end
$$;
grant execute on function public.fmt_safe_tz(text) to anon, authenticated;

create or replace function public.fmt_tz_abbrev(p_ts timestamptz, p_tz text) returns text
language plpgsql stable set search_path = '' as $$
declare z text := public.fmt_safe_tz(p_tz); off integer; h integer; m integer;
begin
  if p_ts is null then return ''; end if;
  off := round(extract(epoch from ((p_ts at time zone z) - (p_ts at time zone 'UTC'))) / 60)::integer;
  if z in ('Europe/London','Europe/Belfast','Europe/Guernsey','Europe/Jersey','Europe/Isle_of_Man') then return case off when 60 then 'BST' else 'GMT' end; end if;
  if z = 'Europe/Dublin' then return case off when 60 then 'IST' else 'GMT' end; end if;
  if z in ('Europe/Lisbon','Atlantic/Madeira','Atlantic/Canary','Atlantic/Faroe') then return case off when 60 then 'WEST' else 'WET' end; end if;
  if z in ('Europe/Athens','Europe/Bucharest','Europe/Sofia','Europe/Helsinki','Europe/Tallinn','Europe/Riga','Europe/Vilnius','Europe/Kyiv','Europe/Kiev',
           'Europe/Chisinau','Asia/Nicosia','Europe/Nicosia','Asia/Famagusta') then return case off when 180 then 'EEST' else 'EET' end; end if;
  if z like 'Europe/%' and off in (60, 120) then return case off when 120 then 'CEST' else 'CET' end; end if;
  if z in ('America/New_York','America/Toronto','America/Detroit','America/Montreal','America/Indiana/Indianapolis','America/Kentucky/Louisville','US/Eastern','Canada/Eastern')
    then return case off when -240 then 'EDT' else 'EST' end; end if;
  if z in ('America/Chicago','America/Winnipeg','US/Central','Canada/Central') then return case off when -300 then 'CDT' else 'CST' end; end if;
  if z in ('America/Denver','America/Edmonton','America/Boise','US/Mountain','Canada/Mountain') then return case off when -360 then 'MDT' else 'MST' end; end if;
  if z in ('America/Phoenix','US/Arizona') then return 'MST'; end if;
  if z in ('America/Los_Angeles','America/Vancouver','US/Pacific','Canada/Pacific') then return case off when -420 then 'PDT' else 'PST' end; end if;
  if z in ('America/Halifax','Canada/Atlantic') then return case off when -180 then 'ADT' else 'AST' end; end if;
  if z in ('Australia/Sydney','Australia/Melbourne','Australia/Hobart','Australia/Canberra','Australia/ACT','Australia/NSW','Australia/Victoria') then return case off when 660 then 'AEDT' else 'AEST' end; end if;
  if z in ('Australia/Brisbane','Australia/Queensland') then return 'AEST'; end if;
  if z in ('Australia/Adelaide','Australia/South') then return case off when 630 then 'ACDT' else 'ACST' end; end if;
  if z in ('Australia/Darwin','Australia/North') then return 'ACST'; end if;
  if z in ('Australia/Perth','Australia/West') then return 'AWST'; end if;
  if z in ('Pacific/Auckland','NZ') then return case off when 780 then 'NZDT' else 'NZST' end; end if;
  if z in ('Asia/Tokyo','Japan') then return 'JST'; end if;
  if z in ('Asia/Singapore','Singapore') then return 'SGT'; end if;
  if z in ('Asia/Hong_Kong','Hongkong') then return 'HKT'; end if;
  if z = 'Asia/Dubai' then return 'GST'; end if;
  if z = 'Africa/Johannesburg' then return 'SAST'; end if;
  if off = 0 then return 'UTC'; end if;
  h := abs(off) / 60; m := abs(off) % 60;
  return 'UTC' || case when off < 0 then '-' else '+' end || h || case when m > 0 then ':' || lpad(m::text, 2, '0') else '' end;
end $$;
grant execute on function public.fmt_tz_abbrev(timestamptz, text) to anon, authenticated;

create or replace function public.fmt_event_time(p_ts timestamptz, p_tz text, p_format text default 'Dy DD Mon YYYY HH24:MI', p_zone_label boolean default false) returns text
language sql stable set search_path = '' as $$
  select case when p_ts is null then null else
    to_char(p_ts at time zone public.fmt_safe_tz(p_tz), coalesce(nullif(p_format, ''), 'Dy DD Mon YYYY HH24:MI'))
    || case when p_zone_label and public.fmt_safe_tz(p_tz) <> 'Europe/London' then ' ' || public.fmt_tz_abbrev(p_ts, p_tz) else '' end end
$$;
grant execute on function public.fmt_event_time(timestamptz, text, text, boolean) to anon, authenticated;

create or replace function public.local_tz(p_event uuid, p_workspace uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select e.timezone from public.events e where p_event is not null and e.id = p_event and public.fmt_safe_tz(e.timezone) = e.timezone),
    (select w.settings->>'timezone' from public.workspaces w
      where w.id = coalesce(p_workspace, (select e.workspace_id from public.events e where p_event is not null and e.id = p_event))
        and public.fmt_safe_tz(w.settings->>'timezone') = w.settings->>'timezone'),
    'Europe/London')
$$;
revoke all on function public.local_tz(uuid, uuid) from public, anon, authenticated;

create or replace function public.dispute_currency(p_dispute uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.booking_charge_currency(d.build_item_id) from public.booking_disputes d where d.id = p_dispute and d.build_item_id is not null), 'GBP')
$$;
revoke all on function public.dispute_currency(uuid) from public, anon, authenticated;

-- ═══ 3. Notification and email bodies (reviewed replacements on the live definitions) ═══
-- record_invoice_payment: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.record_invoice_payment(p_invoice uuid, p_amount numeric, p_method text, p_ref text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i public.invoices; left_amt numeric; inst record; paid numeric;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if auth.uid() is not null and not public.has_workspace_role(i.workspace_id, array['owner','manager','finance']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if i.status in ('draft','cancelled','credited','paid') then raise exception 'not_payable' using errcode = '22023'; end if;
  if p_amount <= 0 or p_amount > i.total - i.amount_paid + 0.005 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  paid := i.amount_paid + p_amount;
  update public.invoices set amount_paid = paid, status = case when paid >= i.total - 0.005 then 'paid' else 'partial' end where id = i.id;
  left_amt := p_amount;
  for inst in select * from public.invoice_installments where invoice_id = i.id and status <> 'paid' order by due_date loop
    exit when left_amt <= 0;
    if left_amt >= inst.amount - 0.005 then update public.invoice_installments set status = 'paid' where id = inst.id; left_amt := left_amt - inst.amount; else exit; end if;
  end loop;
  insert into public.transactions(workspace_id, event_id, kind, category, description, amount, status, source, source_type, source_id, occurred_at, currency, counterparty, stripe_ref)
    values (i.workspace_id, i.event_id, 'income', 'invoice', 'Invoice ' || i.number || ' payment', p_amount, 'completed', 'manual', 'invoice', i.id, now(), i.currency, i.client_name, nullif(left(coalesce(p_ref, ''), 120), ''));
  insert into public.invoice_events(invoice_id, event, detail) values (i.id, case when paid >= i.total - 0.005 then 'Invoice paid' else 'Payment received' end,
    public.fmt_money(p_amount, i.currency) || ' received via ' || coalesce(nullif(p_method, ''), 'bank transfer'));
end $function$;

-- cancel_event_with_refunds: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.cancel_event_with_refunds(p_event uuid, p_reason text, p_cause text DEFAULT 'organiser'::text, p_fm_detail text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.events; n_orders integer; n_tickets integer; chg numeric; n_chg integer; is_admin boolean; cause text := coalesce(p_cause, 'organiser');
begin
  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  is_admin := public.has_admin_permission('tickets'); if is_admin and not public.has_workspace_role(e.workspace_id, array['owner','manager']) then perform public.admin_mfa_required(); end if;
  if not (public.has_workspace_role(e.workspace_id, array['owner','manager']) or is_admin) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if cause not in ('organiser','force_majeure','platform') then raise exception 'invalid_cause' using errcode = '22023'; end if;
  if cause = 'platform' and not is_admin then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(e.workspace_id);
  if cause = 'force_majeure' and length(trim(coalesce(p_fm_detail, ''))) < 30 then raise exception 'fm_detail_required' using errcode = '22023'; end if;
  if e.status in ('cancelled','completed','closed','archived') then raise exception 'invalid_state' using errcode = '22023'; end if;
  if e.starts_at is not null and e.starts_at < now() - interval '1 day' then raise exception 'already_happened' using errcode = '22023'; end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'reason_required' using errcode = '22023'; end if;

  insert into public.event_cancellations(event_id, reason, cancelled_by, cause, fm_detail, fm_status)
    values (p_event, left(trim(p_reason), 2000), auth.uid(), cause, case when cause = 'force_majeure' then left(trim(p_fm_detail), 4000) end,
            case when cause = 'force_majeure' then 'pending' else 'none' end);
  update public.events set status = 'cancelled', updated_at = now() where id = p_event;
  update public.tickets set status = 'cancelled' where event_id = p_event and status in ('valid','resale_listed','transferred');
  get diagnostics n_tickets = row_count;
  -- Buyers: always a full refund of ticket price + booking fee (Consumer Rights Act 2015; Ticket Terms 3).
  update public.checkout_orders set refund_status = 'due', refund_reason = 'event_cancelled'
    where event_id = p_event and status in ('paid','issued') and (amount + fee) > 0 and refund_status in ('none','failed');
  get diagnostics n_orders = row_count;
  -- Organiser: platform fees on sold tickets (5% commission + the booking fees refunded to buyers).
  select coalesce(sum(o.commission + o.fee), 0), count(*) into chg, n_chg from public.checkout_orders o
    where o.event_id = p_event and o.kind = 'primary' and o.refund_status = 'due' and o.refund_reason = 'event_cancelled';
  if chg > 0 and cause <> 'platform' then
    insert into public.platform_charges(workspace_id, event_id, kind, description, amount, status, metadata)
      values (e.workspace_id, p_event, 'cancellation_fees', left('Platform fees on tickets sold for ' || e.name || ' (event cancelled)', 300), chg,
              case when cause = 'force_majeure' then 'on_hold' else 'due' end, jsonb_build_object('orders', n_chg, 'cause', cause))
      on conflict (event_id, kind) do nothing;
    if e.workspace_id is not null then
      perform public.notify_workspace(e.workspace_id, array['owner','manager','finance'], 'payment_due',
        left(case when cause = 'force_majeure' then 'Force majeure review: ' else 'Platform fees due: ' end || e.name, 160),
        case when cause = 'force_majeure'
          then 'Buyers are being refunded in full. You told us the event can’t go ahead for reasons outside your control, so platform fees of ' || public.fmt_money(chg, e.currency) || ' are on hold while we review it (usually within 5 working days). If we accept it, the fees are waived in full.'
          else 'Buyers are being refunded in full. Platform fees of ' || public.fmt_money(chg, e.currency) || ' on the tickets sold remain payable and will be deducted from your next payout or invoiced.' end,
        '/organizer/money');
    end if;
  end if;
  update public.checkout_orders set refund_status = 'not_required' where event_id = p_event and status in ('paid','issued') and (amount + fee) = 0 and refund_status = 'none';
  update public.resale_payouts rp set status = 'cancelled' from public.tickets t where t.id = rp.ticket_id and t.event_id = p_event and rp.status = 'pending';
  delete from public.ticket_waitlist where event_id = p_event;

  update public.event_cancellations set orders_refunded = n_orders, tickets_voided = n_tickets where event_id = p_event;
  insert into public.notifications(user_id, kind, title, body, link)
    select distinct o.buyer_id, 'ticket_refund', left(e.name || ' has been cancelled', 160),
      'This event has been cancelled. ' || case when (o.amount + o.fee) > 0 then 'You’ll get a full refund, including fees, to your original payment method within 5–10 working days.' else 'Your free tickets have been cancelled.' end,
      '/account/tickets'
    from public.checkout_orders o where o.event_id = p_event and o.status in ('paid','issued') and o.buyer_id is not null;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', e.workspace_id, 'event.cancelled', jsonb_build_object('event_id', p_event, 'cause', cause, 'orders_to_refund', n_orders, 'tickets_voided', n_tickets,
      'fees', coalesce(chg, 0), 'fees_status', case when cause = 'platform' or coalesce(chg, 0) = 0 then 'none' when cause = 'force_majeure' then 'on_hold' else 'due' end, 'reason', left(p_reason, 300)));
  return jsonb_build_object('orders_to_refund', n_orders, 'tickets_voided', n_tickets, 'fees_due', case when cause = 'organiser' then coalesce(chg, 0) else 0 end,
    'fees_on_hold', case when cause = 'force_majeure' then coalesce(chg, 0) else 0 end, 'cause', cause);
end $function$;

-- admin_review_force_majeure: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.admin_review_force_majeure(p_event uuid, p_approve boolean, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.event_cancellations; e public.events; amt numeric;
begin
  perform public.admin_require('tickets', p_reason);
  select * into c from public.event_cancellations where event_id = p_event for update;
  if not found or c.cause <> 'force_majeure' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.fm_status <> 'pending' then raise exception 'invalid_state' using errcode = '22023'; end if;
  select * into e from public.events where id = p_event;
  update public.event_cancellations set fm_status = case when p_approve then 'approved' else 'rejected' end, reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(trim(p_reason), 2000)
    where event_id = p_event;
  update public.platform_charges set status = case when p_approve then 'waived' else 'due' end, settled_at = case when p_approve then now() end,
      metadata = metadata || jsonb_build_object('fm_decision', case when p_approve then 'approved' else 'rejected' end)
    where event_id = p_event and kind = 'cancellation_fees' and status = 'on_hold' returning amount into amt;
  if e.workspace_id is not null then
    perform public.notify_workspace(e.workspace_id, array['owner','manager','finance'], 'payment_due',
      left(case when p_approve then 'Force majeure accepted: ' else 'Force majeure not accepted: ' end || e.name, 160),
      case when p_approve then 'We accepted that ' || e.name || ' couldn’t go ahead for reasons outside your control. Platform fees' || case when amt is not null then ' of ' || public.fmt_money(amt, e.currency) else '' end || ' are waived.'
           else 'We reviewed your force majeure claim for ' || e.name || ' and couldn’t accept it: ' || left(trim(p_reason), 400) || ' Platform fees' || case when amt is not null then ' of ' || public.fmt_money(amt, e.currency) else '' end
                || ' are now payable. If you have more evidence, contact support within 14 days and we’ll look again.' end,
      '/organizer/money');
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), e.workspace_id, case when p_approve then 'admin.force_majeure_approved' else 'admin.force_majeure_rejected' end,
      jsonb_build_object('event_id', p_event, 'amount', amt, 'reason', left(p_reason, 300)));
  return case when p_approve then 'approved' else 'rejected' end;
end $function$;

-- payment_order_transferred: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.payment_order_transferred(p_ref text, p_transfer text, p_amount_minor bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare po public.payment_orders;
begin
  select * into po from public.payment_orders where reference = p_ref for update;
  if not found or po.stripe_transfer is not null then return; end if;
  update public.payment_orders set status = 'transfer_created', stripe_transfer = p_transfer, transferred_minor = p_amount_minor, released_at = now(), updated_at = now() where id = po.id;
  perform public.post_ledger_transaction('stripe:transfer:' || p_transfer, 'provider_payout', po.currency, jsonb_build_array(
    jsonb_build_object('account', 'provider_payable', 'amount_minor', p_amount_minor, 'party_type', 'workspace', 'party_id', po.payee_workspace_id),
    jsonb_build_object('account', 'cash_stripe', 'amount_minor', -p_amount_minor, 'party_type', 'platform')),
    po.payee_workspace_id, po.event_id, 'payment_order', po.reference, 'Transfer to provider — ' || po.description, p_transfer, 'system');
  perform public.notify_workspace(po.payee_workspace_id, array['owner','manager','finance'], 'provider.payout', 'Funds released',
    public.fmt_money_minor(p_amount_minor, po.currency) || ' sent to your Stripe balance for ' || po.description || '.', '/provider/money');
end $function$;

-- provider_offer_standby: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.provider_offer_standby(p_standby uuid, p_fee numeric, p_activation_price numeric, p_valid_hours integer, p_terms text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.standby_commitments;
begin
  select * into s from public.standby_commitments where id = p_standby for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(s.workspace_id, array['owner','manager']);
  if s.status <> 'requested' then raise exception 'not_open:%', s.status using errcode = '22023'; end if;
  if p_fee is null or p_fee < 0 or p_activation_price is null or p_activation_price <= 0 then raise exception 'invalid_price' using errcode = '22023'; end if;
  if p_valid_hours is null or p_valid_hours not between 2 and 168 then raise exception 'invalid_validity' using errcode = '22023'; end if;
  if length(trim(coalesce(p_terms, ''))) < 10 then raise exception 'terms_required' using errcode = '22023'; end if;
  update public.standby_commitments set status = 'offered', standby_fee = round(p_fee, 2), activation_price = round(p_activation_price, 2),
    cancellation_terms = left(p_terms, 2000), expires_at = least(window_start, now() + make_interval(hours => p_valid_hours)), updated_at = now() where id = s.id;
  perform public.notify_event(s.event_id, 'quote_received', 'Standby offer received',
    'Standby fee ' || public.fmt_money(round(p_fee, 2), public.booking_charge_currency(s.build_item_id)) || ', activation price ' || public.fmt_money(round(p_activation_price, 2), public.booking_charge_currency(s.build_item_id)) || '.', public.event_path(s.event_id, 'booking', s.build_item_id));
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', s.workspace_id, 'standby.offered', jsonb_build_object('standby_id', s.id, 'fee', p_fee, 'activation_price', p_activation_price));
end $function$;

-- activate_standby: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.activate_standby(p_standby uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.standby_commitments;
begin
  select * into s from public.standby_commitments where id = p_standby for update;
  if not found or not public.can_edit_event(s.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if s.status <> 'accepted' then raise exception 'not_accepted:%', s.status using errcode = '22023'; end if;
  if s.fee_status = 'due' then raise exception 'standby_fee_unpaid' using errcode = '22023'; end if;
  if now() > s.window_end then raise exception 'window_closed' using errcode = '22023'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.standby_commitments set status = 'activated', activated_at = now(), activation_reason = left(p_reason, 500), updated_at = now() where id = s.id;
  update public.build_items set status = 'confirmed', role = 'primary', amount = s.activation_price, price_basis = 'fixed',
    terms_snapshot = jsonb_build_object('source', 'standby', 'standby_id', s.id, 'amount', s.activation_price, 'standby_fee', s.standby_fee,
      'cancellation', s.cancellation_terms, 'confirmed_at', now()), updated_at = now() where id = s.build_item_id;
  if s.primary_item_id is not null then
    update public.build_items set role = 'backup', updated_at = now() where id = s.primary_item_id;
    update public.build_items set status = 'replacement_required', updated_at = now() where id = s.primary_item_id and status = 'confirmed';
  end if;
  perform public.notify_workspace(s.workspace_id, array['owner','manager','member'], 'booking_confirmed', 'Standby activated — you are booked',
    'Activation price ' || public.fmt_money(s.activation_price, public.booking_charge_currency(s.build_item_id)) || '. Reason: ' || left(p_reason, 200), '/provider/opportunities/' || s.build_item_id);
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', s.workspace_id, 'standby.activated', jsonb_build_object('standby_id', s.id, 'reason', left(p_reason, 500)));
end $function$;

-- provider_emergency_respond: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.provider_emergency_respond(p_candidate uuid, p_action text, p_quote numeric DEFAULT NULL::numeric, p_eta integer DEFAULT NULL::integer, p_note text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.emergency_candidates; r public.emergency_requests;
begin
  select * into c from public.emergency_candidates where id = p_candidate for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(c.workspace_id, array['owner','manager','member']);
  select * into r from public.emergency_requests where id = c.request_id;
  if p_action = 'open' then
    update public.emergency_candidates set opened_at = coalesce(opened_at, now()), status = case when status = 'delivered' then 'opened' else status end where id = c.id;
    return;
  end if;
  if r.status not in ('open','matching') or c.status not in ('delivered','opened','interested','quoted') then raise exception 'not_open' using errcode = '22023'; end if;
  if p_action = 'decline' then
    update public.emergency_candidates set status = 'declined', responded_at = now(), note = left(coalesce(p_note, ''), 1000) where id = c.id;
  elsif p_action in ('interested','quote') then
    if p_action = 'quote' and (p_quote is null or p_quote <= 0) then raise exception 'invalid_quote' using errcode = '22023'; end if;
    update public.emergency_candidates set status = case when p_action = 'quote' then 'quoted' else 'interested' end, quote_amount = coalesce(round(p_quote, 2), quote_amount),
      eta_minutes = coalesce(p_eta, eta_minutes), note = left(coalesce(p_note, ''), 1000), responded_at = now(), opened_at = coalesce(opened_at, now()) where id = c.id;
    perform public.notify_event(r.event_id, 'quote_received', 'Emergency response received',
      case when p_action = 'quote' then 'A provider quoted ' || public.fmt_money(round(p_quote, 2), public.listing_charge_currency(c.listing_id)) || ' for ' || r.category || '.' else 'A provider is interested in your ' || r.category || ' request.' end,
      public.event_path(r.event_id, 'emergency', r.id));
  else raise exception 'invalid_action' using errcode = '22023';
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', c.workspace_id, 'emergency.' || p_action, jsonb_build_object('candidate_id', c.id, 'request_id', r.id));
end $function$;

-- accept_emergency_candidate: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.accept_emergency_candidate(p_candidate uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.emergency_candidates; r public.emergency_requests; l public.listings; bid uuid;
begin
  select * into c from public.emergency_candidates where id = p_candidate for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into r from public.emergency_requests where id = c.request_id for update;
  if not public.can_edit_event(r.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if r.status not in ('open','matching') then raise exception 'request_closed' using errcode = '22023'; end if;
  if c.status <> 'quoted' or c.quote_amount is null then raise exception 'not_quoted' using errcode = '22023'; end if;
  select * into l from public.listings where id = c.listing_id;
  insert into public.build_items(event_id, listing_id, category, title, package, scope, image, amount, price_basis, status, role, terms_snapshot, notes, sort)
    values (r.event_id, c.listing_id, r.category, coalesce(l.name, 'Emergency supplier'), 'Emergency supply', left(r.scope, 500), l.image, c.quote_amount, 'fixed', 'draft', 'primary',
      jsonb_build_object('source', 'emergency', 'emergency_request', r.id, 'amount', c.quote_amount, 'eta_minutes', c.eta_minutes, 'accepted_at', now()), left(c.note, 2000), 90)
    returning id into bid;
  update public.build_items set status = 'quoted', updated_at = now() where id = bid; -- organiser confirms and pays through the normal booking flow
  update public.emergency_candidates set status = 'accepted', accepted_at = now(), build_item_id = bid where id = c.id;
  update public.emergency_candidates set status = 'not_selected' where request_id = r.id and id <> c.id and status in ('delivered','opened','interested','quoted');
  update public.emergency_requests set status = 'filled', filled_candidate_id = c.id, updated_at = now() where id = r.id;
  perform public.notify_workspace(c.workspace_id, array['owner','manager','member'], 'booking_confirmed', 'Emergency booking accepted',
    'The organiser accepted your quote of ' || public.fmt_money(c.quote_amount, public.booking_charge_currency(bid)) || '. Confirm and head out.', '/provider/opportunities/' || bid);
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'emergency.accepted', jsonb_build_object('request_id', r.id, 'candidate_id', c.id, 'build_item_id', bid));
  return bid;
end $function$;

-- payment_order_succeeded: 2 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.payment_order_succeeded(p_ref text, p_pi text, p_charge text, p_amount_minor bigint, p_livemode boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare po public.payment_orders; b public.build_items; e public.events; dep numeric; bal numeric; owner uuid; tx uuid; amt numeric;
begin
  select * into po from public.payment_orders where reference = p_ref for update;
  if not found then return 'unknown_order'; end if;
  if po.status not in ('amount_due','payment_pending','failed') then return 'already_applied'; end if;
  if p_amount_minor <> po.amount_minor + po.customer_fee_minor then
    update public.payment_orders set status = 'failed', failure_reason = 'amount_mismatch:' || p_amount_minor, updated_at = now() where id = po.id;
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', po.payee_workspace_id, 'payment.amount_mismatch', jsonb_build_object('payment_order', p_ref, 'expected', po.amount_minor + po.customer_fee_minor, 'got', p_amount_minor));
    return 'amount_mismatch';
  end if;
  update public.payment_orders set status = case when po.protected then 'protected_pending_delivery' else 'payment_succeeded' end, stripe_payment_intent = p_pi, stripe_charge = p_charge,
    livemode = p_livemode, updated_at = now() where id = po.id;
  tx := public.post_ledger_transaction('stripe:pi:' || p_pi, case po.kind when 'standby_fee' then 'standby_fee' when 'emergency_service' then 'emergency_service' when 'balance_payment' then 'balance_payment' else 'deposit' end,
    po.currency, (select jsonb_agg(x) from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('account', 'cash_stripe', 'amount_minor', po.amount_minor + po.customer_fee_minor, 'party_type', 'platform'),
      jsonb_build_object('account', 'platform_fee', 'amount_minor', -(po.platform_fee_minor + po.customer_fee_minor - po.platform_fee_vat_minor - po.customer_fee_vat_minor), 'party_type', 'platform'),
      jsonb_build_object('account', 'tax_payable', 'amount_minor', -(po.platform_fee_vat_minor + po.customer_fee_vat_minor), 'party_type', 'platform'),
      jsonb_build_object('account', 'provider_payable', 'amount_minor', -(po.amount_minor - po.platform_fee_minor), 'party_type', 'workspace', 'party_id', po.payee_workspace_id))) x where (x->>'amount_minor')::bigint <> 0),
    po.payee_workspace_id, po.event_id, 'payment_order', po.reference, po.description, p_pi, 'webhook');
  amt := po.amount_minor / 100.0;
  select * into b from public.build_items where id = po.build_item_id for update;
  select * into e from public.events where id = po.event_id;
  if po.kind in ('deposit','emergency_service') and b.status not in ('confirmed','active','fulfilled','completed') then
    dep := amt; bal := greatest(coalesce(b.amount, 0) - dep, 0);
    update public.build_items set status = 'confirmed', hold_expires_at = null, updated_at = now(),
      terms_snapshot = coalesce(terms_snapshot, '{}') || jsonb_build_object('amount', b.amount, 'deposit', dep, 'package', b.package, 'confirmed_at', now(), 'commission', po.commission,
        'cancellation', coalesce(b.terms_snapshot->'cancellation', (select q.terms->'cancellation' from public.provider_quotes q where q.id = nullif(b.quote->>'quote_id', '')::uuid),
          (select l.details->'cancellation' from public.listings l where l.id = b.listing_id)), 'payment_order', po.reference)
      where id = b.id;
    if (b.quote->>'quote_id') is not null then update public.provider_quotes set status = 'accepted' where id = (b.quote->>'quote_id')::uuid and status in ('sent','viewed'); end if;
    insert into public.payments(event_id, build_item_id, payee, kind, amount, status, due_at, paid_at, refundable, stripe_payment_intent)
      values (po.event_id, b.id, b.title, 'deposit', dep, 'paid', now(), now(), false, p_pi);
    if bal > 0 then insert into public.payments(event_id, build_item_id, payee, kind, amount, status, due_at, refundable)
      values (po.event_id, b.id, b.title, 'balance', bal, 'scheduled', greatest(coalesce(e.starts_at - interval '14 days', now() + interval '7 days'), now() + interval '1 day'), false); end if;
    update public.provider_jobs set payment_status = 'deposit_paid', paid_amount = coalesce(paid_amount, 0) + dep where build_item_id = b.id;
    if b.request_id is not null then update public.provider_requests set status = 'closed' where id = b.request_id; end if;
    select w.owner_id into owner from public.workspaces w where w.id = po.payee_workspace_id;
    perform public.notify_workspace(po.payee_workspace_id, array['owner','manager'], 'booking_confirmed', 'Booking confirmed: ' || coalesce(e.name, b.title),
      'Payment of ' || public.fmt_money(amt, po.currency) || ' received and protected until delivery.', '/provider/opportunities/' || b.id);
  elsif po.kind = 'balance_payment' then
    update public.payments set status = 'paid', paid_at = now(), stripe_payment_intent = p_pi where build_item_id = b.id and kind = 'balance' and status in ('scheduled','due','overdue');
    update public.provider_jobs set paid_amount = coalesce(paid_amount, 0) + amt, payment_status = 'paid' where build_item_id = b.id;
    perform public.notify_workspace(po.payee_workspace_id, array['owner','manager','finance'], 'provider.payout', 'Balance paid: ' || b.title, 'Balance of ' || public.fmt_money(amt, po.currency) || ' received.', '/provider/money');
  elsif po.kind = 'standby_fee' then
    update public.standby_commitments set fee_status = 'paid', fee_payment_ref = p_pi, updated_at = now() where id = po.standby_id;
    perform public.notify_workspace(po.payee_workspace_id, array['owner','manager'], 'provider.payout', 'Standby fee paid', 'Your standby commitment is now active. Keep the window free.', '/provider/opportunities/' || b.id);
  end if;
  insert into public.transactions(workspace_id, event_id, kind, category, description, amount, status, source, source_type, source_id, occurred_at, currency, counterparty, stripe_ref, fee_amount, net_amount)
    values (e.workspace_id, po.event_id, 'payment', coalesce(b.category, 'marketplace'), po.description, amt, 'completed', 'marketplace', 'payment_order', po.id, now(), po.currency, coalesce(b.title, ''), p_pi,
      po.platform_fee_minor / 100.0, (po.amount_minor - po.platform_fee_minor) / 100.0);
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', po.payee_workspace_id, 'payment.succeeded', jsonb_build_object('payment_order', p_ref, 'amount_minor', p_amount_minor));
  return 'applied';
end $function$;

-- dec107_default_rule_notice: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.dec107_default_rule_notice(p_dispute uuid, p_amount numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.dec107_settings; v text;
begin
  select * into s from public.dec107_settings where id;
  v := case when s.dispute_rules_in_force_from is not null and s.dispute_rules_in_force_from <= now()
            then 'Gala Dock Disputes Policy (' || s.dispute_rules_version || '), clause 13' else 'Gala Dock Payment Terms (' || s.payment_terms_version || '), clause 8.4' end;
  perform public.dec107_dispute_notice(p_dispute, 'dispute_default_rule', 'Default rule applied at the payment hold limit',
    'The payment provider''s hold limit was reached before this dispute was settled, so the default rule in the ' || v || ' applied: '
    || public.fmt_money(coalesce(p_amount, 0), public.dispute_currency(p_dispute)) || ' (the disputed amount) is refunded to the customer and the rest is released to the provider. '
    || 'This is not a decision on the dispute. The customer remains liable to pay the provider the refunded amount unless a court, arbitrator or ADR body decides otherwise or you both agree otherwise. '
    || 'The provider can ask Gala Dock for the customer''s contact details.');
  insert into public.audit_events(actor_type, event, metadata) values ('system', 'dispute.default_rule', jsonb_build_object('dispute_id', p_dispute, 'amount', p_amount, 'clause', v));
end $function$;

-- dispute_offer_settlement: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.dispute_offer_settlement(p_dispute uuid, p_refund numeric, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.booking_disputes; party text; sid uuid; paid numeric;
begin
  select * into d from public.booking_disputes where id = p_dispute for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  party := public.dispute_party(d);
  if party is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if d.status = 'resolved' then raise exception 'not_open' using errcode = '22023'; end if;
  paid := coalesce((d.payment_snapshot->>'paid_amount')::numeric, (d.payment_snapshot->>'amount')::numeric, 0);
  if p_refund is null or p_refund < 0 or (paid > 0 and p_refund > paid) then raise exception 'invalid_refund' using errcode = '22023'; end if;
  update public.booking_dispute_settlements set status = 'superseded' where dispute_id = d.id and status = 'open';
  insert into public.booking_dispute_settlements(dispute_id, offered_by, party, refund_minor, note) values (d.id, auth.uid(), party, round(p_refund * 100)::bigint, left(p_note, 1000)) returning id into sid;
  insert into public.booking_dispute_entries(dispute_id, author_id, party, kind, body) values (d.id, auth.uid(), party, 'proposal',
    'Settlement offer: refund ' || public.fmt_money(p_refund, public.dispute_currency(d.id)) || coalesce('. ' || left(p_note, 500), ''));
  perform public.dec107_dispute_notice(d.id, 'dispute_settlement_offer', 'Settlement offer on a dispute',
    'The ' || party || ' offered to settle with a refund of ' || public.fmt_money(p_refund, public.dispute_currency(d.id)) || '. Open the dispute to accept it.');
  return sid;
end $function$;

-- dec107_dispute_close: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.dec107_dispute_close(p_dispute uuid, p_basis text, p_refund_minor bigint, p_key text, p_by uuid, p_checked_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.booking_disputes;
begin
  select * into d from public.booking_disputes where id = p_dispute for update;
  -- Q58: every closing path (settlement, acceptance, deemed acceptance, award) refunds at most once per dispute.
  if not found or d.status = 'resolved' then raise exception 'not_open' using errcode = '22023'; end if;
  if coalesce(p_refund_minor, 0) > 0 and p_basis in ('default_rule','settlement','accepted_recommendation','independent_award') then
    insert into public.dec107_refund_instructions(basis, dispute_id, build_item_id, amount_minor, idempotency_key, created_by, checked_by)
      values (p_basis, d.id, d.build_item_id, p_refund_minor, p_key, p_by, p_checked_by) on conflict (idempotency_key) do nothing;
  end if;
  update public.booking_disputes set status = 'resolved', resolved_at = now(), updated_at = now(),
    resolution = coalesce(resolution, '{}'::jsonb) || jsonb_build_object('outcome', p_basis, 'refund_minor', coalesce(p_refund_minor, 0), 'closed_at', now())
   where id = d.id and status <> 'resolved';
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (p_by, case when p_basis = 'independent_award' then 'admin' when p_by is null then 'system' else 'user' end, d.workspace_id, 'dispute.' || p_basis,
      jsonb_build_object('dispute_id', d.id, 'refund_minor', coalesce(p_refund_minor, 0)));
  perform public.dec107_dispute_notice(d.id, 'dispute_resolved', 'Dispute resolved',
    case p_basis when 'settlement' then 'You agreed a settlement. ' when 'accepted_recommendation' then 'The recommendation applies. '
                 when 'lapsed' then 'The dispute lapsed: the party that opened it did not respond for 14 days after the other side answered (Disputes Policy clause 8.4). '
                 else 'An independent award was entered and checked. ' end
    || case when coalesce(p_refund_minor, 0) > 0 then 'A refund of ' || public.fmt_money_minor(p_refund_minor, public.dispute_currency(d.id)) || ' is sent to the customer''s original payment method; the rest is released to the provider.'
            else 'Any payment held for this booking is released to the provider.' end);
end $function$;

-- trg_shift_notify: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.trg_shift_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; ev text;
begin
  if new.crew_id is null or new.status not in ('draft','pending','confirmed') then return null; end if;
  if TG_OP = 'UPDATE' and new.crew_id is not distinct from old.crew_id then return null; end if;
  select user_id into u from public.crew_members where id = new.crew_id;
  if u is null then return null; end if;
  select name into ev from public.events where id = new.event_id;
  perform public.notify(u, 'shift_assigned', 'New shift: ' || coalesce(nullif(new.title, ''), ev, new.role),
    new.role || ' · ' || public.fmt_event_time(new.starts_at, public.local_tz(new.event_id, new.workspace_id), 'Dy DD Mon HH24:MI') || '–' || public.fmt_event_time(new.ends_at, public.local_tz(new.event_id, new.workspace_id), 'HH24:MI', true) || coalesce(' · ' || nullif(new.location, ''), ''),
    public.my_shifts_link(new.workspace_id), 'shift.assigned:' || new.id || ':' || new.crew_id);
  if TG_OP = 'INSERT' then insert into public.shift_changes(shift_id, workspace_id, kind, to_crew) values (new.id, new.workspace_id, 'assigned', new.crew_id); end if;
  return null;
end $function$;

-- request_crew_availability: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.request_crew_availability(p_crew uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_note text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.crew_members; tid uuid;
begin
  select * into m from public.crew_members where id = p_crew;
  if not found or not public.has_workspace_role(m.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_to <= p_from then raise exception 'invalid_range' using errcode = '22023'; end if;
  insert into public.tasks(workspace_id, owner_id, title, detail, category, assignee_name, due_at, priority, status)
    values (m.workspace_id, auth.uid(), 'Availability request — ' || m.name, left(coalesce(p_note, ''), 400) || E'\ncrew:' || m.id || E'\nfrom:' || p_from || E'\nto:' || p_to,
      'availability_request', m.name, p_from - interval '2 days', 'medium', 'todo') returning id into tid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), m.workspace_id, 'team.availability_requested', jsonb_build_object('crew_id', m.id, 'task_id', tid));
  if m.user_id is not null then
    perform public.notify(m.user_id, 'availability_request', 'Are you available?', public.fmt_event_time(p_from, public.local_tz(null, m.workspace_id), 'Dy DD Mon HH24:MI') || ' – ' || public.fmt_event_time(p_to, public.local_tz(null, m.workspace_id), 'Dy DD Mon HH24:MI', true) || coalesce(E'\n' || nullif(p_note, ''), ''),
      public.my_shifts_link(m.workspace_id), 'availability.request:' || tid);
  end if;
  return tid;
end $function$;

-- request_leave: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.request_leave(p_ws uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_kind text DEFAULT 'annual'::text, p_note text DEFAULT ''::text, p_crew uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.crew_members; rid uuid; manager boolean := public.has_workspace_role(p_ws, array['owner','manager']);
begin
  if p_crew is null then select * into m from public.crew_members where workspace_id = p_ws and user_id = auth.uid() and status <> 'deactivated' limit 1;
  else select * into m from public.crew_members where id = p_crew and workspace_id = p_ws; end if;
  if not found or not public.is_workspace_member(p_ws) or (m.user_id is distinct from auth.uid() and not manager) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_to <= p_from then raise exception 'invalid_range' using errcode = '22023'; end if;
  if p_kind not in ('annual','sick','unpaid','other') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  insert into public.leave_requests(workspace_id, crew_id, kind, starts_at, ends_at, note) values (p_ws, m.id, p_kind, p_from, p_to, left(coalesce(p_note, ''), 500)) returning id into rid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'team.leave_requested', jsonb_build_object('leave_id', rid, 'crew_id', m.id));
  perform public.notify_workspace(p_ws, array['owner','manager'], 'leave_request', 'Leave request: ' || m.name,
    public.fmt_event_time(p_from, public.local_tz(null, p_ws), 'DD Mon') || ' – ' || public.fmt_event_time(p_to, public.local_tz(null, p_ws), 'DD Mon') || ' (' || p_kind || ')',
    case when (select kind from public.workspaces where id = p_ws) = 'provider' then '/provider/team' else '/organizer/team?tab=leave' end);
  return rid;
end $function$;

-- decide_leave: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.decide_leave(p_request uuid, p_approve boolean, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.leave_requests; m public.crew_members; bid uuid; clashes jsonb;
begin
  select * into r from public.leave_requests where id = p_request for update;
  if not found or not public.has_workspace_role(r.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if r.status <> 'pending' then raise exception 'already_decided' using errcode = '22023'; end if;
  select * into m from public.crew_members where id = r.crew_id;
  if p_approve then
    insert into public.availability_blocks(workspace_id, crew_id, kind, starts_at, ends_at, note, created_by)
      values (r.workspace_id, r.crew_id, 'blocked', r.starts_at, r.ends_at, 'Leave (' || r.kind || ')', auth.uid()) returning id into bid;
  end if;
  update public.leave_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), decision_note = left(coalesce(p_note, ''), 500), block_id = bid where id = r.id;
  select coalesce(jsonb_agg(jsonb_build_object('shift_id', s.id, 'title', s.title, 'starts_at', s.starts_at) order by s.starts_at), '[]') into clashes
    from public.shifts s where p_approve and s.crew_id = r.crew_id and s.status in ('draft','pending','confirmed') and tstzrange(s.starts_at, s.ends_at) && tstzrange(r.starts_at, r.ends_at);
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), r.workspace_id, case when p_approve then 'team.leave_approved' else 'team.leave_rejected' end,
    jsonb_build_object('leave_id', r.id, 'crew_id', r.crew_id, 'conflicting_shifts', jsonb_array_length(clashes)));
  if m.user_id is not null then
    perform public.notify(m.user_id, 'leave_decision', 'Leave ' || case when p_approve then 'approved' else 'not approved' end,
      public.fmt_event_time(r.starts_at, public.local_tz(null, r.workspace_id), 'DD Mon') || ' – ' || public.fmt_event_time(r.ends_at, public.local_tz(null, r.workspace_id), 'DD Mon') || coalesce('. ' || nullif(p_note, ''), ''),
      public.my_shifts_link(r.workspace_id), 'leave.decided:' || r.id);
  end if;
  return jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end, 'block_id', bid, 'conflicting_shifts', clashes);
end $function$;

-- marketplace_sweep: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.marketplace_sweep()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; n_rem integer := 0; n_exp integer := 0; n_hold integer := 0; n_sb integer := 0; n_em integer := 0; n_ds integer := 0; ws_set uuid[] := '{}';
begin
  -- §34 escalating reminders: at half the window, then in the final hour (or final quarter for short windows).
  for r in select b.id, b.title, b.response_deadline, b.response_reminders, l.workspace_id,
             case when b.response_reminders = 0 and now() >= b.sent_at + (b.response_deadline - b.sent_at) / 2 then 1
                  when b.response_reminders <= 1 and b.response_deadline - now() <= least(interval '1 hour', (b.response_deadline - b.sent_at) / 4) then 2 end lvl
           from public.build_items b join public.listings l on l.id = b.listing_id
           where b.response_status = 'pending' and b.status in ('sent','awaiting','awaiting_provider') and b.response_deadline > now() and b.sent_at is not null loop
    continue when r.lvl is null;
    perform public.notify_workspace(r.workspace_id, array['owner','manager','member'], 'request_received',
      case when r.lvl = 2 then 'Response due soon: ' else 'Reminder: respond to ' end || r.title,
      'Respond by ' || public.fmt_event_time(r.response_deadline, public.local_tz(null, r.workspace_id), 'Dy DD Mon HH24:MI', true) || '. Missed deadlines affect your reliability.', '/provider/opportunities/' || r.id);
    update public.build_items set response_reminders = r.lvl where id = r.id;
    n_rem := n_rem + 1;
  end loop;
  -- Expired / No response — distinct from Declined and Unavailable (§33).
  for r in select b.id, b.event_id, b.title, l.workspace_id from public.build_items b join public.listings l on l.id = b.listing_id
           where b.status in ('sent','awaiting','awaiting_provider') and b.response_deadline < now() for update of b skip locked loop
    update public.build_items set status = 'expired', updated_at = now() where id = r.id;
    perform public.notify_event(r.event_id, 'request_received', 'No response: ' || r.title, 'The provider didn''t respond in time. You can resend or choose another provider.', public.event_path(r.event_id, 'booking', r.id));
    ws_set := ws_set || r.workspace_id; n_exp := n_exp + 1;
  end loop;
  -- Hold expiry (records and legacy held lines).
  for r in select h.id, h.build_item_id, h.event_id from public.conditional_holds h where h.status in ('requested','held') and
           ((h.status = 'held' and h.expires_at < now()) or (h.status = 'requested' and h.created_at + make_interval(hours => least(h.requested_hours, 48)) < now())) for update skip locked loop
    update public.conditional_holds set status = 'expired', closed_reason = 'expired', updated_at = now() where id = r.id;
    update public.build_items set status = coalesce(status_before_hold, 'available'), hold_expires_at = null, updated_at = now()
      where id = r.build_item_id and status in ('held','conditional_hold_requested','conditionally_held');
    perform public.notify_event(r.event_id, 'hold_expiry', 'A hold expired', 'A provider hold lapsed without confirmation. The date is no longer reserved.', public.event_path(r.event_id, 'booking', r.build_item_id));
    n_hold := n_hold + 1;
  end loop;
  update public.build_items set status = 'available', hold_expires_at = null, updated_at = now() where status = 'held' and hold_expires_at < now();
  -- Standby expiry / release after the window.
  with x as (update public.standby_commitments set status = case when status = 'accepted' then 'released' else 'expired' end, updated_at = now()
    where (status in ('requested','offered') and expires_at < now()) or (status = 'accepted' and window_end < now()) returning 1) select count(*) into n_sb from x;
  -- Emergency requests lapse at the required arrival time.
  with x as (update public.emergency_requests set status = 'expired', updated_at = now() where status in ('open','matching') and required_arrival < now() returning id),
       y as (update public.emergency_candidates c set status = 'expired' from x where c.request_id = x.id and c.status in ('delivered','opened','interested','quoted') returning 1)
  select count(*) into n_em from x;
  -- Disputes move to platform review when the response window passes.
  with x as (update public.booking_disputes set status = 'review', updated_at = now() where status in ('opened','evidence_collection','provider_response') and response_due_at < now() returning 1)
  select count(*) into n_ds from x;
  for r in select distinct unnest(ws_set) ws loop perform public.recompute_reliability(r.ws); end loop;
  return jsonb_build_object('reminders', n_rem, 'expired_requests', n_exp, 'expired_holds', n_hold, 'standby', n_sb, 'emergency', n_em, 'disputes_to_review', n_ds);
end $function$;

-- create_emergency_request: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.create_emergency_request(p_event uuid, p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rid uuid; n integer; c record; e public.events; orig public.build_items;
begin
  if not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event;
  if (p->>'required_arrival') is null or (p->>'required_arrival')::timestamptz < now() - interval '15 minutes' then raise exception 'invalid_arrival' using errcode = '22023'; end if;
  if (p->>'original_item_id') is not null then
    select * into orig from public.build_items where id = (p->>'original_item_id')::uuid and event_id = p_event;
    if not found then raise exception 'invalid_original' using errcode = '22023'; end if;
  end if;
  if exists (select 1 from public.emergency_requests where event_id = p_event and created_at > now() - interval '1 hour' group by event_id having count(*) >= 5) then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  insert into public.emergency_requests(event_id, created_by, severity, category, required_arrival, location, lat, lng, original_item_id, failure_reason, scope, budget_max, status)
  values (p_event, auth.uid(), coalesce(p->>'severity', 'high'), lower(p->>'category'), (p->>'required_arrival')::timestamptz,
    left(coalesce(nullif(p->>'location', ''), e.venue_name, e.location, ''), 300),
    coalesce(nullif(p->>'lat', '')::float8, (select v.lat from public.listings v where v.id = e.venue_listing_id)),
    coalesce(nullif(p->>'lng', '')::float8, (select v.lng from public.listings v where v.id = e.venue_listing_id)),
    orig.id, left(coalesce(p->>'failure_reason', ''), 1000), left(coalesce(p->>'scope', ''), 2000), nullif(p->>'budget_max', '')::numeric, 'open')
  returning id into rid;
  insert into public.emergency_candidates(request_id, workspace_id, listing_id, distance_km)
    select rid, m.workspace_id, m.listing_id, m.distance_km from public.emergency_match(rid, coalesce(nullif(p->>'pool', '')::int, 8)) m;
  get diagnostics n = row_count;
  update public.emergency_requests set pool_size = n, status = case when n > 0 then 'matching' else 'open' end where id = rid;
  for c in select workspace_id from public.emergency_candidates where request_id = rid loop
    perform public.notify_workspace(c.workspace_id, array['owner','manager','member'], 'provider.request', 'Emergency request: ' || lower(p->>'category'),
      'Needed by ' || public.fmt_event_time((p->>'required_arrival')::timestamptz, public.local_tz(e.id, e.workspace_id), 'Dy DD Mon HH24:MI', true) || '. Respond fast to be considered.', '/provider/emergency/' || rid);
  end loop;
  if orig.id is not null and orig.status = 'confirmed' then update public.build_items set status = 'replacement_required', updated_at = now() where id = orig.id; end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'emergency.created', jsonb_build_object('request_id', rid, 'pool', n, 'category', p->>'category'));
  return rid;
end $function$;

-- team_conflicts: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.team_conflicts(p_workspace uuid, p_from timestamp with time zone DEFAULT now(), p_to timestamp with time zone DEFAULT (now() + '60 days'::interval))
 RETURNS TABLE(kind text, severity text, shift_id uuid, other_id uuid, crew_id uuid, event_id uuid, message text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
         coalesce(nullif(s.role, ''), 'A role') || ' needed for ' || coalesce(ev.name, s.title) || ' (' || public.fmt_event_time(s.starts_at, public.local_tz(s.event_id, s.workspace_id), 'FMDD Mon HH24:MI', true) || '): no one assigned'
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
end $function$;

