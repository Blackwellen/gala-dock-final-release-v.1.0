-- Q08 (lane C) — Backward compatibility for the Stripe Connect history contract.
-- syncConnectAccount already writes exactly one verification_records row per Stripe state change (tests/foundation/webhook.spec.ts).
-- The guarded stripe_connect check (verification_checks) must not add intermediate rows there; its step history lives in
-- domain_outbox (verification.state_changed) and audit_events (provider.verification_changed). Business/identity checks keep
-- writing verification_records (with check_id/from_status). Removes only the rows the 202610293001 backfill wrote for stripe_connect.
create or replace function public.verification_step(p_check uuid, p_to text, p_actor uuid, p_actor_type text, p_reason_code text, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare c public.verification_checks; r jsonb; hist_kind text;
begin
  select * into c from public.verification_checks where id = p_check for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.status = p_to then return jsonb_build_object('ok', true, 'changed', false, 'state', c.status); end if;
  r := public.transition_state('verification', p_check, p_to, c.status, p_actor, coalesce(p_actor_type, 'system'), coalesce(p_reason_code, p_reason), null);
  if not coalesce((r->>'ok')::boolean, false) then return r; end if;
  update public.verification_checks set reason_code = p_reason_code, reason = left(p_reason, 500),
    decided_by = case when p_to in ('verified','action_required','rejected','suspended') then p_actor else decided_by end,
    decided_at = case when p_to in ('verified','action_required','rejected','suspended') then now() else decided_at end
  where id = p_check;
  hist_kind := case c.kind when 'business' then 'business' else 'identity' end;
  if c.workspace_id is not null then
    if c.kind <> 'stripe_connect' then
      insert into public.verification_records(workspace_id, kind, status, scope, evidence, decided_by, check_id, from_status, reason_code)
      values (c.workspace_id, hist_kind, p_to,
        case c.kind when 'business' then 'Business identity (legal name, company details and address) reviewed by Gala Dock. This does not verify service quality, insurance or licences.'
                    else 'Identity of the account holder reviewed by Gala Dock.' end,
        jsonb_build_object('source', c.source, 'reason', left(p_reason, 300)), p_actor, c.id, c.status, p_reason_code);
    end if;
    insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (p_actor, coalesce(p_actor_type, 'system'), c.workspace_id, 'provider.verification_changed',
      jsonb_build_object('check_id', c.id, 'kind', c.kind, 'from', c.status, 'to', p_to, 'reason_code', p_reason_code));
  end if;
  return r;
end $$;
revoke all on function public.verification_step(uuid, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.verification_step(uuid, text, uuid, text, text, text) to service_role;

delete from public.verification_records where kind = 'stripe_connect' and check_id is not null;
