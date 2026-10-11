import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { UserPlus, CalendarClock, Plus, ChevronDown, Users, CircleCheck, CalendarCheck, TriangleAlert, ChevronLeft, ChevronRight, CircleX, Clock, ArrowRight, X, SlidersHorizontal, List, CircleAlert } from "lucide-react";
import "@/styles/provider-venue.css";
import "@/styles/provider-space.css";
import "@/styles/provider-team.css";
import { Kpi, Ring, Donut, Avatar, Thumb, Tabs, Empty } from "@/components/workspace/kit";
import { ActionForm } from "@/components/workspace/actions";
import { day, time, requestTime, titleCase } from "@/lib/workspace/format";
import { dailySeries, startOfDay } from "@/lib/provider/queries";
import { MenuButton } from "../_components/menu-button";
import { RowMenu } from "../_components/row-menu";
import { SearchParam } from "../_components/search-param";
import { ParamSelect } from "../_components/param-select";
import { loadTeam, crewState } from "./data";
import { saveCrew, requestAvailability, setCrewStatus } from "./actions";

export const metadata: Metadata = { title: "Team" };
const EMP: Record<string, string> = { employee: "Employee", contract: "Contract", part_time: "Part-time", external: "External" };
const STATE: Record<string, [string, string]> = { available: ["Available", "ok"], on_assignment: ["On assignment", "busy"], on_assignment_soon: ["On assignment", "busy"], unavailable: ["Unavailable", "off"], deactivated: ["Deactivated", "off"] };

export default async function TeamPage(props: PageProps<"/provider/team">) {
  const sp = await props.searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? sp[k] as string : "");
  const tab = ["people", "availability", "assignments"].includes(str("tab")) ? str("tab") : "people";
  const { crew, shifts, blocks, jobs, conflicts, unstaffed } = await loadTeam();
  const now = requestTime();
  const active = crew.filter(c => c.status !== "deactivated");
  const state = new Map(active.map(c => [c.id, crewState(c, shifts, blocks, now)]));
  const onAssign = active.filter(c => state.get(c.id)?.startsWith("on_assignment")).length, avail = active.filter(c => state.get(c.id) === "available").length;
  // Week grid (London, Monday start).
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(str("week")) ? startOfDay(0, new Date(`${str("week")}T12:00:00Z`).getTime()) : startOfDay(0, now);
  const dow = (new Date(anchor + 12 * 36e5).getUTCDay() + 6) % 7, weekStart = startOfDay(-dow, anchor);
  const days = Array.from({ length: 7 }, (_, i) => startOfDay(i, weekStart));
  const wk = (o: number) => new Date(startOfDay(o * 7, weekStart) + 12 * 36e5).toISOString().slice(0, 10);
  const inDay = (a: string, b: string, d: number) => new Date(a).getTime() < d + 864e5 && new Date(b).getTime() > d;
  const q = str("q").toLowerCase(), role = str("role"), status = str("status"), skill = str("skill"), loc = str("loc");
  const list = active.filter(c => (!q || `${c.name} ${c.role} ${c.skills.join(" ")}`.toLowerCase().includes(q)) && (!role || c.role === role) && (!loc || c.location === loc)
    && (!skill || c.skills.includes(skill)) && (!status || (status === "available" ? state.get(c.id) === "available" : status === "busy" ? state.get(c.id)?.startsWith("on_assignment") : state.get(c.id) === "unavailable")));
  const gridCrew = (tab === "availability" ? list : list.slice(0, 6));
  // Skill coverage: upcoming 30-day shifts that have someone assigned.
  const next30 = shifts.filter(s => new Date(s.starts_at).getTime() > now && new Date(s.starts_at).getTime() < now + 30 * 864e5);
  const coverage = next30.length ? Math.round((100 * next30.filter(s => s.crew_id).length) / next30.length) : 100;
  const roles = [...new Set(next30.map(s => s.role).filter(Boolean))].slice(0, 4).map(r => [r, next30.filter(s => s.role === r).every(s => s.crew_id)] as const);
  const comp = Object.entries(active.reduce<Record<string, number>>((a, c) => { const k = c.details.employment ?? (c.member_type === "member" ? "employee" : "contract"); a[k] = (a[k] ?? 0) + 1; return a; }, {}));
  const tones = { employee: "green", part_time: "purple", contract: "blue", external: "red" } as const;
  const upcomingJobs = jobs.filter(j => new Date(j.starts_at).getTime() > now && ["confirmed", "held", "active"].includes(j.status)).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 3);
  const nextShift = (id: string) => shifts.find(s => s.crew_id === id && new Date(s.ends_at).getTime() > now);
  const opts = (vals: string[], label: string) => [{ value: "", label }, ...[...new Set(vals.filter(Boolean))].sort().map(v => ({ value: v, label: v }))];
  const base = "/provider/team";
  const action = str("action");

  return <div className="pt">
    <header className="ws-page-head pt-head">
      <div><h1>Team</h1><p>Manage your staff and resource availability for seamless event delivery.</p></div>
      <div className="ws-page-actions">
        <Link href={`${base}?action=add&member_type=member`} className="ws-btn outline"><UserPlus aria-hidden="true" />Invite member</Link>
        <Link href={`${base}?action=request`} className="ws-btn outline"><CalendarClock aria-hidden="true" />Request availability</Link>
        <MenuButton label="Add team member" className="ws-btn primary pt-add" trigger={<><Plus aria-hidden="true" />Add team member<ChevronDown aria-hidden="true" /></>} entries={[
          { kind: "link", label: "Add staff / crew", href: `${base}?action=add` }, { kind: "link", label: "Invite a workspace user", href: `${base}?action=add&member_type=member` }]} />
      </div>
    </header>
    <Tabs base={base} active={tab} tabs={[{ key: "people", label: "People" }, { key: "availability", label: "Availability" }, { key: "assignments", label: "Assignments" }]} />

    <div className="pt-body">
      <div className="pt-main">
        {tab === "people" && <section className="pt-top">
          <div className="ws-kpis pt-kpis">
            <Kpi icon={Users} tone="blue" label="Total team members" value={active.length} series={dailySeries(active, c => c.created_at, () => 1, 30, now)} />
            <Kpi icon={CircleCheck} tone="green" label="Available now" value={avail} />
            <Kpi icon={CalendarCheck} tone="orange" label="On assignment" value={onAssign} series={dailySeries(shifts, s => s.starts_at, () => 1, 30, now)} />
            <Kpi icon={TriangleAlert} tone="red" label="Conflicts" value={conflicts.filter(c => c.kind !== "request").length} />
          </div>
          <section className="ws-panel pt-skill"><h2>Skill coverage <small>(next 30 days)</small></h2><div><Ring value={coverage} size={74} />
            <ul>{roles.length ? roles.map(([r, ok]) => <li key={r}>{ok ? <CircleCheck aria-hidden="true" className="ok" /> : <CircleAlert aria-hidden="true" className="warn" />}{r}</li>) : <li className="pv-none">No shifts scheduled</li>}</ul></div></section>
        </section>}

        {(tab === "people" || tab === "availability") && <section className="ws-panel pt-week">
          <div className="pt-week-head"><h2><CalendarCheck aria-hidden="true" />Team availability</h2>
            <nav className="pt-nav"><Link href={`${base}?tab=${tab}&week=${wk(-1)}`} aria-label="Previous week"><ChevronLeft aria-hidden="true" /></Link><Link href={`${base}?tab=${tab}`}>Today</Link><Link href={`${base}?tab=${tab}&week=${wk(1)}`} aria-label="Next week"><ChevronRight aria-hidden="true" /></Link></nav>
            <nav className="ws-tabs segment pt-views"><Link href={`/provider/calendar?view=day&layers=crew`}>Day</Link><span className="active">Week</span><Link href={`/provider/calendar?view=month&layers=crew`}>Month</Link></nav>
            <Link href={`${base}?tab=availability`} className="ws-btn outline sm"><SlidersHorizontal aria-hidden="true" />Filters</Link></div>
          <p className="pt-range">{day(new Date(days[0] + 12 * 36e5).toISOString(), { day: "numeric", month: "short" })} – {day(new Date(days[6] + 12 * 36e5).toISOString(), { day: "numeric", month: "short", year: "numeric" })}</p>
          <div className="pt-grid" style={{ ["--rows" as string]: gridCrew.length }}>
            <span />{days.map(d => <b key={d}>{day(new Date(d + 12 * 36e5).toISOString(), { weekday: "short", day: "numeric", month: "short" })}</b>)}
            {gridCrew.map(c => [<Link key={`n${c.id}`} href={`${base}/${c.id}`} className="pt-who"><Avatar src={c.avatar} name={c.name} size={30} /><span><b>{c.name}</b><small>{c.role}</small></span></Link>,
              ...days.map(d => { const sh = shifts.filter(s => s.crew_id === c.id && inDay(s.starts_at, s.ends_at, d)); const bl = blocks.find(b => b.crew_id === c.id && inDay(b.starts_at, b.ends_at, d));
                return <div key={`${c.id}${d}`} className="pt-cell">{bl ? <span className={`pt-chip ${/holiday/i.test(bl.note) ? "hol" : "off"}`}>{bl.note || "Unavailable"}</span>
                  : sh.length ? sh.slice(0, 2).map(s => <Link key={s.id} href={s.job_id ? `/provider/bookings/${s.job_id}` : `${base}/${c.id}?tab=assignments`} className={`pt-chip ${/setup|breakdown/i.test(s.title) ? "setup" : /site|meeting/i.test(s.title) ? "meet" : "event"}`}><b>{s.title}</b><small>{s.location}</small></Link>)
                  : <span className="pt-chip free" aria-label="Available">Available</span>}</div>; })])}
          </div>
          {!gridCrew.length && <Empty icon={Users} title="No team members match" text="Clear filters or add your first team member." />}
        </section>}

        {tab === "people" && <section className="ws-panel pt-members">
          <div className="pt-members-head"><h2>Team members ({list.length})</h2>
            <div className="ws-toolbar pt-toolbar"><Suspense><SearchParam placeholder="Search team members..." /></Suspense>
              <Suspense><ParamSelect param="role" label="Role" value={role} options={opts(active.map(c => c.role), "Role")} /></Suspense>
              <Suspense><ParamSelect param="status" label="Status" value={status} options={[{ value: "", label: "Status" }, { value: "available", label: "Available" }, { value: "busy", label: "On assignment" }, { value: "unavailable", label: "Unavailable" }]} /></Suspense>
              <Suspense><ParamSelect param="skill" label="Skills" value={skill} options={opts(active.flatMap(c => c.skills), "Skills")} /></Suspense>
              <Suspense><ParamSelect param="loc" label="Location" value={loc} options={opts(active.map(c => c.location), "Location")} /></Suspense>
              <span className="pt-listicon" aria-hidden="true"><List /></span></div></div>
          <table className="ws-table pt-table"><thead><tr><th>Name</th><th>Role</th><th>Skills</th><th>Location</th><th>Type</th><th>Availability</th><th>Current assignment</th><th aria-label="Actions" /></tr></thead>
            <tbody>{list.map(c => { const st = STATE[state.get(c.id) ?? "available"], nx = nextShift(c.id), emp = c.details.employment ?? (c.member_type === "member" ? "employee" : "contract");
              return <tr key={c.id}><td><Link href={`${base}/${c.id}`} className="pt-name"><Avatar src={c.avatar} name={c.name} size={30} /><b>{c.name}</b></Link></td><td>{c.role}</td>
                <td><span className="pt-skills">{c.skills.slice(0, 3).map(s => <i key={s}>{s}</i>)}</span></td><td>{c.location || "—"}</td><td><span className={`pt-type ${emp}`}>{EMP[emp]}</span></td>
                <td><span className={`pt-st ${st[1]}`}>{st[0]}</span></td><td>{nx ? <span className="pt-asg"><b>{nx.title}</b><small>{day(nx.starts_at, { weekday: "short", day: "numeric", month: "short" })}</small></span> : "–"}</td>
                <td><RowMenu label={`Actions for ${c.name}`} entries={[{ kind: "link", label: "View profile", href: `${base}/${c.id}` }, { kind: "link", label: "Request availability", href: `${base}?action=request&crew=${c.id}` },
                  { kind: "action", label: "Deactivate", danger: true, confirm: `Deactivate ${c.name}? Their history is kept.`, run: setCrewStatus.bind(null, c.id, "deactivated") }]} /></td></tr>; })}</tbody></table>
        </section>}

        {tab === "assignments" && <section className="ws-panel pt-members"><h2>Upcoming assignments</h2>
          <table className="ws-table pt-table"><thead><tr><th>Shift</th><th>Role</th><th>Who</th><th>When</th><th>Location</th><th>Status</th></tr></thead>
            <tbody>{shifts.filter(s => new Date(s.ends_at).getTime() > now).slice(0, 40).map(s => { const c = crew.find(x => x.id === s.crew_id); return <tr key={s.id}>
              <td>{s.job_id ? <Link href={`/provider/bookings/${s.job_id}`}><b>{s.title}</b></Link> : <b>{s.title}</b>}</td><td>{s.role}</td><td>{c ? <Link href={`${base}/${c.id}`}>{c.name}</Link> : <span className="pt-st off">Unassigned</span>}</td>
              <td>{day(s.starts_at, { weekday: "short", day: "numeric", month: "short" })}, {time(s.starts_at)} – {time(s.ends_at)}</td><td>{s.location}</td><td><span className={`pt-st ${s.status === "confirmed" ? "ok" : "busy"}`}>{titleCase(s.status)}</span></td></tr>; })}</tbody></table></section>}
      </div>

      <aside className="pt-rail">
        <section className="ws-panel pt-alerts"><div className="ws-panel-head"><h2>Conflicts &amp; alerts</h2></div>
          {conflicts.length ? <ul>{conflicts.slice(0, 4).map((c, i) => <li key={i}><Link href={c.crewId ? `${base}/${c.crewId}?tab=assignments` : base}>
            <span className={`pt-al ${c.kind === "double" || c.kind === "unavailable" ? "r" : "a"}`}>{c.kind === "double" || c.kind === "unavailable" ? <CircleX aria-hidden="true" /> : <Clock aria-hidden="true" />}</span>
            <span><b>{c.title}</b><small>{c.who}</small><small>{c.detail}</small></span><ChevronRight aria-hidden="true" /></Link></li>)}</ul> : <p className="pv-none"><CircleCheck aria-hidden="true" /> No conflicts — every shift is clear.</p>}</section>
        <section className="ws-panel pt-comp"><h2>Team composition</h2>
          <div><Donut size={110} thickness={14} parts={comp.map(([k, v]) => ({ label: EMP[k] ?? k, value: v, tone: tones[k as keyof typeof tones] ?? "blue" }))} center={<><b>{active.length}</b><small>Members</small></>} />
            <ul>{comp.map(([k, v]) => <li key={k}><i className={tones[k as keyof typeof tones] ?? "blue"} />{EMP[k] ?? k}<b>{v}</b></li>)}</ul></div></section>
        <section className="ws-panel pt-up"><div className="ws-panel-head"><h2>Upcoming assignments</h2><Link className="ws-link" href={`${base}?tab=assignments`}>View all <ArrowRight aria-hidden="true" /></Link></div>
          {upcomingJobs.length ? <ul>{upcomingJobs.map(j => <li key={j.id}><Link href={`/provider/bookings/${j.id}`}><Thumb src={j.image} w={56} h={46} /><span><b>{j.event_name}</b><small>{day(j.starts_at, { weekday: "short", day: "numeric", month: "short" })}, {time(j.starts_at)} – {time(j.ends_at)}</small>
            <small>{shifts.filter(s => s.job_id === j.id && s.crew_id).length} team member{shifts.filter(s => s.job_id === j.id && s.crew_id).length === 1 ? "" : "s"}</small></span><ChevronRight aria-hidden="true" /></Link></li>)}</ul>
            : <p className="pv-none">Nothing scheduled.</p>}
          {unstaffed.filter(j => !shifts.some(s => s.job_id === j.id)).length > 0 && <p className="pt-warn"><CircleAlert aria-hidden="true" />{unstaffed.filter(j => !shifts.some(s => s.job_id === j.id)).length} upcoming booking(s) have no team assigned.</p>}</section>
      </aside>
    </div>

    {(action === "add" || action === "request") && <div className="ws-dialog-backdrop">
      {action === "add" ? <ActionForm action={saveCrew.bind(null, null)} className="ws-dialog pt-dialog">
        <div className="ws-dialog-head"><h2>{str("member_type") === "member" ? "Invite a workspace user" : "Add team member"}</h2><Link href={base} aria-label="Close"><X aria-hidden="true" /></Link></div>
        <input type="hidden" name="member_type" value={str("member_type") === "member" ? "member" : "crew"} />
        <div className="pt-form">
          <label>Full name<input name="name" required minLength={2} maxLength={80} /></label><label>Role<input name="role" placeholder="e.g. Bar Supervisor" maxLength={60} /></label>
          <label>Email<input name="email" type="email" maxLength={120} required={str("member_type") === "member"} /></label><label>Phone<input name="phone" inputMode="tel" maxLength={40} /></label>
          <label>Employment type<select name="employment" className="ws-select"><option value="employee">Employee</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="external">External</option></select></label>
          <label>Location<input name="location" defaultValue="London" maxLength={60} /></label>
          <label>Hourly rate (£)<input name="hourly_rate" type="number" min={0} step={0.5} /></label><label>Start date<input name="start_date" type="date" /></label>
          <label className="wide">Skills <small>comma separated</small><input name="skills" placeholder="Bar Management, Mixology, Customer Service" /></label>
        </div>
        {str("member_type") === "member" && <p className="pt-note">They’ll get access once they accept the invite from Settings → Team access. Until then they appear here as staff.</p>}
        <div className="ws-dialog-actions"><Link href={base} className="ws-btn outline">Cancel</Link><button className="ws-btn primary">Add member</button></div></ActionForm>
        : <ActionForm action={requestAvailability} className="ws-dialog pt-dialog">
          <div className="ws-dialog-head"><h2>Request availability</h2><Link href={base} aria-label="Close"><X aria-hidden="true" /></Link></div>
          <div className="pt-form"><label className="wide">Team member<select name="crew" className="ws-select" defaultValue={str("crew")} required><option value="" disabled>Choose…</option>{active.map(c => <option key={c.id} value={c.id}>{c.name} — {c.role}</option>)}</select></label>
            <label>Date<input name="date" type="date" required /></label><span />
            <label>From<input name="from" type="time" defaultValue="09:00" /></label><label>To<input name="to" type="time" defaultValue="23:00" /></label>
            <label className="wide">Note<textarea name="note" rows={2} maxLength={400} placeholder="e.g. Bar staff for a 120-guest wedding" /></label></div>
          <p className="pt-note">Creates a tracked request — nothing is assumed until they confirm.</p>
          <div className="ws-dialog-actions"><Link href={base} className="ws-btn outline">Cancel</Link><button className="ws-btn primary">Send request</button></div></ActionForm>}
    </div>}
  </div>;
}
