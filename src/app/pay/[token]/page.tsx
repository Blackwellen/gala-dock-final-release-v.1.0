import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, ShieldCheck, Lock, CircleAlert } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { headers } from "next/headers";
import { rateLimit, tokenPageAllowed } from "@/lib/security";
import { paymentDeps } from "@/lib/payments/server";
import { connectedMerchantStripe } from "@/lib/payments/stripe-client";
import { getDirectPaymentStatus } from "@/lib/payments/service";
import { sellerReadiness, NOT_READY_COPY, type SellerAccount } from "@/lib/payments/rules";

export const metadata: Metadata = { title: "Pay invoice · Gala Dock", robots: { index: false, follow: false }, referrer: "no-referrer" };
/** Every pay-token format ever issued: 24 hex (column default), 36 hex (ensure_invoice_token), 32 hex / uuid (imports). Mirrors public.invoice_pay_token_valid (Q07). */
const PAY_TOKEN = /^([0-9a-f]{24}|[0-9a-f]{32}|[0-9a-f]{36}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
type Inv = { id: string; number: string; client_name: string; total: number; amount_paid: number; currency: string; due_date: string | null; status: string; workspace_name: string; event_name: string | null };

async function load(token: string) {
  if (!PAY_TOKEN.test(token)) return null;
  const { data } = await createAdminClient().rpc("invoice_by_token", { p_token: token });
  return ((data ?? [])[0] ?? null) as Inv | null;
}

/** The issuing organiser's Stripe account: invoices are direct charges to the organiser, never platform charges (Q07). */
async function issuer(invoiceId: string) {
  const db = untyped(createAdminClient() as never);
  const { data: inv } = await db.from("invoices").select("workspace_id").eq("id", invoiceId).maybeSingle();
  if (!inv?.workspace_id) return { readiness: sellerReadiness(null), workspaceId: null };
  const { data } = await db.rpc("seller_payment_account", { p_workspace: inv.workspace_id });
  return { readiness: sellerReadiness(data as SellerAccount | null), workspaceId: inv.workspace_id as string };
}

/** Server action: open Stripe Checkout for the outstanding balance, in the organiser's connected account. */
async function pay(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? ""); const inv = await load(token); const deps = paymentDeps();
  if (!inv || !deps) return;
  if (!(await rateLimit(`pay:${token}`, 10, 600))) return;
  const due = Math.round((Number(inv.total) - Number(inv.amount_paid)) * 100); if (due <= 0) return;
  const { readiness } = await issuer(inv.id);
  if (!readiness.ready) return;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3107";
  // Gala Dock takes no fee on an organiser's own invoices; the application fee is explicit (0) so the charge stays direct.
  const fee = 0;
  const s = await connectedMerchantStripe(deps.stripe).createCheckout(readiness.account, {
    mode: "payment", "line_items[0][price_data][currency]": inv.currency.toLowerCase(), "line_items[0][price_data][unit_amount]": String(due),
    "line_items[0][price_data][product_data][name]": `Invoice ${inv.number} — ${inv.workspace_name}`.slice(0, 200), "line_items[0][quantity]": "1",
    success_url: `${base}/pay/${token}?session={CHECKOUT_SESSION_ID}`, cancel_url: `${base}/pay/${token}`,
    "metadata[invoice_id]": inv.id, "payment_intent_data[metadata][invoice_id]": inv.id, "payment_intent_data[application_fee_amount]": String(fee),
  }, `invoice:${inv.id}:${due}:${Math.floor(Date.now() / 3_600_000)}`);
  const { error } = await createAdminClient().rpc("invoice_card_payment_open" as never, { p_invoice: inv.id, p_session: s.id, p_account: readiness.account, p_amount_minor: due,
    p_fee_minor: fee, p_currency: inv.currency, p_livemode: !!s.livemode } as never);
  if (error || !s.url) return;
  redirect(s.url);
}

export default async function PayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  if (!PAY_TOKEN.test(token)) notFound();
  if (!(await tokenPageAllowed("pay", await headers()))) throw new Error("Too many requests. Please try again shortly.");
  let inv = await load(token); if (!inv) notFound();
  const deps = paymentDeps();
  // Returning from Checkout: verify with Stripe in the organiser's account context, then settle exactly once (same RPC as the webhook).
  if (deps && sp.session && /^cs_[A-Za-z0-9_]+$/.test(sp.session) && inv.status !== "paid") {
    const db = untyped(createAdminClient() as never);
    const { data: row } = await db.from("invoice_card_payments").select("connected_account_id,invoice_id").eq("stripe_checkout_session", sp.session).maybeSingle();
    if (row?.invoice_id === inv.id) {
      const st = await getDirectPaymentStatus(deps, row.connected_account_id, sp.session).catch(() => null);
      if (st?.paid && st.paymentIntent) {
        await db.rpc("invoice_card_payment_succeeded", { p_session: sp.session, p_pi: st.paymentIntent, p_amount_minor: st.amountMinor, p_account: row.connected_account_id, p_livemode: st.livemode });
        inv = (await load(token))!;
      }
    }
  }
  const due = Number(inv.total) - Number(inv.amount_paid); const paid = inv.status === "paid" || due <= 0;
  const { readiness } = paid ? { readiness: null } : await issuer(inv.id);
  const blocked = !paid && (!deps || !readiness?.ready);
  const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return <div className="pay"><section className="ce-card pay-card">
    <small className="pay-from">Invoice from {inv.workspace_name}</small><h1>{inv.number}</h1>{inv.event_name && <p className="pay-ev">{inv.event_name}</p>}
    <dl><div><dt>Billed to</dt><dd>{inv.client_name}</dd></div><div><dt>Invoice total</dt><dd>{gbp(Number(inv.total))}</dd></div><div><dt>Paid</dt><dd>{gbp(Number(inv.amount_paid))}</dd></div>{inv.due_date && <div><dt>Due date</dt><dd>{new Date(inv.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</dd></div>}<div className="b"><dt>Amount due</dt><dd>{gbp(Math.max(0, due))}</dd></div></dl>
    {paid ? <div className="pay-done"><CheckCircle2 size={22} /><b>Paid in full — thank you.</b></div>
      : blocked ? <p className="pay-note" role="status"><CircleAlert size={14} />{!deps ? "Card payments aren’t configured in this environment yet." : readiness && !readiness.ready ? `${NOT_READY_COPY[readiness.reason]} Please contact ${inv.workspace_name} to pay another way.` : ""}</p>
      : <form action={pay}><input type="hidden" name="token" value={token} /><button className="k-btn primary pay-btn"><Lock size={16} />Pay {gbp(due)} securely</button></form>}
    <p className="pay-note"><ShieldCheck size={14} />Paid to {inv.workspace_name} through Stripe. Gala Dock never sees your card details.</p></section></div>;
}
