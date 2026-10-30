import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Lane D · B1 (D4 backend gaps): migrations 202610294039 (set_composition_binding) and 202610294040 (retire_waiver_draft,
// delete_promotion_blackout, dispose_found_item, archive_event_template_family, licence_clear_expiry + licence_save rule),
// called with the exact payloads the organiser screens send. API level, disposable identities, no browser, no payments, no email.
const db = admin as unknown as SupabaseClient;
const date = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const at = (days: number) => new Date(Date.now() + days * 864e5).toISOString();
const one = async <T = { id: string }>(q: PromiseLike<{ data: unknown; error: unknown }>) => { const r = await q; if (r.error) throw r.error; return r.data as T; };
const err = async (q: PromiseLike<{ error: { message: string } | null }>) => (await q).error?.message ?? "";

test.describe.configure({ mode: "serial" });
test.describe("D4 B1 organiser gap commands", () => {
  let org: { id: string; email: string }, mem: { id: string; email: string }, out: { id: string; email: string };
  let orgC: SupabaseClient, memC: SupabaseClient, outC: SupabaseClient;
  let W: string, X: string, P: string, venue: string, hall: string, pod: string, E: string;

  test.beforeAll(async () => {
    [org, mem, out] = await Promise.all([createUser("b1-org"), createUser("b1-mem"), createUser("b1-out")]);
    [W, X, P] = await Promise.all([seedWorkspace(org.id, "organizer", "B1 Organiser"), seedWorkspace(out.id, "organizer", "B1 Other"), seedWorkspace(org.id, "provider", "B1 Venue Co")]);
    await db.from("workspace_members").insert({ workspace_id: W, user_id: mem.id, role: "member", status: "active" });
    venue = (await one(db.from("listings").insert({ workspace_id: P, name: "B1 Test Venue", kind: "venue", category: "venue", published: true }).select("id").single())).id;
    hall = (await one(db.from("spaces").insert({ workspace_id: P, venue_id: venue, name: "B1 Hall", capacity_standing: 300 }).select("id").single())).id;
    pod = (await one(db.from("spaces").insert({ workspace_id: P, venue_id: venue, name: "B1 Pod", capacity_standing: 50 }).select("id").single())).id;
    E = (await one(db.from("events").insert({ owner_id: org.id, workspace_id: W, name: "B1 Weekender", event_type: "festival", visibility: "private", status: "draft", city: "Leeds",
      starts_at: `${date(40)}T09:00:00Z`, ends_at: `${date(41)}T23:00:00Z`, timezone: "Europe/London", venue_listing_id: venue }).select("id").single())).id;
    [orgC, memC, outC] = await Promise.all([org, mem, out].map(u => signedIn(u.email))) as unknown as SupabaseClient[];
  });
  test.afterAll(async () => {
    await db.from("promotion_blackouts").delete().eq("workspace_id", W);
    await db.from("event_templates").delete().eq("workspace_id", W);
    await db.from("events").delete().eq("workspace_id", W);
    await db.from("waiver_templates").delete().eq("workspace_id", W);
    await db.from("spaces").delete().eq("venue_id", venue);
    await db.from("listings").delete().eq("id", venue);
    await db.from("workspaces").delete().in("id", [W, X, P]);
    await cleanup();
  });

  test("bind / unbind tiers, programme and shifts to days, rooms and venues — guards and permissions", async () => {
    expect(await err(orgC.rpc("set_event_days", { p_event: E, p_days: [{ date: date(40), label: "Sat", start_time: "10:00", end_time: "23:00" }, { date: date(41), label: "Sun", start_time: "10:00", end_time: "22:00" }] }))).toBe("");
    expect(await err(orgC.rpc("set_event_venues", { p_event: E, p_venues: [{ venue_name: "B1 Test Venue", role: "primary", listing_id: venue }, { venue_name: "Car park", role: "satellite" }] }))).toBe("");
    const days = (await orgC.from("event_days").select("id,starts_at,ends_at").eq("event_id", E).order("day_date")).data as { id: string; starts_at: string; ends_at: string }[];
    const venues = (await orgC.from("event_venues").select("id,role").eq("event_id", E).order("sort")).data as { id: string }[];
    const [ga, vip, big, sold] = await Promise.all([["GA", 40], ["VIP", 20], ["Big", 280], ["Sold", 10]].map(([name, q]) =>
      one(db.from("ticket_tiers").insert({ event_id: E, name, kind: "general", price: 10, quantity: q }).select("id").single())));
    await db.from("ticket_tiers").update({ sold: 1 }).eq("id", sold!.id);
    const [talk, clash, early] = await Promise.all([[`${date(40)}T12:00:00Z`, "Talk"], [`${date(40)}T12:30:00Z`, "Clash"], [`${date(40)}T07:00:00Z`, "Too early"]].map(([s, title]) =>
      one(db.from("programme_items").insert({ event_id: E, title, kind: "programme", starts_at: s, duration_minutes: 60 }).select("id").single())));
    const [gate, build] = await Promise.all([[`${date(40)}T11:00:00Z`, `${date(40)}T19:00:00Z`], [`${date(30)}T08:00:00Z`, `${date(30)}T16:00:00Z`]].map(([s, e]) =>
      one(db.from("shifts").insert({ workspace_id: W, event_id: E, role: "steward", title: "Gate", starts_at: s, ends_at: e, headcount: 2 }).select("id").single())));

    // Ticket tier: day + room + venue (window defaults to the day), refusals, unbind.
    const r = (await orgC.rpc("set_composition_binding", { p_kind: "ticket_tier", p_id: ga!.id, p_binding: { event_day_id: days[0]!.id, space_id: pod, valid_venue_ids: [venues[0]!.id] } })).data as { valid_from: string; space_id: string };
    expect(new Date(r.valid_from).toISOString()).toBe(new Date(days[0]!.starts_at).toISOString()); expect(r.space_id).toBe(pod);
    expect(await err(orgC.rpc("set_composition_binding", { p_kind: "ticket_tier", p_id: vip!.id, p_binding: { event_day_id: days[0]!.id, space_id: pod } }))).toMatch(/room_capacity_exceeded/);
    expect(await err(orgC.rpc("set_composition_binding", { p_kind: "ticket_tier", p_id: sold!.id, p_binding: { event_day_id: days[1]!.id } }))).toMatch(/tier_has_sales/);
    expect(await err(orgC.rpc("set_composition_binding", { p_kind: "ticket_tier", p_id: vip!.id, p_binding: { valid_venue_ids: [randomUUID()] } }))).toMatch(/venue_not_in_event/);
    expect(await err(orgC.rpc("set_composition_binding", { p_kind: "ticket_tier", p_id: vip!.id, p_binding: { event_venue_id: venues[0]!.id } }))).toMatch(/invalid_binding/);
    expect(await err(memC.rpc("set_composition_binding", { p_kind: "ticket_tier", p_id: big!.id, p_binding: { space_id: hall } }))).toMatch(/not_authorized/);
    const u = (await orgC.rpc("set_composition_binding", { p_kind: "ticket_tier", p_id: ga!.id, p_binding: { event_day_id: null, space_id: null, valid_venue_ids: [] } })).data as Record<string, unknown>;
    expect(u).toMatchObject({ event_day_id: null, space_id: null, valid_venue_ids: null, valid_from: null, valid_to: null });

    // Programme: room clash and day window come from the existing guards; member (events.write) may bind.
    expect(await err(memC.rpc("set_composition_binding", { p_kind: "programme_item", p_id: talk!.id, p_binding: { event_day_id: days[0]!.id, space_id: hall } }))).toBe("");
    expect(await err(orgC.rpc("set_composition_binding", { p_kind: "programme_item", p_id: clash!.id, p_binding: { space_id: hall } }))).toMatch(/programme_overlap/);
    expect(await err(orgC.rpc("set_composition_binding", { p_kind: "programme_item", p_id: early!.id, p_binding: { event_day_id: days[0]!.id } }))).toMatch(/item_outside_day/);
    expect(await err(outC.rpc("set_composition_binding", { p_kind: "programme_item", p_id: talk!.id, p_binding: { space_id: null } }))).toMatch(/not_authorized/);
    expect((await db.from("programme_items").select("event_day_id,space_id").eq("id", talk!.id).single()).data).toEqual({ event_day_id: days[0]!.id, space_id: hall });

    // Shifts: day + room + venue, outside-day refusal, partial unbind.
    expect(await err(orgC.rpc("set_composition_binding", { p_kind: "shift", p_id: gate!.id, p_binding: { event_day_id: days[0]!.id, space_id: hall, event_venue_id: venues[1]!.id } }))).toBe("");
    expect(await err(orgC.rpc("set_composition_binding", { p_kind: "shift", p_id: build!.id, p_binding: { event_day_id: days[0]!.id } }))).toMatch(/shift_outside_day/);
    expect(((await orgC.rpc("set_composition_binding", { p_kind: "shift", p_id: gate!.id, p_binding: { event_venue_id: null } })).data as Record<string, unknown>)).toMatchObject({ event_day_id: days[0]!.id, event_venue_id: null });
    const audit = (await db.from("audit_events").select("id").eq("event", "event.composition_bound").eq("workspace_id", W)).data ?? [];
    expect(audit.length).toBeGreaterThanOrEqual(5);
  });

  test("retire a draft waiver: drafts only, owner/manager, audited", async () => {
    const d = (await orgC.rpc("save_waiver_template", { p_workspace: W, p_family: null, p_waiver: { title: "B1 climbing", body: "I understand climbing carries a risk of injury.", minors_allowed: false } })).data as { id: string; family_id: string };
    expect(await err(memC.rpc("retire_waiver_draft", { p_template: d.id, p_reason: null }))).toMatch(/not_authorized/);
    expect(await err(orgC.rpc("retire_waiver_draft", { p_template: d.id, p_reason: "Venue supplies its own" }))).toBe("");
    expect((await db.from("waiver_templates").select("status").eq("id", d.id).single()).data).toEqual({ status: "retired" });
    expect(await err(orgC.rpc("retire_waiver_draft", { p_template: d.id }))).toMatch(/waiver_not_draft/);
    const n = (await orgC.rpc("save_waiver_template", { p_workspace: W, p_family: d.family_id, p_waiver: { title: "B1 climbing v2", body: "I understand climbing carries a risk of injury." } })).data as { id: string; version: number };
    expect(n.version).toBe(2);
    expect(await err(orgC.rpc("publish_waiver_template", { p_template: n.id }))).toBe("");
    expect(await err(orgC.rpc("retire_waiver_draft", { p_template: n.id }))).toMatch(/waiver_not_draft/);
    expect((await db.from("audit_events").select("id").eq("event", "waiver.draft_retired").eq("workspace_id", W)).data).toHaveLength(1);
  });

  test("delete a promotion blackout: promotion permission, audited", async () => {
    const b = (await orgC.rpc("save_promotion_blackout", { p_workspace: W, p_starts: at(3), p_ends: at(4), p_reason: "B1 bank holiday", p_channel: "email" })).data as string;
    expect(await err(memC.rpc("delete_promotion_blackout", { p_blackout: b }))).toMatch(/not_authorized/);
    expect(await err(outC.rpc("delete_promotion_blackout", { p_blackout: b }))).toMatch(/not_authorized/);
    expect(await err(orgC.rpc("delete_promotion_blackout", { p_blackout: b }))).toBe("");
    expect((await db.from("promotion_blackouts").select("id").eq("id", b)).data).toHaveLength(0);
    expect(await err(orgC.rpc("delete_promotion_blackout", { p_blackout: b }))).toMatch(/not_authorized/);
    expect((await db.from("audit_events").select("metadata").eq("event", "promotion.blackout_deleted").eq("workspace_id", W).single()).data).toMatchObject({ metadata: { blackout_id: b, channel: "email" } });
  });

  test("dispose of a found item: after retention, reason required, claimed / returned refused", async () => {
    const old = (await orgC.rpc("log_found_item", { p_event: E, p_item: { category: "clothing", description: "Grey hoodie", found_at: at(-100), dispose_after: at(-10) } })).data as { id: string };
    expect(await err(orgC.rpc("dispose_found_item", { p_item: old.id, p_reason: "no", p_method: "donated" }))).toMatch(/reason_required/);
    expect(await err(orgC.rpc("dispose_found_item", { p_item: old.id, p_reason: "Unclaimed after 90 days", p_method: "burned" }))).toMatch(/invalid_method/);
    expect(await err(outC.rpc("dispose_found_item", { p_item: old.id, p_reason: "Unclaimed after 90 days", p_method: "donated" }))).toMatch(/not_authorized/);
    expect(await err(memC.rpc("dispose_found_item", { p_item: old.id, p_reason: "Unclaimed after 90 days", p_method: "donated" }))).toBe("");
    expect((await db.from("found_items").select("status,disposal_method,disposed_by").eq("id", old.id).single()).data).toEqual({ status: "disposed", disposal_method: "donated", disposed_by: mem.id });
    expect(await err(orgC.rpc("dispose_found_item", { p_item: old.id, p_reason: "Unclaimed after 90 days", p_method: "donated" }))).toMatch(/already_disposed/);
    const fresh = (await orgC.rpc("log_found_item", { p_event: E, p_item: { category: "phone", description: "Black phone cracked case", colour: "black" } })).data as { id: string };
    expect(await err(orgC.rpc("dispose_found_item", { p_item: fresh.id, p_reason: "Clearing the desk", p_method: "other" }))).toMatch(/retention_not_elapsed/);
    const rep = (await orgC.rpc("report_lost_item", { p_event: E, p_report: { category: "phone", description: "Black phone cracked", colour: "black", lost_from: at(-0.1), lost_to: at(0) } })).data as { id: string };
    const cl = (await orgC.rpc("claim_found_item", { p_report: rep.id, p_item: fresh.id, p_evidence: {} })).data as { id: string };
    expect(await err(orgC.rpc("dispose_found_item", { p_item: fresh.id, p_reason: "Clearing the desk", p_method: "other" }))).toMatch(/item_has_open_claim/);
    expect(await err(orgC.rpc("decide_lost_claim", { p_claim: cl.id, p_decision: "verified", p_note: "Lock screen matched" }))).toBe("");
    expect(await err(orgC.rpc("dispose_found_item", { p_item: fresh.id, p_reason: "Clearing the desk", p_method: "other" }))).toMatch(/item_claimed_or_returned/);
  });

  test("archive_event_template_family archives every version; archive_event_template unchanged", async () => {
    const v1 = (await orgC.rpc("save_event_template", { p_event: E, p_name: "B1 template", p_description: "", p_event_types: ["festival"], p_modules: { plan: true } })).data as { id: string; family_id: string };
    await orgC.rpc("save_event_template", { p_event: E, p_name: "B1 template v2", p_description: "", p_event_types: ["festival"], p_modules: { plan: true }, p_family: v1.family_id });
    expect(await err(outC.rpc("archive_event_template_family", { p_template: v1.id }))).toMatch(/not_authorized/);
    expect(((await orgC.rpc("archive_event_template_family", { p_template: v1.id })).data as { versions_archived: number }).versions_archived).toBe(2);
    expect(((await db.from("event_templates").select("status").eq("family_id", v1.family_id)).data ?? []).map(t => (t as { status: string }).status)).toEqual(["archived", "archived"]);
    const l1 = (await orgC.rpc("save_event_template", { p_event: E, p_name: "B1 legacy", p_description: "", p_event_types: ["festival"], p_modules: { plan: true } })).data as { id: string; family_id: string };
    await orgC.rpc("save_event_template", { p_event: E, p_name: "B1 legacy v2", p_description: "", p_event_types: ["festival"], p_modules: { plan: true }, p_family: l1.family_id });
    expect(await err(orgC.rpc("archive_event_template", { p_template: l1.id }))).toBe("");
    expect(((await db.from("event_templates").select("status,version").eq("family_id", l1.family_id).order("version")).data ?? []).map(t => (t as { status: string }).status)).toEqual(["superseded", "archived"]);
  });

  test("licence expiry: explicit clear, refused for granted expiring types (also via licence_save)", async () => {
    const ten = (await orgC.rpc("licence_save", { p_event: E, p: { licence_type: "ten", reference: "TEN-B1", valid_to: at(60) }, p_id: null })).data as { id: string };
    expect(await err(memC.rpc("licence_clear_expiry", { p_licence: ten.id, p_reason: null }))).toMatch(/not_authorized/);
    expect(((await orgC.rpc("licence_clear_expiry", { p_licence: ten.id, p_reason: "Date not confirmed" })).data as { changed: boolean }).changed).toBe(true);
    expect((await db.from("event_licences").select("valid_to").eq("id", ten.id).single()).data).toEqual({ valid_to: null });
    expect(await err(orgC.rpc("licence_transition", { p_licence: ten.id, p_to: "granted", p_note: null, p: { reference: "TEN-B1", valid_to: at(60) } }))).toBe("");
    expect(await err(orgC.rpc("licence_clear_expiry", { p_licence: ten.id }))).toMatch(/valid_to_required/);
    expect(await err(orgC.rpc("licence_save", { p_event: E, p: { valid_to: "" }, p_id: ten.id }))).toMatch(/valid_to_required/);
    expect(await err(orgC.rpc("licence_save", { p_event: E, p: { authority: "Leeds City Council" }, p_id: ten.id }))).toBe("");
    const prem = (await orgC.rpc("licence_save", { p_event: E, p: { licence_type: "premises_licence", reference: "PL-1", valid_to: at(300) }, p_id: null })).data as { id: string };
    expect(await err(orgC.rpc("licence_transition", { p_licence: prem.id, p_to: "granted", p_note: null, p: { reference: "PL-1" } }))).toBe("");
    expect(((await orgC.rpc("licence_clear_expiry", { p_licence: prem.id })).data as { changed: boolean }).changed).toBe(true);
    expect((await db.from("audit_events").select("id").eq("event", "compliance.licence_expiry_cleared").eq("workspace_id", W)).data).toHaveLength(2);
  });

  test("new commands are not callable by anon", async () => {
    const acl = (await db.rpc("set_composition_binding", { p_kind: "nope", p_id: randomUUID(), p_binding: {} })).error?.message ?? "";
    expect(acl).toMatch(/invalid_kind/); // service role reaches it
    const anonC = anon() as unknown as SupabaseClient;
    for (const [fn, args] of [["set_composition_binding", { p_kind: "shift", p_id: randomUUID(), p_binding: {} }], ["retire_waiver_draft", { p_template: randomUUID() }], ["delete_promotion_blackout", { p_blackout: randomUUID() }],
      ["dispose_found_item", { p_item: randomUUID(), p_reason: "xxxxx" }], ["archive_event_template_family", { p_template: randomUUID() }], ["licence_clear_expiry", { p_licence: randomUUID() }]] as const) {
      expect(await err(anonC.rpc(fn, args)), fn).toMatch(/permission denied|not find|42501/i);
    }
  });
});
