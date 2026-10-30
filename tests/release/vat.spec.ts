import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, enrolTotp, seedWorkspace, signedIn, insertEventFixture } from "../phase1/helpers";

// VAT on Gala Dock's own fees (migration 202610280020): consumer fees VAT-inclusive, business fees plus 20%; VAT booked to tax_payable.
const db = admin as unknown as SupabaseClient;

test.describe("VAT on Gala Dock fees", () => {
  let owner: { id: string; email: string }, buyer: { id: string; email: string }, finance: { id: string; email: string }, ws: string, ev: string;
  test.beforeAll(async () => {
    [owner, buyer, finance] = await Promise.all([createUser("vat-o"), createUser("vat-b"), createUser("vat-f")]);
    ws = await seedWorkspace(owner.id, "organizer", "VAT Org");
    ev = ((await insertEventFixture({ owner_id: owner.id, workspace_id: ws, name: "VAT Gala", status: "on_sale" }, "vat").select("id").single()).data as { id: string }).id;
    await db.from("platform_admins").insert({ user_id: finance.id, title: "VAT test", permissions: ["commerce"] });
  });
  test.afterAll(async () => {
    await db.from("checkout_orders").delete().eq("event_id", ev);
    await db.from("events").delete().eq("id", ev);
    await db.from("workspaces").delete().eq("id", ws);
    await db.from("platform_admins").delete().eq("user_id", finance.id);
    await cleanup();
  });

  test("ticket order: £1 booking fees include VAT; 5% commission gets VAT added and deducted from the seller", async () => {
    const ref = `VAT${Date.now()}`;
    // 2 tickets at £30: booking fees £2.00 (incl. £0.33 VAT), commission 5% = £3.00 + £0.60 VAT.
    const { data, error } = await db.from("checkout_orders").insert({ order_ref: ref, event_id: ev, buyer_id: buyer.id, token: `tok-${ref}`, amount: 60, fee: 2, commission: 3,
      currency: "GBP", status: "issued", kind: "primary" }).select("amount,fee,fee_vat,commission,commission_vat").single();
    expect(error).toBeNull();
    expect(data).toEqual({ amount: 60, fee: 2, fee_vat: 0.33, commission: 3.6, commission_vat: 0.6 });
  });

  test("ledger books VAT to tax_payable, not revenue", async () => {
    const { data: po } = await db.from("checkout_orders").select("order_ref").eq("event_id", ev).limit(1).single();
    // The same split the Stripe webhook posts: £62 paid = £5.60 Gala Dock fees (£0.93 VAT) + £56.40 to the seller.
    const key = `test:vat:${po!.order_ref}`;
    const { error } = await db.rpc("post_ledger_transaction", { p_idempotency_key: key, p_kind: "ticket_order", p_currency: "GBP",
      p_lines: [{ account: "cash_stripe", amount_minor: 6200, party_type: "platform" }, { account: "platform_fee", amount_minor: -467, party_type: "platform" },
        { account: "tax_payable", amount_minor: -93, party_type: "platform" }, { account: "provider_payable", amount_minor: -5640, party_type: "workspace", party_id: ws }],
      p_workspace: ws, p_event: ev, p_source_type: "checkout_order", p_source_id: po!.order_ref, p_description: "VAT test", p_stripe_ref: null, p_actor_type: "system" });
    expect(error).toBeNull();
    const { data: tx } = await db.from("ledger_transactions").select("id").eq("idempotency_key", key).single();
    await db.from("ledger_entries").delete().eq("transaction_id", tx!.id); await db.from("ledger_transactions").delete().eq("id", tx!.id);
  });

  test("VAT summary: commerce admins only; includes this order's VAT", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const f = await signedIn(finance.email) as unknown as SupabaseClient, o = await signedIn(owner.email) as unknown as SupabaseClient;
    await enrolTotp(f as never);   // Q45 (migration 202610293034): platform-admin reads need an aal2 session too
    expect((await o.rpc("admin_vat_summary", { p_from: today, p_to: today })).error?.message).toMatch(/not_authorized/);
    const { data, error } = await f.rpc("admin_vat_summary", { p_from: today, p_to: today });
    expect(error).toBeNull();
    const rows = data as { source: string; vat: number }[];
    expect(rows.find(r => r.source === "Ticket booking fees")!.vat).toBeGreaterThanOrEqual(0.33);
    expect(rows.find(r => r.source === "Ticket seller commission")!.vat).toBeGreaterThanOrEqual(0.6);
  });
});
