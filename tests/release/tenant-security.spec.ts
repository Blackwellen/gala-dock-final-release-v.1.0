import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn, totp } from "../phase1/helpers";
import { keyringStatus, needsRotation, open, rotate, seal } from "../../src/lib/crypto/field-encryption";

// Q01 tenant / auth / security suite (backend §16 RLS matrix, §21 threat model). API-level only, no browser.
// Every authorization assertion uses an ordinary user or anonymous client against the live REST/RPC endpoints — the same path
// the browser uses. The service role is used only for fixture setup/teardown and to read the catalogue audit.
// Independent of CAPTCHA/Turnstile: identities come from tests/phase1/helpers (disposable, email-confirmed).

const db = admin as unknown as SupabaseClient;
type U = { id: string; email: string };
const as = async (u: U) => (await signedIn(u.email)) as unknown as SupabaseClient;
const day = 864e5;
const iso = (ms: number) => new Date(ms).toISOString();
const ids = (r: { data: unknown }) => ((r.data ?? []) as { id: string }[]).map(x => x.id);

// SECURITY DEFINER functions that anonymous visitors may execute, by design (public catalogue, token-gated checkout/portal/proposal
// flows, waiting room, maintenance banner, flags). Anything new must be reviewed and added here deliberately.
const ANON_DEFINER_ALLOWLIST = new Set([
  // Reviewed 2026-10-30: public pages (202610294060 / 4080-4082 / 4081+4083) return public-safe fields only; event_is_public (4084) is a boolean
  // policy helper; stripe_livemode / stripe_platform_livemode (202610295001) return the platform mode boolean and back a column default.
  "public_event_extras", "public_listing_availability", "public_event_getting_there", "event_is_public", "stripe_livemode", "stripe_platform_livemode",
  "accept_proposal", "active_boosts", "can_see_agent_run", "checkout_holds", "event_launch_state", "event_virtual_public", "feature_enabled",
  "hold_seats", "hold_tickets", "invite_preview", "is_workspace_member", "maintenance_level", "maintenance_state",
  "portal_comment", "portal_decide", "portal_document", "portal_view", "promoter_track_click", "proposal_by_token", "public_event_plan",
  "public_organizer", "public_workspace", "queue_join", "queue_status", "record_boost_event", "release_checkout", "release_resale_holds",
  "release_seat_holds", "reliability_band", "resale_holds_for", "resale_listings", "ticket_fee_config",
  // Q07: public "can this event take payments" flag shown on public event pages; owner-approved 2026-10-28.
  "event_payment_readiness",
  // Q27: partner referral click counter for signed-out visitors (mirrors promoter_track_click; rate-limited, visitor hash only); approved 2026-10-29 under owner delegation.
  "partner_track_click",
]);
// Internal/worker functions that take a workspace/user id or move money/state and must never be callable by a client role.
const SERVICE_ONLY = ["payout_eligible", "service_backfill_provider_job", "entitlement", "has_capability", "hit_rate_limit", "space_conflicts_internal", "security_catalog_audit",
  "notify_workspace", "notify_event", "dispatch_worker", "post_ledger_transaction", "issue_tickets", "issue_checkout", "storage_usage_internal",
  "resolve_api_key", "record_ai_usage", "erase_user_data", "claim_webhook_event", "payment_order_succeeded", "portal_link_for",
  // Q02/Q03 foundation primitives (service-only)
  "master_data_audit", "setting_at", "db_now", "advisory_xact_lock", "try_advisory_xact_lock", "emit_domain_event", "enqueue_job", "claim_jobs", "complete_job",
  "fail_job", "retry_dead_job", "publish_domain_outbox", "run_db_jobs", "job_agent_routine_wake", "idempotency_begin", "idempotency_finish", "transition_state",
  "state_transition_allowed", "purge_foundation_history", "outbox_has_routine_listener",
  // Q23 ad serving/integrity and Q28 billing/profitability workers (owner-approved 2026-10-28)
  "serve_ad_slots", "record_ad_view", "record_ad_click", "ad_candidates", "ad_viewer_key", "ad_settle_boosts", "ad_impression_goal",
  "billing_apply_subscription", "billing_record_invoice", "billing_credit_pack_paid", "billing_link_customer", "billing_overage_due",
  "billing_mark_overage_invoiced", "workspace_has_paid_subscription", "job_billing_sweep", "job_ai_profitability_alert",
  // Q04 files / Q05 communications / Q06 search workers (lane A, 2026-10-28)
  "file_access_decision", "file_register", "file_record_verdict", "file_quarantine", "file_mark_deleted", "job_files_retention_sweep", "job_files_meter_snapshot",
  "notify", "email_record_event", "marketing_subscribe", "marketing_confirm", "marketing_unsubscribe", "contact_submit",
  "cache_bump", "cache_version", "search_index_document", "search_query", "public_search", "public_autocomplete", "search_rebuild", "job_search_reconcile", "job_search_drain",
  // Q10–Q12 booking integrity / order orchestration internals (lane A, 2026-10-29; pending owner approval)
  "booking_item_space", "booking_conflict_recover", "booking_space_backfill_report", "marketplace_request_refresh", "order_group_refresh", "marketplace_quote_expiry_sweep",
  // P1 build_items payment guard, Q15 build engine, Q09 ranking/discovery internals (lane A, 2026-10-29)
  "build_items_client_guard", "public_discover", "ranking_models_immutable",
  // Q09 correction: full ranking with reasons/scores is internal (lane A, 2026-10-29)
  "marketplace_search_ranked", "marketplace_can_explain",
  // Q13 hospitality engine internals (lane A, 2026-10-29)
  "hospitality_compute", "hospitality_refresh", "hospitality_freeze", "hospitality_beo_section", "hospitality_is_provider",
  "menu_items_allergen_guard", "hospitality_selection_changed", "build_items_hospitality_confirm",
  // Q19 map engine internals and the Q14 lifecycle hook (lane A, 2026-10-29)
  "event_map_venue", "event_map_lock_violations", "map_validate_core", "event_map_validate_internal", "event_map_bindings_internal", "event_map_blockers",
  // Q14 event core workers / server-only resolvers (lane D, 2026-10-29)
  "complete_ended_events", "job_events_complete_ended", "event_guest_view",
  // Q14 remainder: dependency/template/brief internals (lane D, 2026-10-29)
  "event_dependency_met", "event_dependencies_guard", "event_dependency_blockers", "tasks_dependency_guard", "ticket_tier_dependency_guard",
  "event_dependency_can_write", "event_dependency_readiness", "event_structure_snapshot", "apply_event_structure", "event_template_structure",
  "event_template_usable",
  // Q18/Q21 guests, registration, access, credential internals and server-only token flows (lane D, 2026-10-29)
  "event_guest_privacy", "guests_integrity_guard", "guest_groups_guard", "guest_care_guard", "guests_dietary_mirror", "guest_rsvp",
  "registration_forms_guard", "submit_registration", "registration_set_status", "access_integrity_guard", "tickets_credential_rotate",
  "tickets_credential_outbox",
  // Q20 ticket inventory / checkout internals, triggers and workers (lane D, 2026-10-29)
  "ticket_allocation_used", "ticket_tier_reserved", "ticket_allocations_guard", "checkout_apply_code", "checkout_remove_code", "checkout_quote",
  "checkout_order_quote_guard", "checkout_order_reserve_codes", "checkout_order_lifecycle_sync", "checkout_order_lifecycle_after", "ticket_order_transition",
  "ticket_inventory_sweep", "expire_resale_holds_internal", "issue_seated_tickets", "issue_resale",
  // Q22 resale policy / settlement / velocity internals and triggers (lane D, 2026-10-29)
  "resale_policies_immutable", "resale_policy_for", "ticket_resale_restrictions", "tickets_resale_policy_guard", "tickets_resale_listing_record",
  "resale_settlement_mode", "resale_settlement_seller", "checkout_risk_check", "checkout_orders_chargeback_flag",
  // Q08 trust / verification / reliability / moderation internals and workers (lane C, 2026-10-29)
  "verification_step", "trust_sync_stripe_check", "trust_listing_rules", "trust_workspace_rules", "trust_credential_eval", "trust_active_enforcement",
  "trust_credential_rows", "trust_identity_verified", "trust_eligibility_internal", "trust_listing_badge_calc", "trust_workspace_status_calc",
  "trust_refresh_workspace", "trust_assert_can_accept", "trust_notify_workspace", "job_trust_expiry_daily", "reliability_compute",
  "job_trust_reliability_daily", "trust_review_aggregate", "trust_apply_effect", "trust_lift_internal", "verification_checks_touch",
  "provider_documents_guard", "provider_documents_after", "trust_refresh_from_row", "listings_trust_badge_guard", "workspaces_trust_status_guard",
  "provider_quotes_trust_guard", "provider_jobs_trust_guard", "reliability_formulas_immutable",
  // Q16 CRM / proposals / contracts and Q17 team / live-ops internals, triggers and workers (lane C, 2026-10-29)
  "client_resolve", "client_live", "trg_link_client", "trg_clients_guard", "trg_leads_stage", "trg_leads_stage_history", "sales_period_metrics", "capture_lead",
  "contract_require", "contract_record_signature", "contract_by_token", "contract_sign_by_token", "job_contracts_expiry_daily", "trg_contracts_immutable",
  "trg_invite_crew_guard", "trg_invite_crew_link", "trg_shift_notify", "my_shifts_link", "shift_for_self", "operational_conflicts_internal", "trg_incident_timeline", "trg_incident_stamp",
  // Q31 maintenance audiences and Q27 promoter/affiliate commission internals, triggers and workers (lane B, 2026-10-29)
  "maintenance_audiences", "trg_maintenance_payment_orders", "trg_ledger_commission_families", "trg_promoter_rule_version", "trg_partner_rule_version",
  "trg_promoter_sale_snapshot", "trg_promoter_sale_accrued", "trg_promoter_refund_reversal", "trg_promoter_dispute_reversal", "trg_promoter_sale_lock",
  "trg_promoter_payout_conserved", "trg_partner_workspace_referral", "trg_partner_earning_snapshot", "trg_partner_earning_ledger", "trg_partner_invoice",
  "promoter_post_memo", "promoter_reverse_order", "partner_link_referral", "partner_post_memo", "partner_statement_recompute", "partner_qualify_invoice",
  "partner_reverse_earning", "partner_build_statements",
  // Q24–Q26 sponsors/talent/riders, logistics, licensing/safety/weather internals, triggers and workers (lane C, 2026-10-29)
  "ops_event_require", "ops_touch", "exhibitor_booths_guard", "talent_riders_immutable", "map_element_exists", "event_space_ok", "event_ops_checks",
  "event_ops_checks_partners", "event_ops_checks_logistics", "event_ops_checks_compliance", "event_compliance_facts", "compliance_rule_applies",
  "event_compliance_requirements_internal", "safety_plans_immutable", "weather_record_forecast", "weather_provider_unavailable", "job_compliance_expiry_daily",
  // Q29 virtual sessions / access internals, triggers and workers; Q30 API / webhook / feed / calendar-health internals (lane C, 2026-10-29)
  "virtual_ticket_refusal", "virtual_session_role", "virtual_close_attendance", "virtual_capacity_check", "trg_virtual_tier_capacity", "trg_tickets_virtual_revoke",
  "trg_registrations_virtual_revoke", "virtual_record_provider_attendance", "virtual_attendance_sweep",
  "api_tool_args_check", "webhook_public_payload", "webhook_public_type", "webhook_signing_secrets", "api_event_feed", "calendar_sync_health",
  // Q07 pay-link resolver and Q16 share-link resolvers / server-side "viewed" beacon (lane B, 2026-10-29)
  "invoice_by_token", "proposal_share_lookup", "contract_share_lookup", "mark_proposal_viewed",
  // Q23 remainder: distribution, follow alerts, campaign dispatch/consent/attribution, media checks and workers (lane A, 2026-10-29)
  "event_distribution_eval", "event_distribution_sync", "trg_event_distribution", "trg_listing_distribution", "distribution_sweep", "job_distribution_sweep",
  "directory_featured_guard", "follow_subject_valid", "job_promotion_follow_alerts", "campaign_blockers", "audience_consent_record", "audience_unsubscribe",
  "campaign_dispatch_message", "record_campaign_touch", "trg_campaign_attribution", "campaign_tick", "job_promotion_campaign_tick",
  "media_public_problems", "media_assets_public_guard", "complete_design_export", "job_media_exports_sweep", "design_templates_scrub",
  // Q40 advanced event composition internals, triggers, hooks and workers (lane A, 2026-10-29)
  "events_composition_guard", "series_create_occurrence", "event_children", "composition_binding_guard", "build_items_day_guard",
  "ticket_pass_propagate", "tickets_pass_entitlements", "pass_entitlement_check", "event_composition_blockers",
  "event_forms_guard", "waiver_templates_immutable", "stock_movements_apply", "merch_release_lines", "merch_mark_paid", "merch_expire_sweep",
  "job_merch_expire", "job_lost_property_sweep",
  // Q31 remainder: support lifecycle triggers/helpers, SLA sweep worker, health snapshot + queue health (lane D, 2026-10-29)
  "support_case_events_immutable", "support_link_label", "support_cases_before", "support_cases_after", "support_case_for_admin",
  "job_support_sla_sweep", "record_health_snapshot", "queue_health",
  // Q41 agent governance: governed tool execution, refusal check, run guard, ledger guard, approval-expiry worker (lane D, 2026-10-29)
  "agent_execute_tool", "agent_governance_refusal", "agent_runs_governance", "agent_tool_calls_guard", "job_agent_approval_expiry",
  // Q34 observability / SRE workers, signals and recorders (lane A, 2026-10-29)
  "ops_collect_metrics", "ops_slo_status", "ops_cron_freshness", "ops_backup_status", "ops_alert_signal", "ops_alert_recipients", "ops_open_incident_internal",
  "ops_evaluate_alerts", "job_ops_observe", "job_ops_probe_noop", "ops_record_synthetic_run", "ops_record_restore_test", "ops_health_summary",
  // Q35 analytics capture/build/eval internals (lane C, 2026-10-29); capture is reached only through the rate-limited route handler
  "analytics_pseudonym", "analytics_user_is_demo", "analytics_workspace_is_demo", "analytics_capture", "analytics_capture_server", "analytics_consent_for",
  "analytics_forget_user", "analytics_build_day", "analytics_build_range", "job_analytics_build_facts", "analytics_eval_sum", "analytics_eval",
  "analytics_m_ticket_sell_through", "analytics_m_scan_rate", "analytics_m_subscription_mrr", "analytics_m_ai_revenue", "analytics_m_promotion_revenue",
  "analytics_m_ai_margin", "analytics_m_gross_margin", "analytics_m_provider_supply", "analytics_m_capacity_use", "analytics_m_net_gmv", "analytics_m_event_conversion",
  "analytics_snapshot_period", "job_analytics_snapshot", "analytics_export_allowed", "job_analytics_export", "analytics_expire_exports",
  // Q36 experiment assignment/exposure/guardrail internals (lane C, 2026-10-29)
  "experiment_bucket", "experiments_killed", "experiment_unit", "experiment_assign", "experiment_expose", "experiment_evaluate_internal",
  "experiment_guardrail_sweep", "job_experiment_guardrails", "experiments_forget_user",
  // Q37 push sender internals (lane C, 2026-10-29)
  "push_enqueue", "push_claim", "push_mark"];
const SERVICE_ONLY_TABLES = ["calendar_connections", "calendar_sync_links", "checkout_resale_allocations", "launch_queue", "mfa_recovery_codes",
  "rate_limits", "resale_holds", "state_machines", "state_transitions", "state_violations", "storage_attribution", "storage_backups",
  "stripe_refund_totals", "ticket_holds", "webhook_events",
  "domain_event_types", "domain_outbox", "job_kinds", "event_subscriptions", "job_queue", "consumer_inbox", "idempotency_keys",
  "ad_impressions",
  // Q04 / Q05 / Q06 (lane A, 2026-10-28)
  "file_tombstones", "email_suppressions", "email_events", "marketing_subscriptions", "search_documents", "search_index_queue", "search_synonyms", "cache_versions",
  // Q08 (lane C, 2026-10-29)
  "trust_policy",
  // Q27 partner attribution (lane B, 2026-10-29)
  "partner_attributions",
  // Q20 checkout code applications (lane D, 2026-10-29)
  "checkout_code_applications",
  // Q29 join tokens and Q30 webhook payload allow-list (lane C, 2026-10-29)
  "virtual_join_tokens", "webhook_payload_fields",
  // Q23 remainder (lane A, 2026-10-29)
  "audience_consents", "campaign_deliveries", "campaign_touches", "campaign_attributions",
  // Q35 analytics warehouse (lane C, 2026-10-29): raw pseudonymous events, HMAC key and facts are read only through checked functions
  "analytics_keys", "analytics_events", "fact_payment_daily", "fact_ticket_daily", "fact_event_daily", "fact_booking_daily", "fact_agent_daily", "fact_product_daily",
  // Q36 experiments (lane C, 2026-10-29): pseudonymous assignments/exposures
  "experiment_assignments", "experiment_exposures",
  // Q37 push outbox (lane C, 2026-10-29)
  "push_outbox"];

test.describe.configure({ mode: "serial" });

test.describe("Q01 tenant & security foundation", () => {
  let aOwner: U, aMember: U, bOwner: U, pOwner: U, cOwner: U;
  let A: string, B: string, P: string, C: string;
  let EA: string, EC: string, TA: string, BI: string, S: string;
  const workspaces: string[] = [];
  const events: string[] = [];

  test.beforeAll(async () => {
    [aOwner, aMember, bOwner, pOwner, cOwner] = await Promise.all([createUser("q01-ao"), createUser("q01-am"), createUser("q01-bo"), createUser("q01-po"), createUser("q01-co")]);
    A = await seedWorkspace(aOwner.id, "organizer", "Q01 Tenant A");
    B = await seedWorkspace(bOwner.id, "organizer", "Q01 Tenant B");
    P = await seedWorkspace(pOwner.id, "provider", "Q01 Venue Co");
    C = await seedWorkspace(cOwner.id, "organizer", "Q01 Suspended Org");
    workspaces.push(A, B, P, C);
    await db.from("workspace_members").insert({ workspace_id: A, user_id: aMember.id, role: "member", status: "active" });
    EA = ((await db.from("events").insert({ owner_id: aOwner.id, workspace_id: A, name: "Q01 Private Gala", starts_at: iso(Date.now() + 40 * day) }).select("id").single()).data as { id: string }).id;
    EC = ((await db.from("events").insert({ owner_id: cOwner.id, workspace_id: C, name: "Q01 Suspended Event" }).select("id").single()).data as { id: string }).id;
    events.push(EA, EC);
    TA = ((await db.from("tasks").insert({ workspace_id: A, event_id: EA, owner_id: aOwner.id, title: "Q01 private task" }).select("id").single()).data as { id: string }).id;
    const L = ((await db.from("listings").insert({ workspace_id: P, name: "Q01 Hall", kind: "venue", category: "venue", published: true }).select("id").single()).data as { id: string }).id;
    S = ((await db.from("spaces").insert({ workspace_id: P, venue_id: L, name: "Q01 Main Room", status: "published" }).select("id").single()).data as { id: string }).id;
    await db.from("availability_blocks").insert({ workspace_id: P, listing_id: L, space_id: S, kind: "blocked", note: "Smith private wedding", starts_at: iso(Date.now() + 30 * day), ends_at: iso(Date.now() + 30 * day + 6 * 36e5) });
    BI = ((await db.from("build_items").insert({ event_id: EA, listing_id: L, category: "venue", title: "Q01 Hall hire", amount: 1000, status: "quoted" }).select("id").single()).data as { id: string }).id;
  });

  test.afterAll(async () => {
    for (const e of events) await db.from("events").delete().eq("id", e);
    for (const w of workspaces) await db.from("workspaces").delete().eq("id", w);
    await cleanup();
  });

  test("catalogue: least-privilege grants, RLS everywhere, definer functions pinned and scoped", async () => {
    const { data, error } = await db.rpc("security_catalog_audit");
    expect(error).toBeNull();
    const audit = data as { definer: { name: string; returns: string; anon: boolean; authenticated: boolean; search_path: boolean }[];
      tables: { table: string; rls: boolean; policies: number; anon: string[]; authenticated: string[] }[] };
    expect(audit.tables.length).toBeGreaterThan(150);
    expect(audit.tables.filter(t => !t.rls).map(t => t.table)).toEqual([]);
    expect(audit.tables.filter(t => [...t.anon, ...t.authenticated].some(p => ["TRUNCATE", "REFERENCES", "TRIGGER"].includes(p))).map(t => t.table)).toEqual([]);
    expect(audit.tables.filter(t => t.anon.some(p => ["INSERT", "UPDATE", "DELETE"].includes(p))).map(t => t.table)).toEqual([]);
    expect(audit.tables.filter(t => SERVICE_ONLY_TABLES.includes(t.table) && (t.anon.length || t.authenticated.length)).map(t => t.table)).toEqual([]);
    expect(audit.definer.filter(f => !f.search_path).map(f => f.name)).toEqual([]);
    const anonCallable = audit.definer.filter(f => f.anon && f.returns !== "trigger").map(f => f.name);
    expect(anonCallable.filter(n => !ANON_DEFINER_ALLOWLIST.has(n))).toEqual([]);
    expect(audit.definer.filter(f => SERVICE_ONLY.includes(f.name) && (f.anon || f.authenticated)).map(f => f.name)).toEqual([]);
  });

  test("anonymous direct REST/RPC access is refused", async () => {
    const a = anon() as unknown as SupabaseClient;
    expect((await a.from("tasks").insert({ title: "anon write" })).error).not.toBeNull();
    expect((await a.from("mfa_recovery_codes").select("id").limit(1)).error?.code).toBe("42501");
    expect((await a.from("rate_limits").select("key").limit(1)).error?.code).toBe("42501");
    expect((await a.rpc("payout_eligible", { p_workspace: P })).error).not.toBeNull();
    expect((await a.rpc("entitlement", { p_workspace: A, p_capability: "api.access" })).error).not.toBeNull();
    expect(ids(await a.from("workspaces").select("id").eq("id", A))).toEqual([]);
    expect(ids(await a.from("events").select("id").eq("id", EA))).toEqual([]);
    expect((await a.rpc("event_virtual_public", { p_event: EA })).data ?? null).toBeNull();
  });

  test("another tenant cannot read or write by guessed id (tables and definer RPCs)", async () => {
    const b = await as(bOwner);
    expect(ids(await b.from("events").select("id").eq("id", EA))).toEqual([]);
    expect(ids(await b.from("tasks").select("id").eq("id", TA))).toEqual([]);
    expect(ids(await b.from("build_items").select("id").eq("id", BI))).toEqual([]);
    expect(((await b.from("workspace_members").select("user_id").eq("workspace_id", A)).data ?? [])).toEqual([]);
    expect(((await b.from("audit_events").select("id").eq("workspace_id", A).limit(1)).data ?? [])).toEqual([]);
    expect((await b.from("tasks").insert({ workspace_id: A, event_id: EA, title: "cross-tenant write" })).error).not.toBeNull();
    expect(ids(await b.from("events").update({ name: "Hijacked" }).eq("id", EA).select("id"))).toEqual([]);
    expect(ids(await b.from("tasks").delete().eq("id", TA).select("id"))).toEqual([]);
    expect((await db.from("events").select("name").eq("id", EA).single()).data?.name).toBe("Q01 Private Gala");
    expect((await db.from("tasks").select("id").eq("id", TA)).data?.length).toBe(1);
    // Definer RPCs that take another tenant's id
    expect((await b.rpc("cancellation_quote", { p_item: BI, p_party: "customer", p_kind: "full" })).error?.message).toMatch(/not_authorized/);
    expect((await b.rpc("ai_credit_status", { p_workspace: A })).error?.message).toMatch(/not_authorized/);
    expect((await b.rpc("storage_usage", { p_workspace: A, p_user: null })).error?.message).toMatch(/forbidden/);
    expect((await b.rpc("create_api_key", { p_workspace: A, p_name: "x", p_scopes: ["events:read"], p_prefix: "gd_x", p_hash: "0".repeat(64), p_expires: null })).error?.message).toMatch(/not_authorized/);
    expect((await b.rpc("set_member_role", { p_ws: A, p_user: aMember.id, p_role: "manager" })).error?.message).toMatch(/not_authorized/);
    expect((await b.rpc("can_access_event", { target: EA })).data).toBe(false);
    // Positive control: the owning tenant still works
    const a = await as(aOwner);
    expect(ids(await a.from("events").select("id").eq("id", EA))).toEqual([EA]);
    const q = await a.rpc("cancellation_quote", { p_item: BI, p_party: "customer", p_kind: "full" });
    expect(q.error).toBeNull();
    expect((q.data as { total: number }).total).toBe(1000);
  });

  test("space conflicts reveal only 'taken' to other tenants, full detail to the venue", async () => {
    const window = { p_space: S, p_starts: iso(Date.now() + 30 * day + 36e5), p_ends: iso(Date.now() + 30 * day + 2 * 36e5) };
    const outsider = (await (await as(bOwner)).rpc("space_conflicts", window)).data as { level: string; reason: string; ref_id: string | null }[];
    expect(outsider.length).toBeGreaterThan(0);
    expect(outsider.every(r => r.ref_id === null && !/Smith/.test(r.reason))).toBe(true);
    const venue = (await (await as(pOwner)).rpc("space_conflicts", window)).data as { reason: string; ref_id: string | null }[];
    expect(venue.some(r => r.ref_id !== null && /Smith/.test(r.reason))).toBe(true);
  });

  test("revoked membership loses access immediately, even to records the member created", async () => {
    const m = await as(aMember);
    const created = await m.from("events").insert({ owner_id: aMember.id, workspace_id: A, name: "Q01 member-created" }).select("id").single();
    expect(created.error).toBeNull();
    const EM = (created.data as { id: string }).id; events.push(EM);
    expect(ids(await m.from("events").select("id").in("id", [EA, EM])).sort()).toEqual([EA, EM].sort());
    expect(ids(await m.from("tasks").select("id").eq("id", TA))).toEqual([TA]);

    await db.from("workspace_members").update({ status: "revoked" }).eq("workspace_id", A).eq("user_id", aMember.id);
    // Same client, same unexpired JWT: RLS re-evaluates membership on every statement.
    expect(ids(await m.from("events").select("id").in("id", [EA, EM]))).toEqual([]);
    expect(ids(await m.from("tasks").select("id").eq("id", TA))).toEqual([]);
    expect((await m.rpc("can_access_event", { target: EM })).data).toBe(false);
    expect((await m.from("tasks").insert({ workspace_id: A, title: "after revoke" })).error).not.toBeNull();
    expect(ids(await m.from("events").update({ name: "after revoke" }).eq("id", EM).select("id"))).toEqual([]);
    expect((await m.rpc("has_permission", { p_workspace: A, p_permission: "events.read" })).data).toBe(false);
  });

  test("a suspended workspace is blocked, including for its owner", async () => {
    const c = await as(cOwner);
    expect(ids(await c.from("events").select("id").eq("id", EC))).toEqual([EC]);
    await db.from("workspaces").update({ status: "suspended" }).eq("id", C);
    expect(ids(await c.from("events").select("id").eq("id", EC))).toEqual([]);
    expect((await c.rpc("can_access_event", { target: EC })).data).toBe(false);
    expect((await c.rpc("has_permission", { p_workspace: C, p_permission: "events.read" })).data).toBe(false);
    expect((await c.from("tasks").insert({ workspace_id: C, title: "while suspended" })).error).not.toBeNull();
    expect(ids(await c.from("workspaces").update({ status: "active" } as never).eq("id", C).select("id"))).toEqual([]);
    // The owner can still see the workspace row itself (to show the suspension notice) and its status.
    expect((await c.from("workspaces").select("status").eq("id", C).single()).data?.status).toBe("suspended");
  });

  test("owners cannot self-grant entitlements, flags or security policy through REST", async () => {
    const a = await as(aOwner);
    const settings = ((await db.from("workspaces").select("settings").eq("id", A).single()).data?.settings ?? {}) as Record<string, unknown>;
    for (const key of ["entitlements", "flags", "security"]) {
      const r = await a.from("workspaces").update({ settings: { ...settings, [key]: { "api.access": true, mfa_policy: "optional" } } }).eq("id", A);
      expect(r.error?.message).toMatch(new RegExp(`protected_setting:${key}`));
    }
    const ins = await a.from("workspaces").insert({ owner_id: aOwner.id, kind: "organizer", name: "Q01 self-granted", settings: { entitlements: { "api.access": true } } });
    expect(ins.error?.message).toMatch(/protected_setting:entitlements/);
    // Unprotected onboarding keys still save.
    expect((await a.from("workspaces").update({ settings: { ...settings, brand: { colour: "#123456" } } }).eq("id", A)).error).toBeNull();
    expect((await db.rpc("entitlement", { p_workspace: A, p_capability: "api.access" })).data).not.toBe(true);
  });

  test("feature flags evaluate server-side and never leak another tenant's override", async () => {
    const a = await as(aOwner), b = await as(bOwner);
    expect((await a.rpc("feature_enabled", { p_flag: "q01_unknown_flag", p_workspace: A })).data).toBe(false);
    // Temporarily publish a probe definition (default off), restoring the published registry afterwards.
    const { data: cur } = await db.from("platform_settings").select("id,version,value").eq("section", "flags").eq("status", "published").single();
    const { data: max } = await db.from("platform_settings").select("version").eq("section", "flags").order("version", { ascending: false }).limit(1).single();
    await db.from("platform_settings").update({ status: "superseded" }).eq("id", cur!.id);
    const { data: probe, error } = await db.from("platform_settings").insert({ section: "flags", version: (max!.version as number) + 1, status: "published",
      value: { ...((cur!.value ?? {}) as object), q01_probe: { enabled: false, description: "Q01 suite probe" } }, change_reason: "Q01 test probe (removed after run)" }).select("id").single();
    expect(error).toBeNull();
    try {
      expect((await a.rpc("feature_enabled", { p_flag: "q01_probe", p_workspace: A })).data).toBe(false);
      const { data: w } = await db.from("workspaces").select("settings").eq("id", A).single();
      await db.from("workspaces").update({ settings: { ...((w?.settings ?? {}) as object), flags: { q01_probe: true } } }).eq("id", A);
      expect((await a.rpc("feature_enabled", { p_flag: "q01_probe", p_workspace: A })).data).toBe(true);
      expect((await b.rpc("feature_enabled", { p_flag: "q01_probe", p_workspace: A })).data).toBe(false);
      expect(((await (anon() as unknown as SupabaseClient).rpc("feature_enabled", { p_flag: "q01_probe", p_workspace: A })).data)).toBe(false);
    } finally {
      await db.from("platform_settings").delete().eq("id", probe!.id);
      await db.from("platform_settings").update({ status: "published" }).eq("id", cur!.id);
    }
  });

  test("step-up: a user with a verified factor must be on an aal2 session for sensitive actions", async () => {
    const u = await createUser("q01-mfa"); const mate = await createUser("q01-mate");
    const ws = await seedWorkspace(u.id, "organizer", "Q01 MFA Org"); workspaces.push(ws);
    await db.from("workspace_members").insert({ workspace_id: ws, user_id: mate.id, role: "member", status: "active" });
    // Without any factor the action is allowed (nothing to step up to).
    expect((await (await as(u)).rpc("set_member_role", { p_ws: ws, p_user: mate.id, p_role: "manager" })).error).toBeNull();
    const verified = await as(u);
    const { data: f } = await verified.auth.mfa.enroll({ factorType: "totp", friendlyName: "q01" });
    expect((await verified.auth.mfa.challengeAndVerify({ factorId: f!.id, code: totp(f!.totp.secret) })).error).toBeNull();
    const passwordOnly = await as(u); // new password session: aal1 while an aal2 factor exists
    const r = await passwordOnly.rpc("set_member_role", { p_ws: ws, p_user: mate.id, p_role: "finance" });
    expect(r.error?.message).toMatch(/step_up_required/);
    expect((await db.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", mate.id).single()).data?.role).toBe("manager");
    expect((await verified.rpc("set_member_role", { p_ws: ws, p_user: mate.id, p_role: "finance" })).error).toBeNull();
  });

  test("session revocation: a revoked session's unexpired token can no longer perform sensitive actions or refresh", async () => {
    const u = await createUser("q01-sess"); const mate = await createUser("q01-sess-m");
    const ws = await seedWorkspace(u.id, "organizer", "Q01 Session Org"); workspaces.push(ws);
    await db.from("workspace_members").insert({ workspace_id: ws, user_id: mate.id, role: "member", status: "active" });
    const keep = await as(u), stolen = await as(u);
    expect((await stolen.rpc("session_is_live")).data).toBe(true);
    expect(((await keep.rpc("revoke_other_sessions")).data as number)).toBeGreaterThanOrEqual(1);
    expect((await keep.rpc("session_is_live")).data).toBe(true);
    expect((await stolen.rpc("session_is_live")).data).toBe(false);
    expect((await stolen.rpc("set_member_role", { p_ws: ws, p_user: mate.id, p_role: "manager" })).error?.message).toMatch(/session_revoked/);
    expect((await stolen.auth.refreshSession()).error).not.toBeNull();
    expect((await keep.rpc("set_member_role", { p_ws: ws, p_user: mate.id, p_role: "manager" })).error).toBeNull();
  });
});

test.describe("Q01 field / token encryption contract", () => {
  const k1 = Buffer.alloc(32, 1).toString("base64"), k2 = Buffer.alloc(32, 2).toString("hex");
  const env1 = { FIELD_ENCRYPTION_KEYS: `k1:${k1}` };
  const env2 = { FIELD_ENCRYPTION_KEYS: `k1:${k1},k2:${k2}` };

  test("seals with the active key, binds context and rotates without losing data", () => {
    const sealed = seal("refresh-token-secret", "calendar_tokens", env1);
    expect(sealed.startsWith("gd2.k1.")).toBe(true);
    expect(sealed).not.toContain("refresh-token-secret");
    expect(open(sealed, "calendar_tokens", env1)).toBe("refresh-token-secret");
    expect(() => open(sealed, "other_field", env1)).toThrow();
    expect(needsRotation(sealed, env2)).toBe(true);
    const rotated = rotate(sealed, "calendar_tokens", env2);
    expect(rotated.startsWith("gd2.k2.")).toBe(true);
    expect(open(rotated, "calendar_tokens", env2)).toBe("refresh-token-secret");
    expect(() => open(rotated, "calendar_tokens", env1)).toThrow(/unknown_key_id/);
  });

  test("reports configuration honestly", () => {
    expect(keyringStatus({}).status).toBe("not_configured");
    expect(keyringStatus({ FIELD_ENCRYPTION_KEYS: "k1:short" }).status).toBe("misconfigured");
    expect(keyringStatus({ ...env2, FIELD_ENCRYPTION_ACTIVE_KEY: "k9" }).status).toBe("misconfigured");
    expect(keyringStatus(env2)).toMatchObject({ status: "ready", activeKid: "k2", kids: ["k1", "k2"], kms: "not_declared" });
    expect(keyringStatus({ ...env2, KMS_PROVIDER: "aws-kms" }).kms).toBe("blocked_external");
    expect(() => seal("x", "ctx", {})).toThrow(/not_configured/);
  });
});
