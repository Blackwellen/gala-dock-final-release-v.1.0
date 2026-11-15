import { workspaceLocale } from "@/lib/i18n/workspace";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import "@/styles/provider-money.css";
import { money, day } from "@/lib/workspace/format";
import { PrintButton } from "../../quotes/[id]/print/print-button";
import { loadMoney, inRange, net } from "../data";
import { currentLondonMonth, londonDateKey, londonMonthLabel, londonMonthRange } from "@/lib/provider/london-month";
import { FinanceOnly } from "../_components/finance-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Statement" };

/** Printable monthly statement built from the workspace's own ledger (gross, commission, refunds, net, payouts). */
export default async function Statement(props: PageProps<"/provider/money/statement">) {
  const sp = await props.searchParams;
  const { ctx, txs } = await loadMoney();
  const tz = workspaceLocale(ctx.workspace.settings).timezone;   // Q76: the workspace's months, London by default
  const m = typeof sp.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : currentLondonMonth(undefined, tz);
  if (!ctx.can.finance) return <FinanceOnly />;
  const [a, b] = londonMonthRange(m, tz); // Q49: London months, not UTC
  const list = txs.filter(t => inRange(t, a, b)).sort((x, y) => x.occurred_at.localeCompare(y.occurred_at));
  const sum = (k: string[], f: (t: (typeof list)[number]) => number) => list.filter(t => k.includes(t.kind)).reduce((s, t) => s + f(t), 0);
  const gross = sum(["income"], t => t.amount), refunds = sum(["refund"], t => t.amount), fees = sum(["income", "refund"], t => t.fee_amount), subs = sum(["fee"], t => t.amount), payouts = sum(["payout"], t => t.amount);
  const label = londonMonthLabel(m);
  const tax = (ctx.workspace.settings as { tax?: { vat_registered?: boolean; number?: string } }).tax;
  // Q74: commission VAT by seller country — UK VAT for UK sellers; reverse charge (customer accounts for VAT) for non-UK businesses.
  // Service client after the finance check above: these helpers are not client-callable (202611147402).
  const admin = createAdminClient() as unknown as { rpc(fn: string, a: Record<string, unknown>): PromiseLike<{ data: unknown }> };
  const [{ data: treatment }, { data: sellerVat }] = await Promise.all([admin.rpc("fee_vat_treatment", { p_workspace: ctx.workspace.id }), admin.rpc("workspace_vat_number", { p_workspace: ctx.workspace.id })]);
  const reverse = treatment === "reverse_charge";
  return <div className="pm-statement">
    <div className="pm-st-bar no-print"><Link href="/provider/money?tab=statements" className="ws-back"><ArrowLeft aria-hidden="true" />Back to Money</Link><PrintButton /></div>
    <article className="pm-st">
      <header><div><h1>Statement</h1><p>{label}</p></div><div className="pm-st-who"><b>{ctx.workspace.name}</b>{tax?.vat_registered && tax.number && <small>VAT {tax.number}</small>}<small>Issued {day(new Date().toISOString(), { day: "numeric", month: "long", year: "numeric" })}</small></div></header>
      <dl className="pm-st-sum"><div><dt>Gross bookings</dt><dd>{money(gross, "GBP", { cents: true })}</dd></div><div><dt>Refunds</dt><dd>{money(refunds, "GBP", { cents: true })}</dd></div>
        <div><dt>Gala Dock commission</dt><dd>{money(-fees, "GBP", { cents: true })}</dd></div><div><dt>Subscription</dt><dd>{money(subs, "GBP", { cents: true })}</dd></div>
        <div className="tot"><dt>Net earnings</dt><dd>{money(gross + refunds - fees + subs, "GBP", { cents: true })}</dd></div><div><dt>Paid out</dt><dd>{money(-payouts, "GBP", { cents: true })}</dd></div></dl>
      <table><thead><tr><th>Date</th><th>Description</th><th>Reference</th><th className="r">Gross</th><th className="r">Fees</th><th className="r">Net</th></tr></thead>
        <tbody>{list.map(t => <tr key={t.id}><td>{londonDateKey(t.occurred_at, tz)}</td><td>{t.description}</td><td>{t.stripe_ref ?? ""}</td><td className="r">{money(t.amount, "GBP", { cents: true })}</td><td className="r">{t.fee_amount ? money(-t.fee_amount, "GBP", { cents: true }) : ""}</td><td className="r">{money(net(t), "GBP", { cents: true })}</td></tr>)}</tbody></table>
      {!list.length && <p>No transactions in {label}.</p>}
      <p className="pm-st-vat">{reverse
        ? <>Gala Dock commission is supplied by Blackwellen Limited (VAT GB508480488) without UK VAT: <b>reverse charge</b> — the customer accounts for the VAT{typeof sellerVat === "string" && sellerVat ? <> (customer VAT number {sellerVat})</> : null}.</>
        : <>Gala Dock commission includes UK VAT at 20% (Blackwellen Limited, VAT GB508480488).</>}</p>
      <footer>Figures come from your Gala Dock ledger. Accepted bookings keep the commercial terms agreed at confirmation.</footer>
    </article>
  </div>;
}
