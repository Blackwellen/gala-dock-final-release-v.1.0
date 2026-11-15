-- Exercise for 202611147402 (rolled back): helpers no longer executable by authenticated/anon; is_sanctioned_jurisdiction still is.
do $$
begin
  if has_function_privilege('authenticated', 'public.fee_vat_treatment(uuid)', 'execute') or has_function_privilege('anon', 'public.workspace_vat_number(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.platform_reporting_complete(uuid)', 'execute') or has_function_privilege('authenticated', 'public.sanctions_refusal_hint(text)', 'execute')
     or has_function_privilege('authenticated', 'public.sanctions_override_active(text, uuid)', 'execute') then raise exception 'helper still client-executable'; end if;
  if not has_function_privilege('anon', 'public.is_sanctioned_jurisdiction(text, text)', 'execute') then raise exception 'public list check lost'; end if;
  if not has_function_privilege('service_role', 'public.platform_reporting_required(uuid)', 'execute') then raise exception 'service role lost'; end if;
  raise exception 'EXERCISE_OK grants narrowed';
end $$;
