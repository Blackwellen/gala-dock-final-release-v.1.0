import Link from "next/link";
import { LayoutDashboard, CreditCard, RotateCcw, Clock3, ShieldCheck, AlertTriangle, Sparkles, ArrowRight, List, LayoutGrid, ChevronDown, CheckCircle2, CircleDot, MoreHorizontal, Send } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { getMyEvent } from "@/lib/data/customer-events";
import { CuEventHeader } from "@/components/customer/event-header";
import { EventMenu } from "@/components/customer/events-client";
import { Beta, LineChart } from "@/components/kit";
import { money, dateShort, eventTypeLabel } from "@/lib/format";

export const metadata = { title: "Money" };
const TYPE_TONE: Record<string, string> = { venue: "blue", food: "pink", drinks: "pink", entertainment: "green", media: "purple", styling: "pink", transport: "blue", extras: "amber" };
const TYPE_LABEL: Record<string, string> = { venue: "Venue", food: "Catering", drinks: "Drinks", entertainment: "Entertainment", media: "Media", styling: "Styling", transport: "Transport", extras: "Extras" };
const SUB: Record<string, string> = { venue: "Venue hire", food: "Wedding catering", drinks: "Drinks & bar", entertainment: "Entertainment", media: "Photography", styling: "Flowers & styling", transport: "Guest transport", extras: "Miscellaneous" };

export default async function MoneyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]); const ctx = await getCustomer(); const d = await getMyEvent(ctx, id); const e = d.e;
  const tab = (["payments", "refunds"].includes(sp.tab ?? "") ? sp.tab : "overview") as "overview" | "payments" | "refunds";
  const items = d.items.filter(i => i.status !== "cancelled" && i.role !== "backup");
  const P = d.pays;
  const sumSt = (st: string[]) => items.filter(i => st.includes(i.status)).reduce((s, i) => s + Number(i.amount ?? 0), 0);
  const estimated = Number(e.budget_total ?? 0) || items.reduce((s, i) => s + Number(i.amount ?? 0), 0);
  const held = sumSt(["held"]), confirmed = sumSt(["confirmed", "fulfilled"]);
  const paid = P.filter(p => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);
  const due = P.filter(p => ["due", "overdue"].includes(p.status)).reduce((s, p) => s + Number(p.amount), 0);
  const refundable = P.filter(p => p.status === "paid" && p.refundable).reduce((s, p) => s + Number(p.amount), 0);
  const committed = held + confirmed;
  const next = P.filter(p => ["due", "overdue", "scheduled"].includes(p.status)).sort((a, b) => (a.due_at ?? "9").localeCompare(b.due_at ?? "9"));
  const nextDate = next[0]?.due_at?.slice(0, 10); const nextGroup = next.filter(p => p.due_at?.slice(0, 10) === nextDate);
  const seg = (v: number) => (estimated ? (100 * v) / estimated : 0);
  const legend = [["Estimated", estimated, "#c7cee0"], ["Held", held, "#fbbf24"], ["Confirmed", confirmed, "#2563eb"], ["Paid", paid, "#14b8a6"], ["Due", due, "#7c3aed"], ["Refundable", refundable, "#c7d2fe"]] as const;
  const months = Array.from({ length: 6 }, (_, i) => { const t = new Date(); t.setMonth(t.getMonth() - 2 + i); return t; });
  const cum = (f: (p: typeof P[number]) => boolean, at: Date) => P.filter(p => f(p) && new Date(p.paid_at ?? p.due_at ?? p.created_at) <= at).reduce((s, p) => s + Number(p.amount), 0);
  const base = `/account/events/${e.id}/money`;
  const rowsFor = items.map(i => { const ps = P.filter(p => p.build_item_id === i.id); const pd = ps.filter(p => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0); const nx = ps.filter(p => p.status !== "paid").sort((a, b) => (a.due_at ?? "9").localeCompare(b.due_at ?? "9"))[0];
    return { i, paid: pd, due: Math.max(0, Number(i.amount ?? 0) - pd), next: nx ? [nx.kind === "balance" ? "Final balance" : nx.kind === "deposit" ? "Payment due" : "Payment", nx.due_at] : i.status === "held" ? ["Confirm headcount", i.hold_expires_at] : i.status === "suggested" ? ["Optional", null] : ["Service date", e.starts_at] }; });
  return <div className="ce">
    <CuEventHeader d={d} tab="money" variant="compact" buildPath />
    <div className="mn-grid">
      <div className="k-col" style={{ gap: 12, minWidth: 0 }}>
        <div className="mn-tabsbar"><div className="gt-tabs" role="tablist">{([["overview", "Overview", LayoutDashboard], ["payments", "Payments", CreditCard], ["refunds", "Refunds", RotateCcw]] as const).map(([k, l, I]) => <Link key={k} role="tab" aria-selected={tab === k} href={k === "overview" ? base : `${base}?tab=${k}`}><I size={17} />{l}</Link>)}</div></div>
        {tab === "overview" && <section className="ce-card mn-budget"><div><h2 className="ce-h2" style={{ fontSize: 19 }}>Event budget</h2><p className="ce-sub">A clear view of your estimated, committed and remaining spend.</p>
            <div className="k-between" style={{ marginTop: 14 }}><span /><span className="mn-alloc">{estimated ? Math.round((100 * committed) / estimated) : 0}% allocated</span></div>
            <div className="mn-bar"><i style={{ width: `${seg(Math.max(0, estimated - committed - due))}%`, background: "#c7cee0" }} /><i style={{ width: `${seg(held)}%`, background: "#fbbf24" }} /><i style={{ width: `${seg(confirmed - paid)}%`, background: "#2563eb" }} /><i style={{ width: `${seg(paid)}%`, background: "#14b8a6" }} /><i style={{ width: `${seg(due)}%`, background: "#7c3aed" }} /><i style={{ width: `${seg(refundable)}%`, background: "#c7d2fe" }} /></div>
            <div className="mn-legend">{legend.map(([l, v, c]) => <span key={l}><i style={{ background: c }} /><span><b>{money(v)}</b><small>{l}</small></span></span>)}</div></div>
          <dl className="mn-totals">{([["Estimated total", estimated, ""], ["Total committed (held + confirmed)", committed, ""], ["Total paid", paid, "green"], ["Total due", due, "amber"], ["Potential refundable", refundable, "purple"]] as const).map(([l, v, t]) => <div key={l}><dt>{l}</dt><dd className={t}>{money(v)}</dd></div>)}</dl></section>}
        <section className="ce-card mn-table"><div className="k-between" style={{ marginBottom: 10 }}><div><h2 className="ce-h2" style={{ fontSize: 19 }}>{tab === "refunds" ? "Refunds" : "Provider costs & payments"}</h2><p className="ce-sub">{tab === "refunds" ? "Refundability depends on each provider's agreed terms — shown exactly as booked." : "Service breakdown, payment status and key dates for your event."}</p></div><div className="k-row" style={{ gap: 8 }}><span className="k-btn ghost">All providers <ChevronDown size={13} /></span><div className="k-seg solid"><span role="tab" aria-selected><List size={14} />List</span><span role="tab" aria-selected={false}><LayoutGrid size={14} />Cards</span></div></div></div>
          {tab === "refunds" ? <table className="k-table"><thead><tr><th>Provider</th><th className="num">Paid</th><th>Refundable</th><th>Terms</th></tr></thead><tbody>{P.filter(p => p.status === "paid").map(p => <tr key={p.id}><td style={{ color: "var(--k-ink)" }}>{p.payee}</td><td className="num">{money(p.amount)}</td><td>{p.refundable ? <span className="gt-st green"><i />Possibly refundable</span> : <span className="gt-st gray"><i />Non-refundable</span>}</td><td className="k-small">{p.refundable ? "Request via the provider; refunds follow their cancellation terms." : "Deposit retained under the booking terms."}</td></tr>)}</tbody></table>
          : <div className="k-table-wrap"><table className="k-table mn-t"><thead><tr><th>Provider / Service</th><th>Type</th><th>Package</th><th className="num">Total value</th><th className="num">Deposit / Hold</th><th className="num">Paid</th><th className="num">Due</th><th>Status</th><th>Next milestone</th><th>Actions</th></tr></thead>
            <tbody>{rowsFor.map(({ i, paid: pd, due: du, next: nx }) => <tr key={i.id}><td><span className="k-row" style={{ gap: 10 }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={i.image || "/assets/gd/sg-transport.webp"} alt="" className="mn-img" /><span><b className="gt-name">{i.title}</b><small className="gt-email">{SUB[i.category] ?? eventTypeLabel(i.category)}</small></span></span></td>
              <td><span className={`mn-type ${TYPE_TONE[i.category] ?? "gray"}`}>{TYPE_LABEL[i.category] ?? i.category}</span></td><td className="k-muted">{i.package}</td><td className="num">{money(i.amount)}</td><td className="num">{money(i.deposit)}</td>
              <td className="num">{pd ? <span className="k-row" style={{ gap: 5, justifyContent: "flex-end" }}><CheckCircle2 size={14} fill="#10b981" color="#fff" />{money(pd)}</span> : money(0)}</td><td className="num">{money(du)}</td>
              <td>{i.status === "confirmed" ? <span className="gt-st green"><i />Confirmed</span> : i.status === "held" ? <span className="gt-st blue"><i />Held</span> : i.status === "suggested" ? <span className="gt-st gray"><CircleDot size={11} />Not booked</span> : <span className="gt-st amber"><i />Pending</span>}</td>
              <td className="k-small"><b style={{ fontWeight: 500, color: "var(--k-ink-2)" }}>{nx[0]}</b><div className="k-muted">{nx[1] ? dateShort(nx[1] as string) : ""}</div></td>
              <td>{i.status === "suggested" ? <Link className="k-btn soft sm" href={`/account/events/${e.id}/build`}>Add +</Link> : <Link className="k-icon-btn plain" href={`/account/events/${e.id}/messages?listing=${i.listing_id ?? ""}`} aria-label="Options"><MoreHorizontal size={16} /></Link>}</td></tr>)}</tbody></table></div>}
          {tab === "payments" && <p className="k-xs k-muted" style={{ marginTop: 10 }}>Payment status comes from the payment provider. Receipts appear once a payment is confirmed — a redirect alone never marks something paid.</p>}</section>
      </div>
      <div className="k-col" style={{ gap: 12 }}>
        <section className="ce-card mn-next"><div className="k-row" style={{ gap: 14, alignItems: "flex-start" }}><span className="mn-clock"><Clock3 size={20} /></span><div className="k-grow"><b className="k-small" style={{ color: "var(--k-ink)" }}>Next payment due</b><div className="k-between" style={{ marginTop: 6 }}><b className="mn-amt">{money(nextGroup.reduce((s, p) => s + Number(p.amount), 0))}</b><span style={{ textAlign: "right" }}><span className="k-red k-xs">Due by {nextDate ? dateShort(`${nextDate}T12:00:00Z`) : "—"}</span><small className="k-xs k-muted" style={{ display: "block" }}>Covers {nextGroup.length} provider{nextGroup.length === 1 ? "" : "s"}</small></span></div></div></div>
          <Link className="k-btn primary block lg" style={{ marginTop: 12 }} href={`/account/events/${e.id}/book?step=2&pay=${nextGroup[0]?.id ?? ""}`}>Make a payment <ArrowRight size={15} /></Link></section>
        <section className="ce-card mn-protect"><span className="mn-shield"><ShieldCheck size={22} /></span><div><b>How your payments are handled</b><p>Payments are taken by our regulated payment provider and released to providers under each booking&apos;s agreed terms. Refunds depend on those terms.</p><Link className="k-link" href="/help">Learn about payments <ArrowRight size={12} /></Link></div></section>
        <section className="ce-card"><div className="k-between"><h2 className="ce-h2 sm" style={{ margin: 0 }}>Budget forecast</h2><Link className="k-link" href={base}>View details <ArrowRight size={12} /></Link></div>
          <div style={{ marginTop: 10 }}><LineChart series={[{ data: months.map(m => m <= new Date() ? cum(() => true, m) : null), color: "#2563eb", label: "Confirmed" }, { data: months.map(m => m <= new Date() ? cum(p => p.status === "paid", m) : null), color: "#10b981", label: "Paid" }, { data: months.map(m => cum(() => true, m) + (m > new Date() ? estimated * 0.08 : 0)), color: "#a5b4fc", label: "Forecast", fill: true }]} labels={months.map(m => m.toLocaleString("en-GB", { month: "short" }))} dashed={[2]} height={100} yFormat={v => (v >= 1000 ? `£${Math.round(v / 1000)}K` : `£${v}`)} /></div>
          <div className="k-row k-xs k-muted" style={{ gap: 14, marginTop: 8 }}><span className="k-row" style={{ gap: 4 }}><i className="k-dot" style={{ background: "#c7cee0" }} />Estimated</span><span className="k-row" style={{ gap: 4 }}><i className="k-dot" style={{ background: "#2563eb" }} />Confirmed</span><span className="k-row" style={{ gap: 4 }}><i className="k-dot" style={{ background: "#10b981" }} />Paid</span><span className="k-row" style={{ gap: 4 }}><i className="k-dot" style={{ background: "#a5b4fc" }} />Forecast</span></div></section>
        <section className="ce-card mn-cancel"><span className="mn-warn"><AlertTriangle size={26} /></span><div className="k-grow"><b>Cancellation impact</b><p>See what happens if you change or cancel.</p><div className="mn-cancel-btn"><EventMenu id={e.id} name={e.name} status={e.status} /><span>Preview cancellation impact <ArrowRight size={13} /></span></div></div></section>
        <section className="ce-card"><div className="k-row" style={{ gap: 8 }}><Sparkles size={20} className="k-blue" /><b style={{ fontSize: 15 }}>Gala Agent</b><Beta /></div><p className="k-small" style={{ marginTop: 6 }}>I can help you understand your costs, forecast the final spend, or explain refund options.</p>
          <div className="k-row k-wrap" style={{ gap: 6, margin: "10px 0" }}>{["Show me cost breakdown", "Can I reduce costs?", "Explain this charge"].map(x => <Link key={x} className="cb-ask" href={`${base}?ask=${encodeURIComponent(x)}`}>{x}</Link>)}</div>
          <form className="k-agent-ask" action={`/account/events/${e.id}/money`}><input name="ask" placeholder="Ask me anything about your event..." aria-label="Ask Gala Agent" /><button aria-label="Send"><Send size={13} /></button></form></section>
      </div>
    </div>
  </div>;
}
