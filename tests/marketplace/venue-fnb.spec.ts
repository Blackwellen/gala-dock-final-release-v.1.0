import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Phase 5 (§59–65): rate cards → quotes, conflict engine with buffers/links/blackouts, venue holds, alternatives, versioned BEO,
// menus + catering pricing with change consequences, bar packages, RLS.
const db = admin as unknown as SupabaseClient;
const at = (days: number, h: number) => { const d = new Date(Date.now() + days * 864e5); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };

test.describe.configure({ mode: "serial" });
test.describe("venue hire, BEO, food & drink", () => {
  let org: { id: string; email: string }, prov: { id: string; email: string }, out: { id: string; email: string };
  let orgC: SupabaseClient, provC: SupabaseClient, outC: SupabaseClient;
  let ws: string, venue: string, hall: string, terrace: string, event: string, item: string, menu: string;
  const day = 30;

  test.beforeAll(async () => {
    [org, prov, out] = await Promise.all([createUser("v-org"), createUser("v-prov"), createUser("v-out")]);
    ws = await seedWorkspace(prov.id, "provider", "FnB Test Venue");
    venue = ((await db.from("listings").insert({ workspace_id: ws, name: "FnB Test Venue", kind: "venue", category: "venue", published: true }).select("id").single()).data as { id: string }).id;
    const sp = async (name: string) => ((await db.from("spaces").insert({ workspace_id: ws, venue_id: venue, name, capacity_seated: 120, rate_hourly: 200, turnaround_minutes: 60,
      details: { setup_minutes: 120, cleardown_minutes: 60 } }).select("id").single()).data as { id: string }).id;
    hall = await sp("Hall"); terrace = await sp("Terrace");
    const { error: le } = await db.from("space_links").insert({ workspace_id: ws, space_a: hall < terrace ? hall : terrace, space_b: hall < terrace ? terrace : hall, kind: "linked" }); // pairs are stored ordered
    if (le) throw new Error(`space_links: ${le.message}`);
    event = ((await db.from("events").insert({ owner_id: org.id, name: "FnB test", starts_at: at(day, 18), ends_at: at(day, 23) }).select("id").single()).data as { id: string }).id;
    item = ((await db.from("build_items").insert({ event_id: event, listing_id: venue, category: "venue", title: "FnB Test Venue", status: "sent", amount: 3000 }).select("id").single()).data as { id: string }).id;
    [orgC, provC, outC] = await Promise.all([signedIn(org.email), signedIn(prov.email), signedIn(out.email)]) as unknown as SupabaseClient[];
  });
  test.afterAll(async () => {
    // Unpublish first so nothing leaks into the live marketplace even if a later delete fails.
    await db.from("listings").update({ published: false }).eq("workspace_id", ws);
    await db.from("catering_selections").delete().eq("event_id", event);
    await db.from("provider_jobs").delete().eq("workspace_id", ws);
    await db.from("events").delete().eq("id", event);
    await db.from("workspaces").delete().eq("id", ws);
    await cleanup();
  });

  test("§60 rate cards: evening card beats hourly fallback; per-person, fees and minimum spend itemised", async () => {
    const { data: fallback } = await orgC.rpc("venue_quote", { p_space: hall, p_starts: at(day, 18), p_ends: at(day, 23), p_guests: 80 });
    expect(fallback).toMatchObject({ available: true, total: 1000 }); // 5h × £200
    expect((await outC.from("venue_rate_cards").insert({ workspace_id: ws, venue_id: venue, name: "Hijack", model: "flat", amount: 1 })).error).not.toBeNull();
    const { error } = await provC.from("venue_rate_cards").insert({ workspace_id: ws, venue_id: venue, space_id: hall, name: "Saturday evening", model: "evening", amount: 1500, per_person: 10,
      min_spend: 4000, days_of_week: [0, 1, 2, 3, 4, 5, 6], time_from: "17:00", peak: true, fees: { setup: 150, damage_deposit: 500, booking_deposit_pct: 25 } });
    expect(error).toBeNull();
    const { data: q } = await orgC.rpc("venue_quote", { p_space: hall, p_starts: at(day, 18), p_ends: at(day, 23), p_guests: 80 });
    // 1500 hire + 800 per-person + 150 setup = 2450 → topped up to the £4,000 minimum spend.
    expect(q).toMatchObject({ total: 4000, minimum_spend: 4000, deposit: 1000, damage_deposit: 500, card: { name: "Saturday evening" } });
    expect((q as { lines: { label: string }[] }).lines.map(l => l.label)).toEqual(["Evening hire", "Per person · 80 × 10.00", "Setup fee", "Minimum spend top-up"]);
  });

  test("§59 conflicts honour setup/cleardown buffers, linked spaces and blackouts", async () => {
    const { error: je } = await db.from("provider_jobs").insert({ reference: "BK-TEST1", workspace_id: ws, listing_id: venue, space_id: terrace, mode: "venue", client_name: "Other", event_name: "Other party",
      starts_at: at(day, 9), ends_at: at(day, 15), status: "confirmed" });
    expect(je).toBeNull();
    // Terrace ends 15:00; Hall starts 18:00 but needs 2h setup + 1h turnaround → 15:00 window touches; a 17:00 start overlaps.
    const { data: c1 } = await orgC.rpc("space_conflicts", { p_space: hall, p_starts: at(day, 17), p_ends: at(day, 22) });
    expect((c1 as { level: string; reason: string }[]).map(c => c.reason)).toContain("Booked: linked space");
    const { data: c2 } = await orgC.rpc("space_conflicts", { p_space: hall, p_starts: at(day, 19), p_ends: at(day, 22) });
    expect(c2).toEqual([]);
    await db.from("availability_blocks").insert({ workspace_id: ws, listing_id: venue, space_id: hall, kind: "maintenance", starts_at: at(day + 1, 0), ends_at: at(day + 2, 0), note: "Floor sanding" });
    const { data: c3 } = await orgC.rpc("space_conflicts", { p_space: hall, p_starts: at(day + 1, 10), p_ends: at(day + 1, 12) });
    expect((c3 as { level: string; reason: string }[])[0]).toMatchObject({ level: "hard", reason: "Maintenance: Floor sanding" });
  });

  test("§61 venue hold names space, window, expiry and blocking level; hard holds block others", async () => {
    expect((await outC.rpc("venue_place_hold", { p_item: item, p_space: hall, p_starts: at(day, 19), p_ends: at(day, 23), p_hours: 72, p_blocking: "hard", p_note: "" })).error?.message).toMatch(/not_authorized/);
    const { data: hid, error } = await provC.rpc("venue_place_hold", { p_item: item, p_space: hall, p_starts: at(day, 19), p_ends: at(day, 23), p_hours: 72, p_blocking: "hard", p_note: "Held pending contract" });
    expect(error).toBeNull();
    const h = (await orgC.from("conditional_holds").select("space_id,window_start,window_end,blocking_level,status").eq("id", hid as string).single()).data as { space_id: string; window_start: string; window_end: string; blocking_level: string; status: string };
    expect(h).toMatchObject({ space_id: hall, blocking_level: "hard", status: "held" });
    expect(Date.parse(h.window_start)).toBe(Date.parse(at(day, 17))); // 2h setup
    expect(Date.parse(h.window_end)).toBe(Date.parse(at(day, 24)));   // 1h cleardown
    const { data: c } = await orgC.rpc("space_conflicts", { p_space: terrace, p_starts: at(day, 20), p_ends: at(day, 22) });
    expect((c as { reason: string }[]).map(x => x.reason)).toContain("Hold on this space");
  });

  test("§61 alternative space/date: offer and accept updates the line", async () => {
    const { data: aid, error } = await provC.rpc("venue_offer_alternative", { p_item: item, p_kind: "space", p_space: terrace, p_starts: null, p_ends: null, p_price: 2600, p_note: "The Terrace fits 120 seated" });
    expect(error).toBeNull();
    expect((await outC.rpc("decide_venue_alternative", { p_alt: aid, p_accept: true })).error?.message).toMatch(/not_authorized/);
    expect((await orgC.rpc("decide_venue_alternative", { p_alt: aid, p_accept: true })).error).toBeNull();
    const b = (await db.from("build_items").select("amount,quote").eq("id", item).single()).data as { amount: number; quote: { space_id: string } };
    expect(b).toMatchObject({ amount: 2600, quote: { space_id: terrace } });
  });

  test("§62 BEO: versions are append-only; client sees sent versions and approves the current one", async () => {
    const job = ((await db.from("provider_jobs").insert({ reference: "BK-TEST2", workspace_id: ws, build_item_id: item, event_id: event, listing_id: venue, space_id: hall, mode: "venue",
      client_name: "FnB", event_name: "FnB test", starts_at: at(day, 18), ends_at: at(day, 23), status: "confirmed" }).select("id").single()).data as { id: string }).id;
    const { data: oid, error } = await provC.rpc("save_event_order", { p_job: job, p_content: { room: "Hall", layout: "Banquet 12 × 10", catering: "3 courses" }, p_financial: { total: 4000 }, p_note: "Draft", p_send: false });
    expect(error).toBeNull();
    expect((await orgC.from("event_orders").select("id").eq("id", oid as string)).data).toEqual([]); // drafts are private
    await provC.rpc("save_event_order", { p_job: job, p_content: { room: "Hall", layout: "Banquet 12 × 10", catering: "3 courses", av: "PA + 2 mics" }, p_financial: { total: 4150 }, p_note: "Added AV", p_send: true });
    const o = (await orgC.from("event_orders").select("status,current_version").eq("id", oid as string).single()).data;
    expect(o).toEqual({ status: "sent", current_version: 2 });
    expect((await db.from("event_order_versions").update({ content: { tampered: true } }).eq("order_id", oid as string).eq("version", 1)).error?.message).toMatch(/immutable/);
    expect((await orgC.rpc("approve_event_order", { p_order: oid, p_version: 1 })).error?.message).toMatch(/stale_version/);
    expect((await orgC.rpc("approve_event_order", { p_order: oid, p_version: 2 })).error).toBeNull();
    expect(((await db.from("event_orders").select("status,approved_version").eq("id", oid as string).single()).data)).toEqual({ status: "approved", approved_version: 2 });
  });

  test("§63–64 menus: draft private, published priced server-side; guest-count change on a confirmed selection needs acceptance", async () => {
    const { data: m, error } = await provC.from("menus").insert({ workspace_id: ws, listing_id: venue, name: "Summer menu", pricing: "per_person", price: 45, min_guests: 40, max_guests: 150, final_numbers_days: 7 }).select("id").single();
    expect(error).toBeNull();
    menu = (m as { id: string }).id;
    await provC.from("menu_items").insert({ menu_id: menu, name: "Champagne upgrade", price: 12, dietary: ["vegan"], allergens: ["sulphites"] });
    expect((await outC.from("menus").select("id").eq("id", menu)).data).toEqual([]);
    expect((await provC.from("menu_items").insert({ menu_id: menu, name: "Bad", allergens: ["glitter"] })).error).not.toBeNull();
    await provC.from("menus").update({ status: "published" }).eq("id", menu);
    const { data: up } = await provC.from("menu_items").select("id").eq("menu_id", menu).single();
    const pick = [{ item_id: (up as { id: string }).id, qty: 30 }];
    const { data: s1, error: e1 } = await orgC.rpc("save_catering_selection", { p_item: item, p_menu: menu, p_guests: 30, p_items: pick, p_dietary: { vegan: 3 }, p_style: "plated", p_service_at: at(day, 19), p_staffing: "", p_equipment: "", p_notes: "", p_submit: true, p_accept_change: false });
    expect(e1).toBeNull();
    // 30 guests is below the 40 minimum → priced at 40 × 45 + 30 × 12 = 1800 + 360.
    expect(s1).toMatchObject({ saved: true, price: { total: 2160 } });
    await db.from("catering_selections").update({ status: "confirmed" }).eq("build_item_id", item);
    const { data: s2 } = await orgC.rpc("save_catering_selection", { p_item: item, p_menu: menu, p_guests: 90, p_items: pick, p_dietary: {}, p_style: "plated", p_service_at: at(day, 19), p_staffing: "", p_equipment: "", p_notes: "", p_submit: true, p_accept_change: false });
    expect(s2).toMatchObject({ needs_confirmation: true, previous_total: 2160, new_total: 4410, difference: 2250 });
    expect(((await db.from("catering_selections").select("guest_count").eq("build_item_id", item).single()).data as { guest_count: number }).guest_count).toBe(30);
    const { data: s3 } = await orgC.rpc("save_catering_selection", { p_item: item, p_menu: menu, p_guests: 90, p_items: pick, p_dietary: {}, p_style: "plated", p_service_at: at(day, 19), p_staffing: "", p_equipment: "", p_notes: "", p_submit: true, p_accept_change: true });
    expect(s3).toMatchObject({ saved: true });
  });

  test("§65 bar packages: models, licensing record, publish-gated visibility; jurisdiction rules configurable", async () => {
    const { data: rules } = await outC.from("bar_jurisdiction_rules").select("country,region,min_age").eq("country", "GB");
    expect((rules ?? []).length).toBeGreaterThanOrEqual(3);
    const { data: bp, error } = await provC.from("bar_packages").insert({ workspace_id: ws, listing_id: venue, name: "Hosted bar", model: "hosted_bar", min_spend: 1500, hours_from: "18:00", hours_to: "23:30",
      licensing: { provided_by: "venue", licence_ref: "PL-12345", min_age: 18 } }).select("id").single();
    expect(error).toBeNull();
    expect((await outC.from("bar_packages").select("id").eq("id", (bp as { id: string }).id)).data).toEqual([]);
    expect((await provC.from("bar_packages").insert({ workspace_id: ws, name: "Nope", model: "free_for_all" })).error).not.toBeNull();
  });
});
