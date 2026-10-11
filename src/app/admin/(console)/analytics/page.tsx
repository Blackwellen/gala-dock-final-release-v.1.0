import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MessageSquareText, Layers, ChartColumnIncreasing, Filter as FunnelIcon, Clock3, Upload, ChevronDown, ArrowRight, ArrowUp, ArrowDown, ChevronRight, Ticket, CalendarDays, Wallet, Percent, Users,
  MapPin, CreditCard, BadgePlus, Repeat, Building2, Store, CalendarClock, ShoppingCart, Crown, type LucideIcon } from "lucide-react";
import "@/styles/admin-b.css";
import "@/styles/admin-b-analytics.css";
import { Donut, Restricted, type Tone } from "@/components/workspace/kit";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows, count } from "@/lib/workspace/db";
import { money, delta, requestTime } from "@/lib/workspace/format";
import { Head, Kpi, TabBar, Delta, LineChart, Bars, Pill, Img } from "../_b/kit";
import { ParamSelect } from "../_b/ui";
import { shortDay, dur, ago } from "../_b/format";

export const metadata: Metadata = { title: "Analytics" };

type Row = { day: string; metric: string; dim: string; value: number };
const PERIODS: Record<string, [string, number]> = { "30d": ["Last 30 days", 30], "7d": ["Last 7 days", 7], "90d": ["Last 90 days", 90] };
const CAT_IMG: Record<string, string> = { Venues: "sv-riverside-manor", "Catering & Drinks": "s-taste-catering", Entertainment: "ev-neon", "Production & AV": "s-sound-lighting", "Decor & Styling": "s-luxe-decor" };
const SRC_TONE: Tone[] = ["blue", "green", "orange", "orange", "blue"];

export default async function AnalyticsPage(props: PageProps<"/admin/analytics">) {
  const sp = await props.searchParams;
  const { db, allowed, permissions } = await requireAdminPermission("analytics");
  if (!allowed) return <Restricted area="Analytics" />;
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] as string : "");
  const period = PERIODS[s("period")] ? s("period") : "30d", [plabel, days] = PERIODS[period]!;
  const compare = s("compare") !== "none";
  const now = requestTime(), dayKey = (d: number) => new Date(now - d * 864e5).toISOString().slice(0, 10);
  // PostgREST caps each response (1,000 rows), so page through newest-first and then sort ascending for the charts.
  const all: Row[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const page = await rows<Row>(db.from("analytics_daily").select("day,metric,dim,value").gte("day", dayKey(2 * days)).order("day", { ascending: false }).range(from, from + 999));
    all.push(...page.map(r => ({ ...r, value: Number(r.value) })));
    if (page.length < 1000) break;
  }
  all.sort((a, b) => a.day.localeCompare(b.day));
  const curStart = dayKey(days - 1), cur = all.filter(r => r.day >= curStart), prev = all.filter(r => r.day < curStart);
  const sum = (l: Row[], m: string, dim = "") => l.filter(r => r.metric === m && r.dim === dim).reduce((a, r) => a + r.value, 0);
  const avg = (l: Row[], m: string, dim = "") => { const x = l.filter(r => r.metric === m && r.dim === dim); return x.length ? x.reduce((a, r) => a + r.value, 0) / x.length : 0; };
  const last = (l: Row[], m: string) => l.filter(r => r.metric === m && !r.dim).at(-1)?.value ?? 0;
  const daysList = Array.from({ length: days }, (_, i) => dayKey(days - 1 - i));
  const daily = (m: string, dim = "") => { const map = new Map(cur.filter(r => r.metric === m && r.dim === dim).map(r => [r.day, r.value])); return daysList.map(d => map.get(d) ?? 0); };
  const spark = (m: string) => { const v = daily(m); const n = 10, k = Math.max(1, Math.floor(v.length / n)); return Array.from({ length: Math.ceil(v.length / k) }, (_, i) => v.slice(i * k, i * k + k).reduce((a, b) => a + b, 0)); };
  const dl = (a: number, b: number) => (compare ? delta(a, b) : undefined);
  const labels = daysList.map(d => shortDay(new Date(`${d}T12:00:00Z`).getTime()));
  const hasData = cur.length > 0;

  const tab = ["ticketing", "saas", "customer", "reliability", "promotion", "platform"].includes(s("tab")) ? s("tab") : "marketplace";
  const base = (t: string) => `/admin/analytics?${new URLSearchParams({ ...(t !== "marketplace" ? { tab: t } : {}), ...(period !== "30d" ? { period } : {}), ...(!compare ? { compare: "none" } : {}) })}`;

  const B = sum(cur, "bookings"), G = sum(cur, "gmv_marketplace"), PR = sum(cur, "platform_revenue"), SE = sum(cur, "searches"), EN = sum(cur, "enquiries"), PRO = sum(cur, "proposals");
  const conv = SE ? (100 * B) / SE : 0, convP = sum(prev, "searches") ? (100 * sum(prev, "bookings")) / sum(prev, "searches") : 0;
  const resp = avg(cur, "response_minutes"), respP = avg(prev, "response_minutes");
  const dims = (m: string) => [...new Set(cur.filter(r => r.metric === m).map(r => r.dim))];
  const cats = dims("bookings_by_category").map(dim => ({ dim, b: sum(cur, "bookings_by_category", dim), r: sum(cur, "revenue_by_category", dim), g: delta(sum(cur, "revenue_by_category", dim), sum(prev, "revenue_by_category", dim)) })).sort((a, b) => b.b - a.b);
  const cities = dims("bookings_by_city").map(dim => ({ dim, b: sum(cur, "bookings_by_city", dim), r: sum(cur, "revenue_by_city", dim), g: delta(sum(cur, "revenue_by_city", dim), sum(prev, "revenue_by_city", dim)) })).sort((a, b) => b.b - a.b);
  const sources = dims("revenue_by_source").map(dim => ({ dim, v: sum(cur, "revenue_by_source", dim) })).sort((a, b) => b.v - a.v);
  const srcTotal = sources.reduce((a, x) => a + x.v, 0) || 1;
  const respCats = dims("response_within_2h").map(dim => ({ dim, a: avg(cur, "response_within_2h", dim), b: avg(cur, "response_2_8h", dim), c: avg(cur, "response_8_24h", dim), d: avg(cur, "response_over_24h", dim) }));
  const T = sum(cur, "tickets_sold"), TR = sum(cur, "ticket_revenue"), TF = sum(cur, "ticket_fees"), EV = sum(cur, "events_with_tickets");
  const AS = last(cur, "active_subscriptions"), MRR = last(cur, "mrr"), NS = sum(cur, "new_subscriptions"), CH = AS ? (100 * sum(cur, "churned_subscriptions")) / AS : 0;
  const RC = avg(cur, "repeat_customers_pct"), OR = avg(cur, "organizer_retention_pct"), PRR = avg(cur, "provider_retention_pct");
  const kshort = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0).replace(".0", "")}K` : String(Math.round(v));
  const gshort = (v: number) => v >= 1000 ? `£${Math.round(v / 1000)}K` : `£${Math.round(v)}`;

  const head = <Head title="Analytics" subtitle="Measure marketplace, ticketing, SaaS and network performance."
    actions={<>
      <span className="adb-psel"><CalendarDays aria-hidden="true" /><Suspense><ParamSelect param="period" label="Period" value={period} options={Object.entries(PERIODS).map(([value, [label]]) => ({ value, label }))} /></Suspense></span>
      <Suspense><ParamSelect param="compare" label="Compare" className="adb-select ada-cmp" value={compare ? "" : "none"} options={[{ value: "", label: "Compare:  Previous period" }, { value: "none", label: "Compare:  None" }]} /></Suspense>
      <Link className="adb-btn primary" href={`/admin/analytics/export?period=${period}`}><Upload aria-hidden="true" />Export<ChevronDown aria-hidden="true" /></Link>
    </>} />
  const tabs = <TabBar active={tab} tabs={[["marketplace", "Marketplace"], ["ticketing", "Ticketing"], ["saas", "SaaS"], ["customer", "Customer"], ["reliability", "Reliability"], ["promotion", "Promotion"], ["platform", "Platform overview"]].map(([key, label]) => ({ key: key!, label: label!, href: base(key!) }))} />
  if (!hasData) return <div className="adb ada">{head}{tabs}<section className="adb-panel"><p className="adb-none">No analytics rollups for {plabel.toLowerCase()} yet. Daily metrics appear here once the nightly rollup has run.</p></section></div>;
  if (tab === "platform") return <div className="adb ada">{head}{tabs}<PlatformOverview db={db} permissions={permissions} cur={cur} prev={prev} daily={daily} labels={labels} dl={dl} spark={spark} now={now} /></div>;

  const ticketing = <section className="adb-panel ada-mini">
    <div className="adb-sec-h"><h2>Ticketing performance</h2><span className="ada-chip">{plabel}<ChevronDown aria-hidden="true" /></span></div>
    <div className="ada-mk">{([[Ticket, "Tickets sold", Math.round(T).toLocaleString("en-GB"), dl(T, sum(prev, "tickets_sold"))], [CalendarDays, "Events with tickets", Math.round(EV / Math.max(1, days / 30)).toLocaleString("en-GB"), dl(EV, sum(prev, "events_with_tickets"))],
      [Wallet, "Gross ticket revenue", money(TR), dl(TR, sum(prev, "ticket_revenue"))], [Percent, "Platform fees", money(TF), dl(TF, sum(prev, "ticket_fees"))]] as [LucideIcon, string, string, number | null | undefined][]).map(([I, l, v, d]) =>
      <div key={l}><i><I aria-hidden="true" /></i><span><small>{l}</small><b>{v}</b>{d !== undefined && <Delta value={d} />}</span></div>)}</div>
    <ul className="adb-keys ada-keys"><li><i style={{ background: "#2f6bff" }} />Tickets sold</li><li><i style={{ background: "#8b3dff" }} />Revenue (right axis)</li></ul>
    <Bars width={430} height={118} labels={labels} format={kshort} stacked={false} gap={0.3} right={{ format: gshort, scale: Math.max(1, ...daily("ticket_revenue")) / Math.max(1, ...daily("tickets_sold")) }} data={daily("tickets_sold").map((v, i) => ({ parts: [{ value: v, color: "#4f7cff" }, { value: daily("ticket_revenue")[i]! / (Math.max(1, ...daily("ticket_revenue")) / Math.max(1, ...daily("tickets_sold"))), color: "#a78bfa" }] }))} />
  </section>;
  const saas = <section className="adb-panel ada-mini">
    <div className="adb-sec-h"><h2>SaaS performance</h2><span className="ada-chip">{plabel}<ChevronDown aria-hidden="true" /></span></div>
    <div className="ada-mk">{([[MapPin, "Active subscriptions", Math.round(AS).toLocaleString("en-GB"), dl(AS, last(prev, "active_subscriptions"))], [CreditCard, "MRR", money(MRR), dl(MRR, last(prev, "mrr"))],
      [BadgePlus, "New subscriptions", Math.round(NS).toLocaleString("en-GB"), dl(NS, sum(prev, "new_subscriptions"))], [Percent, "Churn rate", `${CH.toFixed(1)}%`, dl(CH, last(prev, "active_subscriptions") ? (100 * sum(prev, "churned_subscriptions")) / last(prev, "active_subscriptions") : 0)]] as [LucideIcon, string, string, number | null | undefined][]).map(([I, l, v, d]) =>
      <div key={l}><i><I aria-hidden="true" /></i><span><small>{l}</small><b>{v}</b>{d !== undefined && <Delta value={d} invert={l === "Churn rate"} />}</span></div>)}</div>
    <ul className="adb-keys ada-keys"><li><i style={{ background: "#2f6bff" }} />Active subscriptions</li><li><i style={{ background: "#8b3dff" }} />MRR (right axis)</li></ul>
    <LineChart width={400} height={118} labels={labels} format={v => String(Math.round(v))} right={{ format: gshort }} series={[{ values: daily("active_subscriptions"), color: "#2f6bff" }, { values: daily("mrr"), color: "#8b3dff", axis: "right", fill: false }]} />
  </section>;
  const retention = <section className="adb-panel ada-mini">
    <div className="adb-sec-h"><h2>Repeat use &amp; retention</h2><span className="ada-chip">{plabel}<ChevronDown aria-hidden="true" /></span></div>
    <div className="ada-mk three">{([[Repeat, "Repeat customers", RC, avg(prev, "repeat_customers_pct")], [Building2, "Organizer retention", OR, avg(prev, "organizer_retention_pct")], [Store, "Provider retention", PRR, avg(prev, "provider_retention_pct")]] as [LucideIcon, string, number, number][]).map(([I, l, v, p]) =>
      <div key={l}><i><I aria-hidden="true" /></i><span><small>{l}</small><b>{Math.round(v)}%</b>{compare && <Delta value={delta(v, p)} />}</span></div>)}</div>
    <ul className="adb-keys ada-keys"><li><i style={{ background: "#2f6bff" }} />Customers</li><li><i style={{ background: "#8b3dff" }} />Organizers</li><li><i style={{ background: "#16b67a" }} />Providers</li></ul>
    <LineChart width={380} height={118} labels={labels} format={v => `${Math.round(v)}%`} area={false} series={[{ values: daily("repeat_customers_pct"), color: "#2f6bff" }, { values: daily("organizer_retention_pct"), color: "#8b3dff" }, { values: daily("provider_retention_pct"), color: "#16b67a" }]} />
  </section>;
  const response = <section className="adb-panel ada-resp">
    <div className="adb-sec-h"><h2>Supplier response time</h2><Link className="adb-link" href={base("reliability")}>View all <ArrowRight aria-hidden="true" /></Link></div>
    <ul className="adb-keys"><li><i style={{ background: "#16a46c" }} />Within 2h</li><li><i style={{ background: "#2f6bff" }} />2–8h</li><li><i style={{ background: "#f5a524" }} />8–24h</li><li><i style={{ background: "#ec3a52" }} />&gt; 24h</li></ul>
    <ul className="ada-hbars">{respCats.map(c => { const t = c.a + c.b + c.c + c.d || 1; return <li key={c.dim}><span>{c.dim}</span>
      <span className="ada-hb"><i style={{ width: `${(100 * c.a) / t}%`, background: "#16a46c" }}>{Math.round((100 * c.a) / t)}%</i><i style={{ width: `${(100 * c.b) / t}%`, background: "#4f7cff" }} /><i style={{ width: `${(100 * c.d) / t}%`, background: "#ec3a52" }} /><i style={{ width: `${(100 * c.c) / t}%`, background: "#f5a524" }} /></span>
      <b>{Math.round((100 * (c.c + c.d)) / t)}%</b></li>; })}</ul>
  </section>;

  return <div className="adb ada">
    {head}{tabs}
    <section className="adb-kpis ada-kpis">
      <Kpi icon={MessageSquareText} tone="green" label="Total Bookings" value={Math.round(B).toLocaleString("en-GB")} delta={dl(B, sum(prev, "bookings"))} suffix={`vs previous ${days} days`} series={spark("bookings")} />
      <Kpi icon={Layers} tone="blue" label="GMV (Marketplace)" value={money(G)} delta={dl(G, sum(prev, "gmv_marketplace"))} suffix={`vs previous ${days} days`} series={spark("gmv_marketplace")} />
      <Kpi icon={ChartColumnIncreasing} tone="purple" label="Platform Revenue" value={money(PR)} delta={dl(PR, sum(prev, "platform_revenue"))} suffix={`vs previous ${days} days`} series={spark("platform_revenue")} />
      <Kpi icon={FunnelIcon} tone="orange" label="Conversion Rate" value={`${conv.toFixed(1)}%`} delta={dl(conv, convP)} suffix={`vs previous ${days} days`} series={spark("bookings")} />
      <Kpi icon={Clock3} tone="green" label="Avg. Response Time" value={dur(resp)} delta={dl(resp, respP)} invert suffix={`vs previous ${days} days`} series={spark("response_minutes")} />
    </section>
    {(tab === "marketplace" || tab === "promotion") && <>
      <div className="ada-r2">
        <section className="adb-panel ada-demand">
          <div className="adb-sec-h"><div><h2>Marketplace demand vs supply</h2><p className="ada-sub">Searches, enquiries and confirmed bookings</p></div><span className="ada-chip">Daily<ChevronDown aria-hidden="true" /></span></div>
          <ul className="adb-keys"><li><i style={{ background: "#2f6bff" }} />Searches</li><li><i style={{ background: "#8b3dff" }} />Enquiries</li><li><i style={{ background: "#16a46c" }} />Confirmed bookings</li></ul>
          <LineChart width={520} height={136} labels={labels} format={kshort} series={[{ values: daily("searches"), color: "#2f6bff" }, { values: daily("enquiries"), color: "#8b3dff" }, { values: daily("bookings"), color: "#16a46c" }]} />
        </section>
        <section className="adb-panel ada-funnel">
          <h2>Booking conversion funnel</h2><p className="ada-sub">From search to confirmed booking</p>
          <div className="ada-fn">{([["Searches", SE, 100, "s"], ["Enquiries", EN, SE ? (100 * EN) / SE : 0, "e"], ["Proposals", PRO, EN ? (100 * PRO) / EN : 0, "p"], ["Confirmed", B, SE ? (100 * B) / SE : 0, "c"]] as const).map(([l, v, p, k], i) =>
            <div key={l} className={k}><b>{p.toFixed(p >= 10 || p === 100 ? 0 : 1)}%</b><small>{Math.round(v).toLocaleString("en-GB")}</small><i style={{ height: `${Math.max(14, (90 * v) / (SE || 1)) + (i ? 18 : 0)}px` }} /><span>{l}</span>{i < 3 && <ChevronRight aria-hidden="true" className="ada-fn-a" />}</div>)}</div>
        </section>
        <section className="adb-panel ada-rev">
          <h2>Revenue breakdown</h2><p className="ada-sub">Platform revenue by source</p>
          <div className="ada-rev-b"><Donut size={140} thickness={22} parts={sources.map((x, i) => ({ label: x.dim, value: x.v, tone: SRC_TONE[i] ?? "grey" }))} center={<><b>{money(PR)}</b><small>Platform revenue</small></>} />
            <ul className="adb-legend">{sources.map((x, i) => <li key={x.dim}><i className={`ada-dot ${SRC_TONE[i] ?? "grey"} n${i}`} /><span>{x.dim}</span><em /><b>{Math.round((100 * x.v) / srcTotal)}%</b></li>)}</ul></div>
        </section>
      </div>
      <div className="ada-r3">
        <section className="adb-panel ada-top">
          <div className="adb-sec-h"><h2>Top categories by bookings</h2><Link className="adb-link" href="/admin/marketplace">View all <ArrowRight aria-hidden="true" /></Link></div>
          <table className="adb-table"><thead><tr><th>Category</th><th className="r">Bookings</th><th className="r">Revenue</th><th className="r">Growth</th></tr></thead>
            <tbody>{cats.slice(0, 5).map(c => <tr key={c.dim}><td><span className="adb-cell"><Img className="adb-thumb" src={`/assets/gd/${CAT_IMG[c.dim] ?? "sv-loft"}.webp`} alt="" width={26} height={22} /><b>{c.dim}</b></span></td>
              <td className="r">{Math.round(c.b).toLocaleString("en-GB")}</td><td className="r">{money(c.r)}</td><td className="r">{compare ? <Delta value={c.g} /> : "—"}</td></tr>)}</tbody></table>
        </section>
        <section className="adb-panel ada-top">
          <div className="adb-sec-h"><h2>Top locations</h2><Link className="adb-link" href="/admin/marketplace">View all <ArrowRight aria-hidden="true" /></Link></div>
          <table className="adb-table"><thead><tr><th>Location</th><th className="r">Bookings</th><th className="r">Revenue</th><th className="r">Growth</th></tr></thead>
            <tbody>{cities.slice(0, 5).map(c => <tr key={c.dim}><td>{c.dim}</td><td className="r">{Math.round(c.b).toLocaleString("en-GB")}</td><td className="r">{money(c.r)}</td><td className="r">{compare ? <Delta value={c.g} /> : "—"}</td></tr>)}</tbody></table>
        </section>
        {response}
      </div>
      <div className="ada-r4">{ticketing}{saas}{retention}</div>
    </>}
    {tab === "ticketing" && <div className="ada-solo">{ticketing}</div>}
    {tab === "saas" && <div className="ada-solo">{saas}</div>}
    {tab === "customer" && <div className="ada-solo">{retention}</div>}
    {tab === "reliability" && <div className="ada-solo">{response}</div>}
  </div>;
}

/** Alt tab ("Gala Dock Admin Analytics Dashboard"): platform-wide overview built from the same rollups plus live queue counts. */
async function PlatformOverview({ db, permissions, cur, prev, daily, labels, dl, spark, now }: {
  db: Awaited<ReturnType<typeof requireAdminPermission>>["db"]; permissions: Set<string>; cur: Row[]; prev: Row[]; daily: (m: string, dim?: string) => number[]; labels: string[];
  dl: (a: number, b: number) => number | null | undefined; spark: (m: string) => number[]; now: number;
}) {
  const sum = (l: Row[], m: string) => l.filter(r => r.metric === m && !r.dim).reduce((a, r) => a + r.value, 0);
  const last = (l: Row[], m: string) => l.filter(r => r.metric === m && !r.dim).at(-1)?.value ?? 0;
  const G = sum(cur, "gmv_marketplace") + sum(cur, "ticket_revenue"), Gp = sum(prev, "gmv_marketplace") + sum(prev, "ticket_revenue");
  const can = (p: string) => permissions.has(p);
  const [users, workspaces, organizers, providers, verif, support, disputes, highCancel, ints, cases] = await Promise.all([
    can("users") ? count(db.from("profiles").select("id", { count: "exact", head: true })) : Promise.resolve(null),
    count(db.from("workspaces").select("id", { count: "exact", head: true })),
    count(db.from("workspaces").select("id", { count: "exact", head: true }).eq("kind", "organizer")),
    count(db.from("workspaces").select("id", { count: "exact", head: true }).eq("kind", "provider")),
    can("trust") ? count(db.from("trust_cases").select("id", { count: "exact", head: true }).eq("queue", "verification").in("status", ["open", "in_review"])) : Promise.resolve(null),
    can("support") ? count(db.from("support_cases").select("id", { count: "exact", head: true }).in("status", ["open", "escalated"])) : Promise.resolve(null),
    can("trust") ? count(db.from("trust_cases").select("id", { count: "exact", head: true }).ilike("category", "%chargeback%").in("status", ["open", "in_review"])) : Promise.resolve(null),
    can("trust") ? count(db.from("trust_cases").select("id", { count: "exact", head: true }).eq("queue", "reliability").in("status", ["open", "in_review"])) : Promise.resolve(null),
    rows<{ name: string; status: string }>(db.from("integrations").select("name,status").order("name")),
    can("support") ? rows<{ id: string; reference: string; subject: string; priority: string; category: string; assignee_name: string; created_at: string }>(db.from("support_cases").select("id,reference,subject,priority,category,assignee_name,created_at").in("priority", ["urgent", "high"]).neq("status", "resolved").order("created_at", { ascending: false }).limit(5)) : Promise.resolve([]),
  ]);
  const healthy = ints.filter(i => i.status === "healthy").length;
  const queues: [string, number | null, string, LucideIcon][] = [["Verification", verif, "/admin/trust?tab=verification", Users], ["Support", support, "/admin/support", MessageSquareText], ["Disputes", disputes, "/admin/trust/disputes", Clock3], ["High cancellation", highCancel, "/admin/trust?tab=reliability", CalendarClock]];
  const SE = sum(cur, "searches"), EN = sum(cur, "enquiries"), PRO = sum(cur, "proposals"), B = sum(cur, "bookings");
  const venues = daily("revenue_by_category", "Venues"), cats = [...new Set(cur.filter(r => r.metric === "revenue_by_category" && r.dim !== "Venues").map(r => r.dim))];
  const services = venues.map((_, i) => cats.reduce((a, c) => a + daily("revenue_by_category", c)[i]!, 0));
  return <>
    <section className="adb-kpis ada-pk">
      <Kpi icon={ShoppingCart} tone="blue" label="GMV (Total Bookings)" value={money(G)} delta={dl(G, Gp)} series={spark("gmv_marketplace")} />
      <Kpi icon={Ticket} tone="purple" label="Ticket Volume" value={Math.round(sum(cur, "tickets_sold")).toLocaleString("en-GB")} delta={dl(sum(cur, "tickets_sold"), sum(prev, "tickets_sold"))} series={spark("tickets_sold")} />
      <Kpi icon={Layers} tone="green" label="Platform Revenue" value={money(sum(cur, "platform_revenue"))} delta={dl(sum(cur, "platform_revenue"), sum(prev, "platform_revenue"))} series={spark("platform_revenue")} />
      <Kpi icon={Crown} tone="orange" label="Subscription Revenue" value={money(last(cur, "mrr"))} delta={dl(last(cur, "mrr"), last(prev, "mrr"))} series={spark("mrr")} />
    </section>
    <div className="ada-p2">
      <section className="adb-panel ada-demand"><div className="adb-sec-h"><h2>Revenue &amp; Volume</h2></div>
        <Bars width={540} height={150} labels={labels} format={v => v >= 1000 ? `£${Math.round(v / 1000)}K` : `£${v}`} gap={0.3} line={{ values: daily("gmv_marketplace").map((v, i) => v + daily("ticket_revenue")[i]!), color: "#7c3aed" }}
          data={venues.map((v, i) => ({ parts: [{ value: v, color: "#1d4ed8" }, { value: services[i]!, color: "#60a5fa" }, { value: daily("ticket_revenue")[i]!, color: "#a5b4fc" }] }))} />
        <ul className="adb-keys"><li><i style={{ background: "#1d4ed8" }} />Venue bookings</li><li><i style={{ background: "#60a5fa" }} />Service bookings</li><li><i style={{ background: "#a5b4fc" }} />Tickets</li><li><i style={{ background: "#7c3aed" }} />GMV (line)</li></ul></section>
      <section className="adb-panel ada-uw"><div className="adb-sec-h"><h2>Users &amp; Workspaces</h2><Link className="adb-link" href="/admin/users">View all <ArrowRight aria-hidden="true" /></Link></div>
        <ul>{([[users, "Total users", "/admin/users"], [workspaces, "Active workspaces", "/admin/workspaces"], [organizers, "Organizers", "/admin/workspaces?kind=organizer"], [providers, "Providers", "/admin/workspaces?kind=provider"]] as [number | null, string, string][]).map(([v, l, h]) =>
          <li key={l}><Link href={h}><b>{v === null ? "—" : v.toLocaleString("en-GB")}</b><small>{l}</small><ChevronRight aria-hidden="true" /></Link></li>)}</ul></section>
      <section className="adb-panel ada-funnel"><h2>Booking Conversion Funnel</h2>
        <ul className="ada-hf">{([["Event / Service Requests", SE], ["Provider Responses", EN], ["Quotes Sent", PRO], ["Bookings Confirmed", B]] as const).map(([l, v]) => <li key={l}><span>{l}</span><i><em style={{ width: `${(100 * v) / (SE || 1)}%` }} /></i><b>{Math.round(v).toLocaleString("en-GB")}</b><small>{Math.round((100 * v) / (SE || 1))}%</small></li>)}</ul></section>
    </div>
    <div className="ada-p3">
      <section className="adb-panel ada-q"><div className="adb-sec-h"><h2>Operational Queues</h2></div>
        <div className="ada-qg">{queues.map(([l, v, h, I]) => <Link key={l} href={h}><i><I aria-hidden="true" /></i><span><small>{l}</small><b>{v === null ? "—" : v}</b></span><em>View queue <ArrowRight aria-hidden="true" /></em></Link>)}</div></section>
      <section className="adb-panel ada-hp"><div className="adb-sec-h"><h2>Recent High Priority Items</h2><Link className="adb-link" href="/admin/support">View all <ArrowRight aria-hidden="true" /></Link></div>
        <table className="adb-table"><thead><tr><th>Item</th><th>Type</th><th>Priority</th><th>Assigned</th><th className="r">Time</th></tr></thead>
          <tbody>{cases.map(c => <tr key={c.id}><td><Link href={`/admin/support/${c.id}`}>{c.subject}</Link></td><td>{c.category.replace("_", " ")}</td><td><Pill status={c.priority} dot /></td><td>{c.assignee_name || "—"}</td><td className="r">{ago(c.created_at, now)}</td></tr>)}</tbody></table>
        {!cases.length && <p className="adb-none">No high-priority items.</p>}</section>
      <section className="adb-panel ada-ps"><div className="adb-sec-h"><h2>Platform Status</h2><Link className="adb-link" href="/admin/agent-integrations?tab=connections">View all <ArrowRight aria-hidden="true" /></Link></div>
        <p className={healthy === ints.length ? "ok" : "warn"}>{healthy === ints.length ? "All systems operational" : `${ints.length - healthy} connector${ints.length - healthy === 1 ? "" : "s"} need attention`}</p>
        <ul>{ints.slice(0, 7).map(i => <li key={i.name}><i className={i.status} />{i.name}<b>{i.status === "healthy" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}{i.status}</b></li>)}</ul></section>
    </div>
  </>;
}
