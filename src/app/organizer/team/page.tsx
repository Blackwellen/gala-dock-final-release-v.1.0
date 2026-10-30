import Link from "next/link";
import { Users, CalendarDays, AlertTriangle, ShieldAlert, CalendarClock, ChevronLeft, ChevronRight, Search, CheckCircle2, Clock, ArrowRight, Wrench, UserSearch, GitMerge, Send, Plane, Ban, Sparkles } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { Crumbs, LinkTabs, Beta } from "@/components/kit";
import { TeamHeaderActions, PersonRowMenu, ShiftMenu, ResolveButton } from "@/components/organizer/team-client";
import { FormDialog, ActionButton } from "@/components/organizer/event/sections/ops-forms-client";
import { decideLeaveForm, cancelLeaveAction, recordLeave, reassignShiftForm } from "@/lib/actions/team";
import { untyped } from "@/lib/workspace/db";

export const metadata = { title: "Team" };
const TZ = "Europe/London";
const ST: Record<string, [string, string]> = { active: ["Active", "green"], available: ["Available", "green"], on_event: ["On Event", "amber"], unavailable: ["Unavailable", "red"], deactivated: ["Deactivated", "gray"] };
const SH: Record<string, [string, string]> = { confirmed: ["Confirmed", "green"], pending: ["Pending", "amber"], draft: ["Draft", "gray"], unavailable: ["Unavailable", "gray"], travel: ["Travel", "gray"] };
const COL = ["blue", "pink", "purple", "green"];
const KIND_META: Record<string, { label: string; icon: typeof AlertTriangle }> = {
  overlap: { label: "Double booking", icon: ShieldAlert }, travel: { label: "Travel clash", icon: Clock }, unavailable: { label: "Unavailable", icon: Ban },
  unfilled: { label: "Unfilled role", icon: AlertTriangle }, unconfirmed: { label: "Not confirmed", icon: Clock }, qualification: { label: "Qualification", icon: ShieldAlert }, missing_role: { label: "Missing role", icon: AlertTriangle },
};

export default async function TeamPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const ctx = await getOrganizer(); const sb = ctx.supabase; const ws = ctx.workspace.id;
  const tab = ["availability", "assignments", "shifts", "leave"].includes(sp.tab ?? "") ? sp.tab! : "people";
  const mgr = ["owner", "admin", "manager"].includes(String(ctx.role)); const dr = mgr ? null : "Only workspace owners and managers can change leave and shifts.";
  const who = ["member", "crew"].includes(sp.type ?? "") ? sp.type! : "all";
  const q = (sp.q ?? "").toLowerCase();
  // Week window (Mon–Sun) for the availability board.
  let anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.week ?? "") ? new Date(`${sp.week}T12:00:00Z`) : new Date();
  if (!sp.week) { const { data: nx } = await sb.from("shifts").select("starts_at").eq("workspace_id", ctx.workspace.id).not("crew_id", "is", null).gte("ends_at", new Date().toISOString()).order("starts_at").limit(1).maybeSingle(); if (nx) anchor = new Date(nx.starts_at); }
  const mon = new Date(anchor); mon.setUTCDate(anchor.getUTCDate() - ((anchor.getUTCDay() + 6) % 7)); mon.setUTCHours(0, 0, 0, 0);
  const sun = new Date(mon.getTime() + 7 * 864e5); const days = Array.from({ length: 7 }, (_, i) => new Date(mon.getTime() + i * 864e5));
  const now = new Date();
  const [{ data: crew }, { data: shifts }, { data: blocks }, { data: events }, { data: engine }] = await Promise.all([
    sb.from("crew_members").select("id,name,role,member_type,status,avatar,email,location,skills").eq("workspace_id", ws).neq("status", "deactivated").order("member_type").order("name"),
    sb.from("shifts").select("id,crew_id,event_id,title,role,starts_at,ends_at,location,status,headcount").eq("workspace_id", ws).gte("ends_at", new Date(Math.min(mon.getTime(), now.getTime())).toISOString()).order("starts_at").limit(400),
    sb.from("availability_blocks").select("id,crew_id,kind,starts_at,ends_at,note").eq("workspace_id", ws).not("crew_id", "is", null).gte("ends_at", mon.toISOString()).lt("starts_at", sun.toISOString()),
    sb.from("events").select("id,name,starts_at,ends_at,venue_name,location").eq("workspace_id", ws).gte("starts_at", now.toISOString()).order("starts_at").limit(30),
    sb.rpc("team_conflicts" as never, { p_workspace: ws, p_to: new Date(now.getTime() + 30 * 864e5).toISOString() } as never),
  ]);
  // Q17 leave requests (RLS: owners/managers see all; others only their own).
  const { data: leaveRows } = await untyped(sb).from("leave_requests").select("id,crew_id,kind,starts_at,ends_at,note,status,decided_at,decision_note,created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(60);
  const leave = (leaveRows ?? []) as LeaveRow[]; const pendingLeave = leave.filter(l => l.status === "pending");
  const people = crew ?? []; const S = shifts ?? [];
  const list = people.filter(p => (who === "all" || p.member_type === who) && (!q || `${p.name} ${p.role}`.toLowerCase().includes(q)));
  const upcoming = S.filter(s => s.starts_at >= now.toISOString());
  const assigned = new Set(upcoming.filter(s => s.crew_id && ["confirmed", "pending"].includes(s.status)).map(s => s.crew_id));
  const in7 = upcoming.filter(s => Date.parse(s.starts_at) < now.getTime() + 7 * 864e5);
  // Conflicts & gaps come from the team conflict engine (team_conflicts), the same source as Home, Plan and the Agent.
  type Issue = { kind: string; severity: "blocker" | "warning"; shift_id: string | null; crew_id: string | null; event_id: string | null; message: string };
  const issues = ((engine ?? []) as Issue[]).sort((x, y) => Number(y.severity === "blocker") - Number(x.severity === "blocker"));
  const gaps = issues.filter(i => i.kind === "unfilled" || i.kind === "unconfirmed");
  const conflicts = issues.filter(i => i.kind !== "unfilled" && i.kind !== "unconfirmed");
  const shiftOf = (id: string | null) => S.find(x => x.id === id);
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
    <LinkTabs current={tab} tabs={[["people", "People"], ["availability", "Availability"], ["assignments", "Assignments"], ["shifts", "Shifts"], ["leave", "Leave & cover"]].map(([k, l]) => ({ key: k, label: l, count: k === "leave" && pendingLeave.length ? pendingLeave.length : undefined, href: href({ tab: k === "people" ? undefined : k }) }))} />
    <div className="tm-kpis">{([[Users, "Total people", people.length, `${people.filter(p => p.member_type === "member").length} members · ${people.filter(p => p.member_type === "crew").length} crew`, "blue", ""], [CalendarDays, "Assigned to events", assigned.size, `${people.length ? Math.round((assigned.size / people.length) * 100) : 0}% of team`, "blue", ""], [AlertTriangle, "Unfilled roles", gaps.length, gaps.length ? "Needs attention" : "All roles filled", "red", gaps.length ? "warn" : ""], [ShieldAlert, "Conflicts", conflicts.length, conflicts.length ? "Next 30 days · needs review" : "Next 30 days", "pink", conflicts.length ? "warn" : ""], [CalendarClock, "Upcoming shifts", in7.length, "Next 7 days", "blue", ""]] as const).map(([I, l, v, s, c, w]) => <div key={l} className="k-card tm-kpi"><span><small>{l}</small><b>{v}</b><em className={w}>{w && <AlertTriangle size={12} />}{s}</em></span><span className={`tm-ki ${c}`}><I size={20} /></span></div>)}</div>

    {tab === "leave" ? <LeaveCover leave={leave} people={people} shifts={upcoming} issues={issues} mgr={mgr} dr={dr} fmtD={fmtD} fmtT={fmtT} /> : <>
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
        <table className="tm-table"><thead><tr><th>Date</th><th>Time</th><th>Event</th><th>Role</th><th>People</th><th>Status</th><th>Actions</th></tr></thead><tbody>{grouped.map(g => { const [sl, st] = SH[g.s.status] ?? [g.s.status, "gray"]; return <tr key={g.key}><td>{fmtD(g.s.starts_at)}</td><td>{fmtT(g.s.starts_at)} – {fmtT(g.s.ends_at)}</td><td><b>{g.s.title}</b><small>{g.s.location}</small></td><td>{g.s.role}</td><td><span className="tm-avs">{g.people.slice(0, 4).map(id => { const p = people.find(x => x.id === id); return p?.avatar ? /* eslint-disable-next-line @next/next/no-img-element */ <img key={id} src={p.avatar} alt={p.name} /> : <span key={id} className="tm-av sm">{name(id).slice(0, 1)}</span>; })}<em>{g.people.length || g.s.headcount}</em></span></td><td><span className={`tm-st ${st}`}>{st === "green" ? <CheckCircle2 size={12} /> : <Clock size={12} />}{sl}</span></td><td><span className="tm-acts-cell">{g.s.crew_id && <FormDialog label={`Reassign ${name(g.s.crew_id)}'s shift`} icon="swap" variant="ghost" iconOnly title={`Reassign shift — ${g.s.title}`} sub={`${fmtD(g.s.starts_at)} · ${fmtT(g.s.starts_at)}–${fmtT(g.s.ends_at)} · now ${name(g.s.crew_id)}. The database re-checks the new person's capacity and availability.`} submitLabel="Reassign" disabledReason={dr} action={reassignShiftForm.bind(null, g.s.id)} fields={[{ name: "to", label: "Replacement", type: "select", required: true, options: people.filter(p => p.id !== g.s.crew_id).map(p => [p.id, `${p.name} · ${p.role}`] as [string, string]) }, { name: "reason", label: "Reason", type: "textarea", maxLength: 500 }]} />}<ShiftMenu id={g.s.id} status={g.s.status} eventId={g.s.event_id} /></span></td></tr>; })}{!grouped.length && <tr><td colSpan={7} className="k-small" style={{ padding: 14 }}>No upcoming shifts.</td></tr>}</tbody></table></section>
      <section className="k-card tm-conf" id="conflicts"><div className="k-between"><h2>Conflicts &amp; gaps{issues.length > 0 && <span className="tm-conf-n">{issues.length}</span>}</h2><Link className="k-link" href={href({ tab: "assignments" })}>View all <ArrowRight size={13} /></Link></div>
        <ul>{issues.slice(0, 4).map((c, i) => { const sh = shiftOf(c.shift_id); const meta = KIND_META[c.kind] ?? KIND_META.overlap;
          return <li key={`${c.kind}-${c.shift_id ?? c.event_id}-${i}`}><span className={`tm-ci ${c.severity === "blocker" ? "red" : "amber"}`}><meta.icon size={18} /></span><span className="k-grow"><b>{meta.label}</b><small>{c.message}</small>{sh && <small>{fmtD(sh.starts_at)} · {fmtT(sh.starts_at)} – {fmtT(sh.ends_at)}</small>}</span>
            <ResolveButton href={c.kind === "unfilled" ? href({ tab: "assignments" }) : c.crew_id ? `/organizer/team/${c.crew_id}` : c.event_id ? `/organizer/events/${c.event_id}?tab=operations&section=team` : href({ tab: "assignments" })} label={c.kind === "unfilled" ? "Assign" : c.kind === "unconfirmed" ? "Confirm" : "Review"} /></li>; })}
          {issues.length > 4 && <li className="tm-conf-more"><Link className="k-link" href={href({ tab: "assignments" })}>{issues.length - 4} more</Link></li>}
          {!issues.length && <li><span className="tm-ci green"><CheckCircle2 size={18} /></span><span className="k-grow"><b>No conflicts or gaps</b><small>No double bookings, travel clashes, availability conflicts or unfilled roles in the next 30 days.</small></span></li>}</ul></section>
      <section className="k-card tm-ai"><div className="k-row" style={{ gap: 8 }}><Sparkles size={18} className="k-blue" /><b>AI Assistant</b><Beta /></div>
        {([[Wrench, "Build staffing plan", "Generate a full staffing plan for this event", "amber"], [UserSearch, "Find available crew", "Show crew matching required skills", "purple"], [GitMerge, "Resolve conflicts", "Suggest changes to fix scheduling conflicts", "amber"], [Send, "Draft assignment messages", "Create and send invites to crew", "purple"]] as const).map(([I, t, d, c]) => <Link key={t} href={`/organizer/agent?goal=${encodeURIComponent(t)}`} className="tm-ail"><span className={`tm-ci ${c}`}><I size={17} /></span><span><b>{t}</b><small>{d}</small></span></Link>)}</section>
    </div></>}
  </div>;
}

type LeaveRow = { id: string; crew_id: string; kind: string; starts_at: string; ends_at: string; note: string; status: string; decided_at: string | null; decision_note: string; created_at: string };
type ShiftRow = { id: string; crew_id: string | null; event_id: string | null; title: string; role: string; starts_at: string; ends_at: string; location: string; status: string };
const LEAVE_TONE: Record<string, string> = { pending: "amber", approved: "green", rejected: "red", cancelled: "gray" };
const cap = (s: string) => s.replace(/^\w/, c => c.toUpperCase());

/** Q17 "Leave & cover" tab: leave approval (with the clash list decide_leave returns) and substitution for shifts that need cover. */
function LeaveCover({ leave, people, shifts, issues, mgr, dr, fmtD, fmtT }: { leave: LeaveRow[]; people: { id: string; name: string; role: string; status: string }[]; shifts: ShiftRow[];
  issues: { kind: string; shift_id: string | null; crew_id: string | null; message: string }[]; mgr: boolean; dr: string | null; fmtD: (s: string) => string; fmtT: (s: string) => string }) {
  const who = (id: string | null) => people.find(p => p.id === id);
  const approved = leave.filter(l => l.status === "approved");
  const overlap = (s: ShiftRow, l: LeaveRow) => s.crew_id === l.crew_id && s.starts_at < l.ends_at && s.ends_at > l.starts_at;
  const cover = shifts.filter(s => s.crew_id && ["draft", "pending", "confirmed"].includes(s.status)).map(s => {
    const l = approved.find(x => overlap(s, x)); const i = issues.find(x => x.shift_id === s.id && ["unavailable", "overlap", "travel"].includes(x.kind));
    const p = who(s.crew_id); const off = p && ["unavailable", "deactivated"].includes(p.status);
    return { s, why: l ? `On approved ${l.kind} leave ${fmtD(l.starts_at)} – ${fmtD(l.ends_at)}` : i ? i.message : off ? `${p.name} is marked ${p.status}` : null };
  }).filter(x => x.why);
  const pending = leave.filter(l => l.status === "pending"), decided = leave.filter(l => l.status !== "pending").slice(0, 12);
  const row = (l: LeaveRow) => { const p = who(l.crew_id);
    return <li key={l.id}><span className="tm-av">{(p?.name ?? "?").slice(0, 1)}</span><span className="k-grow"><b>{p ? <Link href={`/organizer/team/${p.id}`}>{p.name}</Link> : "Former team member"} · {cap(l.kind)} leave</b>
      <small>{fmtD(l.starts_at)} {fmtT(l.starts_at)} – {fmtD(l.ends_at)} {fmtT(l.ends_at)}{l.note ? ` · “${l.note}”` : ""}</small>{l.decision_note && <small>Decision: “{l.decision_note}”</small>}</span>
      <span className={`tm-st ${LEAVE_TONE[l.status] ?? "gray"}`}>{cap(l.status)}</span>
      <span className="tm-lv-acts">{l.status === "pending" && <><FormDialog label="Approve" icon="check" variant="soft" title={`Approve leave — ${p?.name ?? "team member"}`} sub="Blocks new assignments for these dates. Shifts already assigned in this window are listed next so you can reassign them." submitLabel="Approve" disabledReason={dr} action={decideLeaveForm.bind(null, l.id, true)} fields={[{ name: "note", label: "Note to them (optional)", type: "textarea", maxLength: 500 }]} />
        <FormDialog label="Reject" icon="x" variant="ghost" title={`Reject leave — ${p?.name ?? "team member"}`} submitLabel="Reject" disabledReason={dr} action={decideLeaveForm.bind(null, l.id, false)} fields={[{ name: "note", label: "Reason (required)", type: "textarea", required: true, maxLength: 500 }]} /></>}
        {["pending", "approved"].includes(l.status) && <ActionButton label="Cancel" icon="ban" variant="ghost" disabledReason={dr} confirm={{ title: "Cancel this leave?", message: l.status === "approved" ? "The availability block is removed, so they can be assigned again." : undefined, danger: true, confirmLabel: "Cancel leave" }} action={cancelLeaveAction.bind(null, l.id)} />}</span></li>; };
  return <div className="tm-row2 tm-leave">
    <section className="k-card tm-conf tm-lv"><div className="k-between"><h2>Leave requests{pending.length > 0 && <span className="tm-conf-n">{pending.length}</span>}</h2>
      <FormDialog label="Record leave" icon="calendar" title="Record leave for someone" sub="Recorded as pending, then approved or rejected here like any request." disabledReason={dr} action={recordLeave} submitLabel="Record" fields={[
        { name: "crew", label: "Person", type: "select", required: true, options: people.map(p => [p.id, p.name] as [string, string]) }, { name: "kind", label: "Type", type: "select", required: true, options: [["annual", "Annual"], ["sick", "Sick"], ["unpaid", "Unpaid"], ["other", "Other"]] },
        { name: "from", label: "From", type: "datetime", required: true }, { name: "to", label: "To", type: "datetime", required: true }, { name: "note", label: "Note", type: "textarea", maxLength: 500 }]} /></div>
      {!mgr && <p className="k-small">You can see your own leave here. Owners and managers approve requests.</p>}
      <ul>{pending.map(row)}{!pending.length && <li><span className="tm-ci green"><CheckCircle2 size={18} /></span><span className="k-grow"><b>No leave waiting for a decision</b><small>Requests from the team (My shifts) and leave you record appear here.</small></span></li>}</ul>
      {decided.length > 0 && <><h3 className="tm-lv-h">Recently decided</h3><ul>{decided.map(row)}</ul></>}</section>
    <section className="k-card tm-conf tm-cover"><div className="k-between"><h2>Shifts needing cover{cover.length > 0 && <span className="tm-conf-n">{cover.length}</span>}</h2></div>
      <ul>{cover.map(({ s, why }) => <li key={s.id}><span className="tm-ci amber"><AlertTriangle size={18} /></span><span className="k-grow"><b>{s.title} · {s.role}</b><small>{fmtD(s.starts_at)} · {fmtT(s.starts_at)} – {fmtT(s.ends_at)} · {who(s.crew_id)?.name ?? "Unassigned"}</small><small>{why}</small></span>
        <FormDialog label="Reassign" icon="swap" variant="soft" title={`Reassign — ${s.title}`} sub="Pick a replacement. Refused if they're double-booked, unavailable or deactivated (checked under their lock)." submitLabel="Reassign" disabledReason={dr} action={reassignShiftForm.bind(null, s.id)} fields={[
          { name: "to", label: "Replacement", type: "select", required: true, options: people.filter(p => p.id !== s.crew_id && !["unavailable", "deactivated"].includes(p.status)).map(p => [p.id, `${p.name} · ${p.role}`] as [string, string]) }, { name: "reason", label: "Reason", type: "textarea", maxLength: 500, defaultValue: why ?? "" }]} /></li>)}
        {!cover.length && <li><span className="tm-ci green"><CheckCircle2 size={18} /></span><span className="k-grow"><b>Every upcoming shift has cover</b><small>No shifts clash with approved leave, unavailability or another booking.</small></span></li>}</ul></section>
    <section className="k-card tm-ai"><b>How cover works</b><ul className="tm-lv-how"><li>Approving leave blocks new assignments for those dates.</li><li>Shifts already assigned in that window appear under Shifts needing cover.</li><li>Reassigning moves the shift to pending and notifies the person taken off it.</li></ul><Link className="k-link" href="/organizer/team/my-shifts">Open My shifts</Link></section>
  </div>;
}
