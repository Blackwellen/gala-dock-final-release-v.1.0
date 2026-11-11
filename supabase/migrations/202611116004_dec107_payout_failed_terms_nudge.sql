-- DEC-107 enterprise gaps (2026-11-11, coordinator list):
--   1. payout.failed / canceled re-opens the releases that payout carried (blocked 'payout_failed'), so the money is paid out again
--      once the seller fixes their bank details (account.updated) or after 24 hours; the seller is told (mirror_connected_payout
--      already notifies; this adds the release wording).
--   2. Customer express term at first payment: payment_terms_customer_required() (Payment Terms version, user, time recorded by
--      accept_payment_terms('customer', …)); demo/QA users exempt by default (dec107_settings.exempt_demo_qa).
--   3. "Get ready to be paid" nudge for a provider without active payouts on its first request / hold / availability request
--      (once per workspace, dedupe key), the Gigvora pattern. The payment backstop stays COM_SELLER_NOT_READY.
-- Additive: new columns, functions and triggers, and one widened check constraint (consent purposes).

alter table public.dec107_settings add column if not exists require_customer_terms boolean not null default true;

-- ───────────── 0. express-term purposes (defect: 6001/6002 inserted purposes the check constraint refused) ─────────────
-- Widening only: the old list plus the DEC-107 express terms. Every existing row still satisfies it.
alter table public.consent_records drop constraint if exists consent_records_purpose_check;
alter table public.consent_records add constraint consent_records_purpose_check check (purpose = any (array['marketing_email','cookies_analytics','cookies_marketing','recording',
  'partner_sharing','terms','privacy_notice','experiments','payment_terms_seller','payment_terms_customer','dispute_rules']));
alter table public.consent_records drop constraint if exists consent_records_source_check;
alter table public.consent_records add constraint consent_records_source_check check (source = any (array['settings','signup','cookie_banner','profile','admin','import',
  'event_registration','app','payout_setup','checkout','booking_payment','dispute']));

-- ───────────── 1. failed payouts re-open their releases ─────────────
create or replace function public.dec107_payout_failed()
returns trigger language plpgsql security definer set search_path to '' as $$
declare n integer; ws uuid;
begin
  if new.status not in ('failed','canceled') or (tg_op = 'UPDATE' and old.status = new.status) then return new; end if;
  with x as (
    update public.payout_releases set status = 'blocked', blocked_reason = 'payout_failed', error = left('payout ' || new.stripe_payout_id || ' ' || new.status || coalesce(': ' || new.failure_code, ''), 300),
      stripe_payout_id = null, payout_group = null, released_at = null, updated_at = now()
     where stripe_payout_id = new.stripe_payout_id and status = 'paid_out'
    returning workspace_id)
  select count(*), max(workspace_id::text)::uuid into n, ws from x;
  -- A reserve part created by a failed main release is re-created when the main release is paid again.
  delete from public.payout_releases r where r.part = 'reserve' and r.status = 'held'
    and exists (select 1 from public.payout_releases m where m.source_type = r.source_type and m.source_ref = r.source_ref and m.part = 'main' and m.blocked_reason = 'payout_failed');
  if n > 0 then
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', ws, 'payout.failed_reopened',
      jsonb_build_object('payout', new.stripe_payout_id, 'releases', n, 'failure_code', new.failure_code));
    perform public.notify_workspace(ws, array['owner','manager','finance'], 'payout_failed', 'Payout returned to your Stripe balance',
      'Stripe could not pay ' || n || ' release(s) to your bank. The money is back in your own Stripe balance and is paid out again automatically once your bank details are fixed in Money → Payouts.',
      '/provider/money');
  end if;
  return new;
end $$;
revoke all on function public.dec107_payout_failed() from public, anon, authenticated;
drop trigger if exists dec107_payout_failed on public.connected_payouts;
create trigger dec107_payout_failed after insert or update of status on public.connected_payouts for each row execute function public.dec107_payout_failed();

/** Retry failed-payout releases when the seller's account changed since the failure, or after 24 hours. Called by the worker. */
create or replace function public.dec107_retry_failed_payouts()
returns integer language sql security definer set search_path to '' as $$
  with x as (
    update public.payout_releases pr set status = 'due', blocked_reason = null, updated_at = now()
     where pr.status = 'blocked' and pr.blocked_reason = 'payout_failed'
       and (pr.updated_at < now() - interval '24 hours'
         or exists (select 1 from public.connect_accounts ca where ca.stripe_account_id = pr.stripe_account_id and ca.payouts_enabled and ca.updated_at > pr.updated_at))
    returning 1)
  select count(*)::integer from x;
$$;
revoke all on function public.dec107_retry_failed_payouts() from public, anon, authenticated;

-- ───────────── 2. customer express term at first payment ─────────────
create or replace function public.payment_terms_customer_required()
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('required',
      auth.uid() is not null and s.require_customer_terms
      and not public.payment_terms_accepted('customer')
      and not (s.exempt_demo_qa and public.analytics_user_is_demo(auth.uid())),
    'version', s.payment_terms_version)
  from public.dec107_settings s where s.id;
$$;
revoke all on function public.payment_terms_customer_required() from public, anon;
grant execute on function public.payment_terms_customer_required() to authenticated;

-- ───────────── 3. "Get ready to be paid" nudge ─────────────
create or replace function public.dec107_payout_nudge()
returns trigger language plpgsql security definer set search_path to '' as $$
declare w record;
begin
  if new.kind not in ('request_received','availability_request','provider.hold','quote_request','opportunity') then return new; end if;
  for w in
    select ws.id from public.workspaces ws
     where ws.kind = 'provider' and ws.status = 'active' and coalesce(ws.payout_status, 'not_connected') <> 'active'
       and (ws.owner_id = new.user_id or exists (select 1 from public.workspace_members m where m.workspace_id = ws.id and m.user_id = new.user_id and m.status = 'active' and m.role in ('owner','manager')))
  loop
    perform public.notify(new.user_id, 'payout_setup_nudge', 'Get ready to be paid (about 5 minutes)',
      'Customers pay you directly into your own Stripe account. Set up payouts now so they can pay as soon as you agree a booking — nothing can be charged until your set-up is finished.',
      '/provider/money?tab=overview', 'dec107-nudge:' || w.id || ':' || new.user_id);
  end loop;
  return new;
exception when others then return new;   -- a nudge must never block the notification that triggered it
end $$;
revoke all on function public.dec107_payout_nudge() from public, anon, authenticated;
drop trigger if exists dec107_payout_nudge on public.notifications;
create trigger dec107_payout_nudge after insert on public.notifications for each row execute function public.dec107_payout_nudge();
