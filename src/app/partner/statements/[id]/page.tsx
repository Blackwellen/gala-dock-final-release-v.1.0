import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/styles/portal-shell.css";
import "@/styles/portal-partner.css";
import { requireUser } from "@/lib/auth";
import { untyped, one, isUuid } from "@/lib/workspace/db";
import { LEGAL } from "@/lib/legal";
import { money } from "@/lib/workspace/format";
import { fmt } from "@/components/portal/format";
import { PrintButton } from "./print";

export const metadata: Metadata = { title: "Self-billed statement · Gala Dock", robots: { index: false, follow: false } };

type St = { id: string; partner_id: string; period_start: string; eligible_revenue: number; commission: number; opening_balance: number; status: string; paid_at: string | null;
  vat_rate_bps: number | null; vat_amount: number | null; amount_paid: number | null; self_bill_number: string | null; transfer_id: string | null };
type P = { id: string; name: string; payout_country: string | null; vat_registered: boolean; vat_number: string | null; details: { contact_name?: string; email?: string } | null };

/**
 * Q68 self-billed statement (owner update 2026-11-14). Readable by the partner it belongs to and by admins with the partners
 * permission (RLS on partner_statements / partners). Numbered when the statement is paid via Stripe.
 */
export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireUser(`/partner/statements/${id}`);
  const sb = untyped(supabase);
  const st = await one<St>(sb.from("partner_statements").select("id,partner_id,period_start,eligible_revenue,commission,opening_balance,status,paid_at,vat_rate_bps,vat_amount,amount_paid,self_bill_number,transfer_id").eq("id", id).maybeSingle());
  if (!st || !st.self_bill_number) notFound();
  const p = await one<P>(sb.from("partners").select("id,name,payout_country,vat_registered,vat_number,details").eq("id", st.partner_id).maybeSingle());
  if (!p) notFound();
  const net = Number(st.amount_paid ?? 0) - Number(st.vat_amount ?? 0), vat = Number(st.vat_amount ?? 0);
  const reverseCharge = p.vat_registered && (p.payout_country ?? "").toUpperCase() !== "GB";
  const period = fmt(st.period_start, { month: "long", year: "numeric" });
  return <main className="pr-doc">
    <header><div><small>Self-billed statement</small><h1>{st.self_bill_number}</h1><p>Commission for {period}</p></div><PrintButton /></header>
    <section className="pr-doc-parties">
      <div><h2>Supplier (partner)</h2><p><b>{p.name}</b>{p.details?.contact_name ? <><br />{p.details.contact_name}</> : null}{p.details?.email ? <><br />{p.details.email}</> : null}
        <br />Country: {p.payout_country ?? "—"}{p.vat_registered && p.vat_number ? <><br />VAT number: {p.vat_number}</> : <><br />Not VAT-registered</>}</p></div>
      <div><h2>Customer (issued by)</h2><p><b>{LEGAL.entity.name}</b> trading as {LEGAL.service}<br />{LEGAL.entity.address}<br />Company {LEGAL.entity.number} · VAT {LEGAL.entity.vat}</p></div>
    </section>
    <table className="pr-doc-table"><tbody>
      <tr><th>Statement period</th><td>{period}</td></tr>
      <tr><th>Eligible revenue (excluding VAT)</th><td>{money(Number(st.eligible_revenue), "GBP", { cents: true })}</td></tr>
      <tr><th>Commission this period</th><td>{money(Number(st.commission), "GBP", { cents: true })}</td></tr>
      {Number(st.opening_balance) !== 0 && <tr><th>Balance carried in from earlier months</th><td>{money(Number(st.opening_balance), "GBP", { cents: true })}</td></tr>}
      <tr><th>Net amount</th><td>{money(net, "GBP", { cents: true })}</td></tr>
      <tr><th>VAT{st.vat_rate_bps ? ` at ${st.vat_rate_bps / 100}%` : ""}</th><td>{vat > 0 ? money(vat, "GBP", { cents: true }) : reverseCharge ? "Reverse charge — the customer accounts for VAT" : "None (supplier not VAT-registered in the UK)"}</td></tr>
      <tr className="total"><th>Total</th><td>{money(Number(st.amount_paid ?? 0), "GBP", { cents: true })}</td></tr>
      <tr><th>Status</th><td>{st.status === "paid" ? `Paid ${st.paid_at ? fmt(st.paid_at) : ""} by Stripe transfer ${st.transfer_id ?? ""}` : "Payment in progress"}</td></tr>
    </tbody></table>
    <p className="pr-doc-note">This is a self-billed invoice issued by {LEGAL.entity.name} under the self-billing agreement in the {LEGAL.service} Affiliate &amp; Partner Terms. The supplier agrees not to issue its own VAT invoice for this supply.
      {vat > 0 ? " The VAT shown is payable to HMRC by the supplier." : ""}</p>
  </main>;
}
