-- Q01 (lane A): step-up authentication for sensitive actions, session liveness, and a service-only security catalogue audit.
--
-- Supabase access tokens stay valid until they expire (jwt_exp = 3600 s on this project) even after the session is revoked, and
-- PostgREST only verifies the signature. So "sign out everywhere" / admin session revocation did not stop a stolen, unexpired token
-- from calling sensitive RPCs. require_step_up() closes that for the sensitive set:
--   * the JWT's session must still exist in auth.sessions (revoked/expired session -> 'session_revoked');
--   * a user who has a verified MFA factor must be on an aal2 session (-> 'step_up_required'); the UI already forces aal2 for such
--     users (src/lib/auth.ts), this stops a password-only token calling the RPC directly;
--   * when a workspace is given and its MFA policy requires MFA for the caller's role, an aal1 session is refused (-> 'mfa_required').
-- Service-role/cron callers (no JWT user) are trusted workers and pass.
-- Applied to: create_api_key, revoke_api_key, create_webhook_endpoint, set_webhook_endpoint_status, set_member_role,
-- promoter_set_payout_method, cancel_event_with_refunds and admin_require (every admin mutation).

create or replace function public.session_is_live()
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select case
    when (select auth.uid()) is null then true
    else exists (select 1 from auth.sessions s
                 where s.id::text = coalesce((select auth.jwt()) ->> 'session_id', '')
                   and s.user_id = (select auth.uid())
                   and (s.not_after is null or s.not_after > now()))
  end;
$function$;
revoke execute on function public.session_is_live() from public, anon;
grant execute on function public.session_is_live() to authenticated, service_role;

create or replace function public.require_step_up(p_workspace uuid default null)
returns void
language plpgsql
stable security definer
set search_path to ''
as $function$
declare uid uuid := auth.uid(); v_role text; v_policy text;
begin
  if uid is null then return; end if;
  if not public.session_is_live() then raise exception 'session_revoked' using errcode = '42501'; end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' then return; end if;
  if exists (select 1 from auth.mfa_factors f where f.user_id = uid and f.status = 'verified') then
    raise exception 'step_up_required' using errcode = '42501', hint = 'Verify your second factor, then retry.';
  end if;
  if p_workspace is not null then
    select case when w.owner_id = uid then 'owner' else m.role end, coalesce(w.settings -> 'security' ->> 'mfa_policy', 'optional')
      into v_role, v_policy
      from public.workspaces w left join public.workspace_members m on m.workspace_id = w.id and m.user_id = uid and m.status = 'active'
     where w.id = p_workspace;
    if v_role is not null and public.mfa_required(v_policy, v_role) then
      raise exception 'mfa_required' using errcode = '42501', hint = 'This workspace requires two-step verification for your role.';
    end if;
  end if;
end
$function$;
revoke execute on function public.require_step_up(uuid) from public, anon;
grant execute on function public.require_step_up(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_api_key(p_workspace uuid, p_name text, p_scopes text[], p_prefix text, p_hash text, p_expires timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v uuid;
begin
  if not public.has_workspace_role(p_workspace, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(p_workspace);
  if not public.has_capability(p_workspace, 'api.access') then raise exception 'plan_required:api.access' using errcode = '42501'; end if;
  if p_expires is not null and p_expires > now() + interval '400 days' then raise exception 'expiry_too_long' using errcode = '22023'; end if;
  if exists (select 1 from unnest(p_scopes) s where s !~ '^[a-z_]+:(read|write|scan)$') then raise exception 'invalid_scope' using errcode = '22023'; end if;
  insert into public.api_keys(workspace_id, name, prefix, key_hash, scopes, acts_as, expires_at) values (p_workspace, left(trim(p_name), 80), p_prefix, p_hash, p_scopes, auth.uid(), p_expires) returning id into v;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', p_workspace, 'api_key.created', jsonb_build_object('key_id', v, 'name', p_name, 'scopes', p_scopes, 'prefix', p_prefix));
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.revoke_api_key(p_key uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare k public.api_keys;
begin
  select * into k from public.api_keys where id = p_key;
  if not found or not public.has_workspace_role(k.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(k.workspace_id);
  update public.api_keys set revoked_at = now(), revoked_by = auth.uid() where id = p_key and revoked_at is null;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', k.workspace_id, 'api_key.revoked', jsonb_build_object('key_id', p_key, 'prefix', k.prefix));
end $function$
;

CREATE OR REPLACE FUNCTION public.create_webhook_endpoint(p_workspace uuid, p_url text, p_events text[], p_description text, p_secret text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v uuid;
begin
  if not public.has_workspace_role(p_workspace, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(p_workspace);
  if (select count(*) from public.webhook_endpoints where workspace_id = p_workspace) >= 10 then raise exception 'limit_reached' using errcode = '22023'; end if;
  insert into public.webhook_endpoints(workspace_id, url, events, description, secret, created_by) values (p_workspace, trim(p_url), p_events, left(coalesce(p_description, ''), 200), p_secret, auth.uid()) returning id into v;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', p_workspace, 'webhook.endpoint_created', jsonb_build_object('endpoint_id', v, 'url', p_url, 'events', p_events));
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_webhook_endpoint_status(p_endpoint uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.webhook_endpoints;
begin
  select * into e from public.webhook_endpoints where id = p_endpoint;
  if not found or not public.has_workspace_role(e.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(e.workspace_id);
  if p_status = 'deleted' then delete from public.webhook_endpoints where id = p_endpoint;
  elsif p_status in ('active','disabled') then update public.webhook_endpoints set status = p_status, consecutive_failures = 0, first_failure_at = null, disabled_reason = case when p_status = 'disabled' then 'Disabled by a workspace admin' end where id = p_endpoint;
  else raise exception 'invalid_status' using errcode = '22023'; end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', e.workspace_id, 'webhook.endpoint_' || p_status, jsonb_build_object('endpoint_id', p_endpoint));
end $function$
;

CREATE OR REPLACE FUNCTION public.set_member_role(p_ws uuid, p_user uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.has_workspace_role(p_ws, array['owner']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(p_ws);
  if p_role not in ('manager','member','finance') then raise exception 'invalid_role' using errcode = '22023'; end if;
  if exists(select 1 from public.workspace_members where workspace_id = p_ws and user_id = p_user and role = 'owner') then raise exception 'owner_locked' using errcode = '22023'; end if;
  update public.workspace_members set role = p_role where workspace_id = p_ws and user_id = p_user;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'workspace.role_changed', jsonb_build_object('user_id', p_user, 'role', p_role));
end $function$
;

CREATE OR REPLACE FUNCTION public.promoter_set_payout_method(p_promoter uuid, p_method text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ws uuid; v_event uuid;
begin
  if not public.owns_promoter(p_promoter) then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform public.require_step_up(null);
  if p_method is not null and p_method not in ('bank_transfer','paypal','stripe') then raise exception 'invalid_input' using errcode = '22023'; end if;
  update public.promoters set payout_method = p_method where id = p_promoter returning event_id into v_event;
  select workspace_id into v_ws from public.events where id = v_event;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), v_ws, 'promoter.payout_method_set', jsonb_build_object('promoter_id', p_promoter, 'method', p_method));
end $function$
;

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
  is_admin := public.has_admin_permission('tickets');
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
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_require(p_perm text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.has_admin_permission(p_perm) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(null);
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
end $function$
;

-- Service-only catalogue audit used by the tenant/security suite (tests/release/tenant-security.spec.ts) and ops diagnostics.
create or replace function public.security_catalog_audit()
returns jsonb
language sql
stable security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'definer', (select coalesce(jsonb_agg(jsonb_build_object('name', p.proname, 'args', pg_get_function_identity_arguments(p.oid),
        'returns', p.prorettype::regtype::text, 'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
        'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
        'search_path', coalesce(exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'), false)) order by p.proname), '[]'::jsonb)
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef),
    'tables', (select coalesce(jsonb_agg(jsonb_build_object('table', c.relname, 'rls', c.relrowsecurity,
        'policies', (select count(*) from pg_catalog.pg_policy pol where pol.polrelid = c.oid),
        'anon', (select coalesce(jsonb_agg(x), '[]'::jsonb) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) x where has_table_privilege('anon', c.oid, x)),
        'authenticated', (select coalesce(jsonb_agg(x), '[]'::jsonb) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) x where has_table_privilege('authenticated', c.oid, x))
      ) order by c.relname), '[]'::jsonb)
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')));
$function$;
revoke execute on function public.security_catalog_audit() from public, anon, authenticated;
grant execute on function public.security_catalog_audit() to service_role;
