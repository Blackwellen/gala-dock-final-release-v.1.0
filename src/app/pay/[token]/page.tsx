import { notFound, redirect } from "next/navigation";
import { CheckCircle2, ShieldCheck, Lock } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, stripeKey } from "@/lib/stripe";
import { rateLimit } from "@/lib/security";

export const metadata = { title: "Pay invoice", robots: { index: false } };
type Inv = { id: string; number: string; client_name: string; total: number; amount_paid: number; currency: string; due_date: string | null; status: string; workspace_name: string; event_name: string | null };

async function load(token: string) {
  if (!/^[0-9a-f]{36}$/.test(token)) return null;
  const { data } = await createAdminClient().rpc("invoice_by_token", { p_token: token });
  return ((data ?? [])[0] ?? null) as Inv | null;
}

/** Server action: open Stripe Checkout for the outstanding balance. */
async function pay(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? ""); const inv = await load(token); if (!inv || !stripeKey()) return;
  if (!(await rateLimit(`pay:${token}`, 10, 600))) return;
  const due = Math.round((Number(inv.total) - Number(inv.amount_paid)) * 100); if (due <= 0) return;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3107";
  const s = await stripe<{ url: string }>("checkout/sessions", { mode: "payment", "line_items[0][price_data][currency]": inv.currency.toLowerCase(), "line_items[0][price_data][unit_amount]": String(due), "line_items[0][price_data][product_data][name]": `Invoice ${inv.number} — ${inv.workspace_name}`, "line_items[0][quantity]": "1", success_url: `${base}/pay/${token}?session={CHECKOUT_SESSION_ID}`, cancel_url: `${base}/pay/${token}`, "metadata[invoice_id]": inv.id, "payment_intent_data[metadata][invoice_id]": inv.id });
  redirect(s.url);
}

export default async function PayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  let inv = await load(token); if (!inv) notFound();
  // Returning from Checkout: verify with Stripe server-side, then record exactly once.
  if (sp.session && /^cs_[A-Za-z0-9_]+$/.test(sp.session) && inv.status !== "paid") {
    const s = await stripe<{ payment_status: string; amount_total: number; payment_intent: string; metadata: { invoice_id?: string } }>(`checkout/sessions/${sp.session}`).catch(() => null);
    if (s?.payment_status === "paid" && s.metadata.invoice_id === inv.id) {
      const admin = createAdminClient();
      const { count } = await admin.from("transactions").select("id", { count: "exact", head: true }).eq("stripe_ref", s.payment_intent);
      if (!count) await admin.rpc("record_invoice_payment", { p_invoice: inv.id, p_amount: s.amount_total / 100, p_method: "card payment", p_ref: s.payment_intent });
      inv = (await load(token))!;
    }
  }
  const due = Number(inv.total) - Number(inv.amount_paid); const paid = inv.status === "paid" || due <= 0;
  const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return <div className="pay"><section className="ce-card pay-card">
    <small className="pay-from">Invoice from {inv.workspace_name}</small><h1>{inv.number}</h1>{inv.event_name && <p className="pay-ev">{inv.event_name}</p>}
    <dl><div><dt>Billed to</dt><dd>{inv.client_name}</dd></div><div><dt>Invoice total</dt><dd>{gbp(Number(inv.total))}</dd></div><div><dt>Paid</dt><dd>{gbp(Number(inv.amount_paid))}</dd></div>{inv.due_date && <div><dt>Due date</dt><dd>{new Date(inv.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</dd></div>}<div className="b"><dt>Amount due</dt><dd>{gbp(Math.max(0, due))}</dd></div></dl>
    {paid ? <div className="pay-done"><CheckCircle2 size={22} /><b>Paid in full — thank you.</b></div>
      : <form action={pay}><input type="hidden" name="token" value={token} /><button className="k-btn primary pay-btn" disabled={!stripeKey()}><Lock size={16} />Pay {gbp(due)} securely</button></form>}
    <p className="pay-note"><ShieldCheck size={14} />Payments are processed by Stripe. Gala Dock never sees your card details.</p></section></div>;
}
