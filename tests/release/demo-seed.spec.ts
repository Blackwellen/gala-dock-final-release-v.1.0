// Q38 · Demo seeding is repeatable and idempotent (cards 235–237, 282). Runs scripts/seed-q38-demo.mjs twice (Stripe calls are
// test mode only and are skipped without a test key); the second run must change nothing, and the seeded demo must satisfy the
// W01/W02 gaps it fixes. The full purchase step is not run here (it is exercised by tests/payments/stripe-test-mode.spec.ts).
import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin } from "../phase1/helpers";

const db = admin as unknown as SupabaseClient;
const STEPS = "sellers,cards,neon,capacity,packages,similar,schedule,ended";
type StepOut = { changed?: number; error?: string; skipped?: string } & Record<string, unknown>;
const seed = () => {
  const out = execFileSync(process.execPath, ["scripts/seed-q38-demo.mjs", `--steps=${STEPS}`], { encoding: "utf8", env: process.env, timeout: 280_000 });
  const line = out.split(/\r?\n/).find(l => l.startsWith("Q38_SEED_SUMMARY "));
  expect(line, out).toBeTruthy();
  return JSON.parse(line!.slice("Q38_SEED_SUMMARY ".length)) as { run: string; summary: Record<string, StepOut> };
};

test.describe("Q38 demo seed", () => {
  test.describe.configure({ mode: "serial" });

  test("a second run changes nothing and both runs are recorded in sandbox_seed_runs", async () => {
    test.setTimeout(600_000);
    const first = seed();
    for (const [step, s] of Object.entries(first.summary)) expect(s.error, step).toBeUndefined();
    const second = seed();
    for (const [step, s] of Object.entries(second.summary)) { expect(s.error, step).toBeUndefined(); expect(s.changed ?? 0, `${step} changed on re-run`).toBe(0); }
    const { data: runs } = await db.from("sandbox_seed_runs").select("id,status,stripe_mode").in("id", [first.run, second.run]);
    expect(runs!.length).toBe(2);
    expect(runs!.every(r => ["completed", "partial"].includes(r.status as string) && ["test", "none"].includes(r.stripe_mode as string))).toBe(true);
  });

  test("seeded state closes the W01/W02 gaps", async () => {
    const { data: neon } = await db.from("events").select("id,starts_at,status,visibility").eq("slug", "neon-nights").single();
    expect(Date.parse(neon!.starts_at as string)).toBeGreaterThan(Date.now() + 13 * 864e5);
    expect(neon).toMatchObject({ status: "on_sale", visibility: "public" });
    const { data: onSale } = await db.from("ticket_tiers").select("name,sale_start").eq("event_id", neon!.id).eq("status", "on_sale");
    expect(onSale!.every(t => !t.sale_start || Date.parse(t.sale_start as string) <= Date.now())).toBe(true);   // on-sale tiers stay purchasable

    const { data: wedding } = await db.from("events").select("id,capacity,guest_count").eq("slug", "alex-taylor-wedding").single();
    const { data: tiers } = await db.from("ticket_tiers").select("quantity,sold").eq("event_id", wedding!.id);
    expect(tiers!.reduce((a, t) => a + Number(t.quantity), 0)).toBeLessThanOrEqual(150);
    expect(tiers!.every(t => Number(t.sold) <= Number(t.quantity))).toBe(true);

    const { data: dj } = await db.from("listings").select("id").eq("slug", "elite-sounds-dj").single();
    expect(((await db.from("packages").select("id").eq("listing_id", dj!.id).eq("status", "published")).data ?? []).length).toBeGreaterThanOrEqual(3);
    const { data: arena } = await db.from("listings").select("id,category").eq("slug", "riverside-arena").single();
    expect(((await db.from("listings").select("id").eq("kind", "venue").eq("published", true).eq("category", arena!.category).neq("id", arena!.id)).data ?? []).length).toBeGreaterThanOrEqual(1);

    const { data: users } = await db.rpc("is_demo_workspace", { p_workspace: "00000000-0000-0000-0000-000000000000" });
    expect(users).toBe(false);   // unknown workspace is never treated as demo
    const { data: customer } = await db.from("profiles").select("id,stripe_customer_id").eq("id",
      ((await db.from("events").select("owner_id").eq("slug", "alex-taylor-wedding").single()).data as { owner_id: string }).owner_id).single();
    const { count } = await db.from("tasks").select("id", { count: "exact", head: true }).in("event_id", [wedding!.id])
      .gte("due_at", new Date(Date.now() - 864e5).toISOString()).lte("due_at", new Date(Date.now() + 7 * 864e5).toISOString()).neq("status", "done");
    expect(count ?? 0).toBeGreaterThan(0);   // My Schedule has entries this week
    if (process.env.STRIPE_SECRET_KEY_SANDBOX?.startsWith("sk_test_")) expect(customer!.stripe_customer_id).toMatch(/^cus_/);
  });

  test("showcase sellers are demo tenants for reporting", async () => {
    const { data: ws } = await db.from("workspaces").select("id").eq("name", "Alex Events").limit(1).single();
    expect((await db.rpc("is_demo_workspace", { p_workspace: ws!.id })).data).toBe(true);
  });
});

// (Pass 3 adds a second GTC session, external_meeting_id gtc27-online-1, excluded from the pass-1 virtual counts.)
// Q38 depth seed, pass 1 (lane C, scripts/seed-depth-pass1.mjs): re-running changes nothing, the seeded domains are present
// with the expected counts, every published demo map validates without errors, and the ledger stays balanced.
const DEPTH_SQL = async (query: string) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, { method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_PAT_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  expect(r.ok, await r.clone().text()).toBe(true);
  return (await r.json()) as Record<string, unknown>[];
};

test.describe("Q38 depth seed (pass 1)", () => {
  test.describe.configure({ mode: "serial" });

  test("re-running the depth seed creates nothing", async () => {
    test.setTimeout(400_000);
    const out = execFileSync(process.execPath, ["scripts/seed-depth-pass1.mjs"], { encoding: "utf8", env: process.env, timeout: 380_000 });
    const line = out.split(/\r?\n/).find(l => l.startsWith("DEPTH_SEED_SUMMARY "));
    expect(line, out).toBeTruthy();
    const { summary } = JSON.parse(line!.slice("DEPTH_SEED_SUMMARY ".length)) as { summary: Record<string, Record<string, unknown>> };
    for (const [step, s] of Object.entries(summary)) {
      expect(s.error, step).toBeUndefined();
      for (const [k, v] of Object.entries(s)) if (typeof v === "number" && k !== "events_existing") expect(v, `${step}.${k} on re-run`).toBe(0);
    }
  });

  test("seeded domains are present with the expected depth", async () => {
    const [c] = await DEPTH_SQL(`select
      (select count(*) from events where slug in ('little-explorers-6th','future-of-live-events-webinar','hope-starts-here-charity-ball','warehouse-sessions-bassline','soho-late-lounge-fridays','halloween-rave-2025'))::int new_events,
      (select count(*) from events where slug in ('future-of-live-events-webinar','hope-starts-here-charity-ball','warehouse-sessions-bassline','soho-late-lounge-fridays') and status = 'on_sale')::int on_sale,
      (select count(distinct event_id) from event_licences where status = 'granted')::int licensed_events,
      (select count(*) from safety_plans s join events e on e.id = s.event_id where s.status = 'approved' and e.workspace_id = (select id from workspaces where name = 'Alex Events' limit 1))::int approved_plans,
      (select count(*) from contingency_plans where status = 'approved')::int contingency, (select count(*) from weather_watches where status = 'active')::int watches,
      (select count(*) from event_parties p join events e on e.id = p.event_id where e.slug in ('neon-nights','global-tech-conference'))::int parties,
      (select count(*) from exhibitor_booths b join events e on e.id = b.event_id where e.slug in ('neon-nights','global-tech-conference'))::int booths,
      (select count(*) from talent_riders r join events e on e.id = r.event_id where e.slug in ('neon-nights','global-tech-conference'))::int riders,
      (select count(*) from transport_movements t join events e on e.id = t.event_id where e.slug = 'neon-nights')::int transport,
      (select count(*) from parking_permits t join events e on e.id = t.event_id where e.slug = 'neon-nights')::int permits,
      (select count(*) from room_allocations t join events e on e.id = t.event_id where e.slug = 'neon-nights')::int rooms,
      (select count(*) from logistics_windows t join events e on e.id = t.event_id where e.slug = 'neon-nights')::int windows,
      (select count(*) from virtual_sessions s join events e on e.id = s.event_id where e.slug in ('future-of-live-events-webinar','global-tech-conference') and s.captions <> 'none' and s.external_meeting_id <> 'gtc27-online-1')::int captioned_sessions,
      (select count(*) from virtual_session_roles r join virtual_sessions s on s.id = r.session_id join events e on e.id = s.event_id where e.slug in ('future-of-live-events-webinar','global-tech-conference') and s.external_meeting_id <> 'gtc27-online-1')::int roles,
      (select count(*) from virtual_recordings where status = 'available' and access_until > now())::int recordings,
      (select count(*) from webhook_endpoints w where w.url = 'https://hooks.example.com/gala-dock/alex-events' and w.status = 'disabled')::int disabled_webhooks,
      (select count(*) from access_zones z join events e on e.id = z.event_id where e.slug = 'neon-nights')::int zones,
      (select count(*) from access_passes p join events e on e.id = p.event_id where e.slug = 'neon-nights')::int passes,
      (select count(*) from event_scanners s join events e on e.id = s.event_id where e.slug = 'neon-nights')::int scanners,
      (select count(*) from event_guest_links l join events e on e.id = l.event_id where e.slug in ('alex-taylor-wedding','little-explorers-6th') and l.revoked_at is null)::int guest_links,
      (select count(*) from guests g join events e on e.id = g.event_id where e.slug in ('alex-taylor-wedding','alex-jamie-wedding') and g.rsvp_token_hash is not null)::int rsvp_links,
      (select count(*) from registrations r join registration_forms f on f.id = r.form_id join events e on e.id = f.event_id where e.slug = 'future-of-live-events-webinar')::int registrations,
      (select count(*) from ticket_tiers t join events e on e.id = t.event_id where e.slug = 'sunset-sessions' and t.release_kind in ('presale','final'))::int releases,
      (select count(*) from discount_codes d join events e on e.id = d.event_id where e.slug = 'sunset-sessions' and d.code in ('SUNSETPRE','ACCESS-SUNSET','SUNSET10'))::int codes,
      (select count(*) from ticket_risk_flags f join events e on e.id = f.event_id where e.slug = 'sunset-sessions' and f.status = 'open')::int open_flags,
      (select count(*) from event_briefs b join events e on e.id = b.event_id where b.is_current and e.slug in ('neon-nights','global-tech-conference'))::int briefs,
      (select count(*) from event_dependencies d join events e on e.id = d.event_id where e.slug = 'global-tech-conference')::int dependencies,
      (select count(*) from event_templates where scope = 'platform' and status = 'active')::int platform_templates,
      (select count(*) from contracts c where c.title = 'Neon Nights 2026 — production services agreement' and c.status = 'sent' and c.share_token_hash is not null)::int unsigned_contracts,
      (select count(*) from workspaces w where w.name in ('Mia Rossi Photography','Northern Crew Agency'))::int new_provider_workspaces`);
    expect(c).toMatchObject({ new_events: 6, on_sale: 4, parties: 11, booths: 7, riders: 8, transport: 2, permits: 2, rooms: 2, windows: 3, captioned_sessions: 3, roles: 6,
      disabled_webhooks: 1, zones: 5, passes: 3, scanners: 2, guest_links: 2, rsvp_links: 36, registrations: 6, releases: 2, codes: 3, open_flags: 1, briefs: 2,
      dependencies: 4, unsigned_contracts: 1, new_provider_workspaces: 2 });
    for (const k of ["licensed_events", "approved_plans", "contingency", "watches", "recordings", "platform_templates"]) expect(Number(c[k]), k).toBeGreaterThan(0);
    expect(Number(c.approved_plans)).toBeGreaterThanOrEqual(14);
  });

  test("published demo maps validate without errors; the ledger is balanced", async () => {
    const maps = await DEPTH_SQL(`select e.slug, (public.event_map_validate_internal(e.id) ->> 'ok') ok, jsonb_array_length(public.event_map_validate_internal(e.id) -> 'errors') errors
      from events e join workspaces w on w.id = e.workspace_id where public.is_demo_workspace(w.id) and exists (select 1 from venue_maps m where m.event_id = e.id and m.status = 'published')`);
    expect(maps.length).toBeGreaterThanOrEqual(2);
    for (const m of maps) expect(m, String(m.slug)).toMatchObject({ ok: "true", errors: 0 });
    const [l] = await DEPTH_SQL(`select count(*)::int unbalanced from (select transaction_id from ledger_entries group by 1 having sum(amount_minor) <> 0) x`);
    expect(l.unbalanced).toBe(0);
  });
});

// Q38 depth seed, pass 2 (lane C, scripts/seed-depth-pass2.mjs): hospitality, trust evidence, provider operations, promotion,
// composition, risk/privacy and the Pro plan + API key. Re-running creates nothing; per-domain counts; ledger balanced.
const PASS2_COUNTS = `with ws as (select w.id, w.name from workspaces w join auth.users u on u.id = w.owner_id where u.email like '%@example.com'),
  ae as (select id from ws where name = 'Alex Events'),
  camp as (select id from promotion_campaigns where name = 'Neon Nights — final release push'),
  fest as (select id from events where slug = 'riverside-weekender-2027'),
  sig as (select id, case_id from risk_signals where dedupe_key like 'q38-demo-%')
  select
  (select plan from workspaces where id = (select id from ae)) plan,
  (select count(*) from api_keys where workspace_id = (select id from ae) and name = 'Demo partner feed (read-only)' and revoked_at is null and 'feed:read' = any(scopes))::int api_keys,
  (select count(*) from audit_events where workspace_id = (select id from ae) and event = 'admin.workspace_plan_changed' and metadata->>'reason' = 'demo: API access showcase')::int plan_audit,
  (select count(*) from menus m join ws on ws.id = m.workspace_id where m.status = 'published')::int menus,
  (select count(*) from menu_items i join menus m on m.id = i.menu_id join ws on ws.id = m.workspace_id where i.allergen_status = 'declared')::int declared_items,
  (select count(*) from menu_item_variants v join menus m on m.id = v.menu_id join ws on ws.id = m.workspace_id)::int variants,
  (select count(*) from bar_packages b join ws on ws.id = b.workspace_id where b.status = 'published')::int bar_packages,
  (select count(*) from catering_selections s join events e on e.id = s.event_id where e.slug in ('alex-30th-birthday','neon-nights'))::int catering,
  (select count(*) from catering_selections s join events e on e.id = s.event_id where e.slug = 'alex-30th-birthday' and s.final_guest_count = 76)::int final_numbers,
  (select count(*) from bar_selections s join events e on e.id = s.event_id where e.slug = 'alex-taylor-wedding')::int bars,
  (select count(*) from event_orders o join events e on e.id = o.event_id where e.slug = 'alex-30th-birthday' and o.status = 'approved')::int beo_approved,
  (select count(*) from hospitality_schedules s join events e on e.id = s.event_id where e.slug = 'neon-nights')::int schedules,
  (select count(*) from provider_documents d join ws on ws.id = d.workspace_id where d.status = 'verified')::int docs_verified,
  (select count(*) from provider_documents d join ws on ws.id = d.workspace_id where d.status = 'verified' and d.expires_on < current_date + 30)::int docs_expiring,
  (select count(*) from provider_documents d join ws on ws.id = d.workspace_id where d.status = 'verified' and d.credential_key = 'public_liability' and d.cover_amount_minor >= 100000000)::int pl_docs,
  (select count(*) from verification_checks c join ws on ws.id = c.workspace_id where c.kind = 'business' and c.status = 'verified')::int business_checks,
  (select count(*) from listings l join ws on ws.id = l.workspace_id where l.published and not l.verified)::int unverified_listings,
  (select count(distinct r.workspace_id) from reliability_snapshots r join ws on ws.id = r.workspace_id)::int reliability_ws,
  (select count(*) from enforcement_actions a where a.note like 'Demo:%' and a.appeal_case_id is not null)::int appealed_enforcements,
  (select count(*) from review_reports rr where rr.note like 'Demo:%')::int review_reports,
  (select count(*) from provider_capacity_rules x join ws on ws.id = x.workspace_id)::int capacity_rules,
  (select count(*) from provider_equipment x join ws on ws.id = x.workspace_id)::int equipment,
  (select count(*) from service_areas x join ws on ws.id = x.workspace_id)::int service_areas,
  (select count(*) from provider_jobs j where j.details->>'backfilled' = 'true')::int backfilled_jobs,
  (select count(*) from provider_jobs where reference = 'BK-FDBFDD' and space_id is not null)::int fdbfdd_space,
  (select count(*) from provider_job_evidence x join ws on ws.id = x.workspace_id)::int evidence,
  (select count(*) from order_groups g join events e on e.id = g.event_id where e.slug in ('neon-nights','alex-taylor-wedding'))::int order_groups,
  (select count(*) from promotion_campaigns where id in (select id from camp) and status = 'active')::int campaigns,
  (select count(*) from campaign_deliveries d join campaign_messages m on m.id = d.message_id where m.campaign_id in (select id from camp) and d.transport <> 'fixture')::int real_deliveries,
  (select count(*) from campaign_touches t where t.campaign_id in (select id from camp))::int touches,
  (select count(*) from campaign_channels ch where ch.campaign_id in (select id from camp))::int channels,
  (select count(*) from follows f join auth.users u on u.id = f.user_id where u.email like '%@example.com')::int follows,
  (select count(*) from promo_landing_pages where slug = 'alex-events-winter-nights' and status = 'published')::int landing,
  (select count(*) from media_galleries where title = 'Neon Nights 2026 — artwork' and visibility = 'public')::int galleries,
  (select count(*) from media_assets where workspace_id = (select id from ae) and usage_scope = 'public' and alt_text is not null and licence = 'owned')::int public_media,
  (select count(*) from brand_kits where workspace_id = (select id from ae) and rules ? 'palette_only')::int brand_kits,
  (select count(*) from directory_featured where kind = 'editorial' and status = 'active' and created_by = (select id from auth.users where email = 'admin.demo@example.com'))::int featured,
  (select count(*) from events e join event_series s on s.id = e.series_id where s.name = 'Soho Late Lounge Fridays')::int series_events,
  (select count(*) from events e join event_series s on s.id = e.series_id where s.name = 'Warehouse Sessions: Bassline UK Tour')::int tour_events,
  (select count(*) from events where parent_event_id = (select id from fest) and composition_role = 'stage')::int stages,
  (select count(*) from event_days where event_id = (select id from fest))::int days,
  (select count(*) from event_venues where event_id = (select id from fest))::int venues,
  (select count(*) from ticket_pass_components p join ticket_tiers t on t.id = p.pass_tier_id where t.event_id = (select id from fest) and t.pass_kind = 'multi_day')::int pass_components,
  (select count(*) from waiver_signatures s join events e on e.id = s.event_id where e.slug = 'taste-tango-fest' and s.is_minor and s.guardian_attested)::int minor_signatures,
  (select count(*) from stock_movements m join stock_items i on i.id = m.item_id where i.workspace_id = (select id from ae))::int stock_movements,
  (select count(*) from merch_items where workspace_id = (select id from ae) and status = 'on_sale')::int merch_items,
  (select count(*) from merch_orders where request_id like 'q38-depth-pass2-%' and paid_at is not null)::int paid_merch,
  (select count(*) from lost_claims c join lost_reports r on r.id = c.report_id join events e on e.id = r.event_id where e.slug = 'food-drink-expo-2026' and c.status = 'verified')::int lost_claims,
  (select count(distinct event_id) from sustainability_entries where event_id in (select id from events where slug in ('food-drink-expo-2026','halloween-rave-2025')))::int sustainability_events,
  (select count(*) from sig)::int signals,
  (select count(*) from sig where case_id is not null)::int escalated,
  (select count(*) from risk_holds h where h.signal_id in (select id from sig) and h.status = 'active')::int holds,
  (select count(*) from risk_holds h where h.kind = 'step_up' and h.subject_id = (select id from auth.users where email = 'alex.events@example.com') and h.status = 'active')::int owner_step_up,
  (select count(*) from legal_hold_subjects s join legal_holds h on h.id = s.hold_id where h.status = 'active' and s.subject_id = (select id from ws where name = 'Urban Events'))::int legal_holds,
  (select count(*) from retention_runs where preview)::int retention_previews,
  (select count(*) from consent_records c join auth.users u on u.id = c.user_id where u.email like '%@example.com')::int consents`;

test.describe("Q38 depth seed pass 2", () => {
  test.describe.configure({ mode: "serial" });

  test("re-running the pass 2 seed creates nothing", async () => {
    test.setTimeout(900_000);
    const out = execFileSync(process.execPath, ["scripts/seed-depth-pass2.mjs"], { encoding: "utf8", env: process.env, timeout: 880_000 });
    const line = out.split(/\r?\n/).find(l => l.startsWith("DEPTH_SEED_SUMMARY "));
    expect(line, out).toBeTruthy();
    const { run, summary } = JSON.parse(line!.slice("DEPTH_SEED_SUMMARY ".length)) as { run: string; summary: Record<string, Record<string, unknown>> };
    for (const [step, s] of Object.entries(summary)) {
      expect(s.error, step).toBeUndefined();
      expect(s.blocked, step).toBeUndefined();
      for (const [k, v] of Object.entries(s)) if (typeof v === "number") expect(v, `${step}.${k} on re-run`).toBe(0);
    }
    const [r] = await DEPTH_SQL(`select seed, status from sandbox_seed_runs where id = '${run}'`);
    expect(r).toMatchObject({ seed: "depth-pass2", status: "completed" });
  });

  test("seeded domains are present with the expected depth", async () => {
    const [c] = await DEPTH_SQL(PASS2_COUNTS);
    expect(c).toMatchObject({ plan: "pro", api_keys: 1, menus: 3, variants: 3, bar_packages: 3, catering: 2, final_numbers: 1, bars: 1, beo_approved: 1, schedules: 4, unverified_listings: 0,
      appealed_enforcements: 1, fdbfdd_space: 1, order_groups: 2, campaigns: 1, real_deliveries: 0, channels: 5, landing: 1, galleries: 1, stages: 3, days: 3, venues: 2, pass_components: 3,
      minor_signatures: 1, paid_merch: 0, lost_claims: 1, sustainability_events: 2, signals: 7, escalated: 1, holds: 2, owner_step_up: 0, legal_holds: 1 });
    const min: Record<string, number> = { plan_audit: 1, declared_items: 17, docs_verified: 14, docs_expiring: 1, pl_docs: 5, business_checks: 5, reliability_ws: 5, review_reports: 1,
      capacity_rules: 6, equipment: 10, service_areas: 8, backfilled_jobs: 10, evidence: 3, touches: 10, follows: 6, public_media: 3, brand_kits: 1, featured: 3,
      series_events: 7, tour_events: 4, stock_movements: 9, merch_items: 2, retention_previews: 1, consents: 6 };
    for (const [k, n] of Object.entries(min)) expect(Number(c[k]), k).toBeGreaterThanOrEqual(n);
  });

  test("the ledger stays balanced", async () => {
    const [l] = await DEPTH_SQL(`select count(*)::int unbalanced from (select transaction_id from ledger_entries group by 1 having sum(amount_minor) <> 0) x`);
    expect(l.unbalanced).toBe(0);
  });
});
