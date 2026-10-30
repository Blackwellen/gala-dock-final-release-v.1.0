import { randomBytes } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn, insertEventFixture } from "../phase1/helpers";

// Lane D4 / S2 (202610294036): promoter allocation mirror, registration drafts, door-staff assignment by email, and the
// organiser access-code path (allocation-linked discount_codes under RLS). API level with disposable identities — no UI.
type Db = SupabaseClient;
type Id = { id: string };
const db = admin as unknown as Db;
const iso = (ms: number) => new Date(ms).toISOString();
const rpc = <T = Record<string, unknown>>(c: Db, fn: string, args: Record<string, unknown>) => c.rpc(fn, args) as unknown as Promise<{ data: T; error: { message: string } | null }>;
type Sync = { results: { promoter_id: string; action: string; quantity?: number; capped?: boolean; target?: number; allocation_id?: string }[] };

test.describe.configure({ mode: "serial" });

test.describe("S2 access & inventory commands (4036)", () => {
  let owner: { id: string; email: string }, member: { id: string; email: string }, finance: { id: string; email: string }, door: { id: string; email: string }, outsider: { id: string; email: string };
  let ownerC: Db, memberC: Db, financeC: Db, doorC: Db, outsiderC: Db;
  let ws: string, ev: string, ga: string, vip: string, pA: string, pB: string, zone: string;

  test.beforeAll(async () => {
    [owner, member, finance, door, outsider] = await Promise.all(["s2-o", "s2-m", "s2-f", "s2-d", "s2-x"].map(l => createUser(l)));
    ws = await seedWorkspace(owner.id, "organizer", "S2 Events");
    await db.from("workspace_members").insert([{ workspace_id: ws, user_id: member.id, role: "member" }, { workspace_id: ws, user_id: finance.id, role: "finance" }]);
    ev = ((await insertEventFixture({ owner_id: owner.id, workspace_id: ws, management: "professional", name: `S2 ${randomBytes(3).toString("hex")}`, status: "on_sale", event_type: "gala", starts_at: iso(Date.now() + 7 * 864e5), capacity: 500, settings: { ticketed: true } }, "s2-access-inventory").select("id").single()).data as Id).id;
    ga = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "General", kind: "general", price: 20, quantity: 100, sold: 40, status: "on_sale", sort: 1 }).select("id").single()).data as Id).id;
    vip = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "VIP", kind: "vip", price: 80, quantity: 20, status: "on_sale", sort: 2 }).select("id").single()).data as Id).id;
    pA = ((await db.from("promoters").insert({ event_id: ev, name: "Promo A", code: `PA${randomBytes(2).toString("hex")}`, ticket_allocation: 50, tickets_sold: 10, status: "active" }).select("id").single()).data as Id).id;
    pB = ((await db.from("promoters").insert({ event_id: ev, name: "Promo B", code: `PB${randomBytes(2).toString("hex")}`, ticket_allocation: 40, tickets_sold: 0, status: "active" }).select("id").single()).data as Id).id;
    zone = ((await db.from("access_zones").insert({ event_id: ev, name: "Backstage", kind: "backstage" }).select("id").single()).data as Id).id;
    [ownerC, memberC, financeC, doorC, outsiderC] = (await Promise.all([owner, member, finance, door, outsider].map(u => signedIn(u.email)))) as unknown as Db[];
  });
  test.afterAll(async () => {
    await db.from("events").delete().eq("id", ev);
    await db.from("workspaces").delete().eq("id", ws);
    await cleanup();
  });

  test("promoter mirror: capped by free stock, idempotent, opt-in trigger, never below used; finance/outsider/anon refused", async () => {
    for (const c of [financeC, outsiderC]) expect((await rpc(c, "sync_promoter_allocations", { p_event: ev })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(anon() as unknown as Db, "sync_promoter_allocations", { p_event: ev })).error).not.toBeNull();
    expect((await rpc(memberC, "sync_promoter_allocations", { p_event: ev, p_tier: randomBytesUuid() })).error?.message).toMatch(/tier_not_in_event/);
    // GA: 100 − 40 sold = 60 free. A wants 50 − 10 = 40, B wants 40 → B is capped at 20.
    const first = (await rpc<Sync>(memberC, "sync_promoter_allocations", { p_event: ev })).data;
    const a = first.results.find(r => r.promoter_id === pA)!, b = first.results.find(r => r.promoter_id === pB)!;
    expect([a.action, a.quantity, a.capped]).toEqual(["created", 40, false]);
    expect([b.action, b.quantity, b.capped]).toEqual(["created", 20, true]);
    const rows = ((await db.from("ticket_allocations").select("tier_id,kind,source,quantity").eq("event_id", ev).eq("status", "active")).data ?? []) as { tier_id: string; kind: string; source: string; quantity: number }[];
    expect(rows.every(r => r.tier_id === ga && r.kind === "promoter" && r.source === "promoter_mirror")).toBe(true);
    const inv = (await rpc<{ tier_id: string; public_available: number }[]>(financeC, "event_ticket_inventory", { p_event: ev })).data;
    expect(inv.find(t => t.tier_id === ga)?.public_available).toBe(0);
    // Idempotent.
    const again = (await rpc<Sync>(ownerC, "sync_promoter_allocations", { p_event: ev })).data;
    expect(again.results.every(r => ["unchanged", "none"].includes(r.action))).toBe(true);
    // Opt-in trigger: lowering A's allocation shrinks the mirror; one issued unit holds the floor.
    await db.from("tickets").insert({ event_id: ev, tier_id: ga, code: `S2-${randomBytes(4).toString("hex").toUpperCase()}`, order_ref: `S2-${randomBytes(3).toString("hex")}`, attendee_name: "Una Used", status: "valid", allocation_id: a.allocation_id });
    await db.from("promoters").update({ ticket_allocation: 12 }).eq("id", pA);   // remaining 2 + 1 used
    expect(((await db.from("ticket_allocations").select("quantity").eq("id", a.allocation_id!).single()).data as { quantity: number }).quantity).toBe(3);
    await db.from("promoters").update({ ticket_allocation: 0, status: "paused" }).eq("id", pA);
    const floor = (await db.from("ticket_allocations").select("quantity,status").eq("id", a.allocation_id!).single()).data as { quantity: number; status: string };
    expect(floor).toEqual({ quantity: 1, status: "active" });
    // A promoter that was never synced isn't touched by the trigger.
    const pC = ((await db.from("promoters").insert({ event_id: ev, name: "Promo C", code: `PC${randomBytes(2).toString("hex")}`, ticket_allocation: 0, status: "active" }).select("id").single()).data as Id).id;
    await db.from("promoters").update({ ticket_allocation: 5 }).eq("id", pC);
    expect(((await db.from("ticket_allocations").select("id").eq("promoter_id", pC)).data ?? []).length).toBe(0);
    // Explicit tier choice for new mirrors.
    const c = (await rpc<Sync>(memberC, "sync_promoter_allocations", { p_event: ev, p_tier: vip })).data.results.find(r => r.promoter_id === pC)!;
    expect([c.action, c.quantity]).toEqual(["created", 5]);
  });

  test("access codes linked to an allocation: members create under RLS, finance can read but the guard still caps the tier", async () => {
    const alloc = ((await memberC.from("ticket_allocations").insert({ event_id: ev, tier_id: vip, kind: "comp", label: "Sponsor comps", quantity: 10 }).select("id").single()).data as Id).id;
    const over = await memberC.from("ticket_allocations").insert({ event_id: ev, tier_id: vip, kind: "guest", quantity: 10 });
    expect(over.error?.message).toMatch(/allocation_exceeds_inventory/);   // 5 (promoter C) + 10 + 10 > 20
    const code = await memberC.from("discount_codes").insert({ event_id: ev, code: `COMP${randomBytes(2).toString("hex").toUpperCase()}`, kind: "amount", amount: 0, purpose: "access", allocation_id: alloc, tier_ids: [vip], max_uses: 10, status: "active" }).select("id,purpose,allocation_id").single();
    expect(code.error).toBeNull();
    expect(code.data).toMatchObject({ purpose: "access", allocation_id: alloc });
    expect(((await outsiderC.from("ticket_allocations").select("id").eq("event_id", ev)).data ?? []).length).toBe(0);
  });

  test("registration drafts: one per event, publish creates the next version and archives the draft, discard; finance refused", async () => {
    const form = { title: "Press accreditation", fields: [{ key: "outlet", label: "Outlet", type: "text", required: true }, { key: "access_needs", label: "Access needs", type: "textarea", sensitive: true }], capacity: 30, approval_required: true };
    expect((await rpc(financeC, "save_registration_form_draft", { p_event: ev, p_form: form })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(memberC, "save_registration_form_draft", { p_event: ev, p_form: { ...form, fields: [{ key: "Bad Key", type: "text" }] } })).error?.message).toMatch(/invalid_field_key/);
    const d1 = (await rpc<Id>(memberC, "save_registration_form_draft", { p_event: ev, p_form: form })).data;
    const d2 = (await rpc<Id>(memberC, "save_registration_form_draft", { p_event: ev, p_form: { ...form, capacity: 25 } })).data;
    expect(d2.id).toBe(d1.id);
    const pub = (await rpc<{ id: string; version: number; draft_id: string }>(memberC, "publish_registration_form_draft", { p_event: ev })).data;
    expect(pub.version).toBe(1);
    const forms = ((await ownerC.from("registration_forms").select("id,status,capacity,version").eq("event_id", ev)).data ?? []) as { id: string; status: string; capacity: number; version: number }[];
    expect(forms.find(f => f.id === d1.id)?.status).toBe("archived");
    expect(forms.find(f => f.id === pub.id)).toMatchObject({ status: "published", capacity: 25 });
    await rpc(memberC, "save_registration_form_draft", { p_event: ev, p_form: { ...form, title: "v2" } });
    expect((await rpc<{ version: number }>(ownerC, "publish_registration_form_draft", { p_event: ev })).data.version).toBe(2);
    await rpc(memberC, "save_registration_form_draft", { p_event: ev, p_form: { ...form, title: "throwaway" } });
    expect((await rpc<{ discarded: number }>(memberC, "discard_registration_form_draft", { p_event: ev })).data.discarded).toBe(1);
    expect((await rpc(memberC, "publish_registration_form_draft", { p_event: ev })).error?.message).toMatch(/not_found/);
  });

  test("door staff by email: zone-limited scan permission, unknown email refused, editor list with emails, revoke", async () => {
    expect((await rpc(financeC, "assign_event_scanner_by_email", { p_event: ev, p_email: door.email })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(memberC, "assign_event_scanner_by_email", { p_event: ev, p_email: `nobody-${randomBytes(4).toString("hex")}@gala-dock.test` })).error?.message).toMatch(/user_not_found/);
    expect((await rpc(doorC, "can_scan_event", { p_event: ev, p_zone: zone })).data).toBe(false);
    expect((await rpc(memberC, "assign_event_scanner_by_email", { p_event: ev, p_email: door.email.toUpperCase(), p_zones: [zone], p_expires_at: iso(Date.now() + 864e5) })).error).toBeNull();
    expect((await rpc(doorC, "can_scan_event", { p_event: ev, p_zone: zone })).data).toBe(true);
    expect((await rpc(doorC, "can_scan_event", { p_event: ev, p_zone: null })).data).toBe(false);   // zone-limited: must pick a zone
    const list = (await rpc<{ user_id: string; email: string; zones: string[]; revoked_at: string | null }[]>(memberC, "event_scanners_list", { p_event: ev })).data;
    expect(list.find(s => s.user_id === door.id && !s.revoked_at)).toMatchObject({ email: door.email, zones: [zone] });
    expect((await rpc(financeC, "event_scanners_list", { p_event: ev })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(doorC, "event_scanners_list", { p_event: ev })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(memberC, "revoke_event_scanner", { p_event: ev, p_user: door.id })).error).toBeNull();
    expect((await rpc(doorC, "can_scan_event", { p_event: ev, p_zone: zone })).data).toBe(false);
  });
});

function randomBytesUuid() { const h = randomBytes(16).toString("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20)}`; }
