import { test, expect } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, BASE, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";
import { TAXONOMIES } from "../../src/lib/master-data/catalog";

// W11 backend (lane C, migrations 202610293024–3026): (a) per-type ticketing mode enforced when a tier opens, for every writer;
// (b) private guest privacy — guest list / RSVP never readable by anon or outsiders, no public share preview; (c) the direct
// status-write bypass is closed by a row trigger (with an explicit, audited, transaction-local override for seeds); (d) every
// event-type taxonomy term maps to a profile and the UI lookup returns the resolved rules. API level, disposable identities; the
// service role is used for fixtures and service-only resolvers only.

type Db = SupabaseClient;
type U = { id: string; email: string };
const db = admin as unknown as Db;
const day = 864e5;
const iso = (ms: number) => new Date(ms).toISOString();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const keys = (b: unknown) => ((b ?? []) as { key: string }[]).map(x => x.key);

test.describe.configure({ mode: "serial" });

test.describe("W11 event-type rules (backend a–d)", () => {
  let O: U, C: U, X: U; let oc: Db, cc: Db, xc: Db; let W: string;
  const events: string[] = [];
  const mk = async (client: Db, row: Record<string, unknown>) => {
    const r = await client.from("events").insert({ starts_at: iso(Date.now() + 30 * day), status: "draft", ...row }).select("id").single();
    expect(r.error, JSON.stringify(row)).toBeNull();
    events.push((r.data as { id: string }).id);
    return (r.data as { id: string }).id;
  };
  const org = (type: string, extra: Record<string, unknown> = {}) => mk(oc, { owner_id: O.id, workspace_id: W, management: "professional", name: `W11R ${type}`, event_type: type, ...extra });

  test.beforeAll(async () => {
    [O, C, X] = await Promise.all([createUser("w11r-org"), createUser("w11r-cust"), createUser("w11r-out")]);
    W = await seedWorkspace(O.id, "organizer", "W11 Rules Events");
    [oc, cc, xc] = await Promise.all([signedIn(O.email), signedIn(C.email), signedIn(X.email)]) as unknown as [Db, Db, Db];
  });
  test.afterAll(async () => {
    for (const e of events) {
      await db.from("ticket_tiers").delete().eq("event_id", e); await db.from("guest_care").delete().eq("event_id", e); await db.from("guests").delete().eq("event_id", e);
      await db.from("event_guest_links").delete().eq("event_id", e); await db.from("events").delete().eq("id", e);
    }
    await db.from("workspaces").delete().eq("id", W);
    await cleanup();
  });

  test("(a) profile ticketing modes match the W11 decision", async () => {
    const rows = ((await db.from("event_type_profiles").select("event_type,ticketing")).data ?? []) as { event_type: string; ticketing: string }[];
    const mode = Object.fromEntries(rows.map(r => [r.event_type, r.ticketing]));
    for (const t of ["concert", "festival", "nightlife", "conference", "webinar", "charity", "custom"]) expect(mode[t], t).toBe("default_on");
    for (const t of ["wedding", "birthday", "gala"]) expect(mode[t], t).toBe("optional_off");
    expect(mode.childrens_party).toBe("private_only");
  });

  test("(a) optional_off: a wedding tier cannot open until the host switches ticketing on — direct writes included", async () => {
    const ev = await org("wedding", { capacity: 120, guest_count: 100 });
    const direct = await oc.from("ticket_tiers").insert({ event_id: ev, name: "Guest", price: 0, quantity: 100, status: "on_sale" });
    expect(direct.error?.message ?? "").toMatch(/ticketing_not_enabled/);
    // the service role is a writer too
    expect((await db.from("ticket_tiers").insert({ event_id: ev, name: "Guest", price: 0, quantity: 100, status: "scheduled", sale_start: iso(Date.now() + day) })).error?.message ?? "").toMatch(/ticketing_not_enabled/);
    expect(((await oc.rpc("event_ticketing_policy", { p_event: ev })).data as { allowed: boolean; mode: string })).toMatchObject({ allowed: false, mode: "optional_off" });
    expect(keys((await oc.rpc("event_lifecycle_blockers", { p_event: ev, p_to: "on_sale" })).data)).toContain("ticketing");
    // outsiders cannot flip it; the host can
    expect((await xc.rpc("event_set_ticketing", { p_event: ev, p_on: true })).error?.message ?? "").toMatch(/not_authorized/);
    expect(((await oc.rpc("event_set_ticketing", { p_event: ev, p_on: true })).data as { ok: boolean; allowed: boolean })).toMatchObject({ ok: true, allowed: true });
    const t = await oc.from("ticket_tiers").insert({ event_id: ev, name: "Guest", price: 0, quantity: 100, status: "on_sale" }).select("id").single();
    expect(t.error).toBeNull();
    expect(keys((await oc.rpc("event_lifecycle_blockers", { p_event: ev, p_to: "on_sale" })).data)).not.toContain("ticketing");
    // switching off while a tier sells is refused
    expect(((await oc.rpc("event_set_ticketing", { p_event: ev, p_on: false })).data as { error: string }).error).toBe("tickets_selling");
  });

  test("(a) existing sellers are grandfathered: a release chain on a selling gala keeps opening tiers", async () => {
    const ev = await org("awards", { capacity: 300, guest_count: 250 });   // awards → gala profile (optional_off)
    // fixture: a gala that was already selling before W11 (sold tickets) — then the next release opens without the opt-in flag
    expect((await db.from("ticket_tiers").insert({ event_id: ev, name: "Early bird", price: 95, quantity: 20, sold: 20, status: "sold_out" })).error).toBeNull();
    expect((await oc.from("ticket_tiers").insert({ event_id: ev, name: "Standard", price: 125, quantity: 200, status: "on_sale" })).error).toBeNull();
  });

  test("(a) private_only: a children's party tier opens only for a private invite path, never publicly", async () => {
    const ev = await mk(cc, { owner_id: C.id, management: "consumer", name: "W11R kids party", event_type: "childrens_party", guest_count: 14, visibility: "public" });
    expect(((await db.from("events").select("visibility").eq("id", ev).single()).data as { visibility: string }).visibility).toBe("private");
    expect((await cc.from("ticket_tiers").insert({ event_id: ev, name: "Child", price: 0, quantity: 20, status: "on_sale" })).error?.message ?? "").toMatch(/ticketing_private_only/);
    expect((await db.from("event_guest_links").insert({ event_id: ev, token_hash: sha(randomBytes(32).toString("base64url")), label: "Class invite", expires_at: iso(Date.now() + 20 * day), created_by: C.id })).error).toBeNull();
    expect((await cc.from("ticket_tiers").insert({ event_id: ev, name: "Child", price: 0, quantity: 20, status: "on_sale" })).error).toBeNull();
    // still never purchasable publicly: public checkout needs a public, published event
    const tier = ((await db.from("ticket_tiers").select("id").eq("event_id", ev).single()).data as { id: string }).id;
    const hold = await db.rpc("hold_tickets", { p_event: ev, p_items: [{ tier, qty: 1 }], p_token: randomBytes(16).toString("hex") });
    expect(hold.error?.message ?? "").toMatch(/not_on_sale/);
  });

  test("(b) private guest privacy: guest list and RSVP data are never readable by anon or outsiders; no share preview", async () => {
    const ev = await mk(cc, { owner_id: C.id, management: "consumer", name: "W11R Sam & Alex wedding", event_type: "wedding", guest_count: 80, visibility: "private" });
    const g = await cc.from("guests").insert({ event_id: ev, name: "Priya Guest", email: "priya@example.test", status: "invited" }).select("id").single();
    expect(g.error).toBeNull();
    const gid = (g.data as { id: string }).id;
    const rsvp = randomBytes(32).toString("base64url");
    expect((await cc.rpc("set_guest_rsvp_token", { p_guest: gid, p_token_hash: sha(rsvp) })).error).toBeNull();
    expect((await db.from("guest_care").insert({ guest_id: gid, event_id: ev, dietary: "Vegetarian", allergies: "", accessibility: "", access_flags: [] })).error).toBeNull();
    const a = anon() as unknown as Db;
    for (const [who, c] of [["anon", a], ["outsider", xc]] as const) {
      expect(((await c.from("guests").select("id,name,email").eq("event_id", ev)).data ?? []).length, `${who} guests`).toBe(0);
      expect(((await c.from("guest_care").select("id").eq("event_id", ev)).data ?? []).length, `${who} care`).toBe(0);
      expect(((await c.from("guest_groups").select("id").eq("event_id", ev)).data ?? []).length, `${who} groups`).toBe(0);
      expect(((await c.from("events").select("id").eq("id", ev)).data ?? []).length, `${who} event`).toBe(0);
      expect(((await c.from("event_guest_links").select("id").eq("event_id", ev)).data ?? []).length, `${who} links`).toBe(0);
      // RSVP / guest-link resolvers are service-only (the token pages call them server-side)
      expect((await c.rpc("guest_rsvp", { p_token_hash: sha(rsvp), p_response: "confirmed" })).error, `${who} guest_rsvp`).not.toBeNull();
      expect((await c.rpc("event_guest_view", { p_token_hash: sha(rsvp) })).error, `${who} event_guest_view`).not.toBeNull();
    }
    // the host still sees them
    expect(((await cc.from("guests").select("id").eq("event_id", ev)).data ?? []).length).toBe(1);
    expect((await db.rpc("event_guest_privacy", { p_event: ev })).data).toBe("private");
    for (const t of ["wedding", "birthday", "party", "private_dinner", "childrens_party"]) {
      expect(((await oc.rpc("event_type_rules", { p_type: t })).data as { share_preview: boolean }).share_preview, `${t} share_preview`).toBe(false);
    }
    expect(((await oc.rpc("event_type_rules", { p_type: "festival" })).data as { share_preview: boolean }).share_preview).toBe(true);
  });

  test("(b) token pages send no Open Graph preview and are not indexable (HTTP, no browser)", async () => {
    const ev = await mk(cc, { owner_id: C.id, management: "consumer", name: "W11R Birthday at The Ivy", event_type: "birthday", guest_count: 30, visibility: "private" });
    const token = randomBytes(32).toString("base64url");
    expect((await db.from("event_guest_links").insert({ event_id: ev, token_hash: sha(token), label: "Friends", expires_at: iso(Date.now() + 20 * day), created_by: C.id })).error).toBeNull();
    let res: Response | null = null;
    try { res = await fetch(`${BASE}/guest/${token}`, { signal: AbortSignal.timeout(90_000) }); } catch { /* dev server not running */ }
    test.skip(!res, "dev server not reachable — DB assertions above still ran");
    const html = await res!.text();
    expect(res!.status).toBe(200);
    expect(html).toContain("W11R Birthday at The Ivy");                       // the invitee sees the page …
    expect(html).not.toMatch(/property="og:(title|description|image)"[^>]*W11R/);   // … but no share card carries the event
    expect(html).toMatch(/<meta name="robots" content="noindex, ?nofollow"/);
  });

  test("(c) organisers cannot bypass lifecycle blockers by writing status directly; event_transition still works", async () => {
    const ev = await org("concert", { starts_at: null, capacity: 400 });
    const direct = await oc.from("events").update({ status: "published", visibility: "public" }).eq("id", ev);
    expect(direct.error?.message ?? "").toMatch(/lifecycle_preconditions/);
    expect(((await db.from("events").select("status").eq("id", ev).single()).data as { status: string }).status).toBe("draft");
    const ins = await oc.from("events").insert({ owner_id: O.id, workspace_id: W, management: "professional", name: "W11R insert on sale", event_type: "custom", status: "on_sale", starts_at: iso(Date.now() + 9 * day) }).select("id");
    expect(ins.error?.message ?? "").toMatch(/lifecycle_preconditions/);
    // a single UPDATE that also fixes the blockers is judged on the new values
    const fix = await oc.from("events").update({ status: "ready", starts_at: iso(Date.now() + 40 * day), ends_at: iso(Date.now() + 40 * day + 5 * 36e5), settings: { venue_confirmed: "true" } }).eq("id", ev);
    const readyBlockers = keys((await oc.rpc("event_lifecycle_blockers", { p_event: ev, p_to: "ready" })).data);
    // ops/compliance gating (lane C 3019) may still hold it — the trigger and event_transition agree either way
    if (fix.error) expect(fix.error.message).toMatch(/lifecycle_preconditions/);
    else expect(((await db.from("events").select("status").eq("id", ev).single()).data as { status: string }).status).toBe("ready");
    test.info().annotations.push({ type: "c", description: JSON.stringify({ ready_direct: fix.error ? "refused" : "ok", readyBlockers }) });
    // the hatch and the core are not callable by users; the audit log is admin-only
    expect((await oc.rpc("event_lifecycle_override_begin", { p_reason: "let me through please" })).error).not.toBeNull();
    expect((await oc.rpc("service_set_event_status", { p_event: ev, p_to: "published", p_reason: "let me through please" })).error).not.toBeNull();
    expect((await oc.rpc("event_lifecycle_blockers_for", { p_event: ev, p_to: "published", p_from: "draft" })).error).not.toBeNull();
    expect(((await oc.from("event_lifecycle_overrides").select("id")).data ?? []).length).toBe(0);
  });

  test("(c) explicit, audited override for seeds; already-selling events are never re-blocked; cancel unaffected", async () => {
    const ev = await org("festival", { capacity: 2000 });   // no end, no programme, no venue → blocked
    const r = await db.rpc("service_set_event_status", { p_event: ev, p_to: "published", p_reason: "W11R spec: seed fixture" });
    expect(r.error).toBeNull();
    const grant = (r.data as { override: string }).override;
    const log = ((await db.from("event_lifecycle_overrides").select("kind,source,grant_id,to_status,blockers").eq("event_id", ev)).data ?? []) as { kind: string; source: string; grant_id: string; to_status: string; blockers: unknown }[];
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ kind: "use", source: "override", grant_id: grant, to_status: "published" });
    expect(keys(log[0].blockers)).toEqual(expect.arrayContaining(["end", "programme", "venue"]));
    expect((await db.from("event_lifecycle_overrides").update({ reason: "edited" }).eq("event_id", ev)).error?.message ?? "").toMatch(/append_only/);
    expect((await db.rpc("service_set_event_status", { p_event: ev, p_to: "on_sale", p_reason: "short" })).error?.message ?? "").toMatch(/reason_required/);
    // published → on_sale by the organiser is not a first entry: the row guard does not re-check (event_transition still lists blockers)
    expect((await db.from("ticket_tiers").insert({ event_id: ev, name: "Weekend", price: 0, quantity: 500, status: "on_sale" })).error).toBeNull();
    expect((await oc.from("events").update({ status: "on_sale" }).eq("id", ev)).error).toBeNull();
    expect((await oc.rpc("event_transition", { p_event: ev, p_to: "postponed", p_reason: "W11R" })).error).toBeNull();
    const draft = await org("custom", { starts_at: null });
    expect((await oc.from("events").update({ status: "cancelled" }).eq("id", draft)).error).toBeNull();
  });

  test("(c) Q40 composition blockers gate first entry (block severity only): a sub-event cannot publish before its parent", async () => {
    const base = { starts_at: iso(Date.now() + 45 * day), ends_at: iso(Date.now() + 45 * day + 4 * 36e5), capacity: 300, settings: { venue_confirmed: "true" } };
    const parent = await org("custom", base);
    const child = await org("custom", { ...base, parent_event_id: parent, composition_role: "sub_event" });
    const b = (await oc.rpc("event_lifecycle_blockers", { p_event: child, p_to: "published" })).data as { key: string; severity?: string }[];
    expect(b.filter(x => x.severity).map(x => [x.key, x.severity])).toEqual([["parent_not_published", "block"]]);
    expect((await oc.from("events").update({ status: "published", visibility: "public" }).eq("id", child)).error?.message ?? "").toMatch(/Publish the parent/);
    expect(((await oc.rpc("event_transition", { p_event: child, p_to: "published", p_expected: "draft" })).data as { ok: boolean }).ok).toBe(false);
    // other targets (cancel/complete/archive) never carry composition rows through the lifecycle gate
    expect(((await oc.rpc("event_lifecycle_blockers", { p_event: parent, p_to: "cancelled" })).data as { severity?: string }[]).filter(x => x.severity)).toEqual([]);
  });

  test("(d) every event_type taxonomy term maps to a profile; wizard types resolve as decided", async () => {
    const map = ((await (anon() as unknown as Db).from("event_type_aliases").select("event_type,profile,kind,plan_tile,organizer_tile")).data ?? []) as { event_type: string; profile: string; kind: string; plan_tile: string | null; organizer_tile: boolean }[];
    const byType = Object.fromEntries(map.map(m => [m.event_type, m]));
    for (const term of TAXONOMIES.event_type.terms) expect(byType[term.key], `taxonomy term ${term.key}`).toBeTruthy();
    const expected: Record<string, [string, string]> = {
      corporate: ["custom", "custom_alias"], community: ["custom", "custom_alias"], food_drink: ["custom", "custom_alias"],
      party: ["birthday", "alias"], private_dinner: ["birthday", "alias"], awards: ["gala", "alias"], comedy: ["concert", "alias"],
    };
    for (const [t, [profile, kind]] of Object.entries(expected)) {
      expect(byType[t], t).toMatchObject({ profile, kind });
      const r = (await oc.rpc("event_type_rules", { p_type: t })).data as { profile: string; kind: string; ticketing: string };
      expect(r, t).toMatchObject({ profile, kind });
    }
    for (const t of ["gala", "charity", "conference"]) expect(byType[t].organizer_tile, `${t} organiser tile`).toBe(true);
    expect(((await oc.rpc("event_type_rules", { p_type: "something_new" })).data as { profile: string; kind: string })).toMatchObject({ profile: "custom", kind: "unknown" });
    expect((await (anon() as unknown as Db).rpc("event_type_rules", { p_type: "wedding" })).error).not.toBeNull();   // signed-in lookup; anon reads the table
    // the alias drives lifecycle rules: comedy now needs an end time and capacity (concert profile)
    const ev = await org("comedy", { capacity: null, settings: { venue_confirmed: "true" } });
    expect(keys((await oc.rpc("event_lifecycle_blockers", { p_event: ev, p_to: "published" })).data)).toEqual(expect.arrayContaining(["end", "capacity"]));
    // a party (private-celebration profile) has private guest privacy
    const party = await org("party", { guest_count: 40 });
    expect((await db.rpc("event_guest_privacy", { p_event: party })).data).toBe("private");
  });
});
