import Link from "next/link";
import { Suspense } from "react";
import { UrlSelect } from "@/components/customer/url-select";
import { LayoutDashboard, CreditCard, RotateCcw, Clock3, ShieldCheck, AlertTriangle, ArrowRight, List, LayoutGrid, CheckCircle2, CircleDot, MoreHorizontal, CircleHelp } from "lucide-react";
import { HelpCard } from "@/components/customer/help-card";
import { getCustomer } from "@/lib/data/context";
import { getMyEvent } from "@/lib/data/customer-events";
import { CuEventHeader } from "@/components/customer/event-header";
import { EventMenu } from "@/components/customer/events-client";
import { LineChart } from "@/components/kit";
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
  const providerF = sp.provider ?? "", layout = sp.layout === "cards" ? "cards" : "list";
  const lq = (patch: Record<string, string | null>) => { const n = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]); for (const [k, v] of Object.entries(patch)) { if (v === null) n.delete(k); else n.set(k, v); } return `${base}${n.size ? `?${n}` : ""}`; };
  const rowsFor = items.filter(i => !providerF || i.id === providerF).map(i => { const ps = P.filter(p => p.build_item_id === i.id); const pd = ps.filter(p => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0); const nx = ps.filter(p => p.status !== "paid").sort((a, b) => (a.due_at ?? "9").localeCompare(b.due_at ?? "9"))[0];
    return { i, paid: pd, due: Math.max(0, Number(i.amount ?? 0) - pd), next: nx ? [nx.kind === "balance" ? "Final balance" : nx.kind === "deposit" ? "Payment due" : "Payment", nx.due_at] : i.status === "held" ? ["Confirm headcount", i.hold_expires_at] : i.status === "suggested" ? ["Optional", null] : ["Service date", e.starts_at] }; });
  return <div className="ce">
    <CuEventHeader d={d} tab="money" variant="compact" buildPath />
    <div className="mn-grid">
      <div className="k-col" style={{ gap: 12, minWidth: 0 }}>
        <div className="mn-tabsbar"><div className="gt-tabs" role="group" aria-label="Sections">{([["overview", "Overview", LayoutDashboard], ["payments", "Payments", CreditCard], ["refunds", "Refunds", RotateCcw]] as const).map(([k, l, I]) => <Link key={k} aria-current={(tab === k) ? "page" : undefined} href={k === "overview" ? base : `${base}?tab=${k}`}><I size={17} />{l}</Link>)}</div></div>
        {tab === "overview" && <section className="ce-card mn-budget"><div><h2 className="ce-h2" style={{ fontSize: 19 }}>Event budget</h2><p className="ce-sub">A clear view of your estimated, committed and remaining spend.</p>
            <div className="k-between" style={{ marginTop: 14 }}><span /><span className="mn-alloc">{estimated ? Math.round((100 * committed) / estimated) : 0}% allocated</span></div>
            <div className="mn-bar"><i style={{ width: `${seg(Math.max(0, estimated - committed - due))}%`, background: "#c7cee0" }} /><i style={{ width: `${seg(held)}%`, background: "#fbbf24" }} /><i style={{ width: `${seg(confirmed - paid)}%`, background: "#2563eb" }} /><i style={{ width: `${seg(paid)}%`, background: "#14b8a6" }} /><i style={{ width: `${seg(due)}%`, background: "#7c3aed" }} /><i style={{ width: `${seg(refundable)}%`, background: "#c7d2fe" }} /></div>
            <div className="mn-legend">{legend.map(([l, v, c]) => <span key={l}><i style={{ background: c }} /><span><b>{money(v)}</b><small>{l}</small></span></span>)}</div></div>
          <dl className="mn-totals">{([["Estimated total", estimated, ""], ["Total committed (held + confirmed)", committed, ""], ["Total paid", paid, "green"], ["Total due", due, "amber"], ["Potential refundable", refundable, "purple"]] as const).map(([l, v, t]) => <div key={l}><dt>{l}</dt><dd className={t}>{money(v)}</dd></div>)}</dl></section>}
        <section className="ce-card mn-table"><div className="k-between" style={{ marginBottom: 10 }}><div><h2 className="ce-h2" style={{ fontSize: 19 }}>{tab === "refunds" ? "Refunds" : "Provider costs & payments"}</h2><p className="ce-sub">{tab === "refunds" ? "Refundability depends on each provider's agreed terms — shown exactly as booked." : "Service breakdown, payment status and key dates for your event."}</p></div><div className="k-row" style={{ gap: 8 }}><Suspense><UrlSelect param="provider" value={providerF} label="Filter by provider" options={[{ value: "", label: "All providers" }, ...items.map(i => ({ value: i.id, label: i.title }))]} /></Suspense><div className="k-seg solid" role="group" aria-label="Layout"><Link href={lq({ layout: null })} aria-current={layout === "list" ? "page" : undefined} scroll={false}><List size={14} />List</Link><Link href={lq({ layout: "cards" })} aria-current={layout === "cards" ? "page" : undefined} scroll={false}><LayoutGrid size={14} />Cards</Link></div></div></div>
          {tab === "refunds" ? <table className="k-table"><thead><tr><th>Provider</th><th className="num">Paid</th><th>Refundable</th><th>Terms</th></tr></thead><tbody>{P.filter(p => p.status === "paid").map(p => <tr key={p.id}><td style={{ color: "var(--k-ink)" }}>{p.payee}</td><td className="num">{money(p.amount)}</td><td>{p.refundable ? <span className="gt-st green"><i />Possibly refundable</span> : <span className="gt-st gray"><i />Non-refundable</span>}</td><td className="k-small">{p.refundable ? "Request via the provider; refunds follow their cancellation terms." : "Deposit retained under the booking terms."}</td></tr>)}</tbody></table>
          : layout === "cards" ? <div className="mn-cards">{rowsFor.map(({ i, paid: pd, due: du, next: nx }) => <article key={i.id} className="mn-card">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={i.image || "/assets/gd/sg-transport.webp"} alt="" />
              <div className="mn-card-b"><span className={`mn-type ${TYPE_TONE[i.category] ?? "gray"}`}>{TYPE_LABEL[i.category] ?? i.category}</span><b>{i.title}</b><small>{i.package}</small>
                <dl><div><dt>Total</dt><dd>{money(i.amount)}</dd></div><div><dt>Paid</dt><dd>{money(pd)}</dd></div><div><dt>Due</dt><dd>{money(du)}</dd></div></dl>
                <p className="k-xs k-muted">{nx[0]}{nx[1] ? ` · ${new Date(nx[1] as string).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</p></div></article>)}</div>
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
        <HelpCard icon={CircleHelp} title="Costs & refunds" text="Where your money goes, what’s protected and how refunds work." links={[{ href: `${base}?tab=payments`, label: "Payment schedule" }, { href: `${base}?tab=refunds`, label: "Refunds" }, { href: "/help", label: "How payment protection works" }]} />
      </div>
    </div>
  </div>;
}
