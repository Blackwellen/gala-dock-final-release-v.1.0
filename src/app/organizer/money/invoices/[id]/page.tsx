import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, CalendarDays, MapPin, Receipt, CircleDollarSign, FileWarning, CheckCircle2, Circle, FileText, Send, Bell, FileCheck2 } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { Crumbs, LinkTabs } from "@/components/kit";
import { InvoiceHeaderActions, InvoiceSideActions, PayLinkBox, NotesCard } from "@/components/organizer/invoice-client";
import { money } from "@/lib/format";

export const metadata = { title: "Invoice" };
const TZ = "Europe/London";
const IST: Record<string, [string, string]> = { draft: ["Draft", "gray"], sent: ["Sent", "blue"], viewed: ["Viewed", "blue"], partial: ["Partially paid", "blue"], paid: ["Paid", "green"], overdue: ["Overdue", "red"], cancelled: ["Cancelled", "gray"], credited: ["Credited", "gray"] };
const gbp2 = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]); if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getOrganizer(); const sb = ctx.supabase;
  const { data: i } = await sb.from("invoices").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!i) notFound();
  const [{ data: items }, { data: inst }, { data: evs }, { data: ev }, { data: list }] = await Promise.all([
    sb.from("invoice_items").select("*").eq("invoice_id", id).order("sort"),
    sb.from("invoice_installments").select("*").eq("invoice_id", id).order("due_date"),
    sb.from("invoice_events").select("event,detail,created_at").eq("invoice_id", id).order("created_at"),
    i.event_id ? sb.from("events").select("id,name,starts_at,venue_name,city,cover_image,settings").eq("id", i.event_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("invoices").select("id,number").eq("workspace_id", ctx.workspace.id).order("number"),
  ]);
  const tab = ["schedule", "activity"].includes(sp.tab ?? "") ? sp.tab! : "invoice";
  const due = Number(i.total) - Number(i.amount_paid); const overdue = !["paid", "draft", "cancelled", "credited"].includes(i.status) && i.due_date && i.due_date < new Date().toISOString().slice(0, 10);
  const [sl, tone] = IST[overdue ? "overdue" : i.status] ?? [i.status, "gray"];
  const fmtD = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }) : "—";
  const fmtDT = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const days = i.issue_date && i.due_date ? Math.round((Date.parse(i.due_date) - Date.parse(i.issue_date)) / 864e5) : null;
  const ix = (list ?? []).findIndex(x => x.id === id); const prev = (list ?? [])[ix - 1], next = (list ?? [])[ix + 1];
  const steps = [["Draft", i.created_at], ["Sent", i.issued_at], ...((evs ?? []).filter(e => /payment received/i.test(e.event)).slice(0, 1).map(e => ["Partially paid", e.created_at])), ["Paid", (evs ?? []).find(e => e.event === "Invoice paid")?.created_at ?? null]] as [string, string | null][];
  const comm = [...(evs ?? [])].reverse();
  const ICON: Record<string, typeof Send> = { "Invoice sent": Send, "Payment reminder sent": Bell, "Invoice paid": FileCheck2, "Payment received": CircleDollarSign };
  const addr = i.client_address.split(/\n|,\s*/).filter(Boolean);
  const vat = (items ?? [])[0]?.tax_rate ?? 20;

  return <div className="iv">
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Money", href: "/organizer/money" }, { label: "Invoices", href: "/organizer/money?tab=receivables" }, { label: i.number }]} />
    <div className="iv-head"><div className="k-grow"><div className="k-row" style={{ gap: 12 }}><h1>Invoice {i.number}</h1><span className={`mn-st lg ${tone}`}>{tone === "green" && <CheckCircle2 size={14} />}{sl}</span></div><p className="iv-sub">{ev?.name ?? i.reference}</p></div>
      <InvoiceHeaderActions id={id} status={i.status} prev={prev?.id ?? null} next={next?.id ?? null} /></div>
    <div className="iv-parties">
      <div className="iv-party"><span className="iv-logo">{i.client_name.slice(0, 1)}</span><div><div className="k-row" style={{ gap: 8 }}><b>{i.client_name}</b><span className="iv-chip">Client</span></div><span className="iv-ct">{i.client_email && <a href={`mailto:${i.client_email}`}><Mail size={14} />{i.client_email}</a>}</span></div></div>
      {ev && <div className="iv-party ev">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={ev.cover_image || "/assets/gd/oe-neon.webp"} alt="" /><div><Link href={`/organizer/events/${ev.id}?tab=money`}><b>{ev.name}</b></Link><span className="iv-ct"><span><CalendarDays size={14} />{fmtD(ev.starts_at)}</span><span><MapPin size={14} />{[ev.venue_name, ev.city].filter(Boolean).join(", ")}</span></span></div></div>}
    </div>
    <LinkTabs current={tab} tabs={[["invoice", "Invoice"], ["schedule", "Schedule"], ["activity", "Activity"]].map(([k, l]) => ({ key: k, label: l, href: k === "invoice" ? `/organizer/money/invoices/${id}` : `/organizer/money/invoices/${id}?tab=${k}` }))} />
    <div className="iv-grid">
      <div className="iv-main">
        <div className="iv-kpis">
          <div className="k-card mn-kpi"><span className="mn-ki blue"><Receipt size={20} /></span><span><small>Invoice amount</small><b>{gbp2(Number(i.total))}</b><em>Includes VAT {gbp2(Number(i.tax))}</em></span></div>
          <div className="k-card mn-kpi"><span className="mn-ki green"><CircleDollarSign size={20} /></span><span><small>Amount paid</small><b>{gbp2(Number(i.amount_paid))}</b><em className="k-green">{Number(i.total) ? Math.round((Number(i.amount_paid) / Number(i.total)) * 100) : 0}% paid</em></span></div>
          <div className="k-card mn-kpi"><span className="mn-ki red"><FileWarning size={20} /></span><span><small>Amount due</small><b className="k-red">{gbp2(due)}</b><em className={due <= 0 ? "k-green" : overdue ? "k-red" : ""}>{due <= 0 ? "Fully settled" : overdue ? "Overdue" : `Due ${fmtD(i.due_date)}`}</em></span></div>
          <div className="k-card mn-kpi"><span className="mn-ki blue"><CalendarDays size={20} /></span><span><small>Issue date</small><b className="sm">{fmtD(i.issue_date)}</b><small>Due date</small><b className="sm">{fmtD(i.due_date)} {days != null && <em>({days} days)</em>}</b></span></div>
        </div>
        {(tab === "invoice") && <>
          <div className="iv-r1">
            <section className="k-card iv-c"><h2>Invoice details</h2><dl className="iv-dl">{([["Invoice number", i.number], ["Client", i.client_name], ["Event", ev?.name ?? "—"], ["Reference", i.reference || "—"], ["Issue date", fmtD(i.issue_date)], ["Due date", fmtD(i.due_date)], ["Currency", `${i.currency} (${i.currency === "GBP" ? "£" : i.currency})`], ["Payment terms", days != null ? `${days} days` : "—"]] as const).map(([k, v], n) => <div key={k}><dt>{k}</dt><dd className={[1, 2].includes(n) ? "k-blue" : ""}>{v}</dd></div>)}</dl></section>
            <section className="k-card iv-c"><div className="k-between"><h2>Bill to</h2></div><address className="iv-addr"><b>{i.client_name}</b>{addr.map(a => <span key={a}>{a}</span>)}</address></section>
            <section className="k-card iv-c"><div className="k-between"><h2>Send to</h2></div><address className="iv-addr"><b>{i.contact_name || i.client_name}</b>{i.client_email && <span>{i.client_email}</span>}</address></section>
          </div>
          <section className="k-card iv-c"><div className="k-between"><h2>Line items ({(items ?? []).length})</h2>{i.status === "draft" && <Link className="k-btn outline sm" href={`/organizer/money/invoices/new?from=${id}`}>Edit items</Link>}</div>
            <table className="mn-t iv-items"><thead><tr><th>#</th><th>Item</th><th>Description</th><th>Qty</th><th>Unit price</th><th>Discount</th><th>Tax</th><th>Amount</th></tr></thead><tbody>{(items ?? []).map((it, n) => <tr key={it.id}><td>{n + 1}</td><td><b>{it.description}</b></td><td>{it.detail}</td><td>{Number(it.quantity)}</td><td>{gbp2(Number(it.unit_price))}</td><td>-</td><td>{Number(it.tax_rate)}%</td><td>{gbp2(Number(it.quantity) * Number(it.unit_price))}</td></tr>)}</tbody></table>
            <dl className="iv-tot"><div><dt>Subtotal</dt><dd>{gbp2(Number(i.subtotal))}</dd></div><div><dt>VAT ({Number(vat)}%)</dt><dd>{gbp2(Number(i.tax))}</dd></div><div className="b"><dt>Total</dt><dd>{gbp2(Number(i.total))}</dd></div></dl></section>
          <div className="iv-r2"><NotesCard id={id} notes={i.notes} editable={i.status === "draft"} />
            <section className="k-card iv-c"><div className="k-between"><h2>Attachments</h2></div><p className="k-small">Supporting documents live in the event&apos;s Files tab{ev ? <> — <Link href={`/organizer/events/${ev.id}?tab=files`}>open files</Link></> : ""}.</p></section></div>
        </>}
        {tab !== "invoice" && <section className="k-card iv-c"><h2>{tab === "schedule" ? "Payment schedule" : "Activity"}</h2>{tab === "schedule" ? <table className="mn-t"><thead><tr><th>#</th><th>Due date</th><th>Description</th><th>Amount</th><th>Status</th></tr></thead><tbody>{(inst ?? []).map((x, n) => <tr key={x.id}><td>{n + 1}</td><td>{fmtD(x.due_date)}</td><td>{x.label}</td><td>{gbp2(Number(x.amount))}</td><td><span className={`mn-st ${x.status === "paid" ? "green" : "blue"}`}>{x.status}</span></td></tr>)}</tbody></table>
          : <ul className="iv-comm">{comm.map((c, n) => { const Ic = ICON[c.event] ?? FileText; return <li key={n}><span className="tm-ci green"><Ic size={16} /></span><span className="k-grow"><b>{c.event}</b><small>{c.detail}</small></span><small>{fmtDT(c.created_at)}</small></li>; })}</ul>}</section>}
      </div>
      <aside className="iv-side">
        <section className="k-card iv-c"><h2>Invoice status</h2><ol className="iv-steps">{steps.map(([l, at]) => <li key={l} className={at ? "done" : ""}>{at ? <CheckCircle2 size={18} /> : <Circle size={18} />}<span><b>{l}</b><small>{at ? fmtDT(at) : "—"}</small></span></li>)}</ol></section>
        <section className="k-card iv-c"><div className="k-between"><h2>Payment schedule</h2></div><table className="mn-t sm"><thead><tr><th>#</th><th>Due date</th><th>Description</th><th>Amount</th><th>Status</th></tr></thead><tbody>{(inst ?? []).map((x, n) => <tr key={x.id}><td>{n + 1}</td><td>{fmtD(x.due_date)}</td><td>{x.label}</td><td>{gbp2(Number(x.amount))}</td><td><span className={`mn-st ${x.status === "paid" ? "green" : "blue"}`}>{x.status === "paid" ? "Paid" : "Due"}</span></td></tr>)}{!(inst ?? []).length && <tr><td colSpan={5} className="k-small">Single payment on the due date.</td></tr>}</tbody></table></section>
        <PayLinkBox id={id} token={i.payment_token} payable={["sent", "viewed", "partial", "overdue"].includes(i.status)} />
        <InvoiceSideActions id={id} status={i.status} due={due} />
        <section className="k-card iv-c"><div className="k-between"><h2>Communication history</h2><Link className="k-link" href={`/organizer/money/invoices/${id}?tab=activity`}>View all</Link></div><ul className="iv-comm">{comm.slice(0, 4).map((c, n) => { const Ic = ICON[c.event] ?? FileText; return <li key={n}><span className="tm-ci green"><Ic size={16} /></span><span className="k-grow"><b>{c.event}</b><small>{c.detail}</small></span><small>{fmtDT(c.created_at)}</small></li>; })}{!comm.length && <li className="k-small">No activity yet.</li>}</ul></section>
      </aside>
    </div>
  </div>;
}
