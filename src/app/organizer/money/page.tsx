import Link from "next/link";
import { CheckCircle2, Ticket, Handshake, FileWarning, CalendarClock, BarChart3, ArrowRight, Clock, ArrowDownLeft, ArrowUpRight, RotateCcw, FileText, Lock } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { Crumbs, LinkTabs, BarChart } from "@/components/kit";
import { MoneyFilters, InvoiceRowMenu } from "@/components/organizer/money-client";
import { money } from "@/lib/format";

export const metadata = { title: "Money" };
const TZ = "Europe/London";
const COLORS = ["#2563eb", "#a855f7", "#f87171", "#fb923c", "#94a3b8"];
const IST: Record<string, [string, string]> = { draft: ["Draft", "gray"], sent: ["Sent", "blue"], viewed: ["Viewed", "blue"], partial: ["Partial", "blue"], paid: ["Paid", "green"], overdue: ["Overdue", "red"], cancelled: ["Cancelled", "gray"], credited: ["Credited", "gray"] };

export default async function MoneyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const ctx = await getOrganizer(); const sb = ctx.supabase; const ws = ctx.workspace.id;
  if (!ctx.canMoney) return <div className="k-card mn-lock"><Lock size={22} /><h1>Money is restricted</h1><p>Ask a workspace owner to give you Finance access to view revenue, costs and invoices.</p><Link className="k-btn outline" href="/organizer">Back to home</Link></div>;
  const tab = ["receivables", "payables", "transactions", "settlements", "reports"].includes(sp.tab ?? "") ? sp.tab! : "overview";
  const now = new Date();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1)).toISOString().slice(0, 10);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : now.toISOString().slice(0, 10);
  const span = Date.parse(to) - Date.parse(from); const prevFrom = new Date(Date.parse(from) - span).toISOString().slice(0, 10);
  const [{ data: tx }, { data: inv }, { data: events }, { data: allPays }] = await Promise.all([
    sb.from("transactions").select("id,occurred_at,description,kind,category,amount,status,event_id,counterparty").eq("workspace_id", ws).gte("occurred_at", prevFrom).lte("occurred_at", `${to}T23:59:59Z`).order("occurred_at", { ascending: false }).limit(1000),
    sb.from("invoices").select("id,number,client_name,event_id,due_date,total,amount_paid,status,issue_date").eq("workspace_id", ws).order("due_date"),
    sb.from("events").select("id,name,starts_at,venue_name,cover_image,budget_total,settings").eq("workspace_id", ws).neq("status", "archived"),
    sb.from("payments").select("id,event_id,payee,kind,amount,status,due_at").in("status", ["due", "scheduled", "overdue"]).order("due_at").limit(40),
  ]);
  const evIds = new Set((events ?? []).map(e => e.id)); const pays = (allPays ?? []).filter(p => evIds.has(p.event_id));
  const evName = (id: string | null) => (events ?? []).find(e => e.id === id)?.name ?? "—";
  const scopeEv = sp.event ?? "";
  const T = (tx ?? []).filter(t => !scopeEv || t.event_id === scopeEv); const cur = T.filter(t => t.occurred_at >= from), prev = T.filter(t => t.occurred_at < from);
  const sum = (a: typeof T, f: (t: typeof T[number]) => boolean) => a.filter(f).reduce((s, t) => s + Number(t.amount), 0);
  const income = (t: typeof T[number]) => t.kind === "income"; const cost = (t: typeof T[number]) => t.kind === "payment" || t.kind === "fee";
  const revenue = sum(cur, income), prevRev = sum(prev, income), ticket = sum(cur, t => income(t) && /ticket/i.test(t.category)), prevTicket = sum(prev, t => income(t) && /ticket/i.test(t.category));
  const costs = -sum(cur, cost), prevCosts = -sum(prev, cost), refunds = -sum(cur, t => t.kind === "refund");
  const I = (inv ?? []).filter(i => !scopeEv || i.event_id === scopeEv);
  const unpaid = I.filter(i => ["sent", "viewed", "partial", "overdue"].includes(i.status)); const unpaidAmt = unpaid.reduce((s, i) => s + Number(i.total) - Number(i.amount_paid), 0);
  const in30 = (pays ?? []).filter(p => p.due_at && Date.parse(p.due_at) < now.getTime() + 30 * 864e5 && (!scopeEv || p.event_id === scopeEv));
  const profit = revenue - costs - refunds; const margin = revenue ? Math.round((profit / revenue) * 100) : 0;
  const pct = (a: number, b: number) => b ? Math.round(((a - b) / Math.abs(b)) * 100) : null;
  // Monthly revenue vs costs.
  const months: string[] = []; for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1)) months.push(d.toISOString().slice(0, 7));
  const mRev = months.map(m => sum(cur, t => income(t) && t.occurred_at.startsWith(m))), mCost = months.map(m => -sum(cur, t => cost(t) && t.occurred_at.startsWith(m)));
  // Profitability by event.
  const byEv = (events ?? []).map(e => { const r = sum(cur, t => income(t) && t.event_id === e.id), c = -sum(cur, t => cost(t) && t.event_id === e.id); return { e, r, p: r - c, m: r ? Math.round(((r - c) / r) * 100) : 0 }; }).filter(x => x.r || x.p).sort((a, b) => b.p - a.p).slice(0, 5);
  // Income breakdown.
  const cats = new Map<string, number>(); for (const t of cur.filter(income)) { const k = /ticket/i.test(t.category) ? "Ticket sales" : /sponsor/i.test(t.category) ? "Sponsorship" : /vendor/i.test(t.category) ? "Vendor fees" : /bar|f&b|food/i.test(t.category) ? "Bar & F&B" : "Other"; cats.set(k, (cats.get(k) ?? 0) + Number(t.amount)); }
  const breakdown = ["Ticket sales", "Sponsorship", "Vendor fees", "Bar & F&B", "Other"].map((k, i) => ({ k, v: cats.get(k) ?? 0, c: COLORS[i]! })).filter(x => x.v > 0);
  let acc = 0; const stops = breakdown.map(b => { const a = acc; acc += revenue ? (b.v / revenue) * 100 : 0; return `${b.c} ${a}% ${acc}%`; }).join(", ");
  // P&L by cost category vs event budget lines.
  const budgets = new Map<string, number>(); for (const e of (events ?? []).filter(e => !scopeEv || e.id === scopeEv)) for (const [k, v] of Object.entries(((e.settings as Record<string, unknown>)?.budget_lines ?? {}) as Record<string, number>)) budgets.set(k, (budgets.get(k) ?? 0) + Number(v));
  const costCats = new Map<string, number>(); for (const t of cur.filter(cost)) costCats.set(t.category, (costCats.get(t.category) ?? 0) - Number(t.amount));
  const pl = [...costCats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const budgetRev = (events ?? []).filter(e => !scopeEv || e.id === scopeEv).reduce((s, e) => s + Number(((e.settings as Record<string, unknown>)?.revenue_target as number) ?? 0), 0);
  const fmtD = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
  const delta = (d: number | null, inverse = false) => d == null ? null : <span className={(d >= 0) !== inverse ? "mn-up" : "mn-down"}>{d >= 0 ? "↑" : "↓"} {Math.abs(d)}%</span>;
  const href = (p: Record<string, string | undefined>) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries({ tab: tab === "overview" ? undefined : tab, from: sp.from, to: sp.to, event: sp.event, ...p })) if (v) u.set(k, v); return `/organizer/money${u.size ? `?${u}` : ""}`; };
  const txRows = tab === "transactions" ? cur : cur.slice(0, 8);
  const TX: Record<string, [typeof ArrowDownLeft, string]> = { income: [ArrowDownLeft, "green"], payment: [ArrowUpRight, "red"], fee: [ArrowUpRight, "red"], refund: [RotateCcw, "red"], payout: [ArrowUpRight, "blue"] };

  return <div className="mn">
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Money" }]} />
    <div className="k-page-head"><div className="k-grow"><h1>Money</h1><p className="sub">Track revenue, costs, invoices and profitability across all events.</p></div><MoneyFilters from={from} to={to} event={scopeEv} events={(events ?? []).map(e => ({ id: e.id, name: e.name }))} exportHref="/api/export/transactions" /></div>
    <LinkTabs current={tab} tabs={[["overview", "Overview"], ["receivables", "Receivables"], ["payables", "Payables"], ["transactions", "Transactions"], ["settlements", "Settlements"], ["reports", "Reports"]].map(([k, l]) => ({ key: k, label: l, href: href({ tab: k === "overview" ? undefined : k }) }))} />
    <div className="mn-kpis">
      <div className="k-card mn-kpi"><span className="mn-ki green"><CheckCircle2 size={20} /></span><span><small>Total revenue</small><b>{money(revenue)}</b>{delta(pct(revenue, prevRev))}<em>vs. previous period</em></span></div>
      <div className="k-card mn-kpi"><span className="mn-ki blue"><Ticket size={20} /></span><span><small>Ticket revenue</small><b>{money(ticket)}</b>{delta(pct(ticket, prevTicket))}<em>vs. previous period</em></span></div>
      <div className="k-card mn-kpi"><span className="mn-ki purple"><Handshake size={20} /></span><span><small>Provider commitments</small><b>{money(costs)}</b>{delta(pct(costs, prevCosts), true)}<em>confirmed costs</em></span></div>
      <div className="k-card mn-kpi"><span className="mn-ki red"><FileWarning size={20} /></span><span><small>Unpaid invoices</small><b className="k-red">{money(unpaidAmt)}</b><em>{unpaid.length} outstanding</em></span></div>
      <div className="k-card mn-kpi"><span className="mn-ki amber"><CalendarClock size={20} /></span><span><small>Upcoming deposits</small><b>{money(in30.reduce((s, p) => s + Number(p.amount), 0))}</b><em>{in30.length} due in next 30 days</em></span></div>
      <div className="k-card mn-kpi"><span className="mn-ki blue"><BarChart3 size={20} /></span><span><small>{profit >= 0 ? "Profit" : "Loss"} (period)</small><b className={profit < 0 ? "k-red" : ""}>{money(profit)}</b><em className={margin >= 0 ? "k-green" : "k-red"}>{margin}% margin</em></span></div>
    </div>
    {tab === "overview" && <div className="mn-r1">
      <section className="k-card mn-c"><div className="k-between"><h2>Revenue vs costs</h2><span className="mn-sel">Monthly</span></div><BarChart height={170} labels={months.map(m => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }))} series={[mRev, mCost]} colors={["#2563eb", "#c4b5fd"]} yFormat={v => v >= 1000 ? `£${Math.round(v / 1000)}k` : `£${v}`} /><div className="mn-legend"><span><i style={{ background: "#2563eb" }} />Revenue</span><span><i style={{ background: "#c4b5fd" }} />Costs</span></div></section>
      <section className="k-card mn-c"><div className="k-between"><h2>Profitability by event</h2><Link className="k-link" href={href({ tab: "reports" })}>View all <ArrowRight size={13} /></Link></div><ul className="mn-prof">{byEv.map(x => <li key={x.e.id}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={x.e.cover_image || "/assets/gd/oe-neon.webp"} alt="" /><span className="k-grow"><Link href={`/organizer/events/${x.e.id}?tab=money`}><b>{x.e.name}</b></Link><small>{x.e.starts_at ? fmtD(x.e.starts_at) : ""}{x.e.venue_name ? ` · ${x.e.venue_name}` : ""}</small></span><span className="mn-pb"><b className={x.p < 0 ? "k-red" : ""}>{money(x.p)}</b><span className="mn-bar"><i style={{ width: `${Math.max(0, Math.min(100, x.m))}%`, background: x.m >= 35 ? "#12a26b" : x.m >= 20 ? "#f59e0b" : "#e11d48" }} /></span></span><em>{x.m}%</em></li>)}{!byEv.length && <li className="k-small">No event income in this period.</li>}</ul></section>
      <section className="k-card mn-c"><h2>Income breakdown</h2><div className="mn-donut-row"><div className="mn-donut" style={{ background: stops ? `conic-gradient(${stops})` : "#e6ecf5" }}><span><b>{money(revenue)}</b><small>Total revenue</small></span></div><ul>{breakdown.map(b => <li key={b.k}><i style={{ background: b.c }} /><span>{b.k}</span><em>{revenue ? Math.round((b.v / revenue) * 100) : 0}%</em><b>{money(b.v)}</b></li>)}</ul></div></section>
    </div>}
    <div className={`mn-r2 ${tab !== "overview" ? "solo" : ""}`}>
      {(tab === "overview" || tab === "transactions") && <section className="k-card mn-c"><div className="k-between"><h2>{tab === "transactions" ? "Transactions" : "Recent transactions"}</h2>{tab === "overview" && <Link className="k-link" href={href({ tab: "transactions" })}>View all <ArrowRight size={13} /></Link>}</div>
        <table className="mn-t"><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Event</th><th>Amount</th><th>Status</th></tr></thead><tbody>{txRows.map(t => { const [Ic, tone] = TX[t.kind] ?? [ArrowUpRight, "gray"]; return <tr key={t.id}><td>{fmtD(t.occurred_at)}</td><td>{t.description}</td><td><span className={`mn-type ${tone}`}><Ic size={13} />{t.kind[0]!.toUpperCase() + t.kind.slice(1)}</span></td><td>{evName(t.event_id)}</td><td className={Number(t.amount) < 0 ? "mn-neg" : ""}>{Number(t.amount) < 0 ? "-" : ""}{money(Math.abs(Number(t.amount)))}</td><td><span className={`mn-st ${t.status === "completed" ? "green" : t.status === "pending" ? "amber" : "blue"}`}>{t.status === "completed" ? <CheckCircle2 size={11} /> : <Clock size={11} />}{t.status[0]!.toUpperCase() + t.status.slice(1)}</span></td></tr>; })}{!txRows.length && <tr><td colSpan={6} className="k-small">No transactions in this period.</td></tr>}</tbody></table></section>}
      {(tab === "overview" || tab === "receivables") && <section className="k-card mn-c"><div className="k-between"><h2>{tab === "receivables" ? "Invoices" : "Outstanding invoices"}</h2><span className="k-row" style={{ gap: 10 }}><Link className="k-btn primary sm" href="/organizer/money/invoices/new">New invoice</Link>{tab === "overview" && <Link className="k-link" href={href({ tab: "receivables" })}>View all <ArrowRight size={13} /></Link>}</span></div>
        <table className="mn-t"><thead><tr><th>Invoice</th><th>Client / Provider</th><th>Event</th><th>Due date</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>{(tab === "receivables" ? I : I.filter(i => !["paid", "cancelled", "credited"].includes(i.status))).slice(0, tab === "receivables" ? 100 : 5).map(i => { const st = i.status !== "paid" && i.due_date && i.due_date < to && ["sent", "viewed", "partial"].includes(i.status) ? "overdue" : i.status; const [sl, tone] = IST[st] ?? [st, "gray"]; return <tr key={i.id}><td><Link href={`/organizer/money/invoices/${i.id}`}>{i.number}</Link></td><td>{i.client_name}</td><td>{evName(i.event_id)}</td><td>{i.due_date ? fmtD(i.due_date) : "—"}</td><td>{money(Number(i.total))}</td><td><span className={`mn-st ${tone}`}>{sl}</span></td><td><InvoiceRowMenu id={i.id} status={i.status} /></td></tr>; })}{!I.length && <tr><td colSpan={7} className="k-small">No invoices yet.</td></tr>}</tbody></table></section>}
      {(tab === "overview" || tab === "settlements" || tab === "payables") && <section className="k-card mn-c"><div className="k-between"><h2>{tab === "payables" ? "Payables" : tab === "settlements" ? "Settlements & upcoming payments" : "Upcoming payments & deposits"}</h2></div>
        <table className="mn-t"><thead><tr><th>Date</th><th>Description</th><th>Event</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead><tbody>{(pays ?? []).filter(p => !scopeEv || p.event_id === scopeEv).slice(0, tab === "overview" ? 4 : 40).map(p => { const soon = p.due_at && Date.parse(p.due_at) < now.getTime() + 7 * 864e5; return <tr key={p.id}><td>{p.due_at ? fmtD(p.due_at) : "—"}</td><td>{p.payee} {p.kind}</td><td>{evName(p.event_id)}</td><td><span className="mn-type blue"><FileText size={12} />{p.kind[0]!.toUpperCase() + p.kind.slice(1)}</span></td><td className="mn-neg">-{money(Number(p.amount))}</td><td><span className={`mn-st ${p.status === "overdue" ? "red" : soon ? "amber" : "blue"}`}><Clock size={11} />{p.status === "overdue" ? "Overdue" : soon ? "Due soon" : "Scheduled"}</span></td></tr>; })}{!(pays ?? []).length && <tr><td colSpan={6} className="k-small">Nothing scheduled.</td></tr>}</tbody></table></section>}
      {(tab === "overview" || tab === "reports") && <section className="k-card mn-c"><div className="k-between"><h2>Profit &amp; loss summary</h2><a className="k-link" href="/api/export/transactions">Export <ArrowRight size={13} /></a></div>
        <table className="mn-t mn-pl"><thead><tr><th>Category</th><th>Budget</th><th>Actual</th><th>Variance</th><th>% of revenue</th></tr></thead><tbody>
          <tr className="b"><td>Total Revenue</td><td>{budgetRev ? money(budgetRev) : "—"}</td><td>{money(revenue)}</td><td className={revenue - budgetRev >= 0 ? "k-green" : "k-red"}>{budgetRev ? `${revenue - budgetRev >= 0 ? "+" : "-"}${money(Math.abs(revenue - budgetRev))}` : "—"}</td><td>100%</td></tr>
          {pl.map(([k, v]) => { const b = budgets.get(k) ?? 0; return <tr key={k}><td>{k}</td><td>{b ? money(b) : "—"}</td><td>{money(v)}</td><td className={b && v > b ? "k-red" : "k-green"}>{b ? `${v - b > 0 ? "+" : "-"}${money(Math.abs(v - b))}` : "—"}</td><td>{revenue ? Math.round((v / revenue) * 100) : 0}%</td></tr>; })}
          <tr className="b"><td>Net Profit</td><td /><td>{money(profit)}</td><td /><td>{margin}%</td></tr></tbody></table></section>}
    </div>
  </div>;
}
