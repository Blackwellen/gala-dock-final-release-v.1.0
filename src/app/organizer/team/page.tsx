import Link from "next/link";
import { Users, CalendarDays, AlertTriangle, ShieldAlert, CalendarClock, ChevronLeft, ChevronRight, Search, CheckCircle2, Clock, ArrowRight, Wrench, UserSearch, GitMerge, Send, Plane, Ban, Sparkles } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { Crumbs, LinkTabs, Beta } from "@/components/kit";
import { TeamHeaderActions, PersonRowMenu, ShiftMenu, ResolveButton } from "@/components/organizer/team-client";

export const metadata = { title: "Team" };
const TZ = "Europe/London";
const ST: Record<string, [string, string]> = { active: ["Active", "green"], available: ["Available", "green"], on_event: ["On Event", "amber"], unavailable: ["Unavailable", "red"], deactivated: ["Deactivated", "gray"] };
const SH: Record<string, [string, string]> = { confirmed: ["Confirmed", "green"], pending: ["Pending", "amber"], draft: ["Draft", "gray"], unavailable: ["Unavailable", "gray"], travel: ["Travel", "gray"] };
const COL = ["blue", "pink", "purple", "green"];

export default async function TeamPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const ctx = await getOrganizer(); const sb = ctx.supabase; const ws = ctx.workspace.id;
  const tab = ["availability", "assignments", "shifts"].includes(sp.tab ?? "") ? sp.tab! : "people";
  const who = ["member", "crew"].includes(sp.type ?? "") ? sp.type! : "all";
  const q = (sp.q ?? "").toLowerCase();
  // Week window (Mon–Sun) for the availability board.
  let anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.week ?? "") ? new Date(`${sp.week}T12:00:00Z`) : new Date();
  if (!sp.week) { const { data: nx } = await sb.from("shifts").select("starts_at").eq("workspace_id", ctx.workspace.id).not("crew_id", "is", null).gte("ends_at", new Date().toISOString()).order("starts_at").limit(1).maybeSingle(); if (nx) anchor = new Date(nx.starts_at); }
  const mon = new Date(anchor); mon.setUTCDate(anchor.getUTCDate() - ((anchor.getUTCDay() + 6) % 7)); mon.setUTCHours(0, 0, 0, 0);
  const sun = new Date(mon.getTime() + 7 * 864e5); const days = Array.from({ length: 7 }, (_, i) => new Date(mon.getTime() + i * 864e5));
  const now = new Date();
  const [{ data: crew }, { data: shifts }, { data: blocks }, { data: events }] = await Promise.all([
    sb.from("crew_members").select("id,name,role,member_type,status,avatar,email,location,skills").eq("workspace_id", ws).neq("status", "deactivated").order("member_type").order("name"),
    sb.from("shifts").select("id,crew_id,event_id,title,role,starts_at,ends_at,location,status,headcount").eq("workspace_id", ws).gte("ends_at", new Date(Math.min(mon.getTime(), now.getTime())).toISOString()).order("starts_at").limit(400),
    sb.from("availability_blocks").select("id,crew_id,kind,starts_at,ends_at,note").eq("workspace_id", ws).not("crew_id", "is", null).gte("ends_at", mon.toISOString()).lt("starts_at", sun.toISOString()),
    sb.from("events").select("id,name,starts_at,ends_at,venue_name,location").eq("workspace_id", ws).gte("starts_at", now.toISOString()).order("starts_at").limit(30),
  ]);
  const people = crew ?? []; const S = shifts ?? [];
  const list = people.filter(p => (who === "all" || p.member_type === who) && (!q || `${p.name} ${p.role}`.toLowerCase().includes(q)));
  const upcoming = S.filter(s => s.starts_at >= now.toISOString());
  const assigned = new Set(upcoming.filter(s => s.crew_id && ["confirmed", "pending"].includes(s.status)).map(s => s.crew_id));
  const in7 = upcoming.filter(s => Date.parse(s.starts_at) < now.getTime() + 7 * 864e5);
  const unfilled = upcoming.filter(s => !s.crew_id || s.status === "draft");
  // Conflicts: overlapping active shifts for the same person, or tight turnarounds (< 3h).
  const conflicts: { kind: "double" | "travel"; crew: string; a: typeof S[number]; b: typeof S[number] }[] = [];
  const byCrew = new Map<string, typeof S>(); for (const s of upcoming.filter(x => x.crew_id && ["confirmed", "pending"].includes(x.status))) byCrew.set(s.crew_id!, [...(byCrew.get(s.crew_id!) ?? []), s]);
  for (const [c, arr] of byCrew) for (let i = 1; i < arr.length; i++) { const a = arr[i - 1]!, b = arr[i]!; if (b.starts_at < a.ends_at && a.event_id !== b.event_id) conflicts.push({ kind: "double", crew: c, a, b }); else if (a.event_id !== b.event_id && Date.parse(b.starts_at) - Date.parse(a.ends_at) < 3 * 36e5 && b.starts_at >= a.ends_at) conflicts.push({ kind: "travel", crew: c, a, b }); }
  const name = (id: string | null) => people.find(p => p.id === id)?.name ?? "Unassigned";
  const fmtD = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
  const fmtT = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const href = (p: Record<string, string | undefined>) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries({ tab: tab === "people" ? undefined : tab, type: who === "all" ? undefined : who, q: sp.q, week: sp.week, view: sp.view, ...p })) if (v) u.set(k, v); return `/organizer/team${u.size ? `?${u}` : ""}`; };
  const weekLabel = `${mon.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} – ${new Date(sun.getTime() - 864e5).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const board = people.filter(p => S.some(s => s.crew_id === p.id && s.ends_at > mon.toISOString() && s.starts_at < sun.toISOString()) || (blocks ?? []).some(b => b.crew_id === p.id)).slice(0, 8);
  const bar = (startIso: string, endIso: string) => { const s = Math.max(mon.getTime(), Date.parse(startIso)), e = Math.min(sun.getTime(), Date.parse(endIso)); const day = (s - mon.getTime()) / 864e5; const len = Math.max(0.55, (e - s) / 864e5); return { left: `${(Math.floor(day) / 7) * 100}%`, width: `${(Math.max(1, Math.ceil(day + len) - Math.floor(day)) / 7) * 100}%` }; };
  const shiftRows = [...in7.length ? in7 : upcoming].slice(0, 6);
  const grouped = Object.values(shiftRows.reduce<Record<string, { key: string; s: typeof S[number]; people: string[] }>>((acc, s) => { const k = `${s.event_id}|${s.role}|${s.starts_at}`; acc[k] ??= { key: k, s, people: [] }; if (s.crew_id) acc[k].people.push(s.crew_id); return acc; }, {}));

  return <div className="tm">
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Team" }]} />
    <div className="k-page-head"><div className="k-grow"><h1>Team</h1><p className="sub">Manage workspace people, crew, availability and assignments.</p></div><TeamHeaderActions events={(events ?? []).map(e => ({ id: e.id, name: e.name, starts_at: e.starts_at, ends_at: e.ends_at }))} people={people.map(p => ({ id: p.id, name: p.name }))} /></div>
    <LinkTabs current={tab} tabs={[["people", "People"], ["availability", "Availability"], ["assignments", "Assignments"], ["shifts", "Shifts"]].map(([k, l]) => ({ key: k, label: l, href: href({ tab: k === "people" ? undefined : k }) }))} />
    <div className="tm-kpis">{([[Users, "Total people", people.length, `${people.filter(p => p.member_type === "member").length} members · ${people.filter(p => p.member_type === "crew").length} crew`, "blue", ""], [CalendarDays, "Assigned to events", assigned.size, `${people.length ? Math.round((assigned.size / people.length) * 100) : 0}% of team`, "blue", ""], [AlertTriangle, "Unfilled roles", unfilled.length, unfilled.length ? "Needs attention" : "All roles filled", "red", unfilled.length ? "warn" : ""], [ShieldAlert, "Conflicts", conflicts.length, "Next 30 days", "pink", ""], [CalendarClock, "Upcoming shifts", in7.length, "Next 7 days", "blue", ""]] as const).map(([I, l, v, s, c, w]) => <div key={l} className="k-card tm-kpi"><span><small>{l}</small><b>{v}</b><em className={w}>{w && <AlertTriangle size={12} />}{s}</em></span><span className={`tm-ki ${c}`}><I size={20} /></span></div>)}</div>

    <div className="tm-row1">
      <section className="k-card tm-people"><h2>Team members &amp; crew</h2>
        <div className="tm-seg">{([["all", `All (${people.length})`], ["member", `Members (${people.filter(p => p.member_type === "member").length})`], ["crew", `External Crew (${people.filter(p => p.member_type === "crew").length})`]] as const).map(([k, l]) => <Link key={k} href={href({ type: k === "all" ? undefined : k })} aria-current={who === k ? "true" : undefined}>{l}</Link>)}</div>
        <form className="tm-search" action="/organizer/team">{who !== "all" && <input type="hidden" name="type" value={who} />}<span><Search size={15} /><input name="q" defaultValue={sp.q ?? ""} placeholder="Search people..." aria-label="Search people" /></span></form>
        <table className="tm-table"><thead><tr><th>Name</th><th>Role</th><th>Type</th><th>Status</th><th /></tr></thead><tbody>{list.slice(0, sp.all ? 200 : 10).map(p => { const [sl, st] = (assigned.has(p.id) && p.status === "available") ? ["On Event", "amber"] : ST[p.status] ?? [p.status, "gray"]; return <tr key={p.id}><td><Link href={`/organizer/team/${p.id}`} className="tm-who">{p.avatar ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.avatar} alt="" /> : <span className="tm-av">{p.name.slice(0, 1)}</span>}<b>{p.name}</b></Link></td><td>{p.role}</td><td>{p.member_type === "member" ? "Member" : "Crew"}</td><td><span className={`tm-st ${st}`}>{st === "green" ? <CheckCircle2 size={12} /> : st === "amber" ? <Clock size={12} /> : <Ban size={12} />}{sl}</span></td><td><PersonRowMenu id={p.id} name={p.name} status={p.status} /></td></tr>; })}</tbody></table>
        {list.length > 10 && !sp.all && <Link className="tm-more" href={href({ all: "1" })}>Show all {list.length}</Link>}
        <TeamHeaderActions compact events={[]} people={[]} /></section>

      <section className="k-card tm-board"><div className="k-between tm-bh"><h2>Availability &amp; assignments</h2></div>
        <div className="k-between tm-bt"><span className="tm-week"><Link href={href({ week: ymd(new Date(mon.getTime() - 7 * 864e5)) })} aria-label="Previous week"><ChevronLeft size={16} /></Link><b>{weekLabel}</b><Link href={href({ week: ymd(new Date(mon.getTime() + 7 * 864e5)) })} aria-label="Next week"><ChevronRight size={16} /></Link><Link className="tm-this" href={href({ week: undefined })}>This week</Link></span>
          <span className="tm-seg sm">{["Day", "Week", "Month"].map(v => <span key={v} aria-current={v === "Week" ? "true" : undefined}>{v}</span>)}</span></div>
        <div className="tm-grid"><div className="tm-gh"><span />{days.map(d => <span key={d.toISOString()}>{d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</span>)}</div>
          {board.map(p => <div key={p.id} className="tm-gr"><Link href={`/organizer/team/${p.id}`} className="tm-gp">{p.avatar ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.avatar} alt="" /> : <span className="tm-av">{p.name.slice(0, 1)}</span>}<span><b>{p.name}</b><small>{p.role}</small></span></Link>
            <div className="tm-lane">{S.filter(s => s.crew_id === p.id && s.ends_at > mon.toISOString() && s.starts_at < sun.toISOString()).map((s, i) => <Link key={s.id} href={s.event_id ? `/organizer/events/${s.event_id}?tab=ops` : "#"} className={`tm-bar ${s.status === "travel" ? "gray" : COL[i % COL.length]}`} style={bar(s.starts_at, s.ends_at)} title={`${s.title} · ${s.role} · ${fmtT(s.starts_at)}–${fmtT(s.ends_at)}`}><b>{s.title}</b><small>{s.role || s.location}</small></Link>)}
              {(blocks ?? []).filter(b => b.crew_id === p.id).map(b => <span key={b.id} className="tm-bar gray" style={bar(b.starts_at, b.ends_at)} title={b.note}>{b.kind === "travel" ? <Plane size={13} /> : <Ban size={13} />}<b>{b.kind === "travel" ? "Travel" : "Unavailable"}</b></span>)}</div></div>)}
          {!board.length && <p className="k-small tm-none">No assignments this week.</p>}</div></section>
    </div>

    <div className="tm-row2">
      <section className="k-card tm-shifts"><div className="k-between"><h2>Upcoming shifts</h2><Link className="k-link" href={href({ tab: "shifts" })}>View all shifts <ArrowRight size={13} /></Link></div>
        <table className="tm-table"><thead><tr><th>Date</th><th>Time</th><th>Event</th><th>Role</th><th>People</th><th>Status</th><th>Actions</th></tr></thead><tbody>{grouped.map(g => { const [sl, st] = SH[g.s.status] ?? [g.s.status, "gray"]; return <tr key={g.key}><td>{fmtD(g.s.starts_at)}</td><td>{fmtT(g.s.starts_at)} – {fmtT(g.s.ends_at)}</td><td><b>{g.s.title}</b><small>{g.s.location}</small></td><td>{g.s.role}</td><td><span className="tm-avs">{g.people.slice(0, 4).map(id => { const p = people.find(x => x.id === id); return p?.avatar ? /* eslint-disable-next-line @next/next/no-img-element */ <img key={id} src={p.avatar} alt={p.name} /> : <span key={id} className="tm-av sm">{name(id).slice(0, 1)}</span>; })}<em>{g.people.length || g.s.headcount}</em></span></td><td><span className={`tm-st ${st}`}>{st === "green" ? <CheckCircle2 size={12} /> : <Clock size={12} />}{sl}</span></td><td><ShiftMenu id={g.s.id} status={g.s.status} eventId={g.s.event_id} /></td></tr>; })}{!grouped.length && <tr><td colSpan={7} className="k-small" style={{ padding: 14 }}>No upcoming shifts.</td></tr>}</tbody></table></section>
      <section className="k-card tm-conf"><div className="k-between"><h2>Conflicts &amp; gaps</h2><Link className="k-link" href={href({ tab: "assignments" })}>View all <ArrowRight size={13} /></Link></div>
        <ul>{conflicts.slice(0, 2).map((c, i) => <li key={i}><span className={`tm-ci ${c.kind === "double" ? "red" : "amber"}`}>{c.kind === "double" ? <ShieldAlert size={18} /> : <Clock size={18} />}</span><span className="k-grow"><b>{c.kind === "double" ? "Double booking" : "Travel gap"}</b><small>{c.kind === "double" ? `${name(c.crew)} is assigned to two events at the same time.` : `Only ${Math.max(0, Math.round((Date.parse(c.b.starts_at) - Date.parse(c.a.ends_at)) / 36e5))} hours between events for ${name(c.crew)}.`}</small><small>{fmtD(c.b.starts_at)} · {fmtT(c.b.starts_at)} – {fmtT(c.b.ends_at)}</small></span><ResolveButton href={`/organizer/team/${c.crew}`} label="Review" /></li>)}
          {unfilled.slice(0, 1).map(u => <li key={u.id}><span className="tm-ci amber"><AlertTriangle size={18} /></span><span className="k-grow"><b>Missing role coverage</b><small>No confirmed {u.role || "crew"} for {u.title}.</small><small>{fmtD(u.starts_at)} · {fmtT(u.starts_at)} – {fmtT(u.ends_at)}</small></span><ResolveButton href={href({ tab: "assignments" })} label="Assign" /></li>)}
          {!conflicts.length && !unfilled.length && <li><span className="tm-ci green"><CheckCircle2 size={18} /></span><span className="k-grow"><b>All key roles filled</b><small>Your events have the recommended role coverage.</small></span></li>}</ul></section>
      <section className="k-card tm-ai"><div className="k-row" style={{ gap: 8 }}><Sparkles size={18} className="k-blue" /><b>AI Assistant</b><Beta /></div>
        {([[Wrench, "Build staffing plan", "Generate a full staffing plan for this event", "amber"], [UserSearch, "Find available crew", "Show crew matching required skills", "purple"], [GitMerge, "Resolve conflicts", "Suggest changes to fix scheduling conflicts", "amber"], [Send, "Draft assignment messages", "Create and send invites to crew", "purple"]] as const).map(([I, t, d, c]) => <Link key={t} href={`/organizer/agent?goal=${encodeURIComponent(t)}`} className="tm-ail"><span className={`tm-ci ${c}`}><I size={17} /></span><span><b>{t}</b><small>{d}</small></span></Link>)}</section>
    </div>
  </div>;
}
