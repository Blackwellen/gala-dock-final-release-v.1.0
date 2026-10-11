import Link from "next/link";
import { CalendarClock, CalendarDays, CheckSquare, ClipboardList, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, CheckCircle2, Circle, Sun, MapPin, Utensils, Music2, Ticket, CreditCard, MoreHorizontal, ArrowRight, Sparkles, Send, Building2, Flower2, Clock, PartyPopper, Wand2, MessageSquareMore } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { getMyEvent } from "@/lib/data/customer-events";
import { CuEventHeader } from "@/components/customer/event-header";
import { TaskCheck } from "@/components/organizer/event/controls";
import { AddTaskBtn, AddDayItem, SharePlan } from "@/components/customer/plan-client";
import { Avatar, Beta } from "@/components/kit";
import { AgentAsk } from "@/components/kit/client";
import { dayMonth, time12 } from "@/lib/format";

export const metadata = { title: "Plan" };
const CAT_ICON: Record<string, [React.ComponentType<{ size?: number }>, string]> = { "Venue & Location": [MapPin, "#e11d48"], "Food & Drink": [Utensils, "#e11d48"], Entertainment: [Music2, "#7c3aed"], "Guests & Tickets": [Ticket, "#e11d48"], Payments: [CreditCard, "#2563eb"] };
const DAY_ICON = (t: string): [React.ComponentType<{ size?: number }>, string] => /venue|access|check/i.test(t) ? [Building2, "#7c3aed"] : /decor|styling/i.test(t) ? [Flower2, "#2563eb"] : /cater|dinner/i.test(t) ? [Utensils, "#f59e0b"] : /dj|music/i.test(t) ? [Music2, "#7c3aed"] : /guest|ceremony/i.test(t) ? [PartyPopper, "#f59e0b"] : /end|close/i.test(t) ? [Clock, "#64748b"] : [CheckCircle2, "#10b981"];

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]); const ctx = await getCustomer(); const d = await getMyEvent(ctx, id); const e = d.e;
  const tab = (["checklist", "day"].includes(sp.tab ?? "") ? sp.tab : "timeline") as "timeline" | "checklist" | "day";
  const filter = sp.f ?? "all";
  const [{ data: tasksRaw }, { data: day }] = await Promise.all([
    ctx.supabase.from("tasks").select("id,title,category,status,due_at,assignee_name,milestone").eq("event_id", e.id).order("due_at", { ascending: true, nullsFirst: false }),
    ctx.supabase.from("programme_items").select("id,title,detail,starts_at,image").eq("event_id", e.id).eq("kind", "day_plan").order("starts_at"),
  ]);
  const tasks = tasksRaw ?? [];
  const counts = { all: tasks.length, todo: tasks.filter(t => t.status === "todo").length, in_progress: tasks.filter(t => t.status === "in_progress").length, done: tasks.filter(t => t.status === "done").length };
  const shown = tasks.filter(t => filter === "all" || t.status === filter);
  const cats = [...new Set(tasks.map(t => t.category))];
  // planning journey phases relative to event date (guidance only; never blocks short-notice events)
  const weeks = e.starts_at ? Math.floor((new Date(e.starts_at).getTime() - Date.now()) / (7 * 864e5)) : 99;
  const phases = [["6+ weeks", "Foundation", "Venue, key providers"], ["4–6 weeks", "Details", "Catering, entertainment"], ["2–4 weeks", "Finalise", "Guests, remaining suppliers"], ["1 week", "Confirm", "Final checks & balances"], ["Event day", "Enjoy!", "Everything comes together"]] as const;
  const cur = weeks >= 6 ? (d.s.venueOk ? 1 : 0) : weeks >= 4 ? 1 : weeks >= 2 ? 2 : weeks >= 1 ? 3 : 4;
  const curIdx = Math.max(cur, d.s.venueOk && d.s.confirmed >= 3 ? 2 : cur);
  const byMonth = new Map<string, typeof tasks>();
  for (const t of tasks.filter(t => t.due_at)) { const k = new Date(t.due_at!).toLocaleString("en-GB", { month: "short", year: "numeric" }); byMonth.set(k, [...(byMonth.get(k) ?? []), t]); }
  const stat = (t: typeof tasks[number]) => t.status === "done" ? <span className="cp-done">Completed</span> : t.due_at ? <span className="cp-due">Due {dayMonth(t.due_at)}</span> : null;
  const supplierAvatar = (n: string) => d.items.find(i => i.title.toLowerCase().startsWith(n.toLowerCase().split(" ")[0]!))?.image;
  return <div className="ce">
    <CuEventHeader d={d} tab="plan" variant="compact" buildPath />
    <section className="ce-card cp-journey">
      <div><div className="k-row" style={{ gap: 12, alignItems: "baseline" }}><h2 className="ce-h2" style={{ fontSize: 17 }}>Your planning journey</h2><span className="k-small">A simple guide to keep you on track. Times adapt to your event date.</span></div>
        <ol className="cp-phases">{phases.map(([w, l, s], i) => <li key={w} data-state={i < curIdx ? "done" : i === curIdx ? "cur" : "todo"}><span className="cp-dot">{i < curIdx ? "✓" : i + 1}</span><span><b>{w}</b><em>{l}</em><small>{s}</small></span></li>)}</ol></div>
      <div className="cp-date"><span className="k-tile lg"><CalendarClock size={22} /></span><div><b>Need to change your date?</b><p>See availability impact across all your bookings before making any changes.</p><Link className="k-btn outline sm" href={`/account/events/${e.id}/plan?change=date`}>Check new dates <ArrowRight size={12} /></Link></div></div>
    </section>
    <div className="cp-grid">
      <section className="ce-card cp-main">
        <div className="k-between" style={{ marginBottom: 12 }}><div className="cp-tabs" role="tablist">{([["timeline", "Timeline", CalendarDays], ["checklist", "Checklist", CheckSquare], ["day", "Day Plan", ClipboardList]] as const).map(([k, l, I]) => <Link key={k} role="tab" aria-selected={tab === k} href={`/account/events/${e.id}/plan${k === "timeline" ? "" : `?tab=${k}`}`}><I size={16} />{l}</Link>)}</div>
          <div className="k-row" style={{ gap: 8 }}><span className="k-btn ghost">Today</span><span className="k-icon-btn"><ChevronLeft size={15} /></span><span className="k-icon-btn"><ChevronRight size={15} /></span><span className="k-btn ghost">Week <ChevronDown size={13} /></span><SharePlan eventId={e.id} /></div></div>
        <div className={`cp-cols ${tab}`}>
          {tab !== "checklist" && tab !== "day" && <div className="cp-tl"><h3>Planning timeline</h3><p className="k-small">Key milestones and upcoming tasks.</p>
            {[...byMonth.entries()].map(([m, list], i) => <div key={m} className="cp-month"><div className="cp-month-h">{i === 1 ? <ChevronDown size={14} /> : <ChevronDown size={14} />}<b>{m}</b>{i === 1 ? <ChevronDown size={14} className="k-muted" style={{ marginLeft: "auto" }} /> : <ChevronUp size={14} className="k-muted" style={{ marginLeft: "auto" }} />}</div>
              <ul>{list.map(t => <li key={t.id}>{t.status === "done" ? <CheckCircle2 size={18} fill="#10b981" color="#fff" /> : <Circle size={18} className="k-muted" />}<span className="k-grow"><b>{t.title}</b>{t.assignee_name && t.assignee_name !== "You" && <small>{t.assignee_name}</small>}</span><span className="k-xs k-muted">{dayMonth(t.due_at)}</span></li>)}</ul></div>)}
            {e.starts_at && <div className="cp-month"><ul><li><Sun size={18} color="#f59e0b" /><b className="k-grow">Event day</b><span className="k-xs k-muted">{dayMonth(e.starts_at)}</span></li></ul></div>}</div>}
          {tab !== "day" && <div className="cp-check"><h3>Your checklist</h3><p className="k-small">Everything you need to do for a successful event.</p>
            <div className="k-between" style={{ margin: "10px 0" }}><div className="cp-filters">{([["all", "All", counts.all], ["todo", "To do", counts.todo], ["in_progress", "In progress", counts.in_progress], ["done", "Done", counts.done]] as const).map(([k, l, n]) => <Link key={k} href={`/account/events/${e.id}/plan?tab=${tab}&f=${k}`} aria-pressed={filter === k}>{k === "todo" ? <Circle size={11} /> : k === "in_progress" ? <CheckCircle2 size={11} /> : k === "done" ? <CheckCircle2 size={11} /> : null}{l} ({n})</Link>)}</div><AddTaskBtn eventId={e.id} categories={cats.length ? cats : ["General"]} /></div>
            {cats.map(c => { const list = shown.filter(t => t.category === c); if (!list.length) return null; const [I, col] = CAT_ICON[c] ?? [ClipboardList, "#2563eb"]; return <div key={c} className="cp-cat"><div className="k-between"><span className="k-row" style={{ gap: 10 }}><span style={{ color: col }}><I size={16} /></span><b>{c}</b><span className="k-muted k-small">({tasks.filter(t => t.category === c && t.status === "done").length}/{tasks.filter(t => t.category === c).length})</span></span><MoreHorizontal size={15} className="k-muted" /></div>
              <ul>{list.map(t => <li key={t.id}><TaskCheck eventId={e.id} taskId={t.id} done={t.status === "done"} title={t.title} /><span className="k-grow">{t.title}</span>{stat(t)}<span className="cp-who"><Avatar src={t.assignee_name === "You" ? "/assets/gd/av-alex-customer.webp" : supplierAvatar(t.assignee_name)} name={t.assignee_name || "You"} size="sm" />{t.assignee_name || "You"}</span></li>)}</ul></div>; })}
            {!shown.length && <p className="k-small">No tasks in this view.</p>}</div>}
          {tab === "day" && <DayPlan e={e} day={day ?? []} eventId={e.id} />}
        </div>
      </section>
      <section className="ce-card cp-day"><div className="k-between"><div><h2 className="ce-h2 sm" style={{ margin: 0 }}>Event day plan</h2><p className="k-xs k-muted">A clear timeline for you and your providers.</p></div><Link className="k-link" href={`/account/events/${e.id}/plan?tab=day`}>View full schedule <ArrowRight size={12} /></Link></div>
        <ol className="cp-dl">{(day ?? []).map((p, i) => { const [I, col] = DAY_ICON(p.title); const img = d.items.find(it => p.detail && it.title.toLowerCase().startsWith(p.detail.toLowerCase().split(" ")[0]!))?.image || ["/assets/gd/b-loft.webp", "/assets/gd/sg-wedding-decor.webp", "/assets/gd/bc-tastetango.webp", "", "/assets/gd/sg-live-band.webp", "/assets/gd/me-wedding.webp", "/assets/gd/bc-tastetango.webp", "/assets/gd/b-elite-sounds.webp", "/assets/gd/sv-loft.webp"][i];
          return <li key={p.id} data-first={i === 0}><span className="cp-dl-t">{time12(p.starts_at)}</span><i /><div className="cp-dl-card"><span className="cp-dl-ic" style={{ color: col, background: `color-mix(in srgb, ${col} 10%, #fff)` }}><I size={15} /></span><span className="k-grow"><b>{p.title}</b><small>{p.detail}</small></span>{/* eslint-disable-next-line @next/next/no-img-element */}{img && <img src={img} alt="" />}<MoreHorizontal size={14} className="k-muted" /></div></li>; })}</ol>
        <AddDayItem eventId={e.id} /></section>
    </div>
    <section className="ce-card cp-agent"><span className="cp-agent-ic"><Sparkles size={22} /></span><div><div className="k-row" style={{ gap: 8 }}><b style={{ fontSize: 17, color: "var(--k-blue)" }}>Gala Agent</b><Beta /></div><p className="k-xs">I can help you plan your timeline, chase providers, and suggest what to do next.</p></div>
      <div className="cp-agent-ask"><AgentAsk scope="customer" eventId={e.id} placeholder="Ask me anything about your event..." compact /></div>
      {([[Wand2, "Suggest a timeline for my wedding"], [Sparkles, "What should I do this week?"], [MessageSquareMore, "Chase my pending quotes"], [Send, "Help me finalise the menu"]] as const).map(([I, l]) => <Link key={l} className="cp-chip" href={`/account/events/${e.id}/plan?ask=${encodeURIComponent(l)}`}><I size={13} />{l}</Link>)}</section>
  </div>;
}
function DayPlan({ e, day, eventId }: { e: { starts_at: string | null }; day: { id: string; title: string; detail: string; starts_at: string }[]; eventId: string }) {
  return <div className="cp-check"><h3>Day plan</h3><p className="k-small">Your run of the day — share it with suppliers and helpers.</p>
    <table className="k-table" style={{ marginTop: 10 }}><thead><tr><th>Time</th><th>What</th><th>Who / where</th></tr></thead><tbody>{day.map(p => <tr key={p.id}><td>{time12(p.starts_at)}</td><td style={{ color: "var(--k-ink)" }}>{p.title}</td><td>{p.detail}</td></tr>)}</tbody></table>
    {!day.length && <p className="k-small">{e.starts_at ? "No day plan yet." : "Set your event date to build a day plan."}</p>}<div style={{ marginTop: 10 }}><AddDayItem eventId={eventId} /></div></div>;
}
