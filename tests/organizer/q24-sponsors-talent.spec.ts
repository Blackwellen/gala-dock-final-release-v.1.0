import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Q24 Sponsors / exhibitors / talent / riders (domains 150–153) — API-level, disposable identities, RLS-bound clients.
// Exit gate: records integrate with Plan (parties/packages/programme), Operations (readiness + conflicts), Map (booth = map element
// by reference), Passes (lane D access_passes via the pass-request interface) and Money (Q16 contracts, Q07 invoices by reference).
// Service role: fixtures only.
type U = { id: string; email: string };
type Id = { id: string };
type Item = { key: string; severity: string; domain: string };
const db = admin as unknown as SupabaseClient;
const as = async (u: U) => (await signedIn(u.email)) as unknown as SupabaseClient;
const H = 36e5, day = 864e5;
const iso = (ms: number) => new Date(ms).toISOString();
const rpc = async (c: SupabaseClient, fn: string, args: Record<string, unknown>) => { const r = await c.rpc(fn, args); if (r.error) throw new Error(`${fn}: ${r.error.message}`); return r.data as Record<string, unknown>; };
const items = async (c: SupabaseClient, ev: string) => ((await rpc(c, "event_ops_readiness", { p_event: ev })).items as Item[]);

test.describe.configure({ mode: "serial" });

test.describe("Q24 sponsors, exhibitors, talent & riders", () => {
  let O: U, M: U, X: U, T: U; let oc: SupabaseClient, mc: SupabaseClient, xc: SupabaseClient, tc: SupabaseClient;
  let W: string, XW: string, E: string, E2: string, MAP: string, ZONE: string, IT1: string, IT2: string, CL: string, INV: string, TP: string;
  let gold: string, shell: string, sponsor: string, exhibitor: string, artist: string, booth: string;
  const t0 = Date.now() + 10 * day;

  test.beforeAll(async () => {
    [O, M, X, T] = await Promise.all([createUser("q24-owner"), createUser("q24-member"), createUser("q24-other"), createUser("q24-talent")]);
    W = await seedWorkspace(O.id, "organizer", "Q24 Festivals");
    XW = await seedWorkspace(X.id, "organizer", "Q24 Other Co");
    await db.from("workspace_members").insert({ workspace_id: W, user_id: M.id, role: "member", status: "active" });
    E = ((await db.from("events").insert({ owner_id: O.id, workspace_id: W, management: "professional", name: "Q24 Festival", status: "planning", starts_at: iso(t0), ends_at: iso(t0 + 10 * H) }).select("id").single()).data as Id).id;
    E2 = ((await db.from("events").insert({ owner_id: O.id, workspace_id: W, management: "professional", name: "Q24 Club Night", status: "planning", starts_at: iso(t0), ends_at: iso(t0 + 8 * H) }).select("id").single()).data as Id).id;
    MAP = ((await db.from("venue_maps").insert({ event_id: E, version: 1, status: "draft", structure: { format: "plan-v2", elements: [{ id: "booth-A1", type: "booth" }, { id: "booth-A2", type: "booth" }] }, overlay: {} }).select("id").single()).data as Id).id;
    ZONE = ((await db.from("access_zones").insert({ event_id: E, name: "Expo hall", kind: "general" }).select("id").single()).data as Id).id;
    IT1 = ((await db.from("programme_items").insert({ event_id: E, starts_at: iso(t0 + 2 * H), duration_minutes: 60, title: "Headline set", kind: "programme", area: "Main stage" }).select("id").single()).data as Id).id;
    IT2 = ((await db.from("programme_items").insert({ event_id: E2, starts_at: iso(t0 + 2.5 * H), duration_minutes: 60, title: "Club set", kind: "programme", area: "Room 1" }).select("id").single()).data as Id).id;
    CL = ((await db.from("clients").insert({ workspace_id: W, name: "Q24 Sponsor Ltd" }).select("id").single()).data as Id).id;
    INV = ((await db.from("invoices").insert({ workspace_id: W, event_id: E, number: `Q24-${Date.now()}`, client_name: "Q24 Sponsor Ltd", total: 5000, status: "sent", due_date: iso(Date.now() - day).slice(0, 10) }).select("id").single()).data as Id).id;
    [oc, mc, xc, tc] = await Promise.all([as(O), as(M), as(X), as(T)]);
    TP = ((await oc.from("talent_profiles").insert({ workspace_id: W, kind: "dj", name: "DJ Nova" }).select("id").single()).data as Id).id;
  });
  test.afterAll(async () => {
    await db.from("events").delete().in("workspace_id", [W, XW]);
    await db.from("workspaces").delete().in("id", [W, XW]);
    await cleanup();
  });

  test("Plan: package allocation under lock, snapshot on confirmation, benefits → deliverables + pass requests, sold out refused", async () => {
    gold = (await rpc(oc, "package_save", { p_event: E, p: { kind: "sponsorship", name: "Gold", price: 5000, quantity: 1, benefits: [
      { kind: "logo_placement", title: "Logo on main stage", due_days_before: 5 }, { kind: "asset", title: "Vector logo", owed_by: "party", due_days_before: 14 },
      { kind: "passes", title: "VIP passes", quantity: 3, pass_type: "vip" }] } })).id as string;
    shell = (await rpc(oc, "package_save", { p_event: E, p: { kind: "exhibitor", name: "Shell 3×3", price: 800 } })).id as string;
    expect((await mc.rpc("package_save", { p_event: E, p: { kind: "sponsorship", name: "Member pkg" } })).error?.message).toMatch(/not_authorized/);
    expect((await xc.rpc("party_save", { p_event: E, p: { kind: "sponsor", name: "Intruder" } })).error?.message).toMatch(/not_authorized/);
    sponsor = (await rpc(oc, "party_save", { p_event: E, p: { kind: "sponsor", name: "Q24 Sponsor Ltd", client_id: CL, package_id: gold, contact_email: "sponsor@q24.test", contact_name: "Sam" } })).id as string;
    expect((await oc.rpc("party_save", { p_event: E, p: { kind: "artist", name: "Bad", package_id: gold } })).error?.message).toMatch(/package_not_available/);
    const stale = await rpc(oc, "party_save", { p_event: E, p: { notes: "x" }, p_id: sponsor, p_expected_version: 99 });
    expect(stale.conflict).toBe(true);
    expect((await oc.rpc("party_transition", { p_party: sponsor, p_to: "completed" })).error?.message).toMatch(/illegal event_party transition/);
    expect((await rpc(oc, "party_transition", { p_party: sponsor, p_to: "confirmed" })).to).toBe("confirmed");
    const p = (await db.from("event_parties").select("package_snapshot,status").eq("id", sponsor).single()).data as { package_snapshot: { name: string; price: number; benefits: unknown[] } };
    expect(p.package_snapshot.name).toBe("Gold"); expect(p.package_snapshot.benefits).toHaveLength(3);
    const dels = (await oc.from("event_party_deliverables").select("title,owed_by,due_at").eq("party_id", sponsor)).data as { title: string; owed_by: string; due_at: string }[];
    expect(dels.map(d => d.title).sort()).toEqual(["Logo on main stage", "Vector logo"]);
    expect(new Date(dels.find(d => d.title === "Vector logo")!.due_at).getTime()).toBeCloseTo(t0 - 14 * day, -4);
    expect(((await oc.from("event_party_pass_requests").select("pass_type,quantity").eq("party_id", sponsor)).data ?? [])).toEqual([{ pass_type: "vip", quantity: 3 }]);
    // Later package edits never rewrite the confirmed deal; the sell limit holds.
    await rpc(oc, "package_save", { p_event: E, p: { name: "Gold (2027)", price: 9000 }, p_id: gold });
    expect(((await db.from("event_parties").select("package_snapshot").eq("id", sponsor).single()).data as { package_snapshot: { price: number } }).package_snapshot.price).toBe(5000);
    const second = (await rpc(oc, "party_save", { p_event: E, p: { kind: "sponsor", name: "Late Gold", package_id: gold } })).id as string;
    expect((await oc.rpc("party_transition", { p_party: second, p_to: "confirmed" })).error?.message).toMatch(/package_sold_out/);
    const overview = await rpc(oc, "event_parties_overview", { p_event: E });
    expect((overview.packages as { name: string; allocated: number }[]).find(k => k.name === "Gold (2027)")!.allocated).toBe(1);
  });

  test("Map: booth binds a Q19 map element by reference; unknown element and double binding refused; allocation", async () => {
    exhibitor = (await rpc(oc, "party_save", { p_event: E, p: { kind: "exhibitor", name: "Q24 Gadgets", package_id: shell } })).id as string;
    await rpc(oc, "party_transition", { p_party: exhibitor, p_to: "confirmed" });
    expect((await items(oc, E)).some(i => i.key === "exhibitor_no_booth")).toBe(true);
    expect((await oc.rpc("booth_save", { p_event: E, p: { code: "Z9", venue_map_id: MAP, map_element_ref: "nope" } })).error?.message).toMatch(/map_element_not_found/);
    booth = (await rpc(oc, "booth_save", { p_event: E, p: { code: "A1", venue_map_id: MAP, map_element_ref: "booth-A1", zone_id: ZONE, package_id: shell } })).id as string;
    expect((await oc.rpc("booth_save", { p_event: E, p: { code: "A1b", venue_map_id: MAP, map_element_ref: "booth-A1" } })).error?.message).toMatch(/booth_map_conflict/);
    await rpc(oc, "booth_allocate", { p_booth: booth, p_party: exhibitor });
    expect((await oc.rpc("booth_allocate", { p_booth: booth, p_party: sponsor })).error?.message).toMatch(/booth_taken/);
    expect((await items(oc, E)).some(i => i.key === "exhibitor_no_booth")).toBe(false);
    expect(((await xc.from("exhibitor_booths").select("id").eq("event_id", E)).data ?? [])).toEqual([]);
  });

  test("Passes: requests issue real Q18 access passes (booth zone added), never over quantity", async () => {
    const req = ((await oc.from("event_party_pass_requests").select("id").eq("party_id", sponsor).single()).data as Id).id;
    const r = await rpc(oc, "party_issue_passes", { p_request: req, p_holders: [{ name: "Sam Sponsor", email: "sam@q24.test" }, { name: "Alex Guest" }] });
    expect(r.issued).toBe(2); expect(r.status).toBe("partially_issued");
    const passes = (await oc.from("access_passes").select("pass_type,holder_name").in("id", r.pass_ids as string[])).data as { pass_type: string }[];
    expect(passes.map(p => p.pass_type)).toEqual(["vip", "vip"]);
    expect((await oc.rpc("party_issue_passes", { p_request: req, p_holders: [{ name: "One" }, { name: "Two" }] })).error?.message).toMatch(/pass_quantity_exceeded/);
    const xr = (await rpc(oc, "pass_request_save", { p_party: exhibitor, p: { pass_type: "supplier", quantity: 2 } })).id as string;
    const x = await rpc(oc, "party_issue_passes", { p_request: xr, p_holders: [{ name: "Booth Staff" }] });
    const zones = ((await oc.from("access_passes").select("zones").eq("id", (x.pass_ids as string[])[0]).single()).data as { zones: string[] }).zones;
    expect(zones).toContain(ZONE);
  });

  test("Operations: talent schedule — confirmed double-booking refused, tentative overlap is a conflict on Home/Event; blackout refused", async () => {
    artist = (await rpc(oc, "party_save", { p_event: E, p: { kind: "artist", name: "DJ Nova", talent_profile_id: TP, fee: 1500, contact_email: T.email } })).id as string;
    await rpc(oc, "party_transition", { p_party: artist, p_to: "confirmed" });
    await rpc(oc, "party_slot_set", { p_party: artist, p_item: IT1, p_role: "headline", p_status: "confirmed" });
    const club = (await rpc(oc, "party_save", { p_event: E2, p: { kind: "artist", name: "DJ Nova", talent_profile_id: TP } })).id as string;
    expect((await oc.rpc("party_slot_set", { p_party: club, p_item: IT2, p_role: "headline", p_status: "confirmed" })).error?.message).toMatch(/talent_double_booked/);
    await rpc(oc, "party_slot_set", { p_party: club, p_item: IT2, p_role: "headline", p_status: "tentative" });
    const ev = (await oc.rpc("event_conflicts", { p_event: E })).data as { kind: string }[];
    expect(ev.some(c => c.kind === "ops_talent_double_booked")).toBe(true);
    const home = (await oc.rpc("operational_conflicts", { p_ws: W })).data as { kind: string }[];
    expect(home.some(c => c.kind === "ops_talent_double_booked")).toBe(true);
    await oc.from("talent_unavailability").insert({ workspace_id: W, talent_profile_id: TP, starts_at: iso(t0 + 2.5 * H), ends_at: iso(t0 + 5 * H) });
    expect((await oc.rpc("party_slot_set", { p_party: club, p_item: IT2, p_role: "headline", p_status: "confirmed" })).error?.message).toMatch(/talent_double_booked|talent_unavailable/);
    expect((await items(oc, E)).some(i => i.key === "talent_unavailable" && i.severity === "blocker")).toBe(true);
  });

  test("Riders: talent portal submits, organiser accepts → tasks; v2 carries fulfilment forward; immutable; portal sees only its own record", async () => {
    expect((await tc.rpc("rider_submit", { p_party: artist, p_kind: "technical", p_summary: "x", p_items: [{ category: "audio", description: "x" }] })).error?.message).toMatch(/not_authorized/);
    await rpc(oc, "party_link_portal_user", { p_party: artist, p_email: T.email });
    const r1 = (await rpc(tc, "rider_submit", { p_party: artist, p_kind: "technical", p_summary: "DJ setup", p_items: [
      { category: "backline", description: "CDJ-3000", quantity: 2 }, { category: "audio", description: "Booth monitors", quantity: 2 }, { category: "catering", description: "Water", required: false }] })).id as string;
    expect((await items(oc, E)).some(i => i.key === "rider_pending")).toBe(true);
    expect((await tc.rpc("rider_decide", { p_rider: r1, p_decision: "accepted" })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(oc, "rider_decide", { p_rider: r1, p_decision: "accepted", p_note: "ok" })).tasks).toBe(2);
    expect((await oc.rpc("rider_decide", { p_rider: r1, p_decision: "accepted" })).error?.message).toMatch(/rider_not_pending/);
    expect((await oc.from("tasks").select("id").eq("event_id", E).eq("category", "rider")).data).toHaveLength(2);
    expect((await items(oc, E)).filter(i => i.key === "rider_item_unmet")).toHaveLength(2);
    const cdj = ((await oc.from("talent_rider_items").select("id").eq("rider_id", r1).eq("description", "CDJ-3000").single()).data as Id).id;
    await rpc(oc, "rider_item_fulfil", { p_item: cdj, p_status: "confirmed", p_note: "house kit" });
    const r2 = (await rpc(tc, "rider_submit", { p_party: artist, p_kind: "technical", p_summary: "v2", p_items: [{ category: "backline", description: "CDJ-3000", quantity: 2 }, { category: "video", description: "Visuals screen" }] })).id as string;
    expect((await rpc(oc, "rider_decide", { p_rider: r2, p_decision: "accepted", p_note: "v2 ok" })).tasks).toBe(1);
    expect(((await oc.from("talent_riders").select("status").eq("id", r1).single()).data as { status: string }).status).toBe("superseded");
    expect(((await oc.from("talent_rider_items").select("fulfilment_status").eq("rider_id", r2).eq("description", "CDJ-3000").single()).data as { fulfilment_status: string }).fulfilment_status).toBe("confirmed");
    expect((await db.from("talent_rider_items").update({ description: "rewritten" }).eq("rider_id", r2)).error?.message).toMatch(/rider_immutable/);
    // Scoped portal: own party only, not the sponsor; outsiders see nothing.
    const portal = (await tc.rpc("my_party_portal")).data as { id: string; riders: unknown[] }[];
    expect(portal.map(p => p.id)).toEqual([artist]);
    expect(((await tc.from("event_parties").select("id").eq("event_id", E)).data as Id[]).map(p => p.id)).toEqual([artist]);
    expect(((await tc.from("event_party_deliverables").select("id").eq("party_id", sponsor)).data ?? [])).toEqual([]);
    expect(((await xc.from("event_parties").select("id").eq("event_id", E)).data ?? [])).toEqual([]);
  });

  test("Deliverables: party submits evidence for what it owes, organiser approves; evidence required; overdue surfaces", async () => {
    await rpc(oc, "party_link_portal_user", { p_party: sponsor, p_email: T.email });
    const logo = ((await oc.from("event_party_deliverables").select("id").eq("party_id", sponsor).eq("title", "Vector logo").single()).data as Id).id;
    const placement = ((await oc.from("event_party_deliverables").select("id").eq("party_id", sponsor).eq("title", "Logo on main stage").single()).data as Id).id;
    expect((await tc.rpc("deliverable_transition", { p_deliverable: logo, p_to: "submitted" })).error?.message).toMatch(/evidence_required/);
    expect((await tc.rpc("deliverable_add_evidence", { p_deliverable: logo, p: { kind: "file", storage_path: `${W}/logos/evil.svg` } })).error?.message).toMatch(/invalid_storage_path/);
    await rpc(tc, "deliverable_add_evidence", { p_deliverable: logo, p: { kind: "file", storage_path: `${T.id}/logo.svg`, note: "vector" } });
    await rpc(tc, "deliverable_transition", { p_deliverable: logo, p_to: "submitted" });
    expect((await tc.rpc("deliverable_transition", { p_deliverable: logo, p_to: "approved" })).error?.message).toMatch(/not_authorized/);
    expect((await tc.rpc("deliverable_add_evidence", { p_deliverable: placement, p: { kind: "note", note: "x" } })).error?.message).toMatch(/not_authorized/);
    expect((await mc.rpc("deliverable_transition", { p_deliverable: logo, p_to: "approved" })).error?.message).toMatch(/not_authorized/);
    await rpc(oc, "deliverable_transition", { p_deliverable: logo, p_to: "approved", p_note: "Looks good" });
    await rpc(oc, "deliverable_save", { p_party: sponsor, p: { title: "Banner proof", due_at: iso(Date.now() - day), evidence_required: false } });
    expect((await items(oc, E)).some(i => i.key === "deliverable_overdue")).toBe(true);
  });

  test("Money: talent contract through Q16; unsigned paid party is a readiness item; invoice linked by reference, finance-only", async () => {
    const c = await rpc(oc, "party_create_contract", { p_party: artist, p_body: "Performance agreement" });
    const contract = (await db.from("contracts").select("status,value,event_id").eq("id", c.contract_id as string).single()).data as { status: string; value: number; event_id: string };
    expect(contract).toEqual({ status: "draft", value: 1500, event_id: E });
    expect(((await db.from("contract_parties").select("role").eq("contract_id", c.contract_id as string)).data as { role: string }[]).map(p => p.role).sort()).toEqual(["client", "organizer"]);
    expect((await oc.rpc("party_create_contract", { p_party: artist })).error?.message).toMatch(/contract_exists/);
    expect((await items(oc, E)).filter(i => i.key === "party_contract_unsigned").length).toBeGreaterThanOrEqual(2);
    await rpc(oc, "party_link_money", { p_party: sponsor, p_direction: "receivable", p_invoice: INV, p_note: "Gold" });
    expect((await oc.rpc("party_link_money", { p_party: sponsor, p_direction: "receivable", p_invoice: INV })).error?.message).toMatch(/money_already_linked/);
    const mine = ((await rpc(oc, "event_parties_overview", { p_event: E })).parties as { id: string; money: { receivable: number } | null }[]).find(p => p.id === sponsor)!;
    expect(Number(mine.money!.receivable)).toBe(5000);
    expect(((await rpc(mc, "event_parties_overview", { p_event: E })).parties as { id: string; money: unknown }[]).find(p => p.id === sponsor)!.money).toBeNull();
    expect(((await mc.from("event_party_money").select("id")).data ?? [])).toEqual([]);
    expect((await items(oc, E)).some(i => i.key === "party_invoice_overdue")).toBe(true);
    // Readiness picks the ops checks up through event_feasibility; the lifecycle hook returns only blockers.
    const readiness = (await oc.rpc("event_readiness", { p_event: E })).data as { feasibility: { key: string }[] };
    expect(readiness.feasibility.some(f => f.key === "talent_unavailable")).toBe(true);
    const lifecycle = (await oc.rpc("event_ops_blockers", { p_event: E, p_to: "published" })).data as { key: string; fix: string }[];
    expect(lifecycle.some(b => b.key === "ops_talent_unavailable" && b.fix.includes("/organizer/events/"))).toBe(true);
  });
});
