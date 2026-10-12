import Link from "next/link";
import { Suspense } from "react";
import { ShoppingCart, Layers, Ticket, Store, Upload, Plus, ArrowRight, CircleCheck, Clock3, CircleX, RotateCcw, Disc3, Hourglass, TriangleAlert, Coins, MessageSquareWarning,
  CalendarX, Wrench, Filter, Building2, BadgeAlert, CalendarDays, Landmark, type LucideIcon } from "lucide-react";
import { Donut, Restricted, Sparkline, type Tone } from "@/components/workspace/kit";
import { ActionButton } from "@/components/workspace/actions";
import { requireAdminPermission } from "@/lib/admin/context";
import { money, delta, day, time } from "@/lib/workspace/format";
import { Head, Kpi, TabBar, Pill, Pager, Bars, Delta, dayBuckets, buckets } from "../_b/kit";
import { ParamSelect, SearchParam, Menu } from "../_b/ui";
import { retryPayout, cancelMoneyRequest } from "../_b/actions";
import { shortDay, stamp } from "../_b/format";
import { loadLedger, PERIODS, periodOf, gmv, platformRevenue, bySource, typeOf, statusOf, net, isSale, type Tx } from "./data";

const TYPE_ICON: Record<string, [LucideIcon, string]> = {
  "Ticket Sale": [Ticket, "blue"], "Venue Booking": [Store, "purple"], "Supplier Service": [Wrench, "purple"], Subscription: [Layers, "purple"], Refund: [RotateCcw, "red"],
  Payout: [Coins, "amber"], "Failed Payment": [CircleX, "red"], Dispute: [Disc3, "blue"], "Other fees": [Building2, "grey"],
};
const FILTERS = [["all", "All"], ["marketplace", "Marketplace"], ["ticketing", "Ticketing"], ["subscription", "Subscriptions"], ["refund", "Refunds"], ["payout", "Payouts"], ["dispute", "Disputes"]] as const;
function matches(t: Tx, f: string) {
  if (f === "all") return true;
  if (f === "refund") return t.kind === "refund";
  if (f === "payout") return t.kind === "payout";
  if (f === "dispute") return !!t.details.disputed;
  return t.source === f && t.kind !== "refund" && t.kind !== "payout" && !t.details.disputed;
}

export async function CommerceView({ sp, tab: forced }: { sp: Record<string, string | string[] | undefined>; tab?: string }) {
  const { db, allowed } = await requireAdminPermission("commerce");
  if (!allowed) return <Restricted area="Commerce" />;
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] as string : "");
  const tab = forced ?? (["marketplace", "ticketing", "subscriptions", "exceptions"].includes(s("tab")) ? s("tab") : "marketplace");
  const period = periodOf(s("period")), days = PERIODS[period]!.days;
  const { cur, prev, requests, now } = await loadLedger(db, days);
  const base = (t: string) => t === "payouts" ? `/admin/commerce/payouts?period=${period}` : `/admin/commerce?period=${period}${t === "marketplace" ? "" : `&tab=${t}`}`;
  const series = (fn: (t: Tx) => number, keep: (t: Tx) => boolean) => buckets(cur.filter(keep), t => t.occurred_at, fn, days, 10, now);
  const sale = (src?: string) => (t: Tx) => isSale(t) && (!src || (t.kind === "income" && t.source === src));

  const G = gmv(cur), P = platformRevenue(cur), TK = bySource(cur, "ticketing"), MK = bySource(cur, "marketplace");
  const kpis = <section className="adb-kpis adc-kpis">
    <Kpi icon={ShoppingCart} tone="green" label={`Total GMV (${period})`} value={money(G)} delta={delta(G, gmv(prev))} suffix={`vs last ${days} days`} series={series(t => t.amount, sale())} />
    <Kpi icon={Layers} tone="purple" label={`Platform Revenue (${period})`} value={money(P)} delta={delta(P, platformRevenue(prev))} suffix={`vs last ${days} days`} series={series(t => t.source === "subscription" ? t.amount : t.fee_amount, sale())} />
    <Kpi icon={Ticket} tone="blue" label={`Ticket Revenue (${period})`} value={money(TK)} delta={delta(TK, bySource(prev, "ticketing"))} suffix={`vs last ${days} days`} series={series(t => t.amount, sale("ticketing"))} />
    <Kpi icon={ShoppingCart} tone="orange" label={`Marketplace Revenue (${period})`} value={money(MK)} delta={delta(MK, bySource(prev, "marketplace"))} suffix={`vs last ${days} days`} series={series(t => t.amount, sale("marketplace"))} />
  </section>;

  const head = <Head title="Commerce" subtitle="Operate marketplace payments, commission, payouts, subscriptions and ticket fees."
    actions={<>
      <span className="adb-psel"><CalendarDays aria-hidden="true" /><Suspense><ParamSelect param="period" label="Period" value={period} options={Object.entries(PERIODS).map(([value, p]) => ({ value, label: p.label }))} /></Suspense></span>
      <Link className="adb-btn" href="/admin/commerce/vat">VAT</Link>
      <Link className="adb-btn" href={`/admin/commerce/export?period=${period}`}><Upload aria-hidden="true" />Export</Link>
      <Link className="adb-btn primary" href={`/admin/commerce/export?period=${period}&kind=summary`}><Plus aria-hidden="true" />Generate report</Link>
    </>} />;
  const tabs = <TabBar active={tab} tabs={[{ key: "marketplace", label: "Marketplace", href: base("marketplace") }, { key: "ticketing", label: "Ticketing", href: base("ticketing") }, { key: "payouts", label: "Payouts", href: base("payouts") },
    { key: "subscriptions", label: "Subscriptions", href: base("subscriptions") }, { key: "exceptions", label: "Exceptions", href: base("exceptions") }]} />;

  // ── Exceptions & queues ──
  const failed = (l: Tx[]) => l.filter(t => t.status === "failed" && t.kind !== "payout" && t.source !== "subscription");
  const held = (l: Tx[]) => l.filter(t => t.details.held);
  const refunds = (l: Tx[]) => l.filter(t => t.kind === "refund");
  const disputes = (l: Tx[]) => l.filter(t => t.details.disputed);
  const subIssues = (l: Tx[]) => l.filter(t => t.source === "subscription" && t.status === "failed");
  const payoutFails = (l: Tx[]) => l.filter(t => t.kind === "payout" && t.status !== "completed");
  const pendingRefundReqs = requests.filter(r => r.kind === "refund" && r.status === "pending");
  const queues: [LucideIcon, Tone, string, number, number, string, string][] = [
    [TriangleAlert, "red", "Failed Payments", failed(cur).length, failed(prev).length, "Requires action", "failed"],
    [Hourglass, "orange", "Held Funds", held(cur).length, held(prev).length, "Under review", "held"],
    [RotateCcw, "purple", "Refund Requests", refunds(cur).length + pendingRefundReqs.length, refunds(prev).length, "Awaiting review", "refund"],
    [MessageSquareWarning, "blue", "Disputes", disputes(cur).length, disputes(prev).length, "Needs response", "dispute"],
    [CalendarX, "red", "Subscription Issues", subIssues(cur).length, subIssues(prev).length, "Payment failures", "subscription"],
    [BadgeAlert, "orange", "Payout Failures", payoutFails(cur).length, payoutFails(prev).length, "Retry / investigate", "payout"],
  ];

  if (tab === "payouts") return <div className="adb adc">{head}{tabs}<PayoutsView cur={cur} prev={prev} requests={requests} period={period} days={days} /></div>;

  // ── Charts ──
  const chartDays = Math.min(days, 30);
  const bucket = (keep: (t: Tx) => boolean, val: (t: Tx) => number) => dayBuckets(cur.filter(keep), t => t.occurred_at, val, chartDays, now);
  const tkB = bucket(sale("ticketing"), t => t.amount), mkB = bucket(sale("marketplace"), t => t.amount), pfB = bucket(t => isSale(t) && t.source !== "subscription", t => t.fee_amount), subB = bucket(sale("subscription"), t => t.amount);
  const labels = Array.from({ length: chartDays }, (_, i) => shortDay(now - (chartDays - 1 - i) * 864e5));
  const cats: [string, number, Tone][] = [["Ticket sales", TK, "blue"], ["Venue bookings", cur.filter(t => isSale(t) && t.category === "Venue Booking").reduce((a, t) => a + t.amount, 0), "purple"],
    ["Supplier services", cur.filter(t => isSale(t) && t.category === "Supplier Service").reduce((a, t) => a + t.amount, 0), "teal"], ["Subscriptions", bySource(cur, "subscription"), "orange"],
    ["Other fees", cur.filter(t => isSale(t) && t.kind === "fee").reduce((a, t) => a + t.amount, 0), "grey"]];
  const health: [LucideIcon, string, string, number][] = [
    [CircleCheck, "green", "Successful", cur.filter(t => ["income", "payment"].includes(t.kind) && t.status === "completed" && !t.details.held && !t.details.disputed).length],
    [Clock3, "amber", "Pending/Processing", cur.filter(t => t.status === "pending" && !t.details.held).length],
    [CircleX, "red", "Failed", cur.filter(t => t.status === "failed").length],
    [RotateCcw, "purple", "Refunded", refunds(cur).length],
    [Disc3, "blue", "Disputed", disputes(cur).length],
    [Hourglass, "grey", "Held (review)", held(cur).length],
  ];
  const hTotal = health.reduce((a, h) => a + h[3], 0) || 1;
  const subsCur = cur.filter(t => t.source === "subscription" && t.kind === "income" && t.status !== "failed"), subsPrev = prev.filter(t => t.source === "subscription" && t.kind === "income" && t.status !== "failed");
  const subCount = (l: Tx[]) => l.reduce((a, t) => a + Number(t.details.subscriptions ?? 1), 0), cancelled = (l: Tx[]) => l.reduce((a, t) => a + Number(t.details.cancelled ?? 0), 0);
  const mrr = (l: Tx[]) => l.reduce((a, t) => a + t.amount, 0);

  // ── Ledger table ──
  const f = FILTERS.some(([k]) => k === s("f")) ? s("f") : tab === "ticketing" ? "ticketing" : tab === "subscriptions" ? "subscription" : "all";
  const q = s("q").toLowerCase(), page = Math.max(1, Number(s("page")) || 1), per = 8;
  const exc = s("exc");
  const excFilter = (t: Tx) => {
    if (!exc) return true;
    if (exc === "failed") return failed([t]).length > 0;
    if (exc === "held") return !!t.details.held;
    if (exc === "refund") return t.kind === "refund";
    if (exc === "dispute") return !!t.details.disputed;
    if (exc === "subscription") return subIssues([t]).length > 0;
    if (exc === "payout") return payoutFails([t]).length > 0;
    return true;
  };
  const st = s("st");
  const list = cur.filter(t => matches(t, f) && (!st || statusOf(t).key === st) && (tab !== "exceptions" || failed([t]).length || t.details.held || t.details.disputed || subIssues([t]).length || payoutFails([t]).length || t.kind === "refund") && excFilter(t)
    && (!q || `${t.description} ${t.counterparty} ${t.stripe_ref ?? ""} ${t.details.reference ?? ""}`.toLowerCase().includes(q)));
  const lp = (extra: Record<string, string | number>) => { const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]); for (const [k, v] of Object.entries(extra)) { if (v === "" || v === "all") u.delete(k); else u.set(k, String(v)); } return `/admin/commerce?${u}`; };

  return <div className="adb adc">
    {head}{tabs}{kpis}
    <div className="adc-row2">
      <section className="adb-panel adc-gmv">
        <div className="adb-sec-h"><h2>Revenue &amp; GMV Overview</h2><span className="adc-mini">{PERIODS[period]!.label}</span></div>
        <Bars width={530} height={140} labels={labels} format={v => v >= 1000 ? `£${Math.round(v / 1000)}K` : `£${v}`} gap={0.45}
          data={tkB.map((_, i) => ({ parts: [{ value: subB[i]!, color: "#f5a524" }, { value: pfB[i]!, color: "#14b8a6" }, { value: tkB[i]!, color: "#4f7cff" }, { value: mkB[i]!, color: "#9b6bff" }] }))} />
        <ul className="adb-keys adc-keys"><li><i style={{ background: "#2f6bff" }} />Ticketing GMV</li><li><i style={{ background: "#8b3dff" }} />Marketplace GMV</li><li><i style={{ background: "#14b8a6" }} />Platform revenue</li><li><i style={{ background: "#f5a524" }} />Subscription revenue</li></ul>
      </section>
      <section className="adb-panel adc-break">
        <h2>Revenue Breakdown <small>({period})</small></h2>
        <div className="adc-break-b">
          <Donut size={156} thickness={22} parts={cats.map(([label, value, tone]) => ({ label, value, tone }))} center={<><b>{money(G)}</b><small>Total GMV</small></>} />
          <ul className="adb-legend">{cats.map(([l, v, tone]) => <li key={l}><i className={`adc-dot ${tone}`} /><span>{l}</span><em>{G ? Math.round((100 * v) / G) : 0}%</em><b>{money(v)}</b></li>)}</ul>
        </div>
      </section>
      <section className="adb-panel adc-health">
        <div className="adb-sec-h"><h2>Payment Health</h2><Link className="adb-link" href={base("exceptions")}>View all <ArrowRight aria-hidden="true" /></Link></div>
        <ul>{health.map(([Icon, tone, label, count]) => <li key={label}><Icon aria-hidden="true" className={`adc-h ${tone}`} /><span>{label}</span><b>{count.toLocaleString("en-GB")}</b><em className={tone}>{((100 * count) / hTotal).toFixed(1)}%</em></li>)}</ul>
      </section>
    </div>
    <div className="adc-row3">
      <section className="adb-panel adc-queues">
        <div className="adb-sec-h"><h2>Queues &amp; Exceptions</h2><Link className="adb-link" href={base("exceptions")}>View all <ArrowRight aria-hidden="true" /></Link></div>
        <div className="adc-q">{queues.map(([Icon, tone, label, c, p, cap, key]) => <Link key={label} href={`${base("exceptions")}&exc=${key}`} className="adc-qc">
          <span className={`adc-qi ${tone}`}><Icon aria-hidden="true" /></span><span><small>{label}</small><b>{c}</b><Delta value={delta(c, p)} invert /><em>{cap}</em></span></Link>)}</div>
      </section>
      <section className="adb-panel adc-subs">
        <div className="adb-sec-h"><h2>Subscription Overview</h2><Link className="adb-link" href={base("subscriptions")}>View all <ArrowRight aria-hidden="true" /></Link></div>
        <div className="adc-subs-g">
          <div><b>{subCount(subsCur).toLocaleString("en-GB")}</b><small>Active subscriptions</small><Delta value={delta(subCount(subsCur), subCount(subsPrev))} /></div>
          <div><b>{money(mrr(subsCur))}</b><small>MRR ({period})</small><Delta value={delta(mrr(subsCur), mrr(subsPrev))} /></div>
          <span className="adc-subs-spark"><Sparkline values={buckets(subsCur, t => t.occurred_at, t => t.amount, days, 10, now).map((v, i, a) => a.slice(0, i + 1).reduce((x, y) => x + y, 0))} width={96} height={42} /></span>
          <div><b>{subIssues(cur).length}</b><small>Past due</small><Delta value={delta(subIssues(cur).length, subIssues(prev).length)} invert /></div>
          <div><b>{cancelled(subsCur)}</b><small>Cancelled ({period})</small><Delta value={delta(cancelled(subsCur), cancelled(subsPrev))} invert /></div>
        </div>
      </section>
    </div>
    <section className="adb-panel adc-tx">
      <div className="adc-tx-h">
        <h2>{tab === "exceptions" ? "Exceptions" : "Recent Transactions"}</h2>
        <nav className="adc-seg" aria-label="Transaction type">{FILTERS.map(([k, l]) => <Link key={k} href={lp({ f: k, page: "" })} className={f === k ? "on" : ""} aria-current={f === k ? "true" : undefined} scroll={false}>{l}</Link>)}</nav>
        <Suspense><SearchParam placeholder="Search by event, order ID, customer, provider..." /></Suspense>
        <details className="adb-pop"><summary className="adb-btn adc-filters"><Filter aria-hidden="true" />Filters</summary>
          <div className="adb-pop-body adb-form"><h3>Filter transactions</h3>
            <label>Status<Suspense><ParamSelect param="st" label="Status" value={st} options={[{ value: "", label: "All statuses" }, { value: "paid", label: "Paid" }, { value: "pending", label: "Pending" }, { value: "processing", label: "Processing" }, { value: "failed", label: "Failed" }, { value: "refunded", label: "Refunded" }, { value: "disputed", label: "Disputed" }, { value: "hold", label: "Held" }]} /></Suspense></label>
          </div></details>
        {exc && <Link className="adb-btn" href={lp({ exc: "" })}>Clear: {exc}</Link>}
      </div>
      <div className="adb-table-wrap"><table className="adb-table adc-table">
        <colgroup><col style={{ width: "10.6%" }} /><col style={{ width: "10%" }} /><col style={{ width: "17.4%" }} /><col style={{ width: "17%" }} /><col style={{ width: "7%" }} /><col style={{ width: "7.2%" }} /><col style={{ width: "6.6%" }} /><col style={{ width: "8.8%" }} /><col style={{ width: "10.6%" }} /><col /></colgroup>
        <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Customer / Provider</th><th className="r">Amount</th><th className="r">Fees</th><th className="r">Net</th><th>Status</th><th>Payment provider</th><th className="r">Actions</th></tr></thead>
        <tbody>{list.slice((page - 1) * per, page * per).map(t => { const ty = typeOf(t), [Icon, tone] = TYPE_ICON[ty] ?? [Landmark, "grey"], st = statusOf(t), nt = net(t), connect = (t.details.provider ?? "").includes("Connect");
          return <tr key={t.id}>
            <td className="adc-date">{stamp(t.occurred_at).replace(",", "")}</td>
            <td><span className="adc-type"><Icon aria-hidden="true" className={tone} />{ty}</span></td>
            <td><Link className="adc-desc" href={`/admin/commerce/transactions/${t.id}`}>{t.description}</Link></td>
            <td className="adc-who">{t.counterparty}</td>
            <td className="r">{money(t.amount, "GBP", { cents: true })}</td>
            <td className="r">{money(t.fee_amount, "GBP", { cents: true })}</td>
            <td className="r">{nt === null ? "—" : money(nt, "GBP", { cents: true })}</td>
            <td><Pill status={st.key} label={st.label} dot /></td>
            <td><span className="adc-prov"><i className={connect ? "c" : ""}>{connect ? "◎" : "S"}</i>{t.details.provider ?? "Stripe"}</span></td>
            <td className="r"><Menu label={`Actions for ${t.description}`} entries={[{ kind: "link", label: "Open transaction", href: `/admin/commerce/transactions/${t.id}` },
              ...(t.event_id ? [{ kind: "link" as const, label: "Open event", href: `/admin/events/${t.event_id}` }] : []),
              { kind: "link", label: "Open support for this payment", href: `/admin/support?q=${encodeURIComponent(String(t.details.reference ?? t.stripe_ref ?? t.description))}` }]} /></td>
          </tr>; })}</tbody>
      </table></div>
      {!list.length && <p className="adb-none">No transactions match these filters.</p>}
      {list.length > per && <Pager total={list.length} page={page} per={per} href={p => lp({ page: p })} />}
    </section>
  </div>;
}

function PayoutsView({ cur, prev, requests, period, days }: { cur: Tx[]; prev: Tx[]; requests: Awaited<ReturnType<typeof loadLedger>>["requests"]; period: string; days: number }) {
  const payouts = cur.filter(t => t.kind === "payout"), prevP = prev.filter(t => t.kind === "payout");
  const sum = (l: Tx[]) => l.reduce((a, t) => a + Math.abs(t.amount), 0);
  const paid = payouts.filter(t => t.status === "completed"), pending = payouts.filter(t => t.status === "pending" || t.status === "scheduled"), failedP = payouts.filter(t => t.status === "failed");
  const open = requests.filter(r => r.status === "pending");
  return <>
    <section className="adb-kpis adc-kpis">
      <Kpi icon={Landmark} tone="green" label={`Paid out (${period})`} value={money(sum(paid))} delta={delta(sum(paid), sum(prevP.filter(t => t.status === "completed")))} suffix={`vs last ${days} days`} />
      <Kpi icon={Clock3} tone="blue" label="Processing" value={money(sum(pending))} note={`${pending.length} payout${pending.length === 1 ? "" : "s"} in flight`} />
      <Kpi icon={TriangleAlert} tone="red" label="Failed payouts" value={String(failedP.length)} note={failedP.length ? "Retry or investigate" : "None"} />
      <Kpi icon={RotateCcw} tone="purple" label="Open money requests" value={String(open.length)} note="Refunds, retries and partner payouts awaiting the processor" />
    </section>
    <section className="adb-panel adc-tx">
      <div className="adc-tx-h"><h2>Payouts</h2><p className="adc-honest">Payouts are executed by Stripe Connect. Retrying records an audited request; no money moves from this screen.</p></div>
      <div className="adb-table-wrap"><table className="adb-table adc-table">
        <thead><tr><th>Date</th><th>Payee</th><th>Description</th><th className="r">Amount</th><th>Status</th><th>Reference</th><th className="r">Actions</th></tr></thead>
        <tbody>{payouts.map(t => { const st = statusOf(t); return <tr key={t.id}>
          <td className="adc-date">{day(t.occurred_at, { day: "numeric", month: "short", year: "numeric" })}</td><td>{t.counterparty}</td>
          <td><Link className="adc-desc" href={`/admin/commerce/transactions/${t.id}`}>{t.description}</Link></td><td className="r">{money(Math.abs(t.amount), "GBP", { cents: true })}</td>
          <td><Pill status={t.status === "failed" ? "failed" : st.key} label={t.status === "failed" ? "Failed" : st.label} dot /></td><td className="adc-who">{t.stripe_ref ?? "—"}</td>
          <td className="r">{t.status !== "completed" ? <ActionButton action={retryPayout} args={[t.id, Math.abs(t.amount)]} reason variant="outline" className="sm"
            confirm={{ title: "Request payout retry", body: `Record a retry request for ${money(Math.abs(t.amount), "GBP", { cents: true })} to ${t.counterparty}. Stripe Connect executes payouts; nothing is sent from here.`, cta: "Record request" }}>Retry</ActionButton> : <span className="adc-who">—</span>}</td>
        </tr>; })}</tbody></table></div>
      {!payouts.length && <p className="adb-none">No payouts in this period.</p>}
    </section>
    <section className="adb-panel adc-tx">
      <div className="adc-tx-h"><h2>Money requests</h2><p className="adc-honest">Pending until the payment processor executes them.</p></div>
      <div className="adb-table-wrap"><table className="adb-table adc-table">
        <thead><tr><th>Requested</th><th>Kind</th><th className="r">Amount</th><th>Reason</th><th>By</th><th>Status</th><th className="r">Actions</th></tr></thead>
        <tbody>{requests.map(r => <tr key={r.id}><td className="adc-date">{day(r.created_at, { day: "numeric", month: "short", year: "numeric" })} {time(r.created_at)}</td>
          <td>{r.kind === "refund" ? "Refund" : r.kind === "payout_retry" ? "Payout retry" : "Partner payout"}</td><td className="r">{money(r.amount, "GBP", { cents: true })}</td><td>{r.reason}</td><td>{r.requested_by_name}</td>
          <td><Pill status={r.status} dot /></td>
          <td className="r">{r.transaction_id && <Link className="adb-link" href={`/admin/commerce/transactions/${r.transaction_id}`}>Open</Link>} {r.status === "pending" && <ActionButton action={cancelMoneyRequest} args={[r.id]} reason variant="ghost" className="sm"
            confirm={{ title: "Cancel request", body: "The request will be cancelled and recorded in the audit log.", cta: "Cancel request" }}>Cancel</ActionButton>}</td></tr>)}</tbody></table></div>
      {!requests.length && <p className="adb-none">No refund, payout or partner payout requests yet.</p>}
    </section>
  </>;
}
