-- Phase 4 — Customer Event Build (master spec §66–71): authoritative budget buckets and primary-failure backup evaluation.
begin;

-- §70: never mix estimate with committed spend. Each bucket is computed from its own source of truth:
-- lines (estimated/requested/held/confirmed), payment orders + legacy payments (paid), standby commitments (standby fees).
create or replace function public.event_build_budget(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.events; r jsonb;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  with lines as (
    select b.id, b.category, coalesce(b.amount, 0) amount, b.status, b.role from public.build_items b where b.event_id = p_event and b.role <> 'backup'),
  paid as (
    select coalesce(sum(po.amount_minor - po.refunded_minor), 0) / 100.0 v from public.payment_orders po
      where po.event_id = p_event and po.kind in ('deposit','balance_payment','emergency_service')
        and po.status not in ('amount_due','payment_pending','failed','cancelled')),
  legacy as (
    select coalesce(sum(p.amount), 0) v from public.payments p where p.event_id = p_event and p.status = 'paid'
      and (p.stripe_payment_intent is null or not exists (select 1 from public.payment_orders po where po.stripe_payment_intent = p.stripe_payment_intent))),
  sb as (
    select coalesce(sum(s.standby_fee) filter (where s.status in ('accepted','activated')), 0) committed,
           coalesce(sum(s.standby_fee) filter (where s.status in ('accepted','activated') and s.fee_status = 'paid'), 0) paid
    from public.standby_commitments s where s.event_id = p_event),
  b as (
    select
      coalesce(sum(amount) filter (where status in ('suggested','draft')), 0) estimated,
      coalesce(sum(amount) filter (where status in ('sent','awaiting','awaiting_provider','available','quoted','quote_received','quote_revised','customer_reviewing','clarification','clarification_requested','conditional_hold_requested')), 0) requested,
      coalesce(sum(amount) filter (where status in ('held','conditionally_held')), 0) held,
      coalesce(sum(amount) filter (where status in ('confirmed','active','fulfilled','completion_pending','completed','cancellation_requested','disputed')), 0) confirmed,
      count(*) filter (where status in ('replacement_required','cancelled_by_provider')) replacements
    from lines)
  select jsonb_build_object(
    'target', e.budget_total, 'currency', coalesce(e.currency, 'GBP'),
    'estimated', b.estimated, 'requested', b.requested, 'held', b.held, 'confirmed', b.confirmed,
    'paid', round(paid.v + legacy.v, 2), 'due', greatest(round(b.confirmed - paid.v - legacy.v, 2), 0),
    'standby_fees', sb.committed, 'standby_fees_paid', sb.paid,
    'committed', b.confirmed + sb.committed,
    'remaining', case when e.budget_total is null then null else round(e.budget_total - b.confirmed - b.held - sb.committed, 2) end,
    'remaining_if_requested', case when e.budget_total is null then null else round(e.budget_total - b.confirmed - b.held - sb.committed - b.requested, 2) end,
    'replacements_needed', b.replacements)
  into r from b, paid, legacy, sb;
  return r;
end $$;
revoke all on function public.event_build_budget(uuid) from public, anon;
grant execute on function public.event_build_budget(uuid) to authenticated, service_role;

-- §71: primary failure → flag, evaluate backups, prompt replacement search, surface standby, notify.
create or replace function public.build_item_primary_failed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s record; bk record; n_backup integer := 0;
begin
  if new.status is distinct from old.status and new.role = 'primary'
     and new.status in ('cancelled_by_provider','declined','unavailable','replacement_required','expired','expired_no_response')
     and old.status in ('confirmed','held','conditionally_held','quoted','available','awaiting_confirmation','awaiting_payment','active','standby_accepted') then
    -- Paid standby first: binding cover the organiser already bought.
    for s in select sc.id, sc.build_item_id, l.name from public.standby_commitments sc join public.listings l on l.id = sc.listing_id
             where sc.primary_item_id = new.id and sc.status = 'accepted' loop
      perform public.notify_event(new.event_id, 'provider.request', 'Standby ready: ' || s.name,
        new.title || ' is no longer available. Activate your standby to secure cover now.', public.event_path(new.event_id, 'booking', s.build_item_id));
    end loop;
    -- Then backup preferences in the same category that are still live.
    for bk in select b.id, b.title, b.status from public.build_items b where b.event_id = new.event_id and b.category = new.category and b.id <> new.id
              and b.role = 'backup' and b.status in ('available','quoted','quote_received','held','conditionally_held','standby') order by b.sort limit 3 loop
      n_backup := n_backup + 1;
      perform public.notify_event(new.event_id, 'provider.request', 'Backup available: ' || bk.title,
        'Your primary ' || new.category || ' fell through. ' || bk.title || ' is ' || replace(bk.status, '_', ' ') || ' — promote them to primary.', public.event_path(new.event_id, 'booking', bk.id));
    end loop;
    if n_backup = 0 and not exists (select 1 from public.standby_commitments sc where sc.primary_item_id = new.id and sc.status = 'accepted') then
      perform public.notify_event(new.event_id, 'provider.request', 'Replacement needed: ' || new.title,
        'No backup or standby is lined up. Search the marketplace or start an Emergency Supply request.', public.event_path(new.event_id, 'booking', new.id));
    end if;
    insert into public.audit_events(actor_type, event, metadata)
      values ('system', 'build.primary_failed', jsonb_build_object('build_item_id', new.id, 'event_id', new.event_id, 'status', new.status, 'backups', n_backup));
  end if;
  return new;
end $$;

commit;
