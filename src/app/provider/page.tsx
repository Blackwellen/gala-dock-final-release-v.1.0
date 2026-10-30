import type { Metadata } from "next";
import Link from "next/link";
import {
  Mail, Clock, CalendarCheck, CircleDollarSign, Users, CalendarRange, LockKeyhole, Hand, UserRound, ChevronRight, ArrowRight,
  CalendarPlus, LayoutGrid, Wrench, Siren, Wallet, Lightbulb, BarChart3, WandSparkles, MailCheck, Sparkles, ShieldCheck, Zap, Clock4, ArrowUp, ArrowDown,
} from "lucide-react";
import "@/styles/provider-home.css";
import { Kpi, Panel, Ring, Chip, Avatar, IconTile, Tabs, type Tone } from "@/components/workspace/kit";
import { money, time, countdown, day } from "@/lib/workspace/format";
import { Suspense } from "react";
import { RowMenu } from "./_components/row-menu";
import { ParamSelect } from "./_components/param-select";
import { respondToRequest, releaseHold } from "./opportunities/actions";
import { homeData, type Range, type GlanceKind } from "./_home/data";

export const metadata: Metadata = { title: "Home" };

const glanceStyle: Record<GlanceKind, { icon: typeof Users; tone: Tone; chip: string; chipTone: Tone; cta: string }> = {
  enquiry: { icon: Users, tone: "blue", chip: "New Enquiry", chipTone: "blue", cta: "Respond" },
  quote: { icon: CalendarRange, tone: "orange", chip: "Quote Request", chipTone: "blue", cta: "Respond" },
  hold: { icon: LockKeyhole, tone: "red", chip: "Hold Expiring", chipTone: "pink", cta: "Review" },
  standby: { icon: Hand, tone: "orange", chip: "Standby", chipTone: "blue", cta: "View" },
  emergency: { icon: UserRound, tone: "pink", chip: "Urgent", chipTone: "red", cta: "Respond" },
};
const dots = ["#16b67a", "#2f6bff", "#8b3dff", "#ff9a1f", "#16b67a"];
const greeting = () => { const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" }).format(new Date())); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };

export default async function ProviderHome(props: PageProps<"/provider">) {
  const sp = await props.searchParams;
  const range = (["today", "7d", "30d"].includes(String(sp.range)) ? sp.range : "today") as Range;
  const view = (["today", "upcoming", "overdue", "attention"].includes(String(sp.view)) ? sp.view : "today") as "today" | "upcoming" | "overdue" | "attention";
  const d = await homeData(range);
  const k = d.kpis;
  const now = d.now;
  const rangeLabel = { today: "vs yesterday", "7d": "vs previous 7 days", "30d": "vs previous 30 days" }[range];
  const base = `/provider${range !== "today" ? `?range=${range}` : ""}`;
  const rows = d.views[view];

  return <div className="ph">
    <header className="ph-head">
      <div><h1>{greeting()}, {d.user}</h1><p>Here’s what’s happening with {d.workspace} today.</p></div>
      <div className="ph-head-right">
        <span>{new Intl.DateTimeFormat("en-US", { timeZone: "Europe/London", weekday: "long", month: "short", day: "numeric", year: "numeric" }).format(new Date(d.now))}</span>
        <div className="ph-range"><CalendarCheck aria-hidden="true" />
          <Suspense><ParamSelect param="range" label="Period" value={range} options={[{ value: "today", label: "Today" }, { value: "7d", label: "Last 7 days" }, { value: "30d", label: "Last 30 days" }]} /></Suspense>
        </div>
      </div>
    </header>

    <section className="ph-kpis" aria-label="Key figures">
      <Kpi icon={Mail} tone="blue" label="New Enquiries" value={k.enquiries} delta={k.enquiriesDelta} deltaSuffix={rangeLabel} series={k.enquirySeries} href="/provider/opportunities" />
      <Kpi icon={Clock} tone="orange" label="Pending Responses" value={k.pending} delta={null} deltaSuffix="" series={k.pendingSeries} href="/provider/opportunities" />
      <Kpi icon={CalendarCheck} tone="purple" label="Confirmed Bookings" value={k.confirmed} delta={k.confirmedDelta} deltaSuffix="vs last 7 days" series={k.confirmedSeries} href="/provider/bookings" />
      <Kpi icon={CircleDollarSign} tone="green" label="Revenue (This Month)" value={money(k.revenue)} delta={k.revenueDelta} deltaSuffix="vs last month" series={k.revenueSeries} href="/provider/money" />
    </section>

    <div className="ph-body">
      <div className="ph-left">
        <div className="ph-row-a">
          <Panel title="Today at a glance" action={{ href: "/provider/opportunities", label: "View all" }} className="ph-glance">
            <Tabs base={base} param="view" active={view} tabs={[
              { key: "today", label: "Today" }, { key: "upcoming", label: "Upcoming" },
              { key: "overdue", label: "Overdue", count: d.views.overdue.length }, { key: "attention", label: "Requires attention", count: d.views.attention.length },
            ]} />
            {rows.length ? <ul className="ph-glance-list">{rows.slice(0, 5).map(r => {
              const st = glanceStyle[r.kind];
              const cd = countdown(r.due, now);
              const expired = view === "overdue";
              return <li key={r.item.id}>
                <IconTile icon={st.icon} tone={st.tone} size={40} />
                <div className="ph-g-main"><b>{r.title}</b><small>{r.client}</small><small>{r.place}</small></div>
                <div className="ph-g-time"><span>{time(r.at)}</span><small className={expired ? "muted" : cd.overdue ? "over" : ""}><Clock4 aria-hidden="true" />{expired ? "Expired / No response" : `${cd.label} remaining`}</small></div>
                <Chip tone={expired ? "grey" : st.chipTone}>{expired ? "No response" : st.chip}</Chip>
                <Link className="ws-btn primary sm ph-g-cta" href={`/provider/opportunities/${r.item.id}`}>{expired ? "View" : st.cta} <ArrowRight aria-hidden="true" /></Link>
                <RowMenu label={`More actions for ${r.title}`} entries={[
                  { kind: "link", label: "Open request", href: `/provider/opportunities/${r.item.id}` },
                  ...(expired ? [] : r.kind === "hold"
                    ? [{ kind: "action" as const, label: "Release hold", danger: true, confirm: "Release this conditional hold? The date becomes available to others.", run: releaseHold.bind(null, r.item.id) }]
                    : [{ kind: "action" as const, label: "Request clarification", run: respondToRequest.bind(null, r.item.id, "clarification", "") },
                      { kind: "action" as const, label: "Mark unavailable", danger: true, confirm: "Tell the requester you are unavailable for this date?", run: respondToRequest.bind(null, r.item.id, "unavailable", "") }]),
                ]} />
              </li>;
            })}</ul> : <p className="ph-empty">Nothing {view === "overdue" ? "overdue" : view === "attention" ? "needs attention" : `due ${view}`} — you’re on top of it.</p>}
          </Panel>

          <Panel title="Today’s Schedule" action={{ href: "/provider/calendar?view=day", label: "View Calendar" }} className="ph-schedule">
            {d.schedule.length ? <ol className="ph-timeline">{d.schedule.map((s, i) => <li key={s.id}>
              <time>{time(s.at)}</time><i style={{ background: dots[i % dots.length] }} />
              <Link href={s.href}><b>{s.title}</b>{s.lines.map(l => <small key={l}>{l}</small>)}<ChevronRight aria-hidden="true" /></Link>
            </li>)}</ol> : <p className="ph-empty">No appointments today.</p>}
          </Panel>
        </div>

        <div className="ph-row-b">
          <Panel title="Venue & Service Performance" className="ph-perf" action={<span className="ph-chip-select">Last 30 days</span>}>
            <div className="ph-perf-grid">
              {d.performance.venue.listing && <Link href={`/provider/venues/${d.performance.venue.listing.id}`} className="ph-perf-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {d.performance.venue.listing.image ? <img src={d.performance.venue.listing.image} alt="" /> : <span className="ph-perf-noimg" aria-hidden="true" />}
                <div><span className="ph-perf-label"><ShieldCheck aria-hidden="true" />Venue Bookings</span>
                  <strong>{d.performance.venue.bookings} <Trend v={d.performance.venue.delta} /></strong>
                  <small>Occupancy Rate</small><em>{d.performance.venue.occupancy}%</em>
                  <MiniBars values={d.performance.venue.series} tone="blue" /></div>
              </Link>}
              {d.performance.service.listing && <Link href={`/provider/services/${d.performance.service.listing.id}`} className="ph-perf-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {d.performance.service.listing.image ? <img src={d.performance.service.listing.image} alt="" /> : <span className="ph-perf-noimg" aria-hidden="true" />}
                <div><span className="ph-perf-label"><Users aria-hidden="true" />Service Bookings</span>
                  <strong>{d.performance.service.bookings} <Trend v={d.performance.service.delta} /></strong>
                  <small>Revenue</small><em>{money(d.performance.service.revenue)}</em>
                  <MiniBars values={d.performance.service.series} tone="purple" /></div>
              </Link>}
            </div>
          </Panel>

          <Panel title="Upcoming Bookings" action={{ href: "/provider/bookings", label: "View all" }} className="ph-upcoming">
            {d.upcoming.length ? <ul>{d.upcoming.map(j => <li key={j.id}>
              <time>{day(j.starts_at, { month: "short", day: "numeric" })}</time>
              <IconTile icon={j.mode === "venue" ? Users : CalendarCheck} tone={j.mode === "venue" ? "blue" : "green"} size={26} />
              <Link href={`/provider/bookings/${j.id}`}><b>{j.event_name}</b><small>{j.spaceName}{j.guests ? ` · ${j.guests} guests` : ""}</small></Link>
              <Chip tone={j.status === "held" ? "amber" : "green"}>{j.status === "held" ? "Held" : "Confirmed"}</Chip>
            </li>)}</ul> : <p className="ph-empty">No upcoming bookings.</p>}
          </Panel>
        </div>
      </div>

      <aside className="ph-right">
        <Panel title="Quick Actions" className="ph-quick">
          <ul>{[
            { href: "/provider/calendar?action=block", icon: CalendarPlus, title: "Update Availability", text: "Block dates or set availability" },
            ...(d.performance.venue.listing ? [{ href: `/provider/venues/${d.performance.venue.listing.id}/spaces/new?step=1`, icon: LayoutGrid, title: "Add New Space", text: "List a venue space" }] : []),
            { href: "/provider/services/new?step=1", icon: Wrench, title: "Create Service", text: "Add a new service package" },
            { href: "/provider/calendar?action=emergency", icon: Siren, title: "Publish Emergency Slot", text: "Open last-minute availability" },
            { href: "/provider/money?tab=payouts", icon: Wallet, title: "View Payouts", text: "Check upcoming payments" },
          ].map(q => <li key={q.title}><Link href={q.href}><span className="ph-q-icon"><q.icon aria-hidden="true" /></span><span><b>{q.title}</b><small>{q.text}</small></span></Link></li>)}</ul>
        </Panel>

        <Panel title="Reliability & Performance" className="ph-rel" action={<Chip tone={d.rel.responseRate >= 90 && d.rel.cancellationRate <= 2 ? "green" : "amber"} dot>{d.rel.responseRate >= 90 && d.rel.cancellationRate <= 2 ? "Good" : "Review"}</Chip>}>
          <div className="ph-rings">
            <RelRing value={d.rel.responseRate} label="Response rate" tone="green" diff={d.rel.responseRate - d.relPrev.responseRate} />
            <RelRing value={d.rel.cancellationRate} label="Cancellation rate" tone="grey" diff={+(d.rel.cancellationRate - d.relPrev.cancellationRate).toFixed(1)} pct invert />
            <RelRing value={d.rel.onTime} label="On-time delivery" tone="blue" diff={d.rel.onTime - d.relPrev.onTime} />
          </div>
          <div className="ph-elig">
            <Elig on={d.elig.instant} icon={Zap} label="Instant Book" tone="green" />
            <Elig on={d.elig.emergency} icon={Siren} label="Emergency" tone="blue" />
            <Elig on={d.elig.standby} icon={ShieldCheck} label="Standby" tone="purple" />
          </div>
        </Panel>

        <Panel title="Team Availability" action={{ href: "/provider/team", label: "Manage Team" }} className="ph-team">
          <ul>{d.team.map(c => <li key={c.id}>
            <Avatar src={c.avatar} name={c.name} size={30} />
            <Link href={`/provider/team/${c.id}`}><b>{c.name}</b><small>{c.role}</small></Link>
            <Chip tone={c.status === "on_event" ? "amber" : c.status === "available" ? "green" : "grey"} dot>{c.status === "on_event" ? "In Event" : c.status === "available" ? "Available" : "Unavailable"}</Chip>
            <small className="ph-team-count">{c.bookings} booking{c.bookings === 1 ? "" : "s"}</small>
          </li>)}</ul>
        </Panel>
      </aside>
    </div>

    <section className="ph-insights" aria-labelledby="ph-ins">
      <div className="ph-ins-head"><h2 id="ph-ins"><Sparkles aria-hidden="true" />Gala Agent Insights</h2><span>Here are some ways to grow your business this week.</span>
        <Link className="ws-link" href="/provider/agent">Open in Gala Agent <ArrowRight aria-hidden="true" /></Link></div>
      <div className="ph-ins-grid">
        <Insight tone="purple" icon={Lightbulb} title={`Respond to ${d.insights.pending} pending enquir${d.insights.pending === 1 ? "y" : "ies"}`} text="Gala Agent can draft personalised responses based on your space details." cta="Generate Responses" href={`/provider/agent?goal=${encodeURIComponent(`Draft responses to my ${d.insights.pending} pending enquiries`)}`} />
        <Insight tone="blue" icon={BarChart3} title="Fill upcoming low-occupancy dates" text={`${d.insights.lowDates} of the next 14 days have no venue bookings. Consider promotions.`} cta="View Opportunities" href="/provider/opportunities" />
        <Insight tone="green" icon={WandSparkles} title="Optimise your packages" text={d.insights.best ? `${d.insights.best.name} is your most-booked package — review its pricing.` : "Publish a package to start tracking demand."} cta="See Recommendations" href={d.insights.best ? `/provider/packages/${d.insights.best.id}` : "/provider/packages/new?step=1"} />
        <Insight tone="orange" icon={MailCheck} title="Automate follow-ups" text={`${d.insights.reviewable} recent client${d.insights.reviewable === 1 ? "" : "s"} could be asked for a review. Let Gala Agent follow up.`} cta="Send Follow-ups" href={`/provider/agent?goal=${encodeURIComponent("Send review requests for bookings completed in the last 30 days")}`} />
      </div>
    </section>
  </div>;
}

function Trend({ v }: { v: number | null }) {
  if (v === null) return null;
  const Icon = v >= 0 ? ArrowUp : ArrowDown;
  return <span className={`ph-trend ${v >= 0 ? "up" : "down"}`}><Icon aria-hidden="true" />{Math.abs(v)}%</span>;
}
function MiniBars({ values, tone }: { values: number[]; tone: "blue" | "purple" }) {
  const max = Math.max(1, ...values);
  return <span className={`ph-mini ${tone}`} aria-hidden="true">{values.map((v, i) => <i key={i} style={{ height: `${Math.max(8, (v / max) * 100)}%` }} />)}</span>;
}
function RelRing({ value, label, tone, diff, pct, invert }: { value: number; label: string; tone: Tone; diff: number; pct?: boolean; invert?: boolean }) {
  const good = invert ? diff <= 0 : diff >= 0;
  const Icon = diff >= 0 ? ArrowUp : ArrowDown;
  return <div className="ph-ring">
    <Ring value={pct ? Math.min(100, value * 10) : value} size={56} tone={tone} label={`${value}%`} />
    <span>{label}</span>
    <small className={good ? "up" : "down"}><Icon aria-hidden="true" />{Math.abs(diff)}%</small>
  </div>;
}
function Elig({ on, icon: Icon, label, tone }: { on: boolean; icon: typeof Zap; label: string; tone: Tone }) {
  return <span className={`ph-elig-chip ${on ? tone : "off"}`}><Icon aria-hidden="true" /><span><b>{label}</b><small>{on ? "Eligible" : "Not eligible"}</small></span></span>;
}
function Insight({ tone, icon: Icon, title, text, cta, href }: { tone: Tone; icon: typeof Zap; title: string; text: string; cta: string; href: string }) {
  return <div className={`ph-ins ${tone}`}><span className="ph-ins-icon"><Icon aria-hidden="true" /></span>
    <div><b>{title}</b><p>{text}</p><Link href={href} className="ph-ins-cta">{cta} <ArrowRight aria-hidden="true" /></Link></div></div>;
}
