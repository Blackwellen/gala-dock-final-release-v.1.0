import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, BASE, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// W07 (v6 GD-08): promoter / partner attribution, isolation and the Affiliate Finance Conservation Test.
// Every record lives on disposable users and a disposable private draft event, removed in afterAll. The /r/<code> tests use a
// disposable promoter on the public demo event (needed: clicks only resolve for public on-sale events); it is deleted afterwards
// together with its clicks (on delete cascade). No Stripe, no emails. Q27 (migrations 202610292003–2006) closed the five GD-08 gaps.
// Note: ledger rows are immutable by design, so the memo postings made for these disposable records remain (tiny, test-tagged sources).
const db = admin as unknown as SupabaseClient;
const tag = randomBytes(3).toString("hex").toUpperCase();
const UA = `w07-spec/${tag}`;
const code = (e: { message?: string } | null) => e?.message ?? "";

test.describe.configure({ mode: "serial" });
test.describe("W07 affiliate / promoter", () => {
  let org: { id: string; email: string }, prom: { id: string; email: string }, prom2: { id: string; email: string }, buyer: { id: string; email: string };
  let partnerUser: { id: string; email: string };
  let promC: SupabaseClient, partnerC: SupabaseClient;
  let ev: string, ev2: string, tier: string, p1: string, p2: string, pPublic: string, partnerId: string, otherPartner: string;
  const code1 = `W07A${tag}`, code2 = `W07B${tag}`, codePublic = `W07P${tag}`;
  const orders: string[] = [];
  const order = async (buyerId: string, ref: string | null, qty = 2, unit = 50, eventId = ev, channel: string | null = null) => {
    const ref_ = `GD-W07${tag}${orders.length}`;
    const { error } = await db.from("checkout_orders").insert({ order_ref: ref_, event_id: eventId, buyer_id: buyerId, token: randomBytes(12).toString("hex"), amount: qty * unit, fee: 3,
      currency: "GBP", status: "issued", kind: "primary", ref_code: ref, ref_channel: channel, lines: [{ tier_id: tier, name: "W07 GA", qty, unit, seats: [] }] } as never);
    if (error) throw error;
    orders.push(ref_); return ref_;
  };
  const attribute = async (ref: string) => { const { data, error } = await db.rpc("attribute_referral", { p_order_ref: ref }); if (error) throw error; return Number(data); };

  test.beforeAll(async () => {
    [org, prom, prom2, buyer, partnerUser] = await Promise.all([createUser("w07-org"), createUser("w07-prom", "W07 Promoter"), createUser("w07-prom2"), createUser("w07-buyer"), createUser("w07-partner")]);
    const mk = async (name: string) => ((await db.from("events").insert({ owner_id: org.id, name, visibility: "private", status: "draft" }).select("id").single()).data as { id: string }).id;
    [ev, ev2] = await Promise.all([mk(`W07 Conservation ${tag}`), mk(`W07 Other ${tag}`)]);
    tier = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "W07 GA", quantity: 100, price: 50 }).select("id").single()).data as { id: string }).id;
    const pr = async (event: string, user: string, code: string, pct: number) =>
      ((await db.from("promoters").insert({ event_id: event, user_id: user, name: `W07 ${code}`, code, commission_pct: pct, status: "active", email: "" }).select("id").single()).data as { id: string }).id;
    [p1, p2] = await Promise.all([pr(ev, prom.id, code1, 10), pr(ev2, prom2.id, code2, 20)]);
    const neon = ((await db.from("events").select("id").eq("slug", "neon-nights").single()).data as { id: string }).id;
    pPublic = await pr(neon, prom2.id, codePublic, 5);
    partnerId = ((await db.from("partners").insert({ user_id: partnerUser.id, name: `W07 Partner ${tag}`, kind: "affiliate", status: "active", referral_code: `W07R${tag}` }).select("id").single()).data as { id: string }).id;
    otherPartner = ((await db.from("partners").select("id").neq("id", partnerId).limit(1).single()).data as { id: string }).id;
    [promC, partnerC] = await Promise.all([signedIn(prom.email), signedIn(partnerUser.email)]) as unknown as SupabaseClient[];
  });
  const invoices: string[] = [], extraWs: string[] = [];
  test.afterAll(async () => {
    await db.from("promoter_sales").delete().in("promoter_id", [p1, p2, pPublic].filter(Boolean));
    await db.from("promoter_payouts").delete().in("promoter_id", [p1, p2, pPublic].filter(Boolean));
    if (invoices.length) await db.from("subscription_invoices").delete().in("stripe_invoice_id", invoices);
    for (const w of extraWs) await db.from("workspaces").delete().eq("id", w);
    await db.from("checkout_orders").delete().in("order_ref", orders);
    await db.from("promoters").delete().in("id", [p1, p2, pPublic].filter(Boolean));
    if (partnerId) await db.from("partners").delete().eq("id", partnerId);
    await db.from("audit_events").delete().eq("actor_id", prom?.id ?? "");
    for (const e of [ev, ev2].filter(Boolean)) { await db.from("ticket_tiers").delete().eq("event_id", e); await db.from("events").delete().eq("id", e); }
    await cleanup();
  });

  // ── Isolation ──────────────────────────────────────────────────────────────
  test("a promoter sees only their own promoter rows, sales and payouts", async () => {
    const mine = (await promC.from("promoters").select("id")).data ?? [];
    expect(mine.map(r => r.id)).toEqual([p1]);
    expect((await promC.from("promoters").select("id").eq("id", p2)).data).toEqual([]);
    expect((await promC.from("promoter_sales").select("id").neq("promoter_id", p1)).data).toEqual([]);
    expect((await promC.from("promoter_payouts").select("id").neq("promoter_id", p1)).data).toEqual([]);
    expect((await anon().from("promoters").select("id").limit(1)).data ?? []).toEqual([]);
  });

  test("a promoter cannot change their own commission rate, status or counters", async () => {
    const r = await promC.from("promoters").update({ commission_pct: 90, status: "active", tickets_sold: 9999 }).eq("id", p1).select("id");
    expect(r.data ?? []).toEqual([]);
    const row = (await db.from("promoters").select("commission_pct,tickets_sold").eq("id", p1).single()).data as { commission_pct: number; tickets_sold: number };
    expect(Number(row.commission_pct)).toBe(10);
    expect(row.tickets_sold).toBe(0);
    // Sales are written only by the service role.
    const ins = await promC.from("promoter_sales").insert({ promoter_id: p1, event_id: ev, tier_name: "x", quantity: 1, amount: 1, commission: 1 });
    expect(ins.error).not.toBeNull();
  });

  test("payout method: own promoter only, audited; another promoter's id is refused", async () => {
    expect((await promC.rpc("promoter_set_payout_method", { p_promoter: p1, p_method: "paypal" })).error).toBeNull();
    expect(((await db.from("promoters").select("payout_method").eq("id", p1).single()).data as { payout_method: string }).payout_method).toBe("paypal");
    expect((await db.from("audit_events").select("id").eq("actor_id", prom.id).eq("event", "promoter.payout_method_set")).data?.length).toBeGreaterThan(0);
    const other = await promC.rpc("promoter_set_payout_method", { p_promoter: p2, p_method: "stripe" });
    expect(other.error?.message).toContain("not_allowed");
    expect((await promC.rpc("promoter_set_payout_method", { p_promoter: p1, p_method: "crypto" })).error).not.toBeNull();
  });

  test("leaderboard for someone else's promoter id returns nothing", async () => {
    expect((await promC.rpc("promoter_leaderboard", { p_promoter: p2 })).data ?? []).toEqual([]);
    expect(((await promC.rpc("promoter_leaderboard", { p_promoter: p1 })).data ?? []).length).toBe(1);
  });

  test("a partner sees only their own partner row and ledger rows, and cannot write them", async () => {
    expect(((await partnerC.from("partners").select("id")).data ?? []).map(r => r.id)).toEqual([partnerId]);
    for (const t of ["partner_referrals", "partner_earnings", "partner_statements", "partner_content"])
      expect((await partnerC.from(t).select("id").eq("partner_id", otherPartner)).data ?? [], t).toEqual([]);
    expect((await partnerC.from("partners").update({ commission_bps: 5000 }).eq("id", partnerId).select("id")).error).not.toBeNull();
    expect((await partnerC.from("partner_earnings").insert({ partner_id: partnerId, occurred_at: new Date().toISOString(), eligible_revenue: 1, commission: 1 })).error).not.toBeNull();
    // A promoter is not a partner.
    expect((await promC.rpc("partner_contact_support", { p_subject: "W07 test", p_body: "Not a partner account." })).error?.message).toContain("not_allowed");
  });

  // ── Consent-gated attribution (/r/<code>) ─────────────────────────────────
  test("/r/<code>: asks for consent first, sets gd_ref only on yes, de-duplicates clicks, unknown code falls back", async () => {
    const get = (path: string, cookie = "") => fetch(`${BASE}${path}`, { redirect: "manual", headers: { "user-agent": UA, ...(cookie ? { cookie } : {}) } });
    const a = await get(`/r/${codePublic}?c=instagram`);
    expect(a.status).toBe(307);
    expect(a.headers.get("location")).toContain(`/r/${codePublic}/consent?event=neon-nights`);
    expect(a.headers.get("set-cookie") ?? "").not.toContain("gd_ref");
    expect(a.headers.get("cache-control")).toContain("no-store");
    const b = await get(`/r/${codePublic}`, "gd_consent=referral%3Ano");
    expect(b.headers.get("location")).toMatch(/\/events\/neon-nights\?ref=/);
    expect(b.headers.get("set-cookie") ?? "").not.toContain("gd_ref");
    const c = await get(`/r/${codePublic}`, "gd_consent=referral%3Ayes");
    expect(c.headers.get("set-cookie") ?? "").toMatch(/gd_ref=W07P[^;]*%3Aneon-nights|gd_ref=W07P[^;]*:neon-nights/);
    expect(c.headers.get("set-cookie") ?? "").toMatch(/HttpOnly/i);
    const clicks = (await db.from("promoter_clicks").select("channel").eq("promoter_id", pPublic)).data ?? [];
    expect(clicks.length).toBe(1);                       // three hits from one visitor in 30 minutes → one counted click
    expect(clicks[0]!.channel).toBe("instagram");
    const d = await get(`/r/NOPE${tag}`);
    expect(new URL(d.headers.get("location")!, BASE).pathname).toBe("/events");
    // A paused promoter's link no longer resolves.
    await db.from("promoters").update({ status: "paused" }).eq("id", pPublic);
    expect(new URL((await get(`/r/${codePublic}`, "gd_consent=referral%3Ayes")).headers.get("location")!, BASE).pathname).toBe("/events");
  });

  test("consent page: 'Continue and credit' stores gd_ref, 'Continue without' does not", async ({ page, context }) => {
    await db.from("promoters").update({ status: "active" }).eq("id", pPublic);
    await page.goto(`${BASE}/r/${codePublic}/consent?event=neon-nights`);
    await expect(page.getByRole("heading", { name: "Credit the person who shared this?" })).toBeVisible();
    await page.getByRole("button", { name: "Continue without" }).click();
    await page.waitForURL(/\/events\/neon-nights/);
    expect((await context.cookies()).find(c => c.name === "gd_ref")).toBeUndefined();
    await context.clearCookies();
    await page.goto(`${BASE}/r/${codePublic}/consent?event=neon-nights`);
    await page.getByRole("button", { name: "Continue and credit the promoter" }).click();
    await page.waitForURL(/\/events\/neon-nights/);
    const ref = (await context.cookies()).find(c => c.name === "gd_ref");
    expect(decodeURIComponent(ref?.value ?? "")).toBe(`${codePublic}:neon-nights:link`);   // CODE:event:channel (Q27)
    expect(ref?.httpOnly).toBe(true);
  });

  // ── Affiliate Finance Conservation Test ────────────────────────────────────
  test("conservation: checkout value → commission at the promoter's rate on face value (fee excluded) → one accrual, replay-safe", async () => {
    const ref = await order(buyer.id, code1.toLowerCase(), 2, 50);      // codes match case-insensitively
    expect(await attribute(ref)).toBe(2);
    expect(await attribute(ref)).toBe(0);                                // webhook replay: no double credit
    const sales = (await db.from("promoter_sales").select("amount,commission,status,quantity,order_ref").eq("promoter_id", p1)).data ?? [];
    expect(sales).toHaveLength(1);
    expect(Number(sales[0]!.amount)).toBe(100);                          // checkout value excl. booking fee (fee 3 not commissioned)
    expect(Number(sales[0]!.commission)).toBe(10);                       // 10% rule
    expect(sales[0]!.status).toBe("pending");
    const pr = (await db.from("promoters").select("tickets_sold,revenue").eq("id", p1).single()).data as { tickets_sold: number; revenue: number };
    expect([pr.tickets_sold, Number(pr.revenue)]).toEqual([2, 100]);
    // A later rate change does not rewrite the accrued commission (value snapshot).
    await db.from("promoters").update({ commission_pct: 30 }).eq("id", p1);
    expect(Number(((await db.from("promoter_sales").select("commission").eq("order_ref", ref).single()).data as { commission: number }).commission)).toBe(10);
    await db.from("promoters").update({ commission_pct: 10 }).eq("id", p1);
  });

  test("fraud rules: self-referral, another event's code and a paused promoter earn nothing", async () => {
    expect(await attribute(await order(prom.id, code1))).toBe(0);        // promoter buying through their own link
    expect(await attribute(await order(buyer.id, code2))).toBe(0);       // code belongs to a different event
    await db.from("promoters").update({ status: "paused" }).eq("id", p1);
    expect(await attribute(await order(buyer.id, code1))).toBe(0);
    await db.from("promoters").update({ status: "active" }).eq("id", p1);
    expect((await db.from("promoter_sales").select("id").eq("promoter_id", p1)).data).toHaveLength(1);
  });

  test("conservation: a refunded order reverses its promoter commission (idempotent, memo reversed once)", async () => {
    const ref = orders[0]!;
    const sale = (await db.from("promoter_sales").select("id").eq("order_ref", ref).single()).data as { id: string };
    await db.from("checkout_orders").update({ status: "refunded", refund_status: "refunded", refunded_at: new Date().toISOString() }).eq("order_ref", ref);
    await expect.poll(async () => ((await db.from("promoter_sales").select("status").eq("order_ref", ref).single()).data as { status: string }).status, { timeout: 5000 }).toBe("reversed");
    expect((await db.rpc("promoter_reverse_order", { p_order_ref: ref, p_reason: "refund" })).data).toBe(0);     // replay: nothing more
    const txs = (await db.from("ledger_transactions").select("idempotency_key,basis,kind").eq("source_type", "promoter_sale").eq("source_id", sale.id)).data ?? [];
    expect(txs.map(t => t.idempotency_key).sort()).toEqual([`promoter:accrual:${sale.id}`, `promoter:reversal:${sale.id}`]);
    expect(new Set(txs.map(t => `${t.kind}/${t.basis}`))).toEqual(new Set(["promoter_commission/seller_obligation_memo"]));
    const pr = (await db.from("promoters").select("tickets_sold,revenue").eq("id", p1).single()).data as { tickets_sold: number; revenue: number };
    expect([pr.tickets_sold, Number(pr.revenue)]).toEqual([0, 0]);
  });

  test("conservation: accruals carry a commission rule/version reference", async () => {
    const rows = (await db.from("promoter_sales").select("commission_rule_id,commission_rule_version,commission_pct").eq("promoter_id", p1)).data ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) { expect(r.commission_rule_id).toBeTruthy(); expect(r.commission_rule_version).toBeGreaterThanOrEqual(1); expect(Number(r.commission_pct)).toBe(10); }
    // The rate change in the earlier test produced versions 2 (30%) and 3 (10%); a new sale snapshots the version in force.
    const versions = ((await db.from("promoter_commission_rules").select("version,commission_pct").eq("promoter_id", p1).order("version")).data ?? []).map(v => [v.version, Number(v.commission_pct)]);
    expect(versions).toEqual([[1, 10], [2, 30], [3, 10]]);
    // The promoter can read their own rule history; another promoter's is invisible.
    expect(((await promC.from("promoter_commission_rules").select("version").eq("promoter_id", p1)).data ?? []).length).toBe(3);
    expect((await promC.from("promoter_commission_rules").select("version").eq("promoter_id", p2)).data ?? []).toEqual([]);
  });

  test("channel: a QR referral is recorded as qr, an older cookie without channel as link", async () => {
    const q = await order(buyer.id, code1, 1, 50, ev, "qr");
    expect(await attribute(q)).toBe(1);
    expect(((await db.from("promoter_sales").select("channel").eq("order_ref", q).single()).data as { channel: string }).channel).toBe("qr");
    const l = await order(buyer.id, code1, 1, 50);
    expect(await attribute(l)).toBe(1);
    expect(((await db.from("promoter_sales").select("channel").eq("order_ref", l).single()).data as { channel: string }).channel).toBe("link");
  });

  test("GD-08 end to end: approve → locked payout (immutable) → refund after lock = clawback netted next run → paid; ledger conserves", async () => {
    const orgC = await signedIn(org.email) as unknown as SupabaseClient;
    expect(code((await promC.rpc("promoter_create_payout", { p_promoter: p1 })).error)).toContain("not_authorized");     // a promoter cannot pay themselves
    expect(code((await orgC.rpc("promoter_create_payout", { p_promoter: p1 })).error)).toContain("nothing_to_pay");      // nothing approved yet
    expect((await orgC.rpc("promoter_approve_sales", { p_promoter: p1, p_note: "W07 approve" })).data).toBe(2);           // the qr + link sales
    const run1 = (await orgC.rpc("promoter_create_payout", { p_promoter: p1, p_note: "W07 run 1" })).data as { payout_id: string; gross: number; amount: number };
    expect([Number(run1.gross), Number(run1.amount)]).toEqual([10, 10]);
    // Locked rows are immutable, even for the service role outside the payout functions.
    const locked = (await db.from("promoter_sales").select("id,order_ref").eq("payout_id", run1.payout_id)).data ?? [];
    expect(locked).toHaveLength(2);
    expect(code((await db.from("promoter_sales").update({ commission: 99 }).eq("id", locked[0]!.id)).error)).toContain("promoter_sale_locked");
    expect(code((await db.from("promoter_sales").update({ status: "paid" }).eq("id", locked[0]!.id)).error)).toContain("promoter_sale_locked");
    // A second run cannot lock the same sales.
    expect(code((await orgC.rpc("promoter_create_payout", { p_promoter: p1 })).error)).toContain("nothing_to_pay");
    // Refund one locked sale's order after the lock → clawback (the locked row keeps its status; netted next run).
    await db.from("checkout_orders").update({ status: "refunded", refund_status: "refunded" }).eq("order_ref", locked[0]!.order_ref!);
    expect(((await db.from("promoter_sales").select("status,clawback_pending").eq("id", locked[0]!.id).single()).data as { status: string; clawback_pending: boolean }))
      .toEqual({ status: "held", clawback_pending: true });
    expect(code((await orgC.rpc("promoter_payout_transition", { p_payout: run1.payout_id, p_action: "mark_paid", p_reference: "BACS-1" })).error)).toContain("invalid_transition");
    expect((await orgC.rpc("promoter_payout_transition", { p_payout: run1.payout_id, p_action: "approve" })).data).toBe("payable");
    expect(code((await orgC.rpc("promoter_payout_transition", { p_payout: run1.payout_id, p_action: "mark_paid", p_reference: "" })).error)).toContain("reference_required");
    expect((await orgC.rpc("promoter_payout_transition", { p_payout: run1.payout_id, p_action: "mark_paid", p_reference: "W07 BACS 0001", p_method: "bank_transfer" })).data).toBe("paid");
    // Next run: a new 5.00 sale, minus the 5.00 clawback = 0.00 payout, still conserved.
    const n = await order(buyer.id, code1, 1, 50);
    expect(await attribute(n)).toBe(1);
    await orgC.rpc("promoter_approve_sales", { p_promoter: p1 });
    const run2 = (await orgC.rpc("promoter_create_payout", { p_promoter: p1, p_note: "W07 run 2" })).data as { gross: number; clawback: number; amount: number };
    expect([Number(run2.gross), Number(run2.clawback), Number(run2.amount)]).toEqual([5, 5, 0]);
    const st = (await promC.rpc("promoter_statement", { p_promoter: p1 })).data as Record<string, number | string>;
    expect(Number(st.paid)).toBe(10); expect(Number(st.held)).toBe(5); expect(Number(st.clawback_outstanding)).toBe(0); expect(st.settles).toBe("off_platform_by_organiser");
    // Ledger: the promoter's payable = accrued − reversed − settled, and promoter postings never touch Gala Dock cash or fee accounts.
    const { data: ent } = await db.from("ledger_entries").select("account,amount_minor,transaction_id").eq("party_type", "promoter").eq("party_id", p1);
    const payable = (ent ?? []).filter(e => e.account === "promoter_payable").reduce((a, e) => a + Number(e.amount_minor), 0);
    // credit-negative: accrued 10.00 (order 0) + 3 × 5.00 = −2500; reversed 10.00 + clawback 5.00 = +1500; settled run 1 = +1000 → 0,
    // which is exactly run 2 (5.00 new sale − 5.00 clawback = 0.00 owed).
    expect(payable).toBe(0);
    const txIds = [...new Set((ent ?? []).map(e => e.transaction_id))];
    const { data: all } = await db.from("ledger_entries").select("account").in("transaction_id", txIds);
    expect((all ?? []).filter(e => ["cash_stripe", "platform_fee", "platform_revenue", "affiliate_payable", "platform_affiliate_commission"].includes(e.account))).toEqual([]);
  });

  test("conservation: promoter and platform-affiliate commission post to separate ledger accounts (Q27 exit gate)", async () => {
    const { data } = await db.from("ledger_entries").select("account").or("account.ilike.%promoter%,account.ilike.%affiliate%,account.ilike.%partner%").limit(50);
    expect(new Set((data ?? []).map(r => r.account)).size).toBeGreaterThanOrEqual(2);
    // The database refuses any transaction that mixes the families (or uses a commission kind for anything else).
    const bad = (k: string, lines: unknown[]) => db.rpc("post_memo_ledger_transaction", { p_idempotency_key: `w07:mix:${tag}:${k}:${randomBytes(3).toString("hex")}`, p_kind: k, p_currency: "GBP", p_lines: lines, p_basis: "seller_obligation_memo" });
    expect(code((await bad("affiliate_commission", [{ account: "promoter_payable", party_type: "promoter", party_id: p1, amount_minor: -1 }, { account: "platform_affiliate_commission", party_type: "platform", amount_minor: 1 }])).error)).toContain("ledger_family_mix");
    expect(code((await bad("promoter_commission", [{ account: "promoter_payable", party_type: "promoter", party_id: p1, amount_minor: -1 }, { account: "cash_stripe", party_type: "platform", amount_minor: 1 }])).error)).toContain("ledger_family_mix");
    expect(code((await bad("ticket_order", [{ account: "affiliate_payable", party_type: "partner", party_id: partnerId, amount_minor: -1 }, { account: "cash_stripe", party_type: "platform", amount_minor: 1 }])).error)).toContain("ledger_family_mix");
  });

  test("reconciliation: payouts never exceed approved/paid accruals (every promoter)", async () => {
    const [{ data: sales }, { data: payouts }] = await Promise.all([
      db.from("promoter_sales").select("promoter_id,commission,status").limit(10000), db.from("promoter_payouts").select("promoter_id,amount,status").limit(10000)]);
    const accrued = new Map<string, number>(), paid = new Map<string, number>();
    for (const s of sales ?? []) if (s.status === "approved" || s.status === "paid") accrued.set(s.promoter_id, (accrued.get(s.promoter_id) ?? 0) + Number(s.commission));
    for (const p of payouts ?? []) if (p.status !== "failed") paid.set(p.promoter_id, (paid.get(p.promoter_id) ?? 0) + Number(p.amount));
    for (const [id, amt] of paid) expect(amt, `promoter ${id}`).toBeLessThanOrEqual((accrued.get(id) ?? 0) + 0.005);
  });

  test("reconciliation: a locked payout is the sum of the sales it pays minus the clawbacks netted into it (payout_id link)", async () => {
    const { data: payouts } = await db.from("promoter_payouts").select("id,amount,gross_commission,clawback_deducted").not("locked_at", "is", null).neq("status", "failed");
    expect((payouts ?? []).length).toBeGreaterThan(0);
    for (const p of payouts ?? []) {
      const [{ data: s }, { data: c }] = await Promise.all([db.from("promoter_sales").select("commission").eq("payout_id", p.id), db.from("promoter_sales").select("commission").eq("clawback_payout_id", p.id)]);
      const gross = (s ?? []).reduce((a, x) => a + Number(x.commission), 0), claw = (c ?? []).reduce((a, x) => a + Number(x.commission), 0);
      expect(gross).toBeCloseTo(Number(p.gross_commission), 2);
      expect(gross - claw).toBeCloseTo(Number(p.amount), 2);
    }
    // Pre-Q27 (seeded) payouts are unlocked legacy rows; their links still sum exactly.
    const { data: legacy } = await db.from("promoter_payouts").select("id,amount").is("locked_at", null).neq("status", "failed");
    for (const p of legacy ?? []) {
      const { data } = await db.from("promoter_sales").select("commission").eq("payout_id", p.id);
      if ((data ?? []).length) expect((data ?? []).reduce((a, x) => a + Number(x.commission), 0)).toBeCloseTo(Number(p.amount), 2);
    }
  });

  test("reconciliation: each partner statement equals the earnings assigned to it", async () => {
    const { data: stmts } = await db.from("partner_statements").select("id,partner_id,commission,status");
    const { data: earn } = await db.from("partner_earnings").select("statement_id,commission,status").not("statement_id", "is", null).limit(20000);
    const by = new Map<string, number>();
    for (const e of earn ?? []) if (e.status !== "reversed") by.set(e.statement_id!, (by.get(e.statement_id!) ?? 0) + Number(e.commission));
    for (const s of stmts ?? []) expect(by.get(s.id) ?? 0, `statement ${s.id} (${s.status})`).toBeCloseTo(Number(s.commission), 1);
  });

  test("partner attribution: the partner link /?ref=<code> records a click or referral", async () => {
    const res = await fetch(`${BASE}/?ref=W07R${tag}&c=qr`, { redirect: "manual", headers: { "user-agent": UA, cookie: "gd_consent=referral%3Ayes" } });
    expect(res.headers.get("set-cookie") ?? "").toMatch(/gd_partner=W07R[^;]*(%3A|:)qr/);
    expect(res.headers.get("set-cookie") ?? "").toMatch(/HttpOnly/i);
    expect(((await db.from("partner_clicks").select("channel").eq("partner_id", partnerId)).data ?? []).map(r => r.channel)).toEqual(["qr"]);
    // No decision yet → asked first, nothing stored; declined → nothing stored; unknown code → ignored.
    const ask = await fetch(`${BASE}/pricing?ref=W07R${tag}`, { redirect: "manual", headers: { "user-agent": `${UA}-2` } });
    expect(ask.status).toBe(307);
    expect(ask.headers.get("location")).toContain(`/ref/W07R${tag}`);
    expect(ask.headers.get("set-cookie") ?? "").not.toContain("gd_partner");
    const no = await fetch(`${BASE}/?ref=W07R${tag}`, { redirect: "manual", headers: { "user-agent": UA, cookie: "gd_consent=referral%3Ano" } });
    expect(no.headers.get("set-cookie") ?? "").not.toContain("gd_partner");
    const unknown = await fetch(`${BASE}/?ref=NOPE${tag}`, { redirect: "manual", headers: { "user-agent": UA, cookie: "gd_consent=referral%3Ayes" } });
    expect(unknown.headers.get("set-cookie") ?? "").not.toContain("gd_partner");
  });

  test("partner: qualified sign-up → subscription earns versioned commission → statement → void reverses; self-referral refused", async () => {
    // The partner's account uses a different company domain than the referred user (same non-public domain = self-referral).
    await db.auth.admin.updateUserById(partnerUser.id, { email: `w07-partner-${tag.toLowerCase()}@example.org`, email_confirm: true });
    const visitor = randomBytes(32).toString("hex");
    const fresh = await createUser("w07-referred", "W07 Referred");
    const fc = await signedIn(fresh.email) as unknown as SupabaseClient;
    expect(((await fc.rpc("partner_attribute_signup", { p_code: `w07r${tag}`, p_channel: "email", p_visitor: visitor })).data as { attributed: boolean }).attributed).toBe(true);
    expect(((await fc.rpc("partner_attribute_signup", { p_code: `W07R${tag}`, p_channel: "email", p_visitor: visitor })).data as { existing: boolean }).existing).toBe(true);
    // Self-referral: the partner's own account, and a second account from the same device.
    expect(((await partnerC.rpc("partner_attribute_signup", { p_code: `W07R${tag}` })).data as { reason: string }).reason).toBe("self_referral");
    const twin = await createUser("w07-twin");
    expect(((await (await signedIn(twin.email) as unknown as SupabaseClient).rpc("partner_attribute_signup", { p_code: `W07R${tag}`, p_visitor: visitor })).data as { reason: string }).reason).toBe("same_device");
    // Creating a workspace makes it the partner's (pending) referral; the partner sees it, nobody else does.
    const ws = await seedWorkspace(fresh.id, "organizer", `W07 Referred Org ${tag}`); extraWs.push(ws);
    const ref = (await db.from("partner_referrals").select("id,status,kind").eq("workspace_id", ws).single()).data as { id: string; status: string; kind: string };
    expect([ref.status, ref.kind]).toEqual(["pending", "organiser"]);
    expect(((await partnerC.from("partner_referrals").select("id").eq("id", ref.id)).data ?? []).length).toBe(1);
    // A paid subscription invoice qualifies it: one earning at the partner's rule version, a memo in the affiliate family.
    const inv = `in_w07${tag}${Date.now()}`; invoices.push(inv);
    await db.from("subscription_invoices").insert({ stripe_invoice_id: inv, workspace_id: ws, status: "paid", amount_due: 2900, amount_paid: 2900, currency: "GBP" });
    await db.from("subscription_invoices").update({ status: "paid", amount_paid: 2900 }).eq("stripe_invoice_id", inv);    // webhook replay
    const earns = (await db.from("partner_earnings").select("id,commission,eligible_revenue,commission_rule_version,commission_bps,status").eq("source_invoice", inv)).data ?? [];
    expect(earns).toHaveLength(1);
    const bps = ((await db.from("partners").select("commission_bps").eq("id", partnerId).single()).data as { commission_bps: number }).commission_bps;
    expect([Number(earns[0]!.eligible_revenue), Number(earns[0]!.commission), earns[0]!.commission_bps]).toEqual([29, Math.round(29 * bps / 100) / 100, bps]);
    expect(earns[0]!.commission_rule_version).toBeGreaterThanOrEqual(1);
    expect(((await db.from("partner_referrals").select("status").eq("id", ref.id).single()).data as { status: string }).status).toBe("active");
    const tx = (await db.from("ledger_transactions").select("id,kind,basis").eq("idempotency_key", `partner:accrual:${earns[0]!.id}`).single()).data as { id: string; kind: string; basis: string };
    expect([tx.kind, tx.basis]).toEqual(["affiliate_commission", "platform_obligation_memo"]);
    const accts = ((await db.from("ledger_entries").select("account").eq("transaction_id", tx.id)).data ?? []).map(e => e.account).sort();
    expect(accts).toEqual(["affiliate_payable", "platform_affiliate_commission"]);
    // Statement: equals the earnings assigned to it; voiding the invoice reverses the earning and the statement follows.
    expect((await db.rpc("partner_build_statements", { p_month: new Date().toISOString().slice(0, 10) })).error).toBeNull();
    const stId = ((await db.from("partner_earnings").select("statement_id").eq("id", earns[0]!.id).single()).data as { statement_id: string }).statement_id;
    expect(Number(((await db.from("partner_statements").select("commission").eq("id", stId).single()).data as { commission: number }).commission)).toBeCloseTo(Number(earns[0]!.commission), 2);
    await db.from("subscription_invoices").update({ status: "void" }).eq("stripe_invoice_id", inv);
    expect(((await db.from("partner_earnings").select("status").eq("id", earns[0]!.id).single()).data as { status: string }).status).toBe("reversed");
    expect(Number(((await db.from("partner_statements").select("commission").eq("id", stId).single()).data as { commission: number }).commission)).toBe(0);
    expect((await db.from("ledger_transactions").select("id").eq("idempotency_key", `partner:reversal:${earns[0]!.id}`)).data).toHaveLength(1);
    // Partners cannot run the attribution or statement machinery themselves.
    expect((await partnerC.rpc("partner_build_statements", { p_month: "2026-10-01" })).error).not.toBeNull();
    expect((await partnerC.rpc("partner_qualify_invoice", { p_invoice: inv })).error).not.toBeNull();
  });
});
