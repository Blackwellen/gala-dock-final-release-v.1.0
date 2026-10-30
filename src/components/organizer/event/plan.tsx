import Link from "next/link";
import { AreaFilter } from "./area-filter";
import { FileText, CalendarRange, Building2, Users, UserCheck, CalendarDays, ListChecks, Folder, PenLine, CheckCircle2, Circle, Sparkles, MoreHorizontal, Wand2, Search, Layers, UtensilsCrossed, Wine, Shield, Tent, CreditCard, User, Volume2, ArrowRight, Clock3, MapPin, Store, AlertTriangle, Download, Upload, Ticket } from "lucide-react";
import { Card, Chip, Bar, Avatar, Beta, Empty } from "@/components/kit";
import { money, num, dateShort, time, dayMonth, relative, eventTypeLabel } from "@/lib/format";
import type { ProEvent, EventData } from "@/lib/data/event";
import { SubTabs } from "./header";
import { itemStatus } from "./overview";
import { AddProgrammeButton, ProgrammeItemMenu, TaskCheck, AddTaskButton, ItemActions, VenueConfirm } from "./controls";
import { FileUploader } from "./files-client";
import { TeamConflicts } from "@/components/ops/readiness-panel";
import { MessageButton } from "@/components/messaging/messaging-client";
import { createClient } from "@/lib/supabase/server";
import { GitBranch, Handshake, ShieldCheck, Accessibility, MonitorPlay, Network, ClipboardSignature } from "lucide-react";
import { DependenciesSection } from "./sections/dependencies";
import { PartnersSection } from "./sections/partners";
import { ComplianceSection } from "./sections/compliance";
import { AccessibilitySection } from "./sections/accessibility";
import { OnlineSection } from "./sections/online";
import { StructureSection } from "./sections/structure";
import { FormsSection } from "./sections/forms";
import { BriefEditor } from "./brief-client";
import { untyped } from "@/lib/workspace/db";

const ICONS: Record<string, React.ComponentType<{ size?: number }>> = { layers: Layers, utensils: UtensilsCrossed, wine: Wine, shield: Shield, tent: Tent, card: CreditCard, user: User, volume: Volume2 };
/** Programme structure adapts to event type (not one universal timeline). */
export const PROGRAMME_MODEL: Record<string, { areaLabel: string; addLabel: string; defaults: string[]; hint: string }> = {
  festival: { areaLabel: "Stage", addLabel: "Add act", defaults: ["Main Stage", "Second Stage", "Operations"], hint: "Main stage programme with set times, acts and key moments." },
  wedding: { areaLabel: "Space", addLabel: "Add moment", defaults: ["Ceremony", "Reception", "Dinner", "Party"], hint: "Ceremony, reception and vendor sequence." },
  nightlife: { areaLabel: "Room", addLabel: "Add set", defaults: ["Main Room", "Terrace", "Security"], hint: "Doors, DJ sets, security and curfew." },
  conference: { areaLabel: "Room", addLabel: "Add session", defaults: ["Main Hall", "Breakout A", "Breakout B"], hint: "Sessions, speakers, rooms and AV." },
  corporate: { areaLabel: "Room", addLabel: "Add session", defaults: ["Main Hall", "Breakout"], hint: "Agenda sessions, speakers and breaks." },
  webinar: { areaLabel: "Track", addLabel: "Add segment", defaults: ["Stream", "Q&A", "Tech rehearsal"], hint: "Stream technology, speakers, audience access and rehearsals." },
  default: { areaLabel: "Area", addLabel: "Add item", defaults: ["Main"], hint: "Key moments and timings for the day." },
};
export const modelFor = (t: string) => PROGRAMME_MODEL[t] ?? PROGRAMME_MODEL.default!;

export function PlanTab({ e, d, section, role }: { e: ProEvent; d: EventData; section: string; role: string }) {
  const base = `/organizer/events/${e.id}?tab=plan`;
  const items = [["brief", "Brief", FileText], ["programme", "Programme", CalendarRange], ["venue", "Venue", Building2], ["suppliers", "Suppliers", Users], ["guests", "Guests", UserCheck], ["schedule", "Schedule", CalendarDays], ["tasks", "Tasks", ListChecks], ["files", "Files", Folder]] as const;
  const more = [["dependencies", "Dependencies", GitBranch], ["partners", "Partners", Handshake], ["compliance", "Compliance", ShieldCheck], ["accessibility", "Accessibility", Accessibility], ["online", "Online sessions", MonitorPlay], ["structure", "Structure", Network], ["forms", "Forms & waivers", ClipboardSignature]] as const;
  const s = items.some(i => i[0] === section) || more.some(i => i[0] === section) ? section : "brief";
  const sp = { e, d, role };
  return <>
    <SubTabs current={s} items={items.map(([k, l, I]) => ({ key: k, label: l, icon: I, href: `${base}${k === "brief" ? "" : `&section=${k}`}` }))} more={more.map(([k, l, I]) => ({ key: k, label: l, icon: I, href: `${base}&section=${k}` }))} />
    {s === "dependencies" && <DependenciesSection {...sp} />}
    {s === "partners" && <PartnersSection {...sp} />}
    {s === "compliance" && <ComplianceSection {...sp} />}
    {s === "accessibility" && <AccessibilitySection {...sp} />}
    {s === "online" && <OnlineSection {...sp} />}
    {s === "structure" && <StructureSection {...sp} />}
    {s === "forms" && <FormsSection {...sp} />}
    {(s === "brief" || s === "schedule") && <TeamConflicts workspaceId={e.workspace_id as string} eventId={e.id} limit={5} hideEmpty />}
    {s === "brief" && <Brief e={e} d={d} />}
    {s === "programme" && <Card><ProgrammeList e={e} d={d} full /></Card>}
    {s === "venue" && <VenueSection e={e} d={d} />}
    {s === "suppliers" && <Suppliers e={e} d={d} canConfirm={["owner", "manager"].includes(role)} />}
    {s === "guests" && <GuestsSection e={e} d={d} />}
    {s === "schedule" && <ScheduleSection e={e} d={d} />}
    {s === "tasks" && <TasksSection e={e} d={d} />}
    {s === "files" && <FilesSection e={e} d={d} />}
  </>;
}

function checklist(e: ProEvent, d: EventData) {
  const has = (k: string) => e.readiness.checks.find(c => c.key === k)?.ok ?? false;
  const t = (re: RegExp) => d.tasks.some(x => re.test(x.title) && x.status === "done");
  return [
    ["Event brief and objectives", !!e.description && ((e.settings.objectives as string[] | undefined)?.length ?? 0) > 0],
    ["Venue booked", has("venue")], ["Key suppliers confirmed", has("providers")],
    ["Programme finalised", d.programme.filter(p => p.kind === "programme").length >= 3],
    ["Tickets setup", d.tiers.length > 0], ["Marketing plan", d.promos.length > 0],
    ["Risk assessment", t(/risk assessment/i)], ["Licences and permits", t(/licen/i)],
    ["Team & crew plan", d.shifts.length > 0], ["Operational run sheet", d.programme.some(p => p.kind === "run_sheet")],
    ["Insurance confirmed", t(/insurance/i)], ["Final review", e.status !== "draft" && e.status !== "planning" && e.readiness.score === 100],
  ] as [string, boolean][];
}

type BriefRow = Record<string, unknown> & { id: string; version: number; is_current: boolean; created_by: string | null; created_at: string; change_note: string };
/** Canonical brief versions (event_briefs, append-only) + who may edit (save_event_brief needs events.write) + author names. */
async function briefData(e: ProEvent) {
  const sb = await createClient(); const db = untyped(sb);
  const [{ data: rows }, { data: perm }, { data: { user } }] = await Promise.all([
    db.from("event_briefs").select("*").eq("event_id", e.id).order("version", { ascending: false }).limit(12) as unknown as PromiseLike<{ data: BriefRow[] | null }>,
    db.rpc("has_permission", { p_workspace: e.workspace_id, p_permission: "events.write" }),
    sb.auth.getUser(),
  ]);
  const versions = rows ?? [];
  const ids = [...new Set(versions.map(v => v.created_by).filter((x): x is string => !!x && x !== user?.id))];
  const { data: crew } = ids.length ? await sb.from("crew_members").select("user_id,name").eq("workspace_id", e.workspace_id as string).in("user_id", ids) : { data: [] };
  const names = new Map((crew ?? []).map(c => [c.user_id as string, c.name]));
  const author = (id: string | null) => !id ? "a teammate" : id === user?.id ? "you" : names.get(id) ?? "a teammate";
  return { current: versions.find(v => v.is_current) ?? null, versions, canEdit: perm === true, author };
}
const briefList = (v: unknown) => (Array.isArray(v) ? v : []).map(x => typeof x === "string" ? x : String((x as { text?: string })?.text ?? "")).filter(Boolean);

async function Brief({ e, d }: { e: ProEvent; d: EventData }) {
  const cl = checklist(e, d); const done = cl.filter(c => c[1]).length;
  const bd = await briefData(e); const cur = bd.current;
  const objectives = cur && briefList(cur.goals).length ? briefList(cur.goals) : (e.settings.objectives as string[] | undefined) ?? (e.goal ? e.goal.split(/;\s*/) : []);
  const typeSettings = (e.settings.type_settings as [string, string][] | undefined) ?? [];
  const venueItem = d.items.find(b => b.category === "venue");
  const confirmedGuests = d.guests.filter(g => g.status === "confirmed").length || d.validTickets;
  const aud = (cur?.audience ?? {}) as { size?: number; profile?: string; ages?: string };
  const facts = cur ? ([["Scope", String(cur.scope ?? "")], ["Client needs", String(cur.client_needs ?? "")], ["Audience", [aud.size ? `${num(aud.size)} guests` : "", aud.ages ?? "", aud.profile ?? ""].filter(Boolean).join(" · ")],
    ["Budget", cur.budget_min != null || cur.budget_max != null ? [cur.budget_min, cur.budget_max].map(v => v == null ? "—" : money(Number(v))).join(" – ") : ""], ["Location", String(cur.location_needs ?? "")],
    ["Must-haves", briefList(cur.must_haves).join("; ")], ["Constraints", briefList(cur.constraints).join("; ")], ["Success measures", briefList(cur.success_measures).join("; ")]] as const).filter(([, v]) => v) : [];
  return <div className="pl-grid">
    <div className="k-col" style={{ gap: 14 }}>
      <Card><div className="k-between"><h2 className="ov-h" style={{ fontSize: 15.5 }}>Event brief {cur && <Chip tone="purple">v{cur.version}</Chip>}</h2><BriefEditor eventId={e.id} brief={cur} version={cur?.version ?? 0} canEdit={bd.canEdit} reason="Your role can view the brief but not edit it." /></div>
        {cur && <p className="k-xs k-muted bf-meta">Version {cur.version} saved {relative(cur.created_at)} by {bd.author(cur.created_by)}{cur.change_note ? ` — “${cur.change_note}”` : ""}</p>}
        <p style={{ color: "var(--k-ink-2)", fontSize: 13.5, lineHeight: 1.55, margin: "8px 0 10px", maxWidth: 640 }}>{e.description || "No brief yet. Use Edit event to describe the concept, audience and goals."}</p>
        <div className="k-row k-wrap" style={{ gap: 6 }}>{[eventTypeLabel(e.event_type), ...e.tags.filter(t => t.toLowerCase() !== eventTypeLabel(e.event_type).toLowerCase()), ...(d.tiers.length ? ["Ticketed"] : [])].map((t, i) => <Chip key={t} lg tone={(["purple", "blue", "green", "gray", "red"] as const)[i % 5]}>{t}</Chip>)}</div>
        <div className="pl-two">
          <div className="pl-box"><h4>Key objectives</h4><ul>{objectives.map(o => <li key={o}><CheckCircle2 size={16} className="k-green" />{o}</li>)}{!objectives.length && <li className="k-muted">No objectives recorded.</li>}</ul></div>
          <div className="pl-box"><h4>Event type settings</h4><div className="pl-settings">{typeSettings.map(([l, ic]) => { const I = ICONS[ic] ?? Layers; return <span key={l}><I size={14} />{l}</span>; })}{!typeSettings.length && <span>{eventTypeLabel(e.event_type)} defaults</span>}</div></div>
        </div>
        {facts.length > 0 && <dl className="bf-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
        {!cur && <p className="k-small k-muted" style={{ marginTop: 10 }}>No structured brief yet. {bd.canEdit ? "Use Edit brief to record goals, audience, budget range, must-haves and constraints — suppliers you book see a scoped copy." : ""}</p>}
        {bd.versions.length > 0 && <details className="bf-history"><summary>Version history ({bd.versions.length}{bd.versions.length === 12 ? "+" : ""})</summary>
          <ol>{bd.versions.map(v => <li key={v.id}><Chip tone={v.is_current ? "green" : "gray"}>v{v.version}</Chip><span className="k-grow"><b className="k-small">{v.is_current ? "Current" : `Version ${v.version}`}</b><small className="k-xs k-muted"> · {dateShort(v.created_at)} {time(v.created_at)} by {bd.author(v.created_by)}{v.change_note ? ` — “${v.change_note}”` : ""}</small>
            <small className="k-xs k-muted bf-hgoals">{briefList(v.goals).slice(0, 3).join(" · ") || "No goals recorded"}</small></span></li>)}</ol></details>}</Card>
      <Card><ProgrammeList e={e} d={d} /></Card>
    </div>
    <div className="k-col" style={{ gap: 14 }}>
      <section className="k-agent"><div className="k-between"><div className="k-agent-head" style={{ margin: 0 }}><Sparkles size={18} className="k-spark" /><h3>Gala Agent</h3><Beta /></div><MoreHorizontal size={16} className="k-muted" /></div><p style={{ margin: "6px 0 8px" }}>I can help you plan this event:</p>
        <ul className="pl-agent-list">{["Create a full programme", "Find and compare suppliers", "Build run sheet and tasks", "Check readiness and risks", "Prepare approval requests"].map(x => <li key={x}><CheckCircle2 size={16} className="k-green" />{x}</li>)}</ul>
        <Link href={`/organizer/agent?event=${e.id}&goal=${encodeURIComponent(`Generate a full event plan for ${e.name}`)}`} className="k-btn outline block lg" style={{ marginTop: 10 }}><Wand2 size={15} />Generate event plan</Link>
        <Link href={`/organizer/marketplace?event=${e.id}`} className="k-btn ghost block" style={{ marginTop: 8, color: "var(--k-blue)" }}><Search size={15} />Find suppliers for this event</Link></section>
      <Card><div className="k-between"><h3 className="ov-h">Venue</h3><Link className="k-link" href={`/organizer/events/${e.id}?tab=plan&section=venue`}>View all <ArrowRight size={12} /></Link></div>
        <div className="k-li" style={{ marginTop: 8 }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={venueItem?.image || "/assets/gd/v-riverside-park.webp"} alt="" className="k-thumb" /><div className="k-grow"><b className="k-small k-strong">{e.venue_name || "Venue not set"}</b><div className="k-xs k-muted">{e.location}</div></div><Chip tone={e.readiness.checks.find(c => c.key === "venue")?.ok ? "green" : "amber"}>{e.readiness.checks.find(c => c.key === "venue")?.ok ? "Confirmed" : "Not confirmed"}</Chip></div>
        <div className="k-grid k-g3 pl-venue-stats"><div><Users size={14} /><span><small>Capacity</small>{e.capacity ? num(e.capacity) : "—"}</span></div><div><Layers size={14} /><span><small>Areas</small>{String(e.settings.areas ?? "—")} {e.settings.areas ? "stages" : ""}</span></div><div><Clock3 size={14} /><span><small>Curfew</small>{String(e.settings.curfew ?? "—")}</span></div></div>
        <div className="k-grid k-g2" style={{ gap: 8, marginTop: 10 }}><Link className="k-btn outline sm" href={venueItem?.listing_id ? `/organizer/marketplace/venue/${venueItem.listing_id}` : `/organizer/marketplace?tab=venues&event=${e.id}`}><Building2 size={13} />View venue</Link><Link className="k-btn outline sm" href={`/organizer/events/${e.id}?tab=plan&section=venue`}><PenLine size={13} />Edit booking</Link></div></Card>
      <Card><div className="k-between"><h3 className="ov-h">Guests</h3><Link className="k-link" href={`/organizer/events/${e.id}?tab=plan&section=guests`}>View all <ArrowRight size={12} /></Link></div>
        <div className="k-grid k-g3" style={{ gap: 8, marginTop: 10 }}>{([[num(confirmedGuests), "Confirmed", "green"], [num(d.guests.filter(g => g.status === "pending").length), "Pending", "amber"], [num(d.guests.filter(g => g.status === "invited").length), "Invited", "purple"]] as const).map(([v, l, t]) => <div key={l} className="pl-gstat"><span className={`k-tile sm ${t}`}><Users size={13} /></span><span><b>{v}</b><small>{l}</small></span></div>)}</div>
        <div className="k-grid k-g2" style={{ gap: 8, marginTop: 10 }}><Link className="k-btn outline sm" href={`/organizer/events/${e.id}?tab=plan&section=guests`}>Manage guests</Link><Link className="k-btn outline sm" href={`/organizer/events/${e.id}?tab=plan&section=guests&import=1`}><Upload size={13} />Import guests</Link></div></Card>
    </div>
    <div className="k-col" style={{ gap: 14 }}>
      <Card><div className="k-between"><h3 className="ov-h">Event planning checklist</h3><span className="k-small">{done}/{cl.length} complete</span></div><div style={{ margin: "10px 0" }}><Bar value={(100 * done) / cl.length} tone="green" label="Checklist progress" /></div>
        <ul className="pl-check">{cl.map(([l, ok]) => <li key={l}>{ok ? <CheckCircle2 size={17} className="k-green" /> : <Circle size={17} className="k-muted" />}<span style={{ color: ok ? "var(--k-ink-2)" : "var(--k-muted)" }}>{l}</span></li>)}</ul>
        <Link href={`/organizer/events/${e.id}?tab=plan&section=tasks`} className="k-btn outline block" style={{ marginTop: 10 }}>View full checklist <ArrowRight size={14} /></Link></Card>
      <Card><div className="k-between"><h3 className="ov-h">Tasks</h3><Link className="k-link" href={`/organizer/events/${e.id}?tab=plan&section=tasks`}>View all <ArrowRight size={12} /></Link></div>
        <ul className="k-list" style={{ listStyle: "none", padding: 0, margin: "6px 0 0" }}>{d.tasks.filter(t => !["operations", "hospitality", "logistics", "risk"].includes(t.category)).slice(0, 4).map(t => <li key={t.id} className="k-li" style={{ alignItems: "flex-start" }}><span className={`pl-pri ${t.priority}`} /><div className="k-grow"><b className="k-small" style={{ fontWeight: 550, color: "var(--k-ink)" }}>{t.title}</b><div className="k-xs k-muted k-row" style={{ gap: 4, marginTop: 3 }}><CalendarDays size={11} />{t.due_at ? dateShort(t.due_at) : "No date"}</div></div><Chip tone={t.priority === "high" || t.priority === "critical" ? "red" : t.priority === "low" ? "green" : "blue"}>{t.priority[0]!.toUpperCase() + t.priority.slice(1)}</Chip><Avatar name={t.assignee_name || "Unassigned"} src={d.crewMap.size ? [...d.crewMap.values()].find(c => c.name === t.assignee_name)?.avatar : null} size="sm" /></li>)}</ul></Card>
    </div>
  </div>;
}

export function ProgrammeList({ e, d, full }: { e: ProEvent; d: EventData; full?: boolean }) {
  const m = modelFor(e.event_type);
  const rows = d.programme.filter(p => p.kind === "programme");
  const areas = [...new Set(rows.map(r => r.area).filter(Boolean))];
  return <>
    <div className="k-between" style={{ marginBottom: 10 }}><div><h2 className="ov-h" style={{ fontSize: 15.5 }}>Programme</h2><p className="k-small">{m.hint}</p></div>
      <div className="k-row" style={{ gap: 8 }}>{areas.length > 1 && <><span className="k-small k-muted">View by:</span><AreaFilter areas={areas as string[]} label={m.areaLabel} target="prog" /></>}<AddProgrammeButton eventId={e.id} kind="programme" defaultDate={e.starts_at} label={m.addLabel} /><Link className="k-btn outline sm" href={`/organizer/agent?event=${e.id}&goal=${encodeURIComponent(`Import and structure the programme for ${e.name}`)}`}><Download size={13} />Import</Link></div></div>
    {rows.length === 0 ? <Empty icon={CalendarRange} title="No programme yet" text={`Add ${m.areaLabel.toLowerCase()} timings, or ask Gala Agent to draft a ${eventTypeLabel(e.event_type).toLowerCase()} programme.`} /> :
      <ol className="pl-prog" data-areas="prog">{rows.slice(0, full ? 100 : 7).map(p => <li key={p.id} data-area={p.area ?? ""}><span className="pl-time">{time(p.starts_at)}</span><i className="pl-node" />{/* eslint-disable-next-line @next/next/no-img-element */}{p.image ? <img src={p.image} alt="" /> : <span className="pl-img-ph" />}<div className="k-grow"><b>{p.title}</b><small>{p.detail}</small></div><Chip tone={p.area === "Public" ? "green" : p.area === "Operations" ? "green" : "purple"}>{p.area || "—"}</Chip><span className="pl-dur">{p.area === "Public" || p.area === "Operations" ? "" : `${p.duration_minutes} min`}</span><ProgrammeItemMenu eventId={e.id} itemId={p.id} title={p.title} /></li>)}</ol>}
  </>;
}

function VenueSection({ e, d }: { e: ProEvent; d: EventData }) {
  const venues = d.items.filter(b => b.category === "venue");
  const confirmed = e.readiness.checks.find(c => c.key === "venue")?.ok;
  return <div className="o-grid-main">
    <Card><h2 className="ov-h" style={{ fontSize: 15.5 }}>Venue</h2><p className="k-small" style={{ marginBottom: 12 }}>Venue and date confirmation gates supplier bookings, seating publication and ticket inventory for {eventTypeLabel(e.event_type).toLowerCase()} events.</p>
      {venues.length ? <div className="k-list">{venues.map(v => <div key={v.id} className="k-li">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={v.image || "/assets/gd/v-riverside-park.webp"} alt="" className="k-thumb lg" /><div className="k-grow"><b className="k-strong">{v.title}</b><div className="k-small k-muted">{v.package} · {v.amount != null ? money(v.amount) : "Price tbc"}</div></div><Chip tone={itemStatus(v.status).tone}>{itemStatus(v.status).label}</Chip><ItemActions eventId={e.id} itemId={v.id} status={v.status} title={v.title} canConfirm /></div>)}</div>
        : <Empty icon={Building2} title={confirmed ? `${e.venue_name} (booked off-platform)` : "No venue yet"} text={confirmed ? "Recorded as confirmed outside Gala Dock." : "Unknown venue creates a sourcing requirement — planning continues while you source."} />}
      <div className="k-row k-wrap" style={{ gap: 8, marginTop: 14 }}><Link className="k-btn primary" href={`/organizer/marketplace?tab=venues&event=${e.id}`}><Store size={15} />Find a venue</Link><Link className="k-btn outline" href={`/organizer/marketplace/requests/new?step=1&event=${e.id}&category=venue`}>Request venue quotes</Link>{!confirmed && <VenueConfirm eventId={e.id} venueName={e.venue_name} />}<Link className="k-btn outline" href={`/organizer/events/${e.id}/map`}><MapPin size={15} />Venue map</Link></div></Card>
    <Card><h3 className="ov-h">Venue facts</h3><dl className="ov-dl">{([["Venue", e.venue_name || "TBC"], ["Location", e.location || "—"], ["Capacity", e.capacity ? num(e.capacity) : "—"], ["Areas", String(e.settings.areas ?? "—")], ["Curfew", String(e.settings.curfew ?? "—")], ["Status", confirmed ? "Confirmed" : "Not confirmed"]] as const).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></Card>
  </div>;
}

async function Suppliers({ e, d, canConfirm }: { e: ProEvent; d: EventData; canConfirm: boolean }) {
  // Provider workspaces for "Message" (enquiries go from this workspace's shared inbox; contact rules enforced in the DB).
  const ids = [...new Set(d.items.map(b => b.listing_id).filter(Boolean))] as string[];
  const { data: ls } = ids.length ? await (await createClient()).from("listings").select("id,workspace_id").in("id", ids) : { data: [] };
  const wsOf = new Map((ls ?? []).map(l => [l.id, l.workspace_id as string | null]));
  const venueOk = e.readiness.checks.find(c => c.key === "venue")?.ok;
  return <div className="k-col" style={{ gap: 14 }}>
    {!venueOk && e.settings.venue_gates_suppliers === true && <div className="k-notice amber"><AlertTriangle size={16} className="k-amber" /><span><b>Venue not confirmed.</b> You can shortlist, request quotes and hold suppliers, but confirming a booking requires a confirmed venue for this event. <Link className="k-link" href={`/organizer/events/${e.id}?tab=plan&section=venue`}>Resolve venue</Link></span></div>}
    <Card flush><div className="k-between" style={{ padding: "14px 16px" }}><div><h2 className="ov-h" style={{ fontSize: 15.5 }}>Suppliers & bookings</h2><p className="k-small">Suggestions, requests, quotes, holds and confirmed bookings — each with its own lifecycle.</p></div>
      <div className="k-row" style={{ gap: 8 }}><Link className="k-btn outline" href={`/organizer/marketplace?event=${e.id}`}><Search size={15} />Find providers</Link><Link className="k-btn primary" href={`/organizer/marketplace/requests/new?step=1&event=${e.id}`}>New request (RFQ)</Link></div></div>
      <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Provider</th><th>Category</th><th>Package</th><th className="num">Price</th><th>Role</th><th>Status</th><th>Deadline</th><th><span className="k-sr">Actions</span></th></tr></thead>
        <tbody>{d.items.map(b => <tr key={b.id}><td><span className="k-row" style={{ gap: 10 }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={b.image || "/assets/gd/oe-neon.webp"} alt="" className="k-thumb sm" /><b className="k-strong">{b.title}</b></span></td><td style={{ textTransform: "capitalize" }}>{b.category}</td><td className="k-ellipsis" style={{ maxWidth: 220 }}>{b.package}</td><td className="num">{b.amount != null ? money(b.amount) : "—"}</td><td style={{ textTransform: "capitalize" }}>{b.role}</td><td><Chip tone={itemStatus(b.status).tone}>{itemStatus(b.status).label}</Chip></td><td className="k-small">{b.status === "held" && b.hold_expires_at ? `Hold until ${dateShort(b.hold_expires_at)}` : b.response_deadline && ["sent", "awaiting"].includes(b.status) ? `Reply by ${dateShort(b.response_deadline)}` : "—"}</td><td><span className="k-row" style={{ gap: 6, flexWrap: "nowrap" }}>{b.listing_id && wsOf.get(b.listing_id) && <MessageButton toType="workspace" to={wsOf.get(b.listing_id)!} asWorkspace={e.workspace_id as string} kind="booking" listingId={b.listing_id} eventId={e.id} itemId={b.id} subject={`${b.title} — ${e.name}`.slice(0, 140)} label="Message" inbox="/organizer/inbox" />}<ItemActions eventId={e.id} itemId={b.id} status={b.status} title={b.title} canConfirm={canConfirm} /></span></td></tr>)}</tbody></table></div>
      {!d.items.length && <Empty icon={Users} title="No suppliers yet" text="Search the marketplace or send an RFQ to multiple providers." />}</Card>
    {d.requests.length > 0 && <Card><h3 className="ov-h">Requests (RFQs)</h3><div className="k-list" style={{ marginTop: 6 }}>{d.requests.map(r => <Link key={r.id} href={`/organizer/marketplace/requests/${r.id}`} className="k-li"><span className="k-tile sm"><FileText size={14} /></span><div className="k-grow"><b className="k-small k-strong">{r.title}</b><div className="k-xs k-muted">{r.reference} · {d.items.filter(i => i.request_id === r.id && i.status === "quoted").length} quotes · {r.response_deadline ? `responses due ${dateShort(r.response_deadline)}` : ""}</div></div><Chip tone="blue">{r.status}</Chip><ArrowRight size={14} className="k-muted" /></Link>)}</div></Card>}
  </div>;
}

function GuestsSection({ e, d }: { e: ProEvent; d: EventData }) {
  return <Card flush><div className="k-between" style={{ padding: "14px 16px" }}><div><h2 className="ov-h" style={{ fontSize: 15.5 }}>Guests & attendees</h2><p className="k-small">{num(d.validTickets)} ticket holders · {num(d.guests.length)} invited guests</p></div><Link className="k-btn primary" href={`/organizer/events/${e.id}?tab=operations&section=checkin`}><Ticket size={15} />Check-in</Link></div>
    {d.guests.length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Name</th><th>Status</th><th>Group</th><th>Plus one</th><th>Notes</th><th>Invited</th></tr></thead><tbody>{d.guests.map(g => <tr key={g.id}><td><b className="k-strong">{g.name}</b><div className="k-xs k-muted">{g.email}</div></td><td><Chip tone={g.status === "confirmed" ? "green" : g.status === "declined" ? "red" : g.status === "pending" ? "amber" : "blue"}>{g.status}</Chip></td><td>{g.group_name || "—"}</td><td>{g.plus_one ? "Yes" : "No"}</td><td>{g.dietary || "—"}</td><td>{g.invited_at ? dateShort(g.invited_at) : "—"}</td></tr>)}</tbody></table></div>
      : <Empty icon={UserCheck} title="No guest list" text="Ticket holders are managed in Sell & Promote. Add VIPs, press and artist guests here." />}</Card>;
}

function ScheduleSection({ e, d }: { e: ProEvent; d: EventData }) {
  const rows = [
    ...d.tasks.filter(t => t.due_at).map(t => ({ at: t.due_at!, label: t.title, kind: "Task", tone: "blue" as const, done: t.status === "done" })),
    ...d.payments.filter(p => p.due_at).map(p => ({ at: p.due_at!, label: `${p.payee} ${p.kind} ${money(p.amount)}`, kind: "Payment", tone: "amber" as const, done: p.status === "paid" })),
    ...d.tiers.filter(t => t.sale_start).map(t => ({ at: t.sale_start!, label: `${t.name} release`, kind: "Ticket release", tone: "purple" as const, done: t.sale_start! < new Date().toISOString() })),
    ...d.promos.filter(p => p.scheduled_at).map(p => ({ at: p.scheduled_at!, label: p.channel, kind: "Promotion", tone: "pink" as const, done: p.status === "sent" })),
    ...d.shifts.map(s => ({ at: s.starts_at, label: `${s.title || s.role} shift`, kind: "Crew", tone: "green" as const, done: false })),
    ...(e.starts_at ? [{ at: e.starts_at, label: "Event starts", kind: "Event", tone: "red" as const, done: false }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return <Card><h2 className="ov-h" style={{ fontSize: 15.5, marginBottom: 12 }}>Schedule</h2><p className="k-small" style={{ marginBottom: 12 }}>Every dated item for this event from tasks, payments, ticket releases, promotion and crew shifts.</p>
    <ol className="pl-sched">{rows.map((r, i) => <li key={i} className={r.done ? "done" : ""}><span className="pl-sched-date">{dayMonth(r.at)}<small>{time(r.at)}</small></span><i className={`k-dot tone-dot-${r.tone}`} /><span className="k-grow">{r.label}</span><Chip tone={r.tone}>{r.kind}</Chip></li>)}</ol></Card>;
}

function TasksSection({ e, d }: { e: ProEvent; d: EventData }) {
  const groups = [...new Set(d.tasks.map(t => t.category))];
  return <Card><div className="k-between" style={{ marginBottom: 12 }}><div><h2 className="ov-h" style={{ fontSize: 15.5 }}>Tasks</h2><p className="k-small">{d.tasks.filter(t => t.status === "done").length} of {d.tasks.length} complete</p></div><AddTaskButton eventId={e.id} variant="primary" /></div>
    {groups.map(g => <div key={g} style={{ marginBottom: 14 }}><h3 className="k-small k-muted" style={{ textTransform: "capitalize", marginBottom: 6 }}>{g}</h3><ul className="k-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>{d.tasks.filter(t => t.category === g).map(t => <li key={t.id} className="k-li"><TaskCheck eventId={e.id} taskId={t.id} done={t.status === "done"} title={t.title} /><span className="k-grow" style={{ textDecoration: t.status === "done" ? "line-through" : undefined, color: t.status === "done" ? "var(--k-muted)" : "var(--k-ink)" }}>{t.title}</span><span className="k-xs k-muted">{t.assignee_name}</span><Chip tone={t.priority === "high" || t.priority === "critical" ? "red" : "blue"}>{t.priority}</Chip><span className="k-xs k-muted" style={{ width: 80, textAlign: "right" }}>{t.due_at ? dateShort(t.due_at) : "—"}</span></li>)}</ul></div>)}
    {!d.tasks.length && <Empty icon={ListChecks} title="No tasks yet" />}</Card>;
}

function FilesSection({ e, d }: { e: ProEvent; d: EventData }) {
  const files = d.media.filter(m => m.kind === "file" || m.kind === "document");
  return <Card><div className="k-between" style={{ marginBottom: 12 }}><div><h2 className="ov-h" style={{ fontSize: 15.5 }}>Files</h2><p className="k-small">Contracts, plans and documents. Stored privately; downloads use short-lived links.</p></div><FileUploader eventId={e.id} /></div>
    {files.length ? <div className="k-list">{files.map(f => <div key={f.id} className="k-li"><span className="k-tile sm"><FileText size={14} /></span><div className="k-grow"><b className="k-small k-strong">{f.title}</b><div className="k-xs k-muted">Uploaded {relative(f.created_at)} · v{f.version}</div></div><a className="k-btn ghost sm" href={`/api/files/${f.id}`}>Download</a></div>)}</div> : <Empty icon={Folder} title="No files yet" text="Upload PDFs or images up to 10 MB." />}</Card>;
}
