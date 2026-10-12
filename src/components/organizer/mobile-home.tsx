import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarDays, UserPlus, Store, Zap, Clock, ChevronRight, MapPin, Users, Sparkles, CheckCircle2, UserCheck, Receipt, BarChart3, Ticket, Handshake } from "lucide-react";
import type { Attention, EventStats } from "@/lib/data/organizer";
import { money, num, dateBadge } from "@/lib/format";
import "@/styles/organizer-home-pwa.css";

type Props = {
  range: "today" | "week" | "month"; today: string; role: string; attention: Attention[]; upcoming: EventStats[];
  leadCount: number; bookingCount: number; revenue: number; forecast: number; amountsDue: number;
  completed: number; waiting: number; approvals: number; conflicts: ReactNode;
};

/** Phone/tablet composition uses the same authorized domain records as the desktop command centre. */
export function OrganizerMobileHome(p: Props) {
  const canManage = ["owner", "manager"].includes(p.role);
  return <div className="omh">
    <header className="omh-head"><h1>Command Centre</h1><p>Everything you need to run successful events</p><time>{p.today}</time></header>
    <nav className="omh-range" aria-label="Dashboard time range">{(["today", "week", "month"] as const).map(range => <Link key={range} href={`/organizer?range=${range}`} aria-current={p.range === range ? "page" : undefined}>{range === "today" ? "Today" : range === "week" ? "This Week" : "This Month"}</Link>)}</nav>
    <nav className="omh-actions" aria-label="Quick actions">
      {canManage && <><Link href="/organizer/events/new?step=1"><CalendarDays size={22} />Create Event</Link><Link href="/organizer/sales?new=lead"><UserPlus size={22} />Add Lead</Link></>}
      <Link href="/organizer/marketplace"><Store size={22} />Find Provider</Link>
      {canManage && <Link href="/organizer/marketplace/requests/new?step=1"><Zap size={22} />New Request</Link>}
    </nav>
    <section aria-labelledby="omh-attention"><div className="omh-section-head"><h2 id="omh-attention">Attention Queue <span>({p.attention.length})</span></h2><Link href="/organizer/events?view=attention">View all</Link></div>
      <ul className="omh-queue">{p.attention.slice(0, 6).map(item => <li key={item.id}><Link href={item.href} className={`omh-notice ${item.severity}`}><span className="omh-notice-icon"><Clock size={21} /></span><span className="omh-notice-text"><strong>{item.title}</strong><span>{item.detail}</span></span><span className="omh-deadline">{item.dueLabel}</span><ChevronRight size={16} /></Link></li>)}
      {!p.attention.length && <li className="omh-empty"><CheckCircle2 size={20} /><span>Nothing needs your attention right now.</span></li>}</ul>
    </section>
    <section aria-labelledby="omh-events"><div className="omh-section-head"><h2 id="omh-events">Upcoming Events</h2><Link href="/organizer/events?tab=upcoming">View all</Link></div>
      <div className="omh-events">{p.upcoming.slice(0, 3).map(event => {const date = dateBadge(event.starts_at);return <Link href={`/organizer/events/${event.id}`} className="omh-event" key={event.id}>
        <div className="omh-cover">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={event.cover_image || "/assets/gd/oe-neon.webp"} alt="" loading="lazy" /><span><b>{date.day}</b>{date.mon}</span></div>
        <h3>{event.name}</h3><p><MapPin size={13} /><span>{event.venue_name || event.location || "Venue to be confirmed"}</span></p><p><Users size={13} /><span>{num(event.guest_count || event.capacity || 0)} guests</span></p><div className="omh-readiness"><span>{event.readiness >= 80 ? "On track" : "Planning"}</span><b>{event.readiness}%</b></div><progress value={event.readiness} max={100} aria-label={`${event.name} readiness`} />
      </Link>;})}</div>
      {!p.upcoming.length && <p className="omh-empty">No upcoming events. {canManage && <Link href="/organizer/events/new?step=1">Create an event</Link>}</p>}
    </section>
    <section aria-labelledby="omh-commercial"><div className="omh-section-head"><h2 id="omh-commercial">Commercial Summary</h2><Link href="/organizer/money?tab=reports">Reports</Link></div>
      <div className="omh-summary">{[{icon:Handshake,label:"Leads & Proposals",value:num(p.leadCount),href:"/organizer/sales"},{icon:CalendarDays,label:"Confirmed Bookings",value:num(p.bookingCount),href:"/organizer/marketplace?section=requests"},{icon:Ticket,label:"Ticket Revenue",value:money(p.revenue),href:"/organizer/money"},{icon:BarChart3,label:"Forecast Profit",value:money(p.forecast),href:"/organizer/money?tab=reports"}].map(({icon:Icon,...item}) => <Link key={item.label} href={item.href}><Icon size={23} /><span>{item.label}<strong>{item.value}</strong></span></Link>)}</div>
      <Link className="omh-due" href="/organizer/money?tab=receivables"><Receipt size={21} /><span>Amounts Due <strong>{money(p.amountsDue)}</strong></span><ChevronRight size={16} /></Link>
    </section>
    <section aria-labelledby="omh-agent"><div className="omh-section-head"><h2 id="omh-agent"><Sparkles size={22} />Gala Agent Briefing</h2><Link href="/organizer/agent">Open Agent</Link></div>
      <div className="omh-agent"><Link className="omh-brief-title" href="/organizer/agent?tab=history"><Sparkles size={22} /><span><strong>Recent activity</strong><small>Completed runs, supplier responses and approvals</small></span><ChevronRight size={16} /></Link>
        <div className="omh-agent-stats">{[{icon:CheckCircle2,count:p.completed,label:"Completed"},{icon:Clock,count:p.waiting,label:"Waiting"},{icon:UserCheck,count:p.approvals,label:"Approvals"}].map(({icon:Icon,...item}) => <Link key={item.label} href={`/organizer/agent?tab=${item.label === "Approvals" ? "approvals" : "history"}`}><Icon size={20} /><span><b>{num(item.count)}</b>{item.label}</span></Link>)}</div>
      </div>
    </section>
    <section aria-label="Team readiness" className="omh-team">{p.conflicts}</section>
    <div className="omh-more"><Link href="/organizer/calendar">Open calendar</Link><Link href="/organizer/team?tab=assignments">Team assignments</Link><Link href="/organizer/media">Media Studio</Link></div>
  </div>;
}
