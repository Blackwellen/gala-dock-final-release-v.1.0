-- Event cancellation causes (Organizer Terms 2.4). Buyers are always refunded in full, booking fee included, whatever the cause.
-- What the organiser owes Gala Dock depends on why the event was cancelled:
--   organiser      the organiser's own decision (low sales, change of plans…): platform fees on sold tickets stay payable.
--   force_majeure  the organiser claims the event can't lawfully or safely go ahead for reasons outside their control: the fees are
--                  put on hold (never collected) until Gala Dock reviews the evidence. Approved → waived in full; rejected → due.
--   platform       Gala Dock cancels (e.g. trust & safety): no fees charged.
begin;

alter table public.event_cancellations add column if not exists cause text not null default 'organiser';
alter table public.event_cancellations drop constraint if exists event_cancellations_cause_check;
alter table public.event_cancellations add constraint event_cancellations_cause_check check (cause in ('organiser','force_majeure','platform'));
alter table public.event_cancellations add column if not exists fm_detail text check (fm_detail is null or length(fm_detail) <= 4000);
alter table public.event_cancellations add column if not exists fm_status text not null default 'none';
alter table public.event_cancellations drop constraint if exists event_cancellations_fm_status_check;
alter table public.event_cancellations add constraint event_cancellations_fm_status_check check (fm_status in ('none','pending','approved','rejected'));
alter table public.event_cancellations add column if not exists reviewed_by uuid references auth.users(id);
alter table public.event_cancellations add column if not exists reviewed_at timestamptz;
alter table public.event_cancellations add column if not exists review_note text;

alter table public.platform_charges drop constraint if exists platform_charges_status_check;
alter table public.platform_charges add constraint platform_charges_status_check check (status in ('on_hold','due','settled','waived'));

drop function if exists public.cancel_event_with_refunds(uuid, text);
create or replace function public.cancel_event_with_refunds(p_event uuid, p_reason text, p_cause text default 'organiser', p_fm_detail text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.events; n_orders integer; n_tickets integer; chg numeric; n_chg integer; is_admin boolean; cause text := coalesce(p_cause, 'organiser');
begin
  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  is_admin := public.has_admin_permission('tickets');
  if not (public.has_workspace_role(e.workspace_id, array['owner','manager']) or is_admin) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if cause not in ('organiser','force_majeure','platform') then raise exception 'invalid_cause' using errcode = '22023'; end if;
  if cause = 'platform' and not is_admin then raise exception 'not_authorized' using errcode = '42501'; end if;
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
          then 'Buyers are being refunded in full. You told us the event can’t go ahead for reasons outside your control, so platform fees of £' || to_char(chg, 'FM999999990.00') || ' are on hold while we review it (usually within 5 working days). If we accept it, the fees are waived in full.'
          else 'Buyers are being refunded in full. Platform fees of £' || to_char(chg, 'FM999999990.00') || ' on the tickets sold remain payable and will be deducted from your next payout or invoiced.' end,
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
end $$;
revoke all on function public.cancel_event_with_refunds(uuid, text, text, text) from public, anon;
grant execute on function public.cancel_event_with_refunds(uuid, text, text, text) to authenticated, service_role;

-- Gala Dock's decision on a force majeure claim. Approve → fees waived; reject → fees due (with the reason sent to the organiser).
create or replace function public.admin_review_force_majeure(p_event uuid, p_approve boolean, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
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
      case when p_approve then 'We accepted that ' || e.name || ' couldn’t go ahead for reasons outside your control. Platform fees' || case when amt is not null then ' of £' || to_char(amt, 'FM999999990.00') else '' end || ' are waived.'
           else 'We reviewed your force majeure claim for ' || e.name || ' and couldn’t accept it: ' || left(trim(p_reason), 400) || ' Platform fees' || case when amt is not null then ' of £' || to_char(amt, 'FM999999990.00') else '' end
                || ' are now payable. If you have more evidence, contact support within 14 days and we’ll look again.' end,
      '/organizer/money');
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), e.workspace_id, case when p_approve then 'admin.force_majeure_approved' else 'admin.force_majeure_rejected' end,
      jsonb_build_object('event_id', p_event, 'amount', amt, 'reason', left(p_reason, 300)));
  return case when p_approve then 'approved' else 'rejected' end;
end $$;
revoke all on function public.admin_review_force_majeure(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_force_majeure(uuid, boolean, text) to authenticated, service_role;

commit;
