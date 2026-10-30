import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn, insertEventFixture, updateEventFixture } from "../phase1/helpers";

// Q26 Licensing / compliance / safety / accessibility / weather (domains 158–162) — API-level, disposable identities, RLS clients.
// Exit gate: every failed REQUIRED requirement becomes an actionable readiness blocker (message + fix text + link) visible in
// event_ops_readiness, event_feasibility → event_readiness, and the lifecycle hook — never a hidden warning.
// Service role: fixtures, the daily job and the weather adapter output (no external weather API is called).
type U = { id: string; email: string };
type Id = { id: string };
type Item = { key: string; severity: string; message: string; fix: string; domain: string };
const db = admin as unknown as SupabaseClient;
const as = async (u: U) => (await signedIn(u.email)) as unknown as SupabaseClient;
const H = 36e5, day = 864e5;
const iso = (ms: number) => new Date(ms).toISOString();
const rpc = async (c: SupabaseClient, fn: string, args: Record<string, unknown>) => { const r = await c.rpc(fn, args); if (r.error) throw new Error(`${fn}: ${r.error.message}`); return r.data as Record<string, unknown>; };
const items = async (c: SupabaseClient, ev: string) => ((await rpc(c, "event_ops_readiness", { p_event: ev })).items as Item[]).filter(i => i.domain === "compliance");
const blockers = async (c: SupabaseClient, ev: string) => (await items(c, ev)).filter(i => i.severity === "blocker").map(i => i.key).sort();

test.describe.configure({ mode: "serial" });

test.describe("Q26 licensing, compliance, safety, accessibility & weather", () => {
  let O: U, Mg: U, M: U, X: U, V: U; let oc: SupabaseClient, mg: SupabaseClient, mc: SupabaseClient, xc: SupabaseClient;
  let W: string, XW: string, VW: string, L: string, E: string, E2: string, E3: string, MAP: string, PRS: string;
  const start = new Date(Date.now() + 30 * day); start.setUTCHours(13, 0, 0, 0);
  const t0 = start.getTime();

  test.beforeAll(async () => {
    [O, Mg, M, X, V] = await Promise.all([createUser("q26-owner"), createUser("q26-mgr"), createUser("q26-member"), createUser("q26-other"), createUser("q26-venue")]);
    W = await seedWorkspace(O.id, "organizer", "Q26 Festivals");
    XW = await seedWorkspace(X.id, "organizer", "Q26 Other");
    VW = await seedWorkspace(V.id, "provider", "Q26 Venue Co");
    await db.from("workspace_members").insert([{ workspace_id: W, user_id: Mg.id, role: "manager", status: "active" }, { workspace_id: W, user_id: M.id, role: "member", status: "active" }]);
    L = ((await db.from("listings").insert({ workspace_id: VW, name: "Q26 Park", kind: "venue", category: "venue", published: false }).select("id").single()).data as Id).id;
    // Ends 23:30 UTC (GMT/BST: 23:30–00:30 UK time) → late night is derived; 2,500 capacity; public.
    E = ((await db.from("events").insert({ owner_id: O.id, workspace_id: W, management: "professional", name: "Q26 Festival", event_type: "festival", visibility: "public", status: "planning",
      starts_at: iso(t0), ends_at: iso(t0 + 10.5 * H), capacity: 2500, timezone: "Europe/London", venue_listing_id: L }).select("id").single()).data as Id).id;
    E2 = ((await db.from("events").insert({ owner_id: O.id, workspace_id: W, management: "professional", name: "Q26 Picnic", event_type: "custom", status: "planning",
      starts_at: iso(Date.now() + day), ends_at: iso(Date.now() + day + 5 * H), capacity: 80 }).select("id").single()).data as Id).id;
    E3 = ((await db.from("events").insert({ owner_id: O.id, workspace_id: W, management: "professional", name: "Q26 Abroad", event_type: "conference", status: "planning",
      starts_at: iso(t0), ends_at: iso(t0 + 4 * H), capacity: 50 }).select("id").single()).data as Id).id;
    MAP = ((await db.from("venue_maps").insert({ event_id: E, version: 1, status: "draft", structure: { elements: [{ id: "route-1", type: "path" }] }, overlay: {} }).select("id").single()).data as Id).id;
    const gs = (await db.from("guests").insert([{ event_id: E, name: "Wheel One" }, { event_id: E, name: "Wheel Two" }, { event_id: E, name: "Hear Three" }]).select("id,name")).data as { id: string; name: string }[];
    await db.from("guest_care").insert([
      { guest_id: gs[0]!.id, event_id: E, access_flags: ["wheelchair", "companion"] }, { guest_id: gs[1]!.id, event_id: E, access_flags: ["wheelchair"] },
      { guest_id: gs[2]!.id, event_id: E, access_flags: ["hearing_loop"] }]);
    [oc, mg, mc, xc] = await Promise.all([as(O), as(Mg), as(M), as(X)]);
  });
  test.afterAll(async () => {
    await db.from("compliance_rule_packs").delete().eq("key", "zz-q26-test");
    await db.from("events").delete().in("workspace_id", [W, XW]);
    await db.from("listings").delete().eq("id", L);
    await db.from("workspaces").delete().in("id", [W, XW, VW]);
    await cleanup();
  });

  test("required failures are actionable readiness blockers (derived facts), visible in feasibility, readiness and the lifecycle hook", async () => {
    const b = await blockers(oc, E);
    expect(b).toEqual(expect.arrayContaining(["rule_premises_or_ten", "rule_ten_capacity", "rule_event_safety_plan", "rule_crowd_plan", "step_free_access_missing", "accessible_seating_short"]));
    const prem = (await items(oc, E)).find(i => i.key === "rule_premises_or_ten")!;
    expect(prem.message).toMatch(/Fix: .*Deadline: /);
    expect(prem.fix).toBe(`/organizer/events/${E}?tab=plan&section=compliance`);
    const feas = (await oc.rpc("event_feasibility", { p_event: E })).data as { key: string; severity: string }[];
    expect(feas.filter(f => f.severity === "blocker").map(f => f.key)).toEqual(expect.arrayContaining(["rule_premises_or_ten", "accessible_seating_short"]));
    expect(((await oc.rpc("event_readiness", { p_event: E })).data as { state: string }).state).toBe("blocked");
    const hook = (await oc.rpc("event_ops_blockers", { p_event: E, p_to: "on_sale" })).data as { key: string; label: string; fix: string }[];
    expect(hook.map(h => h.key)).toContain("ops_rule_premises_or_ten");
    expect(((await xc.rpc("event_ops_readiness", { p_event: E })).error?.message)).toMatch(/not_authorized/);
    // Answering the questions brings in the rules that depend on them.
    expect((await mc.rpc("compliance_profile_save", { p_event: E, p: { alcohol: true } })).error?.message).toMatch(/not_authorized/);
    const facts = await rpc(oc, "compliance_profile_save", { p_event: E, p: { alcohol: true, live_music: true, outdoor: true, children_performing: true, hot_food: true } });
    expect(facts).toMatchObject({ late_night: true, attendance: 2500, country: "GB", outdoor: true });
    expect(await blockers(oc, E)).toEqual(expect.arrayContaining(["rule_alcohol_supervision", "rule_children_performance", "rule_late_night_refreshment", "rule_music_licence",
      "rule_outdoor_safety_plan", "rule_sia_security", "rule_weather_contingency"]));
  });

  test("licences: lifecycle with evidence rules; venue's verified Q08 premises licence satisfies the rule; lapse before the event blocks", async () => {
    expect((await mc.rpc("licence_save", { p_event: E, p: { licence_type: "ten" } })).error?.message).toMatch(/not_authorized/);
    const ten = (await rpc(oc, "licence_save", { p_event: E, p: { licence_type: "ten", authority: "Q26 Council" } })).id as string;
    await rpc(oc, "licence_transition", { p_licence: ten, p_to: "submitted" });
    expect((await items(oc, E)).find(i => i.key === "rule_premises_or_ten")?.severity).toBe("warning");   // pending, 30 days out
    expect((await oc.rpc("licence_transition", { p_licence: ten, p_to: "granted", p: { reference: "TEN-1" } })).error?.message).toMatch(/valid_to_required/);
    await rpc(oc, "licence_transition", { p_licence: ten, p_to: "granted", p_note: null, p: { reference: "TEN-1", valid_from: iso(t0 - H), valid_to: iso(t0 + 12 * H) } });
    let b = await blockers(oc, E);
    expect(b).not.toContain("rule_premises_or_ten");
    expect(b).toContain("rule_ten_capacity");   // 2,500 people: a TEN cannot cover it
    // Venue holds a verified premises licence on Gala Dock (Q08 evidence) → satisfies the capacity rule without an event record.
    const doc = await db.from("provider_documents").insert({ workspace_id: VW, credential_key: "premises_licence", file_path: `${V.id}/${randomUUID()}.pdf`, file_name: "premises.pdf",
      verification_method: "manual", status: "verified", expires_on: iso(t0 + 365 * day).slice(0, 10) });
    expect(doc.error).toBeNull();
    b = await blockers(oc, E);
    expect(b).not.toContain("rule_ten_capacity");
    expect(b).not.toContain("rule_alcohol_supervision");   // satisfied by TEN
    expect((await oc.rpc("licence_transition", { p_licence: (await rpc(oc, "licence_save", { p_event: E, p: { licence_type: "late_night_refreshment" } })).id, p_to: "not_required", p_note: "short" })).error?.message).toMatch(/reason_required/);
    PRS = (await rpc(oc, "licence_save", { p_event: E, p: { licence_type: "prs_ppl" } })).id as string;
    await rpc(oc, "licence_transition", { p_licence: PRS, p_to: "granted", p_note: null, p: { reference: "TML-9", valid_to: iso(Date.now() + 10 * day) } });
    const lapse = (await items(oc, E)).find(i => i.key === "licence_expires_before_event")!;
    expect(lapse.severity).toBe("blocker"); expect(lapse.message).toMatch(/Renew it/);
    expect((await oc.from("event_licences").select("id").eq("event_id", E)).data!.length).toBeGreaterThanOrEqual(3);
    expect(((await xc.from("event_licences").select("id").eq("event_id", E)).data ?? [])).toEqual([]);
  });

  test("expiry monitoring: the daily job expires lapsed licences and sends one reminder per threshold (idempotent)", async () => {
    const run = async () => { const r = await db.rpc("job_compliance_expiry_daily", { p_job: null }); expect(r.error).toBeNull(); return r.data as Record<string, number>; };
    await run();
    const reminders = async () => ((await db.from("notifications").select("id,kind").eq("user_id", O.id).in("kind", ["licence_expiring", "licence_expired"])).data ?? []) as { kind: string }[];
    const first = (await reminders()).filter(n => n.kind === "licence_expiring").length;
    expect(first).toBeGreaterThanOrEqual(1);   // the music licence ends in 10 days → 14-day reminder
    await run();
    expect((await reminders()).filter(n => n.kind === "licence_expiring")).toHaveLength(first);   // no duplicate on re-run
    await db.from("event_licences").update({ valid_from: iso(Date.now() - 5 * day), valid_to: iso(Date.now() - day) }).eq("id", PRS);
    await run();
    expect(((await db.from("event_licences").select("status").eq("id", PRS).single()).data as { status: string }).status).toBe("expired");
    expect((await reminders()).filter(n => n.kind === "licence_expired")).toHaveLength(1);
    expect((await items(oc, E)).find(i => i.key === "rule_music_licence")?.message).toMatch(/expired/);
  });

  test("safety plans: versioned, immutable once submitted, no self-approval for managers, approval satisfies the rule", async () => {
    const v1 = (await rpc(mg, "safety_plan_save", { p_event: E, p_kind: "crowd", p: { title: "Crowd plan", sections: [{ heading: "Ingress", body: "4 gates" }], stewards: 40 } })).id as string;
    await rpc(mg, "safety_plan_submit", { p_plan: v1 });
    expect((await db.from("safety_plans").update({ title: "edited" }).eq("id", v1)).error?.message).toMatch(/plan_immutable/);
    expect((await mg.rpc("safety_plan_decide", { p_plan: v1, p_decision: "approved" })).error?.message).toMatch(/self_approval_not_allowed/);
    expect((await items(oc, E)).find(i => i.key === "rule_crowd_plan")?.severity).toBe("warning");   // pending approval
    await rpc(oc, "safety_plan_decide", { p_plan: v1, p_decision: "changes_requested", p_note: "Add egress" });
    expect((await items(oc, E)).some(i => i.key === "safety_plan_changes_requested")).toBe(true);
    const v2 = (await rpc(mg, "safety_plan_save", { p_event: E, p_kind: "crowd", p: { title: "Crowd plan v2", sections: [{ heading: "Egress", body: "6 exits" }] } }));
    expect(v2.version).toBe(2);
    await rpc(mg, "safety_plan_submit", { p_plan: v2.id });
    expect(((await db.from("safety_plans").select("status").eq("id", v1).single()).data as { status: string }).status).toBe("superseded");
    await rpc(oc, "safety_plan_decide", { p_plan: v2.id, p_decision: "approved", p_note: "ok" });
    const es = (await rpc(oc, "safety_plan_save", { p_event: E, p_kind: "event_safety", p: { title: "ESMP", sections: [{ heading: "Site", body: "Park" }] } })).id as string;
    await rpc(oc, "safety_plan_submit", { p_plan: es });
    await rpc(oc, "safety_plan_decide", { p_plan: es, p_decision: "approved", p_note: "owner may self-approve" });
    const b = await blockers(oc, E);
    for (const k of ["rule_crowd_plan", "rule_event_safety_plan", "rule_outdoor_safety_plan"]) expect(b).not.toContain(k);
  });

  test("accessibility: guest requirements drive blockers; route refs validated against the map; public summary only once approved", async () => {
    expect((await oc.rpc("accessibility_save", { p_event: E, p: { venue_map_id: MAP, accessible_route_refs: ["nope"] } })).error?.message).toMatch(/map_element_not_found/);
    await rpc(oc, "accessibility_save", { p_event: E, p: { step_free: true, accessible_seating: 1, venue_map_id: MAP, accessible_route_refs: ["route-1"], public_summary: "Step-free site with a hearing loop at the main stage." } });
    let b = await blockers(oc, E);
    expect(b).not.toContain("step_free_access_missing");
    expect(b).toContain("accessible_seating_short");
    await rpc(oc, "accessibility_save", { p_event: E, p: { accessible_seating: 4, companion_seats: 1, hearing_loop: true } });
    b = await blockers(oc, E);
    expect(b).not.toContain("accessible_seating_short");
    const pub = async () => (await oc.rpc("event_compliance_public", { p_event: E })).data as { accessibility: { summary: string } | null } | null;
    await updateEventFixture(E, { status: "published" }, "q26-licensing-safety");
    expect((await pub())!.accessibility).toBeNull();
    await rpc(oc, "accessibility_approve_summary", { p_event: E });
    expect((await pub())!.accessibility!.summary).toMatch(/Step-free/);
    expect((await oc.rpc("event_compliance_public", { p_event: E3 })).data).toBeNull();   // private / unpublished: nothing public
  });

  test("weather: no provider → BLOCKED_EXTERNAL shown; forecast breaches alert managers once; severe without approved contingency blocks", async () => {
    await rpc(oc, "compliance_profile_save", { p_event: E2, p: { outdoor: true } });
    expect(await blockers(oc, E2)).toContain("rule_weather_contingency");
    const w = (await rpc(oc, "weather_watch_save", { p_event: E2, p: { latitude: 51.5, longitude: -0.12, thresholds: { wind_kph: 40 } } })).id as string;
    expect((await db.rpc("weather_provider_unavailable", { p_reason: "not_configured" })).error).toBeNull();
    expect((await items(oc, E2)).find(i => i.key === "weather_provider_unavailable")?.message).toMatch(/BLOCKED_EXTERNAL/);
    const cp = (await rpc(oc, "contingency_plan_save", { p_event: E2, p: { trigger_kind: "rain", action: "move_indoors", decision_owner: "Site manager" } })).id as string;
    await rpc(oc, "contingency_plan_approve", { p_plan: cp });
    expect(await blockers(oc, E2)).not.toContain("rule_weather_contingency");
    const at = iso(Date.now() + day + 2 * H);
    const r = await db.rpc("weather_record_forecast", { p_watch: w, p_provider: "test", p_forecast: { hours: [{ at, wind_kph: 60, temp_c: 18 }] }, p_error: null });
    expect((r.data as { alerts: number }).alerts).toBe(1);
    expect(((await db.rpc("weather_record_forecast", { p_watch: w, p_provider: "test", p_forecast: { hours: [{ at, wind_kph: 62 }] }, p_error: null })).data as { alerts: number }).alerts).toBe(0);
    const alertsFor = async (u: U) => ((await db.from("notifications").select("id").eq("user_id", u.id).eq("kind", "weather_alert")).data ?? []).length;
    expect(await alertsFor(O)).toBe(1); expect(await alertsFor(Mg)).toBe(1); expect(await alertsFor(M)).toBe(0);
    expect((await items(oc, E2)).find(i => i.key === "weather_alert_wind_kph")?.severity).toBe("blocker");   // severe, no approved wind plan
    expect(((await oc.rpc("event_conflicts", { p_event: E2 })).data as { kind: string }[]).some(c => c.kind === "ops_weather_alert_wind_kph")).toBe(true);
    await rpc(oc, "contingency_plan_approve", { p_plan: (await rpc(oc, "contingency_plan_save", { p_event: E2, p: { trigger_kind: "wind", action: "delay", decision_owner: "Safety officer" } })).id });
    expect((await items(oc, E2)).find(i => i.key === "weather_alert_wind_kph")?.severity).toBe("warning");
    expect((await mc.rpc("weather_record_forecast", { p_watch: w, p_provider: "x", p_forecast: {}, p_error: null })).error).not.toBeNull();   // service only
  });

  test("rule packs are data per jurisdiction: a ZZ pack applies only to ZZ events and never to GB ones", async () => {
    await db.from("compliance_rule_packs").insert({ key: "zz-q26-test", country: "ZZ", name: "Q26 test land" });
    await db.from("compliance_rules").insert({ pack_key: "zz-q26-test", key: "zz_permit", label: "ZZ event permit", requirement_kind: "licence", applies: { min_attendance: 10 }, satisfied_by: { licence_types: ["event_insurance"] }, fix_text: "Get the ZZ permit." });
    await rpc(oc, "compliance_profile_save", { p_event: E3, p: { country: "zz" } });
    expect(((await rpc(oc, "event_compliance_overview", { p_event: E3 })).requirements as { rule_key: string }[]).map(r => r.rule_key)).toEqual(["zz_permit"]);
    expect(await blockers(oc, E3)).toEqual(["rule_zz_permit"]);
    expect(((await rpc(oc, "event_compliance_overview", { p_event: E })).requirements as { rule_key: string }[]).map(r => r.rule_key)).not.toContain("zz_permit");
  });

  test("lifecycle gating (3019): compliance blockers stop publish from planning/ready, never an event that is already selling", async () => {
    const opsKeys = async (ev: string, to: string) => ((await oc.rpc("event_lifecycle_blockers", { p_event: ev, p_to: to })).data as { key: string }[]).map(b => b.key).filter(k => k.startsWith("ops_"));
    // Planning → ready / published / on_sale: ops blockers join the lifecycle blockers and event_transition refuses.
    for (const to of ["ready", "published", "on_sale"]) expect(await opsKeys(E3, to)).toContain("ops_rule_zz_permit");
    const r = (await oc.rpc("event_transition", { p_event: E3, p_to: "published", p_expected: "planning" })).data as { ok: boolean; error: string; blockers: { key: string }[] };
    expect(r).toMatchObject({ ok: false, error: "preconditions" });
    expect(r.blockers.map(b => b.key)).toContain("ops_rule_zz_permit");
    // Same blockers on an event already on sale: no ops keys for staying on sale, going live, completing, cancelling or postponing.
    const S = ((await insertEventFixture({ owner_id: O.id, workspace_id: W, management: "professional", name: "Q26 Selling", event_type: "conference", visibility: "public", status: "on_sale",
      starts_at: iso(t0), ends_at: iso(t0 + 4 * H), capacity: 50 }, "q26-licensing-safety").select("id").single()).data as Id).id;
    await rpc(oc, "compliance_profile_save", { p_event: S, p: { country: "zz" } });
    expect(await blockers(oc, S)).toEqual(["rule_zz_permit"]);   // still visible in readiness
    for (const to of ["published", "on_sale", "live", "completed", "cancelled", "postponed", "archived"]) expect(await opsKeys(S, to)).toEqual([]);
    const p = (await oc.rpc("event_transition", { p_event: S, p_to: "postponed", p_expected: "on_sale" })).data as { ok?: boolean; state?: string };
    expect(p.ok === false ? p : "ok").toBe("ok");
  });
});
