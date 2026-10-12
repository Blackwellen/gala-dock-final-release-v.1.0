import Link from "next/link";
import { AlertCircle, CalendarDays, ChevronRight, MapPin, Users, MoreHorizontal, Zap, UserPlus, FileText, Package, Send, Store, BarChart3, CheckCircle2, Clock, UserCheck, Lightbulb, MessageSquare, AlertTriangle, Sparkles, DollarSign, Receipt, ArrowRight, ChevronDown, CalendarRange } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { listWorkspaceEvents, withStats, attentionQueue, ledgerSeries, shiftConflicts } from "@/lib/data/organizer";
import { Card, Chip, Tile, Spark, Bar, DateBox, Avatar, Beta } from "@/components/kit";
import { dateBadge, money, num, relative, dateShort } from "@/lib/format";
import { TeamConflicts } from "@/components/ops/readiness-panel";
import { requestTime } from "@/lib/workspace/format";

export const metadata = { title: "Command Centre" };
const RANGES = { today: 1, week: 7, month: 31 } as const;

export default async function CommandCentre({ searchParams }: PageProps<"/organizer">) {
  const sp = await searchParams; const range = (["today", "week", "month"].includes(String(sp.range)) ? sp.range : "today") as keyof typeof RANGES;
  const ctx = await getOrganizer(); const nowMs = requestTime(); const sb = ctx.supabase; const ws = ctx.workspace.id;
  const all = await withStats(sb, await listWorkspaceEvents(sb, ws));
  const now = new Date(nowMs).toISOString();
  const upcoming = all.filter(e => e.starts_at && e.starts_at >= now && !["cancelled", "archived", "completed"].includes(e.status)).slice(0, 4);
  const horizon = new Date(nowMs + RANGES[range] * 864e5 * 30).toISOString(); // attention looks ahead; range narrows recency of items shown
  const attention = (await attentionQueue(sb, ws, all)).filter(a => !a.due || a.due <= horizon);
  const eventIds = all.map(e => e.id);
  const [leads, proposals, confirmed, dues, invoicesOut, runs, approvals, threads, tasks, shifts, series] = await Promise.all([
    sb.from("leads").select("id,created_at,stage").eq("workspace_id", ws).not("stage", "in", "(won,lost)"),
    sb.from("proposals").select("id", { count: "exact", head: true }).eq("workspace_id", ws).in("status", ["draft", "sent", "viewed"]),
    eventIds.length ? sb.from("build_items").select("id,updated_at").in("event_id", eventIds).eq("status", "confirmed") : Promise.resolve({ data: [] }),
    eventIds.length ? sb.from("payments").select("amount,event_id").in("event_id", eventIds).in("status", ["due", "overdue", "scheduled"]) : Promise.resolve({ data: [] }),
    sb.from("invoices").select("total,amount_paid,event_id").eq("workspace_id", ws).in("status", ["sent", "viewed", "partial", "overdue"]),
    sb.from("agent_runs").select("status").eq("workspace_id", ws),
    sb.from("agent_approvals").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("status", "pending"),
    eventIds.length ? sb.from("threads").select("id,title,subtitle,image,event_id,updated_at,messages(body,created_at,read_at,from_provider)").in("event_id", eventIds).order("updated_at", { ascending: false }).limit(4) : Promise.resolve({ data: [] }),
    sb.from("tasks").select("id,title,assignee_name,due_at,status,priority").eq("workspace_id", ws).is("event_id", null).order("due_at").limit(6),
    sb.from("shifts").select("id,crew_id,starts_at,ends_at,status").eq("workspace_id", ws),
    ledgerSeries(sb, ws),
  ]);
  const { data: crew } = await sb.from("crew_members").select("name,avatar").eq("workspace_id", ws);
  const avatarOf = (n: string) => crew?.find(c => c.name === n)?.avatar ?? null;
  const ticketRevenue = all.reduce((s, e) => s + e.ticketRevenue, 0);
  const forecastProfit = upcoming.reduce((s, e) => s + Number(e.target_profit ?? 0), 0);
  const amountsDue = (dues.data ?? []).reduce((s, p) => s + Number(p.amount), 0) + (invoicesOut.data ?? []).reduce((s, i) => s + Number(i.total) - Number(i.amount_paid), 0);
  const dueEvents = new Set([...(dues.data ?? []).map(p => p.event_id), ...(invoicesOut.data ?? []).map(i => i.event_id)].filter(Boolean)).size;
  const leadCount = (leads.data?.length ?? 0) + (proposals.count ?? 0);
  const leads30 = (leads.data ?? []).filter(l => l.created_at > new Date(nowMs - 30 * 864e5).toISOString()).length;
  const runStats = { done: (runs.data ?? []).filter(r => r.status === "completed").length, waiting: (runs.data ?? []).filter(r => r.status === "waiting_external").length };
  const conflicts = shiftConflicts(shifts.data ?? []).length;
  const overdueTasks = (tasks.data ?? []).filter(t => t.status !== "done" && t.due_at && t.due_at < now).length;
  const today = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric", timeZone: "Europe/London" }).format(new Date());
  const sev = { critical: { chip: "red", label: "Critical", bg: "#fff5f5" }, high: { chip: "amber", label: "High", bg: "#fffaf2" }, action: { chip: "purple", label: "Action needed", bg: "#f8f5ff" } } as const;
  const statusOf = (r: number) => r >= 80 ? ["On track", "green"] : r >= 60 ? ["In progress", "blue"] : r >= 45 ? ["At risk", "amber"] : ["Needs attention", "red"];

  return <>
    <div className="k-page-head" style={{ alignItems: "center" }}>
      <div><h1 style={{ fontSize: 30 }}>Command Centre</h1><p className="sub" style={{ fontSize: 15 }}>Everything you need to run successful events, all in one place.</p></div>
      <div className="k-row" style={{ gap: 18 }}><span className="k-muted" style={{ fontSize: 13 }}>{today}</span>
        <div className="k-seg solid" role="group" aria-label="Time range">{(["today", "week", "month"] as const).map(r => <Link key={r} href={`/organizer?range=${r}`} aria-current={(range === r) ? "page" : undefined} scroll={false}>{r === "today" ? "Today" : r === "week" ? "This Week" : "This Month"}</Link>)}</div>
      </div>
    </div>
    <TeamConflicts workspaceId={ctx.workspace.id} limit={4} />

    <Card aria-label="Attention queue">
      <div className="k-between" style={{ marginBottom: 10 }}>
        <div className="k-row" style={{ gap: 12, alignItems: "flex-start" }}><span className="oh-alert" aria-hidden><AlertCircle size={20} /></span><div><div className="k-row" style={{ gap: 10 }}><h2 style={{ fontSize: 17 }}>Attention queue</h2>{attention.length > 0 && <Chip tone="red" lg>{attention.length} items require your attention</Chip>}</div><p className="k-small">Time-sensitive items and critical updates across your events.</p></div></div>
        <Link className="k-link" href="/organizer/events?view=attention">View all ({attention.length}) <ArrowRight size={13} /></Link>
      </div>
      {attention.length === 0 ? <div className="k-notice green"><CheckCircle2 size={16} className="k-green" /><span><b>Nothing needs your attention.</b> Holds, payments, supplier responses and ticket pace are all on track.</span></div> :
        <div className="oh-attn">{attention.slice(0, 4).map(a => <Link key={a.id} href={a.href} className="oh-attn-card" style={{ background: sev[a.severity].bg, borderColor: a.severity === "critical" ? "#fbd5da" : a.severity === "high" ? "#fbe3bf" : "#e6dcfb" }}>
          <div className="k-between"><div className="k-row" style={{ gap: 6 }}><Chip tone={sev[a.severity].chip}>{a.severity === "critical" ? <AlertCircle size={11} /> : a.severity === "high" ? <AlertTriangle size={11} /> : <CalendarDays size={11} />}{sev[a.severity].label}</Chip>{a.severity !== "action" && <Chip tone={sev[a.severity].chip}>{a.dueLabel}</Chip>}</div><ChevronRight size={16} className="k-muted" /></div>
          <div className="k-row" style={{ gap: 12, marginTop: 10, alignItems: "flex-start" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {a.image && <img src={a.image} alt="" className="oh-attn-img" />}
            <div className="k-grow"><b className="oh-attn-title">{a.title}</b><p className="oh-attn-detail">{a.detail}</p><span className="k-link" style={{ marginTop: 4 }}>{a.cta} <ArrowRight size={12} /></span></div>
          </div>
        </Link>)}</div>}
    </Card>

    <div className="oh-row2">
      <Card aria-label="Upcoming events">
        <div className="k-between" style={{ marginBottom: 10 }}><div className="k-row" style={{ gap: 12 }}><Tile icon={CalendarDays} /><div><h2 style={{ fontSize: 15.5 }}>Upcoming events</h2><p className="k-small">Your next events and key milestones.</p></div></div><Link className="k-link" href="/organizer/calendar">View Calendar <ArrowRight size={13} /></Link></div>
        {upcoming.length === 0 ? <div className="k-empty"><h3>No upcoming events</h3><p>Create your first professional event to start planning.</p><Link className="k-btn primary" href="/organizer/events/new?step=1">Create event</Link></div> :
          <div className="oh-upcoming">{upcoming.map(e => { const d = dateBadge(e.starts_at); const pctSold = e.ticketCap ? Math.round((100 * e.sold) / e.ticketCap) : e.readiness; const [label, tone] = statusOf(e.readiness); return <div key={e.id} className="oh-up-row">
            <DateBox mon={d.mon} day={d.day} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.cover_image} alt="" className="oh-up-img" />
            <div className="oh-up-name"><Link href={`/organizer/events/${e.id}`} className="k-strong k-ellipsis" style={{ display: "block", fontSize: 13 }}>{e.name}</Link><span className="k-row k-small k-muted" style={{ gap: 4 }}><MapPin size={12} />{e.location || e.venue_name}</span></div>
            <span className="k-row k-small" style={{ gap: 5, color: "var(--k-ink-2)" }}><Users size={13} />{num(e.sold)} / {num(e.ticketCap)}</span>
            <div className="oh-up-bar"><span className="k-small">{pctSold}%</span><Bar value={pctSold} tone={pctSold >= 90 ? "green" : pctSold >= 70 ? undefined : "purple"} label={`${e.name} tickets sold`} /></div>
            <div className="oh-up-task">{e.nextTask ? <><span className="k-row k-small" style={{ gap: 5, color: "var(--k-ink-2)" }}><CalendarDays size={12} />{e.nextTask.title}</span><span className={`k-xs ${e.nextTask.due_at && e.nextTask.due_at < new Date(nowMs + 864e5).toISOString() ? "k-red" : "k-muted"}`}>{e.nextTask.due_at ? `Due ${dateShort(e.nextTask.due_at)}` : "No due date"}</span></> : <span className="k-xs k-muted">No open tasks</span>}</div>
            <Chip tone={tone as "green"}>{label}</Chip>
            <Link href={`/organizer/events/${e.id}`} className="k-icon-btn plain" aria-label={`Open ${e.name}`}><MoreHorizontal size={16} /></Link>
          </div>; })}</div>}
      </Card>
      <section className="oh-quick" aria-label="Quick create">
        <div className="k-between" style={{ marginBottom: 12 }}><div className="k-row" style={{ gap: 10 }}><span className="oh-zap"><Zap size={17} /></span><h2 style={{ fontSize: 17, color: "var(--k-blue)" }}>Quick create</h2></div><ChevronDown size={16} className="k-muted" aria-hidden /></div>
        <div className="k-grid k-g2" style={{ gap: 10 }}>{[["New event", CalendarDays, "/organizer/events/new?step=1"], ["Add lead", UserPlus, "/organizer/sales?new=lead"], ["Create proposal", FileText, "/organizer/proposals/new?step=1"], ["Add booking", Package, "/organizer/marketplace/requests/new?step=1"], ["Send campaign", Send, upcoming[0] ? `/organizer/events/${upcoming[0].id}/promotion/new?step=1` : "/organizer/tickets"], ["Find a provider", Store, "/organizer/marketplace"]].map(([l, I, h]) => { const Icon = I as typeof Send; return <Link key={l as string} href={h as string} className="oh-quick-btn"><Icon size={18} aria-hidden />{l as string}</Link>; })}</div>
      </section>
    </div>

    <Card aria-label="Commercial summary">
      <div className="k-between" style={{ marginBottom: 12 }}><div className="k-row" style={{ gap: 12 }}><Tile icon={BarChart3} /><div><h2 style={{ fontSize: 15.5 }}>Commercial summary</h2><p className="k-small">Performance across all events and revenue streams.</p></div></div>
        <div className="k-row" style={{ gap: 14 }}><Link className="k-link" href="/organizer/money?tab=reports">View detailed reports <ArrowRight size={13} /></Link><span className="k-btn ghost sm"><CalendarRange size={14} />Last 30 days</span></div></div>
      <div className="k-grid k-g5">
        <SumKpi icon={Users} tone="blue" label="Leads & Proposals" value={num(leadCount)} sub={`${leads30} new in last 30 days`} spark={series.income.map((v, i) => v / 1000 + i)} color="#3b82f6" href="/organizer/sales" />
        <SumKpi icon={CalendarDays} tone="purple" label="Confirmed Bookings" value={num(confirmed.data?.length ?? 0)} sub="across all events" spark={series.costs.map(v => v / 1000)} color="#a855f7" href="/organizer/marketplace?section=requests" />
        <SumKpi icon={DollarSign} tone="green" label="Ticket Revenue" value={money(ticketRevenue)} sub="gross, all tiers" spark={series.income} color="#16a34a" href="/organizer/money" />
        <SumKpi icon={BarChart3} tone="purple" label="Forecast Profit" value={money(forecastProfit)} sub="upcoming events" spark={series.income.map((v, i) => v - series.costs[i]!)} color="#7c3aed" href="/organizer/money?tab=reports" />
        <SumKpi icon={Receipt} tone="red" label="Amounts Due" value={money(amountsDue)} sub={`across ${dueEvents} event${dueEvents === 1 ? "" : "s"}`} spark={series.costs} color="#e5364f" href="/organizer/money?tab=receivables" />
      </div>
    </Card>

    <div className="oh-row4">
      <Card aria-label="Gala Agent morning briefing">
        <div className="k-between" style={{ marginBottom: 10 }}><div className="k-row" style={{ gap: 10, alignItems: "flex-start" }}><Sparkles size={22} className="k-purple" aria-hidden /><div><div className="k-row" style={{ gap: 8 }}><h2 style={{ fontSize: 14.5 }}>Gala Agent morning briefing</h2><Beta /></div><p className="k-small">Your AI partner has been working to move things forward.</p></div></div><Link className="k-link" href="/organizer/agent?tab=history">View all activity <ArrowRight size={13} /></Link></div>
        <div className="k-grid k-g4" style={{ gap: 8 }}>{[[runStats.done, "Tasks completed", CheckCircle2, "#ecfaf2", "var(--k-green)"], [runStats.waiting, "Waiting on response", Clock, "#fff6e8", "var(--k-amber)"], [approvals.count ?? 0, "Approvals needed", UserCheck, "#f4efff", "var(--k-purple)"], [Math.min(attention.length, 9), "Suggested actions", Lightbulb, "#eef4ff", "var(--k-blue)"]].map(([n, l, I, bg, c]) => { const Icon = I as typeof Clock; return <div key={l as string} className="oh-brief" style={{ background: bg as string }}><span style={{ color: c as string }}><Icon size={18} /></span><div><b>{n as number}</b><small>{l as string}</small></div></div>; })}</div>
        <h3 style={{ fontSize: 12.5, margin: "12px 0 6px" }}>Top recommendations for today</h3>
        <div className="k-list">{attention.slice(0, 3).map(a => <div key={a.id} className="k-li"><span className={a.severity === "critical" ? "k-red" : "k-blue"}>{a.severity === "critical" ? <Clock size={15} /> : <Send size={15} />}</span><div className="k-grow"><div className="k-small k-strong" style={{ fontWeight: 550 }}>{a.title}: {a.detail}</div><div className="k-xs k-muted">{a.severity === "critical" ? "High impact" : "Recommended"} · {a.dueLabel}</div></div><Link href={a.href} className="k-btn soft sm">{a.cta}</Link></div>)}
          {attention.length === 0 && <p className="k-small">No recommendations right now — your events are on track.</p>}</div>
      </Card>
      <Card aria-label="Recent communications">
        <div className="k-between" style={{ marginBottom: 10 }}><div className="k-row" style={{ gap: 10 }}><MessageSquare size={19} className="k-blue" aria-hidden /><h2 style={{ fontSize: 14.5 }}>Recent communications</h2></div></div>
        <div className="k-col" style={{ gap: 6 }}>{(threads.data ?? []).map(t => { const msgs = (t.messages ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at)); const last = msgs[0]; const unread = msgs.filter(m => m.from_provider && !m.read_at).length; return <Link key={t.id} href={`/organizer/events/${t.event_id}?tab=plan&section=suppliers`} className="oh-comm" style={unread ? { background: "#f5f8ff" } : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.image || "/assets/gd/oe-neon.webp"} alt="" className="k-thumb" />
          <div className="k-grow"><div className="k-between"><b className="k-small k-ellipsis">{t.title}</b><span className="k-xs k-muted">{relative(t.updated_at)}</span></div><div className="k-xs k-ellipsis" style={{ color: "var(--k-ink-2)" }}>{t.subtitle}</div><div className="k-xs k-muted k-ellipsis">{last?.body ?? ""}</div></div>
          {unread > 0 ? <span className="oh-count">{unread}</span> : <ChevronRight size={15} className="k-muted" />}
        </Link>; })}{!(threads.data ?? []).length && <p className="k-small">No supplier conversations yet.</p>}</div>
      </Card>
      <Card aria-label="Team and assignments">
        <div className="k-between" style={{ marginBottom: 10 }}><div className="k-row" style={{ gap: 10 }}><Users size={19} className="k-blue" aria-hidden /><h2 style={{ fontSize: 14.5 }}>Team & assignments</h2></div><Link className="k-link" href="/organizer/team">View all <ArrowRight size={13} /></Link></div>
        {conflicts > 0 && <Link href="/organizer/team?tab=availability" className="oh-warn"><AlertTriangle size={15} />{conflicts} team conflict{conflicts === 1 ? "" : "s"}<span className="k-link" style={{ marginLeft: "auto" }}>View conflicts <ArrowRight size={12} /></span></Link>}
        {overdueTasks > 0 && <Link href="/organizer/team?tab=assignments" className="oh-warn"><AlertTriangle size={15} />{overdueTasks} task{overdueTasks === 1 ? "" : "s"} overdue<span className="k-link" style={{ marginLeft: "auto" }}>Review tasks <ArrowRight size={12} /></span></Link>}
        <h3 style={{ fontSize: 12.5, margin: "10px 0 4px" }}>Today&apos;s key assignments</h3>
        <ul className="k-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>{(tasks.data ?? []).slice(0, 4).map(t => <li key={t.id} className="k-li"><span className="k-check"><input type="checkbox" defaultChecked={t.status === "done"} disabled aria-label={t.title} /></span><span className="k-grow k-small" style={{ textDecoration: t.status === "done" ? "line-through" : undefined, color: t.status === "done" ? "var(--k-muted)" : "var(--k-ink-2)" }}>{t.title}</span><Avatar src={avatarOf(t.assignee_name)} name={t.assignee_name || "Unassigned"} size="sm" /><span className="k-xs k-muted" style={{ width: 70 }}>{t.assignee_name.split(" ")[0]}</span><span className="k-xs k-muted" style={{ width: 44, textAlign: "right" }}>{t.due_at ? (t.due_at.slice(0, 10) === now.slice(0, 10) ? "Today" : dateShort(t.due_at).replace(/ \d{4}$/, "")) : "—"}</span></li>)}</ul>
      </Card>
    </div>
  </>;
}

function SumKpi({ icon: Icon, tone, label, value, sub, spark, color, href }: { icon: typeof Users; tone: "blue" | "purple" | "green" | "red"; label: string; value: string; sub: string; spark: number[]; color: string; href: string }) {
  return <Link href={href} className="oh-sum"><Tile icon={Icon} tone={tone} /><div className="k-grow"><div className="k-small" style={{ color: "var(--k-ink-2)" }}>{label}</div><div className="oh-sum-val">{value}</div><div className="k-xs k-muted">{sub}</div></div><Spark data={spark} color={color} width={64} height={38} /></Link>;
}
