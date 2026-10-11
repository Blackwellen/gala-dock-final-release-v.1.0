import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Users, Layers, CalendarDays, ShoppingCart, ArrowRight, ArrowUp, ArrowDown, UserPlus, Store, Sparkle, PoundSterling, ShieldCheck, ChevronRight, CalendarRange, TrendingUp, Star,
  UsersRound, Ban, CircleAlert, Copyright, Flag, MessageSquareWarning } from "lucide-react";
import "@/styles/admin-a-base.css";
import "@/styles/admin-a-overview.css";
import { Kpi, Avatar, Donut } from "@/components/workspace/kit";
import { getAdmin } from "@/lib/admin/context";
import { rows } from "@/lib/workspace/db";
import { money, day, relative, requestTime, delta, titleCase } from "@/lib/workspace/format";
import { ParamSelect } from "./_a/client";
import { str, qs, rpc, periodOf, PERIODS, type SP } from "./_a/lib";

export const metadata: Metadata = { title: "Overview" };

type Ov = { days: number;
  users?: { total: number; total_prev: number; new: number; new_prev: number; active: number; active_prev: number; organizers: number; vendors: number; signups: number[]; cumulative: number[] };
  events?: { total: number; total_prev: number; created: number; by_status: Record<string, number>; created_series: number[]; cumulative: number[] };
  commerce?: { gmv: number; gmv_prev: number; orders: number; orders_prev: number; revenue_series: number[]; order_series: number[] };
  workspaces: { active: number; active_prev: number; organizer: number; provider: number; series: number[] } };

function Up({ v, invert }: { v: number | null; invert?: boolean }) {
  if (v === null) return <span className="ao-d flat">—</span>;
  const good = invert ? v <= 0 : v >= 0, I = v >= 0 ? ArrowUp : ArrowDown;
  return <span className={`ao-d ${good ? "up" : "down"}`}><I aria-hidden="true" />{Math.abs(v)}%</span>;
}

function OvChart({ values, labels, money: isMoney }: { values: number[]; labels: string[]; money?: boolean }) {
  const W = 360, H = 150, pl = 28, pb = 18, n = values.length || 1, bw = (W - pl) / n;
  const max = Math.max(1, ...values), mag = Math.pow(10, Math.floor(Math.log10(max))), top = Math.ceil(max / mag) * mag;
  const y = (v: number) => 4 + (H - pb - 4) * (1 - v / top);
  const fmt = (v: number) => isMoney ? (v >= 1000 ? `£${Math.round(v / 1000)}K` : `£${Math.round(v)}`) : v >= 1000 ? `${Math.round(v / 1000)}K` : String(Math.round(v));
  return <svg className="ao-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily trend">
    <defs><linearGradient id="ao-bar" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#7a5cff" /><stop offset="1" stopColor="#b9a8ff" /></linearGradient></defs>
    {[0, .25, .5, .75, 1].map(k => <g key={k}><line x1={pl} x2={W} y1={y(top * k)} y2={y(top * k)} className="g" /><text x={pl - 6} y={y(top * k) + 3} textAnchor="end">{fmt(top * k)}</text></g>)}
    {values.map((v, i) => <rect key={i} x={pl + i * bw + bw * .2} y={y(v)} width={bw * .6} height={Math.max(0, y(0) - y(v))} rx={1.5} fill="url(#ao-bar)"><title>{`${labels[i]}: ${fmt(v)}`}</title></rect>)}
    {labels.map((l, i) => i % Math.ceil(n / 5) === 0 && <text key={i} x={pl + i * bw + bw / 2} y={H - 3} textAnchor="middle">{l}</text>)}
  </svg>;
}

const logoTone = (name: string) => ["#ff6a2b", "#635bff", "#4a154b", "#2d8cff", "#00a1e0", "#16a46c", "#7c3aed", "#ff4f00"][[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 8];
const statusLabel = (s: string) => (s === "healthy" ? "Healthy" : s === "degraded" ? "Degraded" : s === "down" ? "Down" : titleCase(s));

export default async function AdminOverview(props: PageProps<"/admin">) {
  const ctx = await getAdmin();
  const { db, permissions } = ctx;
  const sp = (await props.searchParams) as SP;
  const can = (p: Parameters<typeof permissions.has>[0]) => permissions.has(p);
  const now = requestTime(), period = periodOf(sp);
  const metric = ["events", "orders", "revenue"].includes(str(sp, "metric")) ? str(sp, "metric") : "users";
  const sinceIso = new Date(now - period.days * 864e5).toISOString(), prevIso = new Date(now - 2 * period.days * 864e5).toISOString();

  const [ov, events, trust, cases, integrations, listings] = await Promise.all([
    rpc<Ov>(db, "admin_overview", { p_days: period.days }),
    can("events") || can("tickets") ? rows<{ status: string; starts_at: string | null; ends_at: string | null; created_at: string }>(db.from("events").select("status,starts_at,ends_at,created_at").limit(10000)) : Promise.resolve(null),
    can("trust") ? rows<{ status: string; category: string; created_at: string }>(db.from("trust_cases").select("status,category,created_at").limit(5000)) : Promise.resolve(null),
    can("support") ? rows<{ id: string; reference: string; subject: string; priority: string; status: string; requester_name: string; requester_id: string | null; created_at: string }>(
      db.from("support_cases").select("id,reference,subject,priority,status,requester_name,requester_id,created_at").neq("status", "resolved").order("created_at", { ascending: false }).limit(5)) : Promise.resolve(null),
    rows<{ id: string; name: string; category: string; status: string; metrics: { label?: string; sort?: number } | null }>(db.from("integrations").select("id,name,category,status,metrics")),
    rows<{ rating: number | null; published: boolean }>(db.from("listings").select("rating,published").eq("published", true)),
  ]);
  const avatars = cases?.length && (can("users") || can("support"))
    ? new Map((await rows<{ id: string; avatar_url: string }>(db.from("profiles").select("id,avatar_url").in("id", cases.map(c => c.requester_id).filter(Boolean) as string[]))).map(p => [p.id, p.avatar_url])) : new Map<string, string>();

  const u = ov.users, e = ov.events, c = ov.commerce, w = ov.workspaces;
  const labels = Array.from({ length: period.days }, (_, i) => day(new Date(now - (period.days - 1 - i) * 864e5).toISOString(), { month: "short", day: "numeric" }));
  // Daily activity, as in the design (new sign-ups / events created per day); the headline figure above stays the running total.
  const chart = metric === "users" ? u?.signups : metric === "events" ? e?.created_series : metric === "orders" ? c?.order_series : c?.revenue_series;
  const head = metric === "users" ? { v: u ? u.total.toLocaleString("en-GB") : "—", l: "Total Users", d: u ? delta(u.total, u.total_prev) : null }
    : metric === "events" ? { v: e ? e.total.toLocaleString("en-GB") : "—", l: "Total Events", d: e ? delta(e.total, e.total_prev) : null }
    : metric === "orders" ? { v: c ? c.orders.toLocaleString("en-GB") : "—", l: `Orders (${period.days}d)`, d: c ? delta(c.orders, c.orders_prev) : null }
    : { v: c ? money(c.gmv) : "—", l: `GMV (${period.days}d)`, d: c ? delta(Number(c.gmv), Number(c.gmv_prev)) : null };
  const evb = (() => {
    if (!events) return null;
    const live = events.filter(x => x.status === "live" || (["on_sale", "published", "ready"].includes(x.status) && x.starts_at && new Date(x.starts_at).getTime() <= now && new Date(x.ends_at ?? x.starts_at).getTime() >= now)).length;
    const upcoming = events.filter(x => !["cancelled", "suspended", "draft", "planning", "completed", "closed", "archived"].includes(x.status) && x.starts_at && new Date(x.starts_at).getTime() > now).length;
    const drafts = events.filter(x => ["draft", "planning"].includes(x.status)).length, cancelled = events.filter(x => ["cancelled", "suspended"].includes(x.status)).length;
    const created = (a: string, b: string, st: (s: string) => boolean) => events.filter(x => st(x.status) && x.created_at >= a && x.created_at < b).length;
    return { live, upcoming, drafts, cancelled, total: events.length,
      dDraft: delta(created(sinceIso, "9999", s => ["draft", "planning"].includes(s)), created(prevIso, sinceIso, s => ["draft", "planning"].includes(s))) };
  })();
  const tr = trust && (() => {
    const open = trust.filter(t => t.status === "open"), review = trust.filter(t => ["in_review", "appealed"].includes(t.status)), done = trust.filter(t => ["actioned", "dismissed"].includes(t.status));
    const inWin = (l: typeof trust, a: string, b?: string) => l.filter(t => t.created_at >= a && (!b || t.created_at < b)).length;
    const cats = Object.entries(trust.filter(t => ["open", "in_review"].includes(t.status)).reduce<Record<string, number>>((a, t) => { a[t.category] = (a[t.category] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { open: open.length, review: review.length, done: done.length, dOpen: delta(inWin(open, sinceIso), inWin(open, prevIso, sinceIso)), dReview: delta(inWin(review, sinceIso), inWin(review, prevIso, sinceIso)), dDone: delta(inWin(done, sinceIso), inWin(done, prevIso, sinceIso)), cats };
  })();
  const catIcon = (cat: string) => /content/i.test(cat) ? Ban : /fraud/i.test(cat) ? CircleAlert : /policy/i.test(cat) ? Flag : /harass/i.test(cat) ? MessageSquareWarning : /copyright|ip/i.test(cat) ? Copyright : ShieldCheck;
  const partnersInt = integrations.filter(i => ["sync", "payments", "messaging", "meetings", "crm"].includes(i.category) && i.metrics?.label && !i.metrics?.sort).slice(0, 5);
  const agentInt = integrations.filter(i => ["agent", "ai", "automation", "calendar"].includes(i.category)).sort((a, b) => (a.category === "agent" ? -1 : b.category === "agent" ? 1 : 0)).slice(0, 4);
  const aov = c && c.orders ? Number(c.gmv) / c.orders : 0, aovPrev = c && c.orders_prev ? Number(c.gmv_prev) / c.orders_prev : 0;
  const rated = listings.filter(l => l.rating), avgRating = rated.length ? rated.reduce((a, l) => a + Number(l.rating), 0) / rated.length : null;
  const orderGrowth = c ? delta(c.orders, c.orders_prev) : null;
  const first = ctx.name.split(/\s+/)[0];
  const base = "/admin";

  return <div className="aa ao">
    <header className="ao-head">
      <div><h1>Welcome back, {first}</h1><p>Here’s what’s happening across your Gala Dock platform.</p></div>
      <div className="ao-head-r"><span className="ao-date"><CalendarRange aria-hidden="true" />{day(new Date(now).toISOString(), { weekday: "long", month: "short", day: "numeric", year: "numeric" })}</span>
        <span className="ao-period"><CalendarDays aria-hidden="true" /><Suspense><ParamSelect param="period" label="Period" value={String(period.days)} className="aa-select ao-sel" options={[{ value: "30", label: PERIODS["30"]!.label }, { value: "7", label: PERIODS["7"]!.label }, { value: "90", label: PERIODS["90"]!.label }]} /></Suspense></span></div>
    </header>

    <section className="aa-kpis ao-kpis" aria-label="Platform metrics">
      <Kpi icon={Users} tone="blue" label="Total Users" value={u ? u.total.toLocaleString("en-GB") : "—"} delta={u ? delta(u.total, u.total_prev) : null} deltaSuffix={`vs last ${period.days} days`} series={u?.cumulative} href={can("users") ? "/admin/users" : undefined} />
      <Kpi icon={Layers} tone="purple" label="Active Workspaces" value={w.active.toLocaleString("en-GB")} delta={delta(w.active, w.active_prev)} deltaSuffix={`vs last ${period.days} days`} series={w.series} href={can("workspaces") ? "/admin/workspaces" : undefined} />
      <Kpi icon={CalendarDays} tone="green" label="Total Events" value={e ? e.total.toLocaleString("en-GB") : "—"} delta={e ? delta(e.total, e.total_prev) : null} deltaSuffix={`vs last ${period.days} days`} series={e?.cumulative} href={can("events") ? "/admin/events" : undefined} />
      <Kpi icon={ShoppingCart} tone="purple" label="Gross Merchandise Value" value={c ? money(c.gmv) : "—"} delta={c ? delta(Number(c.gmv), Number(c.gmv_prev)) : null} deltaSuffix={`vs last ${period.days} days`} series={c?.revenue_series} href={can("commerce") ? "/admin/commerce" : undefined} />
    </section>

    <div className="ao-row2">
      <section className="aa-panel ao-platform">
        <div className="ao-ph"><h2>Platform Overview</h2>
          <nav className="ao-seg" aria-label="Metric">{["users", "events", "orders", "revenue"].map((k, i) => <Link key={k} scroll={false} href={qs(base, sp, { metric: i === 0 ? null : k })} className={metric === k ? "on" : ""}>{titleCase(k)}</Link>)}</nav>
          <span className="ao-pp">{period.label}</span></div>
        <div className="ao-pbody">
          <div className="ao-pchart">
            <div className="ao-big"><strong>{head.v}</strong><Up v={head.d} /><span>vs previous {period.days} days</span></div>
            <small className="ao-bigl">{head.l}</small>
            {chart?.length ? <OvChart values={chart.map(Number)} labels={labels} money={metric === "revenue"} /> : <p className="aa-empty">This metric needs another permission.</p>}
          </div>
          <ul className="ao-side">
            <li><span className="aa-tile blue"><Users aria-hidden="true" /></span><div><b>{u?.active.toLocaleString("en-GB") ?? "—"}</b><small>Active Users</small></div><Up v={u ? delta(u.active, u.active_prev) : null} /></li>
            <li><span className="aa-tile purple"><UserPlus aria-hidden="true" /></span><div><b>{u?.new.toLocaleString("en-GB") ?? "—"}</b><small>New Users</small></div><Up v={u ? delta(u.new, u.new_prev) : null} /></li>
            <li><span className="aa-tile blue"><Layers aria-hidden="true" /></span><div><b>{w.active.toLocaleString("en-GB")}</b><small>Active Workspaces</small></div><Up v={delta(w.active, w.active_prev)} /></li>
            <li><span className="aa-tile red"><ShoppingCart aria-hidden="true" /></span><div><b>{u?.organizers.toLocaleString("en-GB") ?? w.organizer}</b><small>Organizers</small></div><span className="ao-d flat">{w.organizer} ws</span></li>
            <li><span className="aa-tile blue"><UsersRound aria-hidden="true" /></span><div><b>{u?.vendors.toLocaleString("en-GB") ?? w.provider}</b><small>Vendors</small></div><span className="ao-d flat">{w.provider} ws</span></li>
          </ul>
        </div>
      </section>
      <div className="ao-stack">
        <section className="aa-panel ao-events">
          <div className="ao-ph"><h2>Events Overview</h2>{can("events") && <Link className="aa-link" href="/admin/events">View All <ArrowRight aria-hidden="true" /></Link>}</div>
          {evb ? <div className="ao-ev"><div><p className="ao-evtot"><strong>{evb.total.toLocaleString("en-GB")}</strong><span>Total Events</span></p>
            <ul className="ao-evl">
              <li><i className="g" /><b>{evb.live.toLocaleString("en-GB")}</b><span>Live Events</span></li>
              <li><i className="b" /><b>{evb.upcoming.toLocaleString("en-GB")}</b><span>Upcoming</span></li>
              <li><i className="p" /><b>{evb.drafts.toLocaleString("en-GB")}</b><span>Drafts</span><Up v={evb.dDraft} /></li>
              <li><i className="x" /><b>{evb.cancelled.toLocaleString("en-GB")}</b><span>Cancelled</span></li></ul></div>
            <Donut size={150} thickness={20} parts={[{ label: "Live", value: evb.live, tone: "green" }, { label: "Upcoming", value: evb.upcoming, tone: "blue" }, { label: "Drafts", value: evb.drafts, tone: "purple" },
              { label: "Cancelled", value: evb.cancelled, tone: "grey" }, { label: "Other", value: Math.max(0, evb.total - evb.live - evb.upcoming - evb.drafts - evb.cancelled), tone: "teal" }]}
              center={<><b>{evb.total.toLocaleString("en-GB")}</b><small>Events</small></>} /></div> : <p className="aa-empty">Needs the Events permission.</p>}
        </section>
        <section className="aa-panel ao-commerce">
          <div className="ao-ph"><h2>Commerce Health</h2>{can("commerce") && <Link className="aa-link" href="/admin/commerce">View Reports <ArrowRight aria-hidden="true" /></Link>}</div>
          {c ? <div className="ao-com"><span className="ao-gico"><PoundSterling aria-hidden="true" /></span><div><strong>{money(c.gmv)}</strong><small>GMV (Last {period.days} days)</small><Up v={delta(Number(c.gmv), Number(c.gmv_prev))} /></div>
            <div><b>{c.orders.toLocaleString("en-GB")}</b><small>Orders</small><Up v={delta(c.orders, c.orders_prev)} /></div>
            <div><b>{money(aov, "GBP", { cents: true })}</b><small>AOV</small><Up v={delta(aov, aovPrev)} /></div></div> : <p className="aa-empty">Needs the Commerce or Tickets permission.</p>}
        </section>
      </div>
    </div>

    <div className="ao-row3">
      <section className="aa-panel ao-trust">
        <div className="ao-ph"><h2>Trust &amp; Safety</h2>{can("trust") && <Link className="aa-link" href="/admin/trust">View Queue <ArrowRight aria-hidden="true" /></Link>}</div>
        {tr ? <><div className="ao-tsum"><span className="aa-tile purple"><ShieldCheck aria-hidden="true" /></span>
          <div><b>{tr.open}</b><small>Open Reports</small><Up v={tr.dOpen} invert /></div><div><b>{tr.review}</b><small>Under Review</small><Up v={tr.dReview} invert /></div><div><b>{tr.done}</b><small>Resolved</small><Up v={tr.dDone} /></div></div>
          <ul className="ao-cats">{tr.cats.map(([cat, n]) => { const I = catIcon(cat); return <li key={cat}><Link href={`/admin/trust?q=${encodeURIComponent(cat)}`}><I aria-hidden="true" /><span>{cat}</span><b>{n}</b><ChevronRight aria-hidden="true" /></Link></li>; })}
            {!tr.cats.length && <li className="aa-empty">No open reports.</li>}</ul></> : <p className="aa-empty">Needs the Trust permission.</p>}
      </section>
      <section className="aa-panel ao-support">
        <div className="ao-ph"><h2>Recent Support Tickets</h2>{can("support") && <Link className="aa-link" href="/admin/support">View All <ArrowRight aria-hidden="true" /></Link>}</div>
        {cases ? <ul className="ao-cases">{cases.map(k => <li key={k.id}><Link href={`/admin/support/${k.id}`}>
          <span className={`ao-pri ${k.priority}`}>{titleCase(k.priority)}</span><Avatar src={k.requester_id ? avatars.get(k.requester_id) : null} name={k.requester_name} size={30} />
          <div><b>{k.subject}</b><small>{relative(k.created_at, now)} · {k.requester_name}</small></div>
          <span className={`ao-cs ${k.status}`}>{k.status === "waiting" ? "Waiting" : k.status === "escalated" ? "Escalated" : "Open"}</span></Link></li>)}
          {!cases.length && <li className="aa-empty">No open support cases.</li>}</ul> : <p className="aa-empty">Needs the Support permission.</p>}
      </section>
      <section className="aa-panel ao-partners">
        <div className="ao-ph"><h2>Partner Activity</h2>{can("partners") && <Link className="aa-link" href="/admin/partners">View All <ArrowRight aria-hidden="true" /></Link>}</div>
        <ul className="ao-plist">{partnersInt.map(i => <li key={i.id}><span className="ao-logo" style={{ background: logoTone(i.name) }}>{i.name[0]}</span><b>{i.name}</b><small>{i.metrics?.label}</small>
          <span className={`ao-health ${i.status}`}>{statusLabel(i.status)}</span></li>)}
          {!partnersInt.length && <li className="aa-empty">No partner integrations connected.</li>}</ul>
      </section>
    </div>

    <div className="ao-row4">
      <section className="aa-panel ao-agent">
        <div className="ao-ph"><h2>Agent &amp; Integrations</h2>{can("agent_ops") && <Link className="aa-link" href="/admin/agent-integrations">View All <ArrowRight aria-hidden="true" /></Link>}</div>
        <ul className="ao-tiles">{agentInt.map(i => <li key={i.id}><span className="ao-logo" style={{ background: i.category === "agent" ? "#3524f5" : logoTone(i.name) }}>{i.category === "agent" ? <Sparkle aria-hidden="true" /> : i.name[0]}</span>
          <div><b>{i.name.replace(" (Azure)", "")}</b><span className={`ao-on ${i.status}`}>{i.status === "healthy" ? "Online" : statusLabel(i.status)}</span><small>{i.metrics?.label}</small></div></li>)}</ul>
      </section>
      <section className="aa-panel ao-analytics">
        <div className="ao-ph"><h2>Analytics Highlights</h2>{can("analytics") && <Link className="aa-link" href="/admin/analytics">View All <ArrowRight aria-hidden="true" /></Link>}</div>
        <ul className="ao-tiles">
          <li><span className="aa-tile green"><TrendingUp aria-hidden="true" /></span><div><small>Workspace growth</small><b>{w.active_prev ? `${Math.round((100 * (w.active - w.active_prev)) / w.active_prev)}%` : "—"}</b><small>{w.active} active</small></div></li>
          <li><span className="aa-tile purple"><Users aria-hidden="true" /></span><div><small>User activation</small><b>{u?.total ? `${Math.round((100 * u.active) / u.total)}%` : "—"}</b><small>active in {period.days}d</small></div></li>
          <li><span className="aa-tile blue"><Store aria-hidden="true" /></span><div><small>Orders</small><b>{orderGrowth === null ? "—" : `${orderGrowth >= 0 ? "+" : ""}${orderGrowth}%`}</b><small>vs last {period.days} days</small></div></li>
          <li><span className="aa-tile amber"><Star aria-hidden="true" /></span><div><small>Listing rating</small><b>{avgRating ? `${avgRating.toFixed(1)}/5` : "—"}</b><small>{rated.length} rated listings</small></div></li>
        </ul>
      </section>
    </div>
  </div>;
}
