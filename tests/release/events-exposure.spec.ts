import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn, insertEventFixture } from "../phase1/helpers";

// P1 events exposure (lane D): public paths read events_public (202610294084) — public columns + allow-listed settings
// (public_settings, trigger-maintained) for public published / on_sale / live events. The base-table narrowing is staged as
// 202610294085 (applied after the production deploy); the "base table closed" tests detect it and skip until it is applied.
// Fixture: disposable organiser workspace (is_test_fixture) with a public on-sale event carrying private columns + private settings
// keys, plus a draft and a private copy.

type Db = SupabaseClient;
const db = admin as unknown as Db;
const iso = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
const PUBLIC_COLS = ["capacity", "city", "composition_role", "cover_image", "created_at", "currency", "description", "ends_at", "event_type", "id", "location", "name",
  "occurrence_key", "parent_event_id", "series_id", "series_index", "settings", "slug", "starts_at", "status", "tags", "timezone", "updated_at", "venue_listing_id", "venue_name", "visibility", "workspace_id"];
const PRIVATE_KEYS = ["objectives", "budget_lines", "revenue_sources", "risk", "readiness", "invite_token", "admin_restriction", "promotion_plan", "distribution", "demo_seed", "getting_there", "commercial_model", "tax_treatment"];
const SECRETS = ["EXP forecast profit", "exp-invite-secret", "EXP internal plan note", "EXP Client Ltd", "EXP private goal text", "4242.42"];
const SETTINGS = {
  faqs: [{ q: "EXP public question?", a: "Yes." }], badge: "EXP badge", page_blocks: { order: ["about", "tickets"] }, launch: { at: iso(1) },
  objectives: ["EXP forecast profit £42,424"], budget_lines: { Venue: 4242.42 }, revenue_sources: { Bar: 1 }, risk: "at_risk", readiness: 12,
  invite_token: "exp-invite-secret", promotion_plan: { notes: "EXP internal plan note" }, distribution: { google: true }, demo_seed: "exp", commercial_model: "ticketed", tax_treatment: "vat",
  ticket_pro: { model: "hybrid", buffer_pct: 5, sales: { waiting_list: true, order_limit: 8 }, access: { comps: 42, fee_buyer: 5, info_text: "EXP bring ID" } },
};

test.describe.configure({ mode: "serial" });

test.describe("events exposure (202610294084 / staged 4085)", () => {
  let W = "", pub = "", draft = "", priv = ""; let owner: Db; let out: Db; let closed = false;
  const events: string[] = [];
  const mk = async (name: string, visibility: string, status: string) => {
    const r = await insertEventFixture({ workspace_id: W, owner_id: ownerId, management: "professional", name, visibility, status, event_type: "concert", starts_at: iso(30), ends_at: iso(30.2),
      budget_total: 4242.42, revenue_goal: 9999, target_profit: 4242.42, client_name: "EXP Client Ltd", goal: "EXP private goal text", priorities: ["EXP priority"], guest_count: 42, settings: SETTINGS }, "events exposure spec").select("id").single();
    expect(r.error).toBeNull(); const id = (r.data as { id: string }).id; events.push(id); return id;
  };
  let ownerId = "";

  test.beforeAll(async () => {
    const [O, X] = await Promise.all([createUser("exp-org"), createUser("exp-out")]);
    ownerId = O.id; W = await seedWorkspace(O.id, "organizer", "EXP Events Exposure");
    owner = await signedIn(O.email) as unknown as Db; out = await signedIn(X.email) as unknown as Db;
    pub = await mk("EXP Public", "public", "on_sale"); draft = await mk("EXP Draft", "public", "draft"); priv = await mk("EXP Private", "private", "on_sale");
    closed = !!(await (anon() as unknown as Db).from("events").select("settings").eq("id", pub).maybeSingle()).error;
  });
  test.afterAll(async () => {
    for (const ev of events) await db.from("events").delete().eq("id", ev);
    if (W) await db.from("workspaces").delete().eq("id", W);
    await cleanup();
  });

  test("events_public gives anon and outsiders public columns + public settings only", async () => {
    for (const client of [anon() as unknown as Db, out]) {
      const { data, error } = await client.from("events_public").select("*").eq("id", pub).single();
      expect(error).toBeNull();
      const row = data as Record<string, unknown>;
      expect(Object.keys(row).sort()).toEqual(PUBLIC_COLS);
      const s = row.settings as Record<string, unknown>;
      for (const k of PRIVATE_KEYS) expect(s).not.toHaveProperty(k);
      expect(s).toMatchObject({ faqs: SETTINGS.faqs, badge: "EXP badge", page_blocks: SETTINGS.page_blocks });
      expect(s.ticket_pro).toEqual({ model: "hybrid", sales: { waiting_list: true, order_limit: 8 }, access: { fee_buyer: 5, info_text: "EXP bring ID" } });
      const text = JSON.stringify(row);
      for (const x of SECRETS) expect(text).not.toContain(x);
    }
  });

  test("drafts and private events are not in events_public", async () => {
    for (const client of [anon() as unknown as Db, out]) {
      const { data } = await client.from("events_public").select("id").in("id", [draft, priv]);
      expect(data ?? []).toEqual([]);
    }
  });

  test("events_public is read-only", async () => {
    const r = await (anon() as unknown as Db).from("events_public").insert({ id: "00000000-0000-4000-8000-000000000001", name: "EXP" });
    expect(r.error).not.toBeNull();
  });

  test("a member's settings write re-projects public_settings (trigger); a forged public_settings is ignored", async () => {
    const { data: row } = await owner.from("events").select("settings").eq("id", pub).single();
    const s = { ...((row as { settings: Record<string, unknown> }).settings), faqs: [{ q: "EXP updated?", a: "Yes." }], objectives: ["EXP forecast profit v2"] };
    expect((await owner.from("events").update({ settings: s, public_settings: { invite_token: "exp-forged" } }).eq("id", pub)).error).toBeNull();
    const v = (await (anon() as unknown as Db).from("events_public").select("settings").eq("id", pub).single()).data as { settings: Record<string, unknown> };
    expect(v.settings.faqs).toEqual([{ q: "EXP updated?", a: "Yes." }]);
    expect(JSON.stringify(v)).not.toMatch(/exp-forged|EXP forecast profit|objectives/);
  });

  test("members keep every column through the base table", async () => {
    const { data, error } = await owner.from("events").select("budget_total,client_name,goal,settings").eq("id", pub).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ client_name: "EXP Client Ltd", goal: "EXP private goal text" });
    expect(Number((data as { budget_total: number }).budget_total)).toBe(4242.42);
    expect((data as { settings: Record<string, unknown> }).settings).toHaveProperty("objectives");
  });

  test("public RPCs never carry private columns or raw settings", async () => {
    const A = anon() as unknown as Db;
    const text = JSON.stringify(await Promise.all([A.rpc("directory_events", { p_scope: "all", p_limit: 100 }), A.rpc("directory_related", { p_event: pub }), A.rpc("event_share_card", { p_event: pub }),
      A.rpc("public_event_extras", { p_event: pub }), A.rpc("public_event_getting_there", { p_event: pub })]).then(r => r.map(x => x.data)));
    for (const x of SECRETS) expect(text).not.toContain(x);
    expect(text).not.toMatch(/"(budget_total|revenue_goal|target_profit|client_name|client_id|lead_id|goal|priorities|guest_count|owner_id|invite_token)"/);
  });

  test("base table closed to anon / outsiders (after 202610294085)", async () => {
    test.skip(!closed, "202610294085 is staged; applied after the production deploy");
    const A = anon() as unknown as Db;
    for (const col of ["settings", "budget_total", "client_name", "goal", "owner_id", "priorities"]) expect((await A.from("events").select(col).eq("id", pub)).error).not.toBeNull();
    expect((await A.from("events").select("id,name,slug").eq("id", pub).single()).data).toMatchObject({ id: pub });
    expect((await out.from("events").select("id,budget_total").eq("id", pub)).data ?? []).toEqual([]);
    expect(((await out.from("ticket_tiers").select("id").eq("event_id", pub)).error)).toBeNull();
  });
});
