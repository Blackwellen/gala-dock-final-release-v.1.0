import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Lane D · S4 (W03 organiser UI): the exact payloads the Campaigns, Media library, Structure, Forms & waivers, Merch & stock,
// Lost property and Sustainability screens send, plus the two read helpers from migration 202610294038. API level, disposable
// identities, no browser, no Stripe payment, no email.
const db = admin as unknown as SupabaseClient;
const at = (days: number, h = 0) => new Date(Date.now() + days * 864e5 + h * 36e5).toISOString();
const one = async <T = { id: string }>(q: PromiseLike<{ data: unknown; error: unknown }>) => { const r = await q; if (r.error) throw r.error; return r.data as T; };

test.describe.configure({ mode: "serial" });
test.describe("S4 organiser screens over Q23/Q40 commands", () => {
  let org: { id: string; email: string }, mgr: { id: string; email: string }, out: { id: string; email: string };
  let orgC: SupabaseClient, mgrC: SupabaseClient, outC: SupabaseClient;
  let W: string, X: string, E: string;

  test.beforeAll(async () => {
    [org, mgr, out] = await Promise.all([createUser("s4-org"), createUser("s4-mgr"), createUser("s4-out")]);
    [W, X] = await Promise.all([seedWorkspace(org.id, "organizer", "S4 Organiser"), seedWorkspace(out.id, "organizer", "S4 Other")]);
    await db.from("workspace_members").insert({ workspace_id: W, user_id: mgr.id, role: "manager", status: "active" });
    E = (await one(db.from("events").insert({ owner_id: org.id, workspace_id: W, name: "S4 Festival", event_type: "festival", visibility: "private", status: "draft", city: "Leeds",
      starts_at: at(20), ends_at: at(22), timezone: "Europe/London" }).select("id").single())).id;
    await db.from("ticket_tiers").insert([{ event_id: E, name: "S4 Day 1", kind: "general", price: 20, quantity: 40 }, { event_id: E, name: "S4 Day 2", kind: "general", price: 20, quantity: 40 }, { event_id: E, name: "S4 Weekend", kind: "general", price: 35, quantity: 20 }]);
    [orgC, mgrC, outC] = await Promise.all([org, mgr, out].map(u => signedIn(u.email))) as unknown as SupabaseClient[];
  });
  test.afterAll(async () => {
    const all = ((await db.from("events").select("id").eq("workspace_id", W)).data ?? []).map(e => (e as { id: string }).id);
    await db.from("promotion_campaigns").delete().eq("workspace_id", W);
    await db.from("promotion_blackouts").delete().eq("workspace_id", W);
    await db.from("merch_items").delete().eq("workspace_id", W);
    await db.from("stock_items").delete().eq("workspace_id", W);
    await db.from("events").update({ parent_event_id: null, series_id: null }).in("id", all);
    await db.from("ticket_pass_components").delete().in("pass_tier_id", ((await db.from("ticket_tiers").select("id").in("event_id", all)).data ?? []).map(t => (t as { id: string }).id));
    await db.from("events").delete().in("id", all);
    await db.from("event_series").delete().eq("workspace_id", W);
    await db.from("waiver_templates").delete().eq("workspace_id", W);
    await db.from("workspaces").delete().in("id", [W, X]);
    await cleanup();
  });

  test("read helpers: media problems and campaign blockers are member-only", async () => {
    await db.from("media_assets").insert({ event_id: E, workspace_id: W, kind: "image", title: "S4 hero", url: "https://example.com/x.jpg", status: "draft" });
    const p = (await mgrC.rpc("media_assets_problems", { p_workspace: W, p_event: null })).data as { asset_id: string; problems: string[] }[];
    expect(p).toHaveLength(1);
    expect(p[0]!.problems).toEqual(expect.arrayContaining(["alt_text_required", "not_approved", "file_unverified"]));
    expect((await outC.rpc("media_assets_problems", { p_workspace: W, p_event: null })).error?.message).toMatch(/not_authorized/);
    expect((await mgrC.rpc("media_assets_problems", { p_workspace: W, p_event: randomUUID() })).error?.message).toMatch(/event_not_in_workspace/);
    // The editor's save: metadata saved, public use refused with reasons (external file).
    const r = (await mgrC.rpc("media_asset_publish", { p_asset: p[0]!.asset_id, p_meta: { alt_text: "Crowd at the main stage", licence: "owned", licence_holder: "", credit: "", subject: "event", status: "approved", public: true } })).data as { ok: boolean; problems: string[] };
    expect(r.ok).toBe(false); expect(r.problems).toEqual(["file_unverified"]);
  });

  test("campaign wizard: 5 steps, idempotent create, conflict, ads budget needs finance, blockers, links, blackout, report", async () => {
    const req = `s4${randomUUID().replace(/-/g, "")}`;
    const c1 = (await mgrC.rpc("save_campaign_setup", { p_workspace: W, p_campaign: null, p_step: 1, p_patch: { name: "S4 Launch", goal: "ticket_sales", goal_target: 50, event_id: E }, p_expected_version: null, p_request_id: req })).data as { id: string; version: number };
    const again = (await mgrC.rpc("save_campaign_setup", { p_workspace: W, p_campaign: null, p_step: 1, p_patch: { name: "S4 Launch", goal: "ticket_sales", goal_target: 50, event_id: E }, p_expected_version: null, p_request_id: req })).data as { id: string; replayed: boolean };
    expect(again).toMatchObject({ id: c1.id, replayed: true });
    const s2 = (await mgrC.rpc("save_campaign_setup", { p_workspace: W, p_campaign: c1.id, p_step: 2, p_patch: { starts_at: at(1), ends_at: at(15), timezone: "Europe/London" }, p_expected_version: c1.version })).data as { version: number };
    expect((await mgrC.rpc("save_campaign_setup", { p_workspace: W, p_campaign: c1.id, p_step: 2, p_patch: { timezone: "Europe/London" }, p_expected_version: c1.version })).data).toMatchObject({ ok: false, conflict: true });
    const s3 = (await mgrC.rpc("save_campaign_setup", { p_workspace: W, p_campaign: c1.id, p_step: 3, p_patch: { audience: { followers: true, consented_contacts: false, past_attendees: false, cities: ["Leeds"], categories: [] } }, p_expected_version: s2.version })).data as { version: number };
    expect((await mgrC.rpc("save_campaign_setup", { p_workspace: W, p_campaign: c1.id, p_step: 4, p_patch: { budget_minor: 50000, channels: [{ channel: "ads", budget_minor: 10000 }] }, p_expected_version: s3.version })).error?.message).toMatch(/billing_permission_required/);
    const s4 = (await mgrC.rpc("save_campaign_setup", { p_workspace: W, p_campaign: c1.id, p_step: 4, p_patch: { budget_minor: 50000, channels: [{ channel: "organic", budget_minor: 0 }, { channel: "social", budget_minor: 20000 }] }, p_expected_version: s3.version })).data as { version: number; blockers: { key: string }[] };
    expect(s4.blockers.map(b => b.key)).toEqual(["event_not_public"]);
    expect(((await mgrC.rpc("campaign_setup_blockers", { p_campaign: c1.id })).data as { key: string }[]).map(b => b.key)).toEqual(["event_not_public"]);
    expect((await outC.rpc("campaign_setup_blockers", { p_campaign: c1.id })).error?.message).toMatch(/not_authorized/);
    expect((await mgrC.rpc("campaign_transition", { p_campaign: c1.id, p_to: "scheduled", p_expected: "draft", p_reason: null })).data).toMatchObject({ ok: false, error: "preconditions" });
    // Owner holds finance.write: the ads budget is accepted.
    expect((await orgC.rpc("save_campaign_setup", { p_workspace: W, p_campaign: c1.id, p_step: 4, p_patch: { budget_minor: 50000, channels: [{ channel: "organic", budget_minor: 0 }, { channel: "ads", budget_minor: 10000 }] }, p_expected_version: s4.version })).error).toBeNull();
    const link = (await mgrC.rpc("campaign_link_create", { p_campaign: c1.id, p_channel: "social", p_destination: "/events/s4-festival", p_medium: null, p_source: "galadock" })).data as { code: string; path: string; destination: string };
    expect(link.path).toBe(`/r/c/${link.code}`); expect(link.destination).toMatch(/utm_medium=social&utm_campaign=s4-launch-/);
    expect((await mgrC.rpc("campaign_link_create", { p_campaign: c1.id, p_channel: "social", p_destination: "https://evil.example", p_medium: null, p_source: "galadock" })).error?.message).toMatch(/invalid_destination/);
    expect((await mgrC.rpc("save_promotion_blackout", { p_workspace: W, p_starts: at(3), p_ends: at(4), p_reason: "S4 bank holiday", p_channel: "email" })).error).toBeNull();
    const cal = (await mgrC.rpc("promotion_calendar", { p_workspace: W, p_from: at(-1), p_to: at(60) })).data as { items: { kind: string }[] };
    expect(cal.items.map(i => i.kind)).toEqual(expect.arrayContaining(["event", "campaign", "blackout"]));
    const rep = (await mgrC.rpc("campaign_report", { p_campaign: c1.id })).data as { budget_minor: number; channels: unknown[]; reconciled: { matches: boolean }; privacy: string };
    expect(rep).toMatchObject({ budget_minor: 50000, reconciled: { matches: true } }); expect(rep.channels).toHaveLength(2);
    expect((await mgrC.rpc("campaign_transition", { p_campaign: c1.id, p_to: "cancelled", p_expected: "draft", p_reason: "S4 test over" })).error).toBeNull();
    expect((await db.from("promotion_campaigns").select("status").eq("id", c1.id).single()).data).toMatchObject({ status: "cancelled" });
  });

  test("structure: series from this event, sub-event + readiness roll-up, days, venues, pass components; cascade owner/manager only", async () => {
    const s = (await mgrC.rpc("create_event_series", { p_workspace: W, p_series: { name: "S4 Tour", kind: "tour", visibility: "private", timezone: "Europe/London", anchor_event_id: E } })).data as { id: string };
    expect(s.id).toBeTruthy();
    const local = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 16);
    expect((await mgrC.rpc("add_tour_date", { p_series: s.id, p_starts_local: `${local}:00`, p_duration_minutes: 180, p_venue: { venue_name: "S4 Arena", city: "York" } })).error).toBeNull();
    const rep = (await mgrC.rpc("series_report", { p_series: s.id })).data as { totals: { occurrences: number } };
    expect(rep.totals.occurrences).toBe(2);
    const sub = (await mgrC.rpc("add_sub_event", { p_parent: E, p_sub: { name: "S4 Main stage", role: "stage", starts_at: at(20, 2), ends_at: at(20, 6) } })).data as { id: string };
    const rd = (await mgrC.rpc("event_composition_readiness", { p_event: E })).data as { children_count: number; rolled_up_score: number };
    expect(rd.children_count).toBe(1); expect(typeof rd.rolled_up_score).toBe("number");
    expect((await mgrC.rpc("add_sub_event", { p_parent: E, p_sub: { name: "S4 Late", role: "session", starts_at: at(40), ends_at: at(41) } })).error?.message).toMatch(/outside_parent_window/);
    const d0 = new Date(Date.parse(at(20))).toISOString().slice(0, 10), d1 = new Date(Date.parse(at(21))).toISOString().slice(0, 10);
    expect((await mgrC.rpc("set_event_days", { p_event: E, p_days: [{ date: d0, label: "Day 1", start_time: "10:00", end_time: "23:00", status: "scheduled" }, { date: d1, label: "Day 2", start_time: "10:00", end_time: "23:00", status: "scheduled" }] })).data).toMatchObject({ days: 2 });
    expect(((await mgrC.rpc("event_day_report", { p_event: E })).data as unknown[]).length).toBe(2);
    expect((await mgrC.rpc("set_event_venues", { p_event: E, p_venues: [{ venue_name: "S4 Park", role: "primary", capacity: 500 }, { venue_name: "S4 Tent", role: "satellite" }] })).data).toMatchObject({ venues: 2 });
    expect(((await mgrC.rpc("event_venue_schedule", { p_event: E })).data as { venues: unknown[] }).venues).toHaveLength(2);
    const tiers = (await db.from("ticket_tiers").select("id,name").eq("event_id", E)).data as { id: string; name: string }[];
    const t = (n: string) => tiers.find(x => x.name === n)!.id;
    expect((await mgrC.rpc("set_pass_components", { p_pass_tier: t("S4 Weekend"), p_kind: "multi_day", p_components: [{ tier_id: t("S4 Day 1"), units: 1 }] })).error?.message).toMatch(/pass_needs_two_components/);
    expect((await mgrC.rpc("set_pass_components", { p_pass_tier: t("S4 Weekend"), p_kind: "multi_day", p_components: [{ tier_id: t("S4 Day 1"), units: 1 }, { tier_id: t("S4 Day 2"), units: 1 }] })).data).toMatchObject({ components: 2 });
    expect(((await mgrC.rpc("event_pass_inventory", { p_pass_tier: t("S4 Weekend") })).data as { components: unknown[] }).components).toHaveLength(2);
    expect((await outC.rpc("cascade_event_transition", { p_event: E, p_to: "planning", p_child_action: "same", p_reason: null })).error?.message).toMatch(/not_authorized/);
    expect((await mgrC.rpc("detach_occurrence", { p_event: E })).error).toBeNull();
    await db.from("events").update({ parent_event_id: null }).eq("id", sub.id);
  });

  test("forms & waivers: typed fields publish, versions immutable; waiver publish + attach + counts", async () => {
    const fields = [{ key: "dietary", label: "Dietary needs", type: "select", required: true, options: ["None", "Vegan"] }, { key: "notes", label: "Notes", type: "textarea", required: false }];
    const f = (await mgrC.rpc("save_event_form", { p_event: E, p_family: null, p_form: { title: "S4 Guest needs", audience: "guest", kind: "form", fields }, p_publish: true })).data as { id: string; family_id: string; version: number; status: string };
    expect(f).toMatchObject({ version: 1, status: "published" });
    const v2 = (await mgrC.rpc("save_event_form", { p_event: E, p_family: f.family_id, p_form: { title: "S4 Guest needs", audience: "guest", kind: "form", fields: [...fields, { key: "access", label: "Access", type: "checkbox", required: false }] }, p_publish: false })).data as { version: number; status: string };
    expect(v2).toMatchObject({ version: 2, status: "draft" });
    expect((await db.from("event_forms").select("status").eq("id", f.id).single()).data).toMatchObject({ status: "published" });
    const w = (await mgrC.rpc("save_waiver_template", { p_workspace: W, p_family: null, p_waiver: { title: "S4 Activity waiver", body: "I accept the risks of the activities at this event.", minors_allowed: true, adult_age: 18 }, p_from_version: null })).data as { id: string };
    expect((await mgrC.rpc("set_event_waiver", { p_event: E, p_template: w.id, p_tier_ids: null, p_active: true })).error?.message).toMatch(/waiver_not_published/);
    expect((await mgrC.rpc("publish_waiver_template", { p_template: w.id })).error).toBeNull();
    expect((await mgrC.rpc("set_event_waiver", { p_event: E, p_template: w.id, p_tier_ids: null, p_active: true })).error).toBeNull();
    expect((await mgrC.rpc("waiver_status", { p_event: E })).data).toEqual([expect.objectContaining({ template_id: w.id, status: "active", signed_tickets: 0 })]);
  });

  test("stock & merch: append-only movements, transfer, report; merch refund/collect refusals; refund route refuses without a session", async () => {
    const a = (await mgrC.rpc("save_stock_item", { p_workspace: W, p_item: null, p_data: { name: "S4 Tee M", category: "merchandise", unit: "each", reorder_level: 2, event_id: E } })).data as { id: string };
    const b = (await mgrC.rpc("save_stock_item", { p_workspace: W, p_item: null, p_data: { name: "S4 Tee store", category: "merchandise", unit: "each", event_id: null } })).data as { id: string };
    const req = `s4${randomUUID().replace(/-/g, "")}`;
    expect((await mgrC.rpc("record_stock_movement", { p_item: a.id, p_kind: "receive", p_quantity: 10, p_event: E, p_reason: null, p_request_id: req, p_delta: null })).data).toMatchObject({ on_hand: 10 });
    expect((await mgrC.rpc("record_stock_movement", { p_item: a.id, p_kind: "receive", p_quantity: 10, p_event: E, p_reason: null, p_request_id: req, p_delta: null })).data).toMatchObject({ replayed: true, on_hand: 10 });
    expect((await mgrC.rpc("record_stock_movement", { p_item: a.id, p_kind: "issue", p_quantity: 50, p_event: E, p_reason: null, p_request_id: null, p_delta: null })).error?.message).toMatch(/insufficient_stock/);
    expect((await mgrC.rpc("record_stock_movement", { p_item: a.id, p_kind: "adjust", p_quantity: 2, p_event: E, p_reason: "S4 miscount", p_request_id: null, p_delta: -2 })).data).toMatchObject({ on_hand: 8 });
    expect((await mgrC.rpc("transfer_stock", { p_from: a.id, p_to: b.id, p_quantity: 3, p_reason: "S4 move" })).error).toBeNull();
    const rep = (await mgrC.rpc("stock_report", { p_workspace: W, p_event: E })).data as { item_id: string; on_hand: number }[];
    expect(rep.find(r => r.item_id === a.id)).toMatchObject({ on_hand: 5 });
    expect((await mgrC.from("stock_movements").delete().eq("item_id", a.id).select()).data ?? []).toHaveLength(0);
    const m = (await mgrC.rpc("save_merch_item", { p_workspace: W, p_item: null, p_data: { name: "S4 Tee", stock_item_id: a.id, price_minor: 2500, vat_rate_bps: 2000, per_order_limit: 4, status: "draft", event_id: E } })).data as { id: string };
    expect((await mgrC.rpc("save_merch_item", { p_workspace: W, p_item: m.id, p_data: { status: "on_sale" } })).error).toBeNull();
    // Refunds need refunds.approve (owner/finance): a manager is refused, as is a ref from another workspace.
    expect((await mgrC.rpc("merch_request_refund", { p_order_ref: "GD-M-S4NOTREAL0", p_lines: [{ merch_item_id: m.id, qty: 1 }], p_restock: true, p_reason: "customer_cancelled" })).error?.message).toMatch(/not_authorized/);
    expect((await mgrC.rpc("merch_collect", { p_order_ref: "GD-M-S4NOTREAL0", p_code: "ABCDEFGH" })).error?.message).toMatch(/not_authorized/);
    const res = await fetch(`${BASE}/api/merch/refund`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({ order_ref: "GD-M-S4NOTREAL0", lines: [{ merch_item_id: m.id, qty: 1 }] }) });
    expect(res.status).toBe(401);
  });

  test("lost property: lp-v1 explainable match, claim, verify, hand over; outsiders refused", async () => {
    const found = (await mgrC.rpc("log_found_item", { p_event: E, p_item: { category: "wallet", description: "Black leather wallet gold zip", colour: "black", brand: "Fossil", location: "Main bar", storage_location: "Box 1", found_at: new Date().toISOString() } })).data as { id: string };
    const lost = (await mgrC.rpc("report_lost_item", { p_event: E, p_report: { category: "wallet", description: "leather wallet with zip", colour: "black", contact_email: "s4-lost@example.com" } })).data as { id: string };
    const mt = (await mgrC.rpc("lost_property_matches", { p_report: lost.id, p_limit: 5 })).data as { model: string; matches: { item_id: string; score: number; features: { colour: number; shared_words: number } }[] };
    expect(mt.model).toBe("lp-v1"); expect(mt.matches[0]).toMatchObject({ item_id: found.id, features: { colour: 2 } });
    expect((await outC.rpc("lost_property_matches", { p_report: lost.id, p_limit: 5 })).error?.message).toMatch(/not_authorized/);
    const cl = (await mgrC.rpc("claim_found_item", { p_report: lost.id, p_item: found.id, p_evidence: { note: "S4 described the zip" } })).data as { id: string };
    expect((await mgrC.rpc("decide_lost_claim", { p_claim: cl.id, p_decision: "collected", p_note: null })).error?.message).toMatch(/claim_not_verified/);
    expect((await mgrC.rpc("decide_lost_claim", { p_claim: cl.id, p_decision: "verified", p_note: "Card name matched" })).error).toBeNull();
    expect((await mgrC.rpc("decide_lost_claim", { p_claim: cl.id, p_decision: "collected", p_note: null })).error).toBeNull();
    expect((await db.from("lost_reports").select("status").eq("id", lost.id).single()).data).toMatchObject({ status: "collected" });
  });

  test("sustainability: measured entries, travel estimate split, indicative report with provenance", async () => {
    expect((await mgrC.rpc("record_sustainability", { p_event: E, p_entries: [{ kind: "waste", factor_key: "waste_general", quantity: 100, unit: "kg", method: "measured" }] })).error).toBeNull();
    expect((await mgrC.rpc("record_sustainability", { p_event: E, p_entries: [{ kind: "waste", factor_key: "waste_recycled", quantity: 50, unit: "litre", method: "measured" }] })).error?.message).toMatch(/unit_mismatch/);
    expect((await mgrC.rpc("estimate_attendee_travel", { p_event: E, p_avg_km: 15, p_split: { car: 0.5, rail: 0.3 } })).error?.message).toMatch(/split_must_total_1/);
    expect((await mgrC.rpc("estimate_attendee_travel", { p_event: E, p_avg_km: 15, p_split: { car: 0.5, rail: 0.35, bus: 0.15 } })).error).toBeNull();
    const r = (await mgrC.rpc("event_sustainability_report", { p_event: E })).data as { kg_co2e_total: number; waste_kg: number; provenance: { factor: string; source: string }[] };
    expect(r.kg_co2e_total).toBeCloseTo(46.7, 1); expect(r.waste_kg).toBe(100);
    expect(r.provenance[0]!.source).toMatch(/Indicative/);
    expect((await outC.rpc("event_sustainability_report", { p_event: E })).error?.message).toMatch(/not_authorized/);
  });
});
