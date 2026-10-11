import Link from "next/link";
import { ClipboardList, Users, ScanLine, Map, Coffee, Truck, AlertTriangle, ShieldAlert, Radio, Activity, Clock, UserCheck, Ticket, ArrowRight, Plus, Circle, CheckCircle2, ChevronRight, Expand, Crosshair } from "lucide-react";
import { Card, Chip, Bar, Ring, Avatars, Avatar, BarChart, Empty } from "@/components/kit";
import { num, time, dateShort, relative, pct } from "@/lib/format";
import type { ProEvent, EventData } from "@/lib/data/event";
import { defaultStructure, defaultOverlay, type MapStructure, type OverlayEl } from "@/lib/venue-map";
import { VenueMapSvg } from "../venue-map/render";
import { SubTabs } from "./header";
import { itemStatus } from "./overview";
import { AddProgrammeButton, RunSheetStatus, TaskCheck, AddTaskButton, IncidentButton, ResolveIncident, StatusButton } from "./controls";
import { CheckInScanner } from "@/components/shared/checkin-scanner";

const RS: Record<string, [string, "green" | "amber" | "blue"]> = { done: ["Done", "green"], in_progress: ["In progress", "amber"], upcoming: ["Upcoming", "blue"] };

export function OpsTab({ e, d, section }: { e: ProEvent; d: EventData; section: string }) {
  const base = `/organizer/events/${e.id}?tab=operations`;
  const items = [["runsheet", "Run Sheet", ClipboardList], ["team", "Team/Crew", Users], ["checkin", "Check-in", ScanLine], ["floor", "Floor & Map", Map], ["hospitality", "Hospitality", Coffee], ["logistics", "Logistics", Truck], ["risk", "Risk", AlertTriangle], ["incidents", "Incidents", ShieldAlert], ["live", "Live Event Mode", Radio]] as const;
  const s = items.some(i => i[0] === section) ? section : "runsheet";
  return <>
    <SubTabs current={s} items={items.map(([k, l, I]) => ({ key: k, label: l, icon: I, href: k === "floor" ? `/organizer/events/${e.id}/map?tab=operations` : `${base}${k === "runsheet" ? "" : `&section=${k}`}` }))} />
    {s === "runsheet" && <RunSheetView e={e} d={d} />}
    {s === "team" && <TeamView e={e} d={d} />}
    {s === "checkin" && <div className="o-grid-main"><Card><h2 className="ov-h" style={{ fontSize: 16, marginBottom: 10 }}>Ticket check-in</h2><CheckInScanner eventId={e.id} /></Card><CheckinStats d={d} /></div>}
    {(s === "hospitality" || s === "logistics" || s === "risk") && <TaskBoard e={e} d={d} category={s} />}
    {s === "incidents" && <IncidentsView e={e} d={d} full />}
    {s === "live" && <LiveMode e={e} d={d} />}
  </>;
}

function opsKpis(e: ProEvent, d: EventData) {
  const ms = e.starts_at ? new Date(e.starts_at).getTime() - Date.now() : 0;
  const doors = ms > 0 ? (ms > 864e5 ? `${Math.floor(ms / 864e5)}d ${Math.floor((ms % 864e5) / 36e5)}h` : `${Math.floor(ms / 36e5)}h ${Math.floor((ms % 36e5) / 6e4)}m`) : e.status === "live" ? "Open now" : "Ended";
  const checkedCrew = d.shifts.filter(s => s.status === "confirmed" && s.crew_id).length;
  const confirmed = d.primary.filter(b => ["confirmed", "fulfilled"].includes(b.status)).length;
  const open = d.incidents.filter(i => i.status === "open");
  return { doors, checkedCrew, confirmed, open, high: open.filter(i => ["high", "critical"].includes(i.severity)).length };
}

function RunSheetView({ e, d }: { e: ProEvent; d: EventData }) {
  const k = opsKpis(e, d); const rs = d.programme.filter(p => p.kind === "run_sheet");
  const structure = (d.vmap?.structure && Object.keys(d.vmap.structure as object).length ? d.vmap.structure : defaultStructure(e.capacity ?? 2000)) as MapStructure;
  const overlay = (Array.isArray(d.vmap?.overlay) && (d.vmap!.overlay as unknown[]).length ? d.vmap!.overlay : defaultOverlay(d.tiers)) as OverlayEl[];
  const opsTasks = d.tasks.filter(t => ["operations", "hospitality", "risk", "logistics"].includes(t.category));
  const live = [["Run sheet finalised", rs.length > 0 && rs.every(r => r.status !== "upcoming" || true) && rs.length >= 5], ["Team checked in", k.checkedCrew >= d.crewNeeded && d.crewNeeded > 0], ["Key suppliers confirmed", k.confirmed === d.primary.length && d.primary.length > 0], ["Venue ready", !!e.readiness.checks.find(c => c.key === "venue")?.ok], ["Check-in system active", d.tiers.length > 0], ["All critical tasks complete", !!e.readiness.checks.find(c => c.key === "tasks")?.ok]] as [string, boolean][];
  const crewIds = [...new Set(d.shifts.filter(s => s.crew_id).map(s => s.crew_id!))];
  const crewPeople = crewIds.map(id => d.crewMap.get(id)).filter(Boolean) as { name: string; avatar: string }[];
  return <>
    <div className="k-grid k-g6 op-kpis">
      <div className="k-kpi"><span className="k-tile lg green"><Activity size={20} /></span><div><div className="lbl">Event status</div><div className={`val ${e.readiness.score >= 75 ? "k-green" : "k-amber"}`} style={{ fontSize: 16 }}>{e.readiness.score >= 75 ? "On track" : "Needs attention"}</div><div className="sub">{e.readiness.score >= 75 ? "All systems go" : `${e.readiness.checks.filter(c => !c.ok).length} checks open`}</div></div></div>
      <div className="k-kpi"><span className="k-tile lg purple"><Clock size={20} /></span><div><div className="lbl">Doors open in</div><div className="val" style={{ fontSize: 17 }}>{k.doors}</div><div className="sub">Doors at {time(e.starts_at)}</div></div></div>
      <div className="k-kpi"><span className="k-tile lg"><Users size={20} /></span><div className="k-grow"><div className="lbl">Team checked in</div><div className="k-between"><div className="val" style={{ fontSize: 17 }}>{k.checkedCrew} / {d.crewNeeded}</div><span className="k-small">{pct(k.checkedCrew, d.crewNeeded)}%</span></div><Bar value={pct(k.checkedCrew, d.crewNeeded)} label="Team checked in" /></div></div>
      <div className="k-kpi"><span className="k-tile lg green"><Ticket size={20} /></span><div className="k-grow"><div className="lbl">Guests checked in</div><div className="k-between"><div className="val" style={{ fontSize: 17 }}>{num(d.usedTickets)} / {num(d.cap)}</div><span className="k-small">{pct(d.usedTickets, d.cap)}%</span></div><Bar value={pct(d.usedTickets, d.cap)} label="Guests checked in" /></div></div>
      <div className="k-kpi"><span className="k-tile lg"><Truck size={20} /></span><div><div className="lbl">Key suppliers</div><div className="val" style={{ fontSize: 17 }}>{k.confirmed} / {d.primary.length}</div><div className="sub">Confirmed</div></div></div>
      <div className="k-kpi"><span className="k-tile lg red"><AlertTriangle size={20} /></span><div><div className="lbl">Open issues</div><div className="val k-red" style={{ fontSize: 17 }}>{k.open.length}</div><div className="sub k-red">{k.high} high priority</div></div></div>
    </div>
    <div className="op-row2">
      <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Run sheet</h3><Link className="k-link" href={`/organizer/events/${e.id}?tab=operations&section=live`}>View full run sheet <ArrowRight size={12} /></Link></div>
        <div className="k-between" style={{ margin: "10px 0" }}><div className="k-seg"><span role="tab" aria-selected={false}>All</span><span role="tab" aria-selected={false}>Pre-Event</span><span role="tab" aria-selected>Live Event</span><span role="tab" aria-selected={false}>Post Event</span></div><AddProgrammeButton eventId={e.id} kind="run_sheet" defaultDate={e.starts_at} label="Add item" /></div>
        {rs.length ? <table className="k-table"><thead><tr><th>Time</th><th>Activity</th><th>Area</th><th>Owner</th><th>Status</th><th /></tr></thead><tbody>{rs.map(r => { const [l, t] = RS[r.status] ?? ["Upcoming", "blue"]; return <tr key={r.id} className={r.status === "in_progress" ? "op-now" : ""}><td><span className="k-row" style={{ gap: 6 }}><i className={`k-dot tone-dot-${t === "green" ? "green" : t === "amber" ? "amber" : "purple"}`} />{time(r.starts_at)}</span></td><td style={{ color: "var(--k-ink)" }}>{r.title}</td><td>{r.area}</td><td><span className="k-row" style={{ gap: 6 }}><Avatar name={r.owner_name || "—"} size="sm" />{r.owner_name}</span></td><td><Chip tone={t}>{l}</Chip></td><td><RunSheetStatus eventId={e.id} itemId={r.id} status={r.status} /></td></tr>; })}</tbody></table> : <Empty icon={ClipboardList} title="No run sheet yet" text="Add timed operational items, or ask Gala Agent to build one from the programme." />}</Card>
      <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Venue map & live overview</h3><div className="k-seg"><Link role="tab" aria-selected href={`/organizer/events/${e.id}/map?tab=operations`}>Operational</Link><Link role="tab" aria-selected={false} href={`/organizer/events/${e.id}/map?tab=preview`}>Public view</Link></div></div>
        <div className="sl-map" style={{ marginTop: 10 }}><VenueMapSvg structure={structure} overlay={overlay} height={300} mode="operations" /><div className="sl-map-tools"><Link href={`/organizer/events/${e.id}/map?tab=operations`} className="k-icon-btn" aria-label="Expand map"><Expand size={14} /></Link><Link href={`/organizer/events/${e.id}/map`} className="k-icon-btn" aria-label="Edit map"><Crosshair size={14} /></Link></div></div></Card>
      <div className="k-col" style={{ gap: 14 }}>
        <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Live event controls</h3><Chip tone={e.status === "live" ? "green" : "red"}><i className="k-dot" />{e.status === "live" ? "Live" : "Not live"}</Chip></div><p className="k-small" style={{ margin: "4px 0 10px" }}>Go live to enable real-time operational tools</p>
          <ul className="pl-check">{live.map(([l, ok]) => <li key={l}>{ok ? <CheckCircle2 size={17} className="k-green" /> : <Circle size={17} className="k-muted" />}<span>{l}</span></li>)}</ul>
          {e.status === "live" ? <Link href={`/organizer/events/${e.id}?tab=operations&section=live`} className="k-btn green block lg" style={{ marginTop: 10 }}><Radio size={15} />Open Live Mode</Link> : <div style={{ marginTop: 10 }}><StatusButton eventId={e.id} to="live" disabled={e.status !== "on_sale"} title={e.status !== "on_sale" ? "Event must be on sale before going live" : ""}><Radio size={15} />Start Live Mode</StatusButton></div>}</Card>
        <CheckinStats d={d} />
      </div>
    </div>
    <div className="op-row3">
      <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Team & crew</h3><Link className="k-link" href={`/organizer/events/${e.id}?tab=operations&section=team`}>View all <ArrowRight size={12} /></Link></div>
        <div className="k-row" style={{ gap: 16, margin: "10px 0" }}><Ring value={pct(k.checkedCrew, d.crewNeeded)} size={96} stroke={9} color="var(--k-green)" label={`${k.checkedCrew} / ${d.crewNeeded}`} sub="Assigned" fontSize={17} />
          <ul className="k-col" style={{ gap: 8, listStyle: "none", padding: 0, margin: 0, fontSize: 12 }}><li className="k-between" style={{ gap: 18 }}><span className="k-row" style={{ gap: 6 }}><i className="k-dot tone-dot-green" />Confirmed</span><b>{d.shifts.filter(s => s.status === "confirmed").length}</b></li><li className="k-between"><span className="k-row" style={{ gap: 6 }}><i className="k-dot tone-dot-amber" />Pending</span><b>{d.shifts.filter(s => s.status === "pending").length}</b></li><li className="k-between"><span className="k-row" style={{ gap: 6 }}><i className="k-dot tone-dot-red" />Draft</span><b>{d.shifts.filter(s => s.status === "draft").length}</b></li></ul></div>
        <div className="k-between"><Avatars people={crewPeople} max={4} size="lg" /><Link className="k-btn outline sm" href="/organizer/team">Manage team</Link></div></Card>
      <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Supplier status</h3><Link className="k-link" href={`/organizer/events/${e.id}?tab=plan&section=suppliers`}>View all <ArrowRight size={12} /></Link></div>
        <div className="k-list">{d.primary.filter(b => b.category !== "venue").slice(0, 4).map(b => <div key={b.id} className="k-li">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={b.image || "/assets/gd/oe-neon.webp"} alt="" className="k-thumb sm" /><div className="k-grow"><b className="k-small k-strong">{b.title}</b><div className="k-xs k-muted" style={{ textTransform: "capitalize" }}>{b.category}</div></div><Chip tone={itemStatus(b.status).tone}>{itemStatus(b.status).label}</Chip><ChevronRight size={14} className="k-muted" /></div>)}</div></Card>
      <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Operational tasks</h3><AddTaskButton eventId={e.id} category="operations" label="Add" /></div>
        <ul className="k-list" style={{ listStyle: "none", padding: 0, margin: "6px 0 0" }}>{opsTasks.slice(0, 6).map(t => <li key={t.id} className="k-li"><TaskCheck eventId={e.id} taskId={t.id} done={t.status === "done"} title={t.title} /><span className="k-grow k-small" style={{ color: "var(--k-ink-2)" }}>{t.title}</span><span className={`k-xs ${t.due_at && t.due_at.slice(0, 10) === new Date().toISOString().slice(0, 10) ? "k-red" : "k-muted"}`}>{t.due_at ? (t.due_at.slice(0, 10) === new Date().toISOString().slice(0, 10) ? "Today" : "Tomorrow") : ""}</span></li>)}</ul></Card>
      <IncidentsView e={e} d={d} />
    </div>
  </>;
}

function CheckinStats({ d }: { d: EventData }) {
  const hours = Array.from({ length: 7 }, (_, i) => 16 + i); const byHour = hours.map(h => d.checkins.filter(c => c.result === "admitted" && new Date(c.created_at).getUTCHours() + 1 === h).length);
  return <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Check-in live stats</h3><Link className="k-link" href="?tab=operations&section=checkin">View all <ArrowRight size={12} /></Link></div>
    <div className="k-row" style={{ gap: 16, margin: "10px 0" }}><Ring value={pct(d.usedTickets, d.cap)} size={90} stroke={9} color="var(--k-green)" fontSize={18} />
      <ul className="k-col" style={{ gap: 6, listStyle: "none", padding: 0, margin: 0, fontSize: 12 }}><li><i className="k-dot tone-dot-green" /> <b>{num(d.usedTickets)}</b> <span className="k-muted">Checked in</span></li><li><i className="k-dot" style={{ background: "#cbd5e1" }} /> <b>{num(Math.max(0, d.validTickets - d.usedTickets))}</b> <span className="k-muted">Remaining</span></li><li><i className="k-dot tone-dot-purple" /> <b>{num(d.cap)}</b> <span className="k-muted">Total capacity</span></li></ul></div>
    <BarChart labels={hours.map(h => `${h}:00`)} series={[byHour]} colors={["#93b4fb"]} height={70} />
    <div className="k-row k-wrap k-xs" style={{ gap: 12, marginTop: 8 }}>{d.tiers.filter(t => t.kind !== "comp").slice(0, 3).map(t => <span key={t.id} className="k-row" style={{ gap: 4 }}><i className="k-dot" style={{ background: t.color }} />{t.name.split(" ")[0]} <b>{num(t.sold)}</b></span>)}</div></Card>;
}

function IncidentsView({ e, d, full }: { e: ProEvent; d: EventData; full?: boolean }) {
  const list = full ? d.incidents : d.incidents.slice(0, 4);
  return <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>{full ? "Incidents" : "Recent incidents / notes"}</h3>{full ? <IncidentButton eventId={e.id} /> : <Link className="k-link" href={`/organizer/events/${e.id}?tab=operations&section=incidents`}>View all <ArrowRight size={12} /></Link>}</div>
    <ul className="k-list" style={{ listStyle: "none", padding: 0, margin: "6px 0 0" }}>{list.map(i => <li key={i.id} className="k-li" style={{ alignItems: "flex-start" }}><span className={`op-inc ${i.severity}`}>{i.severity === "high" || i.severity === "critical" ? "!" : "i"}</span><div className="k-grow"><b className="k-small" style={{ color: "var(--k-ink)", fontWeight: 550 }}>{i.title}</b><div className="k-xs k-muted">{time(i.created_at)} · {i.status === "resolved" ? "Resolved" : i.detail || "Open"}</div></div>{full && i.status === "open" && <ResolveIncident eventId={e.id} incidentId={i.id} />}{full && <Chip tone={i.status === "open" ? "red" : "green"}>{i.status}</Chip>}</li>)}{!list.length && <p className="k-small">No incidents recorded.</p>}</ul>
    {!full && <div style={{ marginTop: 8 }}><IncidentButton eventId={e.id} label="Report" /></div>}</Card>;
}

function TeamView({ e, d }: { e: ProEvent; d: EventData }) {
  return <Card flush><div className="k-between" style={{ padding: "14px 16px" }}><div><h2 className="ov-h" style={{ fontSize: 16 }}>Team & crew for this event</h2><p className="k-small">External crew participate in this event only and don&apos;t gain workspace access.</p></div><Link className="k-btn primary" href={`/organizer/team?tab=shifts&event=${e.id}`}><Plus size={15} />Create shift</Link></div>
    {d.shifts.length ? <table className="k-table"><thead><tr><th>Person</th><th>Role</th><th>Shift</th><th>Location</th><th>Status</th></tr></thead><tbody>{d.shifts.map(s => { const c = s.crew_id ? d.crewMap.get(s.crew_id) : null; return <tr key={s.id}><td><span className="k-row" style={{ gap: 8 }}><Avatar src={c?.avatar} name={c?.name ?? "Unfilled"} size="sm" />{c ? <Link href={`/organizer/team/${c.id}`} className="k-strong">{c.name}</Link> : <span className="k-red">Unfilled</span>}</span></td><td>{s.role}</td><td>{dateShort(s.starts_at)} {time(s.starts_at)}–{time(s.ends_at)}</td><td>{s.location}</td><td><Chip tone={s.status === "confirmed" ? "green" : s.status === "pending" ? "amber" : "gray"}>{s.status}</Chip></td></tr>; })}</tbody></table> : <Empty icon={Users} title="No shifts yet" />}</Card>;
}

function TaskBoard({ e, d, category }: { e: ProEvent; d: EventData; category: "hospitality" | "logistics" | "risk" }) {
  const list = d.tasks.filter(t => t.category === category);
  const title = { hospitality: "Hospitality", logistics: "Logistics", risk: "Risk & compliance" }[category];
  const hint = { hospitality: "Artist riders, green rooms, VIP and guest hospitality.", logistics: "Deliveries, power, fencing, transport and load-in.", risk: "Risk assessment, medical cover, licences and emergency plans." }[category];
  return <Card><div className="k-between" style={{ marginBottom: 10 }}><div><h2 className="ov-h" style={{ fontSize: 16 }}>{title}</h2><p className="k-small">{hint}</p></div><AddTaskButton eventId={e.id} category={category} variant="primary" /></div>
    <ul className="k-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>{list.map(t => <li key={t.id} className="k-li"><TaskCheck eventId={e.id} taskId={t.id} done={t.status === "done"} title={t.title} /><span className="k-grow" style={{ color: t.status === "done" ? "var(--k-muted)" : "var(--k-ink)", textDecoration: t.status === "done" ? "line-through" : undefined }}>{t.title}</span><Chip tone={t.priority === "high" ? "red" : "blue"}>{t.priority}</Chip><span className="k-xs k-muted">{t.due_at ? dateShort(t.due_at) : ""}</span></li>)}</ul>
    {!list.length && <Empty icon={ClipboardList} title={`No ${title.toLowerCase()} tasks`} />}</Card>;
}

function LiveMode({ e, d }: { e: ProEvent; d: EventData }) {
  const now = new Date().toISOString(); const rs = d.programme.filter(p => p.kind === "run_sheet" || p.kind === "programme");
  const current = rs.filter(r => r.starts_at <= now).at(-1), next = rs.find(r => r.starts_at > now);
  return <div className="lm">
    {e.status !== "live" && <div className="k-notice amber"><AlertTriangle size={16} className="k-amber" /><span><b>Live Mode preview.</b> Real-time controls activate when the event is marked live (from 36 hours before start).</span></div>}
    <div className="lm-grid">
      <Card><h3 className="ov-h">Now</h3><b className="lm-big">{current?.title ?? "Pre-event"}</b><p className="k-small">{current ? `${time(current.starts_at)} · ${current.area}` : `Doors at ${time(e.starts_at)}`}</p><div className="k-menu-sep" /><h3 className="ov-h">Up next</h3><b style={{ fontSize: 16 }}>{next?.title ?? "—"}</b><p className="k-small">{next ? `${time(next.starts_at)} · ${relative(next.starts_at)}` : ""}</p></Card>
      <Card><h3 className="ov-h">Admissions</h3><b className="lm-big">{num(d.usedTickets)}</b><p className="k-small">of {num(d.validTickets)} valid tickets checked in</p><Bar value={pct(d.usedTickets, d.validTickets)} tone="green" label="Admissions" /><Link href={`/organizer/events/${e.id}?tab=operations&section=checkin`} className="k-btn primary block" style={{ marginTop: 12 }}><ScanLine size={15} />Scan tickets</Link></Card>
      <Card><h3 className="ov-h">Open incidents</h3><b className="lm-big k-red">{d.incidents.filter(i => i.status === "open").length}</b><p className="k-small">{d.incidents.filter(i => i.status === "open" && ["high", "critical"].includes(i.severity)).length} high priority</p><div style={{ marginTop: 12 }}><IncidentButton eventId={e.id} /></div></Card>
      <Card><h3 className="ov-h">Crew on shift</h3><b className="lm-big">{d.shifts.filter(s => s.starts_at <= now && s.ends_at >= now).length}</b><p className="k-small">active now · {d.shifts.length} total shifts</p><Link href={`/organizer/events/${e.id}?tab=operations&section=team`} className="k-btn outline block" style={{ marginTop: 12 }}><UserCheck size={15} />Crew roster</Link></Card>
    </div>
    <Card><h3 className="ov-h" style={{ marginBottom: 8 }}>Full run sheet</h3><ol className="pl-sched">{rs.map(r => <li key={r.id} className={r.status === "done" ? "done" : ""}><span className="pl-sched-date">{time(r.starts_at)}</span><i className={`k-dot tone-dot-${r.status === "done" ? "green" : r.status === "in_progress" ? "amber" : "blue"}`} /><span className="k-grow">{r.title}</span><span className="k-xs k-muted">{r.area}</span><RunSheetStatus eventId={e.id} itemId={r.id} status={r.status} /></li>)}</ol></Card>
  </div>;
}
