import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { ArrowLeft, MessageSquare, CalendarClock, Pencil, Phone, Mail, MapPin, BadgeCheck, CalendarDays, CalendarCheck, Clock, CircleCheck, Star, UserRound, Award, ShieldCheck, Plus, ChevronRight,
  ChevronLeft, CalendarPlus, X, Circle, Activity as ActivityIcon, FileText } from "lucide-react";
import "@/styles/provider-venue.css";
import "@/styles/provider-space.css";
import "@/styles/provider-team.css";
import { Kpi, Ring, Chip, Tabs, Avatar, Thumb } from "@/components/workspace/kit";
import { ActionForm, ActionButton } from "@/components/workspace/actions";
import { day, time, money, requestTime, relative, titleCase } from "@/lib/workspace/format";
import { rows, isUuid } from "@/lib/workspace/db";
import { dailySeries, startOfDay, startOfMonth } from "@/lib/provider/queries";
import { loadTeam, crewState } from "../data";
import { saveCrew, setCrewStatus, addCrewUnavailability } from "../actions";

export const metadata: Metadata = { title: "Team member" };
const EMP: Record<string, string> = { employee: "Employee", contract: "Contract", part_time: "Part-time", external: "External" };
const ACCESS: [string, string[]][] = [["View assigned bookings", ["member", "finance", "manager", "owner"]], ["Update delivery status", ["member", "manager", "owner"]], ["Access event details", ["member", "finance", "manager", "owner"]],
  ["Communicate with team", ["member", "finance", "manager", "owner"]], ["View relevant files", ["member", "finance", "manager", "owner"]], ["Manage finances", ["finance", "manager", "owner"]], ["Manage listings", ["manager", "owner"]], ["Change settings", ["owner"]]];

export default async function TeamMember(props: PageProps<"/provider/team/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const sp = await props.searchParams;
  const tab = ["overview", "availability", "assignments", "activity"].includes(String(sp.tab)) ? String(sp.tab) : "overview";
  const { ctx, crew, shifts, blocks, jobs } = await loadTeam();
  const c = crew.find(x => x.id === id);
  if (!c) notFound();
  const now = requestTime(), d = c.details, emp = d.employment ?? (c.member_type === "member" ? "employee" : "contract");
  // Seeds and older rows store certifications as plain strings; the editor writes {name, expires}. Normalise both.
  const certs = ((d.certifications ?? []) as unknown as ({ name: string; expires?: string | null } | string)[]).map(x => (typeof x === "string" ? { name: x, expires: null as string | null } : { name: x.name, expires: x.expires ?? null }));
  const mine = shifts.filter(s => s.crew_id === c.id), myBlocks = blocks.filter(b => b.crew_id === c.id);
  const done = mine.filter(s => new Date(s.ends_at).getTime() < now), upcoming = mine.filter(s => new Date(s.ends_at).getTime() >= now);
  const mStart = startOfMonth(0, now), hours = mine.filter(s => new Date(s.starts_at).getTime() >= mStart && new Date(s.starts_at).getTime() < now).reduce((a, s) => a + (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 36e5, 0);
  const completion = done.length ? Math.round((100 * done.filter(s => s.status === "confirmed" || s.status === "completed").length) / done.length) : 100;
  const [member, audit] = await Promise.all([
    c.user_id ? rows<{ role: string; status: string }>(ctx.db.from("workspace_members").select("role,status").eq("workspace_id", ctx.workspace.id).eq("user_id", c.user_id)) : Promise.resolve([]),
    rows<{ id: number; event: string; metadata: Record<string, unknown>; created_at: string }>(ctx.db.from("audit_events").select("id,event,metadata,created_at").eq("workspace_id", ctx.workspace.id).contains("metadata", { crew_id: c.id }).order("created_at", { ascending: false }).limit(10)),
  ]);
  const wsRole = member[0]?.role ?? null;
  // This month's availability split (days).
  const dim = new Date(new Date(mStart + 12 * 36e5).getUTCFullYear(), new Date(mStart + 12 * 36e5).getUTCMonth() + 1, 0).getDate();
  const monthDays = Array.from({ length: dim }, (_, i) => startOfDay(i, mStart));
  const dayState = (dd: number) => myBlocks.some(b => new Date(b.starts_at).getTime() < dd + 864e5 && new Date(b.ends_at).getTime() > dd) ? "off" : mine.some(s => new Date(s.starts_at).getTime() < dd + 864e5 && new Date(s.ends_at).getTime() > dd) ? "busy" : "ok";
  const split = { ok: monthDays.filter(x => dayState(x) === "ok").length, busy: monthDays.filter(x => dayState(x) === "busy").length, off: monthDays.filter(x => dayState(x) === "off").length };
  const pct = (n: number) => Math.round((100 * n) / dim);
  // Week view
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(String(sp.week ?? "")) ? startOfDay(0, new Date(`${sp.week}T12:00:00Z`).getTime()) : startOfDay(0, now);
  const dow = (new Date(anchor + 12 * 36e5).getUTCDay() + 6) % 7, weekStart = startOfDay(-dow, anchor), week = Array.from({ length: 7 }, (_, i) => startOfDay(i, weekStart));
  const wk = (o: number) => new Date(startOfDay(o * 7, weekStart) + 12 * 36e5).toISOString().slice(0, 10);
  const H0 = 8, H1 = 24, hourPx = 7.5;
  const pos = (iso: string, dd: number) => Math.max(0, Math.min(H1 - H0, (new Date(iso).getTime() - dd) / 36e5 - H0));
  const st = crewState(c, shifts, blocks, now), active = c.status !== "deactivated";
  // Edits, availability changes and (de)activation are owner/manager RPCs; staff and finance see the profile read-only.
  const manage = ctx.can.manage, editing = manage && !!sp.edit, adding = manage && !!sp.add;
  const base = `/provider/team/${c.id}`;
  const job = (jid: string | null) => jobs.find(j => j.id === jid);
  const asgFilter = String(sp.f ?? "all"), asgList = (asgFilter === "upcoming" ? upcoming : asgFilter === "past" ? done : mine).slice().sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const profile: [string, string][] = [["Full name", c.name], ["Email", c.email || "—"], ["Phone", c.phone || "—"], ["Location", c.location || "—"], ["Role", c.role || "—"], ["Employment type", EMP[emp]],
    ["Start date", d.start_date ? day(`${d.start_date}T12:00:00Z`, { day: "numeric", month: "short", year: "numeric" }) : "—"], ["Default cost rate", d.hourly_rate ? `${money(d.hourly_rate, "GBP", { cents: true })} / hour` : c.day_rate ? `${money(c.day_rate)} / day` : "—"],
    ["Time zone", d.timezone ?? "Europe/London"], ["Emergency contact", d.emergency_contact || "—"]];

  return <div className="pt ptm">
    <Link href="/provider/team" className="ws-back pv-back"><ArrowLeft aria-hidden="true" />Back to Team</Link>
    <header className="ptm-head">
      <Avatar src={c.avatar} name={c.name} size={86} />
      <div className="ptm-id"><div className="pv-title"><h1>{c.name}</h1>{active ? <Chip tone="green" dot>Active</Chip> : <Chip tone="grey" dot>Deactivated</Chip>}</div>
        <p className="ptm-meta"><span>{c.role}</span><span className="pt-type">{EMP[emp]}</span><span><MapPin aria-hidden="true" />{c.location || "—"}</span><span><CalendarDays aria-hidden="true" />Member since {day(d.start_date ? `${d.start_date}T12:00:00Z` : c.created_at, { day: "numeric", month: "short", year: "numeric" })}</span></p>
        <p className="ptm-meta">{c.phone && <a href={`tel:${c.phone.replace(/\s/g, "")}`}><Phone aria-hidden="true" />{c.phone}</a>}{c.email && <a href={`mailto:${c.email}`}><Mail aria-hidden="true" />{c.email}</a>}<span><MapPin aria-hidden="true" />{c.location ? `${c.location}, UK` : "—"}</span></p></div>
      <div className="pv-head-actions">
        {c.email && <a href={`mailto:${c.email}`} className="ws-btn outline"><MessageSquare aria-hidden="true" />Message</a>}
        {manage && <><Link href={`/provider/team?action=request&crew=${c.id}`} className="ws-btn outline"><CalendarClock aria-hidden="true" />Request availability</Link>
        <Link href={`${base}?tab=overview&edit=1`} className="ws-btn primary pv-edit"><Pencil aria-hidden="true" />Edit member</Link></>}
      </div>
    </header>
    <Tabs base={base} active={tab} tabs={[{ key: "overview", label: "Overview" }, { key: "availability", label: "Availability" }, { key: "assignments", label: "Assignments" }, { key: "activity", label: "Activity" }]} />

    <div className="pt-body">
      <div className="pt-main">
        {tab === "overview" && <>
          <section className="ws-kpis ptm-kpis">
            <Kpi icon={CalendarCheck} tone="blue" label="Assigned bookings" value={new Set(mine.map(s => s.job_id).filter(Boolean)).size} series={dailySeries(mine, s => s.starts_at, () => 1, 30, now)} />
            <Kpi icon={Clock} tone="purple" label="Hours this month" value={Math.round(hours)} />
            <Kpi icon={CircleCheck} tone="green" label="Completion rate" value={`${completion}%`} />
            <Kpi icon={Star} tone="orange" label="Shifts completed" value={done.length} />
          </section>
          {editing ? <section className="ws-panel"><div className="ws-panel-head"><h2>Edit {c.name}</h2><Link href={base} aria-label="Close"><X aria-hidden="true" /></Link></div>
            <ActionForm action={saveCrew.bind(null, c.id)} className="pt-form pt-form-wide">
              <label>Full name<input name="name" defaultValue={c.name} required /></label><label>Role<input name="role" defaultValue={c.role} /></label>
              <label>Email<input name="email" type="email" defaultValue={c.email} /></label><label>Phone<input name="phone" defaultValue={c.phone} /></label>
              <label>Location<input name="location" defaultValue={c.location} /></label>
              <label>Employment type<select name="employment" className="ws-select" defaultValue={emp}>{Object.entries(EMP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label>Hourly rate (£)<input name="hourly_rate" type="number" min={0} step={0.5} defaultValue={d.hourly_rate ?? ""} /></label><label>Day rate (£)<input name="day_rate" type="number" min={0} defaultValue={c.day_rate ?? ""} /></label>
              <label>Start date<input name="start_date" type="date" defaultValue={d.start_date ?? ""} /></label><label>Emergency contact<input name="emergency_contact" defaultValue={d.emergency_contact ?? ""} /></label>
              <label className="wide">Skills <small>comma separated</small><input name="skills" defaultValue={c.skills.join(", ")} /></label>
              <label className="wide">Certifications <small>one per line — name | expiry (YYYY-MM-DD)</small><textarea name="certifications" rows={3} defaultValue={certs.map(x => `${x.name}${x.expires ? ` | ${x.expires}` : ""}`).join("\n")} /></label>
              <label className="wide">Languages <small>comma separated</small><input name="languages" defaultValue={(d.languages ?? []).join(", ")} /></label>
              <div className="wide pv-form-foot"><Link href={base} className="ws-btn outline">Cancel</Link><button className="ws-btn primary">Save changes</button></div></ActionForm></section>
          : <div className="ptm-grid">
            <section className="ws-panel pv-info ptm-card"><div className="ws-panel-head"><h2><UserRound aria-hidden="true" />Profile &amp; contact</h2>{manage && <Link className="ws-link" href={`${base}?edit=1`}><Pencil aria-hidden="true" />Edit</Link>}</div>
              <dl>{profile.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl></section>
            <section className="ws-panel ptm-card ptm-skills"><div className="ws-panel-head"><h2><Award aria-hidden="true" />Skills &amp; certifications</h2>{manage && <Link className="ws-link" href={`${base}?edit=1`}><Pencil aria-hidden="true" />Edit</Link>}</div>
              <h3>Skills</h3><p className="ptm-tags">{c.skills.map((s, i) => <i key={`${s}-${i}`}>{s}</i>)}{!c.skills.length && <span className="pv-none">None added</span>}</p>
              <h3>Certifications</h3><p className="ptm-tags">{certs.map((x, ci) => { const expired = x.expires && new Date(x.expires).getTime() < now; return <i key={`${x.name}-${ci}`} className={expired ? "bad" : "cert"}><BadgeCheck aria-hidden="true" />{x.name}{x.expires ? ` (${expired ? "expired" : "valid to"} ${day(`${x.expires}T12:00:00Z`, { month: "short", year: "numeric" })})` : ""}</i>; })}
                {manage && <Link href={`${base}?edit=1`} className="ptm-add"><Plus aria-hidden="true" />Add certification</Link>}{!manage && !certs.length && <span className="pv-none">None recorded</span>}</p>
              <h3>Languages</h3><p className="ptm-tags">{(d.languages ?? []).map((l, li) => <i key={`${l}-${li}`}>{l}</i>)}{!(d.languages ?? []).length && <span className="pv-none">Not specified</span>}</p></section>
            <section className="ws-panel ptm-card ptm-perms"><div className="ws-panel-head"><h2><ShieldCheck aria-hidden="true" />Permissions &amp; access</h2></div>
              <p className="ptm-access">Workspace access <span>{wsRole ? `${titleCase(wsRole)} access` : "No login"}</span></p>
              <ul>{ACCESS.map(([l, roles]) => { const ok = !!wsRole && roles.includes(wsRole); return <li key={l} className={ok ? "" : "no"}>{ok ? <CircleCheck aria-hidden="true" /> : <Circle aria-hidden="true" />}{l}</li>; })}</ul>
              {ctx.role === "owner" && <Link href="/provider/settings?tab=team" className="ws-btn outline block sm"><ShieldCheck aria-hidden="true" />{c.user_id ? "Change permissions" : "Invite to Gala Dock"}</Link>}</section>
          </div>}
        </>}

        {(tab === "overview" || tab === "availability") && !editing && <section className="ws-panel ptm-week">
          <div className="pt-week-head"><h2><CalendarDays aria-hidden="true" />Availability</h2>
            <nav className="pt-nav"><Link href={`${base}?tab=${tab}&week=${wk(-1)}`} aria-label="Previous week"><ChevronLeft aria-hidden="true" /></Link><Link href={`${base}?tab=${tab}`}>Today</Link><Link href={`${base}?tab=${tab}&week=${wk(1)}`} aria-label="Next week"><ChevronRight aria-hidden="true" /></Link></nav>
            {manage && <Link href={`${base}?tab=availability&add=1`} className="ws-btn outline sm"><CalendarPlus aria-hidden="true" />Manage availability</Link>}</div>
          <p className="pt-range">{day(new Date(week[0] + 12 * 36e5).toISOString(), { day: "numeric", month: "short" })} – {day(new Date(week[6] + 12 * 36e5).toISOString(), { day: "numeric", month: "short", year: "numeric" })}</p>
          <div className="ptm-cal" style={{ ["--hpx" as string]: `${hourPx}px` }}>
            <div className="ptm-hours">{[8, 12, 16, 20].map(h => <span key={h} style={{ top: (h - H0) * hourPx }}>{String(h).padStart(2, "0")}:00</span>)}</div>
            {week.map(dd => { const sh = mine.filter(s => new Date(s.starts_at).getTime() < dd + 864e5 && new Date(s.ends_at).getTime() > dd), bl = myBlocks.filter(b => new Date(b.starts_at).getTime() < dd + 864e5 && new Date(b.ends_at).getTime() > dd);
              return <div key={dd} className="ptm-day"><b>{day(new Date(dd + 12 * 36e5).toISOString(), { weekday: "short", day: "numeric", month: "short" })}</b><div className="ptm-col" style={{ height: (H1 - H0) * hourPx }}>
                {bl.map(b => <span key={b.id} className="ptm-ev off" style={{ top: 4, height: 30 }}>{b.note || "Unavailable"}</span>)}
                {!bl.length && sh.map(s => { const top = pos(s.starts_at, dd), end = new Date(s.ends_at).getTime() > dd + 864e5 ? H1 - H0 : pos(s.ends_at, dd); return <Link key={s.id} href={s.job_id ? `/provider/bookings/${s.job_id}` : `${base}?tab=assignments`} className={`ptm-ev ${/setup|breakdown/i.test(s.title) ? "setup" : "event"}`}
                  style={{ top: top * hourPx, height: Math.max(44, (end - top) * hourPx) }}><b>{s.title}</b><small>{time(s.starts_at)} – {time(s.ends_at)}</small><small>{s.location}</small></Link>; })}
                {!bl.length && !sh.length && <span className="ptm-ev free" style={{ top: 4, height: 30 }}>Available</span>}</div></div>; })}
          </div>
          {adding && <ActionForm action={addCrewUnavailability.bind(null, c.id)} className="ptm-addblock"><label>From<input name="from" type="date" required /></label><label>To<input name="to" type="date" /></label>
            <label>Reason<select name="reason" className="ws-select"><option>Unavailable</option><option>Holiday</option><option>Sickness</option><option>Training</option></select></label><button className="ws-btn primary sm">Add</button></ActionForm>}
        </section>}

        {(tab === "overview" || tab === "assignments") && !editing && <section className="ws-panel ptm-asg"><div className="ptm-asg-head"><h2>Assignments ({mine.length})</h2>
          <nav className="ws-tabs segment">{([["all", `All`], ["upcoming", `Upcoming (${upcoming.length})`], ["past", `Past (${done.length})`]] as const).map(([k, l]) => <Link key={k} href={`${base}?tab=${tab}&f=${k}`} className={asgFilter === k ? "active" : ""}>{l}</Link>)}</nav></div>
          <table className="ws-table pt-table"><thead><tr><th>Event</th><th>Role</th><th>Venue</th><th>Date &amp; time</th><th>Status</th><th>Notes</th><th aria-label="Open" /></tr></thead>
            <tbody>{asgList.slice(0, tab === "overview" ? 3 : 50).map(s => { const j = job(s.job_id); return <tr key={s.id}><td><span className="pt-name"><Thumb src={j?.image} w={36} h={28} /><b>{j?.event_name ?? s.title}</b></span></td><td>{s.role}</td><td>{s.location}</td>
              <td><span className="pt-asg"><b>{day(s.starts_at, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</b><small>{time(s.starts_at)} – {time(s.ends_at)}</small></span></td>
              <td><span className={`pt-st ${s.status === "confirmed" ? "ok" : s.status === "pending" ? "busy" : ""}`}>{titleCase(s.status)}</span></td><td>{s.title}</td>
              <td>{s.job_id && <Link href={`/provider/bookings/${s.job_id}`} aria-label="Open booking"><ChevronRight aria-hidden="true" /></Link>}</td></tr>; })}</tbody></table>
          {!asgList.length && <p className="pv-none">No assignments.</p>}</section>}

        {tab === "activity" && <section className="ws-panel ptm-act"><h2>Activity</h2><ul>{audit.map(a => <li key={a.id}><span className="ic"><ActivityIcon aria-hidden="true" /></span><span><b>{titleCase(a.event.replace(".", " "))}</b></span><small>{relative(a.created_at, now)}</small></li>)}
          {mine.slice(-5).reverse().map(s => <li key={s.id}><span className="ic"><CalendarCheck aria-hidden="true" /></span><span><b>Assigned: {s.title}</b><small>{day(s.starts_at)}</small></span><small>{s.status}</small></li>)}</ul></section>}
      </div>

      <aside className="pt-rail">
        <section className="ws-panel ptm-status"><h2>Status</h2><div className="ptm-st-row"><span className={`pv-switch${active ? " on" : ""}`} aria-hidden="true"><i /></span><b className={active ? "ok" : ""}>{active ? (st === "unavailable" ? "Unavailable" : "Active") : "Deactivated"}</b>
          {!manage ? null : active ? <ActionButton action={setCrewStatus} args={[c.id, "deactivated"]} confirm={{ title: `Deactivate ${c.name}?`, body: "Their history is kept. Anyone with upcoming confirmed shifts must be reassigned first.", cta: "Deactivate" }}>Deactivate</ActionButton>
            : <ActionButton action={setCrewStatus} args={[c.id, "available"]}>Reactivate</ActionButton>}</div></section>
        <section className="ws-panel ptm-sum"><h2>Availability summary</h2><div><Ring value={pct(split.ok)} size={84} />
          <ul><li><small>Available this month</small></li><li><i className="g" />Available<b>{pct(split.ok)}%</b></li><li><i className="b" />On assignment<b>{pct(split.busy)}%</b></li><li><i className="r" />Unavailable<b>{pct(split.off)}%</b></li></ul></div></section>
        <section className="ws-panel pt-up"><div className="ws-panel-head"><h2>Upcoming assignments</h2><Link className="ws-link" href={`${base}?tab=assignments&f=upcoming`}>View all</Link></div>
          {upcoming.length ? <ul>{upcoming.slice(0, 3).map(s => { const j = job(s.job_id); return <li key={s.id}><Link href={s.job_id ? `/provider/bookings/${s.job_id}` : `${base}?tab=assignments`}><Thumb src={j?.image} w={56} h={46} />
            <span><b>{j?.event_name ?? s.title}</b><small>{s.location}</small><small>{day(s.starts_at, { weekday: "short", day: "numeric", month: "short" })}, {time(s.starts_at)} – {time(s.ends_at)}</small></span>
            <Chip tone={s.status === "confirmed" ? "green" : "amber"} dot>{titleCase(s.status)}</Chip></Link></li>; })}</ul> : <p className="pv-none">No upcoming assignments.</p>}</section>
        <section className="ws-panel ptm-recent"><div className="ws-panel-head"><h2>Recent activity</h2><Link className="ws-link" href={`${base}?tab=activity`}>View all</Link></div>
          <ul>{[...mine.slice(-2).reverse().map(s => ({ k: s.id, icon: CalendarCheck, t: "Booking assigned", s: s.title, at: s.starts_at })), ...myBlocks.slice(-1).map(b => ({ k: b.id, icon: Clock, t: "Availability updated", s: `Marked ${b.note || "unavailable"}`, at: b.starts_at })),
            ...audit.slice(0, 1).map(a => ({ k: String(a.id), icon: FileText, t: titleCase(a.event.replace(".", " ")), s: "", at: a.created_at }))].slice(0, 4).map(x => <li key={x.k}><span className="ic"><x.icon aria-hidden="true" /></span><span><b>{x.t}</b><small>{x.s}</small></span><small>{new Date(x.at).getTime() > now ? `for ${day(x.at, { day: "numeric", month: "short" })}` : relative(x.at, now)}</small></li>)}</ul></section>
      </aside>
    </div>
  </div>;
}
