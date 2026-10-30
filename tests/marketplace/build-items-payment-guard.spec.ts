import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// P1 security (Q10 finding; migration 202610291028): a buyer with event access must not be able to confirm a marketplace line
// (or move it into any payment-dependent state) by writing build_items directly or through transition_build_item.
// Legitimate buyer edits keep working. The service role plays the deposit webhook (payment path), as in the Q10 specs.
const db = admin as unknown as SupabaseClient;
const at = (days: number, h: number) => { const d = new Date(Date.now() + days * 864e5); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
const one = async <T = { id: string }>(q: PromiseLike<{ data: unknown; error: unknown }>) => { const r = await q; if (r.error) throw r.error; return r.data as T; };
const PAID_STATES = ["confirmed", "awaiting_confirmation", "active", "fulfilled", "completion_pending", "completed", "refunded", "partially_refunded", "replacement_required", "awaiting_payment"];

test.describe.configure({ mode: "serial" });
test.describe("P1 build_items payment guard", () => {
  let cust: { id: string; email: string }, orgOwner: { id: string; email: string }, prov: { id: string; email: string };
  let custC: SupabaseClient, orgC: SupabaseClient, provC: SupabaseClient;
  let P: string, O: string, venue: string, dj: string, E1: string, E2: string;
  const wss: string[] = [];
  const line = async (event: string, listing: string | null, status: string, extra: Record<string, unknown> = {}) =>
    (await one(db.from("build_items").insert({ event_id: event, listing_id: listing, category: listing === venue ? "venue" : "dj", title: `P1 ${status}`, status, amount: 1200, deposit: 300, ...extra }).select("id").single())).id;
  const status = async (id: string) => (await one<{ status: string }>(db.from("build_items").select("status").eq("id", id).single())).status;
  const jobs = async (id: string) => (await db.from("provider_jobs").select("id", { count: "exact", head: true }).eq("build_item_id", id)).count ?? 0;

  test.beforeAll(async () => {
    [cust, orgOwner, prov] = await Promise.all(["p1g-cust", "p1g-org", "p1g-prov"].map(l => createUser(l)));
    P = await seedWorkspace(prov.id, "provider", "P1 Guard Provider"); O = await seedWorkspace(orgOwner.id, "organizer", "P1 Guard Organizer");
    wss.push(P, O);
    venue = (await one(db.from("listings").insert({ workspace_id: P, name: "P1 Guard Hall", kind: "venue", category: "venue", published: false }).select("id").single())).id;
    dj = (await one(db.from("listings").insert({ workspace_id: P, name: "P1 Guard DJ", kind: "service", category: "dj", published: false }).select("id").single())).id;
    E1 = (await one(db.from("events").insert({ owner_id: cust.id, name: "P1 Guard birthday", starts_at: at(50, 18), ends_at: at(50, 23) }).select("id").single())).id;
    E2 = (await one(db.from("events").insert({ owner_id: orgOwner.id, workspace_id: O, name: "P1 Guard gala", starts_at: at(51, 18), ends_at: at(51, 23) }).select("id").single())).id;
    [custC, orgC, provC] = await Promise.all([cust, orgOwner, prov].map(u => signedIn(u.email))) as unknown as SupabaseClient[];
  });
  test.afterAll(async () => {
    for (const e of [E1, E2]) { await db.from("provider_jobs").delete().in("build_item_id", ((await db.from("build_items").select("id").eq("event_id", e)).data ?? []).map(x => x.id)); }
    for (const e of [E1, E2]) { await db.from("build_items").delete().eq("event_id", e); await db.from("provider_requests").delete().eq("event_id", e); await db.from("events").delete().eq("id", e); }
    for (const ws of wss) { await db.from("listings").delete().eq("workspace_id", ws); await db.from("workspaces").delete().eq("id", ws); }
    await cleanup();
  });

  test("customer cannot confirm (or enter any payment-dependent state) by writing build_items directly", async () => {
    const q = await line(E1, venue, "quoted");
    for (const to of PAID_STATES) {
      const r = await custC.from("build_items").update({ status: to }).eq("id", q);
      expect(r.error?.message, to).toMatch(/build_item_status_requires_command/);
    }
    expect(await status(q)).toBe("quoted");
    expect(await jobs(q)).toBe(0);
    // Inserting a ready-made confirmed booking is refused too.
    expect((await custC.from("build_items").insert({ event_id: E1, listing_id: venue, category: "venue", title: "forged", status: "confirmed", amount: 1 })).error?.message).toMatch(/build_item_status_requires_command/);
    expect((await custC.from("build_items").insert({ event_id: E1, listing_id: venue, category: "venue", title: "forged", status: "suggested", terms_snapshot: { amount: 1 } })).error?.message).toMatch(/build_item_protected_fields/);
  });

  test("customer and organizer cannot confirm a payable line through transition_build_item", async () => {
    const q1 = await line(E1, dj, "quoted"), h1 = await line(E1, dj, "held", { hold_expires_at: at(2, 12) });
    const q2 = await line(E2, venue, "available");
    for (const [c, id] of [[custC, q1], [custC, h1], [orgC, q2]] as const) {
      const r = await c.rpc("transition_build_item", { p_item: id, p_to: "confirmed" });
      expect(r.error?.message).toMatch(/payment_required/);
      expect(await jobs(id)).toBe(0);
    }
    expect([await status(q1), await status(h1), await status(q2)]).toEqual(["quoted", "held", "available"]);
    // Concurrent attempts change nothing.
    const burst = await Promise.all(Array.from({ length: 6 }, (_, i) => i % 2 ? orgC.from("build_items").update({ status: "confirmed" }).eq("id", q2) : orgC.rpc("transition_build_item", { p_item: q2, p_to: "confirmed" })));
    expect(burst.every(r => r.error)).toBe(true);
    expect(await status(q2)).toBe("available");
  });

  test("terms, provider and payment fields are locked once a line leaves draft; committed lines cannot be deleted or cancelled directly", async () => {
    const q = await line(E1, venue, "quoted"), c = await line(E1, venue, "quoted");
    await db.from("build_items").update({ status: "confirmed" }).eq("id", c);            // service role = deposit webhook
    expect((await custC.from("build_items").update({ amount: 1 }).eq("id", q)).error?.message).toMatch(/build_item_terms_locked/);
    expect((await custC.from("build_items").update({ deposit: 0 }).eq("id", q)).error?.message).toMatch(/build_item_terms_locked/);
    expect((await custC.from("build_items").update({ terms_snapshot: { amount: 1 } }).eq("id", q)).error?.message).toMatch(/build_item_protected_fields/);
    expect((await custC.from("build_items").update({ hold_expires_at: at(30, 0) }).eq("id", q)).error?.message).toMatch(/build_item_protected_fields/);
    expect((await custC.from("build_items").update({ status: "cancelled" }).eq("id", c)).error?.message).toMatch(/build_item_status_requires_command/);
    expect((await custC.from("build_items").delete().eq("id", c)).error?.message).toMatch(/build_item_not_deletable/);
    expect(await status(c)).toBe("confirmed");
    // A seller has no write path to the buyer's line at all.
    expect((await provC.from("build_items").update({ notes: "x" }).eq("id", q).select("id")).data ?? []).toHaveLength(0);
  });

  test("legitimate buyer edits keep working", async () => {
    // Draft composition: add, re-price an estimate, reorder, annotate, swap role, delete.
    const s = (await one(custC.from("build_items").insert({ event_id: E1, listing_id: dj, category: "dj", title: "P1 DJ idea", status: "suggested", amount: 400, price_basis: "estimate" }).select("id").single())).id;
    expect((await custC.from("build_items").update({ amount: 450, notes: "60s soul", sort: 3, role: "backup", title: "P1 DJ (soul)" }).eq("id", s)).error).toBeNull();
    // Request line (organizer RFQ shape): inserted as 'sent' with its request.
    const req = (await one(orgC.from("provider_requests").insert({ reference: `RQ-P1${Date.now() % 1e6}`, event_id: E2, created_by: orgOwner.id, category: "dj", title: "P1 RFQ", status: "sent" }).select("id").single())).id;
    expect((await orgC.from("build_items").insert({ event_id: E2, request_id: req, listing_id: dj, category: "dj", title: "P1 RFQ DJ", status: "sent", price_basis: "quote", response_deadline: at(2, 12) })).error).toBeNull();
    // Commands still move lines: send, hold (from quoted), standby; buyer cancellation of an uncommitted line.
    expect((await custC.rpc("transition_build_item", { p_item: s, p_to: "sent" })).error).toBeNull();
    const q = await line(E1, dj, "quoted");
    expect((await custC.rpc("transition_build_item", { p_item: q, p_to: "held", p_hold_hours: 24 })).error).toBeNull();
    expect((await custC.from("build_items").update({ notes: "keep", sort: 9 }).eq("id", q)).error).toBeNull();
    expect((await custC.from("build_items").update({ status: "cancelled" }).eq("id", q)).error).toBeNull();
    expect(await status(q)).toBe("cancelled");
    const d = (await one(custC.from("build_items").insert({ event_id: E1, listing_id: dj, category: "dj", title: "P1 delete me", status: "draft" }).select("id").single())).id;
    expect((await custC.from("build_items").delete().eq("id", d)).error).toBeNull();
    // Off-platform line (no listing, nothing payable through Gala Dock) can still be recorded as confirmed by the organiser.
    const off = await line(E2, null, "quoted", { category: "decor" });
    expect((await orgC.rpc("transition_build_item", { p_item: off, p_to: "confirmed" })).error).toBeNull();
    expect(await status(off)).toBe("confirmed");
  });

  test("the payment path still confirms (service role = deposit webhook) and creates the provider job", async () => {
    const hall2 = (await one(db.from("listings").insert({ workspace_id: P, name: "P1 Guard Hall 2", kind: "venue", category: "venue", published: false }).select("id").single())).id;
    const q = await line(E1, hall2, "quoted", { category: "venue" });
    expect((await db.from("build_items").update({ status: "confirmed" }).eq("id", q)).error).toBeNull();
    expect(await status(q)).toBe("confirmed");
    expect(await jobs(q)).toBe(1);
    // The buyer sees the confirmed booking but still cannot change its terms.
    expect((await custC.from("build_items").update({ amount: 10 }).eq("id", q)).error?.message).toMatch(/build_item_terms_locked/);
  });
});
