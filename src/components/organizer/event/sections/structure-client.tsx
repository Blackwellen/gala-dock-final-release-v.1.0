"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Repeat, GitBranch, CalendarDays, MapPin, Ticket, Plus, Trash2, AlertTriangle, CheckCircle2, Unlink, Layers } from "lucide-react";
import { Card, CardHead, Chip, Empty, Btn, Stat, Bar } from "@/components/kit";
import { Dialog, useAction } from "@/components/kit/client";
import { money, num, dateShort, timeRange } from "@/lib/format";
import { createSeriesFromEvent, generateSeriesDates, addSeriesTourDate, editSeriesDates, detachFromSeries, addChildEvent, cascadeEventStatus, saveEventVenues, saveEventDays, savePassComponents, bindComposition } from "@/lib/actions/composition-ui";

type Readiness = { score: number; state?: string };
export type StructureData = {
  event: { id: string; name: string; status: string; starts_at: string | null; ends_at: string | null; timezone: string; role: string; overrides: string[] };
  series: { id: string; name: string; slug: string; kind: string; visibility: string; status: string; timezone: string; version: number; anchor_event_id: string | null;
    recurrence: { freq: string; interval: number; byweekday?: number[]; start_date: string; start_time: string; duration_minutes: number; count?: number; until?: string } | null } | null;
  report: { occurrences: { event_id: string; name: string; starts_at: string | null; status: string; city: string | null; overrides: string[]; capacity: number | null; tickets_sold: number; revenue_minor: number; checked_in: number }[];
    totals: { occurrences: number; upcoming: number; cancelled: number; tickets_sold: number; revenue_minor: number }; provenance: string } | null;
  parent: { id: string; name: string; status: string; starts_at: string | null; ends_at: string | null } | null;
  children: { id: string; name: string; status: string; composition_role: string; starts_at: string | null; ends_at: string | null; capacity: number | null }[];
  readiness: { event: Readiness; children: { event_id: string; name: string; role: string; status: string; readiness: Readiness }[]; children_count: number; worst_child_score: number | null; rolled_up_score: number; blocked_children: number } | null;
  resources: { allocations: { event_id: string; quantity: number; status: string }[]; shifts: { event_id: string; role: string; starts_at: string; headcount: number }[]; crew_double_booked: { crew_id: string; a: string; b: string }[] } | null;
  days: { id: string; day_date: string; label: string | null; starts_at: string; ends_at: string; event_venue_id: string | null; status: string }[];
  dayReport: { day_id: string; date: string; label: string | null; status: string; tiers: { count: number; capacity: number; sold: number }; revenue_minor: number; programme_items: number; staff: { shifts: number; headcount: number }; suppliers: number; admissions: number }[];
  venues: { id: string; venue_name: string; listing_id: string | null; role: string; starts_at: string | null; ends_at: string | null; capacity: number | null }[];
  venueSchedule: { venues: { id: string; venue_name: string; role: string; tiers: number; shifts: number; days: number }[]; transfers: { id: string; kind: string; from: string; to: string; departs_at: string; passengers: number; status: string }[]; transfer_gaps: { crew_id: string; gap_minutes: number }[] } | null;
  rooms: { space_id: string; name: string; capacity_standing: number | null; capacity_seated: number | null; tracks: string[]; sessions: { id: string; title: string; starts_at: string }[]; tiers: { id: string; name: string; quantity: number; sold: number }[]; staff: { id: string }[] }[];
  tiers: { id: string; event_id: string; event_name: string; name: string; quantity: number; sold: number; held: number; status: string; pass_kind: string | null; pass_committed: number; event_day_id?: string | null; space_id?: string | null; valid_venue_ids?: string[] | null }[];
  shifts: { id: string; role: string; title: string; starts_at: string; ends_at: string; status: string; event_day_id: string | null; space_id: string | null; event_venue_id: string | null }[];
  programme: { id: string; title: string; kind: string; starts_at: string; duration_minutes: number; event_day_id: string | null; space_id: string | null }[];
  components: { pass_tier_id: string; component_tier_id: string; units: number }[];
  inventory: Record<string, { available: number; quantity: number; sold: number; held: number; components: { tier_id: string; name: string; available: number; pass_committed: number; units: number }[] } | null>;
};
const TABS: [string, string, typeof Repeat][] = [["series", "Series & tours", Repeat], ["children", "Sub-events", GitBranch], ["days", "Days", CalendarDays], ["venues", "Venues & rooms", MapPin], ["passes", "Passes", Ticket]];
const KIND: Record<string, string> = { series: "Series", recurring: "Recurring", tour: "Tour", festival: "Festival", conference: "Conference" };
const ROLE: Record<string, string> = { stage: "Stage", track: "Track", session: "Session", day: "Day", sub_event: "Sub-event", occurrence: "Occurrence", parent: "Parent", standalone: "Standalone" };
const PASS: Record<string, string> = { season: "Season pass", multi_day: "Multi-day pass", multi_venue: "Multi-venue pass", series: "Series pass" };
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const toIso = (local: string) => (local ? new Date(local).toISOString() : undefined);
const scoreTone = (s: number) => (s >= 80 ? "green" : s >= 50 ? "amber" : "red") as "green" | "amber" | "red";

export function StructureClient({ data, canWrite, canCascade, canTickets }: { data: StructureData; canWrite: boolean; canCascade: boolean; canTickets: boolean }) {
  const [tab, setTab] = useState("series");
  const ro = canWrite ? null : <p className="k-xs k-muted">Read only — you need event edit permission to change the structure.</p>;
  return <div className="oc">
    <div className="oc-kpis">
      <Stat label="Composition" value={ROLE[data.event.role] ?? data.event.role} sub={data.parent ? `Part of ${data.parent.name}` : data.series ? `${KIND[data.series.kind]} · ${data.series.name}` : "Single event"} />
      <Stat label="Series dates" value={num(data.report?.totals.occurrences ?? 0)} sub={data.report ? `${data.report.totals.upcoming} upcoming` : "Not in a series"} />
      <Stat label="Sub-events" value={num(data.children.length)} sub={data.readiness ? `Rolled-up readiness ${Math.round(data.readiness.rolled_up_score)}%` : "None yet"} />
      <Stat label="Days · venues" value={`${data.days.length} · ${data.venues.length}`} sub={`${data.tiers.filter(t => t.event_id === data.event.id && t.pass_kind).length} pass tier(s)`} />
    </div>
    <div className="k-seg oc-tabs" role="tablist" aria-label="Structure">{TABS.map(([k, l, I]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}><I size={14} aria-hidden />{l}</button>)}</div>
    {tab === "series" && <SeriesPanel data={data} canWrite={canWrite} ro={ro} />}
    {tab === "children" && <ChildrenPanel data={data} canWrite={canWrite} canCascade={canCascade} ro={ro} />}
    {tab === "days" && <><DaysPanel data={data} canWrite={canWrite} ro={ro} /><BindingsCard data={data} mode="days" canWrite={canWrite} canTickets={canTickets} /></>}
    {tab === "venues" && <><VenuesPanel data={data} canWrite={canWrite} ro={ro} /><BindingsCard data={data} mode="places" canWrite={canWrite} canTickets={canTickets} /></>}
    {tab === "passes" && <PassesPanel data={data} canTickets={canTickets} />}
  </div>;
}

function SeriesPanel({ data, canWrite, ro }: { data: StructureData; canWrite: boolean; ro: ReactNode }) {
  const { run, pending } = useAction(); const s = data.series; const ev = data.event;
  const startDate = ev.starts_at ? new Date(ev.starts_at).toISOString().slice(0, 10) : "";
  const [f, setF] = useState({ name: `${ev.name} series`, kind: "recurring", visibility: "private", timezone: ev.timezone, repeat: true, freq: "weekly", interval: "1", days: [] as number[], start_date: startDate, start_time: "19:00", duration: "180", end: "count", count: "6", until: "" });
  const [limit, setLimit] = useState("12"); const [tour, setTour] = useState({ at: "", duration: "180", venue: "", city: "" });
  const [edit, setEdit] = useState({ field: "name", value: "", scope: "following" }); const [skips, setSkips] = useState<{ event_id: string; field: string; reason: string }[] | null>(null); const [detach, setDetach] = useState(false);
  if (!s) return <Card>
    <CardHead title="Make this event a series, recurring event or tour" sub="This event becomes the anchor: new dates copy its programme, tasks, dependencies and draft ticket types — never guests, tickets, orders or bookings." />
    {canWrite ? <form className="oc-form" onSubmit={e => { e.preventDefault(); const rec = f.repeat && f.kind !== "tour" ? { freq: f.freq, interval: Number(f.interval) || 1, ...(f.freq === "weekly" && f.days.length ? { byweekday: f.days } : {}), start_date: f.start_date, start_time: f.start_time, duration_minutes: Number(f.duration) || 120, ...(f.end === "count" ? { count: Number(f.count) || 1 } : { until: f.until }) } : undefined;
      void run(() => createSeriesFromEvent(ev.id, { name: f.name, kind: f.kind, visibility: f.visibility, timezone: f.timezone, recurrence: rec })); }}>
      <label className="k-field oc-span2"><span>Series name</span><input className="k-input" value={f.name} maxLength={120} onChange={e => setF({ ...f, name: e.target.value })} /></label>
      <label className="k-field"><span>Type</span><select className="k-select" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="k-field"><span>Visibility</span><select className="k-select" value={f.visibility} onChange={e => setF({ ...f, visibility: e.target.value })}><option value="private">Private (team only)</option><option value="public">Public series page</option></select></label>
      {f.kind !== "tour" && <label className="k-row oc-span2" style={{ gap: 8 }}><input type="checkbox" checked={f.repeat} onChange={e => setF({ ...f, repeat: e.target.checked })} /> Repeat on a schedule</label>}
      {f.repeat && f.kind !== "tour" && <>
        <label className="k-field"><span>Repeats</span><select className="k-select" value={f.freq} onChange={e => setF({ ...f, freq: e.target.value })}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label className="k-field"><span>Every</span><input className="k-input" inputMode="numeric" value={f.interval} onChange={e => setF({ ...f, interval: e.target.value.replace(/\D/g, "") })} /></label>
        {f.freq === "weekly" && <fieldset className="oc-fieldset oc-span2"><legend className="k-label">On</legend><div className="oc-badges">{DOW.map((d, i) => <label key={d} className={`oc-pick ${f.days.includes(i + 1) ? "on" : ""}`}><input type="checkbox" checked={f.days.includes(i + 1)} onChange={e => setF({ ...f, days: e.target.checked ? [...f.days, i + 1].sort() : f.days.filter(x => x !== i + 1) })} />{d}</label>)}</div></fieldset>}
        <label className="k-field"><span>First date</span><input type="date" className="k-input" value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} /></label>
        <label className="k-field"><span>Start time ({f.timezone})</span><input type="time" className="k-input" value={f.start_time} onChange={e => setF({ ...f, start_time: e.target.value })} /></label>
        <label className="k-field"><span>Duration (minutes)</span><input className="k-input" inputMode="numeric" value={f.duration} onChange={e => setF({ ...f, duration: e.target.value.replace(/\D/g, "") })} /></label>
        <label className="k-field"><span>Ends</span><select className="k-select" value={f.end} onChange={e => setF({ ...f, end: e.target.value })}><option value="count">After a number of dates</option><option value="until">On a date</option></select></label>
        {f.end === "count" ? <label className="k-field"><span>Number of dates (max 104)</span><input className="k-input" inputMode="numeric" value={f.count} onChange={e => setF({ ...f, count: e.target.value.replace(/\D/g, "") })} /></label>
          : <label className="k-field"><span>Last date</span><input type="date" className="k-input" value={f.until} onChange={e => setF({ ...f, until: e.target.value })} /></label>}
      </>}
      <div className="oc-span2"><Btn type="submit" icon={Repeat} disabled={pending || f.name.trim().length < 2}>Create {KIND[f.kind]?.toLowerCase()}</Btn></div>
    </form> : <Empty icon={Repeat} title="Not part of a series" text="Someone with event edit permission can turn this event into a series, recurring event or tour." />}
  </Card>;
  const r = data.report; const rec = s.recurrence;
  return <>
    <Card>
      <div className="k-between oc-wrap"><div><h2 className="oc-h">{s.name}</h2><p className="k-small k-muted">{KIND[s.kind]} · {s.visibility === "public" ? "public series page" : "private"} · {s.timezone} · version {s.version}{s.anchor_event_id === ev.id ? " · this event is the anchor" : ""}</p></div>
        <Chip lg tone={s.status === "active" ? "green" : "gray"}>{s.status}</Chip></div>
      {rec ? <p className="k-small" style={{ marginTop: 6 }}>Repeats {rec.freq}{rec.interval > 1 ? ` every ${rec.interval}` : ""}{rec.byweekday?.length ? ` on ${rec.byweekday.map(d => DOW[d - 1]).join(", ")}` : ""} from {rec.start_date} at {rec.start_time} for {rec.duration_minutes} min · {rec.count ? `${rec.count} dates` : `until ${rec.until}`}</p> : <p className="k-small k-muted" style={{ marginTop: 6 }}>No repeat pattern — add dates as tour dates.</p>}
      {ev.overrides.length > 0 && <p className="k-xs k-muted">This date has local overrides ({ev.overrides.join(", ")}) that series-wide edits won&apos;t replace.</p>}
      {canWrite && <div className="k-row oc-wrap" style={{ gap: 8, marginTop: 10 }}>
        {rec && <><label className="k-field" style={{ width: 120 }}><span>Dates to create</span><input className="k-input" inputMode="numeric" value={limit} onChange={e => setLimit(e.target.value.replace(/\D/g, ""))} /></label>
          <Btn size="sm" icon={CalendarDays} disabled={pending || !Number(limit)} onClick={() => void run(() => generateSeriesDates(ev.id, s.id, Math.min(104, Number(limit))))} style={{ alignSelf: "flex-end" }}>Generate dates</Btn></>}
        {ev.role === "occurrence" && <Btn size="sm" variant="ghost" icon={Unlink} onClick={() => setDetach(true)} style={{ alignSelf: "flex-end" }}>Detach this date</Btn>}
      </div>}{ro}
    </Card>
    {canWrite && <div className="oc-grid2">
      <Card><CardHead title="Add a tour date" sub="Its own date and venue; becomes a local override." />
        <form className="oc-form" onSubmit={e => { e.preventDefault(); void run(() => addSeriesTourDate(ev.id, s.id, tour.at, Number(tour.duration), { venue_name: tour.venue, city: tour.city })); }}>
          <label className="k-field"><span>Starts ({s.timezone})</span><input type="datetime-local" className="k-input" value={tour.at} onChange={e => setTour({ ...tour, at: e.target.value })} /></label>
          <label className="k-field"><span>Duration (min)</span><input className="k-input" inputMode="numeric" value={tour.duration} onChange={e => setTour({ ...tour, duration: e.target.value.replace(/\D/g, "") })} /></label>
          <label className="k-field"><span>Venue</span><input className="k-input" value={tour.venue} onChange={e => setTour({ ...tour, venue: e.target.value })} /></label>
          <label className="k-field"><span>City</span><input className="k-input" value={tour.city} onChange={e => setTour({ ...tour, city: e.target.value })} /></label>
          <div className="oc-span2"><Btn type="submit" size="sm" icon={Plus} disabled={pending || !tour.at || tour.venue.trim().length < 2 || tour.city.trim().length < 2}>Add tour date</Btn></div></form></Card>
      <Card><CardHead title="Edit across the series" sub="Past, completed and cancelled dates are never changed; local overrides are skipped and reported." />
        <form className="oc-form" onSubmit={async e => { e.preventDefault(); const v = ["capacity", "duration_minutes"].includes(edit.field) ? Number(edit.value) : edit.value;
          const res = await run(() => editSeriesDates(ev.id, { [edit.field]: v }, edit.scope, s.version)); setSkips(((res as { data?: { skipped: { event_id: string; field: string; reason: string }[] } }).data?.skipped) ?? null); }}>
          <label className="k-field"><span>Field</span><select className="k-select" value={edit.field} onChange={e => setEdit({ ...edit, field: e.target.value, value: "" })}><option value="name">Name</option><option value="start_time">Start time</option><option value="duration_minutes">Duration (min)</option><option value="capacity">Capacity</option><option value="venue_name">Venue name</option><option value="city">City</option><option value="description">Description</option></select></label>
          <label className="k-field"><span>New value</span><input className="k-input" type={edit.field === "start_time" ? "time" : "text"} inputMode={["capacity", "duration_minutes"].includes(edit.field) ? "numeric" : undefined} value={edit.value} onChange={e => setEdit({ ...edit, value: e.target.value })} /></label>
          <fieldset className="oc-fieldset oc-span2"><legend className="k-label">Apply to</legend><div className="k-row oc-wrap" style={{ gap: 14 }}>{[["this", "This date only"], ["following", "This and following"], ["all", "All dates"]].map(([k, l]) => <label key={k} className="k-row" style={{ gap: 6 }}><input type="radio" name="series-scope" checked={edit.scope === k} onChange={() => setEdit({ ...edit, scope: k })} />{l}</label>)}</div></fieldset>
          <div className="oc-span2"><Btn type="submit" size="sm" disabled={pending || !edit.value.trim()}>Apply change</Btn></div></form>
        {skips && skips.length > 0 && <div className="k-notice amber" style={{ marginTop: 8 }}><AlertTriangle size={15} aria-hidden /><div><b>{skips.length} field(s) skipped</b><ul className="oc-ul">{skips.map((k, i) => <li key={i}>{r?.occurrences.find(o => o.event_id === k.event_id)?.name ?? "A date"} keeps its own {k.field.replace(/_/g, " ")} (local override)</li>)}</ul></div></div>}
      </Card>
    </div>}
    <Card>
      <CardHead title="Series report" sub={r?.provenance} />
      {r && r.occurrences.length ? <>
        <div className="oc-kpis"><Stat label="Dates" value={num(r.totals.occurrences)} sub={`${r.totals.upcoming} upcoming · ${r.totals.cancelled} cancelled`} /><Stat label="Tickets sold" value={num(r.totals.tickets_sold)} /><Stat label="Revenue" value={money(r.totals.revenue_minor / 100)} tone="green" /><Stat label="Avg per date" value={num(Math.round(r.totals.tickets_sold / Math.max(1, r.totals.occurrences)))} sub="tickets" /></div>
        <div className="k-table-wrap" style={{ marginTop: 10 }}><table className="k-table"><thead><tr><th>Date</th><th>Name</th><th>Status</th><th className="num">Sold</th><th className="num">Capacity</th><th className="num">Checked in</th><th className="num">Revenue</th><th>Overrides</th></tr></thead><tbody>
          {r.occurrences.map(o => <tr key={o.event_id}><td>{dateShort(o.starts_at)} {timeRange(o.starts_at, null)}</td><td>{o.event_id === ev.id ? <b>{o.name} (this)</b> : <Link className="k-link" href={`/organizer/events/${o.event_id}?tab=plan&section=structure`}>{o.name}</Link>}</td>
            <td><Chip tone={o.status === "cancelled" ? "red" : ["on_sale", "published", "live"].includes(o.status) ? "green" : "gray"}>{o.status.replace(/_/g, " ")}</Chip></td><td className="num">{num(o.tickets_sold)}</td><td className="num">{o.capacity ? num(o.capacity) : "—"}</td><td className="num">{num(o.checked_in)}</td><td className="num">{money(o.revenue_minor / 100)}</td><td className="k-xs">{o.overrides.join(", ") || "—"}</td></tr>)}</tbody></table></div>
      </> : <p className="k-small k-muted">No dates yet. {rec ? "Generate dates from the repeat pattern above." : "Add tour dates above."}</p>}
    </Card>
    <Dialog open={detach} onClose={() => setDetach(false)} title="Detach this date from the series?" sub="It becomes a standalone event. Its tickets, guests and orders stay with it; future series-wide edits won't touch it."
      footer={<><Btn variant="ghost" onClick={() => setDetach(false)}>Keep in series</Btn><Btn variant="danger" disabled={pending} onClick={async () => { const x = await run(() => detachFromSeries(ev.id)); if (x.ok) setDetach(false); }}>Detach</Btn></>}><span /></Dialog>
  </>;
}

const CASCADE = ["published", "on_sale", "live", "completed", "postponed", "cancelled", "archived"];
function ChildrenPanel({ data, canWrite, canCascade, ro }: { data: StructureData; canWrite: boolean; canCascade: boolean; ro: ReactNode }) {
  const { run, pending } = useAction(); const ev = data.event; const rd = data.readiness;
  const local = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };
  const [f, setF] = useState({ name: "", role: "stage", starts: local(ev.starts_at), ends: local(ev.ends_at), capacity: "" });
  const [cx, setCx] = useState<{ to: string; child: string; reason: string } | null>(null);
  const byId = new Map((rd?.children ?? []).map(c => [c.event_id, c]));
  return <>
    {data.parent && <div className="k-notice"><Layers size={16} aria-hidden /><span>This is a {ROLE[ev.role]?.toLowerCase()} of <Link className="k-link" href={`/organizer/events/${data.parent.id}?tab=plan&section=structure`}>{data.parent.name}</Link> ({data.parent.status.replace(/_/g, " ")}). It can only be published after its parent.</span></div>}
    <div className="oc-split">
      <Card>
        <CardHead title="Sub-events" sub="Stages, tracks, sessions and days inside this event's dates (up to three levels)." />
        {rd && <div className="oc-kpis" style={{ marginBottom: 10 }}><Stat label="Rolled-up readiness" value={`${Math.round(rd.rolled_up_score)}%`} tone={scoreTone(rd.rolled_up_score)} sub="worst of parent and children" /><Stat label="This event" value={`${Math.round(rd.event.score)}%`} /><Stat label="Weakest child" value={rd.worst_child_score != null ? `${Math.round(rd.worst_child_score)}%` : "—"} /><Stat label="Not ready" value={num(rd.blocked_children)} tone={rd.blocked_children ? "amber" : undefined} /></div>}
        {data.children.length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Name</th><th>Type</th><th>When</th><th>Status</th><th>Readiness</th></tr></thead><tbody>
          {data.children.map(c => { const s = byId.get(c.id)?.readiness.score; return <tr key={c.id}><td><Link className="k-link" href={`/organizer/events/${c.id}?tab=plan&section=structure`}>{c.name}</Link></td><td>{ROLE[c.composition_role] ?? c.composition_role}</td><td>{dateShort(c.starts_at)} {timeRange(c.starts_at, c.ends_at)}</td>
            <td><Chip tone={c.status === "cancelled" ? "red" : c.status === "draft" ? "gray" : "blue"}>{c.status.replace(/_/g, " ")}</Chip></td><td style={{ minWidth: 110 }}>{s != null ? <Bar value={s} tone={scoreTone(s) === "green" ? "green" : scoreTone(s) === "amber" ? "amber" : "red"} label={`${Math.round(s)}%`} /> : "—"}</td></tr>; })}</tbody></table></div>
          : <Empty icon={GitBranch} title="No sub-events" text="Add stages, tracks or sessions to plan them separately and roll their readiness up to this event." />}
        {canCascade && data.children.length > 0 && <div className="k-row oc-wrap" style={{ gap: 8, marginTop: 12 }}><span className="k-small k-muted">Move this event and its sub-events together:</span>
          <select className="k-select" style={{ maxWidth: 200 }} aria-label="Cascade status" defaultValue="" onChange={e => { if (e.target.value) setCx({ to: e.target.value, child: "same", reason: "" }); e.target.value = ""; }}><option value="">Choose status…</option>{CASCADE.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select></div>}
        {!canCascade && data.children.length > 0 && <p className="k-xs k-muted" style={{ marginTop: 8 }}>Owners and managers can move the parent and its sub-events together.</p>}
      </Card>
      <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
        {canWrite ? <Card><CardHead title="Add a sub-event" sub="Created as a private draft with this event's venue and type." />
          <form className="oc-form" onSubmit={async e => { e.preventDefault(); const r = await run(() => addChildEvent(ev.id, { name: f.name, role: f.role, starts_at: toIso(f.starts), ends_at: toIso(f.ends), ...(f.capacity ? { capacity: Number(f.capacity) } : {}) })); if (r.ok) setF({ ...f, name: "" }); }}>
            <label className="k-field oc-span2"><span>Name</span><input className="k-input" maxLength={120} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Main stage" /></label>
            <label className="k-field"><span>Type</span><select className="k-select" value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>{["stage", "track", "session", "day", "sub_event"].map(k => <option key={k} value={k}>{ROLE[k]}</option>)}</select></label>
            <label className="k-field"><span>Capacity (optional)</span><input className="k-input" inputMode="numeric" value={f.capacity} onChange={e => setF({ ...f, capacity: e.target.value.replace(/\D/g, "") })} /></label>
            <label className="k-field"><span>Starts</span><input type="datetime-local" className="k-input" value={f.starts} onChange={e => setF({ ...f, starts: e.target.value })} /></label>
            <label className="k-field"><span>Ends</span><input type="datetime-local" className="k-input" value={f.ends} onChange={e => setF({ ...f, ends: e.target.value })} /></label>
            <div className="oc-span2"><Btn type="submit" size="sm" icon={Plus} disabled={pending || f.name.trim().length < 2}>Add sub-event</Btn></div></form></Card> : <Card>{ro}</Card>}
        <Card><CardHead title="Shared resources" sub="Equipment and crew across this event and its sub-events." />
          {data.resources ? <><div className="oc-kpis"><Stat label="Equipment allocations" value={num(data.resources.allocations.length)} /><Stat label="Shifts" value={num(data.resources.shifts.length)} sub={`${num(data.resources.shifts.reduce((a, s) => a + Number(s.headcount ?? 0), 0))} people`} /></div>
            {data.resources.crew_double_booked.length ? <p className="k-small k-red" style={{ marginTop: 8 }}><AlertTriangle size={13} aria-hidden /> {data.resources.crew_double_booked.length} crew double-booking(s) across sub-events — check the rota.</p> : <p className="k-small k-green" style={{ marginTop: 8 }}><CheckCircle2 size={13} aria-hidden /> No crew double-bookings.</p>}</>
            : <p className="k-small k-muted">Appears once this event has sub-events.</p>}</Card>
      </div>
    </div>
    <Dialog open={!!cx} onClose={() => setCx(null)} title={`Move to ${cx?.to.replace(/_/g, " ")} with sub-events?`} sub="Sub-events move first, then this event. Any sub-event that can't make the move is reported and skipped."
      footer={<><Btn variant="ghost" onClick={() => setCx(null)}>Cancel</Btn><Btn variant={["cancelled", "postponed"].includes(cx?.to ?? "") ? "danger" : "primary"} disabled={pending || (["cancelled", "postponed"].includes(cx?.to ?? "") && (cx?.reason.trim().length ?? 0) < 10)} onClick={async () => { if (!cx) return; const r = await run(() => cascadeEventStatus(ev.id, cx.to, cx.child, cx.reason)); if (r.ok) setCx(null); }}>Move event</Btn></>}>
      {cx && <div className="k-col" style={{ gap: 10 }}>
        <fieldset className="oc-fieldset"><legend className="k-label">Sub-events</legend><label className="k-row" style={{ gap: 6 }}><input type="radio" name="cx-child" checked={cx.child === "same"} onChange={() => setCx({ ...cx, child: "same" })} /> Move them to the same status</label>
          <label className="k-row" style={{ gap: 6 }}><input type="radio" name="cx-child" checked={cx.child === "detach"} onChange={() => setCx({ ...cx, child: "detach" })} /> Detach them and leave their status unchanged</label></fieldset>
        <label className="k-field"><span>Reason{["cancelled", "postponed"].includes(cx.to) ? " (at least 10 characters — shared with attendees)" : " (optional)"}</span><textarea className="k-input" rows={3} style={{ height: "auto" }} maxLength={2000} value={cx.reason} onChange={e => setCx({ ...cx, reason: e.target.value })} /></label>
        {cx.to === "cancelled" && <p className="k-small k-muted">Cancelling voids tickets and refunds buyers in full on each event moved, exactly as a single cancellation does.</p>}
      </div>}
    </Dialog>
  </>;
}

type DayRow = { date: string; label: string; start: string; end: string; venue: string; status: string };
const hm = (iso: string, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
function DaysPanel({ data, canWrite, ro }: { data: StructureData; canWrite: boolean; ro: ReactNode }) {
  const { run, pending } = useAction(); const tz = data.event.timezone;
  const [rows, setRows] = useState<DayRow[]>(data.days.map(d => ({ date: d.day_date, label: d.label ?? "", start: hm(d.starts_at, tz), end: hm(d.ends_at, tz), venue: d.event_venue_id ?? "", status: d.status })));
  const add = () => { const last = rows.at(-1)?.date ?? (data.event.starts_at ?? new Date().toISOString()).slice(0, 10); const n = new Date(`${last}T12:00:00Z`); if (rows.length) n.setUTCDate(n.getUTCDate() + 1); setRows([...rows, { date: n.toISOString().slice(0, 10), label: `Day ${rows.length + 1}`, start: "10:00", end: "23:00", venue: "", status: "scheduled" }]); };
  const upd = (i: number, k: keyof DayRow, v: string) => setRows(s => s.map((r, j) => j === i ? { ...r, [k]: v } : r));
  return <div className="oc-split">
    <Card><CardHead title="Event days" sub={`Times in ${tz}. Day tickets, programme items, shifts and supplier items can be bound to a day and are kept inside it.`} />
      {rows.length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Date</th><th>Label</th><th>Start</th><th>End</th><th>Venue</th><th>Status</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}>
        <td><input type="date" className="k-input" aria-label={`Day ${i + 1} date`} disabled={!canWrite || data.days.some(d => d.day_date === r.date) && i < data.days.length} value={r.date} onChange={e => upd(i, "date", e.target.value)} /></td>
        <td><input className="k-input" aria-label={`Day ${i + 1} label`} disabled={!canWrite} maxLength={80} value={r.label} onChange={e => upd(i, "label", e.target.value)} /></td>
        <td><input type="time" className="k-input" aria-label={`Day ${i + 1} start`} disabled={!canWrite} value={r.start} onChange={e => upd(i, "start", e.target.value)} /></td>
        <td><input type="time" className="k-input" aria-label={`Day ${i + 1} end`} disabled={!canWrite} value={r.end} onChange={e => upd(i, "end", e.target.value)} /></td>
        <td><select className="k-select" aria-label={`Day ${i + 1} venue`} disabled={!canWrite} value={r.venue} onChange={e => upd(i, "venue", e.target.value)}><option value="">Main venue</option>{data.venues.map(v => <option key={v.id} value={v.id}>{v.venue_name}</option>)}</select></td>
        <td><select className="k-select" aria-label={`Day ${i + 1} status`} disabled={!canWrite} value={r.status} onChange={e => upd(i, "status", e.target.value)}><option value="scheduled">Scheduled</option><option value="cancelled">Cancelled</option></select></td></tr>)}</tbody></table></div>
        : <Empty icon={CalendarDays} title="Single-day event" text="Add days to run a multi-day event with day tickets and day schedules." />}
      {canWrite ? <div className="k-row" style={{ gap: 8, marginTop: 10 }}><Btn size="sm" variant="outline" icon={Plus} onClick={add}>Add day</Btn><Btn size="sm" disabled={pending || !rows.length} onClick={() => void run(() => saveEventDays(data.event.id, rows.map(r => ({ date: r.date, label: r.label || undefined, start_time: r.start, end_time: r.end, event_venue_id: r.venue || undefined, status: r.status }))))}>Save days</Btn>
        <span className="k-xs k-muted">Saved days can be relabelled, retimed or cancelled; their dates stay fixed.</span></div> : ro}
    </Card>
    <Card><CardHead title="Day report" sub="Per day: ticket capacity and sales, revenue, programme, staff, suppliers and admissions." />
      {data.dayReport.length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Day</th><th className="num">Sold / cap.</th><th className="num">Revenue</th><th className="num">Programme</th><th className="num">Staff</th><th className="num">Suppliers</th><th className="num">Admitted</th></tr></thead><tbody>
        {data.dayReport.map(r => <tr key={r.day_id}><td>{r.label ?? dateShort(r.date)}{r.status === "cancelled" && <Chip tone="red">cancelled</Chip>}<br /><small className="k-muted">{dateShort(r.date)}</small></td><td className="num">{num(r.tiers.sold)} / {num(r.tiers.capacity)}</td><td className="num">{money(r.revenue_minor / 100)}</td><td className="num">{num(r.programme_items)}</td><td className="num">{num(r.staff.headcount)}</td><td className="num">{num(r.suppliers)}</td><td className="num">{num(r.admissions)}</td></tr>)}</tbody></table></div>
        : <p className="k-small k-muted">No days yet.</p>}
    </Card>
  </div>;
}

type VenueRow = { id?: string; venue_name: string; role: string; capacity: string };
function VenuesPanel({ data, canWrite, ro }: { data: StructureData; canWrite: boolean; ro: ReactNode }) {
  const { run, pending } = useAction();
  const [rows, setRows] = useState<VenueRow[]>(data.venues.map(v => ({ id: v.id, venue_name: v.venue_name, role: v.role, capacity: v.capacity ? String(v.capacity) : "" })));
  const upd = (i: number, k: keyof VenueRow, v: string) => setRows(s => s.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const vs = data.venueSchedule;
  return <>
    <div className="oc-split">
      <Card><CardHead title="Venues" sub="One primary venue, plus secondary and satellite sites. Tickets and shifts can be limited to a venue." />
        {rows.length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Venue</th><th>Role</th><th>Capacity</th><th /></tr></thead><tbody>{rows.map((r, i) => <tr key={r.id ?? `new-${i}`}>
          <td><input className="k-input" aria-label={`Venue ${i + 1} name`} disabled={!canWrite} maxLength={160} value={r.venue_name} onChange={e => upd(i, "venue_name", e.target.value)} /></td>
          <td><select className="k-select" aria-label={`Venue ${i + 1} role`} disabled={!canWrite} value={r.role} onChange={e => upd(i, "role", e.target.value)}><option value="primary">Primary</option><option value="secondary">Secondary</option><option value="satellite">Satellite</option></select></td>
          <td><input className="k-input" aria-label={`Venue ${i + 1} capacity`} disabled={!canWrite} inputMode="numeric" value={r.capacity} onChange={e => upd(i, "capacity", e.target.value.replace(/\D/g, ""))} /></td>
          <td>{canWrite && <button type="button" className="k-icon-btn" aria-label={`Remove ${r.venue_name || "venue"}`} onClick={() => setRows(s => s.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}</td></tr>)}</tbody></table></div>
          : <Empty icon={MapPin} title="Single venue" text="Add venues to run sites in parallel — schedules, transfers and staff gaps are tracked per site." />}
        {canWrite ? <div className="k-row" style={{ gap: 8, marginTop: 10 }}><Btn size="sm" variant="outline" icon={Plus} onClick={() => setRows([...rows, { venue_name: "", role: rows.some(r => r.role === "primary") ? "secondary" : "primary", capacity: "" }])}>Add venue</Btn>
          <Btn size="sm" disabled={pending || rows.some(r => r.venue_name.trim().length < 2)} onClick={() => void run(() => saveEventVenues(data.event.id, rows.map(r => ({ ...(r.id ? { id: r.id } : {}), venue_name: r.venue_name, role: r.role, ...(r.capacity ? { capacity: Number(r.capacity) } : {}) }))))}>Save venues</Btn>
          <span className="k-xs k-muted">Removing a venue unbinds its tickets, shifts and days.</span></div> : ro}
      </Card>
      <Card><CardHead title="Venue schedule" sub="Bindings, transfers between sites and tight crew moves." />
        {vs && vs.venues.length ? <><ul className="oc-list">{vs.venues.map(v => <li key={v.id} className="oc-li static"><span className="k-grow"><b>{v.venue_name}</b><small>{v.role} · {v.tiers} ticket type(s) · {v.shifts} shift(s) · {v.days} day(s)</small></span></li>)}</ul>
          <h3 className="oc-h3" style={{ marginTop: 10 }}>Transfers</h3>{vs.transfers.length ? <ul className="oc-ul">{vs.transfers.map(t => <li key={t.id}>{dateShort(t.departs_at)} {timeRange(t.departs_at, null)} · {t.from} → {t.to} · {t.passengers} pax · {t.status}</li>)}</ul> : <p className="k-small k-muted">No transfers between these venues in Logistics.</p>}
          {vs.transfer_gaps.length > 0 && <p className="k-small k-amber"><AlertTriangle size={13} aria-hidden /> {vs.transfer_gaps.length} crew move(s) between venues with under 45 minutes ({Math.min(...vs.transfer_gaps.map(g => g.gap_minutes))} min shortest).</p>}</>
          : <p className="k-small k-muted">Add venues to see their schedule.</p>}
      </Card>
    </div>
    <Card><CardHead title="Rooms" sub="Rooms at the event's venues with their sessions, room tickets (capped at room capacity) and staff." />
      {data.rooms.length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Room</th><th className="num">Capacity</th><th>Tracks</th><th className="num">Sessions</th><th>Room tickets</th><th className="num">Staff shifts</th></tr></thead><tbody>
        {data.rooms.map(r => <tr key={r.space_id}><td>{r.name}</td><td className="num">{num(Math.max(r.capacity_standing ?? 0, r.capacity_seated ?? 0)) || "—"}</td><td>{r.tracks.join(", ") || "—"}</td><td className="num">{r.sessions.length}</td><td>{r.tiers.map(t => `${t.name} ${t.sold}/${t.quantity}`).join(" · ") || "—"}</td><td className="num">{r.staff.length}</td></tr>)}</tbody></table></div>
        : <p className="k-small k-muted">No rooms found. Rooms come from the venue listing&apos;s spaces once a venue from the marketplace is attached.</p>}
    </Card>
  </>;
}

function PassesPanel({ data, canTickets }: { data: StructureData; canTickets: boolean }) {
  const { run, pending } = useAction(); const ev = data.event;
  const mine = data.tiers.filter(t => t.event_id === ev.id);
  const passes = mine.filter(t => t.pass_kind);
  const [ed, setEd] = useState<{ tier: string; kind: string; picks: Record<string, number> } | null>(null);
  const open = (tierId: string) => { const t = data.tiers.find(x => x.id === tierId); setEd({ tier: tierId, kind: t?.pass_kind ?? (data.days.length ? "multi_day" : data.series ? "series" : "season"), picks: Object.fromEntries(data.components.filter(c => c.pass_tier_id === tierId).map(c => [c.component_tier_id, c.units])) }); };
  const cand = (passId: string) => data.tiers.filter(t => !t.pass_kind && t.id !== passId);
  const frozen = (t: { sold: number; held: number }) => t.sold + t.held > 0;
  return <>
    <div className="k-notice"><Ticket size={16} aria-hidden /><span>A pass is a ticket type on this event that admits to two or more dates — other days, sub-events or series dates. Each pass sold also uses a place on every date, so no date can oversell. Once a pass has sales its dates are frozen.</span></div>
    <div className="oc-split">
      <Card><CardHead title="Pass tiers" sub="Create the ticket type in Tickets first, then choose its dates here." />
        {passes.length ? <ul className="oc-list">{passes.map(t => { const inv = data.inventory[t.id]; return <li key={t.id} className="oc-li static"><span className="k-grow"><b>{t.name}</b>
          <small>{PASS[t.pass_kind!]} · {num(t.sold)} sold · {inv ? `${num(inv.available)} available across all dates` : ""}</small>
          {inv && <small>{inv.components.map(c => `${c.name}: ${num(c.available)} left`).join(" · ")}</small>}</span>
          {canTickets && <Btn size="sm" variant="outline" disabled={frozen(t)} title={frozen(t) ? "This pass has sales — its dates are frozen." : undefined} onClick={() => open(t.id)}>{frozen(t) ? "Frozen" : "Edit dates"}</Btn>}</li>; })}</ul>
          : <Empty icon={Ticket} title="No passes yet" text={mine.length ? "Turn one of this event's ticket types into a pass by choosing its dates." : "Add a ticket type in Tickets, then make it a pass here."} action={!mine.length ? <Btn size="sm" variant="outline" href={`/organizer/events/${ev.id}?tab=sell`}>Go to tickets</Btn> : undefined} />}
        {canTickets && mine.some(t => !t.pass_kind && !frozen(t)) && <div className="k-row" style={{ gap: 8, marginTop: 10 }}>
          <select className="k-select" style={{ maxWidth: 280 }} aria-label="Ticket type to make a pass" defaultValue="" onChange={e => { if (e.target.value) open(e.target.value); e.target.value = ""; }}><option value="">Make a ticket type a pass…</option>{mine.filter(t => !t.pass_kind && !frozen(t)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>}
        {!canTickets && <p className="k-xs k-muted">Owners and managers (ticket permission) configure passes.</p>}
      </Card>
      <Card><CardHead title="Date inventory" sub="Places held by passes on each date (pass committed) next to single-date sales." />
        {data.tiers.filter(t => !t.pass_kind && t.pass_committed > 0).length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Ticket type</th><th>Event</th><th className="num">Sold</th><th className="num">Pass</th><th className="num">Capacity</th></tr></thead><tbody>
          {data.tiers.filter(t => !t.pass_kind && t.pass_committed > 0).map(t => <tr key={t.id}><td>{t.name}</td><td>{t.event_name}</td><td className="num">{num(t.sold)}</td><td className="num">{num(t.pass_committed)}</td><td className="num">{num(t.quantity)}</td></tr>)}</tbody></table></div>
          : <p className="k-small k-muted">No places committed to passes yet.</p>}
      </Card>
    </div>
    <Dialog open={!!ed} onClose={() => setEd(null)} wide title={`Pass dates · ${data.tiers.find(t => t.id === ed?.tier)?.name ?? ""}`} sub="Choose at least two dates. Units is how many places one pass uses on that date."
      footer={<><Btn variant="ghost" onClick={() => setEd(null)}>Cancel</Btn><Btn disabled={pending || !ed || Object.keys(ed.picks).length < 2} onClick={async () => { if (!ed) return; const r = await run(() => savePassComponents(ev.id, ed.tier, ed.kind, Object.entries(ed.picks).map(([tier_id, units]) => ({ tier_id, units })))); if (r.ok) setEd(null); }}>Save pass</Btn></>}>
      {ed && <div className="k-col" style={{ gap: 10 }}>
        <label className="k-field" style={{ maxWidth: 260 }}><span>Pass type</span><select className="k-select" value={ed.kind} onChange={e => setEd({ ...ed, kind: e.target.value })}>{Object.entries(PASS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {cand(ed.tier).length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Include</th><th>Ticket type</th><th>Event / date</th><th className="num">Available</th><th className="num">Units</th></tr></thead><tbody>
          {cand(ed.tier).map(t => { const on = t.id in ed.picks; return <tr key={t.id}><td><input type="checkbox" aria-label={`Include ${t.name} (${t.event_name})`} checked={on} onChange={e => setEd(s => { if (!s) return s; const p = { ...s.picks }; if (e.target.checked) p[t.id] = 1; else delete p[t.id]; return { ...s, picks: p }; })} /></td>
            <td>{t.name}</td><td>{t.event_name}</td><td className="num">{num(Math.max(0, t.quantity - t.sold - t.held - t.pass_committed))}</td>
            <td className="num"><input className="k-input" style={{ width: 64 }} aria-label={`Units on ${t.name}`} disabled={!on} inputMode="numeric" value={ed.picks[t.id] ?? 1} onChange={e => setEd(s => s ? { ...s, picks: { ...s.picks, [t.id]: Math.max(1, Math.min(10, Number(e.target.value.replace(/\D/g, "")) || 1)) } } : s)} /></td></tr>; })}</tbody></table></div>
          : <p className="k-small k-muted">No other ticket types to include. Add day ticket types, sub-events or series dates first.</p>}
      </div>}
    </Dialog>
  </>;
}

type BindKind = "ticket_tier" | "programme_item" | "shift";
type BindRow = { id: string; name: string; when: string; day: string | null; space: string | null; venues: string[]; venue: string | null; lock: string | null; pass: boolean };
const BIND_TABS: [BindKind, string, string][] = [["ticket_tier", "Ticket types", "Ticket type"], ["programme_item", "Programme", "Programme item"], ["shift", "Shifts", "Shift"]];
/**
 * Binds this event's ticket types, programme items and shifts to a day (Days tab) or to a room and venues (Venues & rooms tab)
 * through set_composition_binding (202610294039). The composition and programme guards decide: day windows, room at the
 * event's venues, room capacity and room clashes come back as reasons. Ticket types need ticket permission; the rest event edit.
 */
function BindingsCard({ data, mode, canWrite, canTickets }: { data: StructureData; mode: "days" | "places"; canWrite: boolean; canTickets: boolean }) {
  const { run, pending } = useAction(); const [kind, setKind] = useState<BindKind>("ticket_tier");
  const ev = data.event; const tz = ev.timezone;
  const bind = (k: BindKind, id: string, b: Record<string, unknown>) => void run(() => bindComposition(ev.id, k, id, b));
  const when = (s: string, e: string | null) => `${dateShort(s)} ${hm(s, tz)}${e ? `–${hm(e, tz)}` : ""}`;
  const rows: BindRow[] = kind === "ticket_tier"
    ? data.tiers.filter(t => t.event_id === ev.id).map(t => ({ id: t.id, name: t.name, when: `${num(t.quantity)} places`, day: t.event_day_id ?? null, space: t.space_id ?? null, venues: t.valid_venue_ids ?? [], venue: null,
        lock: t.sold + t.held + t.pass_committed > 0 ? "This ticket type has sales or holds — its day, room and venues are fixed." : null, pass: !!t.pass_kind }))
    : kind === "programme_item"
      ? data.programme.map(p => ({ id: p.id, name: p.title, when: when(p.starts_at, new Date(Date.parse(p.starts_at) + p.duration_minutes * 6e4).toISOString()), day: p.event_day_id, space: p.space_id, venues: [], venue: null, lock: null, pass: false }))
      : data.shifts.map(s => ({ id: s.id, name: s.title ? `${s.role} · ${s.title}` : s.role, when: when(s.starts_at, s.ends_at), day: s.event_day_id, space: s.space_id, venues: [], venue: s.event_venue_id, lock: null, pass: false }));
  const allowed = kind === "ticket_tier" ? canTickets : canWrite;
  const noPerm = kind === "ticket_tier" ? "Ticket permission (owners and managers) is needed to bind ticket types." : "Event edit permission is needed to bind programme items and shifts.";
  const reason = (r: BindRow) => !allowed ? noPerm : r.lock ?? (mode === "days" && r.pass ? "A pass spans several dates, so it isn't bound to one day." : null);
  const ready = mode === "days" ? data.days.length > 0 : data.rooms.length > 0 || data.venues.length > 0;
  const bound = (r: BindRow) => mode === "days" ? !!r.day : !!(r.space || r.venue || r.venues.length);
  const unbind = (r: BindRow) => bind(kind, r.id, mode === "days" ? { event_day_id: null } : { space_id: null, ...(kind === "ticket_tier" ? { valid_venue_ids: null } : kind === "shift" ? { event_venue_id: null } : {}) });
  const cap = (x: { capacity_standing: number | null; capacity_seated: number | null }) => Math.max(x.capacity_standing ?? 0, x.capacity_seated ?? 0);
  return <Card>
    <CardHead title={mode === "days" ? "Bind to days" : "Bind to rooms and venues"} sub={mode === "days" ? "Day tickets are only valid on their day; programme items and shifts must fall inside it (shifts may start or end up to six hours outside)." : "Room tickets count against the room's capacity and room sessions can't clash. Ticket types can be limited to some venues; a shift runs at one venue."} />
    <div className="k-seg oc-tabs" role="tablist" aria-label="Items to bind">{BIND_TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{l}</button>)}</div>
    {!ready ? <p className="k-small k-muted">{mode === "days" ? "Save the event's days above first, then bind items to them." : "Add venues above (or attach a marketplace venue with rooms) to bind items to rooms and venues."}</p>
      : rows.length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>{BIND_TABS.find(t => t[0] === kind)![2]}</th><th>When</th>
        {mode === "days" ? <th>Day</th> : <><th>Room</th>{kind !== "programme_item" && <th>{kind === "ticket_tier" ? "Valid at venues" : "Venue"}</th>}</>}<th><span className="k-sr">Unbind</span></th></tr></thead><tbody>
        {rows.map(r => { const why = reason(r); const dis = pending || !!why; return <tr key={r.id}><td>{r.name}{r.lock && <small className="k-muted"> · fixed</small>}</td><td className="k-small">{r.when}</td>
          {mode === "days" ? <td><select className="k-select" aria-label={`Day for ${r.name}`} disabled={dis} title={why ?? undefined} value={r.day ?? ""} onChange={e => bind(kind, r.id, { event_day_id: e.target.value || null })}>
            <option value="">Not bound (any day)</option>{data.days.map(d => <option key={d.id} value={d.id} disabled={d.status === "cancelled" && d.id !== r.day}>{d.label || dateShort(d.day_date)}{d.status === "cancelled" ? " (cancelled)" : ""}</option>)}</select></td>
          : <><td><select className="k-select" aria-label={`Room for ${r.name}`} disabled={dis} title={why ?? undefined} value={r.space ?? ""} onChange={e => bind(kind, r.id, { space_id: e.target.value || null })}>
              <option value="">No room</option>{data.rooms.map(x => <option key={x.space_id} value={x.space_id}>{x.name}{cap(x) ? ` (${num(cap(x))})` : ""}</option>)}
              {r.space && !data.rooms.some(x => x.space_id === r.space) && <option value={r.space}>Current room</option>}</select></td>
            {kind === "shift" && <td><select className="k-select" aria-label={`Venue for ${r.name}`} disabled={dis} title={why ?? undefined} value={r.venue ?? ""} onChange={e => bind(kind, r.id, { event_venue_id: e.target.value || null })}>
              <option value="">Any venue</option>{data.venues.map(v => <option key={v.id} value={v.id}>{v.venue_name}</option>)}</select></td>}
            {kind === "ticket_tier" && <td>{data.venues.length ? <div className="oc-badges">{data.venues.map(v => { const on = r.venues.includes(v.id); return <label key={v.id} className={`oc-pick ${on ? "on" : ""}`} title={why ?? undefined}><input type="checkbox" aria-label={`${r.name} valid at ${v.venue_name}`} disabled={dis} checked={on}
                onChange={e => bind(kind, r.id, { valid_venue_ids: e.target.checked ? [...r.venues, v.id] : r.venues.filter(x => x !== v.id) })} />{v.venue_name}</label>; })}</div>
              : <span className="k-xs k-muted">All venues</span>}</td>}</>}
          <td>{bound(r) && <button type="button" className="k-icon-btn" aria-label={`Unbind ${r.name}`} title={why ?? "Unbind"} disabled={dis} onClick={() => unbind(r)}><Unlink size={14} /></button>}</td></tr>; })}</tbody></table></div>
      : <p className="k-small k-muted">{kind === "ticket_tier" ? "No ticket types on this event yet — add them in Sell › Tickets." : kind === "programme_item" ? "No programme items yet — add them in Plan › Programme." : "No shifts yet — add them in Staffing."}</p>}
    {!allowed && rows.length > 0 && <p className="k-xs k-muted">{noPerm}</p>}
  </Card>;
}
