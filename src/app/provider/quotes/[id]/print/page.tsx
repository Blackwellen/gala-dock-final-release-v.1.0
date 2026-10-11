import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/styles/provider-quote-profile.css";
import { money, day, time } from "@/lib/workspace/format";
import { getProvider } from "@/lib/provider/context";
import { workspaceItems, workspaceListings } from "@/lib/provider/queries";
import { workspaceQuotes } from "@/lib/provider/commercial";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Quote (print)" };

/** Client-facing quote document. Uses the browser's print / “Save as PDF” — no server-generated file is claimed. */
export default async function QuotePrint(props: PageProps<"/provider/quotes/[id]/print">) {
  const { id } = await props.params;
  const [ctx, quotes, items, listings] = await Promise.all([getProvider(), workspaceQuotes(), workspaceItems(), workspaceListings()]);
  const q = quotes.find(x => x.id === id);
  if (!q) notFound();
  const item = items.find(i => i.id === q.build_item_id), e = item?.event;
  const listing = listings.find(l => l.id === item?.listing_id);
  const terms = q.terms as { cancellation?: { window: string; refund: number }[]; inclusions?: string[]; exclusions?: string[]; tax_bps?: number };
  const tax = ((ctx.workspace.settings as Record<string, Record<string, unknown>>)?.tax ?? {}) as { number?: string };
  const deposit = Math.round(Number(q.total) * q.deposit_pct) / 100;
  return <article className="qprint">
    <PrintButton />
    <header><div><h1>{ctx.workspace.name}</h1><p>{listing?.location}</p>{tax.number && <p>VAT {tax.number}</p>}</div>
      <div className="qprint-ref"><b>Quote {q.reference} · v{q.version}</b><span>Issued {day(q.sent_at ?? q.created_at, { day: "numeric", month: "long", year: "numeric" })}</span>
        <span>Valid until {q.valid_until ? day(q.valid_until, { day: "numeric", month: "long", year: "numeric" }) : "—"}</span>{q.status === "draft" && <strong>DRAFT — not yet sent</strong>}</div></header>
    <section className="qprint-for"><b>Prepared for</b><span>{e?.client_name}</span><span>{e?.name} · {day(e?.starts_at, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {time(e?.starts_at)}–{time(e?.ends_at)}</span><span>{e?.guest_count} guests · {e?.location}</span></section>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead>
      <tbody>{q.items.map((i, n) => <tr key={n}><td><b>{i.label}</b>{i.detail && <small>{i.detail}</small>}</td><td>{i.qty}</td><td>{money(i.unit_price, "GBP", { cents: true })}</td><td>{money(i.qty * i.unit_price, "GBP", { cents: true })}</td></tr>)}</tbody>
      <tfoot><tr><td colSpan={3}>Subtotal</td><td>{money(q.subtotal, "GBP", { cents: true })}</td></tr>
        {Number(q.tax) > 0 && <tr><td colSpan={3}>VAT ({(terms.tax_bps ?? 0) / 100}%)</td><td>{money(q.tax, "GBP", { cents: true })}</td></tr>}
        <tr className="total"><td colSpan={3}>Total</td><td>{money(q.total, "GBP", { cents: true })}</td></tr>
        <tr><td colSpan={3}>Deposit due on acceptance ({q.deposit_pct}%)</td><td>{money(deposit, "GBP", { cents: true })}</td></tr></tfoot></table>
    <div className="qprint-cols">
      {terms.inclusions?.length ? <section><h2>Included</h2><ul>{terms.inclusions.map(t => <li key={t}>{t}</li>)}</ul></section> : null}
      {terms.exclusions?.length ? <section><h2>Not included</h2><ul>{terms.exclusions.map(t => <li key={t}>{t}</li>)}</ul></section> : null}
      {terms.cancellation?.length ? <section><h2>Cancellation</h2><ul>{terms.cancellation.map(t => <li key={t.window}>{t.window} before the event: {t.refund ? `${t.refund}% refund` : "no refund"}</li>)}</ul></section> : null}
    </div>
    {q.message && <section className="qprint-msg"><h2>Message</h2><p>{q.message}</p></section>}
    <footer>Payments are processed securely through Gala Dock. This quote becomes a booking only when accepted and the deposit is paid.</footer>
  </article>;
}
