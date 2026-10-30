import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";
import { opsError } from "../../src/lib/ops/errors";
import { sessionCookies } from "../../scripts/lib/stripe-test-mode.mjs";

// Lane D S3 (W03 organiser UI): contracts the new screens depend on — API/DB level, disposable identities, RLS-bound clients.
//  * /portal/parties/[id]: login required (redirect with return path), scoped to the caller's own party (uniform not-found basis),
//    portal actions (evidence + submit on party-owed deliverables, rider submission) and refusals for other logins.
//  * Section read models by role: transport private details hidden from members; guest-care counts hidden from members;
//    compliance overview readable but not writable by members.
//  * Friendly error translation used by every section server action.
// Service role: fixtures only.
type U = { id: string; email: string };
type Id = { id: string };
const db = admin as unknown as SupabaseClient;
const as = async (u: U) => (await signedIn(u.email)) as unknown as SupabaseClient;
const day = 864e5, H = 36e5;
const iso = (ms: number) => new Date(ms).toISOString();
const rpc = async (c: SupabaseClient, fn: string, args: Record<string, unknown>) => { const r = await c.rpc(fn, args); if (r.error) throw new Error(`${fn}: ${r.error.message}`); return r.data as Record<string, unknown>; };

test.describe.configure({ mode: "serial" });

test.describe("D4 S3 — partners portal, logistics/compliance read models, error text", () => {
  let O: U, M: U, T: U, X: U; let oc: SupabaseClient, mc: SupabaseClient, tc: SupabaseClient, xc: SupabaseClient;
  let W: string, E: string, party: string, dParty: string, dOrg: string;
  const t0 = Date.now() + 12 * day;

  test.beforeAll(async () => {
    [O, M, T, X] = await Promise.all([createUser("s3-owner"), createUser("s3-member"), createUser("s3-talent"), createUser("s3-other")]);
    W = await seedWorkspace(O.id, "organizer", "S3 Ops Co");
    await db.from("workspace_members").insert({ workspace_id: W, user_id: M.id, role: "member", status: "active" });
    E = ((await db.from("events").insert({ owner_id: O.id, workspace_id: W, management: "professional", name: "S3 Outdoor Night", status: "planning", starts_at: iso(t0), ends_at: iso(t0 + 6 * H) }).select("id").single()).data as Id).id;
    [oc, mc, tc, xc] = await Promise.all([as(O), as(M), as(T), as(X)]);
  });
  test.afterAll(async () => {
    await db.from("events").delete().eq("workspace_id", W);
    await db.from("workspaces").delete().eq("id", W);
    await cleanup();
  });

  test("portal route requires a login and keeps the return path", async ({ request }) => {
    const r = await request.get(`${BASE}/portal/parties/00000000-0000-4000-8000-000000000000`, { maxRedirects: 0, timeout: 90_000 });
    expect([302, 303, 307, 308]).toContain(r.status());
    expect(r.headers()["location"] ?? "").toMatch(/\/login\?next=%2Fportal%2Fparties%2F00000000-0000-4000-8000-000000000000/);
  });

  test("party portal: own party only; party-owed evidence + submit; riders; other logins refused", async () => {
    party = (await rpc(oc, "party_save", { p_event: E, p: { kind: "artist", name: "S3 DJ", contact_email: T.email, fee: 900 } })).id as string;
    dParty = (await rpc(oc, "deliverable_save", { p_party: party, p: { title: "Press photo", owed_by: "party", evidence_required: true } })).id as string;
    dOrg = (await rpc(oc, "deliverable_save", { p_party: party, p: { title: "Stage mention", owed_by: "organizer" } })).id as string;
    // Members can read partners but not link portal access.
    expect((await mc.rpc("party_link_portal_user", { p_party: party, p_email: T.email })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(oc, "party_link_portal_user", { p_party: party, p_email: T.email })).linked).toBe(true);

    const mine = (await tc.rpc("my_party_portal")).data as { id: string; deliverables: { id: string }[] }[];
    expect(mine.map(p => p.id)).toEqual([party]);
    expect(mine[0]!.deliverables.map(d => d.id).sort()).toEqual([dParty, dOrg].sort());
    // Another login: nothing in its portal, the row is invisible (→ uniform 404), and writes are refused.
    expect((await xc.rpc("my_party_portal")).data).toEqual([]);
    expect((await xc.from("event_parties").select("id").eq("id", party)).data).toEqual([]);
    expect((await xc.rpc("deliverable_add_evidence", { p_deliverable: dParty, p: { kind: "url", url: "https://example.com/x.jpg" } })).error?.message).toMatch(/not_authorized/);

    // Party login: submit needs evidence first, then works; organiser-owed deliverables are not theirs to act on.
    expect((await tc.rpc("deliverable_transition", { p_deliverable: dParty, p_to: "submitted" })).error?.message).toMatch(/evidence_required/);
    await rpc(tc, "deliverable_add_evidence", { p_deliverable: dParty, p: { kind: "url", url: "https://example.com/press.jpg", note: "Hi-res" } });
    await rpc(tc, "deliverable_transition", { p_deliverable: dParty, p_to: "submitted" });
    expect((await tc.rpc("deliverable_add_evidence", { p_deliverable: dOrg, p: { kind: "note", note: "mine" } })).error?.message).toMatch(/not_authorized/);
    expect((await tc.rpc("deliverable_transition", { p_deliverable: dParty, p_to: "approved" })).error?.message).toMatch(/not_authorized/);
    const ev = (await tc.from("event_deliverable_evidence").select("deliverable_id,url").eq("deliverable_id", dParty)).data as { url: string }[];
    expect(ev.map(e => e.url)).toEqual(["https://example.com/press.jpg"]);

    const rd = await rpc(tc, "rider_submit", { p_party: party, p_kind: "technical", p_summary: "DJ setup", p_items: [{ category: "audio", description: "2 x CDJ-3000", quantity: 2 }] });
    expect(rd.version).toBe(1);
    expect((await tc.from("talent_rider_items").select("description").eq("rider_id", rd.id as string)).data).toEqual([{ description: "2 x CDJ-3000" }]);
    expect((await xc.rpc("rider_submit", { p_party: party, p_kind: "technical", p_summary: "x", p_items: [{ category: "audio", description: "x" }] })).error?.message).toMatch(/not_authorized/);
    // The organiser sees the waiting rider in the partner checks the section renders.
    const items = ((await rpc(oc, "event_ops_readiness", { p_event: E })).items as { key: string; domain: string }[]).filter(i => i.domain === "partners");
    expect(items.map(i => i.key)).not.toContain("rider_pending"); // party still a prospect → no check yet
    await rpc(oc, "party_transition", { p_party: party, p_to: "negotiating" });
    expect(((await rpc(oc, "event_ops_readiness", { p_event: E })).items as { key: string }[]).map(i => i.key)).toContain("rider_pending");
  });

  test("logistics: private transport details for managers only; members read the movement", async () => {
    await rpc(oc, "transport_save", { p_event: E, p: { kind: "talent", party_id: party, passengers: 1, from_place: "LHR T5", to_place: "Venue", departs_at: iso(t0 - 4 * H), arrives_at: iso(t0 - 3 * H),
      private: { passenger_names: "S3 DJ", flight_number: "BA123", contact_phone: "+44 7700 900000" } } });
    const own = (await rpc(oc, "event_logistics_overview", { p_event: E })).transport as { private: { flight_number: string } | null }[];
    expect(own[0]!.private?.flight_number).toBe("BA123");
    const mem = (await rpc(mc, "event_logistics_overview", { p_event: E })).transport as { private: unknown }[];
    expect(mem).toHaveLength(1); expect(mem[0]!.private).toBeNull();
    expect((await mc.from("transport_private").select("movement_id").eq("event_id", E)).data).toEqual([]);
    expect((await mc.rpc("transport_save", { p_event: E, p: { kind: "crew", departs_at: iso(t0), arrives_at: iso(t0 + H) } })).error?.message).toMatch(/not_authorized/);
    // The party's own portal login sees its movement through my_event_travel.
    expect(((await rpc(tc, "my_event_travel", { p_event: E })).my_transport as unknown[]).length).toBe(1);
  });

  test("compliance + accessibility: members read, managers write; guest-care counts are manager-only", async () => {
    expect((await mc.rpc("event_compliance_overview", { p_event: E })).error).toBeNull();
    expect((await mc.rpc("compliance_profile_save", { p_event: E, p: { outdoor: true } })).error?.message).toMatch(/not_authorized/);
    const facts = await rpc(oc, "compliance_profile_save", { p_event: E, p: { outdoor: true, alcohol: true, expected_attendance: "" } });
    expect(facts.outdoor).toBe(true); expect(facts.answered).toBe(true);
    const req = ((await rpc(oc, "event_compliance_overview", { p_event: E })).requirements as { rule_key: string; status: string }[]);
    expect(req.find(r => r.rule_key === "weather_contingency")?.status).toBe("missing");
    const g = ((await db.from("guests").insert({ event_id: E, name: "S3 Guest", email: "s3guest@gala-dock.test", status: "confirmed" }).select("id").single()).data as Id).id;
    await db.from("guest_care").insert({ guest_id: g, event_id: E, access_flags: ["wheelchair"] });
    expect(((await oc.from("guest_care").select("guest_id").eq("event_id", E)).data ?? []).length).toBe(1);
    expect((await mc.from("guest_care").select("guest_id").eq("event_id", E)).data).toEqual([]);
    const keys = ((await rpc(mc, "event_ops_readiness", { p_event: E })).items as { key: string }[]).map(i => i.key);
    expect(keys).toEqual(expect.arrayContaining(["step_free_access_missing", "accessible_seating_short"]));
    expect((await oc.rpc("accessibility_approve_summary", { p_event: E })).error?.message).toMatch(/summary_required/);
    await rpc(oc, "accessibility_save", { p_event: E, p: { step_free: true, accessible_seating: 2, public_summary: "Step-free entrance on the east side." } });
    expect((await rpc(oc, "accessibility_approve_summary", { p_event: E })).summary_status).toBe("approved");
    // Weather: a watch is recorded even with no provider; ending it uses the same command.
    const w = await rpc(oc, "weather_watch_save", { p_event: E, p: { location_label: "Test field" } });
    expect(w.status).toBe("active");
    expect((await rpc(oc, "weather_watch_save", { p_event: E, p: { status: "ended" } })).status).toBe("ended");
  });

  test("error text: machine errors become friendly, detail-aware messages", () => {
    expect(opsError({ message: "parking_full", details: JSON.stringify({ area: "Staff", capacity: 10, used: 10 }) })).toBe("Parking is full in Staff (10 of 10 standard spaces issued for that time).");
    expect(opsError({ message: "accessible_parking_full", details: JSON.stringify({ area: "A", accessible_spaces: 2, used: 2 }) })).toMatch(/^Accessible parking is full in A/);
    expect(opsError({ message: "talent_double_booked", details: "Already confirmed for Club set (Q24 Club Night)" })).toMatch(/Club set/);
    expect(opsError({ message: "illegal event_party transition confirmed -> prospect" })).toBe("Can't move from confirmed to prospect.");
    expect(opsError({ message: "loading_slot_taken" })).toMatch(/already booked/);
    expect(opsError({ message: "self_approval_not_allowed" })).toMatch(/different manager/);
    expect(opsError({ message: "something unexpected" })).toBe("Couldn't save that change. Please try again.");
  });
  test("server-rendered screens: sections, team Leave & cover, profile login state, party portal (own vs other)", async () => {
    test.setTimeout(600_000);
    const crew = ((await db.from("crew_members").insert({ workspace_id: W, name: "S3 Crew", role: "Rigger", member_type: "crew", email: "s3crew@gala-dock.test", status: "available" }).select("id").single()).data as Id).id;
    const [co, cm, ct, cx] = await Promise.all([O, M, T, X].map(u => sessionCookies(u.email, "Gala-Dock-Test-9!").then((r: { cookie: string }) => r.cookie)));
    const get = (path: string, cookie: string) => fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(180_000) });
    const pages: [string, string[]][] = [
      [`/organizer/events/${E}?tab=plan&section=partners`, ["Partner checks", "S3 DJ", "Packages", "Booths"]],
      [`/organizer/events/${E}?tab=plan&section=compliance`, ["Guidance, not legal advice", "Requirements", "Licensing questions", "Weather watch and contingency plan"]],
      [`/organizer/events/${E}?tab=plan&section=accessibility`, ["Provisions", "Public summary", "Step-free entrance on the east side."]],
      [`/organizer/events/${E}?tab=operations&section=logistics`, ["Transport", "LHR T5", "Loading bays", "Logistics tasks"]],
      [`/organizer/events/${E}?tab=operations&section=weather`, ["Weather watch", "Contingency plans"]],
      ["/organizer/team?tab=leave", ["Leave requests", "Shifts needing cover"]],
      [`/organizer/team/${crew}`, ["No login", "Invite to log in"]],
    ];
    for (const [path, needles] of pages) {
      const r = await get(path, co); const html = await r.text();
      expect(r.status, path).toBe(200);
      for (const n of needles) expect(html, `${path} → ${n}`).toContain(n);
    }
    // Member: same screens, view-only notice; private flight number never rendered.
    const lm = await (await get(`/organizer/events/${E}?tab=operations&section=logistics`, cm)).text();
    expect(lm).toContain("View only."); expect(lm).not.toContain("BA123");
    expect(await (await get(`/organizer/events/${E}?tab=operations&section=logistics`, co)).text()).toContain("BA123");
    // Party portal: own party renders (noindex), anyone else gets the same not-found.
    const own = await get(`/portal/parties/${party}`, ct); const ownHtml = await own.text();
    expect(own.status).toBe(200); expect(ownHtml).toContain("S3 Outdoor Night"); expect(ownHtml).toMatch(/noindex/);
    for (const c of [cx, co]) expect((await get(`/portal/parties/${party}`, c)).status).toBe(404);
    expect((await get("/portal/parties/not-a-uuid", ct)).status).toBe(404);
  });
});
