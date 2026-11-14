import type { Metadata } from "next";
import "@/styles/admin-a-base.css";
import { Restricted } from "@/components/workspace/kit";
import { requireAdminPermission } from "@/lib/admin/context";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LEGAL } from "@/lib/legal";
import { londonYmd } from "../../_b/format";

export const metadata: Metadata = { title: "VAT" };
type Row = { source: string; transactions: number; gross: number; vat: number; net: number };
const D = /^\d{4}-\d{2}-\d{2}$/;

/** Output VAT on Gala Dock's own fees for a period (migration 202610280020): the figures for box 1 and box 6 of the VAT return. */
export default async function VatPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAdminPermission("commerce");
  if (!ctx.allowed) return <Restricted area="Commerce" />;
  // Q51: the quarter and "today" in London (UTC gave the previous day/quarter just after midnight BST).
  const sp = await props.searchParams, today = londonYmd();
  const [yy, mm] = today.split("-").map(Number);
  const defFrom = `${yy}-${String(Math.floor((mm! - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  const from = typeof sp.from === "string" && D.test(sp.from) ? sp.from : defFrom;
  const to = typeof sp.to === "string" && D.test(sp.to) ? sp.to : today;
  const { data, error } = await ctx.db.rpc("admin_vat_summary", { p_from: from, p_to: to });
  const rows = (data ?? []) as Row[];
  const sum = (k: keyof Row) => rows.reduce((a, r) => a + Number(r[k]), 0);
  const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
  return <div className="aa">
    <header className="ws-page-head"><div><Link className="aa-back" href="/admin/commerce"><ArrowLeft aria-hidden="true" />Back to Commerce</Link><h1>VAT on Gala Dock fees</h1><p>{LEGAL.entity.name} · VAT No. {LEGAL.entity.vat}. Output tax on our own fees only. Ticket face values and providers’ prices are the sellers’ own supplies.</p></div></header>
    <section className="ws-panel aa-vat">
      <form method="get" className="aa-vat-form">
        <label><span>From</span><input type="date" name="from" defaultValue={from} className="ws-input" /></label>
        <label><span>To</span><input type="date" name="to" defaultValue={to} className="ws-input" /></label>
        <button className="ws-btn primary">Show</button>
      </form>
      {error ? <p role="alert">Couldn’t load the VAT summary.</p> : <table className="aa-table aa-vat-table">
        <thead><tr><th scope="col">Fee</th><th scope="col" className="r">Transactions</th><th scope="col" className="r">Net</th><th scope="col" className="r">VAT</th><th scope="col" className="r">Gross</th></tr></thead>
        <tbody>{rows.length ? rows.map(r => <tr key={r.source}><td>{r.source}</td><td className="r">{Number(r.transactions).toLocaleString("en-GB")}</td><td className="r">{gbp(Number(r.net))}</td><td className="r">{gbp(Number(r.vat))}</td><td className="r">{gbp(Number(r.gross))}</td></tr>)
          : <tr><td colSpan={5}>No fees in this period.</td></tr>}</tbody>
        {rows.length > 0 && <tfoot><tr><th scope="row">Total</th><td className="r">{sum("transactions").toLocaleString("en-GB")}</td><td className="r"><b>{gbp(sum("net"))}</b></td><td className="r"><b>{gbp(sum("vat"))}</b></td><td className="r">{gbp(sum("gross"))}</td></tr></tfoot>}
      </table>}
      <p className="aa-vat-note">Box 1 (VAT due on sales) is the VAT total; box 6 (sales excluding VAT) includes the net total. Ticket booking fees and booking admin fees include VAT (one sixth of the fee); commission and boosts are charged plus 20%. Refunded payments are excluded. Orders made before the VAT change (12 Oct 2026) show no VAT.</p>
    </section>
  </div>;
}
