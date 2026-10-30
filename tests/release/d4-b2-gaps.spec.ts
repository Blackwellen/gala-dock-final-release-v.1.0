import { randomBytes } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn, insertEventFixture, BASE } from "../phase1/helpers";

// Lane D4 / B2 (202610294041, 202610294042): door scanner route for outside door staff, the launch & waiting-room command, and
// promoter referral sales drawn from the promoter's synced allocation (no oversell, never negative public availability).
// API/DB level with disposable identities: HTTP to the dev server for the route, RPCs for the rest. No Stripe, no browser.
type Db = SupabaseClient;
type Id = { id: string };
type Err = { message: string } | null;
const db = admin as unknown as Db;
const rpc = <T = unknown>(c: Db, fn: string, args: Record<string, unknown>) => c.rpc(fn, args) as unknown as Promise<{ data: T; error: Err }>;
const tok = () => randomBytes(18).toString("base64url");
const ref = () => `GD-B2${randomBytes(4).toString("hex").toUpperCase()}`;
const iso = (ms: number) => new Date(ms).toISOString();
type Inv = { tier_id: string; sold: number; reserved_remaining: number; public_available: number; quantity: number; allocations: { id: string; used: number; quantity: number; status: string }[] }[];

/** Session cookies for a disposable identity (user-scoped OTP exchange; no password/CAPTCHA involved). */
async function cookieHeader(email: string) {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  const jar: string[] = [];
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => [], setAll: v => { for (const c of v) jar.push(`${c.name}=${c.value}`); } } });
  const r = await sb.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
  if (r.error) throw r.error;
  return jar.join("; ");
}
const door = (eventId: string, cookie?: string) => fetch(`${BASE}/door/${eventId}`, { redirect: "manual", headers: cookie ? { cookie } : {} });

test.describe.configure({ mode: "serial" });

test.describe("D4/B2 door scanner, launch editor, promoter referral allocation", () => {
  let owner: { id: string; email: string }, manager: { id: string; email: string }, member: { id: string; email: string }, finance: { id: string; email: string },
    staff: { id: string; email: string }, outsider: { id: string; email: string }, buyer: { id: string; email: string };
  let ownerC: Db, managerC: Db, memberC: Db, financeC: Db, staffC: Db, outsiderC: Db;
  let ws: string, ev: string, ga: string, zone: string, promo: string, promoCode: string, ticketCode: string;

  test.beforeAll(async () => {
    [owner, manager, member, finance, staff, outsider, buyer] = await Promise.all(["b2-o", "b2-m", "b2-mem", "b2-f", "b2-door", "b2-x", "b2-b"].map(l => createUser(l)));
    ws = await seedWorkspace(owner.id, "organizer", "B2 Events");
    await db.from("workspace_members").insert([{ workspace_id: ws, user_id: manager.id, role: "manager" }, { workspace_id: ws, user_id: member.id, role: "member" }, { workspace_id: ws, user_id: finance.id, role: "finance" }]);
    ev = ((await insertEventFixture({ owner_id: owner.id, workspace_id: ws, management: "professional", name: `B2 Door ${randomBytes(3).toString("hex")}`, visibility: "public", status: "on_sale",
      event_type: "gala", starts_at: iso(Date.now() + 10 * 864e5), capacity: 500, settings: { ticketed: true } }, "d4-b2-gaps").select("id").single()).data as Id).id;
    ga = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "General", kind: "general", price: 20, quantity: 20, status: "on_sale", sort: 1, order_limit: 10 }).select("id").single()).data as Id).id;
    zone = ((await db.from("access_zones").insert({ event_id: ev, name: "Main gate", kind: "general" }).select("id").single()).data as Id).id;
    promoCode = `B2P${randomBytes(2).toString("hex").toUpperCase()}`;
    promo = ((await db.from("promoters").insert({ event_id: ev, name: "Promo Referral", code: promoCode, ticket_allocation: 10, tickets_sold: 0, status: "active", commission_pct: 10 }).select("id").single()).data as Id).id;
    ticketCode = `B2-${randomBytes(4).toString("hex").toUpperCase()}`;
    await db.from("tickets").insert({ event_id: ev, tier_id: ga, code: ticketCode, order_ref: ref(), attendee_name: "Dora Door", attendee_email: "dora.door@gala-dock.test", status: "valid" });
    [ownerC, managerC, memberC, financeC, staffC, outsiderC] = (await Promise.all([owner, manager, member, finance, staff, outsider].map(u => signedIn(u.email)))) as unknown as Db[];
  });
  test.afterAll(async () => {
    await db.from("checkout_orders").delete().eq("event_id", ev);
    await db.from("events").delete().eq("id", ev);
    await db.from("workspaces").delete().eq("id", ws);
    await cleanup();
  });

  test("door route: sign-in redirect, non-scanners 404, zone-limited door staff get the scanner with private headers", async () => {
    const unauth = await door(ev);
    expect(unauth.status).toBe(307);
    expect(unauth.headers.get("location")).toBe(`/login?next=${encodeURIComponent(`/door/${ev}`)}`);
    expect((await door("not-a-uuid")).status).toBe(404);
    const outsiderCookie = await cookieHeader(outsider.email);
    const denied = await door(ev, outsiderCookie);
    expect(denied.status).toBe(404);
    expect(await denied.text()).not.toContain("B2 Door");
    // Owner assigns the outsider-to-the-workspace door staff by email, limited to one zone.
    expect((await rpc(ownerC, "assign_event_scanner_by_email", { p_event: ev, p_email: staff.email, p_zones: [zone], p_expires_at: iso(Date.now() + 864e5) })).error).toBeNull();
    const staffCookie = await cookieHeader(staff.email);
    const ok = await door(ev, staffCookie);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toMatch(/no-store/);
    expect(ok.headers.get("x-robots-tag")).toMatch(/noindex/);
    expect(ok.headers.get("referrer-policy")).toBe("no-referrer");
    const html = await ok.text();
    expect(html).toContain("B2 Door");
    expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    expect(html).not.toContain("dora.door@gala-dock.test");
    // The organiser workspace route stays members-only.
    expect((await fetch(`${BASE}/organizer/events/${ev}/scan`, { redirect: "manual", headers: { cookie: staffCookie } })).status).not.toBe(200);
    // Revoked → no access.
    expect((await rpc(ownerC, "revoke_event_scanner", { p_event: ev, p_user: staff.id })).error).toBeNull();
    expect((await door(ev, staffCookie)).status).toBe(404);
    expect((await rpc(ownerC, "assign_event_scanner_by_email", { p_event: ev, p_email: staff.email, p_zones: [zone] })).error).toBeNull();
  });

  test("door staff data: any-zone lookup/offline list with masked emails, scans only with their zone, no editor reads", async () => {
    expect((await rpc(staffC, "can_scan_event", { p_event: ev, p_zone: null })).data).toBe(false);
    expect((await rpc(staffC, "can_scan_event_any", { p_event: ev })).data).toBe(true);
    expect((await rpc(outsiderC, "can_scan_event_any", { p_event: ev })).data).toBe(false);
    expect((await rpc(anon() as unknown as Db, "can_scan_event_any", { p_event: ev })).error).not.toBeNull();
    const look = await rpc<{ email: string; attendee: string }[]>(staffC, "scan_lookup", { p_event: ev, p_query: "Dora" });
    expect(look.data).toEqual([expect.objectContaining({ attendee: "Dora Door", email: "d***@gala-dock.test" })]);
    expect((await rpc<unknown[]>(staffC, "scan_lookup", { p_event: ev, p_query: "gala-dock.test" })).data).toEqual([]);   // no substring email search
    expect((await rpc<unknown[]>(staffC, "scan_lookup", { p_event: ev, p_query: "DORA.DOOR@gala-dock.test" })).data).toHaveLength(1);   // exact email still works
    expect((await rpc<{ email: string }[]>(ownerC, "scan_lookup", { p_event: ev, p_query: "gala-dock.test" })).data[0]?.email).toBe("dora.door@gala-dock.test");
    expect((await rpc<unknown[]>(outsiderC, "scan_lookup", { p_event: ev, p_query: "Dora" })).data).toEqual([]);
    const snap = await rpc<{ tickets: Record<string, unknown>[] }>(staffC, "create_scan_snapshot", { p_event: ev, p_device: "b2-door" });
    expect(snap.error).toBeNull();
    expect(snap.data.tickets.some(t => t.code === ticketCode)).toBe(true);
    expect(snap.data.tickets.every(t => !("email" in t) && !("qr_nonce" in t))).toBe(true);
    expect((await rpc(outsiderC, "create_scan_snapshot", { p_event: ev, p_device: "x" })).error?.message).toMatch(/not_authorized/);
    const scan = (c: Db, z: string | null) => rpc<{ result: string }>(c, "scan_admission", { p_event: ev, p_zone: z, p_ticket: null, p_pass: null, p_code: ticketCode, p_nonce: null, p_credential: "manual" });
    expect((await scan(staffC, null)).error?.message).toMatch(/not_authorized/);
    const inZone = await scan(staffC, zone);
    expect(inZone.error).toBeNull();
    expect(typeof inZone.data.result).toBe("string");
    expect((await rpc(staffC, "event_scanners_list", { p_event: ev })).error?.message).toMatch(/not_authorized/);
    expect(((await staffC.from("tickets").select("id").eq("event_id", ev)).data ?? []).length).toBe(0);
  });

  test("launch command: owner/manager only, validated, audited, drives launch state and the waiting room", async () => {
    const good = { at: iso(Date.now() + 3 * 864e5), presale_at: iso(Date.now() + 864e5), waiting_room: { enabled: true, rate_per_minute: 120, admit_minutes: 8 } };
    for (const c of [memberC, financeC, outsiderC, staffC]) expect((await rpc(c, "set_event_launch", { p_event: ev, p_launch: good })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(anon() as unknown as Db, "set_event_launch", { p_event: ev, p_launch: good })).error).not.toBeNull();
    const bad: [Record<string, unknown>, RegExp][] = [
      [{ presale_at: good.presale_at }, /presale_requires_launch/],
      [{ at: good.presale_at, presale_at: good.at }, /presale_after_launch/],
      [{ at: iso(Date.now() + 20 * 864e5) }, /launch_after_event_start/],
      [{ at: "tomorrow-ish" }, /invalid_time/],
      [{ waiting_room: { enabled: true } }, /waiting_room_requires_launch/],
      [{ at: good.at, waiting_room: { enabled: true, rate_per_minute: 0 } }, /invalid_rate/],
      [{ at: good.at, waiting_room: { enabled: true, rate_per_minute: 100, admit_minutes: 1 } }, /invalid_admit_minutes/],
    ];
    for (const [p, re] of bad) expect((await rpc(managerC, "set_event_launch", { p_event: ev, p_launch: p })).error?.message).toMatch(re);
    const saved = await rpc<{ state: string; launch: Record<string, unknown> }>(managerC, "set_event_launch", { p_event: ev, p_launch: good });
    expect(saved.error).toBeNull();
    expect(saved.data.state).toBe("countdown");
    expect((await rpc(anon() as unknown as Db, "event_launch_state", { p_event: ev })).data).toBe("countdown");
    const s = ((await db.from("events").select("settings").eq("id", ev).single()).data as { settings: { launch: { at: string; presale_at: string; waiting_room: Record<string, unknown> }; ticketed: boolean } }).settings;
    expect(Date.parse(s.launch.at)).toBe(Date.parse(good.at));
    expect(s.launch.waiting_room).toEqual({ enabled: true, rate_per_minute: 120, admit_minutes: 8 });
    expect(s.ticketed).toBe(true);   // other settings untouched
    const audit = (await db.from("audit_events").select("actor_id,metadata").eq("event", "tickets.launch_updated").eq("actor_id", manager.id)).data ?? [];
    expect(audit.length).toBe(1);
    // Clearing returns to tier-driven state.
    const cleared = await rpc<{ state: string; launch: Record<string, unknown> }>(ownerC, "set_event_launch", { p_event: ev, p_launch: {} });
    expect(cleared.data.launch).toEqual({});
    expect(cleared.data.state).not.toMatch(/countdown|coming_soon/);
  });

  test("referral sales draw from the promoter's synced allocation: concurrent, capped, idempotent, public availability never negative", async () => {
    const inv = async () => (await rpc<Inv>(financeC, "event_ticket_inventory", { p_event: ev })).data.find(t => t.tier_id === ga)!;
    // The door-test ticket sits outside tier.sold; account for it so the arithmetic below is exact.
    await db.from("tickets").delete().eq("code", ticketCode);
    const sync = await rpc<{ results: { promoter_id: string; action: string; quantity: number; allocation_id: string }[] }>(memberC, "sync_promoter_allocations", { p_event: ev, p_tier: ga });
    const mirror = sync.data.results.find(r => r.promoter_id === promo)!;
    expect([mirror.action, mirror.quantity]).toEqual(["created", 10]);
    expect((await inv()).public_available).toBe(10);

    /** A referral checkout the way /api/checkout/session + confirmOrder do it, minus Stripe: hold (public), order with ref_code, issue. */
    const buy = async (qty: number) => {
      const k = tok(), r = ref();
      const h = await rpc(anon() as unknown as Db, "hold_tickets", { p_event: ev, p_items: [{ tier: ga, qty }], p_token: k });
      if (h.error) return { ref: r, error: h.error.message };
      const ins = await db.from("checkout_orders").insert({ order_ref: r, event_id: ev, buyer_id: buyer.id, token: k, amount: 20 * qty, fee: 0, status: "pending", kind: "primary",
        lines: [{ tier_id: ga, name: "General", qty, unit: 20 }], ref_code: promoCode.toLowerCase(), ref_channel: "link" });
      if (ins.error) return { ref: r, error: ins.error.message };
      const iss = await rpc<number>(db, "issue_checkout", { p_token: k, p_order_ref: r, p_attendee: "Ref Buyer", p_holder: buyer.id });
      return { ref: r, error: iss.error?.message ?? null };
    };
    // 8 concurrent referral buyers of 1 ticket each; attribution runs concurrently too.
    const first = await Promise.all(Array.from({ length: 8 }, () => buy(1)));
    expect(first.map(f => f.error)).toEqual(Array(8).fill(null));
    const n1 = await Promise.all(first.map(f => rpc<number>(db, "attribute_referral", { p_order_ref: f.ref })));
    expect(n1.map(n => n.data)).toEqual(Array(8).fill(1));
    let t = await inv();
    let a = t.allocations.find(x => x.id === mirror.allocation_id)!;
    expect([t.sold, a.used, a.quantity, t.reserved_remaining, t.public_available]).toEqual([8, 8, 10, 2, 10]);   // referral sales came out of the reservation
    // Idempotent: re-attributing changes nothing; a re-sync is a no-op.
    expect((await rpc<number>(db, "attribute_referral", { p_order_ref: first[0]!.ref })).data).toBe(0);
    const again = await rpc<{ results: { promoter_id: string; action: string }[] }>(ownerC, "sync_promoter_allocations", { p_event: ev });
    expect(again.data.results.find(r => r.promoter_id === promo)?.action).toBe("unchanged");
    // 4 more concurrent referral buyers with only 2 units of reservation left: exactly 2 drawn, 2 come from public stock.
    const second = await Promise.all(Array.from({ length: 4 }, () => buy(1)));
    expect(second.map(f => f.error)).toEqual(Array(4).fill(null));
    await Promise.all(second.map(f => rpc<number>(db, "attribute_referral", { p_order_ref: f.ref })));
    t = await inv(); a = t.allocations.find(x => x.id === mirror.allocation_id)!;
    expect([t.sold, a.used, a.quantity, t.reserved_remaining, t.public_available]).toEqual([12, 10, 10, 0, 8]);
    expect(t.sold + t.reserved_remaining + t.public_available).toBeLessThanOrEqual(t.quantity);
    // Fill the rest concurrently (more buyers than stock): never oversold, availability never negative.
    const rush = await Promise.all(Array.from({ length: 12 }, () => buy(1)));
    expect(rush.filter(r => r.error === null).length).toBe(8);
    await Promise.all(rush.filter(r => r.error === null).map(f => rpc(db, "attribute_referral", { p_order_ref: f.ref })));
    t = await inv(); a = t.allocations.find(x => x.id === mirror.allocation_id)!;
    expect([t.sold, a.used, t.public_available]).toEqual([20, 10, 0]);
    expect(((await db.from("ticket_tiers").select("sold,held,quantity").eq("id", ga).single()).data as { sold: number; quantity: number }).sold).toBeLessThanOrEqual(20);
    // Reconciliation: skipped draws (simulated by untagging) are picked up by the next sync. All 20 sales were referral sales, so
    // the mirror now counts all of them (its quantity follows used); the reservation that remains is still the promoter's unsold
    // quota (0 here), the tier guard holds and public availability stays exact.
    await db.from("tickets").update({ allocation_id: null }).eq("allocation_id", mirror.allocation_id);
    expect((await inv()).public_available).toBe(0);
    const rec = await rpc<{ results: { promoter_id: string; action: string; referral_drawn: number; quantity: number }[] }>(managerC, "sync_promoter_allocations", { p_event: ev });
    const rr = rec.data.results.find(r => r.promoter_id === promo)!;
    expect([rr.action, rr.referral_drawn]).toEqual(["updated", 20]);
    t = await inv(); a = t.allocations.find(x => x.id === mirror.allocation_id)!;
    expect([a.used, a.quantity, t.reserved_remaining, t.public_available]).toEqual([20, 20, 0, 0]);
    expect(t.allocations.filter(x => x.status === "active").reduce((s, x) => s + x.quantity, 0)).toBeLessThanOrEqual(t.quantity);
    expect((await rpc<{ results: { promoter_id: string; action: string }[] }>(managerC, "sync_promoter_allocations", { p_event: ev })).data.results.find(r => r.promoter_id === promo)?.action).toBe("unchanged");
    // Inventory read: referral-used count per allocation; editors/finance yes, outsider/anon no.
    const reads = await rpc<{ allocation_id: string; referral_used: number }[]>(financeC, "promoter_allocation_referrals", { p_event: ev });
    expect(reads.data.find(r => r.allocation_id === mirror.allocation_id)?.referral_used).toBe(a.used);
    expect((await rpc(outsiderC, "promoter_allocation_referrals", { p_event: ev })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(anon() as unknown as Db, "promoter_allocation_referrals", { p_event: ev })).error).not.toBeNull();
    // Internal helpers are not callable by clients.
    for (const fn of ["promoter_referral_draw", "promoter_allocation_sync_internal"]) expect((await rpc(ownerC, fn, fn === "promoter_referral_draw" ? { p_allocation: mirror.allocation_id, p_max: 1 } : { p_promoter: promo })).error).not.toBeNull();
  });
});
