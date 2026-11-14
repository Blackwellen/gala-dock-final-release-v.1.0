-- Q67 settings & billing build (owner decisions 2026-11-14 (1), (5)). Additive only: new table, new columns (nullable / defaulted),
-- new functions and triggers, and create-or-replace of four existing functions with UNCHANGED signatures:
--   email_category (adds billing/chargeback → payments and legal/terms/policy → security, both mandatory),
--   trg_notification_email (also honours the organiser workspace "Email" switch), notify_workspace (records the workspace).
--
-- 1. Organiser notification switches (workspaces.settings.notifications) now reach delivery:
--      in_app=false → workspace alerts are stored muted (already read, hidden from the bell) — email can still go;
--      email=false  → no email for workspace alerts;   both off → the alert is not created;
--      agent=false  → Gala Agent updates (kind 'agent' / 'agent.*') are not created — approval requests ('agent_approval') always are.
--    Mandatory kinds (security, payments/payouts/refunds/invoices/billing, disputes/chargebacks, legal/terms/policy) ignore every switch.
--    A notification belongs to a workspace when the sender says so (notify_workspace sets workspace_id), or when it links into
--    /organizer and the recipient belongs to exactly one active organiser workspace (members of several are never guessed).
-- 2. Workspace ownership transfer: owner → active manager, accepted in-app by the new owner, atomic role swap, audited, blockers.
-- 3. Plan limits (decision 5) on NEW creation/publish only, inside the database: active events (not draft/archived/completed/
--    cancelled), seats (owner + active members + pending invites), live listings (published and not paused). Enterprise / null =
--    unlimited; demo and QA-fixture workspaces are exempt (same rule as manual payouts); system writes (no auth.uid()) are not limited.
-- 4. Brand colour lookups for the public event page and the client portal (anon-safe: published public events / valid token only).
-- 5. Sign-in email change → audit row, security notice (to the NEW address) and a Stripe customer-contact sync job; the same job
--    runs after an ownership transfer so the workspace billing customer follows the new owner.

-- ── 1. Notifications ────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.notifications add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
alter table public.notifications add column if not exists muted boolean not null default false;
comment on column public.notifications.muted is 'Q67: stored for the record/email but hidden from the bell (organiser workspace switched in-app alerts off).';

create or replace function public.email_category(p_kind text)
returns table(category text, mandatory boolean) language sql immutable as $$
  select case
    when p_kind in ('security') or p_kind ~ '(legal|terms|policy)' then 'security'
    when p_kind ~ '(payment|payout|refund|invoice|dispute|cancellation|billing|chargeback)' then 'payments'
    when p_kind ~ '(ticket|waitlist|transfer)' then 'tickets'
    when p_kind ~ '(quote|request|hold|booking|standby|emergency|opportunit)' then 'quotes'
    when p_kind ~ '(message)' then 'messages'
    when p_kind ~ '(reminder|deadline|expiry)' then 'reminders'
    when p_kind ~ '(event|incident|agent)' then 'event_updates'
    else null end,
  p_kind in ('security') or p_kind ~ '(payment|payout|refund|invoice|dispute|cancellation|billing|chargeback|legal|terms|policy)';
$$;

create or replace function public.notification_mandatory(p_kind text) returns boolean
language sql immutable set search_path = '' as $$ select coalesce((select c.mandatory from public.email_category(p_kind) c), false); $$;
grant execute on function public.notification_mandatory(text) to authenticated, service_role;

/** The organiser workspace a notification belongs to (explicit, or a single organiser membership for /organizer links). */
create or replace function public.notification_workspace(p_user uuid, p_link text, p_explicit uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid; n int;
begin
  if p_explicit is not null then return p_explicit; end if;
  if coalesce(p_link, '') !~ '^/organizer([/?#]|$)' then return null; end if;
  select count(*), min(m.workspace_id::text)::uuid into n, v from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
   where m.user_id = p_user and m.status = 'active' and w.kind = 'organizer' and w.status = 'active';
  return case when n = 1 then v else null end;
end $$;
revoke all on function public.notification_workspace(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.notification_workspace(uuid, text, uuid) to service_role;

create or replace function public.trg_notification_workspace_prefs() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ws uuid; w record; prefs jsonb;
begin
  begin
    ws := public.notification_workspace(new.user_id, new.link, new.workspace_id);
    if ws is null then return new; end if;
    select kind, settings into w from public.workspaces where id = ws;
    if w.kind is distinct from 'organizer' then return new; end if;   -- provider workspaces keep their own per-kind settings
    new.workspace_id := ws;
    if public.notification_mandatory(new.kind) then return new; end if;
    prefs := coalesce(w.settings -> 'notifications', '{}'::jsonb);
    if (new.kind = 'agent' or new.kind like 'agent.%') and coalesce((prefs ->> 'agent')::boolean, true) = false then return null; end if;
    if coalesce((prefs ->> 'in_app')::boolean, true) = false then
      if coalesce((prefs ->> 'email')::boolean, true) = false then return null; end if;
      new.muted := true; new.read_at := coalesce(new.read_at, now());
    end if;
    return new;
  exception when others then return new;   -- preferences must never lose a notification by accident
  end;
end $$;
revoke all on function public.trg_notification_workspace_prefs() from public, anon, authenticated;

drop trigger if exists gd_notification_workspace_prefs on public.notifications;
create trigger gd_notification_workspace_prefs before insert on public.notifications for each row execute function public.trg_notification_workspace_prefs();

create or replace function public.trg_notification_email()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c record; addr text; prefs jsonb; v_body text;
begin
  select * into c from public.email_category(new.kind);
  if c.category is null then return new; end if;
  select u.email, p.notifications into addr, prefs from auth.users u left join public.profiles p on p.id = u.id where u.id = new.user_id;
  if addr is null then return new; end if;
  if not c.mandatory and coalesce((prefs ->> c.category)::boolean, true) = false then return new; end if;
  -- Q67: the organiser workspace "Email notifications" switch (mandatory kinds always go).
  if not c.mandatory and new.workspace_id is not null
     and coalesce(((select w.settings -> 'notifications' from public.workspaces w where w.id = new.workspace_id and w.kind = 'organizer') ->> 'email')::boolean, true) = false then
    return new;
  end if;
  v_body := case when c.category = 'messages'
                 then 'You have a new message on Gala Dock. Open your inbox to read and reply. For your privacy, message text is never included in emails.'
                 else left(coalesce(new.body, ''), 4000) end;
  insert into public.email_outbox(user_id, to_email, category, subject, body, link, notification_id)
    values (new.user_id, addr, c.category, left(new.title, 200), v_body, new.link, new.id) on conflict (notification_id) do nothing;
  return new;
exception when others then return new;   -- email must never block the in-app notification
end $$;

create or replace function public.notify_workspace(p_ws uuid, p_roles text[], p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(user_id, kind, title, body, link, workspace_id)
  select m.user_id, p_kind, left(p_title, 140), left(coalesce(p_body, ''), 600), p_link, p_ws
  from public.workspace_members m where m.workspace_id = p_ws and m.status = 'active' and m.role = any(p_roles);
$$;

-- ── 2. Brand colour ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Settings page writes settings.brand_color; onboarding writes settings.brand.brand_color. Only a #rrggbb value is returned; the app
-- clamps it to WCAG AA contrast before it is used (src/lib/brand/accent.ts).
create or replace function public.workspace_brand_color(p_ws uuid) returns text
language sql stable security definer set search_path = '' as $$
  select c from (select coalesce(nullif(w.settings ->> 'brand_color', ''), w.settings -> 'brand' ->> 'brand_color') c from public.workspaces w where w.id = p_ws) x
  where c ~ '^#[0-9A-Fa-f]{6}$';
$$;
revoke all on function public.workspace_brand_color(uuid) from public, anon;
grant execute on function public.workspace_brand_color(uuid) to authenticated, service_role;

create or replace function public.public_event_brand(p_event uuid) returns text
language sql stable security definer set search_path = '' as $$
  select public.workspace_brand_color(e.workspace_id) from public.events e
  where e.id = p_event and e.visibility = 'public' and e.status in ('published','on_sale','live','completed');
$$;
revoke all on function public.public_event_brand(uuid) from public;
grant execute on function public.public_event_brand(uuid) to anon, authenticated, service_role;

create or replace function public.portal_brand(p_token_hash text) returns text
language sql stable security definer set search_path = '' as $$
  select public.workspace_brand_color(e.workspace_id) from public.events e where e.id = (public.portal_link_for(p_token_hash)).event_id;
$$;
revoke all on function public.portal_brand(text) from public;
grant execute on function public.portal_brand(text) to anon, authenticated, service_role;

-- ── 3. Plan limits ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.plan_limit_exempt(p_ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_demo_workspace(p_ws) or coalesce((select w.is_test_fixture from public.workspaces w where w.id = p_ws), false);
$$;
/** Numeric cap for a capability (null = unlimited: enterprise rows, unknown kinds, or no row). */
create or replace function public.plan_limit_max(p_ws uuid, p_capability text) returns integer
language sql stable security definer set search_path = '' as $$
  select case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric::integer else null end from (select public.entitlement(p_ws, p_capability) v) x;
$$;
create or replace function public.workspace_active_events(p_ws uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.events e where e.workspace_id = p_ws and e.status not in ('draft','archived','completed','cancelled');
$$;
create or replace function public.workspace_live_listings(p_ws uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.listings l where l.workspace_id = p_ws and l.published and l.paused_at is null;
$$;
/** Seats = owner + active members + pending (unexpired) invitations; p_exclude_email leaves out the invite being accepted. */
create or replace function public.workspace_seats_used(p_ws uuid, p_exclude_email text default null) returns integer
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.workspace_members m where m.workspace_id = p_ws and m.status = 'active')::int
       + (select count(*) from public.workspace_invites i where i.workspace_id = p_ws and i.accepted_at is null and i.declined_at is null
            and i.revoked_at is null and i.expires_at > now() and (p_exclude_email is null or i.email <> lower(p_exclude_email)))::int;
$$;
revoke all on function public.plan_limit_exempt(uuid) from public, anon, authenticated;
revoke all on function public.plan_limit_max(uuid, text) from public, anon, authenticated;
revoke all on function public.workspace_active_events(uuid) from public, anon, authenticated;
revoke all on function public.workspace_live_listings(uuid) from public, anon, authenticated;
revoke all on function public.workspace_seats_used(uuid, text) from public, anon, authenticated;
grant execute on function public.plan_limit_exempt(uuid), public.plan_limit_max(uuid, text), public.workspace_active_events(uuid), public.workspace_live_listings(uuid), public.workspace_seats_used(uuid, text) to service_role;

/** Raises plan_limit_reached:<what> when one more item would exceed the cap (used = count BEFORE the new item). */
create or replace function public.assert_plan_limit(p_ws uuid, p_what text, p_used integer) returns void
language plpgsql stable security definer set search_path = '' as $$
declare cap text := case p_what when 'events' then 'events.active.max' when 'seats' then 'team.max' when 'listings' then 'listings.max' end; mx integer; pl text;
begin
  if cap is null or p_ws is null then return; end if;
  mx := public.plan_limit_max(p_ws, cap);
  if mx is null or p_used < mx or public.plan_limit_exempt(p_ws) then return; end if;
  select coalesce(plan, 'starter') into pl from public.workspaces where id = p_ws;
  raise exception 'plan_limit_reached:%', p_what using errcode = 'P0001',
    detail = jsonb_build_object('limit', p_what, 'used', p_used, 'max', mx, 'plan', pl)::text,
    hint = 'Upgrade the plan in Settings → Payments & Billing; existing items are not affected.';
end $$;
revoke all on function public.assert_plan_limit(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.assert_plan_limit(uuid, text, integer) to service_role;

create or replace function public.trg_plan_limit_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare inactive text[] := array['draft','archived','completed','cancelled'];
begin
  if auth.uid() is null or new.workspace_id is null or new.status = any(inactive) then return new; end if;
  if tg_op = 'UPDATE' and not (old.status = any(inactive)) and old.workspace_id is not distinct from new.workspace_id then return new; end if;   -- already active
  perform pg_advisory_xact_lock(hashtext('plan-limit:events:' || new.workspace_id::text));
  -- BEFORE trigger: the table still holds the old (inactive / other-workspace) row, so the count is "active events besides this one".
  perform public.assert_plan_limit(new.workspace_id, 'events', public.workspace_active_events(new.workspace_id));
  return new;
end $$;
revoke all on function public.trg_plan_limit_events() from public, anon, authenticated;
drop trigger if exists gd_plan_limit_events on public.events;
create trigger gd_plan_limit_events before insert or update of status, workspace_id on public.events for each row execute function public.trg_plan_limit_events();

create or replace function public.trg_plan_limit_listings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.workspace_id is null or not (new.published and new.paused_at is null) then return new; end if;
  if tg_op = 'UPDATE' and old.published and old.paused_at is null and old.workspace_id is not distinct from new.workspace_id then return new; end if;   -- already live
  perform pg_advisory_xact_lock(hashtext('plan-limit:listings:' || new.workspace_id::text));
  perform public.assert_plan_limit(new.workspace_id, 'listings', public.workspace_live_listings(new.workspace_id));
  return new;
end $$;
revoke all on function public.trg_plan_limit_listings() from public, anon, authenticated;
drop trigger if exists gd_plan_limit_listings on public.listings;
create trigger gd_plan_limit_listings before insert or update of published, paused_at, workspace_id on public.listings for each row execute function public.trg_plan_limit_listings();

create or replace function public.trg_plan_limit_invites() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.accepted_at is not null or new.revoked_at is not null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('plan-limit:seats:' || new.workspace_id::text));
  perform public.assert_plan_limit(new.workspace_id, 'seats', public.workspace_seats_used(new.workspace_id));
  return new;
end $$;
revoke all on function public.trg_plan_limit_invites() from public, anon, authenticated;
drop trigger if exists gd_plan_limit_invites on public.workspace_invites;
create trigger gd_plan_limit_invites before insert on public.workspace_invites for each row execute function public.trg_plan_limit_invites();

-- Accepting a pending invitation never fails (that seat was counted when it was sent); restoring a removed member or adding one
-- directly takes a new seat.
create or replace function public.trg_plan_limit_members() returns trigger
language plpgsql security definer set search_path = '' as $$
declare em text;
begin
  if auth.uid() is null or new.status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' then return new; end if;
  select lower(email) into em from auth.users where id = new.user_id;
  if exists (select 1 from public.workspace_invites i where i.workspace_id = new.workspace_id and i.email = em and i.accepted_at is null
               and i.declined_at is null and i.revoked_at is null and i.expires_at > now()) then return new; end if;
  perform pg_advisory_xact_lock(hashtext('plan-limit:seats:' || new.workspace_id::text));
  perform public.assert_plan_limit(new.workspace_id, 'seats', public.workspace_seats_used(new.workspace_id, em));
  return new;
end $$;
revoke all on function public.trg_plan_limit_members() from public, anon, authenticated;
drop trigger if exists gd_plan_limit_members on public.workspace_members;
create trigger gd_plan_limit_members before insert or update of status on public.workspace_members for each row execute function public.trg_plan_limit_members();

/** Usage vs plan caps for the settings / upgrade prompts. Members of the workspace (or the service role) only. */
create or replace function public.plan_limit_status(p_ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare w public.workspaces;
begin
  if auth.uid() is not null and not public.is_workspace_member(p_ws) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into w from public.workspaces where id = p_ws;
  if not found then return null; end if;
  return jsonb_build_object('plan', coalesce(w.plan, 'starter'), 'kind', w.kind, 'exempt', public.plan_limit_exempt(p_ws),
    'events', jsonb_build_object('used', public.workspace_active_events(p_ws), 'max', public.plan_limit_max(p_ws, 'events.active.max')),
    'seats', jsonb_build_object('used', public.workspace_seats_used(p_ws), 'max', public.plan_limit_max(p_ws, 'team.max')),
    'listings', jsonb_build_object('used', public.workspace_live_listings(p_ws), 'max', public.plan_limit_max(p_ws, 'listings.max')),
    'reporting_advanced', public.has_capability(p_ws, 'reporting.advanced') or public.plan_limit_exempt(p_ws));
end $$;
revoke all on function public.plan_limit_status(uuid) from public, anon;
grant execute on function public.plan_limit_status(uuid) to authenticated, service_role;

-- ── 4. Ownership transfer ───────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.workspace_ownership_transfers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  decided_at timestamptz,
  decided_by uuid
);
create unique index if not exists workspace_ownership_transfers_one_pending on public.workspace_ownership_transfers(workspace_id) where status = 'pending';
create index if not exists workspace_ownership_transfers_to on public.workspace_ownership_transfers(to_user) where status = 'pending';
alter table public.workspace_ownership_transfers enable row level security;
drop policy if exists workspace_ownership_transfers_read on public.workspace_ownership_transfers;
create policy workspace_ownership_transfers_read on public.workspace_ownership_transfers for select to authenticated
  using (from_user = (select auth.uid()) or to_user = (select auth.uid()) or public.has_workspace_role(workspace_id, array['owner','manager']));
revoke all on public.workspace_ownership_transfers from anon;
grant select on public.workspace_ownership_transfers to authenticated;
grant all on public.workspace_ownership_transfers to service_role;

/**
 * What stops a handover (decided 2026-11-14, documented in docs/release/CLOSE_OUT_RUNBOOK.md): an open booking dispute or Stripe
 * chargeback on the workspace, an active payout pause, a plan subscription that is past due/unpaid, a new owner who has asked to
 * delete their account, or a new owner without two-step verification when the workspace policy requires it for owners.
 */
create or replace function public.ownership_transfer_blockers(p_ws uuid, p_to uuid) returns table(code text, detail text)
language plpgsql stable security definer set search_path = '' as $$
declare w public.workspaces;
begin
  if auth.uid() is not null and not public.has_workspace_role(p_ws, array['owner','manager']) and auth.uid() is distinct from p_to then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into w from public.workspaces where id = p_ws;
  return query
  select 'open_dispute'::text, ('Booking dispute ' || d.reference || ' is still open. Resolve it first.')::text from public.booking_disputes d
   where d.status not in ('resolved','closed')
     and (d.workspace_id = p_ws or exists (select 1 from public.provider_jobs j where j.id = d.provider_job_id and j.workspace_id = p_ws))
  union all
  select 'open_chargeback', 'A card chargeback is still open on this workspace''s payments. Wait until it is decided.' from public.stripe_disputes s
   where s.status in ('needs_response','under_review','warning_needs_response','warning_under_review')
     and s.stripe_account_id is not null and s.stripe_account_id in (w.stripe_account_id, w.stripe_account_id_live)
   having count(*) > 0
  union all
  select 'payout_pause', 'Payouts are paused on this workspace. Ownership can move once the pause is lifted.' from public.payout_pauses p where p.workspace_id = p_ws and p.lifted_at is null having count(*) > 0
  union all
  select 'billing_overdue', 'The Gala Dock plan has an unpaid invoice. Pay it in Payments & Billing first.' from public.workspace_subscriptions s where s.workspace_id = p_ws and s.status in ('past_due','unpaid')
  union all
  select 'target_deleting', 'The new owner has asked to delete their account.' from public.profiles p where p.id = p_to and p.deletion_requested_at is not null
  union all
  select 'target_mfa', 'This workspace requires two-step verification for owners. The new owner must turn it on first.'
   where public.mfa_required(coalesce(w.settings -> 'security' ->> 'mfa_policy', 'optional'), 'owner')
     and not exists (select 1 from auth.mfa_factors f where f.user_id = p_to and f.status = 'verified');
end $$;
revoke all on function public.ownership_transfer_blockers(uuid, uuid) from public, anon;
grant execute on function public.ownership_transfer_blockers(uuid, uuid) to authenticated, service_role;

create or replace function public.request_ownership_transfer(p_ws uuid, p_to uuid, p_confirm text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); w public.workspaces; tid uuid; b record;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into w from public.workspaces where id = p_ws for update;
  if not found or w.owner_id is distinct from uid or w.status <> 'active' then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(p_ws);
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(btrim(w.name)) then raise exception 'confirm_mismatch' using errcode = '22023'; end if;
  if p_to = uid then raise exception 'invalid_target' using errcode = '22023'; end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_ws and m.user_id = p_to and m.status = 'active' and m.role = 'manager') then
    raise exception 'target_not_manager' using errcode = '22023';
  end if;
  if not public.hit_rate_limit('ownership-transfer:' || p_ws::text, 5, 86400) then raise exception 'rate_limited' using errcode = '54000'; end if;
  select * into b from public.ownership_transfer_blockers(p_ws, p_to) limit 1;
  if b.code is not null then raise exception 'transfer_blocked:%', b.code using errcode = '55000', detail = b.detail; end if;
  update public.workspace_ownership_transfers set status = 'expired', decided_at = now() where workspace_id = p_ws and status = 'pending' and expires_at <= now();
  if exists (select 1 from public.workspace_ownership_transfers where workspace_id = p_ws and status = 'pending') then raise exception 'transfer_pending' using errcode = '23505'; end if;
  insert into public.workspace_ownership_transfers(workspace_id, from_user, to_user) values (p_ws, uid, p_to) returning id into tid;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (uid, 'user', p_ws, 'workspace.ownership_transfer_requested', jsonb_build_object('transfer_id', tid, 'to_user', p_to));
  perform public.notify(p_to, 'security', 'You''ve been asked to take ownership of ' || w.name,
    'The current owner wants to make you the owner of ' || w.name || '. Review and accept within 7 days in Settings → Team & Access.',
    '/' || w.kind || '/settings?tab=team', 'ownership-transfer:' || tid || ':asked');
  perform public.notify(uid, 'security', 'Ownership transfer requested for ' || w.name,
    'You asked to transfer ownership of ' || w.name || '. Nothing changes until the new owner accepts. You can cancel it in Settings → Team & Access.',
    '/' || w.kind || '/settings?tab=team', 'ownership-transfer:' || tid || ':requested');
  return tid;
end $$;

create or replace function public.cancel_ownership_transfer(p_transfer uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t public.workspace_ownership_transfers;
begin
  select * into t from public.workspace_ownership_transfers where id = p_transfer for update;
  if not found or t.from_user is distinct from uid then raise exception 'not_authorized' using errcode = '42501'; end if;
  if t.status <> 'pending' then raise exception 'not_pending' using errcode = '55000'; end if;
  update public.workspace_ownership_transfers set status = 'cancelled', decided_at = now(), decided_by = uid where id = t.id;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (uid, 'user', t.workspace_id, 'workspace.ownership_transfer_cancelled', jsonb_build_object('transfer_id', t.id));
  perform public.notify(t.to_user, 'security', 'Ownership transfer cancelled', 'The owner cancelled the request to transfer the workspace to you.', null, 'ownership-transfer:' || t.id || ':cancelled');
end $$;

/** The new owner accepts (atomic swap) or declines. Accept re-checks every rule under the workspace row lock. */
create or replace function public.respond_ownership_transfer(p_transfer uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t public.workspace_ownership_transfers; w public.workspaces; b record; moved int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into t from public.workspace_ownership_transfers where id = p_transfer;
  if not found or t.to_user is distinct from uid then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into w from public.workspaces where id = t.workspace_id for update;
  select * into t from public.workspace_ownership_transfers where id = p_transfer for update;
  if t.status <> 'pending' then raise exception 'not_pending' using errcode = '55000'; end if;
  if t.expires_at <= now() then
    update public.workspace_ownership_transfers set status = 'expired', decided_at = now() where id = t.id;
    return jsonb_build_object('result', 'expired');
  end if;
  if not p_accept then
    update public.workspace_ownership_transfers set status = 'declined', decided_at = now(), decided_by = uid where id = t.id;
    insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (uid, 'user', t.workspace_id, 'workspace.ownership_transfer_declined', jsonb_build_object('transfer_id', t.id));
    perform public.notify(t.from_user, 'security', 'Ownership transfer declined', 'The manager you chose declined to take ownership of ' || w.name || '. You are still the owner.', '/' || w.kind || '/settings?tab=team', 'ownership-transfer:' || t.id || ':declined');
    return jsonb_build_object('result', 'declined');
  end if;
  perform public.require_step_up(t.workspace_id);
  if w.owner_id is distinct from t.from_user or w.status <> 'active' then raise exception 'owner_changed' using errcode = '55000'; end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id = uid and m.status = 'active' and m.role = 'manager') then
    raise exception 'target_not_manager' using errcode = '22023';
  end if;
  select * into b from public.ownership_transfer_blockers(w.id, uid) limit 1;
  if b.code is not null then raise exception 'transfer_blocked:%', b.code using errcode = '55000', detail = b.detail; end if;

  update public.workspace_members set role = 'manager' where workspace_id = w.id and user_id = t.from_user and role = 'owner';
  update public.workspace_members set role = 'owner' where workspace_id = w.id and user_id = uid;
  update public.workspaces set owner_id = uid where id = w.id;
  -- Pending invitations stay valid under the new owner (respond_to_invite requires the inviter to be the owner); they can revoke them.
  update public.workspace_invites set invited_by = uid where workspace_id = w.id and accepted_at is null and declined_at is null and revoked_at is null;
  get diagnostics moved = row_count;
  update public.workspace_ownership_transfers set status = 'accepted', decided_at = now(), decided_by = uid where id = t.id;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (uid, 'user', w.id, 'workspace.ownership_transferred', jsonb_build_object('transfer_id', t.id, 'from_user', t.from_user, 'to_user', uid, 'invites_moved', moved));
  perform public.notify(uid, 'security', 'You are now the owner of ' || w.name, 'Ownership of ' || w.name || ' has moved to you. The previous owner is now a manager.', '/' || w.kind || '/settings?tab=team', 'ownership-transfer:' || t.id || ':new-owner');
  perform public.notify(t.from_user, 'security', 'Ownership of ' || w.name || ' has moved', 'The new owner accepted. You are now a manager of ' || w.name || '.', '/' || w.kind || '/settings?tab=team', 'ownership-transfer:' || t.id || ':old-owner');
  perform public.enqueue_job('billing.sync_customer_contact', jsonb_build_object('workspace_id', w.id), 'billing-contact:transfer:' || t.id, null, w.id);
  return jsonb_build_object('result', 'accepted', 'kind', w.kind, 'workspace_id', w.id);
end $$;
revoke all on function public.request_ownership_transfer(uuid, uuid, text) from public, anon;
revoke all on function public.cancel_ownership_transfer(uuid) from public, anon;
revoke all on function public.respond_ownership_transfer(uuid, boolean) from public, anon;
grant execute on function public.request_ownership_transfer(uuid, uuid, text), public.cancel_ownership_transfer(uuid), public.respond_ownership_transfer(uuid, boolean) to authenticated, service_role;

-- ── 5. Stripe customer contact sync job + sign-in email change hook ─────────────────────────────────────────────────────────────
insert into public.job_kinds(kind, runtime, handler, max_attempts, backoff_seconds, lease_seconds, description)
values ('billing.sync_customer_contact', 'app', null, 5, array[10, 60, 300, 1800, 7200], 120,
        'Q67: copy the owner''s sign-in email to the Stripe billing customer(s) after an email change or ownership transfer (platform key mode only)')
on conflict (kind) do nothing;

create or replace function public.account_email_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    if new.email is distinct from old.email and old.email is not null and new.email is not null then
      insert into public.audit_events(actor_id, actor_type, event, metadata)
        values (new.id, 'user', 'auth.email_changed', jsonb_build_object('old_domain', split_part(old.email, '@', 2), 'new_domain', split_part(new.email, '@', 2)));
      perform public.notify(new.id, 'security', 'Your sign-in email was changed',
        'You now sign in to Gala Dock with this address. If you did not make this change, reset your password and contact support immediately.',
        '/account?tab=security', 'email-changed:' || new.id || ':' || md5(lower(new.email)));
      perform public.enqueue_job('billing.sync_customer_contact', jsonb_build_object('user_id', new.id), 'billing-contact:email:' || new.id || ':' || md5(lower(new.email)));
    end if;
  exception when others then null;   -- never block authentication
  end;
  return null;
end $$;
revoke all on function public.account_email_changed() from public, anon, authenticated;
drop trigger if exists gd_account_email_changed on auth.users;
create trigger gd_account_email_changed after update of email on auth.users for each row execute function public.account_email_changed();
