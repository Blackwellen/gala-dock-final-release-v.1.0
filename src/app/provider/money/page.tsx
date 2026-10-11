import type { Metadata } from "next";
import { ConnectStatus } from "./_components/connect-status";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, Download, ChevronDown, PoundSterling, Wallet, Percent, CreditCard, FileText, CircleCheck, Sparkles, CalendarClock, ChevronRight, ArrowRight, Landmark, FileDown, PieChart,
  LifeBuoy, Settings2 } from "lucide-react";
import "@/styles/provider-money.css";
import { Kpi, Donut, Chip, Tabs, Empty } from "@/components/workspace/kit";
import { KpiNote } from "@/components/workspace/kpi-note";
import { money, day, requestTime, delta, titleCase } from "@/lib/workspace/format";
import { dailySeries } from "@/lib/provider/queries";
import { MenuButton } from "../_components/menu-button";
import { ParamSelect } from "../_components/param-select";
import { SearchParam } from "../_components/search-param";
import { loadMoney, periodRange, inRange, net, PERIODS, type Tx } from "./data";

export const metadata: Metadata = { title: "Money" };
const CAT_TONE = ["blue", "green", "purple", "orange", "red", "grey"] as const;

function EarningsChart({ days }: { days: { d: number; gross: number; fees: number; net: number }[] }) {
  const W = 760, H = 170, pad = { l: 44, r: 8, t: 8, b: 22 }, max = Math.max(1000, ...days.map(x => x.gross)) * 1.1, step = Math.pow(10, Math.floor(Math.log10(max / 3)));
  const tick = Math.ceil(max / 3 / step) * step, bw = (W - pad.l - pad.r) / days.length, y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / (tick * 3));
  const pts = days.map((x, i) => [pad.l + bw * (i + 0.5), y(x.net)]);
  return <svg viewBox={`0 0 ${W} ${H}`} className="pm-chart" role="img" aria-label="Daily gross, fees and net earnings">
    {[0, 1, 2, 3].map(k => <g key={k}><line x1={pad.l} x2={W - pad.r} y1={y(tick * k)} y2={y(tick * k)} className="pm-grid" /><text x={pad.l - 8} y={y(tick * k) + 3} textAnchor="end" className="pm-ax">£{(tick * k).toLocaleString("en-GB")}</text></g>)}
    <defs><linearGradient id="pm-gn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b7afd" /><stop offset="1" stopColor="#4580fd" /></linearGradient>
      <linearGradient id="pm-gf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6fb9fe" /><stop offset="1" stopColor="#3aa0fe" /></linearGradient></defs>
    {/* Stacked as in the design: net (bottom), platform fees & commission, then any remaining gross (e.g. tax/refunds) pale on top. */}
    {days.map((x, i) => { const bx = pad.l + bw * i + bw * 0.15, w = bw * 0.7, fees = Math.max(0, Math.min(x.fees, x.gross - x.net)), top = Math.max(x.gross, x.net + fees);
      return <g key={x.d}><title>{`${day(new Date(x.d + 12 * 36e5).toISOString(), { day: "numeric", month: "short" })}: gross ${money(x.gross)}, fees ${money(x.fees)}, net ${money(x.net)}`}</title>
      {top > 0 && <rect x={bx} y={y(top)} width={w} height={Math.max(0, y(0) - y(top))} rx={2} className="pm-bar-g" />}
      {x.net + fees > 0 && <rect x={bx} y={y(x.net + fees)} width={w} height={Math.max(0, y(0) - y(x.net + fees))} rx={2} fill="url(#pm-gf)" />}
      {x.net > 0 && <rect x={bx} y={y(x.net)} width={w} height={Math.max(0, y(0) - y(x.net))} rx={2} fill="url(#pm-gn)" />}</g>; })}
    <polyline points={pts.map(p => p.join(",")).join(" ")} className="pm-line" />{pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={2.4} className="pm-dot" />)}
    {days.map((x, i) => (i % 5 === 0 || i === days.length - 1) && <text key={`l${x.d}`} x={pad.l + bw * (i + 0.5)} y={H - 6} textAnchor="middle" className="pm-ax">{day(new Date(x.d + 12 * 36e5).toISOString(), { day: "numeric", month: "short" })}</text>)}
  </svg>;
}

export default async function MoneyPage(props: PageProps<"/provider/money">) {
  const sp = await props.searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? sp[k] as string : "");
  const tab = ["overview", "earnings", "payouts", "fees", "statements"].includes(str("tab")) ? str("tab") : "overview";
  const { ctx, txs, plans, schedule } = await loadMoney();
  const now = requestTime(), r = periodRange(str("period"), now);
  const income = (a: number, b: number) => txs.filter(t => ["income", "refund"].includes(t.kind) && inRange(t, a, b));
  const cur = income(r.from, r.to), prev = income(r.prevFrom, r.prevTo);
  const gross = (l: Tx[]) => l.reduce((a, t) => a + t.amount, 0), fees = (l: Tx[]) => l.reduce((a, t) => a + t.fee_amount, 0), nets = (l: Tx[]) => l.reduce((a, t) => a + net(t), 0);
  const g = gross(cur), f = fees(cur), n = nets(cur), eff = g ? (100 * f) / g : 0;
  const ws = ctx.workspace as unknown as { plan?: string; commission_bps?: number; settings?: { tax?: { vat_registered?: boolean; number?: string; rate_bps?: number } } };
  const planKey = ws.plan ?? "starter", bps = ws.commission_bps ?? plans[planKey]?.commission_bps ?? 1500, tax = ws.settings?.tax ?? {};
  // Upgrade estimate: last 30 days' gross at the next plan's rate, minus the monthly price difference.
  const g30 = gross(income(now - 30 * 864e5, now));
  const better = Object.entries(plans).filter(([, p]) => p.commission_bps < bps).map(([k, p]) => ({ k, p, save: Math.round((g30 * (bps - p.commission_bps)) / 10000 - (p.monthly - (plans[planKey]?.monthly ?? 0))) })).sort((a, b) => b.save - a.save)[0];
  const daysN = Math.min(92, Math.max(1, Math.round((Math.min(r.to, now + 864e5) - r.from) / 864e5)));
  const chart = Array.from({ length: daysN }, (_, i) => { const d = r.from + i * 864e5, l = cur.filter(t => inRange(t, d, d + 864e5)); return { d, gross: Math.max(0, gross(l)), fees: Math.max(0, fees(l)), net: Math.max(0, nets(l)) }; });
  const cats = Object.entries(cur.filter(t => t.kind === "income").reduce<Record<string, number>>((a, t) => { a[t.category] = (a[t.category] ?? 0) + t.amount; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const payouts = txs.filter(t => t.kind === "payout");
  const upcoming = payouts.filter(t => t.status !== "completed"), recent = payouts.filter(t => t.status === "completed").slice(0, 4);
  const q = str("q").toLowerCase(), type = str("type"), status = str("status");
  const list = txs.filter(t => (!q || `${t.description} ${t.counterparty} ${t.stripe_ref ?? ""}`.toLowerCase().includes(q)) && (!type || t.kind === type) && (!status || t.status === status) && (tab !== "overview" || inRange(t, r.from, r.to)));
  const months = [...new Set(txs.map(t => t.occurred_at.slice(0, 7)))].sort().reverse();
  const base = "/provider/money", qp = (extra = "") => `${base}?period=${r.key}${extra}`;
  const typeLabel = (t: Tx) => t.kind === "income" ? (t.category === "Services" ? "Service payment" : t.category === "Standby fee" ? "Standby fee" : "Booking payment") : t.kind === "refund" ? "Refund" : t.kind === "payout" ? "Payout" : "Fee";

  return <div className="pm">
    <header className="ws-page-head pm-head">
      <div><h1>Money</h1><p>Track your earnings, fees and payouts with full transparency.</p></div>
      <div className="ws-page-actions">
        <span className="pm-period"><CalendarDays aria-hidden="true" /><Suspense><ParamSelect param="period" label="Period" value={r.key} options={Object.entries(PERIODS).map(([k, l]) => ({ value: k, label: l }))} /></Suspense></span>
        <MenuButton label="Export" className="ws-btn primary pm-export" trigger={<><Download aria-hidden="true" />Export<ChevronDown aria-hidden="true" /></>} entries={[
          { kind: "link", label: "Transactions (CSV)", href: `${base}/export?period=${r.key}` }, { kind: "link", label: "Payouts (CSV)", href: `${base}/export?period=${r.key}&type=payout` },
          { kind: "link", label: "Monthly statement", href: `${base}/statement?month=${new Date(r.from + 864e5).toISOString().slice(0, 7)}` }]} />
      </div>
    </header>
    <Tabs base={qp()} active={tab} tabs={[{ key: "overview", label: "Overview" }, { key: "earnings", label: "Earnings" }, { key: "payouts", label: "Payouts" }, { key: "fees", label: "Fees" }, { key: "statements", label: "Statements" }]} />

    {(tab === "overview" || tab === "earnings" || tab === "fees") && <section className="ws-kpis pm-kpis">
      <Kpi icon={PoundSterling} tone="blue" label="Total booking value" value={money(g)} delta={delta(g, gross(prev))} deltaSuffix={`vs ${r.key === "month" ? "last month" : "previous"}`} series={dailySeries(cur, t => t.occurred_at, t => t.amount, 30, Math.min(now, r.to))} />
      <Kpi icon={Wallet} tone="green" label="Your earnings (net)" value={money(n)} delta={delta(n, nets(prev))} deltaSuffix={`vs ${r.key === "month" ? "last month" : "previous"}`} series={dailySeries(cur, t => t.occurred_at, t => net(t), 30, Math.min(now, r.to))} />
      <KpiNote icon={Percent} tone="red" label="Gala Dock commission" value={money(f)} note={`${eff.toFixed(0)}% effective rate`} />
      <KpiNote icon={CreditCard} tone="purple" label="Processing fees" value={money(0)} note="Included in commission" />
      <KpiNote icon={FileText} tone="blue" label="Taxes (where applicable)" value={tax.vat_registered ? `${(Number(tax.rate_bps ?? 2000) / 100).toFixed(0)}%` : "—"} note={tax.vat_registered ? `UK VAT registered${tax.number ? ` · ${tax.number}` : ""}` : "Not VAT registered"} />
    </section>}

    {tab === "overview" && <>
      <div className="pm-row1">
        <section className="ws-panel pm-chartbox"><div className="ws-panel-head"><h2>Earnings overview</h2><ul className="pm-legend"><li className="g">Gross booking value</li><li className="f">Fees &amp; commission</li><li className="n">Net earnings</li></ul></div>
          {g ? <EarningsChart days={chart} /> : <Empty icon={PoundSterling} title="No earnings in this period" text="Pick another period to see your earnings." />}</section>
        <section className="ws-panel pm-plan"><div className="pm-plan-h"><h2>Current plan</h2><span>{titleCase(planKey)} Plan</span></div><b>{(bps / 100).toFixed(0)}%</b><small>Platform commission</small>
          <Link href="/provider/settings?tab=billing" className="ws-btn outline block">Change plan</Link>
          <ul>{["Marketplace listing & requests", "Secure payments & payouts", planKey !== "starter" ? "Advanced analytics" : "Standard analytics", `Payouts ${schedule}`].map(x => <li key={x}><CircleCheck aria-hidden="true" />{x}</li>)}</ul></section>
        <section className="ws-panel pm-upgrade">{better && better.save > 0 ? <><h2><Sparkles aria-hidden="true" />Upgrade and save</h2><p>Based on your last 30 days, upgrading to {titleCase(better.k)} could save you:</p>
          <b>{money(better.save)}<small> / month</small></b><p>Estimated from {money(g30)} in bookings at {(better.p.commission_bps / 100).toFixed(0)}% commission, after the £{better.p.monthly}/month plan price.</p>
          <Link href="/provider/settings?tab=billing" className="ws-btn outline block">View plans</Link></>
          : <><h2><CircleCheck aria-hidden="true" />You’re on the best plan</h2><p>At your current volume no plan would lower your total costs.</p><Link href="/provider/settings?tab=billing" className="ws-btn outline block">View plans</Link></>}</section>
      </div>
      <div className="pm-row2">
        <section className="ws-panel pm-break"><h2>Earnings breakdown</h2>
          <div><Donut size={150} thickness={18} parts={cats.map(([l, v], i) => ({ label: l, value: v, tone: CAT_TONE[i % CAT_TONE.length] }))} center={<><b>{money(g)}</b><small>Total value</small></>} />
            <ul>{cats.map(([l, v], i) => <li key={l}><i className={CAT_TONE[i % CAT_TONE.length]} />{l}<b>{money(v)}</b><small>{g ? Math.round((100 * v) / g) : 0}%</small></li>)}</ul></div></section>
        <section className="ws-panel pm-pay"><div className="ws-panel-head"><h2>Upcoming payouts</h2><Link className="ws-link" href={qp("&tab=payouts")}>View all <ArrowRight aria-hidden="true" /></Link></div>
          <ConnectStatus workspaceId={ctx.workspace.id} canManage={ctx.role === "owner"} />
          {upcoming.length ? <ul>{upcoming.slice(0, 3).map(t => <li key={t.id}><span className="ic"><CalendarClock aria-hidden="true" /></span><span><b>{money(-t.amount)}</b><Chip tone={t.status === "pending" ? "blue" : "amber"}>{t.status === "pending" ? "Scheduled" : "Processing"}</Chip><small>Arrives {day(t.occurred_at, { day: "numeric", month: "short", year: "numeric" })}</small></span>
            <small>{t.description}</small><ChevronRight aria-hidden="true" /></li>)}</ul> : <p className="pv-none">No payouts scheduled — payouts run {schedule} once funds clear.</p>}</section>
        <section className="ws-panel pm-pay pm-recent"><div className="ws-panel-head"><h2>Recent payouts</h2><Link className="ws-link" href={qp("&tab=payouts")}>View all <ArrowRight aria-hidden="true" /></Link></div>
          <ul>{recent.map(t => <li key={t.id}><b>{money(-t.amount)}</b><Chip tone="green" dot>Paid</Chip><small>{day(t.occurred_at, { day: "numeric", month: "short", year: "numeric" })}</small><small>{t.stripe_ref ?? "—"}</small>
            <Link href={`${base}/statement?month=${t.occurred_at.slice(0, 7)}`} aria-label="Statement"><FileDown aria-hidden="true" /></Link></li>)}</ul></section>
      </div>
    </>}

    {tab === "statements" ? <section className="ws-panel pm-tx"><h2>Monthly statements</h2><table className="ws-table pm-table"><thead><tr><th>Month</th><th>Gross</th><th>Fees</th><th>Net</th><th>Payouts</th><th aria-label="Open" /></tr></thead>
      <tbody>{months.map(m => { const a = new Date(`${m}-01T00:00:00Z`).getTime(), b = new Date(new Date(a).setUTCMonth(new Date(a).getUTCMonth() + 1)).getTime(), l = income(a, b);
        return <tr key={m}><td><b>{new Date(a).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</b></td><td>{money(gross(l))}</td><td>{money(-fees(l))}</td><td>{money(nets(l))}</td>
          <td>{money(-payouts.filter(t => inRange(t, a, b)).reduce((x, t) => x + t.amount, 0))}</td><td><Link className="ws-link" href={`${base}/statement?month=${m}`}>Open statement</Link></td></tr>; })}</tbody></table></section>
    : tab === "fees" ? <section className="ws-panel pm-tx"><h2>Fee breakdown</h2><p className="pm-sub">Commission is taken from each booking payment at your plan rate ({(bps / 100).toFixed(0)}%). Refunds return the matching commission.</p>
      <table className="ws-table pm-table"><thead><tr><th>Category</th><th>Gross</th><th>Commission</th><th>Effective rate</th></tr></thead><tbody>{Object.entries(cur.reduce<Record<string, Tx[]>>((a, t) => { (a[t.category] ??= []).push(t); return a; }, {})).map(([c, l]) =>
        <tr key={c}><td><b>{c}</b></td><td>{money(gross(l))}</td><td>{money(-fees(l))}</td><td>{gross(l) ? ((100 * fees(l)) / gross(l)).toFixed(1) : "0.0"}%</td></tr>)}</tbody></table></section>
    : <section className="ws-panel pm-tx"><div className="pm-tx-head"><h2>{tab === "payouts" ? "Payouts" : "Recent transactions"}</h2>
      <div className="ws-toolbar pm-toolbar"><Suspense><SearchParam placeholder="Search transactions..." /></Suspense>
        <Suspense><ParamSelect param="type" label="Type" value={tab === "payouts" ? "payout" : type} options={[{ value: "", label: "All types" }, { value: "income", label: "Payments" }, { value: "refund", label: "Refunds" }, { value: "payout", label: "Payouts" }, { value: "fee", label: "Fees" }]} /></Suspense>
        <Suspense><ParamSelect param="status" label="Status" value={status} options={[{ value: "", label: "All statuses" }, { value: "completed", label: "Completed" }, { value: "pending", label: "Pending" }, { value: "failed", label: "Failed" }]} /></Suspense>
        <Link href={`${base}/export?period=${r.key}${type ? `&type=${type}` : ""}`} className="ws-btn outline pm-exp"><Download aria-hidden="true" />Export</Link></div></div>
      <table className="ws-table pm-table"><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Reference</th><th className="r">Gross amount</th><th className="r">Fees</th><th className="r">Net amount</th><th>Status</th></tr></thead>
        <tbody>{list.filter(t => tab !== "payouts" || t.kind === "payout").slice(0, tab === "overview" ? 6 : 100).map(t => <tr key={t.id}><td>{day(t.occurred_at, { day: "numeric", month: "short", year: "numeric" })}</td><td><b>{t.description}</b></td><td className="m">{typeLabel(t)}</td>
          <td className="m">{t.stripe_ref ?? "—"}</td><td className="r">{money(t.amount, "GBP", { cents: true })}</td><td className="r">{t.fee_amount ? money(-t.fee_amount, "GBP", { cents: true }) : "—"}</td><td className="r"><b>{money(net(t), "GBP", { cents: true })}</b></td>
          <td><Chip tone={t.status === "completed" ? "green" : t.status === "pending" ? "blue" : "red"} dot>{t.status === "completed" ? (t.kind === "payout" || t.kind === "income" ? "Paid" : "Completed") : titleCase(t.status)}</Chip></td></tr>)}</tbody></table>
      {!list.length && <p className="pv-none">No transactions match.</p>}</section>}

    {tab === "overview" && <aside className="ws-panel pm-quick"><h2>Quick actions</h2><ul>
      <li><Link href={qp("&tab=payouts")}><Landmark aria-hidden="true" /><span><b>Payouts</b><small>Automatic {schedule} payouts to your bank</small></span></Link></li>
      <li><Link href={`${base}/statement?month=${new Date(r.from + 864e5).toISOString().slice(0, 7)}`}><FileDown aria-hidden="true" /><span><b>Export statement</b><small>Download a detailed statement</small></span></Link></li>
      <li><Link href={qp("&tab=fees")}><PieChart aria-hidden="true" /><span><b>View fee breakdown</b><small>See how fees are calculated</small></span></Link></li>
      <li><Link href="/provider/messages"><LifeBuoy aria-hidden="true" /><span><b>Resolve an issue</b><small>Get support with a transaction</small></span></Link></li>
      <li><Link href="/provider/settings?tab=billing"><Settings2 aria-hidden="true" /><span><b>Manage subscription</b><small>Change plan or payment method</small></span></Link></li></ul></aside>}
  </div>;
}
