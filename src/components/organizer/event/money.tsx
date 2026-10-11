import Link from "next/link";
import { Wallet, TrendingUp, Receipt, PiggyBank, FileText, CreditCard, Scale, LineChart as LineIcon, BarChart3, Target, ShieldAlert, Ticket, Gift, Beer, CircleDollarSign, ArrowRight, Sparkles, CheckCircle2, Info } from "lucide-react";
import { Card, Chip, Bar, Donut, Legend, BarChart, Ring, Beta } from "@/components/kit";
import { AgentAsk } from "@/components/kit/client";
import { money, num, dateShort, pct } from "@/lib/format";
import type { ProEvent, EventData } from "@/lib/data/event";
import { SubTabs } from "./header";

const CAT_COLORS = ["#2563eb", "#7c3aed", "#ec4899", "#f97316", "#f59e0b", "#fb923c", "#06b6d4", "#94a3b8"];
// Build-item categories → budget lines.
const MAP: Record<string, string> = { venue: "Venue & Facilities", entertainment: "Artist & Entertainment", production: "Production & Technical", staging: "Production & Technical", security: "Staff & Crew", staff: "Staff & Crew", food: "Hospitality & Catering", drinks: "Hospitality & Catering", media: "Marketing & Promotion" };

export function eventFinance(e: ProEvent, d: EventData) {
  const lines = (e.settings.budget_lines as Record<string, number> | undefined) ?? {};
  const budget = Number(e.budget_total ?? Object.values(lines).reduce((s, v) => s + v, 0));
  const otherSources = (e.settings.revenue_sources as Record<string, number> | undefined) ?? {};
  const ticketRevenue = d.ticketRevenue; // recognised: issued entitlements at face value
  const otherIncome = d.otherIncome + Object.values(otherSources).reduce((s, v) => s + v, 0);
  const revenue = ticketRevenue + otherIncome;
  const forecastRevenue = Math.max(revenue, Number(e.revenue_goal ?? 0));
  const committedCosts = d.committed;
  const forecastCosts = Math.max(committedCosts, d.estimated, budget ? budget * 0.75 : 0);
  const actualCosts = d.costsActual;
  const avgPrice = d.sold ? ticketRevenue / d.sold : 0;
  const breakEven = avgPrice ? Math.ceil(Math.max(0, forecastCosts - otherIncome) / avgPrice) : 0;
  return {
    lines, budget, ticketRevenue, otherIncome, otherSources, revenue, forecastRevenue, committedCosts, forecastCosts, actualCosts, breakEven,
    forecastProfit: forecastRevenue - forecastCosts, committedProfit: revenue - committedCosts, actualProfit: revenue - actualCosts,
    committedByLine: Object.fromEntries(Object.keys(lines).map(k => [k, d.items.filter(b => (MAP[b.category] ?? "Other") === k && ["confirmed", "held", "fulfilled"].includes(b.status)).reduce((s, b) => s + Number(b.amount ?? 0), 0)])),
    actualByLine: Object.fromEntries(Object.keys(lines).map(k => [k, d.txs.filter(t => Number(t.amount) < 0 && (t.category === k || (k === "Production & Technical" && t.category === "Production"))).reduce((s, t) => s - Number(t.amount), 0) + d.payments.filter(p => p.status === "paid" && (MAP[d.items.find(b => b.id === p.build_item_id)?.category ?? ""] ?? "") === k).reduce((s, p) => s + Number(p.amount), 0)])),
  };
}

export function MoneyTab({ e, d, section }: { e: ProEvent; d: EventData; section: string }) {
  const base = `/organizer/events/${e.id}?tab=money`;
  const items = [["budget", "Budget", Wallet], ["revenue", "Revenue", TrendingUp], ["costs", "Costs", Receipt], ["deposits", "Deposits", PiggyBank], ["receivables", "Receivables", FileText], ["payables", "Payables", CreditCard], ["settlement", "Settlement", Scale], ["profit", "Profit", LineIcon], ["reports", "Reports", BarChart3]] as const;
  const s = items.some(i => i[0] === section) ? section : "budget";
  const f = eventFinance(e, d);
  return <>
    <SubTabs current={s} items={items.map(([k, l, I]) => ({ key: k, label: l, icon: I, href: k === "reports" ? `/organizer/money?tab=reports&event=${e.id}` : `${base}${k === "budget" ? "" : `&section=${k}`}` }))} />
    <MoneyKpis e={e} d={d} f={f} />
    {s === "budget" && <BudgetView e={e} d={d} f={f} />}
    {s === "revenue" && <RevenueView d={d} f={f} />}
    {s === "costs" && <CostTable d={d} f={f} />}
    {s === "deposits" && <PaymentsTable title="Deposits" rows={d.payments.filter(p => p.kind === "deposit")} />}
    {s === "payables" && <PaymentsTable title="Payables" rows={d.payments.filter(p => p.status !== "paid" && p.status !== "cancelled")} pay />}
    {s === "receivables" && <Receivables d={d} />}
    {s === "settlement" && <Settlement e={e} d={d} f={f} />}
    {s === "profit" && <ProfitView f={f} />}
  </>;
}

function MoneyKpis({ e, d, f }: { e: ProEvent; d: EventData; f: ReturnType<typeof eventFinance> }) {
  return <div className="k-grid k-g5 mo-kpis">
    <div className="k-kpi"><span className="k-tile lg green"><Wallet size={20} /></span><div className="k-grow"><div className="lbl">Total budget</div><div className="val">{money(f.budget)}</div><Bar value={pct(f.committedCosts, f.budget)} label="Budget committed" /><div className="sub k-between"><span>{pct(f.committedCosts, f.budget)}% committed</span><span>{money(Math.max(0, f.budget - f.committedCosts))} remaining</span></div></div></div>
    <div className="k-kpi"><span className="k-tile lg green"><TrendingUp size={20} /></span><div className="k-grow"><div className="lbl">Total revenue</div><div className="val">{money(f.revenue)}</div><Bar value={pct(f.revenue, f.forecastRevenue)} tone="green" label="Revenue vs forecast" /><div className="sub">{pct(f.revenue, f.forecastRevenue)}% of {money(f.forecastRevenue)} forecast</div></div></div>
    <div className="k-kpi"><span className="k-tile lg red"><Receipt size={20} /></span><div className="k-grow"><div className="lbl">Total costs (committed)</div><div className="val">{money(f.committedCosts)}</div><Bar value={pct(f.committedCosts, f.forecastCosts)} label="Costs committed" /><div className="sub k-between"><span>{pct(f.committedCosts, f.forecastCosts)}% of forecast</span><span>{money(f.actualCosts)} paid</span></div></div></div>
    <div className="k-kpi"><span className="k-tile lg green"><TrendingUp size={20} /></span><div><div className="lbl">Forecast profit</div><div className={`val ${f.forecastProfit >= 0 ? "k-green" : "k-red"}`}>{money(f.forecastProfit)}</div><div className="sub k-green">{f.forecastRevenue ? Math.round((100 * f.forecastProfit) / f.forecastRevenue) : 0}% margin</div></div></div>
    <div className="k-kpi"><span className="k-tile lg"><Target size={20} /></span><div className="k-grow"><div className="lbl">Break-even</div><div className="val">{num(f.breakEven)} tickets</div><Bar value={pct(d.sold, f.breakEven || 1)} label="Progress to break-even" /><div className="sub">{f.breakEven ? `${Math.min(999, pct(d.sold, f.breakEven))}% to break-even` : "Add ticket prices to compute"}</div></div></div>
  </div>;
}

function BudgetView({ e, d, f }: { e: ProEvent; d: EventData; f: ReturnType<typeof eventFinance> }) {
  const entries = Object.entries(f.lines).sort((a, b) => b[1] - a[1]);
  const months = Array.from({ length: 5 }, (_, i) => { const dt = new Date(); dt.setMonth(dt.getMonth() - 4 + i); return dt.toISOString().slice(0, 7); });
  const mRev = months.map(m => d.txs.filter(t => t.occurred_at.startsWith(m) && Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0) + d.series.filter(x => x.day.startsWith(m)).reduce((s, x) => s + Number(x.gross), 0));
  const mCost = months.map(m => d.txs.filter(t => t.occurred_at.startsWith(m) && Number(t.amount) < 0).reduce((s, t) => s - Number(t.amount), 0) + d.payments.filter(p => p.status === "paid" && p.paid_at?.startsWith(m)).reduce((s, p) => s + Number(p.amount), 0));
  const outstanding = d.payments.filter(p => !["paid", "cancelled", "refunded"].includes(p.status));
  const received = d.ticketRevenue + d.otherIncome, pending = d.invoices.filter(i => !["paid", "cancelled", "credited"].includes(i.status)).reduce((s, i) => s + Number(i.total) - Number(i.amount_paid), 0), overdue = d.payments.filter(p => p.status === "overdue").reduce((s, p) => s + Number(p.amount), 0);
  const srcParts = [{ label: "Ticket sales", value: f.ticketRevenue, color: "#2563eb" }, ...Object.entries(f.otherSources).map(([l, v], i) => ({ label: l, value: v, color: ["#ec4899", "#f59e0b", "#94a3b8"][i % 3]! }))];
  return <>
    <div className="mo-row2">
      <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Budget breakdown</h3><Link className="k-link" href={`/organizer/events/${e.id}?tab=money&section=costs`}>View full budget <ArrowRight size={12} /></Link></div>
        <div className="k-row" style={{ gap: 18, marginTop: 10, alignItems: "center" }}><Donut size={170} stroke={30} parts={entries.map(([l, v], i) => ({ label: l, value: v, color: CAT_COLORS[i % 8]! }))} label={money(f.budget)} sub="Total budget" />
          <div className="k-grow"><Legend items={entries.map(([l, v], i) => ({ color: CAT_COLORS[i % 8]!, label: l, extra: `${pct(v, f.budget)}%`, value: money(v) }))} /></div></div>
        {!entries.length && <p className="k-small">No budget lines yet — set them in the Create Event commercial step or edit the event budget.</p>}</Card>
      <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Revenue vs costs vs profit</h3><span className="k-btn ghost sm">Monthly</span></div>
        <div className="k-row k-xs" style={{ gap: 14, margin: "8px 0" }}><span className="k-row" style={{ gap: 4 }}><i className="k-dot" style={{ background: "#2563eb" }} />Revenue</span><span className="k-row" style={{ gap: 4 }}><i className="k-dot" style={{ background: "#ec4899" }} />Costs</span><span className="k-row" style={{ gap: 4 }}><i className="k-dot" style={{ background: "#10b981" }} />Profit</span></div>
        <BarChart labels={months.map(m => new Date(`${m}-01T12:00:00Z`).toLocaleString("en-GB", { month: "short" }))} series={[mRev, mCost, mRev.map((r, i) => Math.max(0, r - mCost[i]!))]} colors={["#2563eb", "#ec4899", "#10b981"]} height={170} yFormat={v => (v >= 1000 ? `£${Math.round(v / 1000)}K` : `£${v}`)} /></Card>
      <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Financial summary</h3><Link className="k-link" href={`/organizer/events/${e.id}?tab=money&section=revenue`}>View all <ArrowRight size={12} /></Link></div>
        <div className="k-list">{[[Ticket, "Ticket revenue", `${num(d.sold)} / ${num(d.cap)} sold`, f.ticketRevenue, "green"], ...Object.entries(f.otherSources).map(([l, v]) => [l === "Sponsorship" ? Gift : Beer, l, l === "Sponsorship" ? "Confirmed sponsors" : "Forecast", v, l === "Sponsorship" ? "red" : "amber"]), [CircleDollarSign, "Other income", "Ledger income", d.otherIncome, "blue"]].map(([I, l, sub, v, t]) => { const Icon = I as typeof Ticket; return <div key={l as string} className="k-li"><span className={`k-tile sm ${t as string}`}><Icon size={14} /></span><div className="k-grow"><b className="k-small k-strong">{l as string}</b><div className="k-xs k-muted">{sub as string}</div></div><b className="k-small k-tnum">{Number(v) ? money(Number(v)) : "–"}</b></div>; })}</div></Card>
    </div>
    <div className="mo-row3">
      <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Recent transactions</h3><Link className="k-link" href={`/organizer/money?tab=transactions&event=${e.id}`}>All transactions <ArrowRight size={12} /></Link></div>
        <table className="k-table" style={{ marginTop: 6 }}><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Category</th><th className="num">Amount</th><th>Status</th></tr></thead><tbody>{[...d.txs.map(t => ({ at: t.occurred_at, type: Number(t.amount) >= 0 ? "Payment" : "Invoice", desc: t.description, cat: t.category, amt: Number(t.amount), st: t.status })), ...d.payments.filter(p => p.status === "paid").map(p => ({ at: p.paid_at ?? p.created_at, type: "Payment", desc: `${p.payee} ${p.kind}`, cat: "Supplier", amt: -Number(p.amount), st: "completed" }))].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6).map((t, i) => <tr key={i}><td>{dateShort(t.at)}</td><td>{t.type}</td><td style={{ color: "var(--k-ink)" }}>{t.desc}</td><td>{t.cat}</td><td className={`num ${t.amt >= 0 ? "k-green" : "k-red"}`}>{t.amt >= 0 ? "+" : "-"}{money(Math.abs(t.amt), "GBP", { decimals: true })}</td><td><Chip tone={t.st === "completed" ? "green" : "amber"}>{t.st === "completed" ? "Paid" : t.st}</Chip></td></tr>)}</tbody></table></Card>
      <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Outstanding amounts</h3><Link className="k-link" href={`/organizer/events/${e.id}?tab=money&section=payables`}>View all <ArrowRight size={12} /></Link></div>
        <div className="k-row" style={{ gap: 6, margin: "8px 0" }}><Chip tone="blue" lg>Receivables {d.invoices.filter(i => !["paid", "cancelled", "credited"].includes(i.status)).length}</Chip><Chip tone="gray" lg>Payables {outstanding.length}</Chip></div>
        <div className="k-list">{outstanding.slice(0, 3).map(p => <div key={p.id} className="k-li"><span className="k-tile sm red"><CreditCard size={13} /></span><div className="k-grow"><b className="k-small k-strong">{p.payee}</b></div><div style={{ textAlign: "right" }}><b className="k-small k-tnum">{money(p.amount)}</b><div className="k-xs k-muted">Due {p.due_at ? dateShort(p.due_at) : "—"}</div></div><Link className="k-btn outline sm" href={`/organizer/money?tab=payables&payment=${p.id}`}>Pay</Link></div>)}{!outstanding.length && <p className="k-small">Nothing outstanding.</p>}</div></Card>
      <Card><h3 className="ov-h" style={{ fontSize: 15 }}>Payment progress</h3><div className="k-row" style={{ gap: 16, marginTop: 12 }}><Ring value={pct(received, received + pending + overdue)} size={120} stroke={14} color="var(--k-green)" label={`${pct(received, received + pending + overdue)}%`} sub="Received" fontSize={22} /><ul className="k-col" style={{ gap: 8, listStyle: "none", margin: 0, padding: 0, fontSize: 12 }}><li><i className="k-dot tone-dot-green" /> <b>{money(received)}</b> <span className="k-muted">Received</span></li><li><i className="k-dot tone-dot-amber" /> <b>{money(pending)}</b> <span className="k-muted">Pending</span></li><li><i className="k-dot tone-dot-red" /> <b>{money(overdue)}</b> <span className="k-muted">Overdue</span></li></ul></div></Card>
    </div>
    <div className="mo-row3">
      <CostTable d={d} f={f} compact />
      <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Revenue by source</h3></div><div className="k-row" style={{ gap: 16, marginTop: 10 }}><Donut size={130} stroke={18} parts={srcParts} label={money(f.revenue)} sub="Total revenue" /><div className="k-grow"><Legend items={srcParts.map(p => ({ color: p.color, label: p.label, extra: `${pct(p.value, f.revenue)}%`, value: money(p.value) }))} /></div></div></Card>
      <section className="k-agent"><div className="k-agent-head"><Sparkles size={18} className="k-spark" /><h3>Gala Agent</h3><Beta /></div><p>I can help you manage the financial side of this event:</p><ul className="pl-agent-list">{["Review budget vs actuals", "Find cost savings opportunities", "Track outstanding payments", "Prepare settlement report", "Forecast final profit"].map(x => <li key={x}><CheckCircle2 size={15} className="k-green" />{x}</li>)}</ul><AgentAsk scope="organizer" eventId={e.id} placeholder="Ask about event finances..." /></section>
    </div>
  </>;
}

function CostTable({ d, f, compact }: { d: EventData; f: ReturnType<typeof eventFinance>; compact?: boolean }) {
  const entries = Object.entries(f.lines).sort((a, b) => b[1] - a[1]);
  return <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Cost categories</h3></div>
    <table className="k-table" style={{ marginTop: 6 }}><thead><tr><th>Category</th><th className="num">Budget</th><th className="num">Committed</th><th className="num">Actual</th><th className="num">Remaining</th><th>%</th></tr></thead><tbody>{entries.slice(0, compact ? 5 : 50).map(([k, v]) => { const c = f.committedByLine[k] ?? 0, a = f.actualByLine[k] ?? 0; return <tr key={k}><td style={{ color: "var(--k-ink)" }}>{k}</td><td className="num">{money(v)}</td><td className="num">{money(c)}</td><td className="num">{money(a)}</td><td className="num">{money(v - c)}</td><td style={{ minWidth: 90 }}><Bar value={pct(c, v)} tone={c > v ? "red" : undefined} label={`${k} committed`} /></td></tr>; })}</tbody></table>
    {!compact && <div className="k-notice" style={{ marginTop: 12 }}><Info size={15} className="k-blue" /><span>Committed = confirmed, held and fulfilled bookings. Actual = paid supplier payments and ledger costs. Budget lines come from the event&apos;s commercial plan.</span></div>}
    {!compact && <h3 className="ov-h" style={{ margin: "14px 0 6px" }}>Bookings by provider</h3>}
    {!compact && <table className="k-table"><thead><tr><th>Provider</th><th>Category</th><th>Status</th><th className="num">Amount</th><th className="num">Deposit</th></tr></thead><tbody>{d.items.filter(b => b.amount != null).map(b => <tr key={b.id}><td style={{ color: "var(--k-ink)" }}>{b.title}</td><td style={{ textTransform: "capitalize" }}>{b.category}</td><td>{b.status}</td><td className="num">{money(b.amount)}</td><td className="num">{money(b.deposit)}</td></tr>)}</tbody></table>}</Card>;
}

function PaymentsTable({ title, rows, pay }: { title: string; rows: EventData["payments"]; pay?: boolean }) {
  return <Card flush><div style={{ padding: "14px 16px" }}><h3 className="ov-h" style={{ fontSize: 15 }}>{title}</h3><p className="k-small">Payment status comes from the payment provider. A redirect alone never marks something paid.</p></div>
    <table className="k-table"><thead><tr><th>Payee</th><th>Type</th><th className="num">Amount</th><th>Due</th><th>Status</th><th>Refundable</th>{pay && <th />}</tr></thead><tbody>{rows.map(p => <tr key={p.id}><td style={{ color: "var(--k-ink)" }}>{p.payee}</td><td style={{ textTransform: "capitalize" }}>{p.kind}</td><td className="num">{money(p.amount)}</td><td>{p.due_at ? dateShort(p.due_at) : "—"}</td><td><Chip tone={p.status === "paid" ? "green" : p.status === "overdue" ? "red" : p.status === "due" ? "amber" : "blue"}>{p.status}</Chip></td><td>{p.refundable ? "Yes" : "No"}</td>{pay && <td><Link className="k-btn outline sm" href={`/organizer/money?tab=payables&payment=${p.id}`}>Pay</Link></td>}</tr>)}</tbody></table>
    {!rows.length && <p className="k-small" style={{ padding: 16 }}>Nothing here.</p>}</Card>;
}

function Receivables({ d }: { d: EventData }) {
  return <Card flush><div className="k-between" style={{ padding: "14px 16px" }}><h3 className="ov-h" style={{ fontSize: 15 }}>Receivables</h3><Link className="k-btn primary sm" href="/organizer/money/invoices/new?step=1">Create invoice</Link></div>
    <table className="k-table"><thead><tr><th>Invoice</th><th>Client</th><th className="num">Total</th><th className="num">Paid</th><th>Due</th><th>Status</th></tr></thead><tbody>{d.invoices.map(i => <tr key={i.id}><td><Link className="k-link" href={`/organizer/money/invoices/${i.id}`}>{i.number}</Link></td><td>{i.client_name}</td><td className="num">{money(i.total)}</td><td className="num">{money(i.amount_paid)}</td><td>{i.due_date ? dateShort(`${i.due_date}T12:00:00Z`) : "—"}</td><td><Chip tone={i.status === "paid" ? "green" : i.status === "overdue" ? "red" : "blue"}>{i.status}</Chip></td></tr>)}</tbody></table>
    {!d.invoices.length && <p className="k-small" style={{ padding: 16 }}>No invoices linked to this event.</p>}</Card>;
}

function RevenueView({ d, f }: { d: EventData; f: ReturnType<typeof eventFinance> }) {
  return <Card><h3 className="ov-h" style={{ fontSize: 15 }}>Revenue</h3><table className="k-table" style={{ marginTop: 8 }}><thead><tr><th>Tier / source</th><th className="num">Price</th><th className="num">Sold</th><th className="num">Gross</th></tr></thead><tbody>{d.tiers.map(t => <tr key={t.id}><td style={{ color: "var(--k-ink)" }}>{t.name}</td><td className="num">{money(t.price, "GBP", { decimals: true })}</td><td className="num">{num(t.sold)}</td><td className="num">{money(t.sold * Number(t.price))}</td></tr>)}{Object.entries(f.otherSources).map(([l, v]) => <tr key={l}><td style={{ color: "var(--k-ink)" }}>{l}</td><td /><td /><td className="num">{money(v)}</td></tr>)}<tr><td><b>Total</b></td><td /><td className="num"><b>{num(d.sold)}</b></td><td className="num"><b>{money(f.revenue)}</b></td></tr></tbody></table>
    <p className="k-xs k-muted" style={{ marginTop: 10 }}>Gross ticket revenue at face value. Platform and payment processing fees are deducted at settlement and shown there.</p></Card>;
}

function Settlement({ e, d, f }: { e: ProEvent; d: EventData; f: ReturnType<typeof eventFinance> }) {
  const platformFee = Math.round(f.ticketRevenue * 0.03 * 100) / 100, processing = Math.round((f.ticketRevenue * 0.014 + d.sold * 0.2) * 100) / 100;
  const refunds = d.txs.filter(t => t.kind === "refund").reduce((s, t) => s - Number(t.amount), 0);
  const net = f.ticketRevenue - platformFee - processing - refunds;
  const done = ["completed", "closed"].includes(e.status);
  return <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Ticketing settlement</h3><Chip tone={done ? "amber" : "gray"}>{done ? "Ready to settle" : "Opens after the event"}</Chip></div>
    <table className="k-table" style={{ marginTop: 10, maxWidth: 560 }}><tbody>{([["Gross ticket sales", f.ticketRevenue], ["Gala Dock platform fee (est. 3%)", -platformFee], ["Card processing (est. 1.4% + 20p)", -processing], ["Refunds", -refunds]] as const).map(([l, v]) => <tr key={l}><td>{l}</td><td className={`num ${v < 0 ? "k-red" : ""}`}>{money(v, "GBP", { decimals: true })}</td></tr>)}<tr><td><b>Estimated organizer payout</b></td><td className="num"><b>{money(net, "GBP", { decimals: true })}</b></td></tr></tbody></table>
    <div className="k-notice" style={{ marginTop: 12 }}><Info size={15} className="k-blue" /><span>Estimates only. Final fees, tax and payout amounts come from Stripe Connect when the payout is created and appear in Money › Settlements.</span></div></Card>;
}

function ProfitView({ f }: { f: ReturnType<typeof eventFinance> }) {
  return <Card><h3 className="ov-h" style={{ fontSize: 15 }}>Profitability</h3><div className="k-grid k-g3" style={{ marginTop: 12 }}>{([["Forecast profit", f.forecastProfit, "Forecast revenue − forecast costs"], ["Committed profit", f.committedProfit, "Recognised revenue − committed costs"], ["Actual profit", f.actualProfit, "Recognised revenue − actual paid costs"]] as const).map(([l, v, h]) => <div key={l} className="k-kpi"><div><div className="lbl">{l}</div><div className={`val ${v >= 0 ? "k-green" : "k-red"}`}>{money(v)}</div><div className="sub">{h}</div></div></div>)}</div>
    <div className="k-notice" style={{ marginTop: 12 }}><ShieldAlert size={15} className="k-blue" /><span>Cash flow and profitability are reported separately. Revenue is recognised at ticket issue (face value); tax liabilities depend on your jurisdiction settings and aren&apos;t included above.</span></div></Card>;
}
