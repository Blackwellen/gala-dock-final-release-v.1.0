import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { anon, cleanup, createUser, signedIn } from "../phase1/helpers";

// Q45 authorisation sweep (backend §16 RLS matrix / v6 GD-20 security gate). Generated, not hand-picked:
//  1. Reads every SECURITY DEFINER function in `public` from the catalogue and classifies it
//     (trigger / service-only / authenticated / anon-allowlisted).
//  2. Calls EVERY authenticated-executable, non-trigger definer function as a fresh signed-in user who is a member of nothing,
//     with realistic arguments that point at another tenant's real rows (demo organiser Alex Events, demo venue Riverside Arena).
//     Each call runs under `set role authenticated` + the outsider's real JWT claims (exactly what PostgREST does), inside ONE
//     transaction that is always rolled back — so nothing an unchecked function might write ever persists, and no worker,
//     email or pg_net request is ever released (they only leave on commit).
//  3. The same calls run as the owning tenant (control) so a refusal can be told apart from an input error.
//  4. Every outsider call that succeeds AND returns tenant data or writes a row must appear in REVIEWED below with a reason;
//     anything else fails the test. The full per-function register is written to artifacts/security/q45-authz-sweep.json.
// Read-only towards live data by construction (rolled back). Needs SUPABASE_PROJECT_REF + SUPABASE_PAT_KEY (management SQL).

const REF = process.env.SUPABASE_PROJECT_REF, PAT = process.env.SUPABASE_PAT_KEY;
const OUT = process.env.Q45_SWEEP_OUT ?? "artifacts/security/q45-authz-sweep.json";
const ALEX = "75e6c471-8d5e-4b9f-b076-ff10cf209f01";       // demo organiser workspace (target tenant)
const RIVERSIDE = "960fab34-54fc-40a0-85ab-cc4ea6197701";  // demo venue workspace (target tenant, provider side)
const DEMO_WS = [ALEX, RIVERSIDE, "1e66e4e9-1e25-46a4-969b-79272c429477", "a9260426-9059-49bb-be38-be9f6f3182db", "5dc313a7-d4d9-4089-8590-d97eac48f6c4"];

async function sql<T = Record<string, unknown>>(query: string, attempt = 0): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(300_000) });
  const t = await r.text();
  // The management API is shared with the other lanes: back off on its throttle instead of failing (or bisecting) a batch.
  if (r.status === 429 && attempt < 8) { await new Promise(res => setTimeout(res, 5_000 * (attempt + 1))); return sql<T>(query, attempt + 1); }
  if (!r.ok) throw new Error(`sql HTTP ${r.status}: ${t.slice(0, 600)}`);
  return JSON.parse(t) as T[];
}

type Fn = { oid: number; name: string; ident: string; argnames: string[]; argtypes: string[] | null; argmodes: string[]; returns: string; retset: boolean;
  anon: boolean; auth: boolean; svc: boolean; config: string; admin_src: boolean };
type Outcome = { i: number; ok: boolean; state: string | null; msg: string | null; res: string | null; writes: Record<string, number> | null };

// Outsider calls that are ALLOWED to succeed with data/writes — each reviewed by hand (Q45, 2026-10-29). Keys are function names.
// Categories: public catalogue / published-only reads, self-scoped (acts only on the caller's own rows), token-gated, or a
// structured refusal returned as data rather than raised.
const REVIEWED: Record<string, string> = {
  // Self-scoped: act only on auth.uid()'s own profile / sessions / requests.
  admin_actor_name: "self: caller's own display name (audit label)", my_sessions: "self: caller's own sessions", session_is_live: "self: caller's own session",
  privacy_subject_export: "self: DSAR export keyed to the caller's own verified email", complete_customer_onboarding: "self: own profiles row",
  update_my_profile: "self: own profiles row", push_set_preference: "self: own notification preferences", request_account_deletion: "self: own deletion request",
  rotate_calendar_token: "self: own calendar feed token", submit_privacy_request: "self: privacy request for the caller", contact_support: "self: opens the caller's own support case",
  unfollow_subject: "self: caller's own follow rows (returns removed=false)",
  // Public catalogue / published-only reads (same data the signed-out site shows).
  ai_pack_margin_bps: "pure arithmetic on its arguments", event_type_rules: "public event-type catalogue", legal_terms_version: "public terms version",
  plan_catalog: "public price list", ticket_fee_config: "public fee schedule", marketplace_search: "public marketplace (published listings only)",
  public_workspace: "public organiser profile", listing_trust: "badge for published listings; draft listings raise not_found to non-members",
  listing_availability: "published listings only ('unknown' otherwise)", listing_window_availability: "published listings only",
  reliability_band: "public band label", trust_summary: "public badge explanation", queue_status: "public waiting-room state",
  public_event_extras: "published public events only (null otherwise); confirmed sponsor/exhibitor names + tier + booth, approved accessibility facts, days/venues/sub-events/passes names and times — no contacts, money, contracts (202610294060)",
  public_listing_availability: "opted-in published listings only (null otherwise); per-day free/limited/booked/closed for <= 120 days from today + published space ids/names — no names, prices, events, booking ids, times or hold reasons (202610294080, related-space rules 202610294082)",
  public_event_getting_there: "public published events (or the caller's own ticketed event) only; organiser notes marked public, public general/accessible/mixed parking (name, kind, accessible count, hours) and public shuttles (places, times) — no routes, permits, drivers, phones, vehicles, crew, bays, rooms or costs (202610294081)",
  event_is_public: "boolean only: is the event public + published / on_sale / live (policy helper, 202610294084); no row data",
  event_payment_readiness: "owner-approved public flag (Q07)", event_launch_state: "anon-allowlisted public launch state (Q20); state label only, no event fields",
  catering_price: "Q45-S04 (P3): prices any menu by id incl. drafts; numbers only, no names", venue_quote: "Q45-S04 (P3): prices any space by id incl. drafts; numbers only",
  // Structured refusals returned as data.
  partner_attribute_signup: "refusal as data (unknown_code)", respond_to_invite: "refusal as data (unavailable)", virtual_issue_join_token: "refusal as data",
  virtual_join: "refusal as data (not_your_ticket)", virtual_redeem_join_token: "refusal as data (invalid_token)", virtual_replay_access: "refusal as data (not_available)",
};

// Tables an outsider / anon may read rows of (RLS restricts them to the public subset). Reviewed Q45 2026-10-29.
const PUBLIC_TABLES: Record<string, [string, string?]> = {
  ad_placements: ["ad slot catalogue"],
  agent_runtime_controls: ["global kill-switch state"],
  agent_skills: ["skill catalogue"],
  agent_tools: ["tool catalogue"],
  bar_jurisdiction_rules: ["licensing reference"],
  boost_products: ["boost price list"],
  build_category_profiles: ["builder catalogue"],
  compliance_rule_packs: ["rule catalogue"],
  compliance_rules: ["rule catalogue"],
  credential_requirements: ["verification catalogue"],
  credential_types: ["verification catalogue"],
  credit_packs: ["price list"],
  event_type_aliases: ["event-type catalogue"],
  event_type_profiles: ["event-type catalogue"],
  food_allergens: ["reference"],
  food_dietary_tags: ["reference"],
  licence_types: ["reference"],
  map_asset_palettes: ["map palette catalogue"],
  map_rule_packs: ["map rules"],
  metric_definition_active: ["metric catalogue"],
  metric_definitions: ["metric catalogue"],
  moderation_reason_codes: ["reason codes"],
  notification_categories: ["catalogue"],
  plan_entitlements: ["plan matrix"],
  plan_prices: ["price list"],
  poster_presets: ["design presets"],
  ranking_models: ["ranking model version (no scores)"],
  ref_countries: ["reference"],
  ref_currencies: ["reference"],
  ref_timezones: ["reference"],
  reliability_formulas: ["published formula"],
  resale_policies: ["published resale policies"],
  role_permissions: ["role matrix"],
  sustainability_factors: ["reference"],
  taxonomies: ["reference"],
  taxonomy_spellings: ["reference"],
  taxonomy_terms: ["reference"],
  ticket_pass_components: ["pass composition of public tiers"],
  profiles: ["own profile only", "id is distinct from auth.uid()"],
  audit_events: ["own sign-in audit only", "actor_id is distinct from auth.uid()"],
  events: ["public events", "visibility::text <> 'public'"],
  listings: ["published listings", "not published"],
  spaces: ["spaces of published venues", "venue_id not in (select id from public.listings where published)"],
  ticket_tiers: ["tiers of public events", "event_id not in (select id from public.events where visibility::text = 'public')"],
  event_seats: ["seat maps of public events", "event_id not in (select id from public.events where visibility::text = 'public')"],
  programme_items: ["programme of public events", "event_id not in (select id from public.events where visibility::text = 'public')"],
  event_distribution: ["distribution of public events", "event_id not in (select id from public.events where visibility::text = 'public')"],
  merch_items: ["merch of public events", "event_id not in (select id from public.events where visibility::text = 'public')"],
  directory_featured: ["featured public events", "event_id not in (select id from public.events where visibility::text = 'public')"],
  event_series: ["public series", "visibility::text <> 'public'"],
  menus: ["menus of published listings", "listing_id not in (select id from public.listings where published)"],
  bar_packages: ["bar packages of published listings", "listing_id not in (select id from public.listings where published)"],
  packages: ["packages of published listings", "listing_id not in (select id from public.listings where published)"],
  menu_items: ["items of visible menus", "menu_id not in (select id from public.menus)"],
  menu_sections: ["sections of visible menus", "menu_id not in (select id from public.menus)"],
  menu_item_variants: ["variants of visible menus", "menu_id not in (select id from public.menus)"],
  media_galleries: ["public galleries", "visibility::text <> 'public'"],
  media_gallery_items: ["items of visible galleries", "gallery_id not in (select id from public.media_galleries)"],
  media_assets: ["public media (published listings / public events)"],
  media_usages: ["public uses", "not public_use"],
  venue_structures: ["published venue structures", "published_at is null"],
  design_templates: ["public template gallery", "visibility::text <> 'public'"],
  event_templates: ["published event templates"],
  promo_landing_pages: ["published promo pages"],
  reviews: ["published reviews"],
};

// admin_* functions reviewed as acceptable on an aal1 admin session (Q45, after migration 202610293034).
const AAL1_REVIEWED: Record<string, string> = { admin_actor_name: "self: the caller's own display name (no admin data)" };

// Table writes that are not tenant data: security / rate-limit / telemetry bookkeeping an unauthorised attempt may record.
const BOOKKEEPING = new Set(["rate_limits", "audit_events", "account_security_events", "api_requests", "security_events", "analytics_events", "recently_viewed"]);

const REFUSAL = /not[ _-]?authori[sz]ed|unauthori[sz]ed|forbidden|permission|denied|not[ _-]?(a[ _-])?member|not[ _-]?allowed|access|admin|owner|step[ _-]?up|mfa|aal2|session[ _-]?revoked|login|sign[ _-]?in|auth|privileg|42501|not[ _-]?permitted|no[ _-]?rights|scope|entitle|staff|role/i;
const NOT_FOUND = /not[ _-]?found|does not exist|unknown|no such|missing|invalid[ _-]?(id|event|workspace|listing|target)|no_rows|gone/i;

// Argument name → table, by explicit map first, then by name heuristics against the real table list.
const NAME_TABLE: Record<string, string> = {
  event: "events", target: "events", parent: "events", source: "events", primary: "events", depends_on: "events", workspace: "workspaces", ws: "workspaces",
  as_workspace: "workspaces", to_workspace: "workspaces", workspaces: "workspaces", item: "build_items", build_item: "build_items", items: "build_items",
  exclude_item: "build_items", listing: "listings", venue: "listings", space: "spaces", case: "support_cases", crew: "crew_members", to_crew: "crew_members",
  owner_crew: "crew_members", campaign: "promotion_campaigns", standby: "standby_commitments", grant: "break_glass_grants", run: "agent_runs", conv: "conversations",
  conversations: "conversations", boost: "promotion_boosts", zone: "access_zones", zones: "access_zones", equipment: "provider_equipment", dispute: "booking_disputes",
  series: "event_series", tier: "ticket_tiers", pass_tier: "ticket_tiers", tier_ids: "ticket_tiers", linked: "ticket_tiers", exclusive: "ticket_tiers",
  quote: "provider_quotes", pass: "access_passes", key: "api_keys", endpoint: "webhook_endpoints", recording: "virtual_recordings", candidate: "emergency_candidates",
  booth: "exhibitor_booths", menu: "menus", dependency: "event_dependencies", deliverable: "event_party_deliverables", licence: "event_licences", area: "parking_areas",
  page: "promo_landing_pages", gallery: "media_galleries", signal: "risk_signals", action: "enforcement_actions", attendance: "virtual_attendance", client: "clients",
  cancellation: "booking_cancellations", registration: "registrations", block: "availability_blocks", blackout: "promotion_blackouts", invite: "workspace_invites",
  invite_id: "workspace_invites", rider: "talent_riders", task: "tasks", subscription: "workspace_subscriptions", routine: "agent_routines", conflict: "booking_conflicts",
  signature: "contract_signatures", check: "verification_checks", group: "guest_groups", permit: "parking_permits", macro: "support_macros", statement: "partner_statements",
  transaction: "ledger_transactions", memory: "agent_memories", media: "media_assets", asset: "media_assets", watch: "agent_watches", transfer: "ticket_transfers",
  response: "form_responses", claim: "lost_claims", alt: "venue_alternatives", window: "logistics_windows", badge_template: "badge_templates", flag: "ticket_risk_flags",
  sales: "promoter_sales", email: "email_outbox", tickets: "tickets", ticket: "tickets", seat: "event_seats", job: "provider_jobs", request: "provider_requests",
  hold: "conditional_holds", document: "provider_documents", approval: "agent_approvals", session: "virtual_sessions", party: "event_parties", template: "event_templates",
  alert: "ops_alerts", link: "portal_links", plan: "safety_plans", snapshot: "kpi_snapshots", export: "design_exports", report: "lost_reports", package: "packages",
  comment: "design_comments", thread: "threads", message: "conversation_messages", payout: "promoter_payouts", payment: "payments", delivery: "webhook_deliveries",
  form: "event_forms", keep: "clients", merge: "clients", review: "reviews", guest: "guests", allocation: "ticket_allocations", shift: "shifts", incident: "incidents",
  partner: "partners", promoter: "promoters", invoice: "invoices", proposal: "proposals", contract: "contracts", design: "designs", family: "ledger_transactions",
  dependent_id: "events", prerequisite_id: "events", prerequisites: "events", entity: "events", subject: "events", subject_id: "events", context_id: "events",
  offer: "provider_quotes", log: "audit_events", a: "events", b: "events", to: "crew_members", from: "crew_members", role: "workspace_members",
};
// Function-name hints that override the generic table for ambiguous argument names.
const HINTS: [RegExp, string, string][] = [
  [/contract/, "template", "contract_templates"], [/contract/, "party", "contract_parties"], [/contract/, "approval", "contract_approvals"],
  [/design/, "template", "design_templates"], [/waiver/, "template", "waiver_templates"], [/badge/, "template", "badge_templates"],
  [/privacy|dsar/, "request", "privacy_requests"], [/emergency/, "request", "emergency_requests"], [/pass_request|party_pass/, "request", "event_party_pass_requests"],
  [/risk/, "hold", "risk_holds"], [/trust/, "hold", "trust_listing_holds"], [/portal/, "document", "portal_documents"], [/portal/, "approval", "portal_approvals"],
  [/portal/, "link", "portal_links"], [/campaign/, "link", "campaign_links"], [/guest_link/, "link", "event_guest_links"], [/weather/, "alert", "weather_alerts"],
  [/weather/, "watch", "weather_watches"], [/contingency/, "plan", "contingency_plans"], [/scan/, "snapshot", "scan_snapshots"], [/analytics/, "export", "analytics_exports"],
  [/review|template_report/, "report", "review_reports"], [/party|event_part/, "package", "event_party_packages"], [/resale/, "payout", "resale_payouts"],
  [/campaign/, "delivery", "campaign_deliveries"], [/registration/, "form", "registration_forms"], [/guest/, "keep", "guests"], [/guest/, "merge", "guests"],
  [/support/, "message", "support_messages"], [/^msg_|message_send|conversation/, "message", "conversation_messages"], [/promoter|promotion_asset/, "asset", "promoter_assets"],
  [/campaign/, "asset", "campaign_assets"], [/hospitality|catering/, "item", "build_items"], [/merch/, "item", "merch_items"], [/stock/, "item", "stock_items"],
  [/lost|found/, "item", "found_items"], [/menu/, "item", "menu_items"], [/invoice/, "item", "invoice_items"], [/support|trust_case/, "case", "support_cases"],
  [/trust/, "case", "trust_cases"], [/talent/, "profile", "talent_profiles"], [/virtual/, "session", "virtual_sessions"], [/series/, "template", "event_templates"],
  [/shift/, "to", "crew_members"], [/transfer|ticket/, "to", "profiles"], [/party|exhibitor|sponsor/, "party", "event_parties"],
];
// Valid enumerated inputs for functions that validate before authorising, so the sweep reaches their membership check
// ($table = a resolved row id of that table).
const FN_ARGS: Record<string, Record<string, string>> = {
  admin_add_note: { p_entity_type: "'event'" }, admin_add_record_note: { p_subject_type: "'event'" },
  create_payment_order: { p_kind: "'deposit'" }, send_context_message: { p_context: "'event'" },
  start_conversation: { p_kind: "'event'", p_to_type: "'workspace'", p_to: "'$workspaces'::uuid" },
  start_agent_run: { p_surface: "'provider'" }, shift_check: { p_action: "'in'" }, marketplace_recommendations: { p_mode: "'event'", p_id: "'$events'::uuid" },
  set_composition_binding: { p_kind: "'ticket_tier'", p_id: "'$ticket_tiers'::uuid" }, trust_submit_verification: { p_kind: "'identity'" },
  record_consent: { p_source: "'settings'", p_purpose: "'analytics'" }, contact_support: { p_category: "'other'", p_body: "'Q45 sweep body long enough to pass validation'" },
  loading_bay_save: { p: `jsonb_build_object('event_id', '$events', 'name', 'Q45')` }, duplicate_event: { p_confirm: "true" },
  risk_hold_appeal: { p_statement: "'Q45 sweep appeal statement that is long enough to pass the length check.'" },
  trust_appeal: { p_statement: "'Q45 sweep appeal statement that is long enough to pass the length check.'" },
  submit_privacy_request: { p_kind: "'access'" }, report_template: { p_reason: "'spam'" }, follow_subject: { p_kind: "'workspace'", p_key: "'$workspaces'" },
  // Lane A 202610291052: admin-only page of events (must be REFUSED for the outsider; never in REVIEWED). Realistic filters + cursor.
  admin_events_page: { p_filters: `jsonb_build_object('tab', 'all', 'id', '$events')`, p_sort: "'featured'", p_limit: "50", p_after: "null" },
};
const USER_ARGS =/^(user|member|assignee|owner|customer|actor|recipient|to_user|user_id|profile)$/;

function argValue(fn: Fn, name: string, type: string, ids: Map<string, string>, users: { owner: string }): string {
  const n = name.replace(/^p_/, "").replace(/^_/, "");
  const o = FN_ARGS[fn.name]?.[name];
  if (o !== undefined) return o.replace(/\$(\w+)/g, (_, t: string) => ids.get(t) ?? "00000000-0000-0000-0000-000000000000");
  const arr = type.endsWith("[]");
  const base = arr ? type.slice(0, -2) : type;
  if (base === "uuid") {
    let id: string | null = null;
    if (USER_ARGS.test(n)) id = users.owner;
    else if ((n === "workspace" || n === "ws") && /^(provider_|venue_)/.test(fn.name)) id = RIVERSIDE;   // provider-side commands target the venue tenant
    else {
      const hint = HINTS.find(([re, a]) => a === n && re.test(fn.name));
      const table = hint?.[2] ?? NAME_TABLE[n] ?? null;
      id = table ? ids.get(table) ?? null : null;
      if (n === "id") id = null;   // generic p_id on save functions = the create path into the target tenant
    }
    if (arr) return id ? `array['${id}']::uuid[]` : `'{}'::uuid[]`;
    return id ? `'${id}'::uuid` : `null::uuid`;
  }
  const txt: Record<string, string> = { role: "member", permission: "events.read", capability: "api.access", section: "flags", currency: "gbp", type: "wedding",
    kind: "venue", status: "approved", email: "q45-sweep@gala-dock.test", code: "Q45SWEEP", token: "q45".repeat(16), slug: "q45-sweep", party: "customer",
    decision: "approve", channel: "email", scope: "events:read", category: "venue", mode: "full", visibility: "private", locale: "en-GB", tz: "Europe/London" };
  switch (base) {
    case "text": { const v = txt[n] ?? "Q45 sweep"; return arr ? `array['${v}']::text[]` : `'${v}'::text`; }
    case "integer": case "bigint": case "smallint": return arr ? `'{1}'::${type}` : `1::${base}`;
    case "numeric": case "double precision": return `1::${base}`;
    case "boolean": return "false";
    case "jsonb": case "json": return /items|lines|list|rows|tiers|ids/.test(n) ? `'[]'::${base}` : `'{}'::${base}`;
    case "timestamp with time zone": return /end|until|to$/.test(n) ? `(now() + interval '31 days')` : `(now() + interval '30 days')`;
    case "timestamp without time zone": return `(now() + interval '30 days')::timestamp`;
    case "date": return /end|until|to$/.test(n) ? `(current_date + 31)` : `(current_date + 30)`;
    default: return `null::${type}`;
  }
}

function callSql(fn: Fn, ids: Map<string, string>, users: { owner: string }): string {
  const types = fn.argtypes ?? [];
  const inNames = fn.argmodes.length ? fn.argnames.filter((_, i) => ["i", "b", "v"].includes(fn.argmodes[i])) : fn.argnames;
  const inModes = fn.argmodes.length ? fn.argmodes.filter(m => ["i", "b", "v"].includes(m)) : types.map(() => "i");
  const args = types.map((t, i) => (inModes[i] === "v" ? "variadic " : "") + argValue(fn, inNames[i] ?? `$${i + 1}`, t, ids, users)).join(", ");
  const call = `public.${fn.name}(${args})`;
  // void: cast forces evaluation (an unreferenced STABLE call in a subquery can be optimised away)
  if (fn.returns === "void") return `select coalesce(nullif(${call}::text, ''), 'void')`;
  if (fn.retset || fn.returns === "record") return `select left(coalesce(jsonb_agg(to_jsonb(x))::text, '[]'), 3000) from (select * from ${call} limit 50) x`;
  return `select left(coalesce(to_jsonb(${call})::text, 'null'), 3000)`;
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
function batchSql(calls: string[], claims: Record<string, unknown>): string {
  const body = calls.map((c, i) => `
  select coalesce(jsonb_object_agg(relname, n_tup_ins + n_tup_upd + n_tup_del), '{}') into w0 from pg_stat_xact_user_tables;
  begin
    perform set_config('request.jwt.claims', ${q(JSON.stringify(claims))}, true);
    perform set_config('request.jwt.claim.sub', ${q(String(claims.sub))}, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;
    execute ${q(c)} into r;
    reset role;
    select coalesce(jsonb_object_agg(s.relname, s.n_tup_ins + s.n_tup_upd + s.n_tup_del - coalesce((w0 ->> s.relname)::bigint, 0)) filter (where s.n_tup_ins + s.n_tup_upd + s.n_tup_del > coalesce((w0 ->> s.relname)::bigint, 0)), '{}')
      into w1 from pg_stat_xact_user_tables s;
    insert into q45_out values (${i}, true, null, null, r, w1);
  exception when others then
    get stacked diagnostics st = returned_sqlstate, m = message_text;
    insert into q45_out values (${i}, false, st, left(m, 400), null, null);
  end;`).join("");
  return `begin;
set local statement_timeout = '240s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '300s';
create temp table q45_out(i int, ok boolean, state text, msg text, res text, writes jsonb) on commit drop;
do $q45sweep$
declare r text; w0 jsonb; w1 jsonb; st text; m text;
begin${body}
end $q45sweep$;
select i, ok, state, msg, res, writes from q45_out order by i;
rollback;`;
}

async function runAll(calls: string[], claims: Record<string, unknown>): Promise<Outcome[]> {
  const out: Outcome[] = new Array(calls.length);
  const run = async (from: number, to: number): Promise<void> => {
    try {
      const rows = await sql<Outcome>(batchSql(calls.slice(from, to), claims));
      for (const r of rows) out[from + r.i] = { ...r, i: from + r.i };
    } catch (e) {
      if (to - from === 1) { out[from] = { i: from, ok: false, state: "BATCH", msg: String(e).slice(0, 300), res: null, writes: null }; return; }
      const mid = Math.floor((from + to) / 2);   // an uncatchable error (timeout/cancel) aborts the batch: bisect to the culprit
      await run(from, mid); await run(mid, to);
    }
  };
  for (let i = 0; i < calls.length; i += 70) await run(i, Math.min(i + 70, calls.length));
  return out;
}

const trivial = (s: string | null): boolean => {
  if (s === null || s === "void") return true;
  let v: unknown; try { v = JSON.parse(s); } catch { return s.length === 0; }
  const leafEmpty = (x: unknown): boolean => x === null || x === false || x === 0 || x === "" ||
    (Array.isArray(x) ? x.every(leafEmpty) : typeof x === "object" ? Object.values(x as object).every(leafEmpty) : false);
  return leafEmpty(v);
};

function classify(o: Outcome, control: Outcome | undefined): string {
  if (!o) return "NOT_RUN";
  if (!o.ok) {
    if (o.state === "BATCH") return "TIMEOUT";
    if (o.state === "42501" || REFUSAL.test(o.msg ?? "")) return "REFUSED";
    if (NOT_FOUND.test(o.msg ?? "")) return control?.ok ? "REFUSED_UNIFORM_404" : "NOT_FOUND_BOTH";
    return control?.ok ? "REFUSED_OTHER" : "INPUT_REJECTED";
  }
  const writes = Object.keys(o.writes ?? {}).filter(t => !BOOKKEEPING.has(t));
  if (writes.length) return "WROTE";
  if (trivial(o.res)) return "EMPTY";
  if (REFUSAL.test(o.res ?? "") && /"(ok|allowed|authorized|authorised|can_[a-z_]+)"\s*:\s*false|reason|error/.test(o.res ?? "")) return "REFUSED_AS_DATA";
  return "DATA";
}

test.describe.configure({ mode: "serial" });

test.describe("Q45 SECURITY DEFINER authorisation sweep", () => {
  test.skip(!REF || !PAT, "needs SUPABASE_PROJECT_REF + SUPABASE_PAT_KEY");
  test.setTimeout(1_800_000);
  let fns: Fn[] = [];
  let outsiderClaims: Record<string, unknown> = {};
  let sweepIds = new Map<string, string>(); let sweepOwner = "";

  test.afterAll(async () => { await cleanup(); });

  test("catalogue: every definer function is classified and pinned", async () => {
    fns = await sql<Fn>(`select p.oid::int oid, p.proname name, pg_get_function_identity_arguments(p.oid) ident, coalesce(p.proargnames, '{}') argnames,
      (select array_agg(format_type(t, null) order by o) from unnest(p.proargtypes) with ordinality u(t, o)) argtypes, coalesce(p.proargmodes::text[], '{}') argmodes,
      format_type(p.prorettype, null) returns, p.proretset retset, has_function_privilege('anon', p.oid, 'execute') anon,
      has_function_privilege('authenticated', p.oid, 'execute') auth, has_function_privilege('service_role', p.oid, 'execute') svc, coalesce(array_to_string(p.proconfig, ','), '') config,
      (p.prosrc ~ 'has_admin_permission|platform_admins|is_platform_admin|admin_has_') admin_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef order by p.proname, p.oid`);
    const cls = { trigger: 0, service_only: 0, authenticated: 0, anon: 0 };
    for (const f of fns) cls[f.returns === "trigger" ? "trigger" : f.anon ? "anon" : f.auth ? "authenticated" : "service_only"]++;
    console.log("definer catalogue", { total: fns.length, ...cls });
    expect(fns.length).toBeGreaterThan(800);
    expect(fns.filter(f => !/search_path/.test(f.config)).map(f => f.name)).toEqual([]);
    expect(fns.filter(f => f.returns !== "trigger" && !f.svc && !f.auth && !f.anon).map(f => f.name)).toEqual([]);   // callable by nobody = dead code
  });

  test("an outsider (member of nothing) is refused by every authenticated definer function that touches another tenant", async () => {
    const targets = fns.filter(f => f.returns !== "trigger" && f.auth);
    // Resolve one real row per referenced table, preferring the demo tenants (private event first) so checks are reached with valid ids.
    const tables = new Set<string>(Object.values(NAME_TABLE).concat(HINTS.map(h => h[2])));
    const cols = await sql<{ t: string; ws: boolean; ev: boolean; vis: boolean; cr: boolean }>(`select c.relname t, bool_or(a.attname = 'workspace_id') ws, bool_or(a.attname = 'event_id') ev,
      bool_or(a.attname = 'visibility') vis, bool_or(a.attname = 'created_at') cr from pg_class c join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped where n.nspname = 'public' and c.relkind in ('r', 'p')
      group by c.relname having bool_or(a.attname = 'id' and format_type(a.atttypid, null) = 'uuid')`);
    const demo = `array[${DEMO_WS.map(w => `'${w}'::uuid`).join(",")}]`;
    const parts = cols.filter(c => tables.has(c.t)).map(c => {
      const order = [c.t === "build_items" ? `(x.listing_id in (select id from public.listings where workspace_id = any(${demo}))) desc nulls last` : "", c.t === "events" ? `(x.workspace_id = '${ALEX}') desc nulls last` : "", c.t === "listings" || c.t === "spaces" ? `(x.workspace_id = '${RIVERSIDE}') desc nulls last` : "",
        c.ws ? `(x.workspace_id = any(${demo})) desc nulls last` : "", c.ev ? `(x.event_id in (select id from public.events where workspace_id = '${ALEX}')) desc nulls last` : "",
        c.vis ? `(x.visibility::text <> 'public') desc nulls last` : "", c.cr ? "x.created_at desc nulls last" : ""].filter(Boolean).join(", ");
      return `select '${c.t}' t, (select x.id::text from public.${c.t} x${order ? ` order by ${order}` : ""} limit 1) id`;
    });
    const idRows = await sql<{ t: string; id: string | null }>(parts.join(" union all "));
    const ids = new Map(idRows.filter(r => r.id).map(r => [r.t, r.id as string]));
    ids.set("workspaces", ALEX);
    const [{ owner }] = await sql<{ owner: string }>(`select owner_id::text owner from public.workspaces where id = '${ALEX}'`);
    const [{ powner }] = await sql<{ powner: string }>(`select owner_id::text powner from public.workspaces where id = '${RIVERSIDE}'`);

    const outsider = await createUser("q45-outsider");
    const claimsOf = async (c: Awaited<ReturnType<typeof signedIn>>) => {
      const { data } = await c.auth.getSession();
      return JSON.parse(Buffer.from(data.session!.access_token.split(".")[1], "base64url").toString()) as Record<string, unknown>;
    };
    const outClaims = await claimsOf(await signedIn(outsider.email));
    expect(outClaims.sub).toBe(outsider.id);
    outsiderClaims = outClaims; sweepIds = ids; sweepOwner = owner;
    // Control principals: the target tenants' real owners (demo accounts). Their calls are rolled back too.
    const ctl: Record<string, unknown>[] = [];
    for (const [email, pw] of [["alex.events@example.com", process.env.DEMO_ORGANIZER_PASSWORD], ["provider.demo@example.com", process.env.DEMO_PROVIDER_PASSWORD]] as const) {
      if (!pw) continue;
      const c = anon();
      if (!(await c.auth.signInWithPassword({ email, password: pw })).error) ctl.push(await claimsOf(c as never));
    }
    expect(ctl.map(c => c.sub)).toContain(owner);

    const calls = targets.map(f => callSql(f, ids, { owner }));
    const outRes = await runAll(calls, outClaims);
    const ctlRes = await Promise.all(ctl.map(c => runAll(calls, c)));
    const register = targets.map((f, i) => {
      const control = ctlRes.map(r => r[i]).find(r => r?.ok) ?? ctlRes[0]?.[i];
      const verdict = classify(outRes[i], control);
      const tenantArgs = (f.argtypes ?? []).some(t => t.startsWith("uuid"));
      return { name: f.name, ident: f.ident, anon: f.anon, tenantArgs, verdict, outsider: { ok: outRes[i]?.ok, state: outRes[i]?.state, msg: outRes[i]?.msg,
        res: outRes[i]?.res?.slice(0, 300) ?? null, writes: outRes[i]?.writes }, control: control ? { ok: control.ok, state: control.state, msg: control.msg?.slice(0, 160) ?? null } : null, call: calls[i] };
    });
    const summary: Record<string, number> = {};
    for (const r of register) summary[r.verdict] = (summary[r.verdict] ?? 0) + 1;
    const flagged = register.filter(r => (r.verdict === "DATA" || r.verdict === "WROTE" || r.verdict === "TIMEOUT") && !REVIEWED[r.name]);
    mkdirSync(OUT.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
    writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), outsider: outsider.id, targets: { ALEX, RIVERSIDE, owner, powner }, resolvedTables: Object.fromEntries(ids),
      summary, reviewed: REVIEWED, flagged: flagged.map(f => f.name), register }, null, 1));
    console.log("authz sweep", { functions: targets.length, controls: ctl.length, summary, flagged: flagged.length });
    for (const f of flagged) console.log("FLAG", f.verdict, f.name, JSON.stringify(f.outsider).slice(0, 400));
    expect(register.filter(r => r.verdict === "NOT_RUN").map(r => r.name)).toEqual([]);
    expect(flagged.map(f => `${f.verdict}:${f.name}`)).toEqual([]);
    // Every reviewed exception must still exist (stale entries hide drift).
    expect(Object.keys(REVIEWED).filter(n => !targets.some(t => t.name === n))).toEqual([]);
  });
  test("RLS: every table refuses cross-tenant reads, updates and deletes for an outsider and for anon", async () => {
    expect(outsiderClaims.sub).toBeTruthy();
    const tabs = await sql<{ t: string; c: string | null; rls: boolean; total: number }>(`select c.relname t, c.relrowsecurity rls,
      (select a.attname from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attidentity = '' and a.attgenerated = '' order by a.attnum limit 1) c,
      0 total from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`);
    expect(tabs.filter(t => !t.rls).map(t => t.t)).toEqual([]);
    const probe = (role: "anon" | "authenticated", claims: Record<string, unknown> | null, list: typeof tabs) => `begin;
set local statement_timeout = '240s'; set local lock_timeout = '2s';
create temp table q45_rls(t text, total int, vis int, vis_err text, upd int, upd_err text, del int, del_err text) on commit drop;
do $q45rls$
declare n int; tot int; u int; d int; ve text; ue text; de text;
begin${list.map(x => `
  n := null; u := null; d := null; ve := null; ue := null; de := null;
  execute ${q(`select count(*) from (select 1 from public."${x.t}" limit 5000) z`)} into tot;
  begin
    ${claims ? `perform set_config('request.jwt.claims', ${q(JSON.stringify(claims))}, true); perform set_config('request.jwt.claim.sub', ${q(String(claims.sub))}, true);` : "perform set_config('request.jwt.claims', '{\"role\":\"anon\"}', true);"}
    set local role ${role};
    execute ${q(`select count(*) from (select 1 from public."${x.t}" limit 5000) z`)} into n;
    reset role;
  exception when others then ve := sqlstate || ' ' || left(sqlerrm, 120);
  end;${x.c ? `
  begin
    set local role ${role};
    execute ${q(`with w as (update public."${x.t}" set "${x.c}" = "${x.c}" returning 1) select count(*) from w`)} into u;
    raise exception 'q45_probe_rollback';
  exception when others then if sqlerrm <> 'q45_probe_rollback' then ue := sqlstate || ' ' || left(sqlerrm, 120); end if;
  end;
  begin
    set local role ${role};
    execute ${q(`with w as (delete from public."${x.t}" returning 1) select count(*) from w`)} into d;
    raise exception 'q45_probe_rollback';
  exception when others then if sqlerrm <> 'q45_probe_rollback' then de := sqlstate || ' ' || left(sqlerrm, 120); end if;
  end;` : ""}
  insert into q45_rls values (${q(x.t)}, tot, n, ve, u, ue, d, de);`).join("")}
end $q45rls$;
select * from q45_rls order by t;
rollback;`;
    type Row = { t: string; total: number; vis: number | null; vis_err: string | null; upd: number | null; upd_err: string | null; del: number | null; del_err: string | null };
    const run = async (role: "anon" | "authenticated", claims: Record<string, unknown> | null) => {
      const rows: Row[] = [];
      for (let i = 0; i < tabs.length; i += 60) rows.push(...await sql<Row>(probe(role, claims, tabs.slice(i, i + 60))));
      return rows;
    };
    const outsider = await run("authenticated", outsiderClaims), anonRows = await run("anon", null);
    const fmt = (r: Row) => `${r.t} ${r.vis}/${r.total}`;
    const report = { outsider: { readable: outsider.filter(r => (r.vis ?? 0) > 0).map(fmt), updatable: outsider.filter(r => (r.upd ?? 0) > 0).map(r => r.t), deletable: outsider.filter(r => (r.del ?? 0) > 0).map(r => r.t),
      selectRefused: outsider.filter(r => r.vis_err).length }, anon: { readable: anonRows.filter(r => (r.vis ?? 0) > 0).map(fmt), updatable: anonRows.filter(r => (r.upd ?? 0) > 0).map(r => r.t),
      deletable: anonRows.filter(r => (r.del ?? 0) > 0).map(r => r.t), selectRefused: anonRows.filter(r => r.vis_err).length }, tables: tabs.length };
    writeFileSync(OUT.replace(/.json$/, "-rls.json"), JSON.stringify({ generatedAt: new Date().toISOString(), report, outsider, anon: anonRows }, null, 1));
    console.log("rls probe", JSON.stringify(report, null, 1));
    // An outsider and anon may update/delete NOTHING they do not own (the outsider owns nothing).
    expect(report.outsider.updatable).toEqual([]);
    expect(report.outsider.deletable).toEqual([]);
    expect(report.anon.updatable).toEqual([]);
    expect(report.anon.deletable).toEqual([]);
    // Readable tables must be the reviewed public set (published catalogue, public events/listings, reference data).
    const unexpected = (rows: Row[]) => rows.filter(r => (r.vis ?? 0) > 0 && !PUBLIC_TABLES[r.t]).map(fmt);
    expect(unexpected(outsider)).toEqual([]);
    expect(unexpected(anonRows)).toEqual([]);
    // ...and only their public subset: rows matching each table's "should be hidden" predicate must be invisible.
    const leakProbe = (role: "anon" | "authenticated", claims: Record<string, unknown> | null, ok: Set<string>) => `begin;
set local statement_timeout = '120s';
${claims ? `select set_config('request.jwt.claims', ${q(JSON.stringify(claims))}, true), set_config('request.jwt.claim.sub', ${q(String(claims.sub))}, true);` : ""}
set local role ${role};
select ${Object.entries(PUBLIC_TABLES).filter(([t, v]) => v[1] && ok.has(t)).map(([t, v]) => `(select count(*) from public."${t}" where ${v[1]})::int "${t}"`).join(", ")};
rollback;`;
    const [lo] = await sql<Record<string, number>>(leakProbe("authenticated", outsiderClaims, new Set(outsider.filter(r => !r.vis_err).map(r => r.t))));
    const [la] = await sql<Record<string, number>>(leakProbe("anon", null, new Set(anonRows.filter(r => !r.vis_err).map(r => r.t))));
    console.log("public-subset leaks", { outsider: lo, anon: la });
    expect(Object.entries(lo).filter(([, n]) => n > 0)).toEqual([]);
    expect(Object.entries(la).filter(([, n]) => n > 0)).toEqual([]);
  });
  test("platform-admin RPCs refuse a password-only (aal1) admin session: MFA cannot be skipped by calling the API directly", async () => {
    const pw = process.env.DEMO_ADMIN_PASSWORD;
    test.skip(!pw, "needs DEMO_ADMIN_PASSWORD");
    const c = anon();
    expect((await c.auth.signInWithPassword({ email: "admin.demo@example.com", password: pw! })).error).toBeNull();
    const { data } = await c.auth.getSession();
    const claims = JSON.parse(Buffer.from(data.session!.access_token.split(".")[1], "base64url").toString()) as Record<string, unknown>;
    expect(claims.aal).toBe("aal1");
    const targets = fns.filter(f => f.returns !== "trigger" && f.auth && (f.name.startsWith("admin_") || f.admin_src));
    const calls = targets.map(f => callSql(f, sweepIds, { owner: sweepOwner }));
    const res = await runAll(calls, claims);
    const rows = targets.map((f, i) => ({ name: f.name, ok: res[i]?.ok, state: res[i]?.state, msg: res[i]?.msg?.slice(0, 120) ?? null, res: res[i]?.res?.slice(0, 160) ?? null,
      writes: res[i]?.writes, aalRefused: !res[i]?.ok && /step_up|mfa|aal2|second factor/i.test(res[i]?.msg ?? ""), adminNamed: f.name.startsWith("admin_") }));
    const summary = { functions: rows.length, aalRefused: rows.filter(r => r.aalRefused).length, otherError: rows.filter(r => !r.ok && !r.aalRefused).length,
      succeeded: rows.filter(r => r.ok).length, succeededWithData: rows.filter(r => r.ok && !trivial(r.res)).length, succeededWithWrites: rows.filter(r => r.ok && Object.keys(r.writes ?? {}).some(t => !BOOKKEEPING.has(t))).length };
    writeFileSync(OUT.replace(/.json$/, "-admin-aal1.json"), JSON.stringify({ generatedAt: new Date().toISOString(), summary, rows }, null, 1));
    console.log("admin aal1 sweep", summary);
    for (const r of rows.filter(r => r.ok && r.adminNamed)) console.log("AAL1-OK", r.name, (r.res ?? "").slice(0, 100), JSON.stringify(r.writes));
    expect(rows.filter(r => r.ok && r.adminNamed && !AAL1_REVIEWED[r.name] && (!trivial(r.res) || Object.keys(r.writes ?? {}).some(t => !BOOKKEEPING.has(t)))).map(r => r.name)).toEqual([]);
  });
});
