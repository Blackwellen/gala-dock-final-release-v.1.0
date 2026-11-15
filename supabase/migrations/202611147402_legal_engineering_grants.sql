-- Q74 follow-up (Q45 authz sweep / tenant-security review, 2026-11-14): least privilege for the 202611147401 helpers.
-- These are only called from SECURITY DEFINER triggers/RPCs or with the service role, so clients don't need EXECUTE:
--   fee_vat_treatment / workspace_vat_number (a workspace's VAT treatment and VAT number), sanctions_refusal_hint, resolve_country_code,
--   workspace_sanctioned, sanctions_override_active (whether an override exists), platform_reporting_required / _complete
--   (whether a seller has filed tax details — now read by /api/payouts with the service client after its own ownership check).
-- is_sanctioned_jurisdiction stays callable by anon/authenticated: it answers only from the public sanctions list (allowlisted).
-- Rollback: grant execute … to authenticated (as in 202611147401).
revoke execute on function public.fee_vat_treatment(uuid), public.workspace_vat_number(uuid), public.sanctions_refusal_hint(text),
  public.resolve_country_code(text), public.workspace_sanctioned(uuid), public.sanctions_override_active(text, uuid),
  public.platform_reporting_required(uuid), public.platform_reporting_complete(uuid) from public, anon, authenticated;
grant execute on function public.fee_vat_treatment(uuid), public.workspace_vat_number(uuid), public.sanctions_refusal_hint(text),
  public.resolve_country_code(text), public.workspace_sanctioned(uuid), public.sanctions_override_active(text, uuid),
  public.platform_reporting_required(uuid), public.platform_reporting_complete(uuid) to service_role;
