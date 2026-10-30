import { randomBytes, createHash, randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn, BASE, insertEventFixture } from "../phase1/helpers";
import { canTransition } from "../../src/lib/domain/state-machines";

// Q14 Event Core: canonical event lifecycle, duplicate-to-new-date, programme integrity, ended-events job, private guest links.
// Assertions use ordinary signed-in clients (RLS + definer permission checks); the service role is setup/teardown and the
// worker/server-only paths (complete_ended_events, event_guest_view) that run with it in production.
type Db = SupabaseClient;
type Id = { id: string };
const db = admin as unknown as Db;
const day = 864e5;
const iso = (ms: number) => new Date(ms).toISOString();
const rpc = <T = unknown>(c: Db, fn: string, args: Record<string, unknown>) => c.rpc(fn, args) as unknown as Promise<{ data: T; error: { message: string } | null }>;

test.describe.configure({ mode: "serial" });

test.describe("Q14 event core", () => {
  let owner: { id: string; email: string }, member: { id: string; email: string }, outsider: { id: string; email: string }, customer: { id: string; email: string };
  let ws: string, otherWs: string, provWs: string, venue: string, otherVenue: string, room: string, otherRoom: string;
  let ownerC: Db, memberC: Db, outsiderC: Db, customerC: Db;
  const events: string[] = [];
  const mkEvent = async (row: Record<string, unknown>) => {
    const { data, error } = await insertEventFixture({ owner_id: owner.id, workspace_id: ws, management: "professional", name: `Q14 ${randomBytes(3).toString("hex")}`, ...row }, "event-core").select("id").single();
    if (error) throw error;
    events.push((data as Id).id); return (data as Id).id;
  };

  test.beforeAll(async () => {
    [owner, member, outsider, customer] = await Promise.all([createUser("q14-o"), createUser("q14-m"), createUser("q14-x"), createUser("q14-c")]);
    ws = await seedWorkspace(owner.id, "organizer", "Q14 Events");
    otherWs = await seedWorkspace(outsider.id, "organizer", "Q14 Other");
    provWs = await seedWorkspace(outsider.id, "provider", "Q14 Venue Co");
    await db.from("workspace_members").insert({ workspace_id: ws, user_id: member.id, role: "member" });
    await db.from("workspaces").update({ payout_status: "active" }).eq("id", ws);
    venue = ((await db.from("listings").insert({ workspace_id: provWs, name: "Q14 Hall", kind: "venue", category: "event_hall", published: false }).select("id").single()).data as Id).id;
    otherVenue = ((await db.from("listings").insert({ workspace_id: provWs, name: "Q14 Barn", kind: "venue", category: "event_hall", published: false }).select("id").single()).data as Id).id;
    room = ((await db.from("spaces").insert({ workspace_id: provWs, venue_id: venue, name: "Main Hall", capacity_standing: 200, capacity_seated: 120 }).select("id").single()).data as Id).id;
    otherRoom = ((await db.from("spaces").insert({ workspace_id: provWs, venue_id: otherVenue, name: "Barn Loft", capacity_standing: 50 }).select("id").single()).data as Id).id;
    [ownerC, memberC, outsiderC, customerC] = (await Promise.all([owner, member, outsider, customer].map(u => signedIn(u.email)))) as unknown as Db[];
  });

  test.afterAll(async () => {
    const mine = ((await db.from("events").select("id").in("workspace_id", [ws, otherWs])).data ?? []) as Id[];
    await db.from("events").delete().in("id", [...new Set([...events, ...mine.map(e => e.id)])]);
    await db.from("spaces").delete().in("id", [room, otherRoom]);
    await db.from("listings").delete().in("id", [venue, otherVenue]);
    for (const w of [ws, otherWs, provWs]) await db.from("workspaces").delete().eq("id", w);
    await cleanup();
  });

  test("duplicate requires a new date + confirmation, shifts programme/tasks/tiers and scrubs copied data", async () => {
    const start = Date.parse("2027-01-15T18:00:00Z");
    const src = await mkEvent({ event_type: "concert", status: "on_sale", visibility: "public", slug: `q14-${randomBytes(3).toString("hex")}`, starts_at: iso(start), ends_at: iso(start + 5 * 36e5), capacity: 300,
      venue_listing_id: venue, venue_name: "Q14 Hall", client_name: "Acme", settings: { venue_confirmed: true, invite_token: "secret-token", ticketing_live: true, public_page: { details: true }, reentry: false, demo: true, readiness: { score: 90 }, permits: ["PRM-1"], insurance_ref: "INS-9" } });
    await db.from("programme_items").insert([
      { event_id: src, kind: "programme", title: "Doors", area: "Main Hall", starts_at: iso(start), duration_minutes: 60, status: "done" },
      { event_id: src, kind: "programme", title: "Headliner", area: "Main Hall", starts_at: iso(start + 2 * 36e5), duration_minutes: 90, status: "upcoming" },
      { event_id: src, kind: "run_sheet", title: "Crew call", area: "Back of house", starts_at: iso(start - 3 * 36e5), duration_minutes: 30, status: "upcoming" },
    ]);
    await db.from("tasks").insert({ event_id: src, workspace_id: ws, owner_id: owner.id, title: "Book security", category: "risk", due_at: iso(start - 14 * day), status: "done", assignee_name: "Jo Bloggs" });
    const tier = ((await db.from("ticket_tiers").insert({ event_id: src, name: "GA", price: 20, quantity: 100, sold: 40, status: "on_sale", sale_start: iso(start - 30 * day), sale_end: iso(start) }).select("id").single()).data as Id).id;
    await db.from("guests").insert({ event_id: src, name: "Private Guest", email: "guest@example.test" });
    await db.from("build_items").insert({ event_id: src, category: "photography", title: "Photographer hold", status: "held" });
    await db.from("tickets").insert({ event_id: src, tier_id: tier, code: `Q14-${randomBytes(4).toString("hex")}`, order_ref: `Q14-${randomBytes(3).toString("hex")}`, status: "valid" } as never);

    const args = { p_source: src, p_starts_local: "2027-03-10T19:00", p_timezone: "Europe/London", p_confirm: true, p_name: null, p_request_id: randomUUID() };
    expect((await rpc(ownerC, "duplicate_event", { ...args, p_confirm: false })).error?.message).toMatch(/confirmation_required/);
    expect((await rpc(ownerC, "duplicate_event", { ...args, p_starts_local: "2020-01-01T10:00" })).error?.message).toMatch(/new_date_in_past/);
    expect((await rpc(ownerC, "duplicate_event", { ...args, p_timezone: "Mars/Olympus" })).error?.message).toMatch(/invalid_timezone/);
    expect((await rpc(outsiderC, "duplicate_event", args)).error?.message).toMatch(/not_authorized/);

    const r = await rpc<{ id: string; shift_seconds: number; copied: { tiers: number; programme: number; tasks: number } }>(memberC, "duplicate_event", args);
    expect(r.error).toBeNull();
    const copy = r.data.id; events.push(copy);
    const newStart = Date.parse("2027-03-10T19:00:00Z"); // GMT in March before the clocks change
    expect(r.data.shift_seconds).toBe((newStart - start) / 1000);
    expect(r.data.copied).toEqual({ tiers: 1, programme: 3, tasks: 1, dependencies: 0 });
    // Same request id → same copy (no double copies from a double click).
    expect((await rpc<{ id: string }>(memberC, "duplicate_event", args)).data.id).toBe(copy);

    const { data: e } = await ownerC.from("events").select("*").eq("id", copy).single();
    expect(e).toMatchObject({ status: "draft", visibility: "private", slug: null, timezone: "Europe/London", owner_id: member.id, workspace_id: ws, capacity: 300 });
    expect(Date.parse(e.starts_at)).toBe(newStart);
    expect(Date.parse(e.ends_at)).toBe(newStart + 5 * 36e5);
    expect(e.settings.public_page).toEqual({ details: true });
    expect(e.settings.reentry).toBe(false);
    for (const k of ["venue_confirmed", "invite_token", "ticketing_live", "demo", "readiness", "permits", "insurance_ref"]) expect(e.settings, k).not.toHaveProperty(k);
    expect(e.settings.duplicated_from).toBe(src);

    const prog = ((await ownerC.from("programme_items").select("title,kind,starts_at,status").eq("event_id", copy).order("starts_at")).data ?? []) as { title: string; starts_at: string; status: string }[];
    expect(prog.map(p => [p.title, Date.parse(p.starts_at) - newStart, p.status])).toEqual([["Crew call", -3 * 36e5, "upcoming"], ["Doors", 0, "upcoming"], ["Headliner", 2 * 36e5, "upcoming"]]);
    const tasks = ((await ownerC.from("tasks").select("title,due_at,status,assignee_name").eq("event_id", copy)).data ?? []) as { due_at: string; status: string; assignee_name: string }[];
    expect(tasks).toHaveLength(1);
    expect(Date.parse(tasks[0].due_at)).toBe(newStart - 14 * day);
    expect(tasks[0]).toMatchObject({ status: "todo", assignee_name: "" });
    const tiers = ((await ownerC.from("ticket_tiers").select("status,sold,held,sale_start").eq("event_id", copy)).data ?? []) as { status: string; sold: number; held: number; sale_start: string }[];
    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({ status: "draft", sold: 0, held: 0 });
    expect(Date.parse(tiers[0].sale_start)).toBe(newStart - 30 * day);
    for (const t of ["guests", "build_items", "tickets"]) expect((await db.from(t).select("id", { count: "exact", head: true }).eq("event_id", copy)).count, t).toBe(0);
    const audit = (await db.from("audit_events").select("event,actor_id").eq("event", "event.duplicated").eq("metadata->>event_id", copy)).data ?? [];
    expect(audit).toEqual([{ event: "event.duplicated", actor_id: member.id }]);
    expect((await db.from("domain_outbox" as never).select("event_type").eq("aggregate_id", copy).eq("event_type", "event.duplicated")).data).toHaveLength(1);
  });

  test("programme: one item per area/room at a time, room capacity, venue and booking links are enforced", async () => {
    const start = Date.now() + 40 * day;
    const ev = await mkEvent({ status: "planning", starts_at: iso(start), venue_listing_id: venue });
    const add = (row: Record<string, unknown>) => ownerC.from("programme_items").insert({ event_id: ev, kind: "programme", duration_minutes: 60, ...row }).select("id,area").single();
    expect((await add({ title: "Keynote", area: "Main Hall", starts_at: iso(start) })).error).toBeNull();
    const clash = await add({ title: "Panel", area: " main hall ", starts_at: iso(start + 30 * 6e4) });
    expect(clash.error?.message).toMatch(/programme_overlap: "Keynote" already runs in Main Hall/);
    expect((await add({ title: "Workshop", area: "Studio B", starts_at: iso(start + 30 * 6e4) })).error).toBeNull(); // another room: fine
    expect((await add({ title: "Lunch", area: "Main Hall", starts_at: iso(start + 60 * 6e4) })).error).toBeNull(); // back-to-back: fine
    expect((await ownerC.from("programme_items").insert({ event_id: ev, kind: "run_sheet", title: "Crew brief", area: "Main Hall", starts_at: iso(start), duration_minutes: 30 })).error).toBeNull(); // run sheet not a stage schedule
    // Moving an existing item into a clash is rejected too.
    const later = (await add({ title: "Closing", area: "Main Hall", starts_at: iso(start + 4 * 36e5) })).data as { id: string };
    expect((await ownerC.from("programme_items").update({ starts_at: iso(start + 15 * 6e4) }).eq("id", later.id)).error?.message).toMatch(/programme_overlap/);

    // Rooms: at this venue only, area defaults to the room name, audience within capacity, room clash detected by space too.
    const r1 = await add({ title: "Awards", space_id: room, expected_attendance: 180, starts_at: iso(start + 6 * 36e5) });
    expect(r1.error).toBeNull(); expect(r1.data?.area).toBe("Main Hall");
    expect((await add({ title: "Too big", space_id: room, expected_attendance: 250, starts_at: iso(start + 9 * 36e5) })).error?.message).toMatch(/room_capacity_exceeded: 250 expected but Main Hall holds 200/);
    expect((await add({ title: "Wrong venue", space_id: otherRoom, starts_at: iso(start + 9 * 36e5) })).error?.message).toMatch(/space_not_at_event_venue/);
    expect((await add({ title: "Same room", area: "Somewhere", space_id: room, starts_at: iso(start + 6.5 * 36e5) })).error?.message).toMatch(/programme_overlap/);
    expect(((await rpc<{ id: string }[]>(ownerC, "event_spaces", { p_event: ev })).data ?? []).map(s => s.id)).toEqual([room]);
    expect((await rpc<unknown[]>(outsiderC, "event_spaces", { p_event: ev })).data ?? []).toEqual([]);

    // Acts link to this event's supplier bookings only.
    const mine = ((await db.from("build_items").insert({ event_id: ev, category: "entertainment", title: "DJ booking", status: "confirmed" }).select("id").single()).data as Id).id;
    const other = await mkEvent({ status: "planning" });
    const theirs = ((await db.from("build_items").insert({ event_id: other, category: "entertainment", title: "Band", status: "confirmed" }).select("id").single()).data as Id).id;
    expect((await add({ title: "DJ set", area: "Terrace", segment: "act", build_item_id: mine, starts_at: iso(start) })).error).toBeNull();
    expect((await add({ title: "Band set", area: "Garden", segment: "act", build_item_id: theirs, starts_at: iso(start) })).error?.message).toMatch(/booking_not_on_event/);
    // Outsiders cannot write another tenant's programme at all.
    expect((await outsiderC.from("programme_items").insert({ event_id: ev, kind: "programme", title: "x", area: "Q", starts_at: iso(start + 20 * 36e5), duration_minutes: 30 }).select("id")).error).not.toBeNull();
  });

  test("lifecycle: illegal transitions are rejected for every caller; the command checks role, staleness and the admin restriction", async () => {
    expect(canTransition("event", "completed", "on_sale")).toBe(false);
    expect(canTransition("event", "draft", "planning")).toBe(true);
    const ev = await mkEvent({ status: "draft", starts_at: iso(Date.now() + 20 * day) });
    // Direct writes (even the service role) go through the enforce-mode guard.
    expect((await db.from("events").update({ status: "completed" }).eq("id", ev)).error?.message).toMatch(/illegal event transition draft -> completed/);
    expect((await ownerC.from("events").update({ status: "live" }).eq("id", ev)).error?.message).toMatch(/illegal event transition draft -> live/);
    expect((await ownerC.from("events").update({ status: "suspended" }).eq("id", ev)).error?.message).toMatch(/illegal event transition draft -> suspended/);
    // The command: illegal raises, stale expected returns a conflict, non-managers can't cancel, outsiders can't touch it.
    expect((await rpc(ownerC, "event_transition", { p_event: ev, p_to: "completed" })).error?.message).toMatch(/illegal event transition draft -> completed/);
    expect((await rpc(ownerC, "event_transition", { p_event: ev, p_to: "planning", p_expected: "ready" })).data).toEqual({ ok: false, conflict: true, current: "draft" });
    expect((await rpc(memberC, "event_transition", { p_event: ev, p_to: "cancelled" })).error?.message).toMatch(/owners and managers/);
    expect((await rpc(outsiderC, "event_transition", { p_event: ev, p_to: "planning" })).error?.message).toMatch(/not_authorized/);
    const ok = await rpc<{ ok: boolean; changed: boolean; event_id: string }>(memberC, "event_transition", { p_event: ev, p_to: "planning", p_expected: "draft", p_reason: "kick-off" });
    expect(ok.error).toBeNull(); expect(ok.data).toMatchObject({ ok: true, changed: true });
    const out = ((await db.from("domain_outbox" as never).select("event_type,payload").eq("aggregate_id", ev)).data ?? []) as { event_type: string; payload: { from: string; to: string } }[];
    expect(out.filter(o => o.event_type === "event.state_changed").map(o => `${o.payload.from}->${o.payload.to}`)).toEqual(["draft->planning"]); // one event, not two
    // Terminal: once archived nothing moves it back.
    expect((await rpc(ownerC, "event_transition", { p_event: ev, p_to: "archived" })).data).toMatchObject({ ok: true });
    expect((await db.from("events").update({ status: "planning" }).eq("id", ev)).error?.message).toMatch(/illegal event transition archived -> planning/);

    // An admin restriction can only be lifted by Gala Dock / the service role.
    const sold = await mkEvent({ status: "on_sale", visibility: "public", starts_at: iso(Date.now() + 20 * day) });
    expect((await db.from("events").update({ status: "suspended", settings: { admin_restriction: { previous_status: "on_sale", reason: "test" } } }).eq("id", sold)).error).toBeNull();
    expect((await ownerC.from("events").update({ status: "on_sale" }).eq("id", sold)).error?.message).toMatch(/event_restricted/);
    expect((await ownerC.from("events").update({ settings: {} }).eq("id", sold)).error?.message).toMatch(/event_restricted/);
    const lift = await rpc<{ ok: boolean; blockers: { key: string }[] }>(ownerC, "event_transition", { p_event: sold, p_to: "on_sale" });
    expect(lift.data.ok).toBe(false); expect(lift.data.blockers.map(b => b.key)).toContain("restricted");
    expect((await db.from("events").update({ status: "on_sale", settings: {} }).eq("id", sold)).error).toBeNull(); // reinstated by Gala Dock
  });

  test("publish / on-sale preconditions are computed server-side and adapt to the event type (GD-12)", async () => {
    // Event-type preconditions only: Q24–Q26 ops/compliance (ops_*) and Q19 map (map_*) gating since lane C 3019/3020 are covered in q26-licensing-safety.spec.ts.
    const blockers = async (ev: string, to: string) => ((await rpc<{ key: string }[]>(ownerC, "event_lifecycle_blockers", { p_event: ev, p_to: to })).data ?? []).map(b => b.key).filter(k => !/^(ops|map)_/.test(k)).sort();
    const bare = await mkEvent({ status: "planning", event_type: "custom" });
    expect(await blockers(bare, "published")).toEqual(["date", "venue"]);
    const t = await rpc<{ ok: boolean; error: string; blockers: { key: string }[] }>(ownerC, "event_transition", { p_event: bare, p_to: "published" });
    expect(t.data).toMatchObject({ ok: false, error: "preconditions" });
    expect((await db.from("events").select("status").eq("id", bare).single()).data).toEqual({ status: "planning" });

    const soon = iso(Date.now() + 30 * day);
    const concert = await mkEvent({ status: "planning", event_type: "concert", starts_at: soon, settings: { venue_confirmed: true } });
    expect(await blockers(concert, "published")).toEqual(["capacity", "end"]);
    const kids = await mkEvent({ status: "planning", event_type: "childrens_party", starts_at: soon, guest_count: 12, settings: { venue_confirmed: true } });
    expect(await blockers(kids, "ready")).toEqual([]);
    expect(await blockers(kids, "published")).toEqual(["public_listing"]);
    const webinar = await mkEvent({ status: "planning", event_type: "webinar", starts_at: soon, ends_at: iso(Date.now() + 30 * day + 36e5) });
    expect(await blockers(webinar, "published")).toEqual(["stream"]); // no venue needed online — a stream is
    await db.from("event_virtual").insert({ event_id: webinar, provider: "zoom", format: "webinar", join_url: "https://zoom.us/j/123" });
    expect(await blockers(webinar, "published")).toEqual([]);
    const festival = await mkEvent({ status: "ready", event_type: "festival", starts_at: soon, ends_at: iso(Date.now() + 32 * day), capacity: 5000, settings: { venue_confirmed: true } });
    expect(await blockers(festival, "published")).toEqual(["programme"]);
    const past = await mkEvent({ status: "ready", starts_at: iso(Date.now() - day), settings: { venue_confirmed: true } });
    expect(await blockers(past, "published")).toEqual(["date_past"]);

    // Happy path: published → on_sale needs a sellable tier; publishing makes the event public, audits and emits.
    const ok = await mkEvent({ status: "ready", event_type: "conference", starts_at: soon, ends_at: iso(Date.now() + 30 * day + 8 * 36e5), settings: { venue_confirmed: true } });
    await db.from("programme_items").insert({ event_id: ok, kind: "programme", title: "Opening", area: "Room 1", starts_at: soon, duration_minutes: 30 });
    expect((await rpc<{ ok: boolean }>(ownerC, "event_transition", { p_event: ok, p_to: "published", p_expected: "ready" })).data).toMatchObject({ ok: true });
    expect((await db.from("events").select("status,visibility").eq("id", ok).single()).data).toEqual({ status: "published", visibility: "public" });
    expect(await blockers(ok, "on_sale")).toEqual(["tickets"]);
    await db.from("ticket_tiers").insert({ event_id: ok, name: "Delegate", price: 99, quantity: 50, status: "on_sale" });
    expect((await rpc<{ ok: boolean }>(ownerC, "event_transition", { p_event: ok, p_to: "on_sale" })).data).toMatchObject({ ok: true });
    expect(((await db.from("audit_events").select("metadata").eq("event", "event.status_changed").eq("metadata->>event_id", ok)).data ?? []).map(a => (a.metadata as { to: string }).to).sort()).toEqual(["on_sale", "published"]);
  });

  test("ended-events job moves past events out of sale without touching paid tickets; future events and search follow", async () => {
    const ended = await mkEvent({ status: "on_sale", visibility: "public", starts_at: iso(Date.now() - 3 * day), ends_at: iso(Date.now() - 2 * day) });
    const noEnd = await mkEvent({ status: "live", visibility: "public", starts_at: iso(Date.now() - 2 * day) });
    const future = await mkEvent({ status: "on_sale", visibility: "public", starts_at: iso(Date.now() + 5 * day) });
    const draft = await mkEvent({ status: "planning", starts_at: iso(Date.now() - 5 * day) });
    const tier = ((await db.from("ticket_tiers").insert({ event_id: ended, name: "GA", price: 15, quantity: 10, sold: 1, status: "on_sale" }).select("id").single()).data as Id).id;
    await db.from("ticket_tiers").insert({ event_id: future, name: "GA", price: 15, quantity: 10, status: "on_sale" });
    const ticket = ((await db.from("tickets").insert({ event_id: ended, tier_id: tier, code: `Q14-${randomBytes(4).toString("hex")}`, order_ref: `Q14-${randomBytes(3).toString("hex")}`, status: "valid" } as never).select("id").single()).data as Id).id;
    expect((await db.from("search_documents").select("is_public").eq("doc_id", ended).single()).data).toEqual({ is_public: true });

    // Not callable by clients; the worker (db job runtime) or an operator runs it.
    expect((await rpc(ownerC, "complete_ended_events", {})).error).not.toBeNull();
    const r = await rpc<{ completed: number; ids: string[] }>(db, "complete_ended_events", {});
    expect(r.error).toBeNull();
    expect(r.data.ids).toEqual(expect.arrayContaining([ended, noEnd]));
    const st = Object.fromEntries((((await db.from("events").select("id,status").in("id", [ended, noEnd, future, draft])).data ?? []) as { id: string; status: string }[]).map(e => [e.id, e.status]));
    expect(st).toEqual({ [ended]: "completed", [noEnd]: "completed", [future]: "on_sale", [draft]: "planning" });
    expect((await db.from("ticket_tiers").select("status").eq("id", tier).single()).data).toEqual({ status: "paused" });
    expect((await db.from("tickets").select("status").eq("id", ticket).single()).data).toEqual({ status: "valid" });
    expect((await db.from("search_documents").select("is_public").eq("doc_id", ended).single()).data).toEqual({ is_public: false });
    expect((await anon().from("events").select("id").eq("id", ended)).data).toEqual([]); // out of the public projection (sitemap uses the same filter)
    const out = ((await db.from("domain_outbox" as never).select("event_type").eq("aggregate_id", ended)).data ?? []) as { event_type: string }[];
    expect(out.map(o => o.event_type).sort()).toEqual(["event.completed", "event.state_changed"]);
    // Idempotent: a second run finds nothing more for these events.
    expect(((await rpc<{ ids: string[] }>(db, "complete_ended_events", {})).data.ids)).not.toContain(ended);
    // Scheduled daily through the job queue.
    expect((await db.from("job_kinds" as never).select("runtime,handler").eq("kind", "events.complete_ended").single()).data).toEqual({ runtime: "db", handler: "public.job_events_complete_ended" });
  });

  test("private guest link: scoped to one event, guest-safe fields only, revocable and expiring; no anonymous RPC surface", async () => {
    const ev = await mkEvent({ status: "planning", visibility: "private", name: "Q14 Private Dinner", event_type: "birthday", starts_at: iso(Date.now() + 15 * day), venue_name: "Secret Garden", city: "London", budget_total: 9000, client_name: "VIP Client" });
    const other = await mkEvent({ status: "planning", visibility: "private", name: "Q14 Other Private" });
    await db.from("guests").insert({ event_id: ev, name: "Guest Person", email: "gp@example.test" });
    await db.from("programme_items").insert({ event_id: ev, kind: "programme", title: "Dinner", area: "Garden", starts_at: iso(Date.now() + 15 * day), duration_minutes: 90 });
    const token = randomBytes(32).toString("base64url"), hash = createHash("sha256").update(token).digest("hex");

    expect((await rpc(outsiderC, "create_event_guest_link", { p_event: ev, p_token_hash: hash })).error?.message).toMatch(/not_authorized/);
    const made = await rpc<{ id: string; expires_at: string }>(memberC, "create_event_guest_link", { p_event: ev, p_token_hash: hash, p_label: "Family" });
    expect(made.error).toBeNull();
    // Links are visible to the event team only.
    expect(((await ownerC.from("event_guest_links").select("id").eq("event_id", ev)).data ?? []).length).toBe(1);
    expect((await outsiderC.from("event_guest_links").select("id").eq("event_id", ev)).data).toEqual([]);
    expect((await (anon() as unknown as Db).from("event_guest_links").select("id")).data ?? []).toEqual([]);
    // The resolver is service-only: anonymous / signed-in clients cannot call it to probe tokens.
    expect((await rpc(anon() as unknown as Db, "event_guest_view", { p_token_hash: hash })).error).not.toBeNull();
    expect((await rpc(customerC, "event_guest_view", { p_token_hash: hash })).error).not.toBeNull();

    const view = (await rpc<Record<string, unknown> & { event: Record<string, unknown>; programme: unknown[] }>(db, "event_guest_view", { p_token_hash: hash })).data;
    expect(view.event).toMatchObject({ id: ev, name: "Q14 Private Dinner", venue_name: "Secret Garden" });
    expect(Object.keys(view).sort()).toEqual(["event", "host", "link", "programme"]);
    expect(JSON.stringify(view)).not.toMatch(/Guest Person|gp@example|9000|VIP Client|Q14 Other Private/);
    expect(view.programme).toHaveLength(1);
    expect((await rpc(db, "event_guest_view", { p_token_hash: createHash("sha256").update("wrong").digest("hex") })).data).toBeNull();

    // The real server route renders it without a session; an unknown token is a 404.
    const page = await fetch(`${BASE}/guest/${token}`, { signal: AbortSignal.timeout(90_000) });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Q14 Private Dinner");
    expect(html).not.toContain("Guest Person");
    expect((await fetch(`${BASE}/guest/${randomBytes(32).toString("base64url")}`, { signal: AbortSignal.timeout(90_000) })).status).toBe(404);

    // Expired and revoked links stop working immediately.
    await db.from("event_guest_links").update({ expires_at: iso(Date.now() - 10 * 60_000) }).eq("id", made.data.id);
    expect((await rpc(db, "event_guest_view", { p_token_hash: hash })).data).toBeNull();
    await db.from("event_guest_links").update({ expires_at: iso(Date.now() + day) }).eq("id", made.data.id);
    expect((await rpc(outsiderC, "revoke_event_guest_link", { p_link: made.data.id })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(ownerC, "revoke_event_guest_link", { p_link: made.data.id })).data).toEqual({ ok: true, changed: true });
    expect((await rpc(db, "event_guest_view", { p_token_hash: hash })).data).toBeNull();
    expect((await fetch(`${BASE}/guest/${token}`, { signal: AbortSignal.timeout(90_000) })).status).toBe(404);
    expect(other).toBeTruthy();
  });

  test("readiness: a booked provider's expired gating credential shows a compliance blocker to the organiser (Q08 finding)", async () => {
    const hall = ((await db.from("listings").insert({ workspace_id: provWs, name: "Q14 Compliance Hall", kind: "venue", category: "Event Hall", published: false }).select("id").single()).data as Id).id;
    try {
      const ev = await mkEvent({ status: "planning", starts_at: iso(Date.now() + 45 * day) });
      await db.from("build_items").insert({ event_id: ev, listing_id: hall, category: "venue", title: "Hall booking", status: "confirmed" });
      const doc = ((await db.from("provider_documents").insert({ workspace_id: provWs, credential_key: "public_liability", file_path: `${outsider.id}/${randomUUID()}.pdf`, status: "verified",
        expires_on: new Date(Date.now() + 200 * day).toISOString().slice(0, 10), cover_amount_minor: 200_000_000, cover_currency: "GBP" } as never).select("id").single()).data as Id).id;
      const compliance = async () => ((await rpc<{ domains: { key: string; state: string; reason: string }[] }>(ownerC, "event_readiness", { p_event: ev })).data.domains).find(d => d.key === "compliance")!;
      expect((await compliance()).state).toBe("ready"); // valid, sufficient cover
      await db.from("provider_documents").update({ expires_on: new Date(Date.now() - day).toISOString().slice(0, 10) } as never).eq("id", doc);
      const c = await compliance(); // the organiser is not a member of the provider workspace — the definer check still sees it
      expect(c.state).toBe("attention");
      expect(c.reason).toMatch(/1 booked provider\(s\) have required documents outstanding/);
    } finally {
      await db.from("provider_documents").delete().eq("workspace_id", provWs);
      await db.from("build_items").delete().eq("listing_id", hall);
      await db.from("listings").delete().eq("id", hall);
    }
  });

  test("exit gate: customer and organiser read the same canonical event through their own projections", async () => {
    const ev = await mkEvent({ status: "ready", event_type: "custom", name: "Q14 Canonical Night", starts_at: iso(Date.now() + 25 * day), venue_name: "Q14 Hall", budget_total: 12000, settings: { venue_confirmed: true } });
    // Before publication the customer can't see it at all.
    expect((await customerC.from("events").select("id").eq("id", ev)).data).toEqual([]);
    expect((await rpc<{ ok: boolean }>(ownerC, "event_transition", { p_event: ev, p_to: "published" })).data).toMatchObject({ ok: true });
    const org = (await ownerC.from("events").select("id,name,starts_at,status,budget_total,settings").eq("id", ev).single()).data as Record<string, unknown>;
    const cust = (await customerC.from("events").select("id,name,starts_at,status").eq("id", ev).single()).data as Record<string, unknown>;
    const pub = (await (anon() as unknown as Db).from("events").select("id,name,starts_at,status").eq("id", ev).single()).data as Record<string, unknown>;
    expect(cust).toEqual({ id: ev, name: org.name, starts_at: org.starts_at, status: "published" });
    expect(pub).toEqual(cust);
    expect(org.budget_total).toBe(12000); // the organiser's experience includes private planning fields on the same row
    // Edits made by the organiser are what the customer sees next (one record, no copies).
    await ownerC.from("events").update({ name: "Q14 Canonical Night II" }).eq("id", ev);
    expect(((await customerC.from("events").select("name").eq("id", ev).single()).data as { name: string }).name).toBe("Q14 Canonical Night II");
    // The customer cannot change it.
    await customerC.from("events").update({ name: "hijack" }).eq("id", ev);
    expect(((await db.from("events").select("name").eq("id", ev).single()).data as { name: string }).name).toBe("Q14 Canonical Night II");
    expect((await rpc(customerC, "event_transition", { p_event: ev, p_to: "on_sale" })).error?.message).toMatch(/not_authorized/);
  });

  // ── Q14 remainder: dependency graph (36), task dependencies/recurrence (42), templates (34), brief (39), customer duplicate ──
  test("dependencies: cycles rejected, hard prerequisites block completion and on-sale, graph + critical path + readiness", async () => {
    const start = Date.now() + 5 * day;
    const ev = await mkEvent({ status: "planning", event_type: "concert", starts_at: iso(start), ends_at: iso(start + 4 * 36e5) });
    const mk = async (title: string, due: number, milestone = false) => ((await db.from("tasks").insert({ event_id: ev, workspace_id: ws, owner_id: owner.id, title, due_at: iso(due), status: "todo", milestone }).select("id").single()).data as Id).id;
    const [a, b, c] = [await mk("Sign venue", start - 4 * day), await mk("Brief crew", start - 3 * day), await mk("Doors plan", start - 2 * day, true)];
    const tier = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "Q14 GA", price: 0, quantity: 50, status: "draft" }).select("id").single()).data as Id).id;
    const add = (c2: Db, dk: string, did: string, pk: string, pid: string | null, extra: Record<string, unknown> = {}) =>
      rpc<{ id: string }>(c2, "add_event_dependency", { p_event: ev, p_dependent_kind: dk, p_dependent_id: did, p_prerequisite_kind: pk, p_prerequisite_id: pid, ...extra });
    expect((await add(outsiderC, "task", b, "task", a)).error?.message).toMatch(/not_authorized/);
    expect((await add(memberC, "task", b, "task", a)).error).toBeNull();                  // b waits for a
    expect((await add(memberC, "milestone", c, "task", b)).error).toBeNull();             // c waits for b
    expect((await add(memberC, "task", a, "milestone", c)).error?.message).toMatch(/dependency_cycle/);   // a -> c -> b -> a
    expect((await add(memberC, "task", a, "task", a)).error).not.toBeNull();
    // Items from another event are refused.
    const other = await mkEvent({ status: "draft" });
    const foreign = ((await db.from("tasks").insert({ event_id: other, workspace_id: ws, owner_id: owner.id, title: "elsewhere", status: "todo" }).select("id").single()).data as Id).id;
    expect((await add(memberC, "task", b, "task", foreign)).error?.message).toMatch(/dependency_item_not_in_event/);
    // Tier release waits for the milestone.
    expect((await add(memberC, "ticket_tier", tier, "milestone", c)).error).toBeNull();
    // Hard dependency blocks completing b and putting the tier on sale — for every writer, service role included.
    expect((await ownerC.from("tasks").update({ status: "done" }).eq("id", b)).error?.message).toMatch(/blocked_by_dependencies/);
    expect((await db.from("ticket_tiers").update({ status: "on_sale" }).eq("id", tier)).error?.message).toMatch(/blocked_by_dependencies/);
    // Graph: critical path is the longest unmet chain tier -> c -> b -> a.
    expect((await rpc(customerC, "event_dependency_graph", { p_event: ev })).error?.message).toMatch(/not_authorized/);
    const graph = (await rpc<{ critical_path: string[]; blocked: { key: string; blocked_by: string[] }[] }>(memberC, "event_dependency_graph", { p_event: ev })).data;
    expect(graph.critical_path).toEqual([`ticket_tier:${tier}`, `task:${c}`, `task:${b}`, `task:${a}`]);
    expect(graph.blocked.find(x => x.key === `task:${b}`)?.blocked_by).toEqual([`task:${a}`]);
    // Readiness shows a Dependencies blocker (event within 7 days).
    const rd = (await rpc<{ domains: { key: string; state: string }[] }>(ownerC, "event_readiness", { p_event: ev })).data;
    expect(rd.domains.find(d => d.key === "dependencies")?.state).toBe("blocked");
    // Completing the chain in order unblocks everything.
    expect((await ownerC.from("tasks").update({ status: "done" }).eq("id", a)).error).toBeNull();
    expect((await ownerC.from("tasks").update({ status: "done" }).eq("id", b)).error).toBeNull();
    expect((await ownerC.from("tasks").update({ status: "done" }).eq("id", c)).error).toBeNull();
    expect((await db.from("ticket_tiers").update({ status: "on_sale" }).eq("id", tier)).error).toBeNull();
    const rd2 = (await rpc<{ domains: { key: string; state: string }[] }>(ownerC, "event_readiness", { p_event: ev })).data;
    expect(rd2.domains.find(d => d.key === "dependencies")?.state).toBe("ready");
    // Approval prerequisite: a persisted decision; members can't decide, owner can; history audited; outbox written.
    const t2 = await mk("Publish line-up", start - day);
    const ap = (await add(memberC, "task", t2, "approval", null, { p_note: "Owner signs off line-up" })).data.id;
    expect((await ownerC.from("tasks").update({ status: "done" }).eq("id", t2)).error?.message).toMatch(/blocked_by_dependencies/);
    expect((await rpc(memberC, "decide_event_dependency_approval", { p_dependency: ap, p_approve: true, p_reason: "ok" })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(ownerC, "decide_event_dependency_approval", { p_dependency: ap, p_approve: true, p_reason: "Looks good" })).error).toBeNull();
    expect((await rpc(ownerC, "decide_event_dependency_approval", { p_dependency: ap, p_approve: false })).error?.message).toMatch(/already_decided/);
    expect((await ownerC.from("tasks").update({ status: "done" }).eq("id", t2)).error).toBeNull();
    expect(((await db.from("audit_events").select("event").eq("event", "event.dependency_approval_decided").contains("metadata", { dependency_id: ap })).data ?? []).length).toBe(1);
    expect(((await db.from("domain_outbox" as never).select("event_type").eq("aggregate_id", ev).eq("event_type", "event.dependency_added")).data ?? []).length).toBeGreaterThanOrEqual(4);
    // Clients can't write edges directly (commands only).
    expect((await ownerC.from("event_dependencies").insert({ event_id: ev, dependent_kind: "task", dependent_id: a, prerequisite_kind: "venue" })).error).not.toBeNull();
    // set_task_dependencies replaces a task's task prerequisites.
    const t3 = await mk("Wrap", start - day / 2);
    expect((await rpc(memberC, "set_task_dependencies", { p_task: t3, p_prerequisites: [a, b] })).error).toBeNull();
    expect((await rpc(memberC, "set_task_dependencies", { p_task: t3, p_prerequisites: [b] })).error).toBeNull();
    expect(((await db.from("event_dependencies").select("prerequisite_id").eq("dependent_id", t3)).data ?? []).map(x => (x as { prerequisite_id: string }).prerequisite_id)).toEqual([b]);
  });

  test("recurring task: completing it creates the next occurrence once, until the event", async () => {
    const start = Date.now() + 20 * day;
    const ev = await mkEvent({ status: "planning", starts_at: iso(start) });
    const t = ((await db.from("tasks").insert({ event_id: ev, workspace_id: ws, owner_id: owner.id, title: "Weekly sync", due_at: iso(start - 10 * day), status: "todo", recurrence: "weekly" } as never).select("id").single()).data as Id).id;
    expect((await ownerC.from("tasks").update({ status: "done" }).eq("id", t)).error).toBeNull();
    const next = ((await db.from("tasks").select("id,due_at,status,recurrence_parent_id").eq("event_id", ev).eq("recurrence_parent_id", t)).data ?? []) as { id: string; due_at: string; status: string }[];
    expect(next).toHaveLength(1);
    expect(Date.parse(next[0]!.due_at)).toBe(start - 3 * day);
    // Re-opening and completing again does not duplicate the occurrence; the next one would be after the event -> none.
    await ownerC.from("tasks").update({ status: "todo" }).eq("id", t); await ownerC.from("tasks").update({ status: "done" }).eq("id", t);
    await ownerC.from("tasks").update({ status: "done" }).eq("id", next[0]!.id);
    expect(((await db.from("tasks").select("id").eq("event_id", ev)).data ?? []).length).toBe(2);
  });

  test("templates: save is allow-listed and versioned, create-from-template needs a date and keeps offsets, type-aware, scoped", async () => {
    const start = Date.parse("2027-02-01T19:00:00Z");
    const src = await mkEvent({ status: "planning", event_type: "conference", starts_at: iso(start), ends_at: iso(start + 8 * 36e5), capacity: 400, client_name: "Secret Client Ltd", budget_total: 50000,
      settings: { venue_confirmed: true, invite_token: "tok", budget_lines: { catering: 9000, av: 4000 }, reentry: true, admin_restriction: { by: "x" } } });
    await db.from("programme_items").insert({ event_id: src, kind: "programme", title: "Keynote", area: "Hall", starts_at: iso(start + 36e5), duration_minutes: 45, owner_name: "Dr Private Person" });
    const ta = ((await db.from("tasks").insert({ event_id: src, workspace_id: ws, owner_id: owner.id, title: "Book AV", category: "suppliers", due_at: iso(start - 20 * day), status: "done", assignee_name: "Jo" }).select("id").single()).data as Id).id;
    const tb = ((await db.from("tasks").insert({ event_id: src, workspace_id: ws, owner_id: owner.id, title: "Rehearsal", category: "operations", due_at: iso(start - day), status: "todo" }).select("id").single()).data as Id).id;
    await db.from("tasks").insert({ event_id: src, workspace_id: ws, owner_id: owner.id, title: "Risk assessment", category: "risk", due_at: iso(start - 7 * day), status: "todo" });
    await rpc(ownerC, "add_event_dependency", { p_event: src, p_dependent_kind: "task", p_dependent_id: tb, p_prerequisite_kind: "task", p_prerequisite_id: ta });
    await db.from("ticket_tiers").insert({ event_id: src, name: "Delegate", price: 120, quantity: 300, sold: 200, status: "on_sale", sale_start: iso(start - 60 * day), sale_end: iso(start - day) });
    await db.from("guests").insert({ event_id: src, name: "VIP Guest", email: "vip@example.test" });
    const mods = { plan: true, schedule: true, tickets: true, providers: false, promotion: false, staffing: false, risk: false };
    const save = (c2: Db, extra: Record<string, unknown> = {}) => rpc<{ id: string; family_id: string; version: number }>(c2, "save_event_template", { p_event: src, p_name: "Conf Std", p_description: "Standard", p_event_types: ["Conference"], p_modules: mods, ...extra });
    expect((await save(outsiderC)).error?.message).toMatch(/not_authorized/);
    expect((await save(memberC, { p_modules: { ...mods, guests: true } })).error?.message).toMatch(/invalid_module/);
    const v1 = (await save(memberC)).data;
    expect(v1.version).toBe(1);
    const row = (await ownerC.from("event_templates").select("content,event_type,status").eq("id", v1.id).single()).data as { content: Record<string, unknown>; event_type: string; status: string };
    expect(row.event_type).toBe("conference");
    const text = JSON.stringify(row.content);
    for (const leak of ["Secret Client", "vip@example", "VIP Guest", "invite_token", "admin_restriction", "Dr Private Person", "9000", "50000", "venue_confirmed", "\"sold\""]) expect(text).not.toContain(leak);
    expect(row.content.budget_categories).toEqual(["av", "catering"]);
    expect((row.content.tasks as { title: string }[]).map(t => t.title).sort()).toEqual(["Book AV", "Rehearsal"]);   // risk tasks only with the risk module
    // New version supersedes v1 (one active per family).
    const v2 = (await save(ownerC, { p_description: "v2", p_modules: { ...mods, risk: true }, p_family: v1.family_id })).data;
    expect(v2.version).toBe(2);
    expect(((await db.from("event_templates").select("status").eq("id", v1.id).single()).data as { status: string }).status).toBe("superseded");
    // Another workspace can't see or use it.
    expect((await outsiderC.from("event_templates").select("id").eq("id", v2.id)).data).toEqual([]);
    const fromArgs = { p_template: v2.id, p_workspace: ws, p_name: "Conf 2027b", p_starts_local: "2027-06-01T09:00", p_timezone: "Europe/London", p_request_id: randomUUID() };
    expect((await rpc(outsiderC, "create_event_from_template", { ...fromArgs, p_workspace: otherWs })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(memberC, "create_event_from_template", { ...fromArgs, p_starts_local: null })).error?.message).toMatch(/start_date_required/);
    expect((await rpc(memberC, "create_event_from_template", { ...fromArgs, p_starts_local: "2020-06-01T09:00" })).error?.message).toMatch(/start_in_past/);
    const made = (await rpc<{ id: string; copied: Record<string, number> }>(memberC, "create_event_from_template", fromArgs)).data;
    events.push(made.id);
    expect(made.copied).toEqual({ tiers: 1, programme: 1, tasks: 3, dependencies: 1 });
    expect((await rpc<{ id: string; replayed: boolean }>(memberC, "create_event_from_template", fromArgs)).data).toMatchObject({ id: made.id, replayed: true });
    const ne = (await db.from("events").select("event_type,status,visibility,starts_at,ends_at,client_name,budget_total,settings").eq("id", made.id).single()).data as Record<string, unknown> & { settings: Record<string, unknown> };
    const ns = Date.parse("2027-06-01T08:00:00Z"); // BST
    expect(ne).toMatchObject({ event_type: "conference", status: "draft", visibility: "private", client_name: "", budget_total: null });
    expect(Date.parse(ne.starts_at as string)).toBe(ns); expect(Date.parse(ne.ends_at as string)).toBe(ns + 8 * 36e5);
    expect(ne.settings.reentry).toBe(true); expect(ne.settings.invite_token).toBeUndefined(); expect(ne.settings.venue_confirmed).toBeUndefined();
    const prog = ((await db.from("programme_items").select("starts_at,owner_name").eq("event_id", made.id)).data ?? []) as { starts_at: string; owner_name: string }[];
    expect(Date.parse(prog[0]!.starts_at)).toBe(ns + 36e5); expect(prog[0]!.owner_name).toBe("");
    const tasks = ((await db.from("tasks").select("title,due_at,status,assignee_name").eq("event_id", made.id)).data ?? []) as { title: string; due_at: string; status: string; assignee_name: string }[];
    expect(Date.parse(tasks.find(t => t.title === "Book AV")!.due_at)).toBe(ns - 20 * day);
    expect(tasks.every(t => t.status === "todo" && t.assignee_name === "")).toBe(true);
    const tiers = ((await db.from("ticket_tiers").select("status,sold,sale_start").eq("event_id", made.id)).data ?? []) as { status: string; sold: number; sale_start: string }[];
    expect(tiers[0]).toMatchObject({ status: "draft", sold: 0 }); expect(Date.parse(tiers[0]!.sale_start)).toBe(ns - 60 * day);
    expect(((await db.from("guests").select("id").eq("event_id", made.id)).data ?? []).length).toBe(0);
    // Wizard path: apply to an existing dated draft, idempotent.
    const draft = await mkEvent({ status: "draft", starts_at: iso(Date.now() + 40 * day) });
    expect((await rpc(memberC, "apply_event_template", { p_event: draft, p_template: v2.id })).error).toBeNull();
    expect((await rpc<{ replayed: boolean }>(memberC, "apply_event_template", { p_event: draft, p_template: v2.id })).data).toMatchObject({ replayed: true });
    expect(((await db.from("tasks").select("id").eq("event_id", draft)).data ?? []).length).toBe(3);
    // Archive hides it from use.
    expect((await rpc(ownerC, "archive_event_template", { p_template: v2.id })).error).toBeNull();
    expect((await rpc(memberC, "create_event_from_template", { ...fromArgs, p_request_id: randomUUID() })).error?.message).toMatch(/not_authorized/);
  });

  test("brief: versioned with optimistic concurrency, team-only rows, booked providers get a scoped projection", async () => {
    const ev = await mkEvent({ status: "planning", event_type: "gala", starts_at: iso(Date.now() + 60 * day), client_name: "Hidden Client" });
    const brief = { goals: ["Raise 50k"], audience: { size: 250, profile: "Donors", names: ["Should Be Stripped"] }, budget_min: 20000, budget_max: 30000,
      supplier_needs: { catering: "3-course, 20 vegan", av: "2 screens" }, venue_needs: { capacity: 250 }, must_haves: ["Step-free access"], constraints: ["Curfew 23:30"],
      accessibility: { step_free: true }, success_measures: ["50k raised"], internal_notes: "Client is price sensitive" };
    expect((await rpc(outsiderC, "save_event_brief", { p_event: ev, p_brief: brief })).error?.message).toMatch(/not_authorized/);
    expect((await rpc<{ ok: boolean; version: number }>(memberC, "save_event_brief", { p_event: ev, p_brief: brief, p_expected_version: 0 })).data).toMatchObject({ ok: true, version: 1 });
    expect((await rpc(ownerC, "save_event_brief", { p_event: ev, p_brief: brief, p_expected_version: 0 })).data).toMatchObject({ ok: false, conflict: true, current: 1 });
    expect((await rpc(ownerC, "save_event_brief", { p_event: ev, p_brief: { ...brief, goals: [{ x: "y".repeat(2000) }] }, p_expected_version: 1 })).error?.message).toMatch(/invalid_brief/);
    expect((await rpc<{ version: number }>(ownerC, "save_event_brief", { p_event: ev, p_brief: { ...brief, goals: ["Raise 60k"] }, p_expected_version: 1 })).data.version).toBe(2);
    const rows = ((await memberC.from("event_briefs").select("version,is_current,audience").eq("event_id", ev).order("version")).data ?? []) as { version: number; is_current: boolean; audience: Record<string, unknown> }[];
    expect(rows.map(r => [r.version, r.is_current])).toEqual([[1, false], [2, true]]);
    expect(rows[1]!.audience.names).toBeUndefined();
    expect((await outsiderC.from("event_briefs").select("id").eq("event_id", ev)).data).toEqual([]);
    expect((await ownerC.from("event_briefs").insert({ event_id: ev, version: 9 })).error).not.toBeNull();
    // A booked caterer (outsider's provider workspace) sees only the scoped brief.
    const caterer = ((await db.from("listings").insert({ workspace_id: provWs, name: "Q14 Catering", kind: "service", category: "catering", published: false }).select("id").single()).data as Id).id;
    const item = ((await db.from("build_items").insert({ event_id: ev, listing_id: caterer, category: "catering", title: "Dinner", status: "confirmed" }).select("id").single()).data as Id).id;
    const pv = (await rpc<Record<string, unknown>>(outsiderC, "provider_event_brief", { p_build_item: item })).data;
    const pvText = JSON.stringify(pv);
    expect(pv.version).toBe(2); expect(pv.supplier_needs).toBe("3-course, 20 vegan");
    for (const leak of ["Hidden Client", "price sensitive", "20000", "30000", "2 screens", "Stripped"]) expect(pvText).not.toContain(leak);
    expect((await rpc(memberC, "provider_event_brief", { p_build_item: item })).error?.message).toMatch(/not_authorized/);
    await db.from("build_items").update({ status: "declined" }).eq("id", item);
    expect((await rpc(outsiderC, "provider_event_brief", { p_build_item: item })).error?.message).toMatch(/not_authorized/);
    // RFQ prefill by reference: budget only for money roles.
    const req = (await rpc<{ brief_version_id: string; needs: string; budget: unknown }>(ownerC, "event_brief_requirements", { p_event: ev, p_category: "catering" })).data;
    expect(req.needs).toBe("3-course, 20 vegan"); expect(req.budget).toMatchObject({ min: 20000, max: 30000 });
    expect((await rpc<{ budget: unknown }>(memberC, "event_brief_requirements", { p_event: ev, p_category: "catering" })).data.budget).toBeNull();
    await db.from("build_items").delete().eq("id", item); await db.from("listings").delete().eq("id", caterer);
  });

  test("customer duplicate goes through duplicate_event: date + confirmation required, scrubbed, owner only", async () => {
    const start = Date.now() + 30 * day;
    const { data } = await db.from("events").insert({ owner_id: customer.id, management: "consumer", name: "Q14 Birthday", event_type: "birthday", status: "planning", starts_at: iso(start), settings: { invite_token: "t", venue_confirmed: true } }).select("id").single();
    const src = (data as Id).id; events.push(src);
    await db.from("guests").insert({ event_id: src, name: "Aunt May", email: "may@example.test" });
    await db.from("tasks").insert({ event_id: src, owner_id: customer.id, title: "Order cake", due_at: iso(start - 2 * day), status: "done" });
    const args = { p_source: src, p_starts_local: "2027-08-08T15:00", p_timezone: "Europe/London", p_confirm: true, p_name: "Q14 Birthday 2", p_request_id: randomUUID() };
    expect((await rpc(customerC, "duplicate_event", { ...args, p_confirm: false })).error?.message).toMatch(/confirmation_required/);
    expect((await rpc(ownerC, "duplicate_event", args)).error?.message).toMatch(/not_authorized/);
    const r = (await rpc<{ id: string }>(customerC, "duplicate_event", args)).data; events.push(r.id);
    const ne = (await customerC.from("events").select("workspace_id,owner_id,status,visibility,settings").eq("id", r.id).single()).data as Record<string, unknown> & { settings: Record<string, unknown> };
    expect(ne).toMatchObject({ workspace_id: null, owner_id: customer.id, status: "draft", visibility: "private" });
    expect(ne.settings.invite_token).toBeUndefined(); expect(ne.settings.venue_confirmed).toBeUndefined();
    expect(((await db.from("guests").select("id").eq("event_id", r.id)).data ?? []).length).toBe(0);
    const t = ((await db.from("tasks").select("due_at,status").eq("event_id", r.id)).data ?? []) as { due_at: string; status: string }[];
    expect(t).toHaveLength(1); expect(t[0]!.status).toBe("todo"); expect(Date.parse(t[0]!.due_at)).toBe(Date.parse("2027-08-08T14:00:00Z") - 2 * day);
  });
});
