import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn, updateEventFixture } from "../phase1/helpers";

// Q40 Advanced Event Composition (domains 247–256; migrations 202610291042–1046). Exit gate: modules compose over the canonical
// Event, ticket, finance and operations primitives. API level, disposable identities, no browser.
const db = admin as unknown as SupabaseClient;
const at = (days: number, h = 0) => new Date(Date.now() + days * 864e5 + h * 36e5).toISOString();
const date = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const one = async <T = { id: string }>(q: PromiseLike<{ data: unknown; error: unknown }>) => { const r = await q; if (r.error) throw r.error; return r.data as T; };

test.describe.configure({ mode: "serial" });
test.describe("Q40 advanced event composition", () => {
  let org: { id: string; email: string }, mem: { id: string; email: string }, out: { id: string; email: string }, fan: { id: string; email: string };
  let orgC: SupabaseClient, memC: SupabaseClient, outC: SupabaseClient, fanC: SupabaseClient;
  let W: string, X: string, anchor: string, series: string, slug: string, parent: string;
  const events: string[] = [];

  test.beforeAll(async () => {
    [org, mem, out, fan] = await Promise.all([createUser("q40-org"), createUser("q40-mem"), createUser("q40-out"), createUser("q40-fan")]);
    [W, X] = await Promise.all([seedWorkspace(org.id, "organizer", "Q40 Composer"), seedWorkspace(out.id, "organizer", "Q40 Other")]);
    await db.from("workspace_members").insert({ workspace_id: W, user_id: mem.id, role: "member", status: "active" });
    anchor = (await one(db.from("events").insert({ owner_id: org.id, workspace_id: W, name: "Q40 Club Night", event_type: "nightlife", visibility: "private", status: "draft", city: "London",
      starts_at: at(5), ends_at: at(5, 4), timezone: "Europe/London" }).select("id").single())).id;
    events.push(anchor);
    await db.from("ticket_tiers").insert({ event_id: anchor, name: "Q40 GA", kind: "general", price: 15, quantity: 50 });
    [orgC, memC, outC, fanC] = await Promise.all([org, mem, out, fan].map(u => signedIn(u.email))) as unknown as SupabaseClient[];
  });
  test.afterAll(async () => {
    const all = ((await db.from("events").select("id").eq("workspace_id", W)).data ?? []).map(e => (e as { id: string }).id);
    await db.from("merch_items").delete().eq("workspace_id", W);
    await db.from("events").update({ parent_event_id: null }).in("id", all);
    await db.from("tickets").delete().in("event_id", all);
    await db.from("events").delete().in("id", all);
    await db.from("event_series").delete().eq("workspace_id", W);
    await db.from("waiver_templates").delete().eq("workspace_id", W);
    await db.from("workspaces").delete().in("id", [W, X]);
    await cleanup();
  });

  test("series: occurrences come from the Q14 engine, idempotently; this / following / all keep local overrides", async () => {
    const dow = ((new Date(date(14)).getUTCDay() + 6) % 7) + 1;
    const rule = { freq: "weekly", interval: 1, byweekday: [dow], start_date: date(14), start_time: "19:00", duration_minutes: 180, count: 3 };
    expect((await outC.rpc("create_event_series", { p_workspace: W, p_series: { name: "Nope", recurrence: rule } })).error?.message).toMatch(/not_authorized/);
    const s = (await orgC.rpc("create_event_series", { p_workspace: W, p_series: { name: `Q40 Fridays ${randomUUID().slice(0, 4)}`, kind: "recurring", visibility: "public", anchor_event_id: anchor, recurrence: rule } })).data as { id: string; slug: string };
    series = s.id; slug = s.slug;
    expect((await orgC.rpc("generate_series_occurrences", { p_series: series, p_limit: 52 })).data).toMatchObject({ created: 3 });
    expect((await orgC.rpc("generate_series_occurrences", { p_series: series, p_limit: 52 })).data).toMatchObject({ created: 0, existing: 3 });
    const occ = (await db.from("events").select("id,series_index,starts_at,status,name").eq("series_id", series).order("starts_at")).data as { id: string; series_index: number; status: string; name: string }[];
    expect(occ.length).toBe(4); events.push(...occ.map(o => o.id));
    const [, o1, o2, o3] = occ;
    const tiers = (await db.from("ticket_tiers").select("sold,held,status").eq("event_id", o1!.id)).data as { sold: number; held: number; status: string }[];
    expect(tiers.length).toBe(1); expect(tiers[0]).toMatchObject({ sold: 0, held: 0 });
    await orgC.rpc("series_edit", { p_event: o2!.id, p_patch: { name: "Q40 Halloween special" }, p_scope: "this" });
    const r = (await memC.rpc("series_edit", { p_event: o1!.id, p_patch: { name: "Q40 Friday Club", start_time: "20:00" }, p_scope: "following" })).data as { changed: number; skipped: { field: string }[] };
    expect(r.changed).toBe(3); expect(r.skipped.map(x => x.field)).toEqual(["name"]);
    const after = (await db.from("events").select("id,name,starts_at").in("id", [o1!.id, o2!.id, o3!.id])).data as { id: string; name: string; starts_at: string }[];
    expect(after.find(e => e.id === o2!.id)!.name).toBe("Q40 Halloween special");
    expect(after.find(e => e.id === o3!.id)!.name).toBe("Q40 Friday Club");
    expect(new Date(after.find(e => e.id === o3!.id)!.starts_at).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })).toBe("20:00");
    expect((await orgC.rpc("series_edit", { p_event: o3!.id, p_patch: { capacity: 10 }, p_scope: "all", p_expected_series_version: 1 })).data).toMatchObject({ conflict: true });
    expect((await outC.rpc("series_edit", { p_event: o3!.id, p_patch: { name: "x" }, p_scope: "this" })).error?.message).toMatch(/not_authorized/);
    // Public series page + directory scope list only listed occurrences.
    await updateEventFixture(o1!.id, { visibility: "public", status: "published" }, "q40-event-composition");
    const page = (await (anon() as unknown as SupabaseClient).rpc("series_page", { p_slug: slug })).data as { occurrences: { id: string }[] };
    expect(page.occurrences.map(o => o.id)).toEqual([o1!.id]);
    expect(((await (anon() as unknown as SupabaseClient).rpc("directory_events", { p_scope: "series", p_key: slug })).data as { total: number }).total).toBe(1);
    expect((await fanC.rpc("follow_subject", { p_kind: "series", p_key: series })).error).toBeNull();
    const rep = (await orgC.rpc("series_report", { p_series: series })).data as { totals: { occurrences: number } };
    expect(rep.totals.occurrences).toBe(4);
    expect((await outC.rpc("series_report", { p_series: series })).error?.message).toMatch(/not_authorized/);
  });

  test("a season pass and single-date tickets never oversell any date, under concurrency", async () => {
    const occ = (await db.from("events").select("id").eq("series_id", series).order("starts_at")).data as { id: string }[];
    const [d1, d2] = [occ[1]!.id, occ[2]!.id];
    await updateEventFixture([anchor, d1, d2], { visibility: "public", status: "on_sale" }, "q40-event-composition");
    const t1 = (await one(db.from("ticket_tiers").insert({ event_id: d1, name: "Q40 D1", kind: "general", price: 10, quantity: 3, status: "on_sale" }).select("id").single())).id;
    const t2 = (await one(db.from("ticket_tiers").insert({ event_id: d2, name: "Q40 D2", kind: "general", price: 10, quantity: 3, status: "on_sale" }).select("id").single())).id;
    const pass = (await one(db.from("ticket_tiers").insert({ event_id: anchor, name: "Q40 Season", kind: "general", price: 18, quantity: 10, status: "on_sale" }).select("id").single())).id;
    expect((await memC.rpc("set_pass_components", { p_pass_tier: pass, p_kind: "season", p_components: [{ tier_id: t1 }, { tier_id: t2 }] })).error?.message).toMatch(/not_authorized/);
    expect((await orgC.rpc("set_pass_components", { p_pass_tier: pass, p_kind: "season", p_components: [{ tier_id: t1 }, { tier_id: t2 }] })).error).toBeNull();
    const tok = () => `q40-${randomUUID()}`;
    const calls = [
      ...Array.from({ length: 4 }, () => anon().rpc("hold_tickets", { p_event: anchor, p_items: [{ tier: pass, qty: 1 }], p_token: tok() })),
      ...Array.from({ length: 4 }, () => anon().rpc("hold_tickets", { p_event: d1, p_items: [{ tier: t1, qty: 1 }], p_token: tok() })),
      ...Array.from({ length: 4 }, () => anon().rpc("hold_tickets", { p_event: d2, p_items: [{ tier: t2, qty: 1 }], p_token: tok() })),
    ];
    const res = await Promise.all(calls);
    const rows = (await db.from("ticket_tiers").select("id,quantity,sold,held,pass_committed").in("id", [t1, t2, pass])).data as { id: string; quantity: number; sold: number; held: number; pass_committed: number }[];
    for (const r of rows.filter(r => r.id !== pass)) expect(r.sold + r.held + r.pass_committed).toBeLessThanOrEqual(r.quantity);
    const passRow = rows.find(r => r.id === pass)!;
    expect(rows.filter(r => r.id !== pass).every(r => r.pass_committed === passRow.held)).toBe(true);
    expect(res.filter(r => !r.error).length).toBeLessThanOrEqual(10);
    expect(res.filter(r => r.error).every(r => /sold_out/.test(r.error!.message))).toBe(true);
    // Entitlements follow the pass ticket; refund revokes them.
    const tk = (await one(db.from("tickets").insert({ code: `Q40-${randomUUID().slice(0, 8)}`, event_id: anchor, tier_id: pass, holder_id: fan.id, attendee_name: "Fan", status: "valid", order_ref: "Q40" }).select("id").single())).id;
    expect((await db.rpc("pass_entitlement_check", { p_ticket: tk, p_event: d1 })).data).toMatchObject({ ok: true, reason: "pass" });
    expect(((await fanC.from("pass_entitlements").select("component_event_id")).data ?? []).length).toBe(2);
    expect((await (anon() as unknown as SupabaseClient).rpc("pass_entitlement_check", { p_ticket: tk, p_event: d1 })).error).not.toBeNull();   // service-only
    await db.from("tickets").update({ status: "refunded" }).eq("id", tk);
    expect((await db.rpc("pass_entitlement_check", { p_ticket: tk, p_event: d1 })).data).toMatchObject({ ok: false, reason: "ticket_refunded" });
  });

  test("parent/child: integrity, readiness roll-up, lifecycle blockers and an explicit cascade", async () => {
    parent = (await one(db.from("events").insert({ owner_id: org.id, workspace_id: W, name: "Q40 Festival", event_type: "festival", visibility: "private", status: "draft", city: "London",
      starts_at: at(30), ends_at: at(32), timezone: "Europe/London" }).select("id").single())).id;
    const stage = ((await memC.rpc("add_sub_event", { p_parent: parent, p_sub: { name: "Main stage", role: "stage" } })).data as { id: string }).id;
    expect((await memC.rpc("add_sub_event", { p_parent: parent, p_sub: { name: "Late", role: "stage", starts_at: at(40), ends_at: at(41) } })).error?.message).toMatch(/outside_parent_window/);
    expect((await db.from("events").update({ parent_event_id: stage }).eq("id", parent)).error?.message).toMatch(/composition_cycle/);
    expect((await outC.rpc("add_sub_event", { p_parent: parent, p_sub: { name: "x", role: "stage" } })).error?.message).toMatch(/not_authorized/);
    const roll = (await orgC.rpc("event_composition_readiness", { p_event: parent })).data as { children_count: number; rolled_up_score: number };
    expect(roll.children_count).toBe(1); expect(typeof roll.rolled_up_score).toBe("number");
    const pub = (await db.rpc("event_composition_blockers", { p_event: stage, p_to: "published" })).data as { key: string }[];
    expect(pub.map(b => b.key)).toContain("parent_not_published");
    const can = (await db.rpc("event_composition_blockers", { p_event: parent, p_to: "cancelled" })).data as { key: string; count: number }[];
    expect(can.find(b => b.key === "children_unhandled")?.count).toBe(1);
    expect((await memC.rpc("cascade_event_transition", { p_event: parent, p_to: "cancelled", p_child_action: "same" })).error?.message).toMatch(/not_authorized/);
    const c = (await orgC.rpc("cascade_event_transition", { p_event: parent, p_to: "cancelled", p_child_action: "same", p_reason: "test" })).data as { ok: boolean; children: { action: string }[] };
    expect(c.children.map(x => x.action)).toEqual(["cancelled"]);
    expect((await db.from("events").select("status").in("id", [parent, stage])).data!.map(r => (r as { status: string }).status)).toEqual(["cancelled", "cancelled"]);
  });

  test("multi-venue, multi-day and multi-room bindings are enforced for every writer", async () => {
    const fest = (await one(db.from("events").insert({ owner_id: org.id, workspace_id: W, name: "Q40 Weekender", event_type: "festival", visibility: "private", status: "draft", city: "London",
      starts_at: `${date(50)}T09:00:00Z`, ends_at: `${date(52)}T23:00:00Z`, timezone: "Europe/London" }).select("id").single())).id;
    expect((await orgC.rpc("set_event_venues", { p_event: fest, p_venues: [{ venue_name: "Main Park", role: "primary" }, { venue_name: "Warehouse", role: "satellite" }] })).error).toBeNull();
    expect((await orgC.rpc("set_event_days", { p_event: fest, p_days: [{ date: date(50), label: "Fri", start_time: "12:00", end_time: "23:00" }, { date: date(51), label: "Sat", start_time: "10:00", end_time: "02:00" }] })).error).toBeNull();
    expect((await orgC.rpc("set_event_days", { p_event: fest, p_days: [{ date: date(80) }] })).error?.message).toMatch(/day_outside_event/);
    const days = (await orgC.from("event_days").select("id,label,starts_at,ends_at").eq("event_id", fest).order("day_date")).data as { id: string; label: string; starts_at: string }[];
    const fri = (await one(db.from("ticket_tiers").insert({ event_id: fest, name: "Friday", kind: "general", price: 30, quantity: 100, event_day_id: days[0]!.id }).select("id,valid_from").single())) as unknown as { id: string; valid_from: string };
    expect(new Date(fri.valid_from).toISOString()).toBe(new Date(days[0]!.starts_at).toISOString());
    expect((await db.from("ticket_tiers").insert({ event_id: fest, name: "Bad", kind: "general", price: 1, quantity: 1, event_day_id: days[0]!.id, valid_to: `${date(52)}T00:00:00Z` })).error?.message).toMatch(/tier_outside_day/);
    expect((await db.from("programme_items").insert({ event_id: fest, title: "Wrong day", kind: "programme", starts_at: `${date(51)}T12:00:00Z`, duration_minutes: 30, event_day_id: days[0]!.id })).error?.message).toMatch(/item_outside_day/);
    expect((await db.from("ticket_tiers").insert({ event_id: fest, name: "Bad venue", kind: "general", price: 1, quantity: 1, valid_venue_ids: [randomUUID()] })).error?.message).toMatch(/venue_not_in_event/);
    await db.from("shifts").insert({ workspace_id: W, event_id: fest, role: "steward", title: "Gate", starts_at: `${date(50)}T11:00:00Z`, ends_at: `${date(50)}T19:00:00Z`, headcount: 6, event_day_id: days[0]!.id });
    const rep = (await orgC.rpc("event_day_report", { p_event: fest })).data as { label: string; staff: { headcount: number }; tiers: { count: number } }[];
    expect(rep.map(d => d.label)).toEqual(["Fri", "Sat"]); expect(rep[0]).toMatchObject({ staff: { headcount: 6 }, tiers: { count: 1 } });
    expect(((await orgC.rpc("event_venue_schedule", { p_event: fest })).data as { venues: unknown[] }).venues.length).toBe(2);
    expect((await outC.rpc("event_day_report", { p_event: fest })).error?.message).toMatch(/not_authorized/);
  });

  test("forms and waivers: versioned, validated, minor consent, private signatures", async () => {
    const f = (await orgC.rpc("save_event_form", { p_event: anchor, p_family: null, p_publish: true, p_form: { title: "Crew briefing", audience: "staff",
      fields: [{ key: "size", type: "select", options: ["S", "M", "L"], required: true }, { key: "agree", type: "consent" }] } })).data as { id: string; family_id: string };
    expect((await outC.rpc("submit_form_response", { p_form: f.id, p_answers: { size: "M", agree: true } })).error?.message).toMatch(/not_authorized/);
    expect((await memC.rpc("submit_form_response", { p_form: f.id, p_answers: { size: "XL", agree: true } })).error?.message).toMatch(/field_invalid/);
    expect((await memC.rpc("submit_form_response", { p_form: f.id, p_answers: { size: "M", agree: true } })).error).toBeNull();
    expect((await db.from("event_forms").update({ title: "edited" }).eq("id", f.id)).error?.message).toMatch(/form_version_immutable/);
    const w = (await orgC.rpc("save_waiver_template", { p_workspace: W, p_family: null, p_waiver: { title: "Climbing wall", body: "I understand climbing carries a risk of injury.", minors_allowed: true } })).data as { id: string };
    await orgC.rpc("publish_waiver_template", { p_template: w.id });
    await orgC.rpc("set_event_waiver", { p_event: anchor, p_template: w.id, p_tier_ids: null, p_active: true });
    const tier = ((await db.from("ticket_tiers").select("id").eq("event_id", anchor).limit(1)).data as { id: string }[])[0]!.id;
    const tk = (await one(db.from("tickets").insert({ code: `Q40W-${randomUUID().slice(0, 8)}`, event_id: anchor, tier_id: tier, holder_id: fan.id, attendee_name: "Kid", status: "valid", order_ref: "Q40W" }).select("id").single())).id;
    expect((await fanC.rpc("sign_waiver", { p_event: anchor, p_template: w.id, p_sign: { ticket_id: tk, signer_name: "Kid", signature_text: "Kid", is_minor: true } })).error?.message).toMatch(/guardian_consent_required/);
    expect((await fanC.rpc("sign_waiver", { p_event: anchor, p_template: w.id, p_sign: { ticket_id: tk, signer_name: "Kid", signature_text: "Kid", is_minor: true, guardian_name: "Parent", guardian_relationship: "mother", guardian_attested: true } })).error).toBeNull();
    expect((await outC.from("waiver_signatures").select("id").eq("event_id", anchor)).data).toEqual([]);
    expect((await memC.from("waiver_signatures").select("id").eq("event_id", anchor)).data).toEqual([]);   // members see counts, not signatures
    const st = (await memC.rpc("waiver_status", { p_event: anchor })).data as { signed_tickets: number; minor_signatures: number }[];
    expect(st[0]).toMatchObject({ signed_tickets: 1, minor_signatures: 1 });
  });

  test("stock is append-only and never negative; merchandise reserve → pay → collect → refund", async () => {
    const tee = ((await orgC.rpc("save_stock_item", { p_workspace: W, p_item: null, p_data: { category: "merchandise", name: "Q40 tee", sku: `Q40-${randomUUID().slice(0, 6)}` } })).data as { id: string }).id;
    await orgC.rpc("record_stock_movement", { p_item: tee, p_kind: "receive", p_quantity: 2 });
    expect((await orgC.rpc("record_stock_movement", { p_item: tee, p_kind: "issue", p_quantity: 5 })).error?.message).toMatch(/insufficient_stock/);
    expect((await outC.rpc("record_stock_movement", { p_item: tee, p_kind: "receive", p_quantity: 5 })).error?.message).toMatch(/not_authorized/);
    const mi = ((await orgC.rpc("save_merch_item", { p_workspace: W, p_item: null, p_data: { stock_item_id: tee, name: "Q40 tee", price_minor: 2000, status: "on_sale" } })).data as { id: string }).id;
    const r = (await fanC.rpc("merch_reserve", { p_event: anchor, p_items: [{ merch_item_id: mi, qty: 2 }], p_request_id: randomUUID() })).data as { order_ref: string; collection_code: string; total_minor: number };
    expect(r.total_minor).toBe(4000);
    expect((await outC.rpc("merch_reserve", { p_event: anchor, p_items: [{ merch_item_id: mi, qty: 1 }], p_request_id: randomUUID() })).error?.message).toMatch(/sold_out/);
    expect((await fanC.rpc("merch_mark_paid", { p_order_ref: r.order_ref, p_payment_ref: "pi_x" })).error).not.toBeNull();         // service-only Q07 hook
    await db.rpc("merch_mark_paid", { p_order_ref: r.order_ref, p_payment_ref: "pi_test_q40" });
    expect((await orgC.rpc("merch_collect", { p_order_ref: r.order_ref, p_code: r.collection_code })).data).toMatchObject({ ok: true });
    expect((await memC.rpc("merch_refund", { p_order_ref: r.order_ref, p_lines: [{ merch_item_id: mi, qty: 1 }] })).error?.message).toMatch(/not_authorized/);
    expect((await orgC.rpc("merch_refund", { p_order_ref: r.order_ref, p_lines: [{ merch_item_id: mi, qty: 1 }], p_restock: true })).data).toMatchObject({ refund_minor: 2000 });
    expect((await db.from("stock_items").select("on_hand,reserved").eq("id", tee).single()).data).toMatchObject({ on_hand: 1, reserved: 0 });
    expect((await db.from("stock_movements").update({ quantity: 9 }).eq("item_id", tee)).error?.message).toMatch(/append_only/);
  });

  test("lost property matches explainably and stays private; sustainability derives CO2e with provenance", async () => {
    const rep = ((await fanC.rpc("report_lost_item", { p_event: anchor, p_report: { category: "phone", description: "Blue iPhone with cracked case", colour: "blue", brand: "apple" } })).data as { id: string }).id;
    const item = ((await memC.rpc("log_found_item", { p_event: anchor, p_item: { category: "phone", description: "blue iphone, cracked case", colour: "blue", brand: "apple", storage_location: "Safe 1" } })).data as { id: string }).id;
    expect((await fanC.rpc("lost_property_matches", { p_report: rep })).error?.message).toMatch(/not_authorized/);
    const m = (await memC.rpc("lost_property_matches", { p_report: rep })).data as { model: string; matches: { item_id: string; features: Record<string, number> }[] };
    expect(m.model).toBe("lp-v1"); expect(m.matches[0]!.item_id).toBe(item); expect(m.matches[0]!.features).toMatchObject({ colour: 2, brand: 2 });
    const claim = ((await memC.rpc("claim_found_item", { p_report: rep, p_item: item, p_evidence: { lock_screen: "dog photo" } })).data as { id: string }).id;
    await memC.rpc("decide_lost_claim", { p_claim: claim, p_decision: "verified" });
    const mine = (await fanC.rpc("my_lost_reports")).data as { status: string }[];
    expect(mine[0]!.status).toBe("ready_to_collect"); expect(JSON.stringify(mine)).not.toContain("Safe 1");
    expect((await fanC.from("found_items").select("id")).data).toEqual([]);
    await orgC.rpc("record_sustainability", { p_event: anchor, p_entries: [{ factor_key: "waste_general", quantity: 50 }, { factor_key: "waste_recycled", quantity: 50 }, { factor_key: "electricity_grid", quantity: 100 }] });
    const s = (await orgC.rpc("event_sustainability_report", { p_event: anchor })).data as { recycling_rate: number; kg_co2e_total: number; provenance: unknown[] };
    expect(Number(s.recycling_rate)).toBe(0.5); expect(Number(s.kg_co2e_total)).toBeCloseTo(50 * 0.467 + 50 * 0.021 + 100 * 0.207, 1); expect(s.provenance.length).toBe(3);
    expect((await outC.rpc("record_sustainability", { p_event: anchor, p_entries: [] })).error?.message).toMatch(/not_authorized/);
  });
});
