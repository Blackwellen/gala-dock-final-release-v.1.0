// Q44 — full cross-workspace E2E at API / RPC level (lane C). No browser, no Stripe API, no AI calls, no real email.
// Disposable identities (tests/phase1/helpers: p1-* users, is_test_fixture workspaces, public fixtures hidden by cleanup()).
// Every hand-off asserts the state machine, ledger balance (where money moves), the audit trail, in-app notifications and a
// cross-tenant denial. Payments use the service-only fixtures the payment specs use (payment_order_succeeded /
// checkout_order_direct_paid); webhooks are delivered to a LOCAL receiver only (127.0.0.1, in this process).
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, createHmac, randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { admin, anon, cleanup, createUser, enrolTotp, seedWorkspace, signedIn } from "../phase1/helpers";
import { FakeModel } from "../../src/lib/agent/eval/harness";

const db = admin as unknown as SupabaseClient;
type U = { id: string; email: string };
type Id = { id: string };
type R<T = unknown> = { data: T; error: { message: string; code?: string } | null };
const rpc = <T = unknown>(c: SupabaseClient, fn: string, args: Record<string, unknown> = {}) => c.rpc(fn, args) as unknown as Promise<R<T>>;
const ok = async <T = unknown>(p: PromiseLike<R<T>>, what = "call") => { const r = await p; expect(r.error?.message ?? null, what).toBeNull(); return r.data; };
const hex = (n = 4) => randomBytes(n).toString("hex");
const day = 864e5;
const iso = (ms: number) => new Date(ms).toISOString();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const ids = (r: { data: unknown }) => ((r.data ?? []) as Id[]).map(x => x.id);
const client = async (u: U) => (await signedIn(u.email)) as unknown as SupabaseClient;
// Ledger: every transaction balances (credits negative), returned as account -> sum for the given transactions.
async function ledger(txIds: string[]) {
  const rows = ((await db.from("ledger_entries").select("transaction_id, account, amount_minor").in("transaction_id", txIds)).data ?? []) as { transaction_id: string; account: string; amount_minor: number }[];
  const per = new Map<string, number>(), acc: Record<string, number> = {};
  for (const r of rows) { per.set(r.transaction_id, (per.get(r.transaction_id) ?? 0) + Number(r.amount_minor)); acc[r.account] = (acc[r.account] ?? 0) + Number(r.amount_minor); }
  return { rows: rows.length, unbalanced: [...per.values()].filter(v => v !== 0).length, accounts: acc };
}


// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// J1 Booking: customer plans → venue + supplier requested → quotes → holds → paid (accept) → confirmed → provider job →
//    BEO → event-day check-in → completion → review → payout readiness.
test.describe("Q44 J1 customer ↔ venue ↔ supplier booking", () => {
  test.describe.configure({ mode: "serial" });
  let cust: U, vOwner: U, dOwner: U, stranger: U, V = "", D = "", hall = "", dj = "", ev = "", iV = "", iD = "";
  let cc: SupabaseClient, vc: SupabaseClient, dc: SupabaseClient, sc: SupabaseClient;
  const tx: string[] = [], orders: { ref: string; item: string }[] = [];
  // The consumer date guard locks the date once providers are committed, so the party is scheduled to end shortly after the
  // spec starts (bookings, holds and payment happen before it; the review after it, like real life).
  const partyStart = Date.now() + 25_000, partyEnd = Date.now() + 45_000;
  test.beforeAll(async () => {
    [cust, vOwner, dOwner, stranger] = await Promise.all(["q44b-cust", "q44b-venue", "q44b-dj", "q44b-x"].map(l => createUser(l)));
    [V, D] = await Promise.all([seedWorkspace(vOwner.id, "provider", "Q44 Venue Co"), seedWorkspace(dOwner.id, "provider", "Q44 DJ Co")]);
    await db.from("workspaces").update({ capabilities: ["service"] }).eq("id", D);
    hall = ((await db.from("listings").insert({ workspace_id: V, name: "Q44 Hall", kind: "venue", category: "venue", published: false, city: "Q44ville", price_from: 900, capacity_max: 80, response_hours: 24 }).select("id").single()).data as Id).id;
    dj = ((await db.from("listings").insert({ workspace_id: D, name: "Q44 DJ", kind: "service", category: "dj", published: false, city: "Q44ville", price_from: 450, response_hours: 24 }).select("id").single()).data as Id).id;
    [cc, vc, dc, sc] = await Promise.all([cust, vOwner, dOwner, stranger].map(client));
  });
  test.afterAll(async () => {
    // Ledger postings are immutable: the event keeps its payment history (private consumer event, fixture workspaces hidden by cleanup()).
    await db.from("listings").update({ published: false }).in("id", [hall, dj].filter(Boolean));
    await cleanup();
  });

  test("plan → request → quote: build lines move suggested → sent → quoted; strangers are refused", async () => {
    ev = ((await ok(cc.from("events").insert({ owner_id: cust.id, management: "consumer", name: "Q44 Birthday", event_type: "birthday", status: "planning",
      guest_count: 40, budget_total: 4000, city: "Q44ville", starts_at: iso(partyStart), ends_at: iso(partyEnd) }).select("id").single() as never, "event")) as Id).id;
    iV = ((await ok(cc.from("build_items").insert({ event_id: ev, listing_id: hall, category: "venue", title: "Q44 Hall hire", status: "suggested", amount: 1500, role: "primary" }).select("id").single() as never, "venue line")) as Id).id;
    iD = ((await ok(cc.from("build_items").insert({ event_id: ev, listing_id: dj, category: "entertainment", title: "Q44 DJ set", status: "suggested", amount: 450, role: "primary" }).select("id").single() as never, "dj line")) as Id).id;
    expect((await rpc(sc, "event_build_canvas", { p_event: ev })).error?.message).toMatch(/not_authorized/);
    for (const i of [iV, iD]) expect(((await ok(rpc<{ status: string }>(cc, "transition_build_item", { p_item: i, p_to: "sent", p_hold_hours: null }), "send")) as { status: string }).status).toBe("sent");
    // Provider acknowledges and quotes; another provider can't quote someone else's line.
    await ok(rpc(vc, "provider_respond", { p_item: iV, p_response: "available", p_note: "Free that day" }), "respond");
    expect((await rpc(dc, "provider_save_quote_draft", { p_item: iV, p_quote: null, p_items: [{ label: "Hire", detail: "", qty: 1, unit: "fixed", unit_price: 1500, kind: "venue" }], p_tax_bps: 0, p_deposit_pct: 25, p_valid_days: 14, p_terms: {}, p_message: "x" })).error).not.toBeNull();
    for (const [c, item, price, kind] of [[vc, iV, 1500, "venue"], [dc, iD, 450, "service"]] as const) {
      const q = await ok(rpc<string>(c, "provider_save_quote_draft", { p_item: item, p_quote: null, p_items: [{ label: "Hire", detail: "", qty: 1, unit: "fixed", unit_price: price, kind }], p_tax_bps: 0, p_deposit_pct: 25, p_valid_days: 14, p_terms: {}, p_message: "Quote" }), "draft");
      await ok(rpc(c, "provider_send_quote", { p_quote: q }), "send quote");
    }
    const lines = ((await db.from("build_items").select("id, status, amount").in("id", [iV, iD])).data ?? []) as { id: string; status: string; amount: number }[];
    expect(lines.map(l => l.status)).toEqual(["quoted", "quoted"]);
    expect(Number(lines.find(l => l.id === iV)!.amount)).toBe(1500);
    expect(((await db.from("provider_quotes").select("status").eq("build_item_id", iV)).data ?? []).map(q => (q as { status: string }).status)).toEqual(["sent"]);
  });

  test("holds: venue first, supplier depends on the venue; only the seller can answer", async () => {
    const hv = await ok(rpc<string>(cc, "build_request_hold", { p_item: iV, p_hours: 72, p_conditions: null }), "venue hold");
    expect((await rpc(dc, "provider_respond_hold", { p_hold: hv, p_accept: true, p_hours: 72, p_note: "" })).error?.message).toMatch(/not_authorized/);
    await ok(rpc(vc, "provider_respond_hold", { p_hold: hv, p_accept: true, p_hours: 72, p_note: "Held for you" }), "venue accepts");
    const hd = await ok(rpc<string>(cc, "build_request_hold", { p_item: iD, p_hours: 48, p_conditions: null }), "dj hold");
    const h = (await db.from("conditional_holds").select("depends_on_item_id").eq("id", hd).single()).data as { depends_on_item_id: string };
    expect(h.depends_on_item_id).toBe(iV);
    await ok(rpc(dc, "provider_respond_hold", { p_hold: hd, p_accept: true, p_hours: 48, p_note: "" }), "dj accepts");
    expect(((await db.from("build_items").select("status").in("id", [iV, iD])).data ?? []).map(x => (x as { status: string }).status)).toEqual(["held", "held"]);
    expect(ids(await sc.from("conditional_holds").select("id").in("id", [hv, hd]))).toEqual([]);
  });

  test("accept = pay the deposit (payment fixture, no Stripe): confirmed, provider job, ledger balanced, seller notified", async () => {
    expect((await rpc(sc, "create_payment_order", { p_kind: "deposit", p_item: iV, p_standby: null })).error?.message).toMatch(/not_authorized/);
    for (const item of [iV, iD]) {
      const po = await ok(rpc<{ reference: string; amount_minor: number; customer_fee_minor: number; status: string }>(cc, "create_payment_order", { p_kind: "deposit", p_item: item, p_standby: null }), "payment order");
      expect(po.status).toBe("amount_due");
      expect((await rpc<{ reference: string }>(cc, "create_payment_order", { p_kind: "deposit", p_item: item, p_standby: null })).data.reference).toBe(po.reference);   // idempotent
      const pi = `pi_q44_${hex(6)}`;
      expect(await ok(rpc<string>(db, "payment_order_succeeded", { p_ref: po.reference, p_pi: pi, p_charge: `ch_${pi}`, p_amount_minor: po.amount_minor + po.customer_fee_minor, p_livemode: false }), "succeeded")).toBe("applied");
      expect((await rpc<string>(db, "payment_order_succeeded", { p_ref: po.reference, p_pi: pi, p_charge: `ch_${pi}`, p_amount_minor: po.amount_minor + po.customer_fee_minor, p_livemode: false })).data).toBe("already_applied");
      const t = ((await db.from("ledger_transactions").select("id").eq("idempotency_key", `stripe:pi:${pi}`)).data ?? []) as Id[];
      expect(t).toHaveLength(1); tx.push(t[0].id); orders.push({ ref: po.reference, item });
    }
    const l = await ledger(tx);
    expect(l.unbalanced).toBe(0);
    expect(l.rows).toBeGreaterThanOrEqual(6);
    expect(l.accounts.cash_stripe).toBeGreaterThan(0);
    expect(l.accounts.provider_payable).toBeLessThan(0);
    expect(((await db.from("build_items").select("status").in("id", [iV, iD])).data ?? []).map(x => (x as { status: string }).status)).toEqual(["confirmed", "confirmed"]);
    const jobs = ((await db.from("provider_jobs").select("id, workspace_id, status, payment_status, build_item_id").in("build_item_id", [iV, iD])).data ?? []) as { id: string; workspace_id: string; status: string; payment_status: string; build_item_id: string }[];
    expect(jobs.map(j => j.workspace_id).sort()).toEqual([V, D].sort());
    expect(jobs.every(j => j.payment_status === "deposit_paid")).toBe(true);
    expect(((await db.from("provider_quotes").select("status").eq("build_item_id", iV).eq("status", "accepted")).data ?? [])).toHaveLength(1);
    expect(((await db.from("audit_events").select("id").eq("event", "payment.succeeded").in("workspace_id", [V, D])).data ?? []).length).toBeGreaterThanOrEqual(2);
    for (const u of [vOwner, dOwner]) expect(((await db.from("notifications").select("id").eq("user_id", u.id).eq("kind", "booking_confirmed")).data ?? []).length).toBeGreaterThanOrEqual(1);
    // Each seller sees only its own job; the stranger none.
    expect(ids(await vc.from("provider_jobs").select("id").in("build_item_id", [iV, iD]))).toEqual([jobs.find(j => j.workspace_id === V)!.id]);
    expect(ids(await sc.from("provider_jobs").select("id").in("build_item_id", [iV, iD]))).toEqual([]);
  });

  test("BEO: venue sends the event order, the customer approves; the DJ can't touch the venue's job", async () => {
    const job = ((await db.from("provider_jobs").select("id").eq("build_item_id", iV).single()).data as Id).id;
    expect((await rpc(dc, "save_event_order", { p_job: job, p_content: { av: "x" }, p_financial: { total: 1 }, p_note: "x", p_send: true })).error).not.toBeNull();
    await ok(rpc(vc, "save_event_order", { p_job: job, p_content: { room: "Main hall", layout: "Cabaret 40", av: "PA + 2 mics" }, p_financial: { total: 1500 }, p_note: "Run sheet v1", p_send: true }), "BEO");
    const o = (await db.from("event_orders").select("id, status, current_version").eq("provider_job_id", job).single()).data as { id: string; status: string; current_version: number };
    expect(o.status).toBe("sent");
    await ok(rpc(cc, "approve_event_order", { p_order: o.id, p_version: o.current_version }), "approve");
    expect(((await db.from("event_orders").select("status").eq("id", o.id).single()).data as { status: string }).status).toMatch(/approved|confirmed/);
    expect(ids(await sc.from("event_orders").select("id").eq("id", o.id))).toEqual([]);
  });

  test("event day: supplier en route → owner checks them in → jobs active → completed; then review and payout readiness", async () => {
    await ok(rpc(dc, "set_provider_checkin", { p_item: iD, p_status: "en_route", p_eta: iso(Date.now() + 20 * 6e4), p_note: "20 min away" }), "en route");
    expect((await rpc(dc, "set_provider_checkin", { p_item: iD, p_status: "checked_in", p_eta: null, p_note: null })).error?.message).toMatch(/invalid_status/);
    expect((await rpc(sc, "set_provider_checkin", { p_item: iD, p_status: "arrived", p_eta: null, p_note: null })).error?.message).toMatch(/not_authorized/);
    await ok(rpc(cc, "set_provider_checkin", { p_item: iD, p_status: "checked_in", p_eta: null, p_note: null }), "owner checks in");
    const ci = (await db.from("provider_checkins").select("status, arrived_at").eq("build_item_id", iD).single()).data as { status: string; arrived_at: string | null };
    expect(ci.status).toBe("checked_in"); expect(ci.arrived_at).not.toBeNull();
    const jobs = ((await db.from("provider_jobs").select("id, workspace_id, status").in("build_item_id", [iV, iD])).data ?? []) as { id: string; workspace_id: string; status: string }[];
    for (const j of jobs) {
      const c = j.workspace_id === V ? vc : dc;
      if (j.status === "held") await ok(rpc(c, "provider_job_transition", { p_job: j.id, p_to: "confirmed", p_reason: "Deposit paid" }), "job confirmed");
      await ok(rpc(c, "provider_job_transition", { p_job: j.id, p_to: "active", p_reason: "On site" }), "job active");
      await ok(rpc(c, "provider_job_transition", { p_job: j.id, p_to: "completed", p_reason: "Delivered" }), "job completed");
    }
    expect(((await db.from("provider_jobs").select("status").in("build_item_id", [iV, iD])).data ?? []).map(x => (x as { status: string }).status)).toEqual(["completed", "completed"]);
    expect(((await db.from("audit_events").select("event").in("workspace_id", [V, D]).in("event", ["booking.active", "booking.completed"])).data ?? []).length).toBe(4);
    // Delivery confirmed (the completion worker's effect) and the party is over.
    await db.from("build_items").update({ status: "fulfilled" }).in("id", [iV, iD]);
    // 3 s margin: this machine's clock runs ~1.2 s ahead of the database (now() decides event_not_ended).
    if (Date.now() < partyEnd + 3000) await new Promise(r => setTimeout(r, partyEnd + 3000 - Date.now()));
    expect((await rpc(vc, "submit_review", { p_item: iV, p_rating: 5, p_ratings: {}, p_body: "Reviewing my own venue is not allowed here.", p_photos: [] })).error?.message).toMatch(/self_review|not_authorized/);
    const rev = await ok(rpc<string>(cc, "submit_review", { p_item: iV, p_rating: 5, p_ratings: { quality: 5, value: 4 }, p_body: "Lovely hall, the team were brilliant all night.", p_photos: [] }), "review");
    expect(((await db.from("reviews").select("id, rating").eq("build_item_id", iV)).data ?? [])).toEqual([{ id: rev, rating: 5 }]);
    // Payout readiness: protected funds release after delivery; payouts need a verified connected account.
    await ok(rpc(db, "payment_release_scan"), "release scan");
    const st = ((await db.from("payment_orders").select("status").in("reference", orders.map(o => o.ref))).data ?? []).map(x => (x as { status: string }).status);
    expect(st.every(s => ["eligible_for_provider_transfer", "payment_succeeded", "transferred"].includes(s))).toBe(true);
    expect((await rpc<boolean>(db, "payout_eligible", { p_workspace: V })).data).toBe(false);
    await db.from("connect_accounts").insert({ workspace_id: V, stripe_account_id: `acct_test_q44${hex(4)}`, account_type: "standard", charges_enabled: true, payouts_enabled: true, details_submitted: true, card_payments_capability: "active", transfers_capability: "active", verification_state: "verified" });
    expect((await rpc<boolean>(db, "payout_eligible", { p_workspace: V })).data).toBe(true);
    expect((await rpc(vc, "payout_eligible", { p_workspace: V })).error).not.toBeNull();   // service-only
    expect((await ledger(tx)).unbalanced).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// J2 Ticketing + J3 promoter attribution: tiers, zones, seat map → lifecycle publish → anon hold → quote → paid (fixture) →
//    issued → promoter commission in the ledger → transfer → resale → door scan → hybrid online join → refund (+ reversal) →
//    credential rotation.
test.describe("Q44 J2/J3 ticketing and promoter attribution", () => {
  test.describe.configure({ mode: "serial" });
  let org: U, buyer: U, friend: U, buyer2: U, door: U, prom: U, outsider: U, W = "", ev = "", ga = "", seatTier = "", zone = "", promoter = "", code = "";
  let oc: SupabaseClient, bc: SupabaseClient, fc: SupabaseClient, b2c: SupabaseClient, doorC: SupabaseClient, xc: SupabaseClient;
  let refA = "", refB = "", tokA = "", tokB = "", t1 = "", t2 = "", t3 = "", friendTicket = "", session = "", resaleTicket = "";
  const tx: string[] = [];
  test.beforeAll(async () => {
    [org, buyer, friend, buyer2, door, prom, outsider] = await Promise.all(["q44t-org", "q44t-buyer", "q44t-friend", "q44t-buyer2", "q44t-door", "q44t-prom", "q44t-x"].map(l => createUser(l)));
    W = await seedWorkspace(org.id, "organizer", "Q44 Ticketing Co");
    await db.from("workspaces").update({ payout_status: "active" }).eq("id", W);
    [oc, bc, fc, b2c, doorC, xc] = await Promise.all([org, buyer, friend, buyer2, door, outsider].map(client));
  });
  test.afterAll(async () => {
    if (ev) {
      await db.from("events").update({ visibility: "private" }).eq("id", ev);
      const tks = ids(await db.from("tickets").select("id").eq("event_id", ev));
      if (tks.length) await db.from("resale_holds").delete().in("ticket_id", tks);
    }
    await cleanup();
  });

  test("organiser builds tiers, a zone and a published seat map; publishes through the lifecycle command", async () => {
    const start = Date.now() + 30 * day;
    ev = ((await ok(oc.from("events").insert({ owner_id: org.id, workspace_id: W, management: "professional", name: `Q44 Night ${hex(2)}`, event_type: "conference", status: "draft",
      starts_at: iso(start), ends_at: iso(start + 5 * 36e5), capacity: 300, settings: { venue_confirmed: true, resale: true, reentry: false } }).select("id").single() as never, "event")) as Id).id;
    ga = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "Q44 GA", kind: "general", price: 20, quantity: 100, status: "draft", sort: 1 }).select("id").single()).data as Id).id;
    seatTier = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "Q44 Table", kind: "vip", price: 40, quantity: 6, status: "draft", sort: 2 }).select("id").single()).data as Id).id;
    zone = (await ok(rpc<{ id: string }>(oc, "save_access_zone", { p_event: ev, p_zone: { name: "Q44 Main floor", kind: "general", reentry: "deny" }, p_id: null }), "zone")).id;
    expect((await rpc(xc, "save_access_zone", { p_event: ev, p_zone: { name: "x", kind: "general" }, p_id: null })).error?.message).toMatch(/not_authorized/);
    expect(ids(await db.from("access_zones").select("id").eq("event_id", ev))).toEqual([zone]);
    const { planSeats } = await import("../../src/components/venue-plan/inventory");
    const els = [{ type: "asset", asset: "round_table", label: "Table 1", x: 50, y: 50, w: 28, h: 28, tier: seatTier, table: { shape: "round", seats: 6, number: "1", seatStyle: "numeric" } }];
    expect(typeof (await ok(rpc<number>(oc, "organizer_save_event_plan", { p_event: ev, p_structure: { format: "plan-v2" }, p_overlay: els, p_seats: planSeats(els as never), p_publish: true }), "map"))).toBe("number");
    expect(((await db.from("event_seats").select("seat_key").eq("event_id", ev)).data ?? [])).toHaveLength(6);
    // Gates: the conference needs a programme to publish; on_sale needs a selling tier.
    const b1 = await ok(rpc<{ ok: boolean; error?: string; blockers?: { key: string }[] }>(oc, "event_transition", { p_event: ev, p_to: "published", p_expected: "draft", p_reason: null }), "publish blocked");
    expect(b1.ok).toBe(false); expect(b1.blockers!.map(b => b.key)).toContain("programme");
    await db.from("programme_items").insert({ event_id: ev, kind: "programme", title: "Keynote", area: "Main", starts_at: iso(start), duration_minutes: 60 });
    expect((await ok(rpc<{ ok: boolean }>(oc, "event_transition", { p_event: ev, p_to: "published", p_expected: "draft", p_reason: "Ready" }), "publish")).ok).toBe(true);
    const b2 = await ok(rpc<{ ok: boolean; blockers?: { key: string }[] }>(oc, "event_transition", { p_event: ev, p_to: "on_sale", p_expected: "published", p_reason: null }), "on sale blocked");
    expect(b2.ok).toBe(false); expect(b2.blockers!.map(b => b.key)).toContain("tickets");
    await db.from("ticket_tiers").update({ status: "on_sale" }).in("id", [ga, seatTier]);
    expect((await ok(rpc<{ ok: boolean }>(oc, "event_transition", { p_event: ev, p_to: "on_sale", p_expected: "published", p_reason: "Tickets live" }), "on sale")).ok).toBe(true);
    expect(ids(await anon().from("events").select("id").eq("id", ev))).toEqual([ev]);
    const moves = (((await db.from("audit_events").select("metadata").eq("event", "event.status_changed").eq("metadata->>event_id", ev)).data ?? []) as { metadata: { to: string } }[]).map(m => m.metadata.to).sort();
    expect(moves).toEqual(["on_sale", "published"]);
    expect(((await db.from("event_lifecycle_overrides").select("id").eq("event_id", ev)).data ?? [])).toHaveLength(0);   // no override, no bypass
    expect((await rpc(xc, "event_transition", { p_event: ev, p_to: "cancelled", p_expected: "on_sale", p_reason: "hijack" })).error?.message).toMatch(/not_authorized/);
  });

  test("anonymous buyer holds, gets a quote, pays (direct-charge fixture) and is issued tickets; promoter earns commission in the ledger", async () => {
    code = `Q44P${hex(3).toUpperCase()}`;
    promoter = ((await db.from("promoters").insert({ event_id: ev, user_id: prom.id, name: "Q44 Promoter", code, commission_pct: 10, status: "active", email: "" }).select("id").single()).data as Id).id;
    tokA = randomBytes(18).toString("base64url"); tokB = randomBytes(18).toString("base64url");
    await ok(rpc(anon() as unknown as SupabaseClient, "hold_tickets", { p_event: ev, p_items: [{ tier: ga, qty: 2 }], p_token: tokA }), "hold A");
    await ok(rpc(anon() as unknown as SupabaseClient, "hold_seats", { p_event: ev, p_keys: ["T1-1"], p_token: tokB }), "seat hold B");
    expect((await rpc(anon() as unknown as SupabaseClient, "hold_seats", { p_event: ev, p_keys: ["T1-1"], p_token: randomBytes(18).toString("base64url") })).error?.message).toMatch(/seat_unavailable/);
    expect((await rpc(anon() as unknown as SupabaseClient, "checkout_quote", { p_event: ev, p_token: tokA })).error).not.toBeNull();   // service-only
    for (const [tok, holder] of [[tokA, buyer], [tokB, buyer]] as const) {
      const q = await ok(rpc<{ kind: string; subtotal_minor: number; fee_minor: number; total_minor: number; lines: { tier_id: string; unit_minor: number; qty: number; seats: string[] }[] }>(db, "checkout_quote", { p_event: ev, p_token: tok }), "quote");
      expect(q.subtotal_minor).toBe(tok === tokA ? 4000 : 4000);
      const ref = `GD-Q44-${hex(4).toUpperCase()}`;
      await ok(db.from("checkout_orders").insert({ order_ref: ref, event_id: ev, buyer_id: holder.id, token: tok, amount: q.subtotal_minor / 100, fee: q.fee_minor / 100, currency: "GBP", status: "pending", kind: q.kind,
        ref_code: code, ref_channel: "link", lines: q.lines.map(l => ({ tier_id: l.tier_id, name: "Q44", qty: l.qty, unit: l.unit_minor / 100, seats: l.seats ?? [] })) }) as never, "order");
      await db.from("checkout_orders").update({ stripe_session: `cs_test_q44${hex(4)}`, strategy: "direct", connected_account_id: "acct_test_q44", seller_workspace_id: W, application_fee_minor: 100 }).eq("order_ref", ref);
      const pi = `pi_test_q44${hex(6)}`, gross = q.subtotal_minor + q.fee_minor;
      expect((await rpc<string>(db, "checkout_order_direct_paid", { p_ref: ref, p_pi: pi, p_charge: "", p_amount_minor: gross - 1, p_account: "acct_test_q44", p_application_fee: null })).data ?? "").toMatch(/amount_mismatch/);
      expect(await ok(rpc<string>(db, "checkout_order_direct_paid", { p_ref: ref, p_pi: pi, p_charge: "", p_amount_minor: gross, p_account: "acct_test_q44", p_application_fee: null }), "paid")).toBe("applied");
      tx.push(...ids(await db.from("ledger_transactions").select("id").eq("idempotency_key", `stripe:pi:${pi}`)));
      expect(await ok(rpc<number>(db, "issue_checkout", { p_token: tok, p_order_ref: ref, p_attendee: "Q44 Buyer", p_holder: holder.id }), "issue")).toBeGreaterThanOrEqual(1);
      expect(Number((await ok(rpc<number>(db, "attribute_referral", { p_order_ref: ref }), "attribute")))).toBe(tok === tokA ? 2 : 1);
      expect(Number((await rpc<number>(db, "attribute_referral", { p_order_ref: ref })).data)).toBe(0);   // replay
      if (tok === tokA) refA = ref; else refB = ref;
    }
    expect(tx).toHaveLength(2);
    expect((await ledger(tx)).unbalanced).toBe(0);
    const tA = ((await db.from("tickets").select("id, status").eq("order_ref", refA).order("id")).data ?? []) as { id: string; status: string }[];
    expect(tA.map(t => t.status)).toEqual(["valid", "valid"]); [t1, t2] = tA.map(t => t.id);
    t3 = ((await db.from("tickets").select("id").eq("order_ref", refB).single()).data as Id).id;
    expect(((await db.from("checkout_orders").select("order_state").in("order_ref", [refA, refB])).data ?? []).map(o => (o as { order_state: string }).order_state)).toEqual(["issued", "issued"]);
    // Promoter: commission on the ticket value only, booked to promoter_payable in a balanced memo transaction.
    const sales = ((await db.from("promoter_sales").select("id, amount, commission, status").eq("promoter_id", promoter)).data ?? []) as { id: string; amount: number; commission: number; status: string }[];
    expect(sales).toHaveLength(2);
    expect(sales.map(s => Number(s.commission)).sort()).toEqual([4, 4]);
    const ptx = ids(await db.from("ledger_transactions").select("id").eq("source_type", "promoter_sale").in("source_id", sales.map(s => s.id)));
    expect(ptx).toHaveLength(2);
    const pl = await ledger(ptx);
    expect(pl.unbalanced).toBe(0); expect(pl.accounts.promoter_payable).toBe(-800); expect(pl.accounts.cash_stripe ?? 0).toBe(0);
    expect(((await db.from("promoters").select("tickets_sold").eq("id", promoter).single()).data as { tickets_sold: number }).tickets_sold).toBe(3);
    // The outsider sees none of it.
    expect(ids(await xc.from("tickets").select("id").eq("event_id", ev))).toEqual([]);
    expect(((await xc.from("checkout_orders").select("order_ref").eq("event_id", ev)).data ?? [])).toEqual([]);
  });

  test("transfer, official resale, door scan, hybrid online join", async () => {
    const th = sha(randomBytes(32).toString("hex"));
    expect((await rpc(xc, "offer_ticket_transfer", { p_ticket: t1, p_email: friend.email, p_name: "Fran", p_token_hash: th })).error).not.toBeNull();
    await ok(rpc(bc, "offer_ticket_transfer", { p_ticket: t1, p_email: friend.email, p_name: "Fran", p_token_hash: th }), "offer");
    friendTicket = await ok(rpc<string>(fc, "accept_ticket_transfer", { p_token_hash: th }), "accept");
    expect((await rpc(fc, "accept_ticket_transfer", { p_token_hash: th })).error).not.toBeNull();   // single use
    expect((await db.from("tickets").select("status, replaced_by").eq("id", t1).single()).data).toEqual({ status: "transferred", replaced_by: friendTicket });
    // Resale: buyer lists t2, buyer2 holds and is issued; the seller's ticket is resold with a rotated nonce.
    const before = ((await db.from("tickets").select("qr_nonce").eq("id", t2).single()).data as { qr_nonce: string }).qr_nonce;
    await ok(rpc(bc, "list_ticket_for_resale", { p_ticket: t2, p_cancel: false }), "list");
    expect(((await rpc<{ id: string }[]>(anon() as unknown as SupabaseClient, "resale_listings", { p_event: ev })).data ?? []).length).toBeGreaterThanOrEqual(1);
    const rt = randomBytes(18).toString("base64url");
    await ok(rpc(b2c, "hold_resale", { p_event: ev, p_tickets: [t2], p_token: rt }), "resale hold");
    const rref = `GD-Q44R-${hex(4).toUpperCase()}`;
    await ok(db.from("checkout_orders").insert({ order_ref: rref, event_id: ev, buyer_id: buyer2.id, token: rt, amount: 20, fee: 1, status: "pending", lines: [], kind: "resale" }) as never, "resale order");
    expect(await ok(rpc<number>(db, "issue_resale", { p_token: rt, p_order_ref: rref, p_attendee: "Q44 Buyer Two", p_holder: buyer2.id }), "issue resale")).toBe(1);
    const old = (await db.from("tickets").select("status, qr_nonce, replaced_by").eq("id", t2).single()).data as { status: string; qr_nonce: string; replaced_by: string };
    resaleTicket = old.replaced_by;
    expect(old.status).toBe("resold"); expect(old.qr_nonce).not.toBe(before);
    expect(((await db.from("tickets").select("holder_id, status").eq("id", old.replaced_by).single()).data)).toEqual({ holder_id: buyer2.id, status: "valid" });
    expect(((await db.from("ticket_resale_listings").select("status").eq("ticket_id", t2)).data ?? []).map(x => (x as { status: string }).status)).toContain("sold");
    // Door: an assigned scanner admits the friend once; the transferred original is refused.
    await ok(rpc(oc, "assign_event_scanner", { p_event: ev, p_user: door.id, p_zones: null, p_expires_at: null }), "scanner");
    const ft = (await db.from("tickets").select("id, qr_nonce").eq("id", friendTicket).single()).data as { id: string; qr_nonce: string };
    const scan = (c: SupabaseClient, ticket: string, nonce: string) => rpc<{ result: string }>(c, "scan_admission", { p_event: ev, p_zone: null, p_ticket: ticket, p_pass: null, p_code: null, p_nonce: nonce, p_credential: "wallet", p_device: "q44-gate-1",
      p_offline_at: null, p_gate: null, p_client_scan_id: null, p_snapshot: null, p_local_result: null, p_direction: null });
    expect((await scan(xc, ft.id, ft.qr_nonce)).error?.message).toMatch(/not_authorized/);
    expect((await ok(scan(doorC, ft.id, ft.qr_nonce), "admit")).result).toBe("admitted");
    expect((await ok(scan(doorC, ft.id, ft.qr_nonce), "dup")).result).toBe("duplicate");
    const o1 = (await db.from("tickets").select("qr_nonce").eq("id", t1).single()).data as { qr_nonce: string };
    expect((await ok(scan(doorC, t1, o1.qr_nonce), "transferred")).result).toBe("transferred");
    expect(((await db.from("check_ins").select("id").eq("event_id", ev)).data ?? []).length).toBeGreaterThanOrEqual(3);
    // Hybrid: the GA tier includes the stream; the friend joins online and the ticket stays valid.
    await db.from("event_virtual").insert({ event_id: ev, format: "hybrid", capacity: 100 });
    await ok(rpc(oc, "virtual_tier_mode_set", { p_tier: ga, p_mode: "hybrid" }), "tier mode");
    session = (await ok(rpc<{ id: string }>(oc, "virtual_session_save", { p_event: ev, p: { title: "Q44 Keynote stream", starts_at: iso(Date.now() - 6e5), ends_at: iso(Date.now() + 36e5), join_url: "https://stream.example.test/q44", capacity: 100, max_devices_per_attendee: 1 }, p_session: null }), "session")).id;
    const statusBefore = ((await db.from("tickets").select("status").eq("id", friendTicket).single()).data as { status: string }).status;   // "used": admitted at the door
    const jt = await ok(rpc<{ ok: boolean; token: string }>(fc, "virtual_issue_join_token", { p_session: session, p_device: "q44-dev-friend-01", p_ticket: null }), "join token");
    expect(jt.ok).toBe(true);
    const red = await ok(rpc<{ ok: boolean; url: string }>(fc, "virtual_redeem_join_token", { p_token: jt.token, p_device: "q44-dev-friend-01" }), "redeem");
    expect(red).toMatchObject({ ok: true, url: "https://stream.example.test/q44" });
    expect(((await rpc<{ ok: boolean }>(xc, "virtual_issue_join_token", { p_session: session, p_device: "q44-dev-x-000001", p_ticket: null })).data as { ok?: boolean } | null)?.ok ?? false).toBe(false);
    expect(((await db.from("tickets").select("status").eq("id", friendTicket).single()).data as { status: string }).status).toBe(statusBefore);   // joining online changes nothing
    expect(((await db.from("check_ins").select("id").eq("ticket_id", friendTicket).eq("credential", "virtual")).data ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test("refund reverses the promoter commission and rotates the credential; credential reissue notifies the holder", async () => {
    const before = (await db.from("tickets").select("qr_nonce, credential_version").eq("id", t3).single()).data as { qr_nonce: string; credential_version: number };
    await db.from("checkout_orders").update({ refund_status: "due", refund_reason: "buyer_request" }).eq("order_ref", refB);
    expect(((await db.from("checkout_orders").select("order_state").eq("order_ref", refB).single()).data as { order_state: string }).order_state).toBe("refund_pending");
    await db.from("tickets").update({ status: "refunded" }).eq("order_ref", refB).in("status", ["cancelled", "valid"]);
    await db.from("checkout_orders").update({ refund_status: "refunded", status: "refunded" }).eq("order_ref", refB);
    expect(((await db.from("checkout_orders").select("order_state").eq("order_ref", refB).single()).data as { order_state: string }).order_state).toBe("refunded");
    const after = (await db.from("tickets").select("status, qr_nonce, credential_version").eq("id", t3).single()).data as { status: string; qr_nonce: string; credential_version: number };
    expect(after.status).toBe("refunded"); expect(after.qr_nonce).not.toBe(before.qr_nonce); expect(after.credential_version).toBeGreaterThan(before.credential_version);
    expect((await db.from("tickets").update({ status: "valid" }).eq("id", t3)).error?.message).toMatch(/illegal ticket transition refunded -> valid/);
    let reversed = "";
    for (let i = 0; i < 10 && reversed !== "reversed"; i++) {
      reversed = ((await db.from("promoter_sales").select("status").eq("order_ref", refB).maybeSingle()).data as { status: string } | null)?.status ?? "";
      if (reversed !== "reversed") await new Promise(r => setTimeout(r, 500));
    }
    expect(reversed).toBe("reversed");
    const all = ids(await db.from("ledger_transactions").select("id").eq("source_type", "promoter_sale"));
    const mine = ((await db.from("promoter_sales").select("id").eq("promoter_id", promoter)).data ?? []).map(x => (x as Id).id);
    const ptx = ids(await db.from("ledger_transactions").select("id").eq("source_type", "promoter_sale").in("source_id", mine));
    expect(all.length).toBeGreaterThanOrEqual(ptx.length);
    const pl = await ledger(ptx);
    expect(pl.unbalanced).toBe(0); expect(pl.accounts.promoter_payable).toBe(-400);   // 800 accrued − 400 reversed
    // Credential rotation (lost phone): an admitted ticket can't be reissued; buyer2's unscanned resale ticket is rotated by the
    // organiser, the old wallet nonce dies at the door and the holder is notified in-app.
    expect((await rpc(oc, "reissue_ticket_credentials", { p_ticket: friendTicket, p_scope: "all", p_reason: "Phone stolen" })).error?.message).toMatch(/not_reissuable/);
    const cur = (await db.from("tickets").select("qr_nonce").eq("id", resaleTicket).single()).data as { qr_nonce: string };
    expect((await rpc(xc, "reissue_ticket_credentials", { p_ticket: resaleTicket, p_scope: "all", p_reason: "hijack" })).error?.message).toMatch(/not_authorized/);
    await ok(rpc(oc, "reissue_ticket_credentials", { p_ticket: resaleTicket, p_scope: "all", p_reason: "Phone stolen" }), "rotate");
    expect(((await db.from("tickets").select("qr_nonce").eq("id", resaleTicket).single()).data as { qr_nonce: string }).qr_nonce).not.toBe(cur.qr_nonce);
    expect((await ok(rpc<{ result: string }>(doorC, "scan_admission", { p_event: ev, p_zone: null, p_ticket: resaleTicket, p_pass: null, p_code: null, p_nonce: cur.qr_nonce, p_credential: "wallet", p_device: "q44-gate-1",
      p_offline_at: null, p_gate: null, p_client_scan_id: null, p_snapshot: null, p_local_result: null, p_direction: null }), "old nonce")).result).toBe("invalid");
    expect(((await db.from("notifications").select("id").eq("user_id", buyer2.id).eq("link", `/account/tickets/${resaleTicket}`)).data ?? []).length).toBeGreaterThanOrEqual(1);
    expect(((await db.from("domain_outbox").select("id").eq("event_type", "ticket.credential_rotated").eq("aggregate_id", resaleTicket)).data ?? []).length).toBeGreaterThanOrEqual(1);
    expect((await ledger(tx)).unbalanced).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// J4 Compliance-gated publish: blocked by a rule pack → licence granted → published.
test.describe("Q44 J4 compliance-gated publish", () => {
  test.describe.configure({ mode: "serial" });
  let org: U, outsider: U, W = "", ev = "", pack = "", country = "";
  let oc: SupabaseClient, xc: SupabaseClient;
  test.beforeAll(async () => {
    [org, outsider] = await Promise.all([createUser("q44c-org"), createUser("q44c-x")]);
    W = await seedWorkspace(org.id, "organizer", "Q44 Compliance Co");
    [oc, xc] = await Promise.all([org, outsider].map(client));
    pack = `xq-q44-${hex(3)}`; country = "XQ";
    await db.from("compliance_rule_packs").insert({ key: pack, country, name: "Q44 test land" });
    await db.from("compliance_rules").insert({ pack_key: pack, key: "xq_permit", label: "XQ event permit", requirement_kind: "licence", applies: { min_attendance: 10 }, satisfied_by: { licence_types: ["event_insurance"] }, fix_text: "Get the XQ permit." });
  });
  test.afterAll(async () => {
    await db.from("compliance_rule_packs").delete().eq("key", pack);
    if (ev) await db.from("events").update({ visibility: "private" }).eq("id", ev);
    await cleanup();
  });

  test("blocked → fixed → published, with the blocker named at each step", async () => {
    const start = Date.now() + 40 * day;
    ev = ((await ok(oc.from("events").insert({ owner_id: org.id, workspace_id: W, management: "professional", name: "Q44 Permit Conf", event_type: "conference", status: "planning",
      starts_at: iso(start), ends_at: iso(start + 8 * 36e5), capacity: 50, settings: { venue_confirmed: true } }).select("id").single() as never, "event")) as Id).id;
    await db.from("programme_items").insert({ event_id: ev, kind: "programme", title: "Opening", area: "Main", starts_at: iso(start), duration_minutes: 30 });
    await ok(rpc(oc, "compliance_profile_save", { p_event: ev, p: { country: country.toLowerCase() } }), "profile");
    expect((await rpc(xc, "compliance_profile_save", { p_event: ev, p: { country: "gb" } })).error?.message).toMatch(/not_authorized/);
    const blocked = await ok(rpc<{ ok: boolean; error: string; blockers: { key: string }[] }>(oc, "event_transition", { p_event: ev, p_to: "published", p_expected: "planning", p_reason: null }), "blocked");
    expect(blocked.ok).toBe(false); expect(blocked.error).toBe("preconditions");
    expect(blocked.blockers.map(b => b.key)).toEqual(["ops_rule_xq_permit"]);
    // The direct write is refused too (row guard), with the same blocker.
    expect((await oc.from("events").update({ status: "published" }).eq("id", ev)).error?.message).toMatch(/lifecycle_preconditions: .*XQ event permit/);
    const lic = await ok(rpc<{ id: string }>(oc, "licence_save", { p_event: ev, p: { licence_type: "event_insurance", authority: "XQ Council" }, p_id: null }), "licence");
    await ok(rpc(oc, "licence_transition", { p_licence: lic.id, p_to: "submitted", p_note: null, p: {} }), "submitted");
    await ok(rpc(oc, "licence_transition", { p_licence: lic.id, p_to: "granted", p_note: null, p: { reference: "XQ-1", valid_from: iso(Date.now()), valid_to: iso(start + 30 * day) } }), "granted");
    expect(((await rpc<{ key: string }[]>(oc, "event_lifecycle_blockers", { p_event: ev, p_to: "published" })).data ?? []).map(b => b.key)).toEqual([]);
    expect((await ok(rpc<{ ok: boolean }>(oc, "event_transition", { p_event: ev, p_to: "published", p_expected: "planning", p_reason: "Permit granted" }), "published")).ok).toBe(true);
    expect(((await db.from("events").select("status, visibility").eq("id", ev).single()).data)).toEqual({ status: "published", visibility: "public" });
    expect(ids(await anon().from("events").select("id").eq("id", ev))).toEqual([ev]);
    expect(((await db.from("audit_events").select("id").eq("event", "event.status_changed").eq("metadata->>event_id", ev).eq("metadata->>to", "published")).data ?? [])).toHaveLength(1);
    expect(ids(await xc.from("event_licences").select("id").eq("event_id", ev))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// J5 Agent mission: governed approval + external wait / resume. FakeModel only; the run engine is played by the service role
//    (agent_execute_tool), never /api/agent/worker; no model is called.
test.describe("Q44 J5 agent mission: approval, wait, resume", () => {
  test.describe.configure({ mode: "serial" });
  let O: U, P: U, X: U, W = "", PW = "", E = "", L = "", B = "", RO = "";
  let oc: SupabaseClient, pc: SupabaseClient, xc: SupabaseClient;
  const exec = (tool: string, args: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    rpc<{ ok: boolean; error?: string; replayed?: boolean; call_id?: string }>(db, "agent_execute_tool", { p_run: RO, p_step: null, p_actor: O.id, p_tool: tool, p_args: args, p_idempotency: `q44-${tool}-${hex(4)}`, p_approval: null, p_policy_auto: false, ...extra });
  test.beforeAll(async () => {
    [O, P, X] = await Promise.all([createUser("q44a-org"), createUser("q44a-prov"), createUser("q44a-x")]);
    [W, PW] = await Promise.all([seedWorkspace(O.id, "organizer", "Q44 Agent Org"), seedWorkspace(P.id, "provider", "Q44 Agent Venue")]);
    await db.from("workspaces").update({ plan: "pro" }).eq("id", W);
    await db.from("ai_budgets").upsert({ workspace_id: W, monthly_allowance: 1000, hard_cap: true, allow_overage: false, overage_limit: 0 });
    E = ((await db.from("events").insert({ owner_id: O.id, workspace_id: W, management: "professional", name: "Q44 Agent Gala", status: "planning", starts_at: iso(Date.now() + 50 * day) }).select("id").single()).data as Id).id;
    L = ((await db.from("listings").insert({ workspace_id: PW, name: "Q44 Agent Hall", kind: "venue", category: "venue", published: false, response_hours: 24 }).select("id").single()).data as Id).id;
    B = ((await db.from("build_items").insert({ event_id: E, listing_id: L, category: "venue", title: "Hall enquiry", status: "sent", role: "primary" }).select("id").single()).data as Id).id;
    RO = ((await db.from("agent_runs").insert({ workspace_id: W, user_id: O.id, surface: "organizer", mode: "do", goal: "Source a venue for the gala", status: "running", plan: [], mission: "org.source_venue" }).select("id").single()).data as Id).id;
    [oc, pc, xc] = await Promise.all([O, P, X].map(client));
  });
  test.afterAll(async () => {
    if (RO) { await db.from("agent_approvals").delete().eq("run_id", RO); await db.from("agent_runs").delete().eq("id", RO); }
    await cleanup();
  });

  test("FakeModel plans without a network call", async () => {
    const m = new FakeModel({ plan: { text: "{\"steps\":[\"calendar.upcoming\",\"message.party\",\"event.readiness\"]}" } });
    const r = await m.chat("plan", "Source a venue");
    expect(JSON.stringify(r)).toContain("message.party");
    expect(m.calls.length).toBe(1);
  });

  test("R3 action needs approval → owner approves → executes once → waits on the venue → venue replies → resumes → completes", async () => {
    expect((await exec("calendar.upcoming", {})).data.ok).toBe(true);
    const ask = { to_type: "workspace", to: PW, body: "Is the hall free on the 12th?", event_id: E, item_id: B };
    expect((await exec("message.party", ask)).data.error).toBe("approval_required");
    const ap = ((await db.from("agent_approvals").insert({ run_id: RO, workspace_id: W, title: "Send message", action: "message.party", tool_id: "message.party", risk: 3, payload: ask, status: "pending", requested_by: O.id, expires_at: iso(Date.now() + day) }).select("id").single()).data as Id).id;
    await db.from("agent_runs").update({ status: "waiting_approval" }).eq("id", RO);
    expect((await rpc(xc, "decide_agent_approval", { p_approval: ap, p_approve: true, p_edited: null })).error).not.toBeNull();
    await ok(rpc(oc, "decide_agent_approval", { p_approval: ap, p_approve: true, p_edited: null }), "approve");
    await db.from("agent_runs").update({ status: "running" }).eq("id", RO);
    const key = `q44-msg-${hex(4)}`;
    const sent = (await exec("message.party", ask, { p_approval: ap, p_idempotency: key })).data;
    expect(sent.ok).toBe(true);
    const again = (await exec("message.party", ask, { p_approval: ap, p_idempotency: key })).data;
    expect(again.replayed).toBe(true); expect(again.call_id).toBe(sent.call_id);
    expect((await exec("message.party", { ...ask, body: "tampered" }, { p_approval: ap })).data.error).toMatch(/approval_args_mismatch|approval_required/);
    expect((await exec("calendar.upcoming", {}, { p_actor: X.id })).data.error ?? "").toMatch(/not_a_member/);
    expect(await ok(rpc<{ waiting: boolean }>(db, "agent_mission_wait", { p_run: RO, p_step: null, p_item: B, p_hours: 48 }), "wait")).toMatchObject({ waiting: true });
    expect(((await db.from("agent_runs").select("status").eq("id", RO).single()).data as { status: string }).status).toBe("waiting_external");
    await ok(rpc(pc, "provider_respond", { p_item: B, p_response: "available", p_note: "Free that day" }), "venue replies");
    expect(((await db.from("agent_runs").select("status").eq("id", RO).single()).data as { status: string }).status).toBe("queued");
    expect(await ok(rpc(db, "agent_mission_wait", { p_run: RO, p_step: null, p_item: B, p_hours: 48 }), "resume")).toMatchObject({ satisfied: true, outcome: "responded" });
    await db.from("agent_runs").update({ status: "running" }).eq("id", RO);
    expect((await exec("event.readiness", { event_id: E })).data.ok).toBe(true);
    expect((await db.from("agent_runs").update({ status: "completed", finished_at: iso(Date.now()) }).eq("id", RO)).error).toBeNull();
    const calls = ((await db.from("agent_tool_calls").select("tool_id, status, refusal").eq("run_id", RO)).data ?? []) as { tool_id: string; status: string; refusal: string | null }[];
    expect(calls.filter(c => c.status === "succeeded").map(c => c.tool_id).sort()).toEqual(["calendar.upcoming", "event.readiness", "message.party"]);
    expect(calls.some(c => c.refusal === "approval_required")).toBe(true);
    const ev = ((await db.from("audit_events").select("event").eq("agent_run_id", RO)).data ?? []).map(a => (a as { event: string }).event);
    for (const e of ["agent.tool_refused", "agent.approval_approved", "agent.tool_called", "agent.mission_waiting", "agent.mission_resumed"]) expect(ev, e).toContain(e);
    expect(((await db.from("notifications").select("id").eq("user_id", P.id).eq("kind", "message")).data ?? []).length).toBeGreaterThanOrEqual(1);   // in-app, to the venue
    expect(ids(await xc.from("agent_tool_calls").select("id").eq("run_id", RO))).toEqual([]);
    expect(ids(await pc.from("agent_runs").select("id").eq("id", RO))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// J6 Privacy: DSAR export → legal hold refuses erasure → release → erasure (pseudonymous finance kept).
test.describe("Q44 J6 privacy: export, legal hold, erasure", () => {
  test.describe.configure({ mode: "serial" });
  let S: U, A: U, X: U, O: U, W = "", E = "", hold = "";
  let sc: SupabaseClient, ac: SupabaseClient, xc: SupabaseClient;
  test.beforeAll(async () => {
    [S, A, X, O] = await Promise.all([createUser("q44p-subject"), createUser("q44p-admin"), createUser("q44p-x"), createUser("q44p-org")]);
    W = await seedWorkspace(O.id, "organizer", "Q44 Privacy Org");
    E = ((await db.from("events").insert({ owner_id: O.id, workspace_id: W, management: "professional", name: "Q44 Privacy Dinner", status: "planning" }).select("id").single()).data as Id).id;
    await db.from("guests").insert({ event_id: E, name: "Sam Subject", email: S.email.toUpperCase(), phone: "+447700900123" } as never);
    await db.from("platform_admins").insert({ user_id: A.id, title: "Q44 privacy admin", permissions: ["audit"] });
    [sc, ac, xc] = await Promise.all([S, A, X].map(client));
    await enrolTotp(ac as never);
  });
  test.afterAll(async () => {
    if (hold) await db.from("legal_holds").delete().eq("id", hold);
    await db.from("platform_admins").delete().eq("user_id", A.id);
    await cleanup();
  });

  test("subject exports their data; a legal hold blocks erasure until released; erasure scrubs personal data", async () => {
    const exp = await ok(rpc<{ guest_records: unknown[] }>(sc, "privacy_subject_export"), "export");
    expect(exp.guest_records).toHaveLength(1);
    expect((await ok(rpc<{ guest_records: unknown[] }>(xc, "privacy_subject_export"), "other export")).guest_records).toHaveLength(0);
    expect((await rpc(db, "privacy_subject_export")).error?.message).toMatch(/not_authorized/);
    expect((await rpc(xc, "legal_hold_place", { p_matter: "Claim", p_reason: "Not an admin", p_subjects: [{ type: "user", id: S.id }] })).error?.message).toMatch(/not_authorized/);
    hold = await ok(rpc<string>(ac, "legal_hold_place", { p_matter: "Q44 Claim", p_reason: "Pending claim against organiser", p_subjects: [{ type: "user", id: S.id }] }), "hold");
    expect((await rpc(db, "erase_user_data", { p_user: S.id })).error?.message).toBe("legal_hold");
    expect((await rpc(sc, "erase_user_data", { p_user: S.id })).error).not.toBeNull();   // service-only
    expect(((await db.from("guests").select("name").eq("event_id", E)).data ?? [])).toEqual([{ name: "Sam Subject" }]);
    await ok(rpc(ac, "legal_hold_release", { p_hold: hold, p_reason: "Claim settled" }), "release");
    await ok(rpc(db, "erase_user_data", { p_user: S.id }), "erase");
    expect(((await db.from("guests").select("name, email, phone").eq("event_id", E)).data ?? [])).toEqual([{ name: "Deleted guest", email: "", phone: "" }]);
    const ev = ((await db.from("audit_events").select("event").in("event", ["privacy.legal_hold_placed", "privacy.legal_hold_released"]).eq("actor_id", A.id)).data ?? []).map(a => (a as { event: string }).event);
    expect(ev).toContain("privacy.legal_hold_placed");
    expect(ids(await xc.from("legal_holds").select("id").eq("id", hold))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// J7 API key + webhook: an event is delivered (signed) to a LOCAL receiver in this process only; tenant B gets nothing.
test.describe("Q44 J7 API key and webhook to a local receiver", () => {
  test.describe.configure({ mode: "serial" });
  let O: U, M: U, X: U, A = "", B = "", EA = "", EB = "", endpoint = "", server: http.Server, port = 0;
  const received: { sig: string; type: string; body: string }[] = [];
  let oc: SupabaseClient, mc: SupabaseClient;
  test.beforeAll(async () => {
    [O, M, X] = await Promise.all([createUser("q44w-owner"), createUser("q44w-member"), createUser("q44w-x")]);
    [A, B] = await Promise.all([seedWorkspace(O.id, "organizer", "Q44 Dev A"), seedWorkspace(X.id, "organizer", "Q44 Dev B")]);
    await db.from("workspaces").update({ plan: "pro" }).in("id", [A, B]);
    await db.from("workspace_members").insert({ workspace_id: A, user_id: M.id, role: "member", status: "active" });
    EA = ((await db.from("events").insert({ owner_id: O.id, workspace_id: A, name: "Q44 Event A", status: "draft" }).select("id").single()).data as Id).id;
    EB = ((await db.from("events").insert({ owner_id: X.id, workspace_id: B, name: "Q44 Event B", status: "draft" }).select("id").single()).data as Id).id;
    [oc, mc] = await Promise.all([O, M].map(client));
    server = http.createServer((req, res) => { let b = ""; req.on("data", c => (b += c)); req.on("end", () => { received.push({ sig: String(req.headers["gala-signature"] ?? ""), type: String(req.headers["gala-event-type"] ?? ""), body: b }); res.writeHead(200).end("ok"); }); });
    await new Promise<void>(r => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;
  });
  test.afterAll(async () => {
    server?.close();
    if (endpoint) { await db.from("webhook_deliveries").delete().eq("endpoint_id", endpoint); await db.from("webhook_endpoints").delete().eq("id", endpoint); }
    await db.from("api_keys").delete().in("workspace_id", [A, B]);
    await cleanup();
  });

  test("owner creates an API key (members can't); a workspace event is delivered, signed, to the local receiver only", async () => {
    const prefix = hex(4), key = `gd_live_${prefix}_${hex(16)}`;
    expect((await rpc(mc, "create_api_key", { p_workspace: A, p_name: "Q44", p_scopes: ["events:read"], p_prefix: hex(4), p_hash: sha("x"), p_expires: null })).error?.message).toMatch(/not_authorized/);
    const kid = await ok(rpc<string>(oc, "create_api_key", { p_workspace: A, p_name: "Q44 integration", p_scopes: ["events:read"], p_prefix: prefix, p_hash: sha(key), p_expires: null }), "api key");
    expect(((await db.from("api_keys").select("workspace_id").eq("id", kid).single()).data as { workspace_id: string }).workspace_id).toBe(A);
    // Endpoint on the local receiver (fixture insert: the server action's SSRF guard rightly refuses loopback URLs for real endpoints;
    // the table requires https, so the in-test worker below delivers to that loopback host:port over plain HTTP — TLS is not exercised).
    const secret = `whsec_q44_${hex(12)}`;
    endpoint = ((await db.from("webhook_endpoints").insert({ workspace_id: A, url: `https://127.0.0.1:${port}/hook`, events: ["event.created"], secret, created_by: O.id }).select("id").single()).data as Id).id;
    await db.from("audit_events").insert({ actor_id: O.id, actor_type: "user", workspace_id: A, event: "event.created", metadata: { event_id: EA, name: "Q44 Event A", secret_note: "must be stripped" } });
    await db.from("audit_events").insert({ actor_id: X.id, actor_type: "user", workspace_id: B, event: "event.created", metadata: { event_id: EB, name: "Q44 Event B" } });
    const dl = ((await db.from("webhook_deliveries").select("id, payload, event_type").eq("endpoint_id", endpoint)).data ?? []) as { id: string; payload: { data: Record<string, unknown>; workspace_id: string }; event_type: string }[];
    expect(dl).toHaveLength(1);   // B's event never reaches A's endpoint
    expect(dl[0].payload.workspace_id).toBe(A); expect(dl[0].payload.data).toEqual({ event_id: EA, name: "Q44 Event A" });
    // Deliver like the worker (sign with the endpoint's secrets) — to 127.0.0.1 only.
    const secrets = await ok(rpc<string[]>(db, "webhook_signing_secrets", { p_endpoint: endpoint }), "secrets");
    expect((await rpc(oc, "webhook_signing_secrets", { p_endpoint: endpoint })).error).not.toBeNull();   // service-only
    const body = JSON.stringify(dl[0].payload), t = Math.floor(Date.now() / 1000);
    const header = `t=${t},` + secrets.map(s => `v1=${createHmac("sha256", s).update(`${t}.${body}`).digest("hex")}`).join(",");
    const target = new URL(((await db.from("webhook_endpoints").select("url").eq("id", endpoint).single()).data as { url: string }).url);
    expect(target.hostname).toBe("127.0.0.1");   // local receiver only
    const res = await fetch(`http://${target.host}${target.pathname}`, { method: "POST", headers: { "content-type": "application/json", "gala-signature": header, "gala-event-type": dl[0].event_type }, body });
    expect(res.status).toBe(200);
    await ok(rpc(db, "finish_webhook_delivery", { p_delivery: dl[0].id, p_ok: true, p_status: 200, p_snippet: "ok" }), "finish");
    expect(received).toHaveLength(1);
    const v1 = received[0].sig.split(",").find(p => p.startsWith("v1="))!.slice(3);
    expect(v1).toBe(createHmac("sha256", secret).update(`${received[0].sig.split(",")[0].slice(2)}.${received[0].body}`).digest("hex"));
    expect(received[0].type).toBe("event.created");
    expect(((await db.from("webhook_deliveries").select("status").eq("id", dl[0].id).single()).data as { status: string }).status).toMatch(/delivered|succeeded/);
    // Members can't read the endpoint secret; tenant B can't see A's endpoint at all.
    expect((await mc.from("webhook_endpoints").select("secret").eq("id", endpoint)).error).not.toBeNull();
    const xc = await client(X);
    expect(ids(await xc.from("webhook_endpoints").select("id").eq("id", endpoint))).toEqual([]);
    expect(ids(await xc.from("webhook_deliveries").select("id").eq("endpoint_id", endpoint))).toEqual([]);
  });
});
