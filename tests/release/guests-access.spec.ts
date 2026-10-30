import { createHash, randomBytes } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn, insertEventFixture } from "../phase1/helpers";

// Q18 Guests / Registration / Passes / Check-In (domains 64–68). API level with disposable identities: every rule is asserted
// through ordinary signed-in clients calling the database directly (no UI), so enforcement is independent of the UI.
// The service role is used for setup/teardown and for the two server-only token flows (RSVP link, public registration).
type Db = SupabaseClient;
type Id = { id: string };
const db = admin as unknown as Db;
const day = 864e5;
const iso = (ms: number) => new Date(ms).toISOString();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const rpc = <T = Record<string, unknown>>(c: Db, fn: string, args: Record<string, unknown>) => c.rpc(fn, args) as unknown as Promise<{ data: T; error: { message: string } | null }>;
type Scan = { result: string; reason: string; conflict: string | null };

test.describe.configure({ mode: "serial" });

test.describe("Q18 guests, registration, passes, check-in", () => {
  let owner: { id: string; email: string }, manager: { id: string; email: string }, member: { id: string; email: string }, finance: { id: string; email: string },
    door: { id: string; email: string }, outsider: { id: string; email: string };
  let ownerC: Db, managerC: Db, memberC: Db, financeC: Db, doorC: Db, outsiderC: Db;
  let ws: string, provWs: string, ev: string, kids: string, gaTier: string, vipTier: string;
  const events: string[] = [];
  const mkEvent = async (row: Record<string, unknown>) => {
    const { data, error } = await insertEventFixture({ owner_id: owner.id, workspace_id: ws, management: "professional", name: `Q18 ${randomBytes(3).toString("hex")}`, ...row }, "guests-access").select("id").single();
    if (error) throw error; events.push((data as Id).id); return (data as Id).id;
  };
  const ticket = async (tier: string, event = ev) => ((await db.from("tickets").insert({ event_id: event, tier_id: tier, code: `Q18-${randomBytes(5).toString("hex").toUpperCase()}`, order_ref: `Q18-${randomBytes(3).toString("hex")}`, attendee_name: "Ava Attendee", attendee_email: "ava@example.test", status: "valid" }).select("id,qr_nonce").single()).data as { id: string; qr_nonce: string });
  const scan = (c: Db, args: Record<string, unknown>) => rpc<Scan>(c, "scan_admission", { p_event: ev, p_zone: null, p_ticket: null, p_pass: null, p_code: null, p_nonce: null, p_credential: "manual", ...args });

  test.beforeAll(async () => {
    [owner, manager, member, finance, door, outsider] = await Promise.all(["q18-o", "q18-mg", "q18-m", "q18-f", "q18-d", "q18-x"].map(l => createUser(l)));
    ws = await seedWorkspace(owner.id, "organizer", "Q18 Events");
    provWs = await seedWorkspace(outsider.id, "provider", "Q18 Caterers");
    await db.from("workspace_members").insert([{ workspace_id: ws, user_id: manager.id, role: "manager" }, { workspace_id: ws, user_id: member.id, role: "member" }, { workspace_id: ws, user_id: finance.id, role: "finance" }]);
    ev = await mkEvent({ status: "on_sale", event_type: "gala", starts_at: iso(Date.now() + 2 * 36e5), capacity: 10, settings: { reentry: false, ticketed: true } });   // W11 (lane C 3025): gala ticketing is optional_off — fixture switches it on
    kids = await mkEvent({ status: "planning", event_type: "childrens_party", starts_at: iso(Date.now() + 10 * day) });
    gaTier = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "GA", price: 0, quantity: 100, status: "on_sale" }).select("id").single()).data as Id).id;
    vipTier = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "VIP", price: 0, quantity: 20, status: "on_sale" }).select("id").single()).data as Id).id;
    [ownerC, managerC, memberC, financeC, doorC, outsiderC] = (await Promise.all([owner, manager, member, finance, door, outsider].map(u => signedIn(u.email)))) as unknown as Db[];
  });
  test.afterAll(async () => {
    await db.from("events").delete().in("id", events);
    for (const w of [ws, provWs]) await db.from("workspaces").delete().eq("id", w);
    await cleanup();
  });

  test("RSVP by link: plus-ones within the allowance, re-answering never duplicates, server-only surface", async () => {
    const g = ((await db.from("guests").insert({ event_id: ev, name: "Grace Guest", email: "grace@example.test", status: "invited", plus_one: true, tickets: 2 }).select("id").single()).data as Id).id;
    const token = randomBytes(32).toString("base64url");
    expect((await rpc(outsiderC, "set_guest_rsvp_token", { p_guest: g, p_token_hash: sha(token) })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(memberC, "set_guest_rsvp_token", { p_guest: g, p_token_hash: sha(token) })).error).toBeNull();
    // guest_rsvp is service-only: neither anon nor signed-in clients can call it.
    expect((await rpc(anon() as unknown as Db, "guest_rsvp", { p_token_hash: sha(token), p_response: "confirmed" })).error).not.toBeNull();
    expect((await rpc(outsiderC, "guest_rsvp", { p_token_hash: sha(token), p_response: "confirmed" })).error).not.toBeNull();
    expect((await rpc(db, "guest_rsvp", { p_token_hash: sha("wrong"), p_response: "confirmed" })).data).toMatchObject({ ok: false, error: "not_found" });
    expect((await rpc(db, "guest_rsvp", { p_token_hash: sha(token), p_response: "confirmed", p_plus_ones: [{ name: "A" }, { name: "B" }] })).data).toMatchObject({ ok: false, error: "too_many_plus_ones", allowed: 1 });
    expect((await rpc(db, "guest_rsvp", { p_token_hash: sha(token), p_response: "confirmed", p_plus_ones: [{ name: "Pat Plus" }], p_care: { dietary: "Vegan" } })).data).toMatchObject({ ok: true, plus_ones: 1 });
    expect((await rpc(db, "guest_rsvp", { p_token_hash: sha(token), p_response: "confirmed", p_plus_ones: [{ name: "Pat Plus" }] })).data).toMatchObject({ ok: true, plus_ones: 1 });
    const rows = ((await db.from("guests").select("name,status,plus_one_of").eq("event_id", ev).or(`id.eq.${g},plus_one_of.eq.${g}`)).data ?? []) as { name: string; status: string; plus_one_of: string | null }[];
    expect(rows.map(r => [r.name, r.status]).sort()).toEqual([["Grace Guest", "confirmed"], ["Pat Plus", "confirmed"]]);
    expect((await rpc(db, "guest_rsvp", { p_token_hash: sha(token), p_response: "declined" })).data).toMatchObject({ ok: true, plus_ones: 0 });
    expect(((await db.from("guests").select("id").eq("plus_one_of", g)).data ?? []).length).toBe(0);
  });

  test("care data: owner/manager only, providers get counts; children's events minimise data; legacy dietary mirrored", async () => {
    const g = ((await db.from("guests").insert({ event_id: ev, name: "Dee Diet", status: "confirmed", dietary: "Gluten free" }).select("id").single()).data as Id).id;
    await db.from("guest_care").update({ allergies: "Peanuts", accessibility: "Wheelchair user", access_flags: ["step_free"] }).eq("guest_id", g);
    expect(((await ownerC.from("guest_care").select("dietary,allergies").eq("guest_id", g)).data ?? [])[0]).toMatchObject({ dietary: "Gluten free", allergies: "Peanuts" });
    expect(((await managerC.from("guest_care").select("dietary").eq("guest_id", g)).data ?? []).length).toBe(1);
    expect((await memberC.from("guest_care").select("dietary").eq("guest_id", g)).data).toEqual([]);
    expect((await financeC.from("guest_care").select("dietary").eq("guest_id", g)).data).toEqual([]);
    expect((await outsiderC.from("guest_care").select("dietary").eq("guest_id", g)).data).toEqual([]);
    expect((await memberC.from("guest_care").update({ dietary: "x" }).eq("guest_id", g).select("guest_id")).data ?? []).toEqual([]);
    // A booked caterer gets numbers, never names.
    const listing = ((await db.from("listings").insert({ workspace_id: provWs, name: "Q18 Kitchen", kind: "service", category: "catering", published: false }).select("id").single()).data as Id).id;
    await db.from("build_items").insert({ event_id: ev, listing_id: listing, category: "catering", title: "Dinner", status: "confirmed" });
    const summary = (await rpc<{ dietary: Record<string, number>; allergies: number; accessibility: number }>(outsiderC, "event_care_summary", { p_event: ev })).data;
    expect(summary.dietary["gluten free"]).toBe(1); expect(summary.allergies).toBe(1); expect(JSON.stringify(summary)).not.toContain("Dee");
    // Children's party: child guests carry no contact details; no free-text notes.
    const parent = ((await db.from("guests").insert({ event_id: kids, name: "Parent P", email: "parent@example.test" }).select("id").single()).data as Id).id;
    expect((await ownerC.from("guests").insert({ event_id: kids, name: "Kid K", is_child: true, email: "kid@example.test" } as never)).error?.message).toMatch(/child_contact_not_allowed/);
    const kid = ((await ownerC.from("guests").insert({ event_id: kids, name: "Kid K", is_child: true, guardian_id: parent } as never).select("id").single()).data as Id).id;
    expect((await ownerC.from("guest_care").insert({ guest_id: kid, event_id: kids, allergies: "Nuts", notes: "Takes medication X at 3pm" })).error?.message).toMatch(/notes_not_allowed_for_childrens_event/);
    expect((await ownerC.from("guest_care").insert({ guest_id: kid, event_id: kids, allergies: "Nuts" })).error).toBeNull();
    // Guardian must be an adult guest of the same event.
    expect((await ownerC.from("guests").insert({ event_id: kids, name: "Kid 2", is_child: true, guardian_id: kid } as never)).error?.message).toMatch(/guardian_invalid/);
  });

  test("households reserve seats with an expiry and never exceed the event capacity", async () => {
    const hold = (n: number) => ownerC.from("guest_groups").insert({ event_id: ev, kind: "household", name: `H${n}`, reserved_seats: n, hold_status: "held", hold_expires_at: iso(Date.now() + day) }).select("id").single();
    expect((await ownerC.from("guest_groups").insert({ event_id: ev, kind: "household", name: "No expiry", reserved_seats: 2, hold_status: "held" })).error?.message).toMatch(/hold_expiry_required/);
    const h6 = ((await hold(6)).data as Id).id;
    expect((await hold(5)).error?.message).toMatch(/household_capacity_exceeded/);   // capacity 10
    expect((await hold(4)).error).toBeNull();
    await ownerC.from("guest_groups").update({ hold_status: "released" }).eq("id", h6);
    expect((await hold(5)).error).toBeNull();
    expect((await outsiderC.from("guest_groups").select("id").eq("event_id", ev)).data).toEqual([]);
  });

  test("registration: versioned forms, validated answers, limits, approval decisions, private answers", async () => {
    const form = { title: "Gala RSVP", capacity: 2, per_email_limit: 1, approval_required: true, waitlist: true,
      fields: [{ key: "company", type: "text", required: true }, { key: "menu", type: "select", options: ["meat", "veg"], required: true }, { key: "allergy", type: "text", sensitive: true }] };
    expect((await rpc(outsiderC, "publish_registration_form", { p_event: ev, p_form: form })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(memberC, "publish_registration_form", { p_event: ev, p_form: { ...form, fields: [{ key: "Bad Key", type: "text" }] } })).error?.message).toMatch(/invalid_field_key/);
    const v1 = (await rpc<{ id: string; version: number }>(memberC, "publish_registration_form", { p_event: ev, p_form: form })).data;
    expect(v1.version).toBe(1);
    expect((await rpc(outsiderC, "submit_registration", { p_form: v1.id, p_name: "X", p_email: "x@example.test", p_answers: {} })).error).not.toBeNull();   // service-only
    const sub = (email: string, answers: Record<string, unknown>) => rpc<{ ok: boolean; id?: string; status?: string; error?: string; field?: string }>(db, "submit_registration", { p_form: v1.id, p_name: "Reg Person", p_email: email, p_answers: answers });
    expect((await sub("r1@example.test", { menu: "veg" })).data).toMatchObject({ ok: false, error: "required", field: "company" });
    expect((await sub("r1@example.test", { company: "Acme", menu: "fish" })).data).toMatchObject({ ok: false, error: "invalid_option" });
    const r1 = (await sub("r1@example.test", { company: "Acme", menu: "veg", allergy: "Sesame" })).data;
    expect(r1).toMatchObject({ ok: true, status: "pending_approval" });
    expect((await sub("R1@example.test", { company: "Acme", menu: "veg" })).data).toMatchObject({ ok: false, error: "limit_per_email" });
    expect((await sub("r2@example.test", { company: "B", menu: "meat" })).data).toMatchObject({ ok: true, status: "pending_approval" });
    expect((await sub("r3@example.test", { company: "C", menu: "meat" })).data).toMatchObject({ ok: true, status: "waitlisted" });   // capacity 2
    // Sensitive answers are stored apart and readable only by care roles.
    expect(((await memberC.from("registrations").select("answers").eq("id", r1.id!)).data ?? [])[0]).toEqual({ answers: { company: "Acme", menu: "veg" } });
    expect((await memberC.from("registration_private").select("answers").eq("registration_id", r1.id!)).data).toEqual([]);
    expect(((await ownerC.from("registration_private").select("answers").eq("registration_id", r1.id!)).data ?? [])[0]).toEqual({ answers: { allergy: "Sesame" } });
    // Approval creates a confirmed guest; decisions are audited; illegal transitions refused by the machine.
    expect((await rpc(outsiderC, "decide_registration", { p_registration: r1.id, p_to: "approved" })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(managerC, "decide_registration", { p_registration: r1.id, p_to: "approved", p_reason: "Sponsor" })).error).toBeNull();
    const reg = (await db.from("registrations").select("status,guest_id,decided_by").eq("id", r1.id!).single()).data as { status: string; guest_id: string; decided_by: string };
    expect(reg).toMatchObject({ status: "approved", decided_by: manager.id });
    expect(((await db.from("guests").select("status").eq("id", reg.guest_id).single()).data as { status: string }).status).toBe("confirmed");
    expect((await rpc(managerC, "decide_registration", { p_registration: r1.id, p_to: "waitlisted" })).error?.message).toMatch(/illegal registration transition/);
    expect((await db.from("registrations").update({ status: "submitted" }).eq("id", r1.id!)).error?.message).toMatch(/illegal registration transition/);
    // Published form versions are immutable; a new version supersedes.
    expect((await db.from("registration_forms").update({ fields: [] }).eq("id", v1.id)).error?.message).toMatch(/published_form_immutable/);
    expect((await rpc<{ version: number }>(ownerC, "publish_registration_form", { p_event: ev, p_form: { ...form, capacity: 3 } })).data.version).toBe(2);
    expect((await sub("r4@example.test", { company: "D", menu: "veg" })).data).toMatchObject({ ok: false, error: "form_closed" });
  });

  test("exit gate: zone and session access is enforced at scan time, server-side, for every client", async () => {
    const vip = (await rpc<{ id: string }>(ownerC, "save_access_zone", { p_event: ev, p_zone: { name: "VIP Lounge", kind: "vip", reentry: "limited", max_entries: 2 } })).data.id;
    const general = (await rpc<{ id: string }>(ownerC, "save_access_zone", { p_event: ev, p_zone: { name: "Main Floor", kind: "general", reentry: "deny" } })).data.id;
    const closed = (await rpc<{ id: string }>(ownerC, "save_access_zone", { p_event: ev, p_zone: { name: "Late Bar", kind: "general", opens_at: iso(Date.now() + 5 * 36e5) } })).data.id;
    const otherEv = await mkEvent({ status: "planning" });
    const foreignTier = ((await db.from("ticket_tiers").insert({ event_id: otherEv, name: "X", price: 0, quantity: 1 }).select("id").single()).data as Id).id;
    expect((await rpc(ownerC, "set_zone_rules", { p_zone: vip, p_rules: [{ tier_id: foreignTier }] })).error?.message).toMatch(/tier_not_in_event/);
    expect((await rpc(memberC, "set_zone_rules", { p_zone: vip, p_rules: [{ tier_id: vipTier }, { pass_type: "artist" }] })).error).toBeNull();
    // Direct writes to zones/rules are refused (commands only).
    expect((await ownerC.from("access_rules").insert({ event_id: ev, zone_id: vip, tier_id: gaTier })).error).not.toBeNull();
    const ga = await ticket(gaTier), vt = await ticket(vipTier);
    expect((await scan(memberC, { p_zone: vip, p_ticket: ga.id, p_nonce: ga.qr_nonce })).data).toMatchObject({ result: "wrong_zone" });
    expect((await scan(memberC, { p_zone: vip, p_ticket: vt.id, p_nonce: vt.qr_nonce })).data).toMatchObject({ result: "admitted" });
    expect((await scan(memberC, { p_zone: vip, p_ticket: vt.id, p_nonce: vt.qr_nonce })).data).toMatchObject({ result: "readmitted" });
    expect((await scan(memberC, { p_zone: vip, p_ticket: vt.id, p_nonce: vt.qr_nonce })).data).toMatchObject({ result: "reentry_denied" });   // max 2 entries
    expect((await scan(memberC, { p_zone: general, p_ticket: ga.id, p_nonce: ga.qr_nonce })).data).toMatchObject({ result: "admitted" });      // general zone, no rules = all tickets
    expect((await scan(memberC, { p_zone: general, p_ticket: ga.id, p_nonce: ga.qr_nonce })).data).toMatchObject({ result: "duplicate" });     // re-entry denied zone
    expect((await scan(memberC, { p_zone: closed, p_ticket: vt.id, p_nonce: vt.qr_nonce })).data).toMatchObject({ result: "outside_window" });
    // Session window on the tier (day ticket for tomorrow).
    const day2 = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "Day 2", price: 0, quantity: 10, status: "on_sale", valid_from: iso(Date.now() + day), valid_to: iso(Date.now() + 2 * day) }).select("id").single()).data as Id).id;
    const d2 = await ticket(day2);
    expect((await scan(memberC, { p_ticket: d2.id, p_nonce: d2.qr_nonce })).data).toMatchObject({ result: "wrong_session" });
    // A zone of another event can't be used to scan this event.
    const otherZone = (await rpc<{ id: string }>(ownerC, "save_access_zone", { p_event: otherEv, p_zone: { name: "Elsewhere" } })).data.id;
    expect((await scan(memberC, { p_zone: otherZone, p_ticket: vt.id })).error?.message).toMatch(/zone_not_in_event/);
  });

  test("scanner permission is role- and event-scoped: finance and outsiders refused, door staff zone-limited", async () => {
    const back = (await rpc<{ id: string }>(ownerC, "save_access_zone", { p_event: ev, p_zone: { name: "Backstage", kind: "backstage" } })).data.id;
    const front = (await rpc<{ id: string }>(ownerC, "save_access_zone", { p_event: ev, p_zone: { name: "Front Door", kind: "general" } })).data.id;
    const t = await ticket(gaTier);
    expect((await scan(financeC, { p_ticket: t.id })).error?.message).toMatch(/not_authorized/);
    expect((await scan(outsiderC, { p_ticket: t.id })).error?.message).toMatch(/not_authorized/);
    expect((await scan(doorC, { p_ticket: t.id, p_zone: front })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(memberC, "assign_event_scanner", { p_event: ev, p_user: door.id, p_zones: [front] })).error).toBeNull();
    expect((await scan(doorC, { p_ticket: t.id, p_zone: back })).error?.message).toMatch(/not_authorized/);    // not their zone
    expect((await scan(doorC, { p_ticket: t.id })).error?.message).toMatch(/not_authorized/);                  // zone-limited: no main gate
    expect((await scan(doorC, { p_ticket: t.id, p_zone: front, p_nonce: t.qr_nonce })).data).toMatchObject({ result: "admitted" });
    // Door staff see admission data only: no ticket table rows, no guest care, masked emails in lookup.
    expect((await doorC.from("tickets").select("id").eq("id", t.id)).data).toEqual([]);
    expect((await doorC.from("guest_care").select("guest_id").eq("event_id", ev)).data).toEqual([]);
    expect((await rpc(doorC, "scan_lookup", { p_event: ev, p_query: "Ava" })).error?.message ?? "").toBe("");   // zone-limited scanners can't use event-wide lookup → empty
    await rpc(memberC, "assign_event_scanner", { p_event: ev, p_user: door.id, p_zones: [] });
    const look = ((await rpc<{ email: string }[]>(doorC, "scan_lookup", { p_event: ev, p_query: "Ava" })).data ?? []) as { email: string }[];
    expect(look.length).toBeGreaterThan(0); expect(look[0]!.email).toBe("a***@example.test");
    expect((await rpc(memberC, "revoke_event_scanner", { p_event: ev, p_user: door.id })).error).toBeNull();
    expect((await scan(doorC, { p_ticket: t.id, p_zone: front })).error?.message).toMatch(/not_authorized/);
    // Guest-list check-in (no ticket), duplicate refused.
    const g = ((await db.from("guests").insert({ event_id: ev, name: "List Guest", status: "confirmed" }).select("id").single()).data as Id).id;
    expect((await rpc(memberC, "check_in_guest", { p_event: ev, p_guest: g })).data).toMatchObject({ result: "admitted" });
    expect((await rpc(memberC, "check_in_guest", { p_event: ev, p_guest: g })).data).toMatchObject({ result: "duplicate" });
    // The canonical read model shows attendee and guest-list check-ins together.
    const cv = ((await memberC.from("checkins").select("subject_kind,status").eq("event_id", ev)).data ?? []) as { subject_kind: string; status: string }[];
    expect(cv.some(x => x.subject_kind === "guest" && x.status === "admitted")).toBe(true);
    expect(cv.some(x => x.subject_kind === "ticket")).toBe(true);
    expect((await outsiderC.from("checkins").select("id").eq("event_id", ev)).data).toEqual([]);
  });

  test("passes and badges: zone grants, revocation kills the badge, print audit, templates exclude private fields", async () => {
    const stage = (await rpc<{ id: string }>(ownerC, "save_access_zone", { p_event: ev, p_zone: { name: "Stage", kind: "artist" } })).data.id;
    const vip = ((await db.from("access_zones").select("id").eq("event_id", ev).eq("name", "VIP Lounge").single()).data as Id).id;
    expect((await rpc(memberC, "save_badge_template", { p_event: ev, p_name: "Crew", p_layout: { fields: ["name", "email"] }, p_pass_types: ["staff"] })).error?.message).toMatch(/private_fields_not_allowed/);
    const tpl = (await rpc<{ id: string }>(memberC, "save_badge_template", { p_event: ev, p_name: "Artist", p_layout: { fields: ["name", "pass_type", "zones", "qr"] }, p_pass_types: ["artist"] })).data.id;
    const p = (await rpc<{ id: string; code: string }>(memberC, "issue_access_pass", { p_event: ev, p_pass_type: "artist", p_holder_name: "DJ Nova", p_zones: [stage], p_badge_template: tpl })).data;
    const nonce = ((await db.from("access_passes").select("nonce").eq("id", p.id).single()).data as { nonce: string }).nonce;
    expect((await scan(memberC, { p_zone: stage, p_pass: p.id, p_nonce: nonce, p_credential: "pass" })).data).toMatchObject({ result: "admitted" });
    expect((await scan(memberC, { p_zone: vip, p_pass: p.id, p_nonce: nonce, p_credential: "pass" })).data).toMatchObject({ result: "admitted" });   // VIP rule grants artist passes
    expect((await scan(memberC, { p_code: p.code })).data).toMatchObject({ result: "admitted" });    // manual pass code at the main gate
    expect((await rpc<{ printed_count: number }>(memberC, "record_badge_print", { p_pass: p.id })).data.printed_count).toBe(1);
    expect((await rpc(memberC, "revoke_access_pass", { p_pass: p.id, p_reason: "Lost badge" })).error).toBeNull();
    expect((await scan(memberC, { p_zone: stage, p_pass: p.id, p_nonce: nonce, p_credential: "pass" })).data).toMatchObject({ result: "revoked" });
    expect((await scan(memberC, { p_zone: stage, p_code: p.code })).data).toMatchObject({ result: "revoked" });
    expect((await rpc(memberC, "record_badge_print", { p_pass: p.id })).error?.message).toMatch(/pass_not_active/);
    expect(((await db.from("audit_events").select("event").contains("metadata", { pass_id: p.id })).data ?? []).map(x => (x as { event: string }).event).sort())
      .toEqual(["access.badge_printed", "access.pass_issued", "access.pass_revoked"]);
    expect((await outsiderC.from("access_passes").select("id").eq("id", p.id)).data).toEqual([]);
  });
});
