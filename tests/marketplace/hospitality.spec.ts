import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Q13 Food / Drinks / Hospitality (domains 81–84; migration 202610291035). Exit gate: a customer/organizer selection flows
// through booking → BEO → finance as structured lines (pence, 14 UK allergens as data), never retyped text.
// API level with disposable identities; the test venue listing is never published to the live marketplace search (no city).
const db = admin as unknown as SupabaseClient;
const at = (days: number, h: number) => { const d = new Date(Date.now() + days * 864e5); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
const one = async <T = { id: string }>(q: PromiseLike<{ data: unknown; error: unknown }>) => { const r = await q; if (r.error) throw r.error; return r.data as T; };
type Line = { source: string; kind: string; label: string; basis: string; qty: number; unit_minor: number; total_minor: number; allergens: string[]; dietary: string[]; may_contain: string[]; service_at: string | null };
type Booking = { catering_minor: number; bar_minor: number; schedule_minor: number; contingent_minor: number; total_minor: number; adjustment_minor: number; status: string; allergens: string[]; warnings: { code: string }[] };

test.describe.configure({ mode: "serial" });
test.describe("Q13 hospitality engine", () => {
  let prov: { id: string; email: string }, prov2: { id: string; email: string }, cust: { id: string; email: string }, out: { id: string; email: string };
  let provC: SupabaseClient, prov2C: SupabaseClient, custC: SupabaseClient, outC: SupabaseClient;
  let P: string, P2: string, venue: string, event: string, item: string, menu: string, crewMenu: string, prog: string;
  let starter: string, main: string, fizz: string, bread: string, vegan: string, bar: string, version = 0;
  const day = 30;

  test.beforeAll(async () => {
    [prov, prov2, cust, out] = await Promise.all([createUser("q13-p"), createUser("q13-p2"), createUser("q13-c"), createUser("q13-x")]);
    [P, P2] = await Promise.all([seedWorkspace(prov.id, "provider", "Q13 Test Venue"), seedWorkspace(prov2.id, "provider", "Q13 Other Venue")]);
    venue = (await one(db.from("listings").insert({ workspace_id: P, name: "Q13 Test Venue", kind: "venue", category: "venue", published: false }).select("id").single())).id;
    event = (await one(db.from("events").insert({ owner_id: cust.id, name: "Q13 Test wedding", event_type: "wedding", guest_count: 50, budget_total: 20000, starts_at: at(day, 15), ends_at: at(day, 23) }).select("id").single())).id;
    item = (await one(db.from("build_items").insert({ event_id: event, listing_id: venue, category: "venue", title: "Q13 Test Venue", status: "quoted", amount: 3000 }).select("id").single())).id;
    prog = (await one(db.from("programme_items").insert({ event_id: event, starts_at: at(day, 18), duration_minutes: 90, title: "Wedding breakfast" }).select("id").single())).id;
    [provC, prov2C, custC, outC] = await Promise.all([prov, prov2, cust, out].map(u => signedIn(u.email))) as unknown as SupabaseClient[];
  });
  test.afterAll(async () => {
    await db.from("event_orders").delete().eq("event_id", event);
    await db.from("provider_jobs").delete().eq("workspace_id", P);
    await db.from("events").delete().eq("id", event);
    await db.from("menus").delete().in("workspace_id", [P, P2]);
    await db.from("bar_packages").delete().eq("workspace_id", P);
    await db.from("listings").delete().eq("workspace_id", P);
    await db.from("workspaces").delete().in("id", [P, P2]);
    await cleanup();
  });

  test("81 menus: sections, items, relational variants, structured allergens; declarations audited; provider-only authoring", async () => {
    const allergens = (await (anon() as unknown as SupabaseClient).from("food_allergens").select("key")).data as { key: string }[];
    expect(allergens.map(a => a.key).sort()).toHaveLength(14);
    menu = (await one(provC.from("menus").insert({ workspace_id: P, listing_id: venue, name: "Q13 Wedding breakfast", pricing: "per_person", price: 45, min_guests: 20, final_numbers_days: 7 }).select("id").single())).id;
    crewMenu = (await one(provC.from("menus").insert({ workspace_id: P, listing_id: venue, name: "Q13 Crew meal", pricing: "per_person", price: 12, status: "published" }).select("id").single())).id;
    const sec = async (name: string, min: number | null, max: number | null) => (await one(provC.from("menu_sections").insert({ menu_id: menu, name, choose_min: min, choose_max: max }).select("id").single())).id;
    const sS = await sec("Starters", 1, 1), sM = await sec("Mains", 1, 2);
    const it = async (row: Record<string, unknown>) => (await one(provC.from("menu_items").insert({ menu_id: menu, ...row }).select("id").single())).id;
    starter = await it({ section_id: sS, name: "Smoked salmon", course: "starter", allergens: ["fish", "milk"], dietary: ["pescatarian"] });
    main = await it({ section_id: sM, name: "Beef wellington", course: "main", allergens: ["gluten", "eggs", "milk"] });
    fizz = await it({ name: "Champagne toast", course: "drink", price: 12, allergens: ["sulphites"] });
    bread = await it({ name: "Sourdough", course: "side" });                                          // nothing declared
    vegan = (await one(provC.from("menu_item_variants").insert({ menu_item_id: main, menu_id: menu, name: "Vegan wellington", price_delta_minor: 0, dietary: ["vegan"], allergens: ["gluten", "soya"] }).select("id").single())).id;
    expect((await provC.from("menu_item_variants").insert({ menu_item_id: main, menu_id: menu, name: "Bad", allergens: ["glitter"] })).error).not.toBeNull();
    expect((await outC.from("menu_item_variants").insert({ menu_item_id: main, menu_id: menu, name: "Hijack" })).error).not.toBeNull();
    expect((await outC.from("menu_items").update({ allergens: [] }).eq("id", main).select("id")).data ?? []).toEqual([]);
    const declared = await one<{ allergen_status: string; allergen_declared_at: string | null; price_minor: number | null }[]>(db.from("menu_items").select("allergen_status,allergen_declared_at,price_minor").in("id", [main, bread, fizz]).order("name"));
    expect(declared.map(d => d.allergen_status).sort()).toEqual(["declared", "declared", "not_declared"]);
    await provC.from("menu_items").update({ allergens: ["gluten", "eggs", "milk", "mustard"] }).eq("id", main);
    const audit = await one<{ metadata: { after: string[] } }[]>(db.from("audit_events").select("metadata").eq("workspace_id", P).eq("event", "menu.allergens_changed"));
    expect(audit.at(-1)!.metadata.after).toEqual(["gluten", "eggs", "milk", "mustard"]);
    await provC.from("menus").update({ status: "published" }).eq("id", menu);
  });

  test("82 catering: per-head pricing in pence, variants, supplements, programme-linked service time, dietary validation", async () => {
    const sel = (guests: number, extra: Record<string, unknown> = {}) => ({ menu_id: menu, guests, items: [{ item_id: starter }, { item_id: main, variant_id: vegan }, { item_id: main }, { item_id: fizz, qty: 10 }, { item_id: bread }],
      dietary_counts: { vegan: 5 }, serving_style: "plated", programme_item_id: prog, course_timing: [{ course: "starter", serve_at: at(day, 18) }, { course: "main", serve_at: at(day, 19) }], submit: true, ...extra });
    expect((await custC.rpc("hospitality_save_catering", { p_item: item, p_sel: { ...sel(50), dietary_counts: { glutenless: 2 } } })).error?.message).toMatch(/invalid_dietary/);
    expect((await custC.rpc("hospitality_save_catering", { p_item: item, p_sel: { ...sel(50), dietary_counts: { vegan: 60 } } })).error?.message).toMatch(/dietary_exceeds_guests/);
    expect((await outC.rpc("hospitality_save_catering", { p_item: item, p_sel: sel(50) })).error?.message).toMatch(/not_authorized/);
    const r = await custC.rpc("hospitality_save_catering", { p_item: item, p_sel: sel(50) });
    expect(r.error).toBeNull();
    const res = r.data as { saved: boolean; version: number; booking: Booking };
    version = res.version;
    // 50 × £45.00 per head + 10 × £12.00 champagne = 225,000 + 12,000 pence.
    expect(res.booking).toMatchObject({ catering_minor: 237000, total_minor: 237000, status: "submitted" });
    expect(res.booking.warnings.map(w => w.code)).toContain("allergens_not_declared");      // Sourdough
    expect(res.booking.allergens).toEqual(["eggs", "fish", "gluten", "milk", "mustard", "soya", "sulphites"]);
    const lines = await one<Line[]>(custC.from("hospitality_lines").select("source,kind,label,basis,qty,unit_minor,total_minor,allergens,dietary,may_contain,service_at").eq("build_item_id", item).order("sort"));
    expect(lines.map(l => [l.label, l.basis, Number(l.qty), l.total_minor])).toEqual([
      ["Q13 Wedding breakfast", "per_head", 50, 225000], ["Smoked salmon", "included", 50, 0], ["Beef wellington — Vegan wellington", "included", 50, 0],
      ["Beef wellington", "included", 50, 0], ["Champagne toast", "quantity", 10, 12000], ["Sourdough", "included", 50, 0]]);
    expect(lines[2]).toMatchObject({ dietary: ["vegan"], allergens: ["eggs", "gluten", "milk", "mustard", "soya"] });
    expect(Date.parse(lines[0]!.service_at!)).toBe(Date.parse(at(day, 18)));                   // programme item start
    expect(Date.parse(lines[3]!.service_at!)).toBe(Date.parse(at(day, 19)));                   // course timing
    // Venue hire (£3,000) is kept; hospitality is added to the booking line amount the customer pays.
    expect(Number((await one<{ amount: number }>(db.from("build_items").select("amount").eq("id", item).single())).amount)).toBe(5370);
  });

  test("concurrent edits: a stale version is refused, not silently overwritten", async () => {
    const base = { menu_id: menu, guests: 55, items: [{ item_id: starter }, { item_id: main }], dietary_counts: {}, programme_item_id: prog, submit: true };
    const [a, b] = await Promise.all([
      custC.rpc("hospitality_save_catering", { p_item: item, p_sel: base, p_expected_version: version }),
      custC.rpc("hospitality_save_catering", { p_item: item, p_sel: { ...base, guests: 60 }, p_expected_version: version })]);
    const errs = [a.error, b.error].filter(Boolean);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toMatch(/stale_version/);
    // Restore the full selection for the following steps.
    const cur = await one<{ version: number }>(db.from("catering_selections").select("version").eq("build_item_id", item).single());
    const r = await custC.rpc("hospitality_save_catering", { p_item: item, p_expected_version: cur.version, p_sel: { menu_id: menu, guests: 50, items: [{ item_id: starter }, { item_id: main, variant_id: vegan }, { item_id: main }, { item_id: fizz, qty: 10 }, { item_id: bread }],
      dietary_counts: { vegan: 5 }, programme_item_id: prog, course_timing: [{ course: "starter", serve_at: at(day, 18) }, { course: "main", serve_at: at(day, 19) }], submit: true } });
    expect(r.error).toBeNull();
  });

  test("83 bar: open bar per head, corkage, minimum-spend top-up; modes not offered are refused", async () => {
    bar = (await one(provC.from("bar_packages").insert({ workspace_id: P, listing_id: venue, name: "Q13 Open bar", model: "open_bar", per_person: 25, min_spend: 2000, corkage_per_bottle: 10,
      hours_from: "18:00", hours_to: "23:00", licensing: { provided_by: "venue", licence_ref: "PL-Q13", min_age: 18 }, status: "published" }).select("id").single())).id;
    expect((await custC.rpc("hospitality_save_bar", { p_item: item, p_bar: { bar_package_id: bar, mode: "cash_bar", guests: 50 } })).error?.message).toMatch(/bar_mode_not_offered/);
    expect((await custC.rpc("hospitality_save_bar", { p_item: item, p_bar: { bar_package_id: bar, guests: 50, tokens: 3 } })).error?.message).toMatch(/tokens_not_applicable/);
    const r = await custC.rpc("hospitality_save_bar", { p_item: item, p_bar: { bar_package_id: bar, guests: 50, corkage_bottles: 6, starts_at: at(day, 18), ends_at: at(day, 23), submit: true } });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ licensing: { min_age: 18, provided_by: "venue" } });
    // 50 × £25 = 125,000; corkage 6 × £10 = 6,000; £2,000 minimum spend → 75,000 top-up (corkage does not count).
    expect((r.data as { booking: Booking }).booking).toMatchObject({ bar_minor: 206000, total_minor: 443000 });
    const bl = await one<Line[]>(custC.from("hospitality_lines").select("kind,basis,total_minor").eq("build_item_id", item).eq("source", "bar").order("sort"));
    expect(bl.map(l => [l.kind, l.basis, l.total_minor])).toEqual([["per_head", "per_head", 125000], ["corkage", "quantity", 6000], ["minimum_spend", "top_up", 75000]]);
  });

  test("84 schedules: staff meals priced through the booking line; green room unpriced; reads scoped to the booking", async () => {
    expect((await outC.rpc("hospitality_save_schedule", { p_event: event, p_row: { kind: "staff_meals", title: "Crew dinner", starts_at: at(day, 16), ends_at: at(day, 17), headcount: 10 } })).error?.message).toMatch(/not_authorized/);
    const s1 = await custC.rpc("hospitality_save_schedule", { p_event: event, p_row: { kind: "staff_meals", title: "Crew dinner", starts_at: at(day, 16), ends_at: at(day, 17), headcount: 10,
      build_item_id: item, menu_id: crewMenu, dietary_counts: { vegetarian: 2 } } });
    expect(s1.error).toBeNull();
    expect((await custC.rpc("hospitality_save_schedule", { p_event: event, p_row: { kind: "green_room", title: "Band green room", programme_item_id: prog, headcount: 6, requirements: [{ item: "Still water", qty: 24 }] } })).error).toBeNull();
    expect((await custC.rpc("hospitality_save_schedule", { p_event: event, p_row: { kind: "vip", title: "VIP", starts_at: at(day, 16), ends_at: at(day, 15), headcount: 2 } })).error?.message).toMatch(/invalid_schedule_time/);
    const sum = (await custC.rpc("hospitality_event_summary", { p_event: event })).data as { total_minor: number; schedules: unknown[]; allergen_matrix: Record<string, string[]> };
    expect(sum.total_minor).toBe(443000 + 12000);                                              // + 10 × £12 crew meal
    expect(sum.schedules).toHaveLength(2);
    expect(sum.allergen_matrix.fish).toEqual(["Smoked salmon"]);
    // Provider of the booking reads its lines; another venue and outsiders read nothing.
    expect(((await provC.from("hospitality_lines").select("id").eq("build_item_id", item)).data ?? []).length).toBeGreaterThan(5);
    expect((await prov2C.from("hospitality_lines").select("id").eq("build_item_id", item)).data).toEqual([]);
    expect((await prov2C.from("hospitality_schedules").select("id").eq("event_id", event)).data).toEqual([]);
    expect((await outC.from("hospitality_bookings").select("build_item_id").eq("build_item_id", item)).data).toEqual([]);
    expect((await outC.rpc("hospitality_booking", { p_item: item })).error?.message).toMatch(/not_authorized/);
    expect((await custC.rpc("hospitality_refresh", { p_item: item })).error).not.toBeNull();     // internal
    expect((await custC.from("hospitality_lines").insert({ build_item_id: item, event_id: event, source: "bar", kind: "x", price_key: "x", label: "free", basis: "fixed" })).error).not.toBeNull();
  });

  test("budget: event_budget_summary itemises hospitality from the same lines (pence)", async () => {
    const b = (await custC.rpc("event_budget_summary", { p_event: event })).data as { quoted_minor: number; hospitality: { total_minor: number; catering_minor: number; bar_minor: number; schedule_minor: number; allergens: string[] } };
    expect(b.hospitality).toMatchObject({ total_minor: 455000, catering_minor: 237000, bar_minor: 206000, schedule_minor: 12000 });
    expect(b.quoted_minor).toBe(300000 + 455000);                                              // hire + hospitality on the quoted line
    expect(b.hospitality.allergens).toContain("sulphites");
  });

  test("confirmation snapshots prices; later menu edits and number changes are adjustments, not rewrites", async () => {
    await one(db.from("build_items").update({ status: "confirmed" }).eq("id", item).select("id").single()); // payment path stand-in
    const h = (await custC.rpc("hospitality_booking", { p_item: item })).data as Booking & { snapshot_total_minor: number };
    expect(h).toMatchObject({ status: "confirmed", snapshot_total_minor: 455000, adjustment_minor: 0 });
    await provC.from("menus").update({ price: 60 }).eq("id", menu);                            // later price rise
    const cur = await one<{ version: number }>(db.from("catering_selections").select("version").eq("build_item_id", item).single());
    const sel = { menu_id: menu, guests: 55, items: [{ item_id: starter }, { item_id: main, variant_id: vegan }, { item_id: main }, { item_id: fizz, qty: 10 }, { item_id: bread }],
      dietary_counts: { vegan: 5 }, programme_item_id: prog, course_timing: [{ course: "starter", serve_at: at(day, 18) }, { course: "main", serve_at: at(day, 19) }], submit: true };
    const ask = (await custC.rpc("hospitality_save_catering", { p_item: item, p_sel: sel, p_expected_version: cur.version })).data;
    expect(ask).toMatchObject({ needs_confirmation: true, previous_total_minor: 455000, new_total_minor: 455000 + 5 * 4500, difference_minor: 22500 }); // snapshot £45, not £60
    expect((await custC.rpc("hospitality_save_catering", { p_item: item, p_sel: sel, p_expected_version: cur.version, p_accept_change: true })).error).toBeNull();
    const after = (await custC.rpc("hospitality_booking", { p_item: item })).data as Booking;
    expect(after).toMatchObject({ adjustment_minor: 22500, catering_minor: 237000 + 22500 });
    expect(Number((await one<{ amount: number }>(db.from("build_items").select("amount").eq("id", item).single())).amount)).toBe(7550); // charged amount untouched
    const b = (await custC.rpc("event_budget_summary", { p_event: event })).data as { warnings: { code: string }[] };
    expect(b.warnings.map(w => w.code)).toContain("hospitality_adjustment");
    await provC.from("menu_items").update({ allergens: ["fish"] }).eq("id", starter);         // starter re-declared (milk removed)
    const drift = (await custC.rpc("hospitality_booking", { p_item: item })).data as { allergen_changes: { item: string }[] };
    expect(drift.allergen_changes.map(c => c.item)).toContain("Smoked salmon");
  });

  test("EXIT GATE: BEO version carries the structured lines + allergens; client approves through the event_order machine", async () => {
    expect((await custC.rpc("event_order_sync_hospitality", { p_item: item, p_send: true })).error).not.toBeNull(); // provider-only
    const s = await provC.rpc("event_order_sync_hospitality", { p_item: item, p_send: true, p_note: "Menu and bar" });
    expect(s.error).toBeNull();
    const { order_id, version: v } = s.data as { order_id: string; version: number };
    const ver = await one<{ content: { hospitality: { lines: Line[]; allergens: string[]; catering: { programme_item_id: string; timing_source: string }; bar: { mode: string } } }; financial: { hospitality_minor: number } }>(
      custC.from("event_order_versions").select("content,financial").eq("order_id", order_id).eq("version", v).single());
    const lines = await one<Line[]>(custC.from("hospitality_lines").select("label,allergens,total_minor").eq("build_item_id", item).order("sort"));
    expect(ver.content.hospitality.lines.map(l => [l.label, l.allergens, l.total_minor])).toEqual(lines.map(l => [l.label, l.allergens, l.total_minor]));
    expect(ver.content.hospitality.catering).toMatchObject({ programme_item_id: prog, timing_source: "programme" });
    expect(ver.content.hospitality.bar.mode).toBe("open_bar");
    const total = ((await custC.rpc("hospitality_booking", { p_item: item })).data as Booking).total_minor;
    expect(ver.financial.hospitality_minor).toBe(total);
    expect((await custC.rpc("approve_event_order", { p_order: order_id, p_version: v })).error).toBeNull();
    // A later manual BEO save (text sections only) keeps the structured section and moves approved → revised → sent legally.
    const job = await one<{ id: string }>(db.from("provider_jobs").select("id").eq("build_item_id", item).single());
    expect((await provC.rpc("save_event_order", { p_job: job.id, p_content: { av: "PA + 2 mics" }, p_financial: { total: 1 }, p_note: "AV", p_send: true })).error).toBeNull();
    const o = await one<{ status: string; current_version: number }>(db.from("event_orders").select("status,current_version").eq("id", order_id).single());
    expect(o).toEqual({ status: "sent", current_version: v + 1 });
    const v2 = await one<{ content: { av: string; hospitality: unknown }; financial: { hospitality_minor: number } }>(db.from("event_order_versions").select("content,financial").eq("order_id", order_id).eq("version", v + 1).single());
    expect(v2.content.av).toBe("PA + 2 mics");
    expect(v2.content.hospitality).toBeTruthy();
    expect(v2.financial.hospitality_minor).toBe(total);
    const bk = (await custC.rpc("hospitality_booking", { p_item: item })).data as { beo: { status: string; stale: boolean } };
    expect(bk.beo).toMatchObject({ status: "sent", stale: false });
  });

  test("final numbers: the event side until the cut-off; afterwards only the provider", async () => {
    expect((await custC.rpc("hospitality_set_final_numbers", { p_item: item, p_guests: 52 })).error).toBeNull();
    await db.from("catering_selections").update({ final_numbers_due: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10) }).eq("build_item_id", item);
    expect((await custC.rpc("hospitality_set_final_numbers", { p_item: item, p_guests: 40 })).error?.message).toMatch(/final_numbers_closed/);
    expect((await prov2C.rpc("hospitality_set_final_numbers", { p_item: item, p_guests: 40 })).error?.message).toMatch(/not_authorized/);
    const r = await provC.rpc("hospitality_set_final_numbers", { p_item: item, p_guests: 48 });
    expect(r.error).toBeNull();
    expect(((await one<{ final_guest_count: number }>(db.from("catering_selections").select("final_guest_count").eq("build_item_id", item).single())).final_guest_count)).toBe(48);
    const bk = (await custC.rpc("hospitality_booking", { p_item: item })).data as { beo: { stale: boolean } };
    expect(bk.beo.stale).toBe(true);                                                           // BEO must be re-synced
  });
});
