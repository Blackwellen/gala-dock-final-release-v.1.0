-- Lane C follow-up to 202610294061 (2026-10-29): the "TO public" policy class.
-- Every policy below applies TO public (so also to anon) and calls a SECURITY-checked helper anon may not execute
-- (has_workspace_role, has_admin_permission, can_access_event, can_access_conversation, design_access, can_see_event_money,
-- ops_can_read, support_case_access, can_edit_event, may_contact, can_access_emergency_request, is_emergency_candidate).
-- Postgres checks EXECUTE on every function in the combined policy expression, so ANY anon read of these tables failed with
-- "permission denied for function …" — including the rows other policies make public (published bar packages, active rate cards,
-- the public template library, active plan prices / credit packs / boost products / ad placements).
-- Fix (same pattern as 4061): re-scope each policy to authenticated. For authenticated nothing changes (same expression; they can
-- execute the helpers). For anon every branch of these expressions needs auth.uid() / membership / admin, so it could never pass;
-- the only anon-meaningful branches are the published-catalogue ones, re-granted to anon below as separate, function-free policies.
-- Service role / BYPASSRLS roles are unaffected. Additive: no policy is dropped and no expression changes.
-- Rollback: alter policy … to public; drop the five *_anon_read policies.
-- No begin/commit: migrate.mjs wraps the file in its own transaction (an inner COMMIT would end the dry run's rollback guarantee).
-- Idempotent (the anon policies are created only when missing).
alter policy ad_placements_read on public.ad_placements to authenticated;
alter policy agent_policies_write on public.agent_policies to authenticated;
alter policy agent_tool_calls_read on public.agent_tool_calls to authenticated;
alter policy agent_watches_read on public.agent_watches to authenticated;
alter policy ai_budgets_read on public.ai_budgets to authenticated;
alter policy ai_ledger_read on public.ai_credit_ledger to authenticated;
alter policy ai_prices_read on public.ai_model_prices to authenticated;
alter policy ai_usage_read on public.ai_usage_events to authenticated;
alter policy api_keys_read on public.api_keys to authenticated;
alter policy api_requests_read on public.api_requests to authenticated;
alter policy bar_packages_write on public.bar_packages to authenticated;
alter policy bar_selections_read on public.bar_selections to authenticated;
alter policy booking_cancellations_read on public.booking_cancellations to authenticated;
alter policy booking_dispute_entries_read on public.booking_dispute_entries to authenticated;
alter policy booking_disputes_read on public.booking_disputes to authenticated;
alter policy boost_products_read on public.boost_products to authenticated;
alter policy brand_kits_write on public.brand_kits to authenticated;
alter policy catering_selections_read on public.catering_selections to authenticated;
alter policy commission_rules_admin on public.commission_rules to authenticated;
alter policy conditional_holds_read on public.conditional_holds to authenticated;
alter policy conv_msgs_read on public.conversation_messages to authenticated;
alter policy conv_parts_read on public.conversation_participants to authenticated;
alter policy conversations_read on public.conversations to authenticated;
alter policy credit_packs_read on public.credit_packs to authenticated;
alter policy db_backup_runs_admin_read on public.db_backup_runs to authenticated;
alter policy db_backup_tables_admin_read on public.db_backup_tables to authenticated;
alter policy design_comments_read on public.design_comments to authenticated;
alter policy design_elements_delete on public.design_elements to authenticated;
alter policy design_shares_read on public.design_shares to authenticated;
alter policy design_templates_read on public.design_templates to authenticated;
alter policy design_versions_read on public.design_versions to authenticated;
alter policy designs_read on public.designs to authenticated;
alter policy emergency_candidates_read on public.emergency_candidates to authenticated;
alter policy emergency_profiles_member on public.emergency_provider_profiles to authenticated;
alter policy emergency_requests_read on public.emergency_requests to authenticated;
alter policy event_cancellations_read on public.event_cancellations to authenticated;
alter policy event_order_versions_read on public.event_order_versions to authenticated;
alter policy event_orders_read on public.event_orders to authenticated;
alter policy event_virtual_editors on public.event_virtual to authenticated;
alter policy hospitality_bookings_read on public.hospitality_bookings to authenticated;
alter policy hospitality_lines_read on public.hospitality_lines to authenticated;
alter policy hospitality_schedules_read on public.hospitality_schedules to authenticated;
alter policy menu_item_variants_delete on public.menu_item_variants to authenticated;
alter policy menu_item_variants_insert on public.menu_item_variants to authenticated;
alter policy menu_item_variants_update on public.menu_item_variants to authenticated;
alter policy ops_alert_rules_ops_read on public.ops_alert_rules to authenticated;
alter policy ops_alerts_ops_read on public.ops_alerts to authenticated;
alter policy ops_incident_actions_ops_read on public.ops_incident_actions to authenticated;
alter policy ops_incidents_ops_read on public.ops_incidents to authenticated;
alter policy ops_metric_rollups_ops_read on public.ops_metric_rollups to authenticated;
alter policy ops_restore_tests_ops_read on public.ops_restore_tests to authenticated;
alter policy ops_runbooks_ops_read on public.ops_runbooks to authenticated;
alter policy ops_slo_definitions_ops_read on public.ops_slo_definitions to authenticated;
alter policy ops_synthetic_checks_ops_read on public.ops_synthetic_checks to authenticated;
alter policy ops_synthetic_runs_ops_read on public.ops_synthetic_runs to authenticated;
alter policy payment_orders_read on public.payment_orders to authenticated;
alter policy plan_prices_read on public.plan_prices to authenticated;
alter policy platform_charges_read on public.platform_charges to authenticated;
alter policy privacy_requests_read on public.privacy_requests to authenticated;
alter policy promotion_boosts_read on public.promotion_boosts to authenticated;
alter policy provider_checkins_read on public.provider_checkins to authenticated;
alter policy provider_documents_trust_read on public.provider_documents to authenticated;
alter policy saved_contacts_rw on public.saved_contacts to authenticated;
alter policy service_health_snapshots_read on public.service_health_snapshots to authenticated;
alter policy standby_read on public.standby_commitments to authenticated;
alter policy stripe_disputes_admin on public.stripe_disputes to authenticated;
alter policy support_case_events_read on public.support_case_events to authenticated;
alter policy support_case_links_read on public.support_case_links to authenticated;
alter policy support_read on public.support_cases to authenticated;
alter policy support_macros_read on public.support_macros to authenticated;
alter policy support_messages_read on public.support_messages to authenticated;
alter policy support_sla_policies_read on public.support_sla_policies to authenticated;
alter policy tasks_rw on public.tasks to authenticated;
alter policy template_restrictions_read on public.template_creator_restrictions to authenticated;
alter policy template_reports_read on public.template_reports to authenticated;
alter policy ticket_risk_flags_trust_read on public.ticket_risk_flags to authenticated;
alter policy ticket_waitlist_read on public.ticket_waitlist to authenticated;
alter policy uploaded_fonts_write on public.uploaded_fonts to authenticated;
alter policy venue_alternatives_read on public.venue_alternatives to authenticated;
alter policy venue_rate_cards_write on public.venue_rate_cards to authenticated;
alter policy verification_records_trust_read on public.verification_records to authenticated;
alter policy webhook_deliveries_read on public.webhook_deliveries to authenticated;
alter policy webhook_endpoints_read on public.webhook_endpoints to authenticated;

-- Public catalogue branches of the re-scoped mixed policies, for anon only (expressions copied from the originals, helpers removed).
do $pol$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ad_placements' and policyname = 'ad_placements_anon_read') then
    create policy ad_placements_anon_read on public.ad_placements for select to anon using (active); end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'boost_products' and policyname = 'boost_products_anon_read') then
    create policy boost_products_anon_read on public.boost_products for select to anon using (active); end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'credit_packs' and policyname = 'credit_packs_anon_read') then
    create policy credit_packs_anon_read on public.credit_packs for select to anon using (active); end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'plan_prices' and policyname = 'plan_prices_anon_read') then
    create policy plan_prices_anon_read on public.plan_prices for select to anon using (active); end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'design_templates' and policyname = 'design_templates_anon_read') then
    create policy design_templates_anon_read on public.design_templates for select to anon
      using (status = 'active' and (visibility = 'public' or (workspace_id is null and owner_id is null))); end if;
end $pol$;
