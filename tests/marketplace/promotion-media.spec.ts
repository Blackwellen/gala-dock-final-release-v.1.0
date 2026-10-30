import { test, expect } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn, insertEventFixture, updateEventFixture } from "../phase1/helpers";

// Q23 remainder (domains 136–139, 146–149; migrations 202610291039–1041). Exit gate: event publish updates every eligible
// discovery surface, and campaign attribution reconciles to ticket orders. API level, disposable identities, no browser.
const db = admin as unknown as SupabaseClient;
const at = (days: number) => new Date(Date.now() + days * 864e5).toISOString();
const one = async <T = { id: string }>(q: PromiseLike<{ data: unknown; error: unknown }>) => { const r = await q; if (r.error) throw r.error; return r.data as T; };
type Dir = { total: number; events: { id: string }[]; featured: { event_id: string; sponsored: boolean; label: string }[]; ordering: string };
const city = `q23city${randomUUID().slice(0, 6)}`;

test.describe.configure({ mode: "serial" });
test.describe("Q23 promotion, campaigns and media", () => {
  let org: { id: string; email: string }, mgr: { id: string; email: string }, mem: { id: string; email: string }, fan: { id: string; email: string }, out: { id: string; email: string };
  let orgC: SupabaseClient, mgrC: SupabaseClient, memC: SupabaseClient, fanC: SupabaseClient, outC: SupabaseClient;
  let W: string, X: string, ev: string, ev2: string, campaign: string;

  test.beforeAll(async () => {
    [org, mgr, mem, fan, out] = await Promise.all([createUser("q23-org"), createUser("q23-mgr"), createUser("q23-mem"), createUser("q23-fan"), createUser("q23-out")]);
    [W, X] = await Promise.all([seedWorkspace(org.id, "organizer", "Q23 Promo Org"), seedWorkspace(out.id, "organizer", "Q23 Other Org")]);
    await db.from("workspace_members").insert([{ workspace_id: W, user_id: mgr.id, role: "manager", status: "active" }, { workspace_id: W, user_id: mem.id, role: "member", status: "active" }]);
    ev = (await one(db.from("events").insert({ owner_id: org.id, workspace_id: W, name: "Q23 Launch Night", event_type: "nightlife", visibility: "private", status: "draft", city, starts_at: at(20), ends_at: at(20.2), timezone: "Europe/London" }).select("id").single())).id;
    ev2 = (await one(insertEventFixture({ owner_id: org.id, workspace_id: W, name: "Q23 Second Night", event_type: "nightlife", visibility: "public", status: "published", city, starts_at: at(25), ends_at: at(25.2), timezone: "Europe/London" }, "promotion-media").select("id").single())).id;
    [orgC, mgrC, memC, fanC, outC] = await Promise.all([org, mgr, mem, fan, out].map(u => signedIn(u.email))) as unknown as SupabaseClient[];
  });
  test.afterAll(async () => {
    await db.from("promotion_campaigns").delete().eq("workspace_id", W);
    await db.from("events").delete().in("id", [ev, ev2]);
    await db.from("workspaces").delete().in("id", [W, X]);
    await cleanup();
  });

  test("publish/unpublish propagates to every eligible surface in the same transaction; organic order is chronological", async () => {
    const a = anon() as unknown as SupabaseClient;
    expect(((await a.rpc("directory_events", { p_scope: "city", p_key: city })).data as Dir).events.map(e => e.id)).toEqual([ev2]);
    // A fan follows the organiser before the first event is listed → one in-app alert when it is listed.
    expect((await fanC.rpc("follow_subject", { p_kind: "organizer", p_key: W, p_alerts: true })).error).toBeNull();
    expect((await fanC.rpc("follow_subject", { p_kind: "event", p_key: ev })).error?.message).toMatch(/subject_not_followable/);   // private event
    await updateEventFixture(ev, { visibility: "public", status: "published" }, "promotion-media");
    const dist = (await db.from("event_distribution").select("status,surfaces,listed_count").eq("event_id", ev).single()).data as { status: string; surfaces: string[]; listed_count: number };
    expect(dist.status).toBe("listed");
    expect(dist.surfaces).toEqual(expect.arrayContaining(["directory", "city", "category", "calendar", "organizer", "search", "sitemap", "related"]));
    for (const [scope, key] of [["city", city], ["category", "nightlife"], ["organizer", W], ["all", null]] as const) {
      const d = (await a.rpc("directory_events", { p_scope: scope, p_key: key, p_limit: 100 })).data as Dir;
      const ids = d.events.map(e => e.id).filter(id => id === ev || id === ev2);
      expect(ids).toEqual([ev, ev2]);                                               // both listed, chronological, never re-ranked
      if (scope === "city" || scope === "organizer") expect(d.events.length).toBe(2);
      expect(d.ordering).toBe("chronological");
    }
    const rel = (await a.rpc("directory_related", { p_event: ev, p_limit: 4 })).data as { id: string; why: string[] }[];
    expect(rel[0]).toMatchObject({ id: ev2 }); expect(rel[0]!.why).toEqual(expect.arrayContaining(["same_city", "same_category", "same_organizer"]));
    await db.rpc("run_db_jobs", { p_limit: 50, p_kinds: ["promotion.follow_alerts"] });
    const alertsFor = async (id: string) => ((await fanC.from("notifications").select("id").eq("kind", "follow_alert").like("dedupe_key", `follow:${id}:%`)).data ?? []).length;
    expect(await alertsFor(ev)).toBe(1);
    // Unpublish → gone everywhere; republish does not alert again; cancel → withdrawn.
    await db.from("events").update({ visibility: "private" }).eq("id", ev);
    expect(((await a.rpc("directory_events", { p_scope: "city", p_key: city })).data as Dir).events.map(e => e.id)).toEqual([ev2]);
    expect((await a.rpc("event_share_card", { p_event: ev })).data).toBeNull();                          // private: no link preview
    await db.from("events").update({ visibility: "public" }).eq("id", ev);
    await db.rpc("run_db_jobs", { p_limit: 50, p_kinds: ["promotion.follow_alerts"] });
    expect(await alertsFor(ev)).toBe(1);
    const card = (await a.rpc("event_share_card", { p_event: ev })).data as { url: string; image: string | null; title: string };
    expect(card.url).toMatch(/^\/events\//); expect(JSON.stringify(card)).not.toMatch(/token|sig=|\?/);
    await db.from("events").update({ status: "cancelled" }).eq("id", ev2);
    expect((await db.from("event_distribution").select("status,reason").eq("event_id", ev2).single()).data).toMatchObject({ status: "withdrawn", reason: "cancelled" });
  });

  test("calendar windows are timezone-aware; featured rows are separate and labelled; only admins curate", async () => {
    const a = anon() as unknown as SupabaseClient;
    expect((await a.rpc("calendar_window", { p_range: "weekend", p_tz: "Europe/London", p_anchor: "2027-05-30" })).data).toMatchObject({ local_from: "2027-05-28T17:00:00", local_to: "2027-05-31T00:00:00" });
    expect((await a.rpc("calendar_window", { p_range: "today", p_tz: "Not/AZone" })).error?.message).toMatch(/invalid_timezone/);
    const cal = (await a.rpc("calendar_events", { p_range: "month", p_tz: "Europe/London", p_scope: "city", p_key: city, p_anchor: at(20).slice(0, 10) })).data as { days: { events: { id: string }[] }[] };
    expect(cal.days.flatMap(d => d.events.map(e => e.id))).toContain(ev);
    expect((await orgC.rpc("set_directory_featured", { p_surface: "city", p_key: city, p_event: ev, p_kind: "editorial", p_ends: at(3) })).error?.message).toMatch(/not_authorized/);
    // Sponsored featured rows need a paid boost (CHECK) — a direct write without one is refused even for the service role.
    expect((await db.from("directory_featured").insert({ surface: "city", surface_key: city, event_id: ev, kind: "sponsored", label: "Featured", ends_at: at(3) })).error).not.toBeNull();
  });

  test("follows are private to the follower; organisers see counts only", async () => {
    expect((await fanC.from("follows").select("subject_kind,subject_key")).data).toEqual([{ subject_kind: "organizer", subject_key: W }]);
    expect((await outC.from("follows").select("user_id").eq("subject_key", W)).data).toEqual([]);
    const s = (await orgC.rpc("promotion_follower_summary", { p_workspace: W })).data as Record<string, unknown>;
    expect(s.organizer).toBe(1); expect(JSON.stringify(s)).not.toContain(fan.id);
    expect((await outC.rpc("promotion_follower_summary", { p_workspace: W })).error?.message).toMatch(/not_authorized/);
    expect((await fanC.rpc("unfollow_subject", { p_kind: "organizer", p_key: W })).data).toMatchObject({ removed: true });
    await fanC.rpc("follow_subject", { p_kind: "organizer", p_key: W, p_alerts: true });
  });

  test("campaign setup is resumable, idempotent, permissioned and versioned; ads budgets need billing permission", async () => {
    expect((await memC.rpc("save_campaign_setup", { p_workspace: W, p_campaign: null, p_step: 1, p_patch: { name: "Nope" } })).error?.message).toMatch(/not_authorized/);
    const req = randomUUID();
    const c1 = (await mgrC.rpc("save_campaign_setup", { p_workspace: W, p_campaign: null, p_step: 1, p_patch: { name: "Q23 Launch", goal: "ticket_sales", event_id: ev }, p_request_id: req })).data as { id: string; version: number };
    const c2 = (await mgrC.rpc("save_campaign_setup", { p_workspace: W, p_campaign: null, p_step: 1, p_patch: { name: "Q23 Launch" }, p_request_id: req })).data as { id: string; replayed: boolean };
    expect(c2).toMatchObject({ id: c1.id, replayed: true }); campaign = c1.id;
    await mgrC.rpc("save_campaign_setup", { p_workspace: W, p_campaign: campaign, p_step: 2, p_patch: { starts_at: new Date(Date.now() - 36e5).toISOString(), ends_at: at(10) }, p_expected_version: 1 });
    expect((await mgrC.rpc("save_campaign_setup", { p_workspace: W, p_campaign: campaign, p_step: 2, p_patch: {}, p_expected_version: 1 })).data).toMatchObject({ ok: false, conflict: true });
    expect((await mgrC.rpc("save_campaign_setup", { p_workspace: W, p_campaign: campaign, p_step: 4, p_patch: { budget_minor: 5000, channels: [{ channel: "ads", budget_minor: 2000 }] } })).error?.message).toMatch(/billing_permission_required/);
    await orgC.rpc("save_campaign_setup", { p_workspace: W, p_campaign: campaign, p_step: 3, p_patch: { audience: { consented_contacts: true } } });
    const s4 = (await orgC.rpc("save_campaign_setup", { p_workspace: W, p_campaign: campaign, p_step: 4, p_patch: { budget_minor: 5000, channels: [{ channel: "email" }, { channel: "ads", budget_minor: 2000 }, { channel: "social" }] } })).data as { step: number; blockers: unknown[] };
    expect(s4.step).toBe(5); expect(s4.blockers).toEqual([]);
    expect((await outC.from("promotion_campaigns").select("id").eq("id", campaign)).data).toEqual([]);
    expect((await mgrC.rpc("campaign_transition", { p_campaign: campaign, p_to: "completed" })).error?.message).toMatch(/illegal/);
    expect((await mgrC.rpc("campaign_transition", { p_campaign: campaign, p_to: "scheduled", p_expected: "draft" })).data).toMatchObject({ ok: true });
    await db.rpc("campaign_tick");
    expect((await db.from("promotion_campaigns").select("status").eq("id", campaign).single()).data).toMatchObject({ status: "active" });
  });

  test("marketing honours consent, unsubscribe and suppression; dispatch is fixture-only and idempotent", async () => {
    const h = (s: string) => createHash("sha256").update(s).digest("hex");
    const emails = [`q23-a-${randomUUID().slice(0, 6)}@gala-dock.test`, `q23-b-${randomUUID().slice(0, 6)}@gala-dock.test`, `q23-c-${randomUUID().slice(0, 6)}@gala-dock.test`];
    for (const [i, e] of emails.entries()) expect((await db.rpc("audience_consent_record", { p_workspace: W, p_channel: "email", p_email: e, p_phone: null, p_user: null, p_token_hash: h(e + i), p_consent_version: "2026-10", p_source: "checkout" })).error).toBeNull();
    await db.from("email_suppressions").insert({ email: emails[1], reason: "hard_bounce" });
    expect((await db.rpc("audience_unsubscribe", { p_token_hash: h(emails[2]! + 2) })).data).toMatchObject({ status: "opted_out" });
    expect((await orgC.rpc("audience_consent_record", { p_workspace: W, p_channel: "email", p_email: "x@y.z", p_phone: null, p_user: null, p_token_hash: h("x"), p_consent_version: "1", p_source: "form" })).error).not.toBeNull();
    expect((await orgC.from("audience_consents").select("email")).data ?? []).toEqual([]);               // service-only: organisers see counts
    const m = (await mgrC.rpc("campaign_message_save", { p_campaign: campaign, p_message: null, p_channel: "email", p_subject: "On sale", p_body: "Tickets are on sale.", p_scheduled_at: at(1) })).data as { id: string };
    expect((await mgrC.rpc("campaign_message_save", { p_campaign: campaign, p_message: null, p_channel: "email", p_subject: "x", p_body: "<script>x</script>", p_scheduled_at: null })).error?.message).toMatch(/unsafe_content/);
    await db.from("campaign_messages").update({ scheduled_at: new Date(Date.now() - 6e4).toISOString() }).eq("id", m.id);
    await db.rpc("campaign_tick");
    const msg = (await db.from("campaign_messages").select("status,audience_counts").eq("id", m.id).single()).data as { status: string; audience_counts: Record<string, unknown> };
    expect(msg).toMatchObject({ status: "sent", audience_counts: { sent_fixture: 1, suppressed: 1, unsubscribed: 1, transport: "fixture" } });
    expect((await db.rpc("campaign_dispatch_message", { p_message: m.id })).data).toMatchObject({ replayed: true });
    const del = (await db.from("campaign_deliveries").select("status,transport,recipient_hash").eq("message_id", m.id)).data as { status: string; transport: string; recipient_hash: string }[];
    expect(del.length).toBe(3); expect(del.every(d => d.transport === "fixture")).toBe(true);
    expect(del.find(d => d.recipient_hash === h(emails[1]!))?.status).toBe("suppressed");
    expect((await db.from("email_outbox").select("id").in("to_email", emails)).data ?? []).toEqual([]);    // nothing handed to a provider
  });

  test("UTM links: no open redirect; campaign attribution reconciles to ticket orders and reverses on refund", async () => {
    expect((await mgrC.rpc("campaign_link_create", { p_campaign: campaign, p_channel: "social", p_destination: "https://evil.example" })).error?.message).toMatch(/invalid_destination/);
    const slug = ((await db.from("events").select("slug,id").eq("id", ev).single()).data as { slug: string | null; id: string });
    const link = (await mgrC.rpc("campaign_link_create", { p_campaign: campaign, p_channel: "social", p_destination: `/events/${slug.slug ?? slug.id}`, p_medium: "instagram" })).data as { code: string; path: string };
    expect(link.path).toBe(`/r/c/${link.code}`);
    expect((await (anon() as unknown as SupabaseClient).rpc("record_campaign_touch", { p_code: link.code, p_visitor_hash: "x".repeat(32), p_user: null })).error).not.toBeNull();  // service-only
    const buyer = await createUser("q23-buyer");
    const t = (await db.rpc("record_campaign_touch", { p_code: link.code, p_visitor_hash: "v".repeat(32), p_user: buyer.id })).data as { recorded: boolean; destination: string };
    expect(t.recorded).toBe(true); expect(t.destination).toMatch(/utm_campaign=/);
    const ref = `Q23C-${randomUUID().slice(0, 8)}`, other = `Q23C-${randomUUID().slice(0, 8)}`;
    await db.from("checkout_orders").insert([{ order_ref: ref, event_id: ev, buyer_id: buyer.id, token: randomUUID(), amount: 25, fee: 2, currency: "GBP", status: "pending" },
      { order_ref: other, event_id: ev, buyer_id: out.id, token: randomUUID(), amount: 10, fee: 1, currency: "GBP", status: "pending" }]);
    await db.from("checkout_orders").update({ status: "issued" }).in("order_ref", [ref, other]);
    const rep = (await orgC.rpc("campaign_report", { p_campaign: campaign })).data as { orders: number; attributed_revenue_minor: number; reconciled: { matches: boolean }; channels: { channel: string; orders: number }[] };
    expect(rep.orders).toBe(1); expect(Number(rep.attributed_revenue_minor)).toBe(2500); expect(rep.reconciled.matches).toBe(true);
    expect(rep.channels.find(c => c.channel === "social")?.orders).toBe(1);
    expect(JSON.stringify(rep)).not.toMatch(new RegExp(`${buyer.id}|${out.id}|gala-dock\\.test`));     // aggregates only
    expect((await outC.rpc("campaign_report", { p_campaign: campaign })).error?.message).toMatch(/not_authorized/);
    await db.from("checkout_orders").update({ status: "refunded", refund_status: "refunded" }).eq("order_ref", ref);
    const rep2 = (await orgC.rpc("campaign_report", { p_campaign: campaign })).data as { orders: number; reconciled: { matches: boolean } };
    expect(rep2.orders).toBe(0); expect(rep2.reconciled.matches).toBe(true);
    await db.from("checkout_orders").delete().in("order_ref", [ref, other]);
  });

  test("promotion calendar shows tentative vs confirmed items, blackouts and conflicts", async () => {
    await orgC.rpc("save_promotion_blackout", { p_workspace: W, p_starts: at(2), p_ends: at(2.5), p_reason: "Embargo", p_channel: "email" });
    const m = (await mgrC.rpc("campaign_message_save", { p_campaign: campaign, p_message: null, p_channel: "email", p_subject: "Reminder", p_body: "See you there", p_scheduled_at: at(2.2) })).data as { warnings: { key: string }[] };
    expect(m.warnings.map(w => w.key)).toContain("blackout");
    const cal = (await orgC.rpc("promotion_calendar", { p_workspace: W, p_from: new Date().toISOString(), p_to: at(30) })).data as { items: { kind: string; certainty: string }[]; conflicts: { type: string }[] };
    expect(cal.items.map(i => i.kind)).toEqual(expect.arrayContaining(["event", "campaign", "send", "blackout"]));
    expect(cal.items.find(i => i.kind === "send")?.certainty).toBe("tentative");
    expect(cal.conflicts.map(c => c.type)).toContain("send_in_blackout");
  });

  test("media library: public use needs alt text, licence, approval and a clean file; galleries and landing pages enforce it", async () => {
    const a = (await one(db.from("media_assets").insert({ event_id: ev, workspace_id: W, kind: "image", title: "External", url: "https://cdn.example.com/x.jpg", status: "draft" }).select("id").single())).id;
    const r = (await mgrC.rpc("media_asset_publish", { p_asset: a, p_meta: { public: true } })).data as { ok: boolean; problems: string[] };
    expect(r.ok).toBe(false); expect(r.problems).toEqual(expect.arrayContaining(["alt_text_required", "not_approved", "file_unverified"]));
    expect((await db.from("media_assets").update({ usage_scope: "public", alt_text: "x", status: "approved" }).eq("id", a)).error?.message).toMatch(/media_not_publishable/);
    expect((await memC.rpc("media_asset_publish", { p_asset: a, p_meta: { alt_text: "x" } })).error?.message).toMatch(/not_authorized/);
    const g = (await mgrC.rpc("save_media_gallery", { p_workspace: W, p_gallery: null, p_title: "Q23 gallery", p_event: ev, p_listing: null, p_items: [{ asset_id: a }] })).data as { id: string };
    expect((await mgrC.rpc("publish_media_gallery", { p_gallery: g.id, p_public: true })).data).toMatchObject({ ok: false, error: "items_not_publishable" });
    expect((await (anon() as unknown as SupabaseClient).from("media_galleries").select("id").eq("id", g.id)).data).toEqual([]);
    const lp = (await mgrC.rpc("save_landing_page", { p_workspace: W, p_page: null, p_page_data: { slug: `q23-${randomUUID().slice(0, 6)}`, title: "Q23 nights", event_ids: [ev], hero_asset_id: a } })).data as { id: string; slug: string };
    expect((await mgrC.rpc("publish_landing_page", { p_page: lp.id, p_publish: true })).data).toMatchObject({ ok: false });
    await mgrC.rpc("save_landing_page", { p_workspace: W, p_page: lp.id, p_page_data: { event_ids: [ev] } });
    await db.from("promo_landing_pages").update({ hero_asset_id: null }).eq("id", lp.id);
    expect((await mgrC.rpc("publish_landing_page", { p_page: lp.id, p_publish: true })).data).toMatchObject({ ok: true });
    const page = (await (anon() as unknown as SupabaseClient).rpc("landing_page", { p_slug: lp.slug })).data as { events: { id: string }[]; sponsored: unknown[] };
    expect(page.events.map(e => e.id)).toEqual([ev]); expect(page.sponsored).toEqual([]);
    expect((await mgrC.rpc("campaign_asset_add", { p_campaign: campaign, p_role: "hero", p_design: null, p_media: a })).data).toMatchObject({ ok: false, error: "media_not_publishable" });
  });

  test("posters, exports, brand kit rules and template scrubbing", async () => {
    expect((await mgrC.rpc("poster_data", { p_event: ev, p_kind: "qr" })).data).toMatchObject({ ok: true, qr_target: expect.stringMatching(/^\/events\/[^?]+$/) });
    expect((await mgrC.rpc("poster_data", { p_event: ev, p_kind: "sold_out" })).data).toMatchObject({ ok: false, error: "not_sold_out" });
    expect((await outC.rpc("poster_data", { p_event: ev, p_kind: "qr" })).error?.message).toMatch(/not_authorized/);
    const doc = { pages: [{ width: 1080, height: 1080, layers: [{ type: "text", text: "Call 07700 900123 or jo@example.com", font: "Comic Sans", color: "#ff00ff" }] }] };
    const d = (await orgC.rpc("create_design", { p_workspace: W, p_event: ev, p_title: "Q23 poster", p_document: doc })).data as string;
    const x = (await orgC.rpc("request_design_export", { p_design: d, p_format: "png", p_preset: "social_square" })).data as { id: string };
    expect((await orgC.rpc("design_export_download", { p_export: x.id })).data).toMatchObject({ ok: false });
    expect((await outC.rpc("design_export_download", { p_export: x.id })).error?.message).toMatch(/not_authorized/);
    await db.rpc("complete_design_export", { p_export: x.id, p_actor: org.id, p_path: `${org.id}/exports/${randomUUID()}.png`, p_size: 100 });
    expect((await orgC.rpc("design_export_download", { p_export: x.id })).data).toMatchObject({ ok: true, bucket: "workspace-files" });
    expect((await orgC.rpc("save_brand_kit", { p_workspace: W, p_kit: { colors: ["purple"] }, p_expected_version: null })).error?.message).toMatch(/invalid_colour/);
    expect((await memC.rpc("save_brand_kit", { p_workspace: W, p_kit: { colors: ["#6D28D9"] }, p_expected_version: null })).error?.message).toMatch(/not_authorized/);
    const k = (await orgC.rpc("save_brand_kit", { p_workspace: W, p_kit: { colors: ["#6D28D9"], fonts: ["Inter"], rules: { palette_only: true, kit_fonts_only: true } }, p_expected_version: null })).data as { version: number };
    expect((await orgC.rpc("save_brand_kit", { p_workspace: W, p_kit: { colors: ["#111111"] }, p_expected_version: k.version - 1 })).data).toMatchObject({ conflict: true });
    const check = (await orgC.rpc("brand_check_design", { p_design: d })).data as { ok: boolean; findings: { rule: string }[] };
    expect(check.ok).toBe(false); expect(check.findings.map(f => f.rule)).toEqual(expect.arrayContaining(["palette_only", "kit_fonts_only"]));
    const t = (await orgC.rpc("publish_template", { p_design: d, p_title: "Q23 tpl", p_description: "", p_category: "event", p_tags: [], p_visibility: "public" })).data as string;
    const tpl = JSON.stringify((await db.from("design_templates").select("document").eq("id", t).single()).data);
    expect(tpl).not.toMatch(/jo@example\.com|07700 900123/); expect(tpl).toContain("{{contact.email}}");
    const bad = (await orgC.rpc("create_design", { p_workspace: W, p_event: null, p_title: "Bad", p_document: { pages: [{ width: 10, height: 10, layers: [{ type: "text", text: "javascript:alert(1)" }] }] } })).data as string;
    expect((await orgC.rpc("publish_template", { p_design: bad, p_title: "Bad tpl", p_description: "", p_category: "event", p_tags: [], p_visibility: "public" })).error?.message).toMatch(/template_active_content/);
    await db.from("design_templates").delete().eq("id", t);
  });
});
