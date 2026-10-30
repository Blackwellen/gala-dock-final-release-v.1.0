import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";
import { agentRefusalText, agentRefusalCode } from "../../src/lib/agent/refusals";

// Lane D S1 (W03 organiser UI backlog): the database commands behind Plan › Dependencies, the brief editor's version conflict,
// the template library, the lifecycle-aware status menu / readiness gates, the W11 create-event tiles and the Q42 skill
// parameter (migration 202610294035). API/DB level only, disposable identities and a disposable workspace (is_test_fixture).
// No Gala Agent run is ever started: start_agent_run is only called on paths the database refuses (a refusal after the
// delegate's insert rolls the whole call back), and nothing here calls a model.
const db = admin as unknown as SupabaseClient;
const tag = randomBytes(3).toString("hex");
const msg = (e: { message?: string } | null) => e?.message ?? "";
const iso = (days: number) => new Date(Date.now() + days * 864e5).toISOString();

test.describe.configure({ mode: "serial" });

test.describe("W03 S1 organiser plan core", () => {
  let ws = "", pws = "", ev = "", ev2 = "", made = "", tA = "", tB = "", tC = "", tier = "";
  let owner: SupabaseClient, member: SupabaseClient, finance: SupabaseClient, provider: SupabaseClient;
  const templates: string[] = [];

  test.beforeAll(async () => {
    const O = await createUser(`s1o-${tag}`, "S1 Owner"), M = await createUser(`s1m-${tag}`, "S1 Member"), F = await createUser(`s1f-${tag}`, "S1 Finance"), P = await createUser(`s1p-${tag}`, "S1 Provider");
    ws = await seedWorkspace(O.id, "organizer", `S1 Events ${tag}`);
    pws = await seedWorkspace(P.id, "provider", `S1 Supply ${tag}`);
    await db.from("workspace_members").insert([{ workspace_id: ws, user_id: M.id, role: "member", status: "active" }, { workspace_id: ws, user_id: F.id, role: "finance", status: "active" }]);
    const mk = async (name: string, extra: Record<string, unknown> = {}) => ((await db.from("events").insert({ owner_id: O.id, workspace_id: ws, management: "professional", name, status: "draft", event_type: "conference", ...extra }).select("id").single()).data as { id: string }).id;
    ev = await mk(`S1 Conf ${tag}`, { starts_at: iso(40), ends_at: iso(40.3), capacity: 200 });
    ev2 = await mk(`S1 Undated ${tag}`);
    const t = (title: string, milestone = false) => db.from("tasks").insert({ event_id: ev, workspace_id: ws, owner_id: O.id, title, category: "general", priority: "medium", status: "todo", due_at: iso(10), milestone }).select("id").single();
    tA = ((await t("Sign venue contract")).data as { id: string }).id;
    tB = ((await t("Book stage build")).data as { id: string }).id;
    tC = ((await t("Publish agenda", true)).data as { id: string }).id;
    tier = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "General", kind: "general", price: 0, quantity: 100, status: "draft", sort: 1 }).select("id").single()).data as { id: string }).id;
    [owner, member, finance, provider] = await Promise.all([signedIn(O.email), signedIn(M.email), signedIn(F.email), signedIn(P.email)]);
  });

  test.afterAll(async () => {
    const evs = [ev, ev2, made].filter(Boolean);
    await db.from("event_dependencies").delete().in("event_id", evs);
    await db.from("event_briefs").delete().in("event_id", evs);
    await db.from("event_templates").delete().eq("workspace_id", ws);
    await db.from("tasks").delete().in("event_id", evs);
    await db.from("ticket_tiers").delete().in("event_id", evs);
    await db.from("programme_items").delete().in("event_id", evs);
    await db.from("events").delete().in("id", evs);
    await db.from("agent_runs").delete().in("workspace_id", [ws, pws]);
    await db.from("audit_events").delete().in("workspace_id", [ws, pws]);
    await db.from("workspaces").delete().in("id", [ws, pws]);
    await cleanup();
  });

  test("dependencies: add, cycle refused, hard edge blocks completion, graph + critical path, task setter, remove", async () => {
    const add = (c: SupabaseClient, dk: string, di: string, pk: string, pi: string | null, extra: Record<string, unknown> = {}) =>
      c.rpc("add_event_dependency", { p_event: ev, p_dependent_kind: dk, p_dependent_id: di, p_prerequisite_kind: pk, p_prerequisite_id: pi, ...extra });
    const a = await add(member, "task", tB, "task", tA, { p_lag_minutes: 120, p_note: "contract first" });
    expect(a.error).toBeNull();
    expect((await add(member, "milestone", tC, "task", tB)).error).toBeNull();
    expect(msg((await add(member, "task", tA, "milestone", tC)).error)).toMatch(/dependency_cycle/);   // A → B → C → A
    expect(msg((await add(finance, "task", tA, "venue", null)).error)).toMatch(/not_authorized/);
    expect((await add(owner, "ticket_tier", tier, "venue", null)).error).toBeNull();
    const { data: g, error } = await member.rpc("event_dependency_graph", { p_event: ev });
    expect(error).toBeNull();
    const graph = g as { nodes: { key: string; label: string | null }[]; edges: { id: string; lag_minutes: number }[]; blocked: { key: string; blocked_by: string[] }[]; critical_path: string[] };
    expect(graph.edges).toHaveLength(3);
    expect(graph.critical_path).toEqual([`task:${tC}`, `task:${tB}`, `task:${tA}`]);   // UI reverses: A → B → C
    expect(graph.blocked.find(b => b.key === `task:${tB}`)?.blocked_by).toEqual([`task:${tA}`]);
    expect(graph.nodes.find(n => n.key === `task:${tA}`)?.label).toBe("Sign venue contract");
    expect(msg((await member.from("tasks").update({ status: "done" }).eq("id", tB)).error)).toMatch(/blocked_by_dependencies/);
    // Task "depends on" setter replaces B's task prerequisites; then remove one edge explicitly.
    expect((await member.rpc("set_task_dependencies", { p_task: tB, p_prerequisites: [] })).error).toBeNull();
    expect((await member.from("tasks").update({ status: "done" }).eq("id", tB)).error).toBeNull();
    const venueEdge = ((await db.from("event_dependencies").select("id").eq("event_id", ev).eq("prerequisite_kind", "venue").single()).data as { id: string }).id;
    expect(msg((await finance.rpc("remove_event_dependency", { p_dependency: venueEdge })).error)).toMatch(/not_authorized/);
    expect((await member.rpc("remove_event_dependency", { p_dependency: venueEdge })).error).toBeNull();
  });

  test("approval prerequisite: members can't decide, owner decides once with a reason", async () => {
    const { data, error } = await member.rpc("add_event_dependency", { p_event: ev, p_dependent_kind: "task", p_dependent_id: tA, p_prerequisite_kind: "approval", p_prerequisite_id: null, p_note: "Client sign-off" });
    expect(error).toBeNull();
    const id = (data as { id: string }).id;
    expect(msg((await member.rpc("decide_event_dependency_approval", { p_dependency: id, p_approve: true, p_reason: "" })).error)).toMatch(/not_authorized/);
    const r = await owner.rpc("decide_event_dependency_approval", { p_dependency: id, p_approve: false, p_reason: "Budget not agreed" });
    expect(r.error).toBeNull(); expect((r.data as { status: string }).status).toBe("rejected");
    expect(msg((await owner.rpc("decide_event_dependency_approval", { p_dependency: id, p_approve: true, p_reason: "" })).error)).toMatch(/already_decided/);
    const row = (await member.from("event_dependencies").select("approval_status,approval_reason").eq("id", id).single()).data as { approval_status: string; approval_reason: string };
    expect(row).toEqual({ approval_status: "rejected", approval_reason: "Budget not agreed" });
  });

  test("brief: versioned saves, stale expected version returns a conflict (no overwrite), finance can't edit", async () => {
    const save = (c: SupabaseClient, expected: number | null, goals: string[]) => c.rpc("save_event_brief", { p_event: ev, p_brief: { goals, scope: "Two-day summit", audience: { size: 180, names: ["leak"] } }, p_expected_version: expected, p_change_note: "s1" });
    const v1 = await save(member, 0, ["Sell 180 seats"]);
    expect(v1.error).toBeNull(); expect(v1.data).toMatchObject({ ok: true, version: 1 });
    expect((await save(owner, 1, ["Sell 180 seats", "Two sponsors"])).data).toMatchObject({ ok: true, version: 2 });
    expect((await save(member, 1, ["Stale edit"])).data).toEqual({ ok: false, conflict: true, current: 2 });
    expect(msg((await save(finance, 2, ["x"])).error)).toMatch(/not_authorized/);
    const rows = (await member.from("event_briefs").select("version,is_current,goals,audience").eq("event_id", ev).order("version")).data as { version: number; is_current: boolean; goals: string[]; audience: Record<string, unknown> }[];
    expect(rows.map(r => [r.version, r.is_current])).toEqual([[1, false], [2, true]]);
    expect(rows[1]!.goals).toEqual(["Sell 180 seats", "Two sponsors"]);
    expect(rows[1]!.audience.names).toBeUndefined();   // guest names never stored in the brief
  });

  test("templates: versioned family, create-from-template needs a future date, archive", async () => {
    const s1 = await member.rpc("save_event_template", { p_event: ev, p_name: `S1 Summit ${tag}`, p_description: "Two-day summit", p_event_types: ["Conference"], p_modules: { plan: true, schedule: true, tickets: true }, p_family: null });
    expect(s1.error).toBeNull();
    const t1 = (await db.from("event_templates").select("id,family_id,version").eq("workspace_id", ws).eq("status", "active").single()).data as { id: string; family_id: string; version: number };
    expect(t1.version).toBe(1);
    const s2 = await owner.rpc("save_event_template", { p_event: ev, p_name: `S1 Summit ${tag}`, p_description: "v2", p_event_types: ["Conference"], p_modules: { plan: true }, p_family: t1.family_id });
    expect(s2.error).toBeNull();
    const fam = (await db.from("event_templates").select("id,version,status").eq("family_id", t1.family_id).order("version")).data as { id: string; version: number; status: string }[];
    expect(fam.map(f => [f.version, f.status])).toEqual([[1, "superseded"], [2, "active"]]);
    templates.push(...fam.map(f => f.id));
    const v2 = fam[1]!.id;
    const local = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 16);
    expect(msg((await member.rpc("create_event_from_template", { p_template: v2, p_workspace: ws, p_name: "Past", p_starts_local: local(-3), p_timezone: "Europe/London", p_request_id: null })).error)).toMatch(/start_in_past/);
    expect(msg((await finance.rpc("create_event_from_template", { p_template: v2, p_workspace: ws, p_name: "No perm", p_starts_local: local(30), p_timezone: "Europe/London", p_request_id: null })).error)).toMatch(/not_authorized/);
    const rid = crypto.randomUUID();
    const c = await member.rpc("create_event_from_template", { p_template: v2, p_workspace: ws, p_name: `S1 From template ${tag}`, p_starts_local: local(30), p_timezone: "Europe/London", p_request_id: rid });
    expect(c.error).toBeNull(); made = (c.data as { id: string }).id;
    const again = await member.rpc("create_event_from_template", { p_template: v2, p_workspace: ws, p_name: `S1 From template ${tag}`, p_starts_local: local(30), p_timezone: "Europe/London", p_request_id: rid });
    expect((again.data as { id: string } | null)?.id ?? made).toBe(made);   // same request id never makes a second event
    expect(((await db.from("events").select("status,visibility").eq("id", made).single()).data as { status: string }).status).toBe("draft");
    expect(msg((await finance.rpc("archive_event_template", { p_template: v2 })).error)).toMatch(/not_authorized/);
    expect((await member.rpc("archive_event_template", { p_template: v2 })).error).toBeNull();
    expect(((await db.from("event_templates").select("version,status").eq("family_id", t1.family_id).order("version")).data ?? []).map(r => (r as { status: string }).status)).toEqual(["superseded", "archived"]);
  });

  test("lifecycle: blockers preview, transition refusal with fix links, row guard detail, role rules", async () => {
    const { data: b, error } = await member.rpc("event_lifecycle_blockers", { p_event: ev2, p_to: "published" });
    expect(error).toBeNull();
    const keys = (b as { key: string; fix?: string }[]).map(x => x.key);
    expect(keys).toEqual(expect.arrayContaining(["date"]));
    expect((b as { fix?: string }[]).every(x => !x.fix || x.fix.startsWith("/"))).toBe(true);
    const t = await member.rpc("event_transition", { p_event: ev2, p_to: "published", p_expected: "draft", p_reason: null });
    expect(t.error).toBeNull(); expect(t.data).toMatchObject({ ok: false, error: "preconditions" });
    const direct = await member.from("events").update({ status: "published" }).eq("id", ev2);
    expect(msg(direct.error)).toMatch(/lifecycle_preconditions/);
    expect(JSON.parse(direct.error?.details ?? "[]").map((x: { key: string }) => x.key)).toEqual(expect.arrayContaining(["date"]));
    expect(msg((await finance.rpc("event_transition", { p_event: ev2, p_to: "planning", p_expected: "draft", p_reason: null })).error)).toMatch(/not_authorized/);
    expect(msg((await member.rpc("event_transition", { p_event: ev2, p_to: "cancelled", p_expected: "draft", p_reason: "x" })).error)).toMatch(/owners and managers/);
    const ok = await member.rpc("event_transition", { p_event: ev2, p_to: "planning", p_expected: "draft", p_reason: null });
    expect(ok.error).toBeNull();
    expect(((await db.from("events").select("status").eq("id", ev2).single()).data as { status: string }).status).toBe("planning");
    expect((await member.rpc("event_transition", { p_event: ev2, p_to: "ready", p_expected: "draft", p_reason: null })).data).toMatchObject({ ok: false, conflict: true, current: "planning" });
  });

  test("W11 tiles: gala, charity and conference are organiser create-event tiles", async () => {
    const { data, error } = await member.from("event_type_aliases").select("event_type").eq("organizer_tile", true);
    expect(error).toBeNull();
    expect((data ?? []).map(r => (r as { event_type: string }).event_type)).toEqual(expect.arrayContaining(["gala", "charity", "conference", "festival", "wedding"]));
  });

  test("Q42 start_agent_run mission overload: refusals only, nothing left behind", async () => {
    const call = (c: SupabaseClient, w: string, surface: string, mission: string | null, key: string) =>
      c.rpc("start_agent_run", { p_ws: w, p_surface: surface, p_goal: "find suitable work next month", p_tools: null, p_constraints: { note: "" }, p_idempotency: `s1-${tag}-${key}`, p_mission: mission });
    expect(msg((await call(owner, ws, "customer", "org.ask", "c")).error)).toMatch(/agent_not_available_for_customers/);
    expect(msg((await call(owner, ws, "organizer", "org.ask", "o")).error)).toMatch(/unsupported_surface/);
    expect(msg((await call(provider, pws, "provider", "org.ask", "u")).error)).toMatch(/unknown_skill/);
    expect(msg((await call(provider, pws, "provider", "pro.nope", "n")).error)).toMatch(/unknown_skill/);
    expect(msg((await call(owner, pws, "provider", "pro.find_work", "x")).error)).toMatch(/not_authorized/);   // not a member of that provider
    const cap = (await db.rpc("has_capability", { p_workspace: pws, p_capability: "agent.actions" })).data;
    if (cap !== true) expect(msg((await call(provider, pws, "provider", "pro.draft_quote", "p")).error)).toMatch(/plan_not_entitled/);
    // The original 6-argument signature still resolves (no ambiguity) and keeps its own refusals.
    expect(msg((await owner.rpc("start_agent_run", { p_ws: ws, p_surface: "customer", p_goal: "help me", p_tools: null, p_constraints: {}, p_idempotency: `s1-${tag}-six` })).error)).toBe("agent_not_available_for_customers");
    const { count } = await db.from("agent_runs").select("id", { count: "exact", head: true }).like("idempotency_key", `s1-${tag}-%`);
    expect(count).toBe(0);
    const { data: skills } = await member.rpc("agent_available_skills", { p_workspace: ws });
    const list = skills as { id: string; available: boolean; locked_reason: string | null }[];
    expect(list.every(s => s.id.startsWith("org."))).toBe(true);
    expect(list.find(s => s.id === "org.ask")?.available).toBe(true);
  });

  test("friendly refusal text for agent codes (run and approval pages)", () => {
    expect(agentRefusalCode("refused: exceeds_booking_authority")).toBe("exceeds_booking_authority");
    expect(agentRefusalText("refused: plan_not_entitled")).toMatch(/plan doesn't include/);
    expect(agentRefusalText("approval_args_mismatch")).toMatch(/changed after it was approved/);
    expect(agentRefusalText("permission_denied:events.write")).toMatch(/permission/);
    expect(agentRefusalText("owner_approval_required")).toMatch(/only the workspace owner/);
    expect(agentRefusalText("The venue replied with a new date.")).toBe("The venue replied with a new date.");
    expect(agentRefusalText("weird_internal_code")).toBe("Gala Agent couldn't complete this step.");
  });
});
