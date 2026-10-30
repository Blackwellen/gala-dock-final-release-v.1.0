-- Q01 (lane A): least-privilege table GRANTs for the client roles. Additive and idempotent (REVOKE of an absent privilege is a no-op).
--
-- Audit (live, 2026-10-28): 111 of 174 public tables granted anon AND authenticated every privilege, including TRUNCATE, REFERENCES
-- and TRIGGER. RLS does not apply to TRUNCATE. No RLS policy anywhere lets anon write (every INSERT/UPDATE/DELETE/ALL policy needs
-- auth.uid() or a workspace-role helper), so anon write grants were dead weight that only widened the attack surface.
--   1. TRUNCATE / REFERENCES / TRIGGER revoked from anon and authenticated on every public table (and for future tables).
--   2. INSERT / UPDATE / DELETE revoked from anon on every public table (and for future tables). anon keeps SELECT for the public
--      catalogue, still filtered by RLS. Public writes go through SECURITY DEFINER RPCs (checkout holds, portal, invites, ...).
--   3. The 15 RLS-on / no-policy tables are service-role only by design (secrets, queues, holds, state machine logs); all client
--      privileges are revoked so a future permissive policy cannot silently open them.
-- authenticated keeps SELECT/INSERT/UPDATE/DELETE (or its existing column-level grants) — RLS policies remain the row gate.

do $$
declare t record;
  service_only constant text[] := array['calendar_connections','calendar_sync_links','checkout_resale_allocations','launch_queue','mfa_recovery_codes',
    'rate_limits','resale_holds','state_machines','state_transitions','state_violations','storage_attribution','storage_backups',
    'stripe_refund_totals','ticket_holds','webhook_events'];
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') loop
    execute format('revoke truncate, references, trigger on table public.%I from anon, authenticated', t.relname);
    execute format('revoke insert, update, delete on table public.%I from anon', t.relname);
    if t.relname = any (service_only) then
      execute format('revoke all on table public.%I from anon, authenticated', t.relname);
    end if;
  end loop;
end $$;

-- Future tables created by migrations (role postgres) start least-privilege too.
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke insert, update, delete on tables from anon;
