# Tables and RLS baseline (Q00)

Generated 2026-10-28 from `supabase/migrations/*.sql` (134 files) and a READ-ONLY introspection of the live project (pg_catalog / pg_policies / cron.job / storage.buckets / supabase_migrations.schema_migrations via the Supabase Management API; SELECT only). Scripts: scratchpad `q00-baseline/introspect.mjs`, `mig.mjs`, `tables-md.mjs` (not committed).

## Summary

| Item | Count |
|---|---|
| Migration files | 134 (incl. 2 generated seed files sorting last: `209912310001_state_seed.sql`, `209912310002_agent_tools_seed.sql`) |
| Tables created by migrations (net of drops) | 177 |
| Tables in live `public` schema | 174 |
| Live tables with RLS **off** | **0** |
| Live tables with FORCE RLS | 0 |
| Live RLS policies (public) | 223 |
| Live tables with RLS on and **zero policies** (service-role only by design) | 15 |
| Live policies that are `USING (true)` for anon/public | 4 tables, all SELECT on reference data |
| Policies granting INSERT/UPDATE/DELETE with `true` | 0 |
| Views / materialized views in public | 0 |
| Public SQL functions | 689 (406 SECURITY DEFINER) |
| pg_cron jobs (live) | 16 |
| Storage buckets (live) | 4 |
| Recorded migrations in `supabase_migrations.schema_migrations` | 123 |

## Schema drift (migrations vs live)

- **Tables in migrations but missing live:** `ai_economics_settings`, `ai_overage_charges`, `ai_provider_invoices` — all from `202610280039_ai_profitability_assurance.sql`, which has **not been applied** (carry-over C07 "DONE (not applied)").
- **Tables live but not in any migration:** none.
- **Migration files with no row in `schema_migrations`:** 11 — `202610280026_resale_original_payment_refunds.sql`, `202610280027_resale_liability_accounting.sql`, `202610280031_customer_date_change.sql`, `202610280032_request_attachment_ownership.sql`, `202610280033_verified_private_uploads.sql`, `202610280034_upload_object_binding.sql`, `202610280035_customer_date_booking_states.sql`, `202610280036_event_file_provenance.sql`, `202610280037_booking_local_availability.sql`, `202610280038_event_plan_version_lock.sql`, `202610280039_ai_profitability_assurance.sql`.
  - 0026–0038 were applied out-of-band via the Management API (`scripts/testing/apply-*-migration.mjs`), which executes SQL but does not record history. Their objects **are present live** (checked: `checkout_resale_allocations`, `verified_private_uploads`, `capture_resale_allocations`, `claim_resale_refund`, `settle_resale_refund`, `change_my_event_date`, `guard_request_attachment_ownership`, `guard_request_upload_version`, `guard_media_file_source`, `event_file_object_matches`, `listing_availability_local`, `organizer_save_event_plan`, `guard_consumer_event_date` all exist). So the drift is **history-only**: `supabase db push` would try to re-run them. Column-level additions in 0026/0034/0036 were not individually verified.
  - 0039 is genuinely unapplied (its three tables are absent).
- **Recorded versions with no file:** none.
- The seed files `209912310001_state_seed.sql` (role_permissions, state machines; `delete from role_permissions` then re-insert) and `209912310002_agent_tools_seed.sql` (30 agent tools) are recorded as applied, but they are generated (`scripts/gen-foundation-sql.mjs`, `scripts/gen-agent-tools.mjs`) and must be re-run after new migrations — they are **not** idempotent history entries. Live `agent_tools` `count(*)` = 30 = seed = `src/lib/agent/registry.ts` (ids identical).
- pg_cron: 16 jobs in migrations, 16 live, all `active`.
- Storage: 4 buckets in migrations, 4 live (see SERVER_SURFACE.md).

## Notable gaps

- No table has RLS disabled. RLS is the enforcement layer everywhere (matches §1.3).
- 15 tables have RLS on but no policy, so only the service role (server code) can touch them: `calendar_connections`, `calendar_sync_links`, `checkout_resale_allocations`, `launch_queue`, `mfa_recovery_codes`, `rate_limits`, `resale_holds`, `state_machines`, `state_transitions`, `state_violations`, `storage_attribution`, `storage_backups`, `stripe_refund_totals`, `ticket_holds`, `webhook_events`. This is deliberate for queues/secrets (rate_limits, mfa_recovery_codes, calendar tokens, webhook_events, stripe_refund_totals, storage_backups, state_*), but means any UI read of these must go through a server route/RPC. `ticket_holds`/`resale_holds` are read only via SECURITY DEFINER RPCs.
- Anonymous `USING (true)` SELECT exists only on reference tables: `bar_jurisdiction_rules`, `credential_requirements`, `credential_types`, `plan_entitlements`. `role_permissions` is readable by any authenticated user (fine: it is the static role matrix).
- Public catalogue reads (events, ticket_tiers, event_seats, programme_items, packages, spaces, venue_structures, designs via `design_access()`) are status/visibility-gated, not identity-gated — expected.
- No policy was found that relies only on a client-supplied id without `auth.uid()` or a membership helper (`is_workspace_member`, `has_workspace_role`, `can_access_event`, `has_admin_permission`, …): every non-catalogue policy references one of those. A deeper check (helpers that themselves trust a parameter, SECURITY DEFINER RPCs that skip checks — 400+ definer functions) is Q01 work, not done here.
- `information_schema.role_table_grants` returned no rows for `anon` through the management role; table-level GRANTs were therefore not audited (RLS still applies).
- Planner row estimates of -1 mean the table has never been analysed (not necessarily empty).

## Per-table inventory

Columns: created-in migration · RLS (live) · force · est. rows · live policy count (commands) · policy names.

| Table | Created in | RLS | Force | Est. rows | Policies | Commands | Policy names |
|---|---|---|---|---|---|---|---|
| `admin_money_requests` | 202610150010_admin_b_ops | on |  | -1 | 1 | SELECT | money_requests_admin_read [SELECT] |
| `admin_notes` | 202610150010_admin_b_ops | on |  | 3 | 1 | SELECT | admin_notes_read [SELECT] |
| `admin_record_notes` | 202610150001_admin_a_controls | on |  | -1 | 1 | SELECT | admin_record_notes_read [SELECT] |
| `agent_approvals` | 202610120001_events_domain | on |  | 14 | 2 | SELECT | agent_approvals_admin_read [SELECT]; agent_approvals_read [SELECT] |
| `agent_artifacts` | 202610240001_agent_runtime | on |  | 15 | 1 | SELECT | agent_artifacts_read [SELECT] |
| `agent_policies` | 202610240001_agent_runtime | on |  | -1 | 2 | SELECT/ALL | agent_policies_read [SELECT]; agent_policies_write [ALL] |
| `agent_routines` | 202610120001_events_domain | on |  | 9 | 1 (mig 0) | ALL | agent_routines_rw [ALL] |
| `agent_run_steps` | 202610240001_agent_runtime | on |  | 106 | 1 | SELECT | agent_steps_read [SELECT] |
| `agent_runs` | 202610120001_events_domain | on |  | 613 | 2 | SELECT | agent_runs_admin_read [SELECT]; agent_runs_rw [SELECT] |
| `agent_tools` | 202610240001_agent_runtime | on |  | 27 | 1 | SELECT | agent_tools_read [SELECT] |
| `agent_waits` | 202610240001_agent_runtime | on |  | -1 | 1 | SELECT | agent_waits_read [SELECT] |
| `agent_watches` | 202610270012_agent_run_types | on |  | -1 | 1 | SELECT | agent_watches_read [SELECT] |
| `ai_budgets` | 202610270005_ai_credits | on |  | 0 | 1 | SELECT | ai_budgets_read [SELECT] |
| `ai_credit_ledger` | 202610270005_ai_credits | on |  | -1 | 1 | SELECT | ai_ledger_read [SELECT] |
| `ai_economics_settings` | 202610280039_ai_profitability_assurance | NOT LIVE |  |  | 0 (mig 1) |  |  |
| `ai_model_prices` | 202610270005_ai_credits | on |  | -1 | 1 | SELECT | ai_prices_read [SELECT] |
| `ai_overage_charges` | 202610280039_ai_profitability_assurance | NOT LIVE |  |  | 0 (mig 1) |  |  |
| `ai_provider_invoices` | 202610280039_ai_profitability_assurance | NOT LIVE |  |  | 0 (mig 1) |  |  |
| `ai_usage_events` | 202610270005_ai_credits | on |  | 58 | 1 | SELECT | ai_usage_read [SELECT] |
| `analytics_daily` | 202610150010_admin_b_ops | on |  | 3780 | 1 | SELECT | analytics_daily_read [SELECT] |
| `api_keys` | 202610270009_developer_platform | on |  | -1 | 1 | SELECT | api_keys_read [SELECT] |
| `api_requests` | 202610270009_developer_platform | on |  | 0 | 1 | SELECT | api_requests_read [SELECT] |
| `audit_events` | 202610110001_auth_onboarding | on |  | 3279 | 2 | SELECT | audit_admin_read [SELECT]; audit_read [SELECT] |
| `availability_blocks` | 202610130001_provider_admin | on |  | 7 | 1 (mig 0) | SELECT | availability_blocks_member_read [SELECT] |
| `bar_jurisdiction_rules` | 202610200001_venue_fnb | on |  | -1 | 1 | SELECT | bar_rules_read [SELECT] |
| `bar_packages` | 202610200001_venue_fnb | on |  | -1 | 2 | SELECT/ALL | bar_packages_read [SELECT]; bar_packages_write [ALL] |
| `booking_cancellations` | 202610170001_marketplace | on |  | 0 | 1 | SELECT | booking_cancellations_read [SELECT] |
| `booking_dispute_entries` | 202610170001_marketplace | on |  | 0 | 1 | SELECT | booking_dispute_entries_read [SELECT] |
| `booking_disputes` | 202610170001_marketplace | on |  | 0 | 1 | SELECT | booking_disputes_read [SELECT] |
| `boost_products` | 202610270023_promotion_boosts | on |  | -1 | 1 | SELECT | boost_products_read [SELECT] |
| `brand_kits` | 202610260001_media_studio | on |  | -1 | 2 | SELECT/ALL | brand_kits_read [SELECT]; brand_kits_write [ALL] |
| `break_glass_access_log` | 202610250002_break_glass | on |  | -1 | 1 | SELECT | bg_log_read [SELECT] |
| `break_glass_grants` | 202610250002_break_glass | on |  | -1 | 1 | SELECT | bg_grants_read [SELECT] |
| `build_items` | 202610120001_events_domain | on |  | 139 | 3 (mig 2) | SELECT/ALL | build_items_admin_read [SELECT]; build_items_provider_read [SELECT]; build_items_rw [ALL] |
| `calendar_busy_blocks` | 202610280011_calendar_sync | on |  | -1 | 1 | SELECT | busy_own [SELECT] |
| `calendar_connections` | 202610280011_calendar_sync | on |  | -1 | 0 |  |  |
| `calendar_entries` | 202610120001_events_domain | on |  | 9 | 1 | ALL | calendar_rw [ALL] |
| `calendar_sync_links` | 202610280011_calendar_sync | on |  | -1 | 0 |  |  |
| `catering_selections` | 202610200001_venue_fnb | on |  | -1 | 1 | SELECT | catering_selections_read [SELECT] |
| `check_ins` | 202610120001_events_domain | on |  | 7949 | 2 | SELECT | check_ins_admin_read [SELECT]; check_ins_read [SELECT] |
| `checkout_orders` | 202610130013_checkout | on |  | 15 | 1 | SELECT | checkout_orders_buyer_read [SELECT] |
| `checkout_resale_allocations` | 202610280027_resale_liability_accounting | on |  | -1 | 0 |  |  |
| `commission_rules` | 202610180001_payments | on |  | -1 | 1 | SELECT | commission_rules_admin [SELECT] |
| `conditional_holds` | 202610170001_marketplace | on |  | 0 | 1 | SELECT | conditional_holds_read [SELECT] |
| `connect_accounts` | 202610160003_trust | on |  | -1 | 1 | SELECT | connect_accounts_read [SELECT] |
| `conversation_messages` | 202610230001_messaging | on |  | 6 | 1 | SELECT | conv_msgs_read [SELECT] |
| `conversation_participants` | 202610230001_messaging | on |  | 7 | 1 | SELECT | conv_parts_read [SELECT] |
| `conversations` | 202610230001_messaging | on |  | 6 | 1 | SELECT | conversations_read [SELECT] |
| `credential_requirements` | 202610160003_trust | on |  | -1 | 1 | SELECT | credential_requirements_read [SELECT] |
| `credential_types` | 202610160003_trust | on |  | -1 | 1 | SELECT | credential_types_read [SELECT] |
| `credit_packs` | 202610270005_ai_credits | on |  | -1 | 1 | SELECT | credit_packs_read [SELECT] |
| `crew_members` | 202610120001_events_domain | on |  | 34 | 1 (mig 0) | ALL | crew_members_rw [ALL] |
| `db_backup_runs` | 202610280006_db_backup | on |  | -1 | 1 | SELECT | db_backup_runs_admin_read [SELECT] |
| `db_backup_tables` | 202610280006_db_backup | on |  | 2983 | 1 | SELECT | db_backup_tables_admin_read [SELECT] |
| `design_comments` | 202610260001_media_studio | on |  | 0 | 1 | SELECT | design_comments_read [SELECT] |
| `design_elements` | 202610280023_design_elements | on |  | -1 | 4 | DELETE/INSERT/SELECT/UPDATE | design_elements_delete [DELETE]; design_elements_insert [INSERT]; design_elements_read [SELECT]; design_elements_update [UPDATE] |
| `design_shares` | 202610260001_media_studio | on |  | -1 | 1 | SELECT | design_shares_read [SELECT] |
| `design_templates` | 202610260001_media_studio | on |  | 80 | 1 (mig 2) | SELECT | design_templates_read [SELECT] |
| `design_versions` | 202610260001_media_studio | on |  | 10 | 1 | SELECT | design_versions_read [SELECT] |
| `designs` | 202610260001_media_studio | on |  | 36 | 1 | SELECT | designs_read [SELECT] |
| `discount_codes` | 202610120001_events_domain | on |  | -1 | 1 (mig 0) | ALL | discount_codes_rw [ALL] |
| `email_outbox` | 202610270007_email_outbox | on |  | 105 | 1 | SELECT | email_outbox_own [SELECT] |
| `emergency_candidates` | 202610170001_marketplace | on |  | 0 | 1 | SELECT | emergency_candidates_read [SELECT] |
| `emergency_provider_profiles` | 202610170001_marketplace | on |  | 0 | 1 | SELECT | emergency_profiles_member [SELECT] |
| `emergency_requests` | 202610170001_marketplace | on |  | 0 | 1 | SELECT | emergency_requests_read [SELECT] |
| `enquiries` | 202610100001_gala_dock | on |  | -1 | 1 | ALL | enquiries_own [ALL] |
| `event_cancellations` | 202610270011_event_cancellation_refunds | on |  | 0 | 1 | SELECT | event_cancellations_read [SELECT] |
| `event_metrics_daily` | 202610120004_event_metrics | on |  | 30 | 1 | SELECT | event_metrics_read [SELECT] |
| `event_order_versions` | 202610200001_venue_fnb | on |  | 0 | 1 | SELECT | event_order_versions_read [SELECT] |
| `event_orders` | 202610200001_venue_fnb | on |  | 0 | 1 | SELECT | event_orders_read [SELECT] |
| `event_seats` | 202610130008_event_seating | on |  | 264 | 2 | SELECT | event_seats_member_read [SELECT]; event_seats_public_read [SELECT] |
| `event_templates` | 202610120001_events_domain | on |  | -1 | 1 (mig 0) | ALL | event_templates_rw [ALL] |
| `event_virtual` | 202610270017_virtual_events | on |  | -1 | 1 | SELECT | event_virtual_editors [SELECT] |
| `events` | 202610120001_events_domain | on |  | 176 | 8 (mig 9) | SELECT/INSERT/UPDATE | events_admin_read [SELECT]; events_insert [INSERT]; events_promoter_read [SELECT]; events_provider_read [SELECT]; events_public_read [SELECT]; events_read [SELECT]; events_ticket_holder_read [SELECT]; events_update [UPDATE] |
| `guests` | 202610120001_events_domain | on |  | 40 | 1 (mig 0) | ALL | guests_rw [ALL] |
| `incidents` | 202610120001_events_domain | on |  | -1 | 1 (mig 0) | ALL | incidents_rw [ALL] |
| `integrations` | 202610130001_provider_admin | on |  | 17 | 1 | SELECT | integrations_read [SELECT] |
| `invoice_events` | 202610120001_events_domain | on |  | 4 | 1 | SELECT | invoice_events_read [SELECT] |
| `invoice_installments` | 202610120001_events_domain | on |  | -1 | 1 | ALL | invoice_inst_rw [ALL] |
| `invoice_items` | 202610120001_events_domain | on |  | -1 | 1 | ALL | invoice_items_rw [ALL] |
| `invoices` | 202610120001_events_domain | on |  | 10 | 3 | UPDATE/INSERT/SELECT | invoices_draft_update [UPDATE]; invoices_draft_write [INSERT]; invoices_read [SELECT] |
| `launch_queue` | 202610270013_launch_queue | on |  | 0 | 0 |  |  |
| `lead_activities` | 202610120007_lead_activities | on |  | 6 | 1 | ALL | lead_activities_rw [ALL] |
| `leads` | 202610120001_events_domain | on |  | 20 | 1 (mig 0) | ALL | leads_rw [ALL] |
| `ledger_entries` | 202610160001_foundation | on |  | 443 | 1 | SELECT | ledger_entries_finance_read [SELECT] |
| `ledger_transactions` | 202610160001_foundation | on |  | 184 | 1 | SELECT | ledger_tx_finance_read [SELECT] |
| `listings` | 202610100001_gala_dock | on |  | 51 | 3 | SELECT/ALL | listings_admin_read [SELECT]; listings_owner_manage [ALL]; listings_public_read [SELECT] |
| `maintenance_windows` | 202610270003_maintenance | on |  | -1 | 1 | SELECT | maintenance_admin_read [SELECT] |
| `media_assets` | 202610120001_events_domain | on |  | -1 | 1 | ALL | media_rw [ALL] |
| `menu_items` | 202610200001_venue_fnb | on |  | -1 | 2 | SELECT/ALL | menu_items_read [SELECT]; menu_items_write [ALL] |
| `menu_sections` | 202610200001_venue_fnb | on |  | -1 | 2 | SELECT/ALL | menu_sections_read [SELECT]; menu_sections_write [ALL] |
| `menus` | 202610200001_venue_fnb | on |  | -1 | 2 | SELECT/ALL | menus_read [SELECT]; menus_write [ALL] |
| `messages` | 202610120001_events_domain | on |  | 23 | 2 | ALL | messages_provider_rw [ALL]; messages_rw [ALL] |
| `mfa_recovery_codes` | 202610270002_mfa | on |  | -1 | 0 |  |  |
| `notifications` | 202610120001_events_domain | on |  | 211 | 2 | UPDATE/SELECT | notifications_mark [UPDATE]; notifications_own [SELECT] |
| `packages` | 202610130001_provider_admin | on |  | 13 | 2 (mig 1) | SELECT | packages_member_read [SELECT]; packages_public_read [SELECT] |
| `partner_content` | 202610150022_partner_portal | on |  | -1 | 1 (mig 0) | SELECT | partner_content_read [SELECT] |
| `partner_earnings` | 202610150022_partner_portal | on |  | 181 | 1 (mig 0) | SELECT | partner_earnings_read [SELECT] |
| `partner_referrals` | 202610150022_partner_portal | on |  | 144 | 1 (mig 0) | SELECT | partner_referrals_read [SELECT] |
| `partner_statements` | 202610150022_partner_portal | on |  | -1 | 1 (mig 0) | SELECT | partner_statements_read [SELECT] |
| `partners` | 202610130001_provider_admin | on |  | 17 | 1 | SELECT | partners_read [SELECT] |
| `payment_orders` | 202610180001_payments | on |  | 27 | 1 | SELECT | payment_orders_read [SELECT] |
| `payments` | 202610120001_events_domain | on |  | 52 | 2 | SELECT | payments_admin_read [SELECT]; payments_read [SELECT] |
| `plan_entitlements` | 202610270010_entitlements | on |  | 64 | 1 | SELECT | plan_entitlements_read [SELECT] |
| `platform_admins` | 202610100001_gala_dock | on |  | 3 | 2 | SELECT | admin_self_read [SELECT]; admins_admin_read [SELECT] |
| `platform_charges` | 202610280005_fee_schedule | on |  | 9 | 1 | SELECT | platform_charges_read [SELECT] |
| `platform_settings` | 202610130001_provider_admin | on |  | 17 | 1 | SELECT | settings_read [SELECT] |
| `portal_approvals` | 202610150020_client_portal | on |  | -1 | 3 | UPDATE/SELECT/INSERT | portal_approvals_edit [UPDATE]; portal_approvals_read [SELECT]; portal_approvals_write [INSERT] |
| `portal_documents` | 202610150020_client_portal | on |  | -1 | 3 | DELETE/SELECT/INSERT | portal_documents_delete [DELETE]; portal_documents_read [SELECT]; portal_documents_write [INSERT] |
| `portal_links` | 202610150020_client_portal | on |  | -1 | 1 | SELECT | portal_links_read [SELECT] |
| `portal_messages` | 202610150020_client_portal | on |  | -1 | 2 | SELECT/INSERT | portal_messages_read [SELECT]; portal_messages_write [INSERT] |
| `privacy_requests` | 202610270008_privacy | on |  | -1 | 1 | SELECT | privacy_requests_read [SELECT] |
| `profiles` | 202610100001_gala_dock | on |  | 202 | 3 | SELECT/UPDATE | profiles_admin_read [SELECT]; profiles_own_read [SELECT]; profiles_own_update [UPDATE] |
| `programme_items` | 202610120001_events_domain | on |  | 38 | 2 (mig 1) | ALL/SELECT | programme_items_rw [ALL]; programme_public_read [SELECT] |
| `promoter_assets` | 202610150021_promoter_portal | on |  | -1 | 2 | SELECT/ALL | promoter_assets_read [SELECT]; promoter_assets_write [ALL] |
| `promoter_clicks` | 202610150021_promoter_portal | on |  | 3402 | 1 | SELECT | promoter_clicks_read [SELECT] |
| `promoter_payouts` | 202610150021_promoter_portal | on |  | -1 | 1 | SELECT | promoter_payouts_read [SELECT] |
| `promoter_sales` | 202610150021_promoter_portal | on |  | 122 | 1 | SELECT | promoter_sales_read [SELECT] |
| `promoters` | 202610120001_events_domain | on |  | 5 | 2 (mig 1) | ALL/SELECT | promoters_rw [ALL]; promoters_self_read [SELECT] |
| `promotion_boosts` | 202610270023_promotion_boosts | on |  | 0 | 1 | SELECT | promotion_boosts_read [SELECT] |
| `promotions` | 202610120001_events_domain | on |  | -1 | 1 (mig 0) | ALL | promotions_rw [ALL] |
| `proposal_versions` | 202610120001_events_domain | on |  | -1 | 1 | SELECT | proposal_versions_read [SELECT] |
| `proposals` | 202610120001_events_domain | on |  | 8 | 3 | UPDATE/INSERT/SELECT | proposals_draft_update [UPDATE]; proposals_draft_write [INSERT]; proposals_read [SELECT] |
| `provider_checkins` | 202610210001_operations | on |  | -1 | 1 | SELECT | provider_checkins_read [SELECT] |
| `provider_documents` | 202610160003_trust | on |  | -1 | 2 | INSERT/SELECT | provider_documents_insert [INSERT]; provider_documents_read [SELECT] |
| `provider_jobs` | 202610130001_provider_admin | on |  | 27 | 1 (mig 0) | SELECT | provider_jobs_member_read [SELECT] |
| `provider_quotes` | 202610130001_provider_admin | on |  | 9 | 1 (mig 0) | SELECT | provider_quotes_member_read [SELECT] |
| `provider_requests` | 202610120001_events_domain | on |  | 19 | 2 (mig 1) | SELECT/ALL | provider_requests_provider_read [SELECT]; provider_requests_rw [ALL] |
| `rate_limits` | 202610110001_auth_onboarding | on |  | 185 | 0 |  |  |
| `recently_viewed` | 202610140004_recently_viewed | on |  | 20 | 1 | ALL | recently_viewed_own [ALL] |
| `reliability_metrics` | 202610160003_trust | on |  | 1 | 1 | SELECT | reliability_metrics_read [SELECT] |
| `resale_holds` | 202610130016_resale | on |  | -1 | 0 |  |  |
| `resale_payouts` | 202610130016_resale | on |  | 3 | 1 | SELECT | resale_payouts_seller_read [SELECT] |
| `reviews` | 202610120001_events_domain | on |  | -1 | 3 | SELECT | reviews_admin_read [SELECT]; reviews_provider_read [SELECT]; reviews_public_read [SELECT] |
| `role_permissions` | 202610160001_foundation | on |  | 70 | 1 | SELECT | role_permissions_read [SELECT] |
| `saved_contacts` | 202610280021_messaging_contacts | on |  | -1 | 1 | ALL | saved_contacts_rw [ALL] |
| `saved_items` | 202610100001_gala_dock | on |  | 18 | 1 | ALL | saved_own [ALL] |
| `shifts` | 202610120001_events_domain | on |  | 82 | 1 (mig 0) | ALL | shifts_rw [ALL] |
| `space_links` | 202610130006_space_rules | on |  | 5 | 1 | SELECT | space_links_member_read [SELECT] |
| `spaces` | 202610130001_provider_admin | on |  | 8 | 2 (mig 1) | SELECT | spaces_member_read [SELECT]; spaces_public_read [SELECT] |
| `standby_commitments` | 202610170001_marketplace | on |  | 0 | 1 | SELECT | standby_read [SELECT] |
| `state_machines` | 202610160001_foundation | on |  | 11 | 0 |  |  |
| `state_transitions` | 202610160001_foundation | on |  | 455 | 0 |  |  |
| `state_violations` | 202610160001_foundation | on |  | 63 | 0 |  |  |
| `storage_attribution` | 202610270020_storage_quotas | on |  | 32 | 0 |  |  |
| `storage_backups` | 202610270016_storage_backup | on |  | -1 | 0 |  |  |
| `stripe_disputes` | 202610170001_marketplace | on |  | 1 | 1 | SELECT | stripe_disputes_admin [SELECT] |
| `stripe_refund_totals` | 202610280026_resale_original_payment_refunds | on |  | -1 | 0 |  |  |
| `support_cases` | 202610130001_provider_admin | on |  | 150 | 1 | SELECT | support_read [SELECT] |
| `support_messages` | 202610130001_provider_admin | on |  | 274 | 1 | SELECT | support_messages_read [SELECT] |
| `tasks` | 202610120001_events_domain | on |  | 79 | 1 | ALL | tasks_rw [ALL] |
| `template_creator_restrictions` | 202610260001_media_studio | on |  | -1 | 1 | SELECT | template_restrictions_read [SELECT] |
| `template_reports` | 202610260001_media_studio | on |  | 0 | 1 | SELECT | template_reports_read [SELECT] |
| `template_saves` | 202610260001_media_studio | on |  | -1 | 1 | ALL | template_saves_rw [ALL] |
| `threads` | 202610120001_events_domain | on |  | 31 | 2 (mig 1) | SELECT/ALL | threads_provider_read [SELECT]; threads_rw [ALL] |
| `ticket_holds` | 202610130013_checkout | on |  | 0 | 0 |  |  |
| `ticket_tiers` | 202610120001_events_domain | on |  | 48 | 4 (mig 3) | ALL/SELECT | ticket_tiers_rw [ALL]; tiers_admin_read [SELECT]; tiers_promoter_read [SELECT]; tiers_public_read [SELECT] |
| `ticket_transfers` | 202610220001_ticketing | on |  | 2 | 1 | SELECT | ticket_transfers_read [SELECT] |
| `ticket_waitlist` | 202610220001_ticketing | on |  | 1 | 1 | SELECT | ticket_waitlist_read [SELECT] |
| `tickets` | 202610120001_events_domain | on |  | 17467 | 2 | SELECT | tickets_admin_read [SELECT]; tickets_read [SELECT] |
| `transactions` | 202610120001_events_domain | on |  | 608 | 2 | SELECT | transactions_admin_read [SELECT]; transactions_read [SELECT] |
| `trust_cases` | 202610130001_provider_admin | on |  | 88 | 1 | SELECT | trust_read [SELECT] |
| `uploaded_fonts` | 202610260001_media_studio | on |  | -1 | 2 | SELECT/ALL | uploaded_fonts_read [SELECT]; uploaded_fonts_write [ALL] |
| `user_tasks` | 202610100001_gala_dock | on |  | -1 | 1 | ALL | tasks_own [ALL] |
| `user_tours` | 202610270018_user_tours | on |  | -1 | 1 | ALL | user_tours_own [ALL] |
| `venue_alternatives` | 202610200001_venue_fnb | on |  | -1 | 1 | SELECT | venue_alternatives_read [SELECT] |
| `venue_maps` | 202610120001_events_domain | on |  | 1 | 1 (mig 0) | ALL | venue_maps_rw [ALL] |
| `venue_rate_cards` | 202610200001_venue_fnb | on |  | -1 | 2 | SELECT/ALL | venue_rate_cards_read [SELECT]; venue_rate_cards_write [ALL] |
| `venue_structures` | 202610130001_provider_admin | on |  | 1 | 2 (mig 1) | SELECT | venue_structures_member_read [SELECT]; venue_structures_public_read [SELECT] |
| `verification_records` | 202610160003_trust | on |  | -1 | 1 | SELECT | verification_records_read [SELECT] |
| `verified_private_uploads` | 202610280033_verified_private_uploads | on |  | 4 | 1 | SELECT | verified_upload_owner_read [SELECT] |
| `webhook_deliveries` | 202610270009_developer_platform | on |  | -1 | 1 | SELECT | webhook_deliveries_read [SELECT] |
| `webhook_endpoints` | 202610270009_developer_platform | on |  | -1 | 1 | SELECT | webhook_endpoints_read [SELECT] |
| `webhook_events` | 202610160001_foundation | on |  | 410 | 0 |  |  |
| `workspace_invites` | 202610100001_gala_dock | on |  | 0 | 3 (mig 4) | INSERT/SELECT/UPDATE | invites_owner_insert [INSERT]; invites_owner_read [SELECT]; invites_owner_revoke [UPDATE] |
| `workspace_members` | 202610100001_gala_dock | on |  | 141 | 2 (mig 4) | SELECT | members_admin_read [SELECT]; members_read [SELECT] |
| `workspaces` | 202610100001_gala_dock | on |  | 156 | 4 (mig 6) | SELECT/INSERT/UPDATE | workspaces_admin_read [SELECT]; workspaces_member_read [SELECT]; workspaces_owner_insert [INSERT]; workspaces_owner_update [UPDATE] |

"(mig N)" = number of `create policy … on <table>` statements found in migrations when it differs from live (drops/renames/`do $$` blocks make this approximate).

## pg_cron jobs (live)

| Job | Schedule | Command |
|---|---|---|
| agent-retention | `15 4 2 * *` | `select public.agent_retention_purge()` |
| agent-worker | `* * * * *` | `select public.dispatch_worker('/api/agent/worker')` |
| boost-lifecycle | `*/5 * * * *` | `select public.boost_lifecycle()` |
| break-glass-expire | `*/15 * * * *` | `select public.bg_expire()` |
| break-glass-retention | `30 3 1 * *` | `select public.bg_purge()` |
| calendar-sync | `17 * * * *` | `select public.dispatch_worker('/api/cron/calendar-sync')` |
| db-backup | `*/10 2-3 * * *` | `select public.dispatch_db_backup()` |
| email-outbox | `*/2 * * * *` | `select public.dispatch_worker('/api/cron/email')` |
| marketplace-sweep | `*/5 * * * *` | `select public.marketplace_sweep()` |
| payments-worker | `*/5 * * * *` | `select public.dispatch_worker('/api/cron/payments')` |
| privacy-deletions | `17 2 * * *` | `select public.dispatch_worker('/api/cron/privacy')` |
| retention-security-logs | `45 3 2 * *` | `select public.retention_purge_security_logs()` |
| scan-uploads | `*/5 * * * *` | `select public.dispatch_worker('/api/cron/scan-uploads')` |
| storage-backup | `*/15 * * * *` | `select public.dispatch_worker('/api/cron/storage-backup')` |
| waitlist-notify | `*/5 * * * *` | `select public.notify_waitlists()` |
| webhook-deliveries | `* * * * *` | `select public.dispatch_worker('/api/cron/webhooks')` |

## Storage policies (live, `storage.objects`)

- avatars_delete [DELETE]
- avatars_insert [INSERT]
- event_media_delete [DELETE]
- event_media_insert [INSERT]
- event_media_select [SELECT]
- listing_media_delete [DELETE]
- listing_media_insert [INSERT]
- listing_media_select [SELECT]
- workspace_files_delete [DELETE]
- workspace_files_read [SELECT]
- workspace_files_upload [INSERT]
