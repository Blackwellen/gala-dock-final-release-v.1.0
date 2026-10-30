import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn, updateEventFixture } from "../phase1/helpers";

// W11 (v6 GD-12): event-type matrix. For every event_type_profiles row (11 types) plus one non-profile type (falls back to `custom`),
// asserts the backend rules: lifecycle blockers for publish, venue/stream/end/capacity/guests/programme requirements, public listing
// (children's parties never public — not via event_transition, not via a direct row update, not via visibility), guest privacy
// (minimised → no free-text care notes), and that on-sale needs a ticket tier. API level, disposable identities; the service role
// is used only for fixtures and for service-only resolvers.

type Profile = { event_type: string; online: boolean; requires_venue: boolean; requires_end: boolean; requires_capacity: boolean; requires_guests: boolean;
  requires_programme: boolean; public_listing_allowed: boolean; guest_privacy: string; modules: string[] };
type U = { id: string; email: string };
const db = admin as unknown as SupabaseClient;
const day = 864e5;
const iso = (ms: number) => new Date(ms).toISOString();
const all = (b: unknown) => ((b ?? []) as { key: string }[]).map(x => x.key).sort();
// Profile (GD-12) blockers. Lane C's Q24–Q26 operations/compliance gating (event_ops_blockers, keys ops_*) is reported, not asserted here.
const keys = (b: unknown) => all(b).filter(k => !k.startsWith("ops_"));
const ops = (b: unknown) => all(b).filter(k => k.startsWith("ops_"));

const EXPECTED: Record<string, Partial<Profile>> = {
  // Product expectations (docs/architecture/event-core.md §GD-12). Asserted against the live table so drift is caught.
  childrens_party: { public_listing_allowed: false, guest_privacy: "minimised", requires_guests: true },
  webinar: { online: true, requires_venue: false, requires_end: true },
  festival: { requires_end: true, requires_capacity: true, requires_programme: true },
  concert: { requires_end: true, requires_capacity: true },
  nightlife: { requires_end: true, requires_capacity: true },
  conference: { requires_end: true, requires_programme: true },
  wedding: { guest_privacy: "private", requires_guests: true },
  birthday: { guest_privacy: "private", requires_guests: true },
  gala: { requires_guests: true }, charity: { requires_guests: true }, custom: {},
};

test.describe.configure({ mode: "serial" });

test.describe("W11 event-type matrix (backend)", () => {
  let O: U, C: U; let oc: SupabaseClient, cc: SupabaseClient; let W: string;
  let profiles: Profile[] = [];
  const events: string[] = [];
  const mk = async (type: string, extra: Record<string, unknown> = {}) => {
    const r = await oc.from("events").insert({ owner_id: O.id, workspace_id: W, management: "professional", name: `W11 ${type}`, event_type: type, status: "draft", starts_at: iso(Date.now() + 30 * day), ...extra }).select("id").single();
    expect(r.error, type).toBeNull();
    events.push((r.data as { id: string }).id);
    return (r.data as { id: string }).id;
  };
  const profileOf = (t: string) => profiles.find(p => p.event_type === t) ?? profiles.find(p => p.event_type === "custom")!;
  const expectedBlockers = (p: Profile) => [
    p.requires_end && "end", p.requires_venue && !p.online && "venue", p.online && "stream", p.requires_capacity && "capacity", p.requires_guests && "guests",
    !p.public_listing_allowed && "public_listing", p.requires_programme && "programme"].filter(Boolean).sort() as string[];
  const satisfy = async (id: string, p: Profile) => {
    expect((await oc.from("events").update({ ends_at: iso(Date.now() + 30 * day + 5 * 36e5), capacity: 120, guest_count: 80, settings: { venue_confirmed: "true" } }).eq("id", id)).error).toBeNull();
    if (p.requires_programme) expect((await db.from("programme_items").insert({ event_id: id, starts_at: iso(Date.now() + 30 * day + 36e5), title: "Opening set", kind: "programme" })).error).toBeNull();
    if (p.online) expect((await db.from("event_virtual").insert({ event_id: id, provider: "manual", format: "webinar", join_url: "https://example.com/join/w11" })).error).toBeNull();
  };

  test.beforeAll(async () => {
    [O, C] = await Promise.all([createUser("w11-org"), createUser("w11-cust")]);
    W = await seedWorkspace(O.id, "organizer", "W11 Matrix Events");
    [oc, cc] = await Promise.all([signedIn(O.email), signedIn(C.email)]) as unknown as [SupabaseClient, SupabaseClient];
    profiles = ((await db.from("event_type_profiles").select("*")).data ?? []) as Profile[];
  });
  test.afterAll(async () => {
    for (const e of events) { await db.from("programme_items").delete().eq("event_id", e); await db.from("event_virtual").delete().eq("event_id", e); await db.from("guests").delete().eq("event_id", e); await db.from("events").delete().eq("id", e); }
    await db.from("workspaces").delete().eq("id", W);
    await cleanup();
  });

  test("profiles: exactly the 11 documented types, matching the product expectations", () => {
    expect(profiles.map(p => p.event_type).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const [t, exp] of Object.entries(EXPECTED)) expect(profileOf(t), t).toMatchObject(exp);
  });

  for (const type of [...Object.keys(EXPECTED), "corporate"]) {
    test(`${type}: publish blockers follow the profile; once met, publish is allowed only where public listing is`, async () => {
      const p = profileOf(type);
      const id = await mk(type);
      const before = await oc.rpc("event_lifecycle_blockers", { p_event: id, p_to: "published" });
      expect(before.error).toBeNull();
      expect(keys(before.data), `${type} initial blockers`).toEqual(expectedBlockers(p));
      // ready (no public-listing / programme checks) carries the structural requirements only
      expect(keys((await oc.rpc("event_lifecycle_blockers", { p_event: id, p_to: "ready" })).data)).toEqual(expectedBlockers(p).filter(k => !["public_listing", "programme"].includes(k)));
      await satisfy(id, p);
      const after = await oc.rpc("event_lifecycle_blockers", { p_event: id, p_to: "published" });
      expect(keys(after.data), `${type} after requirements met`).toEqual(p.public_listing_allowed ? [] : ["public_listing"]);
      const opsLeft = ops(after.data);
      test.info().annotations.push({ type: "matrix", description: JSON.stringify({ type, initial: all(before.data), ops_after_profile_met: opsLeft }) });
      const tr = (await oc.rpc("event_transition", { p_event: id, p_to: "published", p_expected: "draft" })).data as { ok: boolean; blockers?: unknown };
      expect(tr.ok, `${type} publish`).toBe(p.public_listing_allowed && opsLeft.length === 0);
      if (!tr.ok) expect(keys(tr.blockers)).toEqual(p.public_listing_allowed ? [] : ["public_listing"]);
      // on-sale always needs a ticket tier (ticketing is not switched off per type — see W11 report)
      expect(keys((await oc.rpc("event_lifecycle_blockers", { p_event: id, p_to: "on_sale" })).data)).toContain("tickets");
      // anonymous visitors see it only when it was published
      const pub = (await (anon() as unknown as SupabaseClient).from("events").select("id").eq("id", id)).data ?? [];
      expect(pub.length, `${type} anon visibility`).toBe(tr.ok ? 1 : 0);
      // guest privacy resolves from the profile (service-only resolver)
      expect((await db.rpc("event_guest_privacy", { p_event: id })).data).toBe(p.guest_privacy);
    });
  }

  test("children's party: never public — direct status/visibility writes are refused or forced private (organiser and customer)", async () => {
    const id = await mk("childrens_party", { visibility: "public" });
    expect(((await db.from("events").select("visibility").eq("id", id).single()).data as { visibility: string }).visibility).toBe("private");
    await satisfy(id, profileOf("childrens_party"));
    const direct = await oc.from("events").update({ status: "published", visibility: "public" }).eq("id", id);
    expect(direct.error?.message ?? "").toMatch(/public_listing_not_allowed/);
    expect((await oc.from("events").update({ visibility: "public" }).eq("id", id)).error).toBeNull();
    expect(((await db.from("events").select("visibility,status").eq("id", id).single()).data)).toEqual({ visibility: "private", status: "draft" });
    // retyping a published event into a children's party is refused
    const fest = await mk("custom"); await satisfy(fest, profileOf("custom"));
    const pubd = (await oc.rpc("event_transition", { p_event: fest, p_to: "published" })).data as { ok: boolean };
    if (!pubd.ok) expect((await updateEventFixture(fest, { status: "published", visibility: "public" }, "event-type-matrix")).error).toBeNull();   // ops gating (lane C) — fixture only
    expect((await oc.from("events").update({ event_type: "childrens_party" }).eq("id", fest)).error?.message ?? "").toMatch(/public_listing_not_allowed/);
    // customer (consumer) event created with "public" in the plan wizard is stored private
    const ce = await cc.from("events").insert({ owner_id: C.id, name: "W11 kids party", event_type: "childrens_party", visibility: "public", status: "draft" }).select("id,visibility").single();
    expect(ce.error).toBeNull(); events.push((ce.data as { id: string }).id);
    expect((ce.data as { visibility: string }).visibility).toBe("private");
  });

  test("guest privacy: minimised (children's party) refuses free-text care notes; other types accept them", async () => {
    for (const type of ["childrens_party", "wedding"]) {
      const id = await mk(type);
      const g = await oc.from("guests").insert({ event_id: id, name: "Sam Guest", is_child: type === "childrens_party" }).select("id").single();
      expect(g.error, `${type} guest`).toBeNull();
      const care = await db.from("guest_care").insert({ guest_id: (g.data as { id: string }).id, event_id: id, dietary: "", allergies: "nuts", accessibility: "", access_flags: [], notes: "Carries an inhaler" });
      if (type === "childrens_party") expect(care.error?.message ?? "").toMatch(/notes_not_allowed_for_childrens_event/);
      else expect(care.error).toBeNull();
    }
  });
});
