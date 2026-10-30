import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn, insertEventFixture } from "../phase1/helpers";

// Q20 Ticket Configuration / Inventory / Checkout (domains 92–95). Exit gate: no oversell. API level with disposable
// identities (no browser, no Stripe): concurrent final-ticket and final-seat races through the deployed reservation RPCs,
// duplicate issuance and duplicate payment confirmation, hold expiry, server-side pence quote with promo/access codes, code
// usage limits under concurrency, per-customer limits, reserved allocations and the Ticket Order state machine.
type Db = SupabaseClient;
type Id = { id: string };
type Err = { message: string } | null;
const db = admin as unknown as Db;
const rpc = <T = unknown>(c: Db, fn: string, args: Record<string, unknown>) => c.rpc(fn, args) as unknown as Promise<{ data: T; error: Err }>;
const tok = () => randomBytes(18).toString("base64url");
const ref = () => `GD-Q20${randomBytes(4).toString("hex").toUpperCase()}`;
type Quote = { kind: string; subtotal_minor: number; discount_minor: number; fee_minor: number; fee_vat_minor: number; total_minor: number; commission_minor: number;
  lines: { tier_id: string; unit_minor: number; discount_minor: number; net_unit_minor: number; qty: number; seats: string[] }[] };

/** The real src/lib/checkout.ts with its server-only imports stubbed (no Stripe is reachable). */
function checkoutModule() {
  const loaded = { exports: {} as { summarise: (e: string, t: string) => Promise<{ subtotal: number; fee: number; total: number; discount?: number; lines: { unit: number; qty: number; listUnit?: number }[] }> } };
  const stubs: Record<string, unknown> = { "server-only": {}, "@/lib/supabase/admin": { createAdminClient: () => db }, "@/lib/workspace/db": { untyped: (v: unknown) => v },
    "@/lib/stripe": { stripe: async () => { throw new Error("no Stripe in tests"); } }, "@/lib/payments/server": { paymentDeps: () => null },
    "@/lib/payments/service": { getDirectPaymentStatus: async () => { throw new Error("no Stripe in tests"); } } };
  const require = (n: string) => { if (n in stubs) return stubs[n]; throw new Error(`Unexpected dependency ${n}`); };
  const js = ts.transpileModule(readFileSync("src/lib/checkout.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(js, { module: loaded, exports: loaded.exports, require, Date, Map, Math, Number, Error });
  return loaded.exports;
}

test.describe.configure({ mode: "serial" });

test.describe("Q20 ticket inventory, checkout and no-oversell", () => {
  let owner: { id: string; email: string }, buyer: { id: string; email: string }, outsider: { id: string; email: string };
  let ownerC: Db, outsiderC: Db, ws: string, ev: string;
  const buyers = () => Array.from({ length: 24 }, () => anon() as unknown as Db);
  const tier = async (row: Record<string, unknown>) => ((await db.from("ticket_tiers").insert({ event_id: ev, status: "on_sale", ...row }).select("id").single()).data as Id).id;
  const tierRow = async (id: string) => (await db.from("ticket_tiers").select("sold,held,status,quantity").eq("id", id).single()).data as { sold: number; held: number; status: string; quantity: number };
  const quote = async (t: string) => (await rpc<Quote>(db, "checkout_quote", { p_event: ev, p_token: t })).data;
  /** What /api/checkout/session does: insert the order at the quoted subtotal and fee (service role). */
  const order = async (t: string, extra: Record<string, unknown> = {}) => {
    const q = await quote(t); const r = ref();
    const res = await db.from("checkout_orders").insert({ order_ref: r, event_id: ev, buyer_id: buyer.id, token: t, amount: q.subtotal_minor / 100, fee: q.fee_minor / 100, status: "pending", lines: [], kind: q.kind, ...extra });
    return { ref: r, error: res.error as Err, q };
  };
  const state = async (r: string) => ((await db.from("checkout_orders").select("order_state").eq("order_ref", r).single()).data as { order_state: string }).order_state;

  test.beforeAll(async () => {
    [owner, buyer, outsider] = await Promise.all(["q20-o", "q20-b", "q20-x"].map(l => createUser(l)));
    ws = await seedWorkspace(owner.id, "organizer", "Q20 Events");
    ev = ((await insertEventFixture({ owner_id: owner.id, workspace_id: ws, management: "professional", name: "Q20 Final Release", visibility: "public", status: "on_sale",
      starts_at: new Date(Date.now() + 3 * 864e5).toISOString() }, "ticket-inventory-checkout").select("id").single()).data as Id).id;
    [ownerC, outsiderC] = (await Promise.all([owner, outsider].map(u => signedIn(u.email)))) as unknown as Db[];
  });
  test.afterAll(async () => {
    await db.from("checkout_orders").delete().eq("event_id", ev);
    await db.from("events").delete().eq("id", ev); await db.from("workspaces").delete().eq("id", ws); await cleanup();
  });

  test("load: 24 concurrent buyers for the last 3 GA tickets → exactly 3 holds, duplicate issuance can't oversell", async () => {
    const ga = await tier({ name: "Final release", price: 30, quantity: 3, release_kind: "final" });
    const tokens = Array.from({ length: 24 }, tok);
    const results = await Promise.all(buyers().map((c, i) => rpc(c, "hold_tickets", { p_event: ev, p_items: [{ tier: ga, qty: 1 }], p_token: tokens[i] })));
    const won = results.map((r, i) => (r.error ? null : tokens[i])).filter(Boolean) as string[];
    expect(won).toHaveLength(3);
    expect(results.filter(r => r.error).every(r => r.error!.message === "sold_out")).toBe(true);
    expect(await tierRow(ga)).toMatchObject({ held: 3, sold: 0 });
    // Each winner's order is confirmed twice at once (redirect + webhook race): one set of tickets per order.
    const orders = await Promise.all(won.map(t => order(t)));
    expect(orders.every(o => !o.error)).toBe(true);
    const issued = await Promise.all(orders.flatMap((o, i) => [0, 1].map(() => rpc<number>(db, "issue_checkout", { p_token: won[i], p_order_ref: o.ref, p_attendee: "Load Buyer", p_holder: buyer.id }))));
    expect(issued.every(r => !r.error && r.data === 1)).toBe(true);
    const { count } = await db.from("tickets").select("id", { count: "exact", head: true }).eq("tier_id", ga);
    expect(count).toBe(3);
    expect(await tierRow(ga)).toMatchObject({ sold: 3, held: 0, status: "sold_out" });
    for (const o of orders) expect(await state(o.ref)).toBe("issued");
    // A late buyer gets a clean refusal, never a fourth ticket.
    expect((await rpc(anon() as unknown as Db, "hold_tickets", { p_event: ev, p_items: [{ tier: ga, qty: 1 }], p_token: tok() })).error?.message).toBe("not_on_sale");
  });

  test("load: 24 concurrent buyers for the last 3 seats → exactly one winner per seat", async () => {
    const st = await tier({ name: "Stalls", price: 45, quantity: 3 });
    const keys = ["Q20-S1", "Q20-S2", "Q20-S3"];
    await db.from("event_seats").insert(keys.map((k, i) => ({ event_id: ev, seat_key: k, label: `Row A seat ${i + 1}`, tier_id: st, accessible: i === 0 })));
    const tokens = Array.from({ length: 24 }, tok);
    const results = await Promise.all(buyers().map((c, i) => rpc(c, "hold_seats", { p_event: ev, p_keys: [keys[i % 3]], p_token: tokens[i] })));
    const won = tokens.filter((_, i) => !results[i].error);
    expect(won).toHaveLength(3);
    expect(results.filter(r => r.error).every(r => r.error!.message === "seat_unavailable")).toBe(true);
    const held = (await db.from("event_seats").select("seat_key,hold_token").in("seat_key", keys).eq("event_id", ev)).data as { seat_key: string; hold_token: string }[];
    expect(new Set(held.map(h => h.hold_token)).size).toBe(3);
    expect(await tierRow(st)).toMatchObject({ held: 3 });
    const q = await quote(won[0]);
    expect(q.subtotal_minor).toBe(4500); expect(q.lines[0].seats).toHaveLength(1);
  });

  test("load: 20 buyers asking for 1–2 of the last 3 → never more than 3 held, every loser told sold_out", async () => {
    const t = await tier({ name: "Mixed final", price: 20, quantity: 3 });
    const tokens = Array.from({ length: 20 }, tok), qty = tokens.map((_, i) => 1 + (i % 2));
    const results = await Promise.all(buyers().slice(0, 20).map((c, i) => rpc(c, "hold_tickets", { p_event: ev, p_items: [{ tier: t, qty: qty[i] }], p_token: tokens[i] })));
    const heldQty = results.reduce((a, r, i) => a + (r.error ? 0 : qty[i]), 0);
    expect(heldQty).toBeLessThanOrEqual(3); expect(heldQty).toBeGreaterThanOrEqual(2);
    expect((await tierRow(t)).held).toBe(heldQty);
    expect(results.filter(r => r.error).every(r => r.error!.message === "sold_out")).toBe(true);
  });

  test("duplicate payment confirmation posts one ledger transaction", async () => {
    const t = await tier({ name: "Direct", price: 12, quantity: 10 }), k = tok();
    expect((await rpc(db, "hold_tickets", { p_event: ev, p_items: [{ tier: t, qty: 2 }], p_token: k })).error).toBeNull();
    const o = await order(k, { stripe_session: `cs_test_q20_${randomBytes(6).toString("hex")}` });
    expect(o.error).toBeNull();
    expect(await state(o.ref)).toBe("payment_pending");
    await db.from("checkout_orders").update({ strategy: "direct", connected_account_id: "acct_test_q20load", seller_workspace_id: ws, application_fee_minor: 100 }).eq("order_ref", o.ref);
    const gross = o.q.subtotal_minor + o.q.fee_minor, pi = `pi_test_q20_${randomBytes(6).toString("hex")}`;
    const paid = await Promise.all(Array.from({ length: 5 }, () => rpc<string>(db, "checkout_order_direct_paid", { p_ref: o.ref, p_pi: pi, p_charge: "", p_amount_minor: gross, p_account: "acct_test_q20load", p_application_fee: null })));
    expect(paid.every(r => !r.error && r.data === "applied")).toBe(true);
    const { count } = await db.from("ledger_transactions").select("id", { count: "exact", head: true }).eq("idempotency_key", `stripe:pi:${pi}`);
    expect(count).toBe(1);
    expect(await state(o.ref)).toBe("paid");
    // Wrong amount / wrong account never pays.
    expect((await rpc<string>(db, "checkout_order_direct_paid", { p_ref: o.ref, p_pi: pi, p_charge: "", p_amount_minor: gross - 1, p_account: "acct_test_q20load", p_application_fee: null })).data).toBe("amount_mismatch");
    await db.from("ledger_transactions").delete().eq("idempotency_key", `stripe:pi:${pi}`);
  });

  test("hold expiry: the sweep releases lapsed holds and expires the abandoned order", async () => {
    const t = await tier({ name: "Expiry", price: 10, quantity: 5 }), k = tok();
    await rpc(db, "hold_tickets", { p_event: ev, p_items: [{ tier: t, qty: 2 }], p_token: k });
    const o = await order(k);
    expect(await state(o.ref)).toBe("inventory_held");
    await db.from("ticket_holds").update({ expires_at: new Date(Date.now() - 60e3).toISOString() }).eq("token", k);
    await db.from("checkout_orders").update({ created_at: new Date(Date.now() - 20 * 60e3).toISOString() }).eq("order_ref", o.ref);
    const sweep = await rpc<{ holds_released: number; orders_expired: number }>(db, "ticket_inventory_sweep", {});
    expect(sweep.error).toBeNull();
    expect(await tierRow(t)).toMatchObject({ held: 0 });
    expect(await state(o.ref)).toBe("expired");
    // The lapsed hold can't be issued; a paid order in that position is refunded by finalise (hold_expired).
    expect((await rpc(db, "issue_checkout", { p_token: k, p_order_ref: o.ref, p_attendee: "Late", p_holder: buyer.id })).error?.message).toBe("hold_expired");
  });

  test("pence quote with codes, stacking rule, and summarise() matches the quote", async () => {
    const t = await tier({ name: "Promo", price: 19.99, quantity: 50 }), k = tok();
    const ins = await db.from("discount_codes").insert([{ event_id: ev, code: "Q20TEN", kind: "percent", amount: 10, stackable: false }, { event_id: ev, code: "Q20FIVE", kind: "amount", amount: 5, stackable: false },
      { event_id: ev, code: "Q20STACK", kind: "amount", amount: 1, stackable: true }]);
    expect(ins.error).toBeNull();
    await rpc(db, "hold_tickets", { p_event: ev, p_items: [{ tier: t, qty: 3 }], p_token: k });
    expect((await quote(k)).subtotal_minor).toBe(5997);
    expect((await rpc<{ ok: boolean }>(db, "checkout_apply_code", { p_event: ev, p_token: k, p_code: "q20ten", p_buyer: buyer.id })).data.ok).toBe(true);
    expect((await rpc<{ error: string }>(db, "checkout_apply_code", { p_event: ev, p_token: k, p_code: "Q20FIVE", p_buyer: buyer.id })).data.error).toBe("code_not_stackable");
    expect((await rpc<{ error: string }>(db, "checkout_apply_code", { p_event: ev, p_token: k, p_code: "Q20STACK", p_buyer: buyer.id })).data.error).toBe("code_not_stackable");
    expect((await rpc<{ error: string }>(db, "checkout_apply_code", { p_event: ev, p_token: k, p_code: "NOPE", p_buyer: buyer.id })).data.error).toBe("code_invalid");
    const q = await quote(k);
    // 10% off £19.99 = £2.00 per ticket (rounded) → £17.99 × 3; booking fee per paid ticket from commerce.ticket_fee.
    expect(q.lines[0]).toMatchObject({ unit_minor: 1999, discount_minor: 200, net_unit_minor: 1799, qty: 3 });
    expect(q.subtotal_minor).toBe(5397); expect(q.discount_minor).toBe(600);
    expect(q.total_minor).toBe(q.subtotal_minor + q.fee_minor);
    const s = await checkoutModule().summarise(ev, k);
    expect(s.subtotal).toBe(53.97); expect(s.discount).toBe(6); expect(s.lines[0]).toMatchObject({ unit: 17.99, qty: 3, listUnit: 19.99 });
    expect(Math.round(s.fee * 100)).toBe(q.fee_minor);
    // A client-chosen amount is refused: the order must equal the server quote.
    const bad = await db.from("checkout_orders").insert({ order_ref: ref(), event_id: ev, buyer_id: buyer.id, token: k, amount: 1, fee: 0, status: "pending", lines: [], kind: "primary" });
    expect(bad.error?.message).toMatch(/quote_mismatch/);
    const o = await order(k);
    expect(o.error).toBeNull();
    const snap = (await db.from("checkout_orders").select("subtotal_minor,discount_minor,total_minor,quote_snapshot").eq("order_ref", o.ref).single()).data as { subtotal_minor: number; discount_minor: number; quote_snapshot: Quote };
    expect(snap).toMatchObject({ subtotal_minor: 5397, discount_minor: 600 });
    expect(snap.quote_snapshot.lines[0].net_unit_minor).toBe(1799);
  });

  test("code max_uses holds under 10 concurrent orders; a released use can be applied again", async () => {
    const t = await tier({ name: "Limited code", price: 8, quantity: 100 });
    await db.from("discount_codes").insert({ event_id: ev, code: "Q20ONCE", kind: "amount", amount: 2, max_uses: 1 });
    const tokens = Array.from({ length: 10 }, tok);
    for (const k of tokens) {
      await rpc(db, "hold_tickets", { p_event: ev, p_items: [{ tier: t, qty: 1 }], p_token: k });
      expect((await rpc<{ ok: boolean }>(db, "checkout_apply_code", { p_event: ev, p_token: k, p_code: "Q20ONCE", p_buyer: null })).data.ok).toBe(true);
    }
    const results = await Promise.all(tokens.map(k => order(k)));
    expect(results.filter(r => !r.error)).toHaveLength(1);
    expect(results.filter(r => r.error).every(r => /code_exhausted/.test(r.error!.message))).toBe(true);
    const { count } = await db.from("discount_redemptions").select("id", { count: "exact", head: true }).eq("event_id", ev).neq("status", "released")
      .in("code_id", ((await db.from("discount_codes").select("id").eq("event_id", ev).eq("code", "Q20ONCE")).data as Id[]).map(c => c.id));
    expect(count).toBe(1);
    // Once that order expires the use is released and the code can be applied again.
    const winner = results.find(r => !r.error)!;
    expect((await rpc<{ ok: boolean }>(db, "ticket_order_transition", { p_ref: winner.ref, p_to: "cancelled", p_expected: "inventory_held", p_reason: "test" })).data.ok).toBe(true);
    expect((await rpc<{ ok: boolean }>(db, "checkout_apply_code", { p_event: ev, p_token: tok(), p_code: "Q20ONCE", p_buyer: null })).data.ok).toBe(true);
  });

  test("per-customer tier limit and minimum per order", async () => {
    const t = await tier({ name: "One each", price: 15, quantity: 100, per_customer_limit: 2, min_per_order: 1 });
    const k1 = tok();
    await rpc(db, "hold_tickets", { p_event: ev, p_items: [{ tier: t, qty: 2 }], p_token: k1 });
    const first = await order(k1);
    await rpc(db, "issue_checkout", { p_token: k1, p_order_ref: first.ref, p_attendee: "Bea", p_holder: buyer.id });
    const k2 = tok();
    await rpc(db, "hold_tickets", { p_event: ev, p_items: [{ tier: t, qty: 1 }], p_token: k2 });
    expect((await order(k2)).error?.message).toMatch(/customer_limit/);
    const pair = await tier({ name: "Pairs", price: 15, quantity: 10, min_per_order: 2 });
    expect((await rpc(db, "hold_tickets", { p_event: ev, p_items: [{ tier: pair, qty: 1 }], p_token: tok() })).error?.message).toBe("below_minimum");
  });

  test("presale access code, reserved allocation and organiser-only inventory", async () => {
    const pre = await tier({ name: "Presale", price: 25, quantity: 6, release_kind: "presale", access_code_required: true });
    expect((await rpc(anon() as unknown as Db, "hold_tickets", { p_event: ev, p_items: [{ tier: pre, qty: 1 }], p_token: tok() })).error?.message).toBe("access_code_required");
    // The organiser reserves 2 accessible places; an outsider can't touch allocations.
    const al = await ownerC.from("ticket_allocations").insert({ event_id: ev, tier_id: pre, kind: "accessible", label: "Accessible platform", quantity: 2 }).select("id").single();
    expect(al.error).toBeNull();
    expect((await outsiderC.from("ticket_allocations").insert({ event_id: ev, tier_id: pre, kind: "hold", quantity: 1 })).error).not.toBeNull();
    expect(((await outsiderC.from("ticket_allocations").select("id").eq("event_id", ev)).data ?? [])).toHaveLength(0);
    expect((await ownerC.from("ticket_allocations").insert({ event_id: ev, tier_id: pre, kind: "hold", quantity: 5 })).error?.message).toMatch(/allocation_exceeds_inventory/);
    await db.from("discount_codes").insert([{ event_id: ev, code: "Q20PRE", kind: "percent", amount: 0, purpose: "access", allocation_id: null },
      { event_id: ev, code: "Q20ACCESS", kind: "percent", amount: 0, purpose: "access", allocation_id: (al.data as Id).id }]);
    const pub = tok(), acc = tok();
    await rpc(db, "checkout_apply_code", { p_event: ev, p_token: pub, p_code: "Q20PRE", p_buyer: null });
    expect((await rpc(anon() as unknown as Db, "hold_tickets", { p_event: ev, p_items: [{ tier: pre, qty: 5 }], p_token: pub })).error?.message).toBe("sold_out");
    expect((await rpc(anon() as unknown as Db, "hold_tickets", { p_event: ev, p_items: [{ tier: pre, qty: 4 }], p_token: pub })).error).toBeNull();
    await rpc(db, "checkout_apply_code", { p_event: ev, p_token: acc, p_code: "Q20ACCESS", p_buyer: null });
    expect((await rpc(anon() as unknown as Db, "hold_tickets", { p_event: ev, p_items: [{ tier: pre, qty: 3 }], p_token: acc })).error?.message).toBe("allocation_exhausted");
    expect((await rpc(anon() as unknown as Db, "hold_tickets", { p_event: ev, p_items: [{ tier: pre, qty: 2 }], p_token: acc })).error).toBeNull();
    const inv = await rpc<{ tier_id: string; reserved_remaining: number; public_available: number; allocations: { used: number }[] }[]>(ownerC, "event_ticket_inventory", { p_event: ev });
    expect(inv.error).toBeNull();
    expect(inv.data.find(r => r.tier_id === pre)).toMatchObject({ reserved_remaining: 0, public_available: 0 });
    expect((await rpc(outsiderC, "event_ticket_inventory", { p_event: ev })).error?.message).toMatch(/not_authorized/);
    // Clients can't read code applications or call the service-only checkout internals.
    expect((await rpc(anon() as unknown as Db, "checkout_quote", { p_event: ev, p_token: pub })).error).not.toBeNull();
    expect((await rpc(anon() as unknown as Db, "checkout_apply_code", { p_event: ev, p_token: pub, p_code: "Q20PRE", p_buyer: null })).error).not.toBeNull();
  });

  test("Ticket Order state machine: legacy writes are mirrored, explicit illegal moves rejected", async () => {
    const t = await tier({ name: "Lifecycle", price: 9, quantity: 10 }), k = tok();
    await rpc(db, "hold_tickets", { p_event: ev, p_items: [{ tier: t, qty: 1 }], p_token: k });
    const o = await order(k);
    expect(await state(o.ref)).toBe("inventory_held");
    await db.from("checkout_orders").update({ stripe_session: `cs_test_q20_${randomBytes(5).toString("hex")}` }).eq("order_ref", o.ref);
    expect(await state(o.ref)).toBe("payment_pending");
    await db.from("checkout_orders").update({ status: "paid" }).eq("order_ref", o.ref);
    expect(await state(o.ref)).toBe("paid");
    await rpc(db, "issue_checkout", { p_token: k, p_order_ref: o.ref, p_attendee: "Life", p_holder: buyer.id });
    expect(await state(o.ref)).toBe("issued");
    await db.from("checkout_orders").update({ refund_status: "due", refund_reason: "event_cancelled" }).eq("order_ref", o.ref);
    expect(await state(o.ref)).toBe("refund_pending");
    await db.from("checkout_orders").update({ refund_status: "refunded", status: "refunded" }).eq("order_ref", o.ref);
    expect(await state(o.ref)).toBe("refunded");
    expect((await db.from("checkout_orders").update({ order_state: "issued" }).eq("order_ref", o.ref)).error?.message).toMatch(/illegal ticket_order transition/);
    expect((await rpc(db, "ticket_order_transition", { p_ref: o.ref, p_to: "paid" })).error?.message).toMatch(/illegal ticket_order transition/);
    const { data: events } = await db.from("domain_outbox").select("payload").eq("event_type", "ticket_order.state_changed").eq("aggregate_id", o.ref).order("seq");
    expect((events ?? []).map(e => (e as { payload: { to: string } }).payload.to)).toEqual(["inventory_held", "payment_pending", "paid", "issued", "refund_pending", "refunded"]);
    // Buyers see only their own orders.
    expect(((await outsiderC.from("checkout_orders").select("order_ref").eq("order_ref", o.ref)).data ?? [])).toHaveLength(0);
  });
});
