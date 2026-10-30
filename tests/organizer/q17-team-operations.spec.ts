import { createHash, randomBytes } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Q17 Team / resource / live operations (domains 57–63) + W06 items — API-level, disposable identities, RLS-bound clients.
// Service role: fixtures and reading notifications only.
type U = { id: string; email: string };
type Id = { id: string };
const db = admin as unknown as SupabaseClient;
const as = async (u: U) => (await signedIn(u.email)) as unknown as SupabaseClient;
const H = 36e5, day = 864e5;
const iso = (ms: number) => new Date(ms).toISOString();
const notes = async (u: U, kind: string) => ((await db.from("notifications").select("id,title,link").eq("user_id", u.id).eq("kind", kind)).data ?? []) as { title: string; link: string }[];

test.describe.configure({ mode: "serial" });

test.describe("Q17 team, resources & live operations", () => {
  let O: U, Mg: U, S: U, M2: U, X: U; let oc: SupabaseClient, mg: SupabaseClient, sc: SupabaseClient, m2: SupabaseClient, xc: SupabaseClient;
  let W: string, XW: string, E: string, E2: string, cS: string, cA: string, cB: string, cC: string, shiftS: string;
  const t0 = Date.now() + 3 * day;

  test.beforeAll(async () => {
    [O, Mg, S, M2, X] = await Promise.all([createUser("q17-owner"), createUser("q17-mgr"), createUser("q17-staff"), createUser("q17-member"), createUser("q17-other")]);
    W = await seedWorkspace(O.id, "organizer", "Q17 Ops Co");
    XW = await seedWorkspace(X.id, "organizer", "Q17 Other Co");
    await db.from("workspace_members").insert([{ workspace_id: W, user_id: Mg.id, role: "manager", status: "active" }, { workspace_id: W, user_id: M2.id, role: "member", status: "active" }]);
    E = ((await db.from("events").insert({ owner_id: O.id, workspace_id: W, management: "professional", name: "Q17 Gala", status: "planning", starts_at: iso(t0), ends_at: iso(t0 + 6 * H) }).select("id").single()).data as Id).id;
    E2 = ((await db.from("events").insert({ owner_id: O.id, workspace_id: W, management: "professional", name: "Q17 Expo", status: "planning", starts_at: iso(t0 + H), ends_at: iso(t0 + 5 * H) }).select("id").single()).data as Id).id;
    const crew = (await db.from("crew_members").insert([
      { workspace_id: W, name: "Sam Staff", role: "Steward", email: S.email }, { workspace_id: W, name: "Alex A", role: "Steward", email: "" },
      { workspace_id: W, name: "Bea B", role: "Steward", email: "" }, { workspace_id: W, name: "Cal C", role: "Steward", email: "" }]).select("id,name")).data as { id: string; name: string }[];
    [cS, cA, cB, cC] = ["Sam Staff", "Alex A", "Bea B", "Cal C"].map(n => crew.find(c => c.name === n)!.id);
    [oc, mg, sc, m2, xc] = await Promise.all([as(O), as(Mg), as(S), as(M2), as(X)]);
  });
  test.afterAll(async () => {
    await db.from("events").delete().in("workspace_id", [W, XW]);
    await db.from("workspaces").delete().in("id", [W, XW]);
    await cleanup();
  });

  test("addNote rule: any member may note a person (crew_notes); crew records stay manager-only; outsiders refused", async () => {
    expect((await m2.from("crew_notes").insert({ workspace_id: W, crew_id: cA, body: "Great with crowds", author_id: M2.id, author_name: "Member" })).error).toBeNull();
    const upd = await m2.from("crew_members").update({ role: "Hacked" }).eq("id", cA).select("id");
    expect(upd.data ?? []).toEqual([]);
    expect((await xc.from("crew_notes").insert({ workspace_id: W, crew_id: cA, body: "spam", author_id: X.id })).error).not.toBeNull();
    expect((await m2.from("crew_notes").insert({ workspace_id: W, crew_id: cA, body: "forged", author_id: O.id })).error).not.toBeNull();   // cannot write as someone else
    expect(((await oc.from("crew_notes").select("body").eq("crew_id", cA)).data ?? []).length).toBe(1);
  });

  test("crew ↔ login: accepting a crew invite links crew_members.user_id; guards on cross-workspace and already-linked", async () => {
    const hash = createHash("sha256").update(randomBytes(32)).digest("hex");
    expect((await mg.rpc("crew_invite_login", { p_crew: cS, p_token_hash: hash })).error?.message).toMatch(/not_authorized/);   // owner only
    expect((await oc.rpc("crew_invite_login", { p_crew: cA, p_token_hash: hash })).error?.message).toMatch(/crew_email_required/);
    expect((await oc.rpc("crew_invite_login", { p_crew: cS, p_token_hash: hash })).error).toBeNull();
    const r = await sc.rpc("respond_to_invite", { p_token_hash: hash, p_invite_id: null, p_accept: true });
    expect((r.data as { result: string }).result).toBe("accepted");
    expect(((await db.from("crew_members").select("user_id").eq("id", cS).single()).data as { user_id: string }).user_id).toBe(S.id);
    const h2 = createHash("sha256").update(randomBytes(32)).digest("hex");
    expect((await oc.rpc("crew_invite_login", { p_crew: cS, p_token_hash: h2 })).error?.message).toMatch(/crew_already_linked/);
    expect((await xc.rpc("crew_invite_login", { p_crew: cA, p_token_hash: h2 })).error?.message).toMatch(/not_authorized/);
    // The cross-workspace guard holds even for a direct (service) write.
    expect((await db.from("workspace_invites").insert({ workspace_id: XW, email: "x@q17.test", role: "member", token_hash: h2, invited_by: X.id, crew_id: cA })).error?.message).toMatch(/crew_not_in_workspace/);
  });

  test("assignment notifies the linked login; my_shifts shows only my shifts; staff confirm their own shift only", async () => {
    shiftS = ((await mg.from("shifts").insert({ workspace_id: W, event_id: E, crew_id: cS, role: "Steward", title: "Doors", starts_at: iso(t0), ends_at: iso(t0 + 4 * H), status: "pending" }).select("id").single()).data as Id).id;
    const n = await notes(S, "shift_assigned");
    expect(n).toHaveLength(1); expect(n[0]!.link).toBe("/organizer/team/my-shifts");
    const mine = (await sc.rpc("my_shifts", {})).data as { id: string }[];
    expect(mine.map(s => s.id)).toEqual([shiftS]);
    expect((await m2.rpc("my_shifts", {})).data).toEqual([]);
    expect((await m2.rpc("member_respond_shift", { p_shift: shiftS, p_accept: true })).error?.message).toMatch(/not_authorized/);
    expect((await sc.rpc("member_respond_shift", { p_shift: shiftS, p_accept: true })).data).toBe("confirmed");
    expect((await sc.rpc("member_respond_shift", { p_shift: shiftS, p_accept: true })).error?.message).toMatch(/shift_not_pending/);
  });

  test("check-in: staff not before the window; manager any time; then check-out; history recorded", async () => {
    expect((await sc.rpc("shift_check", { p_shift: shiftS, p_action: "in" })).error?.message).toMatch(/too_early/);
    expect((await m2.rpc("shift_check", { p_shift: shiftS, p_action: "in" })).error?.message).toMatch(/not_authorized/);
    expect((await mg.rpc("shift_check", { p_shift: shiftS, p_action: "in" })).data).toBe("checked_in");
    expect((await sc.rpc("shift_check", { p_shift: shiftS, p_action: "out" })).data).toBe("checked_out");
    const kinds = ((await oc.from("shift_changes").select("kind").eq("shift_id", shiftS).order("id")).data ?? []).map(r => (r as { kind: string }).kind);
    expect(kinds).toEqual(["assigned", "accepted", "check_in", "check_out"]);
  });

  test("substitution: concurrent reassignment of two overlapping shifts onto one person — exactly one wins", async () => {
    const a1 = ((await mg.from("shifts").insert({ workspace_id: W, event_id: E, crew_id: cA, role: "Bar", title: "Bar 1", starts_at: iso(t0 + 8 * H), ends_at: iso(t0 + 12 * H), status: "pending" }).select("id").single()).data as Id).id;
    const b1 = ((await mg.from("shifts").insert({ workspace_id: W, event_id: E2, crew_id: cB, role: "Bar", title: "Bar 2", starts_at: iso(t0 + 9 * H), ends_at: iso(t0 + 13 * H), status: "pending" }).select("id").single()).data as Id).id;
    expect((await m2.rpc("reassign_shift", { p_shift: a1, p_to_crew: cC })).error?.message).toMatch(/not_authorized/);
    const [r1, r2] = await Promise.all([mg.rpc("reassign_shift", { p_shift: a1, p_to_crew: cC, p_reason: "swap" }), oc.rpc("reassign_shift", { p_shift: b1, p_to_crew: cC, p_reason: "swap" })]);
    const ok = [r1, r2].filter(r => !r.error), bad = [r1, r2].filter(r => r.error);
    expect(ok).toHaveLength(1); expect(bad).toHaveLength(1);
    expect(bad[0]!.error!.message).toMatch(/crew_conflict/);
    const onC = ((await oc.from("shifts").select("id").eq("crew_id", cC)).data ?? []).length;
    expect(onC).toBe(1);
  });

  test("leave: staff request, members can't see or decide, approval blocks new shifts and lists clashes, cancel removes the block", async () => {
    const lv = await sc.rpc("request_leave", { p_ws: W, p_from: iso(t0 - H), p_to: iso(t0 + day), p_kind: "annual", p_note: "Family" });
    expect(lv.error).toBeNull(); const L = lv.data as string;
    expect((await m2.from("leave_requests").select("id").eq("id", L)).data).toEqual([]);
    expect((await m2.rpc("decide_leave", { p_request: L, p_approve: true })).error?.message).toMatch(/not_authorized/);
    expect((await notes(Mg, "leave_request")).length).toBe(1);
    const d = (await mg.rpc("decide_leave", { p_request: L, p_approve: true, p_note: "Enjoy" })).data as { status: string; block_id: string; conflicting_shifts: { shift_id: string }[] };
    expect(d.status).toBe("approved"); expect(d.block_id).toBeTruthy();
    expect(d.conflicting_shifts.map(x => x.shift_id)).toEqual([shiftS]);
    expect((await notes(S, "leave_decision")).length).toBe(1);
    const blocked = await mg.from("shifts").insert({ workspace_id: W, event_id: E, crew_id: cS, role: "Steward", title: "Late", starts_at: iso(t0 + 10 * H), ends_at: iso(t0 + 12 * H), status: "pending" });
    expect(blocked.error?.message).toMatch(/crew_conflict/);
    expect((await sc.rpc("cancel_leave", { p_request: L })).error).toBeNull();
    expect((await db.from("availability_blocks").select("id").eq("id", d.block_id)).data).toEqual([]);
    expect((await db.from("leave_requests").update({ status: "approved" }).eq("id", L)).error?.message).toMatch(/illegal leave_request transition/);
  });

  test("availability request: task + in-app notification to the linked person; managers only", async () => {
    expect((await m2.rpc("request_crew_availability", { p_crew: cS, p_from: iso(t0 + 2 * day), p_to: iso(t0 + 3 * day) })).error?.message).toMatch(/not_authorized/);
    expect((await mg.rpc("request_crew_availability", { p_crew: cS, p_from: iso(t0 + 2 * day), p_to: iso(t0 + 3 * day), p_note: "Festival weekend" })).error).toBeNull();
    expect((await notes(S, "availability_request")).length).toBe(1);
  });

  test("resources: event allocations reuse the Q12 equipment lock (block / warn) and surface as conflicts", async () => {
    const eq = ((await db.from("provider_equipment").insert({ workspace_id: W, name: "Radio set", category: "equipment", quantity: 2, conflict_policy: "block" }).select("id").single()).data as Id).id;
    expect((await m2.rpc("event_allocate_resource", { p_event: E, p_equipment: eq, p_quantity: 1 })).error?.message).toMatch(/not_authorized/);
    expect((await mg.rpc("event_allocate_resource", { p_event: E, p_equipment: eq, p_quantity: 2 })).error).toBeNull();
    expect((await mg.rpc("event_allocate_resource", { p_event: E2, p_equipment: eq, p_quantity: 1 })).error?.message).toMatch(/equipment_conflict/);
    await db.from("provider_equipment").update({ conflict_policy: "warn" }).eq("id", eq);
    const w = (await mg.rpc("event_allocate_resource", { p_event: E2, p_equipment: eq, p_quantity: 1 })).data as { warning: string };
    expect(w.warning).toMatch(/over-allocated/);
    const c = (await m2.rpc("operational_conflicts", { p_ws: W })).data as { kind: string; event_id: string }[];
    expect(c.some(x => x.kind === "resource_over_allocated" && x.event_id === E2)).toBe(true);
    expect((await xc.rpc("operational_conflicts", { p_ws: W })).error?.message).toMatch(/not_authorized/);
  });

  test("run sheet + live mode: dependencies gate starts, delays tracked and surfaced, snapshot aggregates", async () => {
    const items = (await mg.from("programme_items").insert([
      { event_id: E, starts_at: iso(t0), duration_minutes: 30, title: "Doors open", kind: "run_sheet" },
      { event_id: E, starts_at: iso(t0 + H), duration_minutes: 30, title: "Speeches", kind: "run_sheet" }]).select("id,title")).data as { id: string; title: string }[];
    const [i1, i2] = ["Doors open", "Speeches"].map(t => items.find(i => i.title === t)!.id);
    expect((await m2.rpc("run_sheet_update", { p_item: i2, p_status: "upcoming", p_depends_on: [i1] })).error).toBeNull();
    expect((await m2.rpc("run_sheet_update", { p_item: i2, p_status: "in_progress" })).error?.message).toMatch(/dependency_pending/);
    expect((await m2.rpc("run_sheet_update", { p_item: i1, p_status: "in_progress" })).error).toBeNull();
    const dl = (await m2.rpc("run_sheet_update", { p_item: i1, p_status: "delayed", p_delay: 20 })).data as { status: string; delay_minutes: number };
    expect(dl).toMatchObject({ status: "in_progress", delay_minutes: 20 });
    const ec = (await oc.rpc("event_conflicts", { p_event: E })).data as { kind: string }[];
    expect(ec.some(x => x.kind === "run_sheet_delayed")).toBe(true);
    const snap = (await m2.rpc("event_live_snapshot", { p_event: E })).data as { now: { id: string; delay_minutes: number }[]; next: { id: string; blocked_by: number }[]; crew: { scheduled: number } };
    expect(snap.now.map(n => n.id)).toEqual([i1]); expect(snap.now[0]!.delay_minutes).toBe(20);
    expect(snap.next.find(n => n.id === i2)!.blocked_by).toBe(1);
    expect(snap.crew.scheduled).toBeGreaterThanOrEqual(1);
    expect((await xc.rpc("event_live_snapshot", { p_event: E })).error?.message).toMatch(/not_authorized/);
  });

  test("incidents: lifecycle with closure note, timeline, manager alert, restricted details", async () => {
    const inc = ((await m2.from("incidents").insert({ event_id: E, title: "Medical at bar", severity: "critical", status: "open", reported_by: M2.id }).select("id").single()).data as Id).id;
    expect((await notes(O, "incident_alert")).length).toBe(1); expect((await notes(Mg, "incident_alert")).length).toBe(1);
    expect((await m2.rpc("incident_transition", { p_incident: inc, p_to: "resolved" })).error?.message).toMatch(/closure_note_required/);
    expect((await m2.rpc("incident_transition", { p_incident: inc, p_to: "acknowledged" })).error).toBeNull();
    expect((await mg.rpc("incident_transition", { p_incident: inc, p_to: "investigating", p_note: "Paramedic on site", p: { owner_name: "Mo Manager", corrective_actions: "Add first-aider at bar" } })).error).toBeNull();
    const oc2 = (await oc.rpc("event_conflicts", { p_event: E })).data as { kind: string }[];
    expect(oc2.some(x => x.kind === "incident_open")).toBe(true);
    expect((await mg.rpc("incident_transition", { p_incident: inc, p_to: "resolved", p_note: "Guest discharged" })).error).toBeNull();
    const tl = ((await m2.from("incident_updates").select("kind,to_status").eq("incident_id", inc).order("id")).data ?? []) as { kind: string; to_status: string | null }[];
    expect(tl.map(t => t.kind)).toEqual(["reported", "status", "status", "note", "action", "status"]);
    const i = (await m2.from("incidents").select("status,resolved_at,closure_note,owner_name").eq("id", inc).single()).data as { status: string; resolved_at: string; closure_note: string };
    expect(i.status).toBe("resolved"); expect(i.resolved_at).toBeTruthy(); expect(i.closure_note).toBe("Guest discharged");
    expect((await m2.from("incidents").update({ status: "open" }).eq("id", inc)).error?.message).toMatch(/illegal incident transition/);
    expect((await m2.from("incident_private").insert({ incident_id: inc, event_id: E, detail: "Name, condition" })).error).not.toBeNull();
    expect((await mg.from("incident_private").insert({ incident_id: inc, event_id: E, detail: "Name, condition" })).error).toBeNull();
    expect((await m2.from("incident_private").select("detail").eq("incident_id", inc)).data).toEqual([]);
  });

  test("risk register: managers write, members read; high residual risk surfaces as a conflict", async () => {
    expect((await m2.from("event_risks").insert({ event_id: E, title: "Crowd crush at doors", likelihood: 5, impact: 5 })).error).not.toBeNull();
    const r = (await mg.from("event_risks").insert({ event_id: E, title: "Crowd crush at doors", category: "crowd", likelihood: 5, impact: 5, controls: "Barriers", contingency: "Hold entry" }).select("id,score,residual_score").single()).data as { id: string; score: number; residual_score: number };
    expect(r.score).toBe(25); expect(r.residual_score).toBe(25);
    expect(((await m2.from("event_risks").select("id").eq("event_id", E)).data ?? []).length).toBe(1);
    const c = (await m2.rpc("operational_conflicts", { p_ws: W })).data as { kind: string; ref_id: string }[];
    expect(c.some(x => x.kind === "risk_high" && x.ref_id === r.id)).toBe(true);
    await mg.from("event_risks").update({ residual_likelihood: 2, residual_impact: 3 }).eq("id", r.id);
    const c2 = (await m2.rpc("operational_conflicts", { p_ws: W })).data as { kind: string; ref_id: string }[];
    expect(c2.some(x => x.ref_id === r.id)).toBe(false);
  });
});
