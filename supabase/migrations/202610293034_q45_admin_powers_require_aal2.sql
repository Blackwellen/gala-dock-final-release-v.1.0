-- Q45 security sign-off (lane C, 2026-10-29) — finding Q45-S02 (P1, platform-admin MFA bypass through the API).
-- The admin console requires a verified second factor (src/lib/auth.ts requireRole("admin") → /mfa when aal1), and Q31 S2 made
-- admin MUTATIONS raise step_up_required on aal1 sessions. Admin READS did not: has_admin_permission()/is_platform_admin() only
-- checked the platform_admins row, so a platform admin's password alone (anon key + password sign-in, aal1 JWT) could call the
-- admin read RPCs and admin-gated RLS directly. Q45 sweep evidence (rolled back, admin.demo on an aal1 session): 57 of 138
-- admin-gated definer functions answered, 34 with data — e.g. admin_user_identity (any user's email / phone / sessions),
-- admin_overview, admin_user_stats, admin_support_assignees, admin_ops_overview, admin_event_metrics.
-- Fix (additive, same signatures, grants unchanged): a platform admin's powers exist only on an aal2 session. Service-role code is
-- unaffected (no auth.uid() → false, as before). The admin's own platform_admins row stays readable (admin_self_read policy), so
-- requireRole still finds it and sends an aal1 admin to /mfa. admin_mfa_required() now checks the row directly so mutations keep
-- answering step_up_required (the console's prompt) instead of not_authorized.
-- Rollback: re-create has_admin_permission / is_platform_admin from 202610130001_provider_admin.sql and admin_mfa_required from
-- 202610292001_admin_security.sql, admin_require from its last definition (bodies also quoted in docs/release/q45-security.md).

create or replace function public.has_admin_permission(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
     and exists(select 1 from public.platform_admins where user_id = (select auth.uid()) and p = any(permissions));
$$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
     and exists(select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;

create or replace function public.admin_mfa_required() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not exists(select 1 from public.platform_admins where user_id = (select auth.uid())) then return; end if;
  if not public.session_is_live() then raise exception 'session_revoked' using errcode = '42501'; end if;
  if coalesce((select auth.jwt()) ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'step_up_required' using errcode = '42501',
      hint = 'Platform admin actions need two-step verification: enrol an authenticator, verify it, then retry.';
  end if;
end $$;

-- The standard admin mutation gate asks for the second factor first, so an admin on an aal1 session keeps getting
-- step_up_required (not not_authorized, which has_admin_permission now returns at aal1). Non-admins: not_authorized, unchanged.
create or replace function public.admin_require(p_perm text, p_reason text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_mfa_required();
  if not public.has_admin_permission(p_perm) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(null);
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
end $$;
