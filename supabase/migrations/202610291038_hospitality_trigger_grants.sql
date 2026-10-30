-- Q13 follow-up (lane A, 2026-10-29): the three hospitality trigger functions kept the default EXECUTE grant for
-- authenticated (Supabase default privileges). Triggers do not need it; revoke so they stay service-only. Additive.
revoke all on function public.menu_items_allergen_guard(), public.hospitality_selection_changed(), public.build_items_hospitality_confirm() from public, anon, authenticated;
grant execute on function public.menu_items_allergen_guard(), public.hospitality_selection_changed(), public.build_items_hospitality_confirm() to service_role;
