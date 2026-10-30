import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn, insertEventFixture } from "../phase1/helpers";

// Lane C public event page (migration 202610294060): public_event_extras(p_event) — the one anon-callable read of organiser-built
// features that had no public source. Disposable workspace + events: a public on-sale event with a confirmed sponsor (fee, contacts,
// notes and package price that must never leak), a negotiating exhibitor (not public), an allocated booth and an approved
// accessibility summary; a private on-sale copy and a draft copy that must return nothing to anon and to an outsider.

type Db = SupabaseClient;
const db = admin as unknown as Db;
const iso = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
const SECRETS = ["pex-secret@example.com", "+44 7700 900461", "PEX private note", "4061.5", "PEX Contact Person", "Champagne bar benefit"];
const PRIVATE_KEYS = /"(fee|price|currency|contact_[a-z]+|notes|benefits|contract_id|client_id|portal_user_id|package_id|status_reason|workspace_id|route_note|approved_by)"/;

test.describe.configure({ mode: "serial" });

test.describe("public_event_extras (202610294060)", () => {
  let W: string; let out: Db; const events: string[] = [];
  let pub = "", priv = "", draft = "";

  const mkEvent = async (name: string, visibility: string, status: string) => {
    const r = await insertEventFixture({ workspace_id: W, owner_id: ownerId, management: "professional", name, visibility, status, event_type: "concert", starts_at: iso(40), ends_at: iso(40.2) }, "public_event_extras spec").select("id").single();
    expect(r.error).toBeNull(); const id = (r.data as { id: string }).id; events.push(id); return id;
  };
  let ownerId = "";
  const dress = async (ev: string) => {
    const sp = await db.from("event_parties").insert({ event_id: ev, workspace_id: W, kind: "sponsor", name: "PEX Gold Sponsor", status: "confirmed", fee: 4061.5, currency: "GBP", contact_name: "PEX Contact Person", contact_email: "pex-secret@example.com", contact_phone: "+44 7700 900461", notes: "PEX private note",
      package_snapshot: { name: "Gold package", tier: "Gold", price: 4061.5, benefits: ["Champagne bar benefit"] } }).select("id").single();
    expect(sp.error).toBeNull();
    const ex = await db.from("event_parties").insert({ event_id: ev, workspace_id: W, kind: "exhibitor", name: "PEX Exhibitor Confirmed", status: "confirmed" }).select("id").single();
    expect(ex.error).toBeNull();
    expect((await db.from("event_parties").insert({ event_id: ev, workspace_id: W, kind: "exhibitor", name: "PEX Exhibitor Negotiating", status: "negotiating" })).error).toBeNull();
    expect((await db.from("exhibitor_booths").insert({ event_id: ev, workspace_id: W, code: "PX1", name: "Hall A", party_id: (ex.data as { id: string }).id, status: "allocated", price: 999 })).error).toBeNull();
    expect((await db.from("event_accessibility").insert({ event_id: ev, workspace_id: W, step_free: true, hearing_loop: true, accessible_toilets: 2, public_summary: "PEX step-free throughout.", summary_status: "approved", route_note: "PEX internal route note" })).error).toBeNull();
    expect((await db.from("event_days").insert({ event_id: ev, day_date: iso(40).slice(0, 10), label: "PEX Day One", starts_at: iso(40), ends_at: iso(40.2), status: "scheduled" })).error).toBeNull();
  };

  test.beforeAll(async () => {
    const [O, X] = await Promise.all([createUser("pex-org"), createUser("pex-out")]);
    ownerId = O.id;
    W = await seedWorkspace(O.id, "organizer", "PEX Public Extras");
    out = await signedIn(X.email) as unknown as Db;
    pub = await mkEvent("PEX Public", "public", "on_sale");
    priv = await mkEvent("PEX Private", "private", "on_sale");
    draft = await mkEvent("PEX Draft", "public", "draft");
    for (const ev of [pub, priv, draft]) await dress(ev);
  });
  test.afterAll(async () => {
    for (const ev of events) {
      for (const t of ["exhibitor_booths", "event_accessibility", "event_days", "event_parties"]) await db.from(t).delete().eq("event_id", ev);
      await db.from("events").delete().eq("id", ev);
    }
    if (W) await db.from("workspaces").delete().eq("id", W);
    await cleanup();
  });

  test("anon gets the public fields for a public on-sale event", async () => {
    const { data, error } = await (anon() as unknown as Db).rpc("public_event_extras", { p_event: pub });
    expect(error).toBeNull();
    const j = data as { partners: { kind: string; name: string; tier: string | null; booth: string | null; logo: string | null }[]; accessibility: Record<string, unknown> | null; days: { label: string }[]; venues: unknown[]; sub_events: unknown[]; passes: unknown[] };
    expect(Object.keys(j).sort()).toEqual(["accessibility", "days", "partners", "passes", "sub_events", "venues"]);
    expect(j.partners).toEqual(expect.arrayContaining([{ kind: "sponsor", name: "PEX Gold Sponsor", tier: "Gold", booth: null, logo: null }, { kind: "exhibitor", name: "PEX Exhibitor Confirmed", tier: null, booth: "PX1 · Hall A", logo: null }]));
    expect(j.partners.map(p => p.name)).not.toContain("PEX Exhibitor Negotiating");
    for (const p of j.partners) expect(Object.keys(p).sort()).toEqual(["booth", "kind", "logo", "name", "tier"]);
    expect(j.accessibility).toMatchObject({ summary: "PEX step-free throughout.", step_free: true, hearing_loop: true, accessible_toilets: true });
    expect(j.days.map(d => d.label)).toEqual(["PEX Day One"]);
  });

  test("logos (202610294063): shown for confirmed parties only", async () => {
    const logo = (ws: string) => `https://example.supabase.co/storage/v1/object/public/event-media/${ws}/0f0e0d0c-0b0a-4908-8706-050403020100.png`;
    const neg = (await db.from("event_parties").select("id").eq("event_id", pub).eq("name", "PEX Exhibitor Negotiating").single()).data as { id: string };
    const conf = (await db.from("event_parties").select("id").eq("event_id", pub).eq("name", "PEX Gold Sponsor").single()).data as { id: string };
    expect((await db.from("event_parties").update({ logo_url: logo(W) }).in("id", [neg.id, conf.id])).error).toBeNull();
    expect((await db.from("event_parties").update({ logo_url: "javascript:alert(1)" }).eq("id", conf.id)).error).not.toBeNull();
    const { data } = await (anon() as unknown as Db).rpc("public_event_extras", { p_event: pub });
    const partners = (data as { partners: { name: string; logo: string | null }[] }).partners;
    expect(partners.find(p => p.name === "PEX Gold Sponsor")?.logo).toBe(logo(W));
    expect(partners.map(p => p.name)).not.toContain("PEX Exhibitor Negotiating");
    for (const ev of [priv, draft]) expect((await (anon() as unknown as Db).rpc("public_event_extras", { p_event: ev })).data).toBeNull();
    // anon cannot run the command; an outsider is refused
    expect((await (anon() as unknown as Db).rpc("party_set_logo", { p_party: conf.id, p_url: null })).error).not.toBeNull();
    expect((await out.rpc("party_set_logo", { p_party: conf.id, p_url: null })).error?.message ?? "").toMatch(/not_authorized/);
    await db.from("event_parties").update({ logo_url: null }).in("id", [neg.id, conf.id]);
  });

  test("no private column or value leaks", async () => {
    const text = JSON.stringify((await (anon() as unknown as Db).rpc("public_event_extras", { p_event: pub })).data);
    for (const s of SECRETS) expect(text).not.toContain(s);
    expect(text).not.toContain("PEX internal route note");
    expect(text).not.toMatch(PRIVATE_KEYS);
  });

  test("anon and an outsider get nothing for private or draft events", async () => {
    for (const client of [anon() as unknown as Db, out]) {
      for (const ev of [priv, draft]) {
        const { data, error } = await client.rpc("public_event_extras", { p_event: ev });
        expect(error).toBeNull(); expect(data).toBeNull();
      }
      expect((await client.rpc("public_event_extras", { p_event: "00000000-0000-4000-8000-000000000000" })).data).toBeNull();
    }
  });

  test("an unapproved accessibility summary is not public", async () => {
    await db.from("event_accessibility").update({ summary_status: "draft" }).eq("event_id", pub);
    const { data } = await (anon() as unknown as Db).rpc("public_event_extras", { p_event: pub });
    expect((data as { accessibility: unknown }).accessibility).toBeNull();
  });

  test("the seeded Neon Nights page source returns confirmed partners and approved accessibility", async () => {
    const { data } = await (anon() as unknown as Db).rpc("public_event_extras", { p_event: "392fdf17-4e5c-4473-987c-251dc0a97228" });
    const j = data as { partners: unknown[]; accessibility: { summary: string } | null } | null;
    expect(j).not.toBeNull();
    expect(j!.partners.length).toBeGreaterThan(0);
    expect(j!.accessibility?.summary).toBeTruthy();
    expect(JSON.stringify(j)).not.toMatch(PRIVATE_KEYS);
  });
});
