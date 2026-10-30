import { randomBytes, createHash } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn, insertEventFixture } from "../phase1/helpers";

// Q22 Ticket Resale / Launch / Waiting / Fraud (domains 99–102). Exit gate: one valid entitlement at all times; legal-rule
// configuration versioned. API level with disposable identities; no browser, no Stripe. Policy-version tests use a private
// test jurisdiction (XQ) so the published GB policy is never touched.
type Db = SupabaseClient;
type Id = { id: string };
type Err = { message: string } | null;
const db = admin as unknown as Db;
const rpc = <T = unknown>(c: Db, fn: string, args: Record<string, unknown>) => c.rpc(fn, args) as unknown as Promise<{ data: T; error: Err }>;
const tok = () => randomBytes(18).toString("base64url");
// A fresh test jurisdiction per run (published history is immutable, so earlier runs leave retired XQ-* rows behind).
const J = `XQ-${randomBytes(2).toString("hex").toUpperCase().slice(0, 3)}`;
const LIVE = ["valid", "resale_listed", "used"];

test.describe.configure({ mode: "serial" });

test.describe("Q22 resale, launch, waiting room and fraud controls", () => {
  let owner: { id: string; email: string }, seller: { id: string; email: string }, buyer: { id: string; email: string };
  let sellerC: Db, buyerC: Db, ws: string, ev: string, ga: string;
  const policies: string[] = [];
  /** A paid primary purchase for `who` (service role, platform-charge fixture with a test session id). */
  const purchase = async (who: string, qty: number, tier = ga) => {
    const k = tok(), ref = `GD-Q22${randomBytes(4).toString("hex").toUpperCase()}`;
    expect((await rpc(db, "hold_tickets", { p_event: ev, p_items: [{ tier, qty }], p_token: k })).error).toBeNull();
    const q = (await rpc<{ subtotal_minor: number; fee_minor: number }>(db, "checkout_quote", { p_event: ev, p_token: k })).data;
    expect((await db.from("checkout_orders").insert({ order_ref: ref, event_id: ev, buyer_id: who, token: k, amount: q.subtotal_minor / 100, fee: q.fee_minor / 100, status: "pending", lines: [], kind: "primary" })).error).toBeNull();
    await db.from("checkout_orders").update({ stripe_session: `cs_test_q22_${randomBytes(6).toString("hex")}`, status: "paid" }).eq("order_ref", ref);
    expect((await rpc(db, "issue_checkout", { p_token: k, p_order_ref: ref, p_attendee: "Q22", p_holder: who })).error).toBeNull();
    return ((await db.from("tickets").select("id").eq("order_ref", ref)).data as Id[]).map(t => t.id);
  };

  test.beforeAll(async () => {
    [owner, seller, buyer] = await Promise.all(["q22-o", "q22-s", "q22-b"].map(l => createUser(l)));
    ws = await seedWorkspace(owner.id, "organizer", "Q22 Events");
    ev = ((await insertEventFixture({ owner_id: owner.id, workspace_id: ws, management: "professional", name: "Q22 Launch Night", visibility: "public", status: "on_sale",
      starts_at: new Date(Date.now() + 5 * 864e5).toISOString(), settings: { resale: true } }, "ticket-resale-launch-fraud").select("id").single()).data as Id).id;
    ga = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "GA", price: 30, quantity: 200, status: "on_sale" }).select("id").single()).data as Id).id;
    [sellerC, buyerC] = (await Promise.all([seller, buyer].map(u => signedIn(u.email)))) as unknown as Db[];
  });
  test.afterAll(async () => {
    const ids = ((await db.from("tickets").select("id").eq("event_id", ev)).data ?? []).map(x => (x as Id).id);
    if (ids.length) await db.from("resale_holds").delete().in("ticket_id", ids);
    await db.from("ticket_waitlist").delete().eq("event_id", ev);
    await db.from("launch_queue").delete().eq("event_id", ev);
    await db.from("checkout_orders").delete().eq("event_id", ev);
    await db.from("connect_accounts").delete().eq("workspace_id", ws);
    await db.from("events").delete().eq("id", ev); await db.from("workspaces").delete().eq("id", ws);
    // Test-jurisdiction policies: drafts can be deleted; published test rows are retired (history is immutable by design).
    for (const p of policies) { await db.from("resale_policies").update({ status: "retired" }).eq("id", p).neq("status", "draft"); await db.from("resale_policies").delete().eq("id", p).eq("status", "draft"); }
    await cleanup();
  });

  test("resale policy is versioned per jurisdiction and immutable once published; listings snapshot the version", async () => {
    const gb = (await db.from("resale_policies").select("id,version,status,legal_review_status,legal_text,price_cap_pct").eq("jurisdiction", "GB").eq("version", 1).single()).data as { id: string; legal_review_status: string; legal_text: string; status: string };
    expect(gb.status).toBe("published"); expect(gb.legal_review_status).toBe("needs_review"); expect(gb.legal_text).toMatch(/requires legal review/i);
    expect((await db.from("resale_policies").update({ price_cap_pct: 150 }).eq("id", gb.id)).error?.message).toMatch(/resale_policy_immutable/);
    // Anyone may read published rules; nobody but the service writes them.
    expect(((await (anon() as unknown as Db).from("resale_policies").select("id").eq("id", gb.id)).data ?? [])).toHaveLength(1);
    expect((await sellerC.from("resale_policies").insert({ jurisdiction: J, version: 1, status: "published" })).error).not.toBeNull();
    // Test jurisdiction: v1 cap 100%, then v2 cap 90% supersedes it; the earlier listing keeps v1 as evidence.
    await db.from("events").update({ settings: { resale: true, jurisdiction: J } }).eq("id", ev);
    const v1 = (await db.from("resale_policies").insert({ jurisdiction: J, version: 1, status: "published", effective_from: new Date(Date.now() - 6e4).toISOString(), price_cap_pct: 100, legal_text: "test" }).select("id").single()).data as Id;
    policies.push(v1.id);
    const [t1, t2] = await purchase(seller.id, 2);
    expect((await rpc(sellerC, "list_ticket_for_resale", { p_ticket: t1, p_cancel: false })).error).toBeNull();
    const v2 = (await db.from("resale_policies").insert({ jurisdiction: J, version: 2, status: "published", effective_from: new Date(Date.now() - 3e4).toISOString(), price_cap_pct: 90, max_active_listings_per_user: 1, legal_text: "test v2" }).select("id").single()).data as Id;
    policies.push(v2.id);
    // Under v2 a face-value ticket exceeds the 90% cap (any writer, not just the RPC).
    expect((await rpc(sellerC, "list_ticket_for_resale", { p_ticket: t2, p_cancel: false })).error?.message).toMatch(/price_cap_exceeded/);
    const l1 = (await db.from("ticket_resale_listings").select("policy_version,jurisdiction,face_value_minor,price_minor,restrictions,status").eq("ticket_id", t1).single()).data as Record<string, unknown>;
    expect(l1).toMatchObject({ policy_version: 1, jurisdiction: J, face_value_minor: 3000, price_minor: 3000, status: "listed" });
    expect(l1.restrictions).toMatchObject({ transfer_allowed: true, terms_url: "/ticket-terms" });
    // Withdraw t1 (v2 now caps it out of the public list anyway) and go back to GB for the rest of the run.
    expect((await rpc(sellerC, "list_ticket_for_resale", { p_ticket: t1, p_cancel: true })).error).toBeNull();
    expect(((await db.from("ticket_resale_listings").select("status").eq("ticket_id", t1).single()).data as { status: string }).status).toBe("withdrawn");
    await db.from("events").update({ settings: { resale: true } }).eq("id", ev);
  });

  test("resale: disclosures shown, 10 concurrent buyers → one winner, exactly one valid entitlement afterwards", async () => {
    const [t] = await purchase(seller.id, 1);
    const nonceBefore = ((await db.from("tickets").select("qr_nonce").eq("id", t).single()).data as { qr_nonce: string }).qr_nonce;
    expect((await rpc(sellerC, "list_ticket_for_resale", { p_ticket: t, p_cancel: false })).error).toBeNull();
    const pub = (await rpc<{ id: string; face_value: number; price: number; restrictions: Record<string, unknown>; policy_version: number; jurisdiction: string }[]>(anon() as unknown as Db, "resale_listings", { p_event: ev })).data;
    expect(pub.find(l => l.id === t)).toMatchObject({ face_value: 30, price: 30, policy_version: 1, jurisdiction: "GB" });
    const buyers: Db[] = Array.from({ length: 10 }, () => buyerC);
    const tokens = Array.from({ length: 10 }, tok);
    const holds = await Promise.all(buyers.map((c, i) => rpc(c, "hold_resale", { p_event: ev, p_tickets: [t], p_token: tokens[i] })));
    const winners = tokens.filter((_, i) => !holds[i].error);
    expect(winners).toHaveLength(1);
    const ref = `GD-Q22R${randomBytes(3).toString("hex").toUpperCase()}`;
    expect((await db.from("checkout_orders").insert({ order_ref: ref, event_id: ev, buyer_id: buyer.id, token: winners[0], amount: 30, fee: 1, status: "pending", lines: [], kind: "resale" })).error).toBeNull();
    // Redirect + webhook confirm at once: one new entitlement.
    const issued = await Promise.all([0, 1].map(() => rpc<number>(db, "issue_resale", { p_token: winners[0], p_order_ref: ref, p_attendee: "Resale Buyer", p_holder: buyer.id })));
    expect(issued.every(r => !r.error && r.data === 1)).toBe(true);
    const old = (await db.from("tickets").select("status,replaced_by,qr_nonce").eq("id", t).single()).data as { status: string; replaced_by: string; qr_nonce: string };
    expect(old.status).toBe("resold"); expect(old.qr_nonce).not.toBe(nonceBefore);
    const fresh = (await db.from("tickets").select("id,status,holder_id").eq("order_ref", ref)).data as { id: string; status: string; holder_id: string }[];
    expect(fresh).toHaveLength(1); expect(fresh[0]).toMatchObject({ id: old.replaced_by, status: "valid", holder_id: buyer.id });
    expect([old.status, fresh[0].status].filter(s => LIVE.includes(s))).toHaveLength(1);
    expect(((await db.from("ticket_resale_listings").select("status,buyer_ticket_id").eq("ticket_id", t).eq("status", "sold").single()).data as { buyer_ticket_id: string }).buyer_ticket_id).toBe(fresh[0].id);
    // The seller is compensated by a refund of their original payment (queued payout row); the resale charge goes to the organiser.
    expect(((await db.from("resale_payouts").select("seller_id").eq("ticket_id", t)).data ?? [])).toHaveLength(1);
    expect((await rpc<{ mode: string; workspace_id: string; compensation: string }>(db, "resale_settlement_seller", { p_event: ev, p_seller: seller.id })).data)
      .toMatchObject({ mode: "organiser_buyback", compensation: "original_payment_refund" });
    expect((await rpc(anon() as unknown as Db, "resale_settlement_seller", { p_event: ev, p_seller: seller.id })).error).not.toBeNull();
  });

  test("waiting room: FIFO positions, rate-limited admission, single-use admission", async () => {
    await db.from("events").update({ settings: { resale: true, launch: { at: new Date(Date.now() - 3e3).toISOString(), waiting_room: { enabled: true, rate_per_minute: 2, admit_minutes: 10 } } } }).eq("id", ev);
    const raw = Array.from({ length: 6 }, tok), hashes = raw.map(r => createHash("sha256").update(r).digest("hex"));
    for (const h of hashes) expect((await rpc(anon() as unknown as Db, "queue_join", { p_event: ev, p_token_hash: h })).error).toBeNull();   // join order = fair order
    const status = await Promise.all(hashes.map(h => rpc<{ admitted: boolean; ahead: number }>(anon() as unknown as Db, "queue_status", { p_event: ev, p_token_hash: h })));
    const admitted = status.map(s => s.data.admitted);
    expect(admitted.filter(Boolean).length).toBeGreaterThanOrEqual(1); expect(admitted.filter(Boolean).length).toBeLessThanOrEqual(2);
    expect(admitted.indexOf(false)).toBeGreaterThan(admitted.lastIndexOf(true));   // the earliest joiners are admitted first
    expect(status[5].data.ahead).toBeGreaterThan(0);
    // The order creation consumes the admission once; a replay is refused.
    expect((await rpc<boolean>(db, "queue_admit_check", { p_event: ev, p_token_hash: hashes[0], p_consume: true })).data).toBe(true);
    expect((await rpc<boolean>(db, "queue_admit_check", { p_event: ev, p_token_hash: hashes[0], p_consume: true })).data).toBe(false);
    expect((await rpc<boolean>(db, "queue_admit_check", { p_event: ev, p_token_hash: hashes[5], p_consume: true })).data).toBe(false);
    await db.from("events").update({ settings: { resale: true } }).eq("id", ev);
  });

  test("sold-out waitlist: timed offer reserves stock, expiry releases it to the next person", async () => {
    // Paid tiers are offered only when the seller can take payment (202610293036, the checkout rule) — a ready Stripe account for this test.
    expect((await db.from("connect_accounts").insert({ workspace_id: ws, stripe_account_id: `acct_test_q22${randomBytes(4).toString("hex")}`, account_type: "standard", charges_enabled: true, payouts_enabled: true,
      details_submitted: true, card_payments_capability: "active", transfers_capability: "active", verification_state: "verified" })).error).toBeNull();
    const t = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "Tiny", price: 10, quantity: 1, status: "on_sale" }).select("id").single()).data as Id).id;
    const k = tok();
    await rpc(db, "hold_tickets", { p_event: ev, p_items: [{ tier: t, qty: 1 }], p_token: k });
    const w = await rpc<string>(buyerC, "join_waitlist", { p_event: ev, p_tier: t, p_qty: 1 });
    expect(w.error).toBeNull();
    await rpc(db, "release_checkout", { p_token: k });
    await rpc(db, "notify_waitlists", {});
    const offered = (await db.from("ticket_waitlist").select("status,offer_expires_at").eq("id", w.data).single()).data as { status: string; offer_expires_at: string };
    expect(offered.status).toBe("offered");
    expect(Date.parse(offered.offer_expires_at)).toBeGreaterThan(Date.now() + 25 * 60e3);
    // The offered unit is reserved: the public can't take it.
    expect((await rpc(anon() as unknown as Db, "hold_tickets", { p_event: ev, p_items: [{ tier: t, qty: 1 }], p_token: tok() })).error?.message).toBe("sold_out");
    await db.from("ticket_waitlist").update({ offer_expires_at: new Date(Date.now() - 6e4).toISOString() }).eq("id", w.data);
    await rpc(db, "notify_waitlists", {});
    expect(((await db.from("ticket_waitlist").select("status").eq("id", w.data).single()).data as { status: string }).status).toBe("expired");
    expect((await rpc(anon() as unknown as Db, "hold_tickets", { p_event: ev, p_items: [{ tier: t, qty: 1 }], p_token: tok() })).error).toBeNull();
    await db.from("connect_accounts").delete().eq("workspace_id", ws);
  });

  test("velocity controls: review flag, expiring pause, per-event purchase limit, chargeback flag; reviewing needs admin", async () => {
    const fake = (n: number, who: string, hash: string | null) => db.from("checkout_orders").insert(Array.from({ length: n }, () => ({ order_ref: `GD-Q22V${randomBytes(4).toString("hex").toUpperCase()}`,
      event_id: ev, buyer_id: who, token: tok(), amount: 0, fee: 0, status: "expired", lines: [], kind: "primary", client_hash: hash })));
    const check = (who: string, k = tok(), hash: string | null = null) => rpc<{ allow: boolean; reason?: string }>(db, "checkout_risk_check", { p_event: ev, p_buyer: who, p_token: k, p_client_hash: hash });
    const hash = "b".repeat(64);
    await fake(4, buyer.id, hash);
    expect((await check(buyer.id)).data.allow).toBe(true);   // 4 in 10 min → review flag only
    expect(((await db.from("ticket_risk_flags").select("severity").eq("event_id", ev).eq("user_id", buyer.id).eq("kind", "order_velocity")).data as { severity: string }[])[0].severity).toBe("review");
    await fake(4, buyer.id, hash);
    expect((await check(buyer.id)).data).toMatchObject({ allow: false, reason: "velocity_paused" });
    const pause = (await db.from("ticket_risk_flags").select("id,expires_at,status").eq("event_id", ev).eq("user_id", buyer.id).eq("severity", "pause").single()).data as { id: string; expires_at: string };
    expect(Date.parse(pause.expires_at)).toBeLessThan(Date.now() + 16 * 60e3);   // temporary, never a permanent ban
    // An organiser can see flags for their event but can't clear them; clearing is an audited admin action.
    const ownerC = await signedIn(owner.email) as unknown as Db;
    expect(((await ownerC.from("ticket_risk_flags").select("id").eq("event_id", ev)).data ?? []).length).toBeGreaterThan(0);
    expect(((await sellerC.from("ticket_risk_flags").select("id").eq("event_id", ev)).data ?? [])).toHaveLength(0);
    expect((await rpc(ownerC, "ticket_risk_review", { p_flag: pause.id, p_status: "cleared", p_note: "test" })).error?.message).toMatch(/not_authorized/);
    // Shared client: several accounts from one client hash → review flag for the next account.
    const extra = await createUser("q22-x");   // threshold: 4 accounts on one client within an hour
    await fake(1, owner.id, hash); await fake(1, seller.id, hash); await fake(1, extra.id, hash);
    expect((await check(owner.id, tok(), hash)).data.allow).toBe(true);
    expect(((await db.from("ticket_risk_flags").select("kind").eq("event_id", ev).eq("user_id", owner.id).eq("kind", "shared_client")).data ?? [])).toHaveLength(1);
    // Per-event purchase limit (all tiers).
    await db.from("events").update({ settings: { resale: true, ticket_pro: { sales: { max_per_customer: 4 } } } }).eq("id", ev);
    const k = tok(); await rpc(db, "hold_tickets", { p_event: ev, p_items: [{ tier: ga, qty: 3 }], p_token: k });
    const sellerHas = ((await db.from("tickets").select("id").eq("event_id", ev).eq("holder_id", seller.id).in("status", ["valid", "resale_listed", "used"])).data ?? []).length;
    const r = await check(seller.id, k);
    expect(r.data.allow).toBe(sellerHas + 3 <= 4);
    if (!r.data.allow) expect(r.data.reason).toBe("purchase_limit");
    await rpc(db, "release_checkout", { p_token: k });
    // Chargeback on an issued order → review flag on the buyer.
    const [cb] = await purchase(owner.id, 1);
    const ref = ((await db.from("tickets").select("order_ref").eq("id", cb).single()).data as { order_ref: string }).order_ref;
    expect((await rpc<{ ok: boolean }>(db, "ticket_order_transition", { p_ref: ref, p_to: "chargeback", p_expected: "issued", p_reason: "dispute opened (test)" })).data.ok).toBe(true);
    expect(((await db.from("ticket_risk_flags").select("kind").eq("order_ref", ref)).data as { kind: string }[]).map(f => f.kind)).toEqual(["chargeback"]);
    await db.from("events").update({ settings: { resale: true } }).eq("id", ev);
  });

  test("launch state follows release kinds: access-code-only on sale → presale; final release", async () => {
    const e2 = ((await insertEventFixture({ owner_id: owner.id, workspace_id: ws, management: "professional", name: "Q22 Presale", visibility: "public", status: "on_sale",
      starts_at: new Date(Date.now() + 9 * 864e5).toISOString() }, "ticket-resale-launch-fraud").select("id").single()).data as Id).id;
    try {
      await db.from("ticket_tiers").insert({ event_id: e2, name: "Fan presale", price: 20, quantity: 50, status: "on_sale", access_code_required: true, release_kind: "presale" });
      expect((await rpc<string>(anon() as unknown as Db, "event_launch_state", { p_event: e2 })).data).toBe("presale");
      await db.from("ticket_tiers").insert({ event_id: e2, name: "Last tickets", price: 35, quantity: 50, status: "on_sale", release_kind: "final" });
      expect((await rpc<string>(anon() as unknown as Db, "event_launch_state", { p_event: e2 })).data).toBe("final_release");
    } finally { await db.from("events").delete().eq("id", e2); }
  });
});
