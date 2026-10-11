import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, CirclePlay, CircleCheck, CircleX, MapPin, Users, Box, ArrowRight, CalendarPlus, UserCog, Wallet, Download, Sparkles, TriangleAlert, ChartColumn, TrendingUp, SlidersHorizontal, List, CalendarRange, CheckCircle2 } from "lucide-react";
import "@/styles/provider-bookings.css";
import { Kpi, Tabs, Chip, Thumb, Avatar, Empty, IconTile, type Tone } from "@/components/workspace/kit";
import { money, day, delta, requestTime } from "@/lib/workspace/format";
import { getProvider } from "@/lib/provider/context";
import { rows } from "@/lib/workspace/db";
import { workspaceJobs, workspaceListings, workspaceSpaces, dailySeries, startOfMonth, type Job } from "@/lib/provider/queries";
import { RowMenu } from "../_components/row-menu";
import { ParamSelect } from "../_components/param-select";
import { SearchParam } from "../_components/search-param";
import { transitionBooking } from "./actions";

export const metadata: Metadata = { title: "Bookings" };
type Tab = "upcoming" | "active" | "past" | "cancelled";
const PAGE = 8;
const hm = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

function payment(j: Job): { text: string; tone: "green" | "amber" | "grey" | "red" } {
  if (j.payment_status === "paid") return { text: "Paid in full", tone: "green" };
  if (j.payment_status === "refunded") return { text: "Refunded", tone: "grey" };
  if (j.payment_status === "failed") return { text: "Payment failed", tone: "red" };
  if (j.payment_status === "deposit_paid") return { text: "Deposit paid", tone: "green" };
  if (j.paid_amount > 0) return { text: `Paid ${Math.round((100 * j.paid_amount) / (j.value || 1))}%`, tone: "green" };
  return { text: "Unpaid", tone: "amber" };
}

export default async function BookingsPage(props: PageProps<"/provider/bookings">) {
  const sp = await props.searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? sp[k] as string : "");
  const tab = (["upcoming", "active", "past", "cancelled"].includes(str("tab")) ? str("tab") : "upcoming") as Tab;
  const [ctx, jobs, listings, spaces] = await Promise.all([getProvider(), workspaceJobs(), workspaceListings(), workspaceSpaces()]);
  const now = requestTime();
  const shifts = await rows<{ job_id: string | null; crew_id: string; status: string; crew: { name: string; avatar: string } | null }>(
    ctx.db.from("shifts").select("job_id,crew_id,status,crew:crew_members(name,avatar)").eq("workspace_id", ctx.workspace.id).not("job_id", "is", null));
  const groups: Record<Tab, Job[]> = {
    upcoming: jobs.filter(j => ["confirmed", "held"].includes(j.status) && new Date(j.ends_at).getTime() >= now),
    active: jobs.filter(j => j.status === "active"),
    past: jobs.filter(j => ["completed", "no_show"].includes(j.status) || (["confirmed", "held"].includes(j.status) && new Date(j.ends_at).getTime() < now)),
    cancelled: jobs.filter(j => j.status === "cancelled"),
  };
  const win = (t: string, a: number, b: number) => new Date(t).getTime() >= a && new Date(t).getTime() < b;
  const d30 = now - 30 * 864e5, d60 = now - 60 * 864e5;
  const completedMonth = jobs.filter(j => j.status === "completed" && win(j.ends_at, startOfMonth(0, now), now)).length;

  // Filters
  const q = str("q").toLowerCase(), type = str("type"), status = str("status"), range = str("range"), sort = str("sort") || "date";
  let list = groups[tab].filter(j => {
    if (q && ![j.event_name, j.client_name, j.reference, j.location].some(v => v?.toLowerCase().includes(q))) return false;
    if (type && j.mode !== type) return false;
    if (status && j.payment_status !== status) return false;
    if (range) { const days = Number(range); const t = new Date(j.starts_at).getTime(); if (tab === "past" ? t < now - days * 864e5 : t > now + days * 864e5) return false; }
    return true;
  });
  list = list.sort((a, b) => sort === "value" ? b.value - a.value : tab === "past" || tab === "cancelled" ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at));
  const page = Math.max(1, Number(str("page")) || 1), pages = Math.max(1, Math.ceil(list.length / PAGE));
  const shown = list.slice((page - 1) * PAGE, page * PAGE);
  const qs = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    for (const [k, v] of Object.entries(patch)) { if (v === null) n.delete(k); else n.set(k, v); }
    return `/provider/bookings${n.toString() ? `?${n}` : ""}`;
  };
  const week = jobs.filter(j => ["confirmed", "held", "active"].includes(j.status) && win(j.starts_at, now - 6 * 36e5, now + 7 * 864e5)).slice(0, 4);
  const attention = groups.upcoming.filter(j => j.next_action_due && new Date(j.next_action_due).getTime() - now < 3 * 864e5);
  const unpaid = groups.upcoming.filter(j => j.payment_status === "unpaid");
  const busiest = Object.entries(groups.upcoming.reduce<Record<string, number>>((a, j) => { const d = day(j.starts_at, { weekday: "long" }); a[d] = (a[d] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1])[0];

  return <div className="pb">
    <header className="ws-page-head pb-head">
      <div><h1>Bookings</h1><p>Manage all your confirmed, active and completed work in one place.</p></div>
      <div className="pb-range"><CalendarDays aria-hidden="true" /><Suspense><ParamSelect param="range" label="Date range" value={range} resetParams={["page"]} options={[{ value: "", label: "All dates" }, { value: "7", label: "Next 7 days" }, { value: "30", label: "Next 30 days" }, { value: "90", label: "Next 90 days" }]} /></Suspense></div>
    </header>
    <div className="pb-layout">
      <div className="pb-main">
        <section className="ws-kpis pb-kpis" aria-label="Booking figures">
          <Kpi icon={CalendarDays} tone="blue" label="Upcoming Bookings" value={groups.upcoming.length} delta={delta(jobs.filter(j => win(j.created_at, d30, now)).length, jobs.filter(j => win(j.created_at, d60, d30)).length)} deltaSuffix="vs last 30 days" series={dailySeries(groups.upcoming, j => j.starts_at, () => 1, 21, now + 21 * 864e5)} href={qs({ tab: null })} />
          <Kpi icon={CirclePlay} tone="purple" label="Active Bookings" value={groups.active.length} series={dailySeries(jobs, j => j.status === "active" ? j.starts_at : null, () => 1, 14, now)} href={qs({ tab: "active" })} />
          <Kpi icon={CircleCheck} tone="green" label="Completed (This Month)" value={completedMonth} series={dailySeries(groups.past, j => j.ends_at, () => 1, 30, now)} href={qs({ tab: "past" })} />
          <Kpi icon={CircleX} tone="red" label="Cancelled" value={groups.cancelled.length} series={dailySeries(groups.cancelled, j => j.created_at, () => 1, 30, now)} href={qs({ tab: "cancelled" })} />
        </section>
        <section className="ws-table-wrap pb-table">
          <Tabs base="/provider/bookings" active={tab} tabs={[{ key: "upcoming", label: "Upcoming", count: groups.upcoming.length }, { key: "active", label: "Active", count: groups.active.length }, { key: "past", label: "Past", count: groups.past.length }, { key: "cancelled", label: "Cancelled", count: groups.cancelled.length }]} />
          <div className="ws-toolbar pb-toolbar">
            <Suspense><SearchParam placeholder="Search bookings..." /></Suspense>
            <Suspense>
              <span className="po-sel"><CalendarRange aria-hidden="true" /><ParamSelect param="type" label="Type" value={type} resetParams={["page"]} options={[{ value: "", label: "Any type" }, { value: "venue", label: "Venue" }, { value: "service", label: "Service" }]} /></span>
              <span className="po-sel"><MapPin aria-hidden="true" /><ParamSelect param="status" label="Payment status" value={status} resetParams={["page"]} options={[{ value: "", label: "Any status" }, { value: "unpaid", label: "Unpaid" }, { value: "deposit_paid", label: "Deposit paid" }, { value: "part_paid", label: "Part paid" }, { value: "paid", label: "Paid in full" }, { value: "refunded", label: "Refunded" }]} /></span>
            </Suspense>
            <Link href={qs({ type: null, status: null, q: null, range: null, page: null })} className="ws-btn outline po-more"><SlidersHorizontal aria-hidden="true" />{type || status || q || range ? "Clear filters" : "More filters"}</Link>
            <span className="ws-spacer" />
            <label className="po-sort">Sort by <Suspense><ParamSelect param="sort" label="Sort by" value={sort} options={[{ value: "date", label: "Event date (soonest)" }, { value: "value", label: "Highest value" }]} /></Suspense></label>
            <nav className="po-views" aria-label="View"><Link href={qs({})} aria-current="page" aria-label="List view"><List aria-hidden="true" /></Link><Link href="/provider/calendar" aria-label="Calendar view"><CalendarDays aria-hidden="true" /></Link></nav>
          </div>
          {shown.length ? <div className="ws-table-scroll"><table className="ws-table pb-grid">
            <colgroup><col style={{ width: 192 }} /><col style={{ width: 120 }} /><col style={{ width: 112 }} /><col style={{ width: 94 }} /><col style={{ width: 84 }} /><col style={{ width: 102 }} /><col style={{ width: 138 }} /><col style={{ width: 80 }} /><col style={{ width: 44 }} /></colgroup>
            <thead><tr><th>Event / Client</th><th>Listing / Space / Service</th><th>Date &amp; Time</th><th>Value / Payout</th><th>Status</th><th>Team / Resources</th><th>Next action</th><th colSpan={2}>Actions</th></tr></thead>
            <tbody>{shown.map(j => {
              const space = spaces.find(s => s.id === j.space_id), listing = listings.find(l => l.id === j.listing_id);
              const staff = shifts.filter(s => s.job_id === j.id);
              const pay = payment(j);
              const st: { label: string; tone: Tone } = j.status === "active" ? { label: "Active", tone: "green" } : j.status === "held" ? { label: "Held", tone: "amber" } : j.status === "cancelled" ? { label: "Cancelled", tone: "red" } : j.status === "completed" ? { label: "Completed", tone: "grey" } : j.status === "no_show" ? { label: "No-show", tone: "red" } : { label: "Upcoming", tone: "blue" };
              const due = j.next_action_due ? Math.ceil((new Date(j.next_action_due).getTime() - now) / 864e5) : null;
              return <tr key={j.id}>
                <td><div className="ws-cell"><Thumb src={j.image} w={44} h={44} /><div className="ws-cell-text"><Link href={`/provider/bookings/${j.id}`}><b>{j.event_name}</b></Link><small className="pb-client">{j.client_name}</small><small className="po-ic"><MapPin aria-hidden="true" />{j.location}</small></div></div></td>
                <td><div className="ws-cell-text"><b>{space?.name ?? listing?.name}</b><small>{j.mode === "venue" ? "Venue Space" : listing?.category || "Service"}</small>
                  <small className="po-meta"><span><Users aria-hidden="true" />{j.guests ?? "—"}</span>{space && <span><Box aria-hidden="true" />{space.indoor ? "Indoor" : "Outdoor"}</span>}</small></div></td>
                <td><div className="ws-cell-text"><span className="pb-date">{day(j.starts_at)}</span><small>{hm(j.starts_at)} – {hm(j.ends_at)}</small></div></td>
                <td><div className="ws-cell-text"><b className="pb-value">{money(j.value)}</b><small>{money(j.net_payout)} net</small><small className={`pb-pay ${pay.tone}`}><CheckCircle2 aria-hidden="true" />{pay.text}</small></div></td>
                <td><Chip tone={st.tone}>{st.label}</Chip></td>
                <td>{staff.length ? <div className="pb-team"><span className="pb-avatars">{staff.slice(0, 2).map(s => <Avatar key={s.crew_id} src={s.crew?.avatar} name={s.crew?.name ?? "Crew"} size={26} />)}{staff.length > 2 && <b>+{staff.length - 2}</b>}</span><small>{staff.length} staff assigned</small></div> : <small className="pb-none">No staff yet</small>}</td>
                <td>{j.next_action ? <div className="pb-next"><IconTile icon={CalendarDays} tone={due !== null && due <= 1 ? "red" : "purple"} size={30} /><span><b>{j.next_action}</b><small className={due !== null && due <= 1 ? "urgent" : ""}>{due === null ? "" : due <= 0 ? "Due today" : due === 1 ? "Due tomorrow" : due < 7 ? `Due in ${due} days` : "Due in 1 week+"}</small></span></div> : <small className="pb-none">—</small>}</td>
                <td><Link href={`/provider/bookings/${j.id}`} className="ws-btn primary pb-open">Open <ArrowRight aria-hidden="true" /></Link></td>
                <td><RowMenu label={`Actions for ${j.event_name}`} entries={[
                  { kind: "link", label: "Open booking", href: `/provider/bookings/${j.id}` },
                  { kind: "link", label: "Assign team", href: `/provider/bookings/${j.id}?tab=team` },
                  ...(j.status === "confirmed" ? [{ kind: "action" as const, label: "Mark as started", confirm: "Mark this booking as started (active)?", run: transitionBooking.bind(null, j.id, "active", "") }] : []),
                  ...(j.status === "active" ? [{ kind: "action" as const, label: "Mark as completed", confirm: "Mark this booking as completed? Payment status is unaffected.", run: transitionBooking.bind(null, j.id, "completed", "") }] : []),
                  ...(["held", "confirmed", "active"].includes(j.status) ? [{ kind: "link" as const, label: "Cancel booking…", href: `/provider/bookings/${j.id}?tab=commercial&cancel=1` }] : []),
                ]} /></td>
              </tr>;
            })}</tbody></table></div>
            : <Empty icon={CalendarDays} title={`No ${tab} bookings`} text={q || type || status || range ? "Try clearing the filters." : tab === "upcoming" ? "Confirmed bookings and direct bookings appear here." : undefined}
              action={tab === "upcoming" ? <Link className="ws-btn primary" href="/provider/bookings/new?step=1">Create booking</Link> : undefined} />}
          <div className="ws-pager"><span>Showing {list.length ? (page - 1) * PAGE + 1 : 0}–{Math.min(page * PAGE, list.length)} of {list.length} bookings</span>
            {pages > 1 && <nav aria-label="Pages">{Array.from({ length: pages }, (_, n) => n + 1).map(n => n === page ? <span key={n} className="cur" aria-current="page">{n}</span> : <Link key={n} href={qs({ page: String(n) })}>{n}</Link>)}</nav>}</div>
        </section>
      </div>
      <aside className="pb-rail">
        <section className="ws-panel pb-week"><div className="ws-panel-head"><h2>Upcoming this week</h2><Link className="ws-link" href="/provider/calendar?view=week">View calendar <ArrowRight aria-hidden="true" /></Link></div>
          {week.length ? <ol>{week.map(j => <li key={j.id}><i className={j.status === "active" ? "active" : ""} /><time>{day(j.starts_at, { weekday: "short", day: "numeric", month: "short" })}</time>
            <Link href={`/provider/bookings/${j.id}`}><b>{j.event_name}</b><small>{spaces.find(s => s.id === j.space_id)?.name ?? j.location}</small><small>{hm(j.starts_at)} – {hm(j.ends_at)}</small></Link></li>)}</ol>
            : <p className="ws-muted">Nothing booked in the next 7 days.</p>}</section>
        <section className="ws-panel pb-quick"><h2>Quick actions</h2><ul>
          <li><Link href="/provider/calendar?action=block"><IconTile icon={CalendarPlus} tone="purple" size={38} /><span><b>Update availability</b><small>Block dates or set availability</small></span></Link></li>
          <li><Link href="/provider/team"><IconTile icon={UserCog} tone="purple" size={38} /><span><b>Manage team</b><small>Assign staff and resources</small></span></Link></li>
          <li><Link href="/provider/money?tab=payouts"><IconTile icon={Wallet} tone="purple" size={38} /><span><b>View payouts</b><small>Check upcoming payments</small></span></Link></li>
          <li><a href={`/provider/bookings/export?tab=${tab}${q ? `&q=${encodeURIComponent(q)}` : ""}`} download><IconTile icon={Download} tone="purple" size={38} /><span><b>Export bookings</b><small>Download as CSV</small></span></a></li>
        </ul></section>
        <section className="ws-panel pb-insights"><div className="ws-panel-head"><h2><Sparkles aria-hidden="true" />Gala Agent insights</h2><Link className="ws-link" href="/provider/agent">Open in Agent <ArrowRight aria-hidden="true" /></Link></div><ul>
          <li><IconTile icon={TriangleAlert} tone="red" size={36} /><span><b>{attention.length} booking{attention.length === 1 ? "" : "s"} need attention</b><small>{attention.length ? attention.slice(0, 2).map(j => j.next_action).join(" · ") : "No actions due in the next 3 days."}</small></span></li>
          <li><IconTile icon={ChartColumn} tone="blue" size={36} /><span><b>{busiest ? `${busiest[0]}s are your busiest day` : "No upcoming bookings yet"}</b><small>{busiest ? `${busiest[1]} upcoming booking${busiest[1] === 1 ? "" : "s"} start on a ${busiest[0]}.` : "Publish availability to start receiving requests."}</small></span></li>
          <li><IconTile icon={TrendingUp} tone="green" size={36} /><span><b>{unpaid.length} upcoming booking{unpaid.length === 1 ? "" : "s"} unpaid</b><small>{unpaid.length ? "Send a deposit reminder from the booking." : "All upcoming bookings have a payment recorded."}</small></span></li>
        </ul></section>
      </aside>
    </div>
  </div>;
}

