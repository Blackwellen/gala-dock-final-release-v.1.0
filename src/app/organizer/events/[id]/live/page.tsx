import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizer } from "@/lib/data/context";
import { untyped } from "@/lib/workspace/db";
import { requestTime } from "@/lib/workspace/format";
import { PageHead } from "@/components/kit";
import { LiveRefresh, CheckinButtons, ProgrammeButtons, IncidentForm, ResolveIncident } from "@/components/live/live-client";
import { time } from "@/lib/format";
import "@/styles/marketplace.css";
import "@/styles/live.css";

export const metadata = { title: "Live" };
type Prog = { id: string; title: string; starts_at: string; duration_minutes: number | null; status: string; area: string | null; owner_name: string | null };
type Line = { id: string; title: string; category: string; status: string };
type Check = { build_item_id: string; status: string; eta: string | null; arrived_at: string | null; note: string };
const CHECK: Record<string, [string, string]> = { expected: ["Expected", "grey"], en_route: ["En route", "blue"], arrived: ["Arrived", "purple"], checked_in: ["Checked in", "green"], late: ["Late", "orange"], absent: ["Absent", "red"] };

/** Live event command mode (§86): NOW / NEXT / DELAYED / ISSUES, provider arrivals, team on shift, ticket entry. */
export default async function LivePage({ params }: PageProps<"/organizer/events/[id]/live">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getOrganizer(`/organizer/events/${id}/live`);
  const db = untyped(ctx.supabase as never);
  const { data: e } = await db.from("events").select("id,name,starts_at,ends_at,venue_name,workspace_id,capacity").eq("id", id).maybeSingle();
  if (!e || e.workspace_id !== ctx.workspace.id) notFound();
  const now = requestTime();
  const [{ data: prog }, { data: lines }, { data: checks }, { data: shifts }, { data: incidents }, { count: issued }, { count: entered }] = await Promise.all([
    db.from("programme_items").select("id,title,starts_at,duration_minutes,status,area,owner_name").eq("event_id", id).order("starts_at"),
    db.from("build_items").select("id,title,category,status").eq("event_id", id).in("status", ["confirmed", "active", "fulfilled", "held"]).neq("role", "backup").order("sort"),
    db.from("provider_checkins").select("build_item_id,status,eta,arrived_at,note").eq("event_id", id),
    db.from("shifts").select("id,title,role,starts_at,ends_at,status,crew_members(name)").eq("event_id", id).order("starts_at"),
    db.from("incidents").select("id,title,detail,severity,status,created_at").eq("event_id", id).order("created_at", { ascending: false }).limit(20),
    db.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", id).in("status", ["valid", "used"]),
    db.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", id).not("checked_in_at", "is", null),
  ]);
  const P = (prog ?? []) as Prog[];
  const end = (p: Prog) => Date.parse(p.starts_at) + (p.duration_minutes ?? 0) * 6e4;
  const nowItems = P.filter(p => p.status === "in_progress" || (p.status === "upcoming" && Date.parse(p.starts_at) <= now && end(p) > now));
  const delayed = P.filter(p => p.status === "delayed" || (p.status === "upcoming" && Date.parse(p.starts_at) < now - 10 * 6e4 && !nowItems.includes(p)));
  const next = P.filter(p => p.status === "upcoming" && Date.parse(p.starts_at) > now).slice(0, 3);
  const C = new Map(((checks ?? []) as Check[]).map(c => [c.build_item_id, c]));
  const openIncidents = (incidents ?? []).filter((i: { status: string }) => i.status === "open");
  const late = ((lines ?? []) as Line[]).filter(l => ["late", "absent"].includes(C.get(l.id)?.status ?? ""));
  type Shift = { id: string; title: string; role: string; starts_at: string; ends_at: string; crew_members: { name: string } | null };
  const onShift = ((shifts ?? []) as unknown as Shift[]).filter(s => Date.parse(s.starts_at) <= now && Date.parse(s.ends_at) > now);
  const Prow = ({ p }: { p: Prog }) => <li><div className="mk-main"><b>{time(p.starts_at)} · {p.title}</b><small>{[p.area, p.owner_name, p.duration_minutes ? `${p.duration_minutes} min` : null].filter(Boolean).join(" · ")}</small></div><ProgrammeButtons eventId={id} itemId={p.id} status={p.status} /></li>;
  return <div className="k-col lv" style={{ gap: 16 }}>
    <LiveRefresh />
    <PageHead crumbs={[{ label: "Events", href: "/organizer/events" }, { label: e.name, href: `/organizer/events/${id}` }, { label: "Live" }]} title={<>Live · {e.name}</>}
      sub={`${e.venue_name ?? ""}${e.starts_at ? ` · ${time(e.starts_at)}–${time(e.ends_at)}` : ""} · updates every 20 seconds`} actions={<Link className="k-btn ghost" href={`/organizer/events/${id}?tab=operations`}>Operations</Link>} />
    <div className="lv-quad">
      <section className="lv-col now" aria-labelledby="lv-now"><h2 id="lv-now">Now</h2>{nowItems.length ? <ul className="mk-list">{nowItems.map(p => <Prow key={p.id} p={p} />)}</ul> : <p className="mk-empty">Nothing running right now.</p>}</section>
      <section className="lv-col next" aria-labelledby="lv-next"><h2 id="lv-next">Next</h2>{next.length ? <ul className="mk-list">{next.map(p => <Prow key={p.id} p={p} />)}</ul> : <p className="mk-empty">Nothing else scheduled.</p>}</section>
      <section className="lv-col delayed" aria-labelledby="lv-del"><h2 id="lv-del">Delayed {delayed.length + late.length > 0 && <span className="mk-tag orange">{delayed.length + late.length}</span>}</h2>
        {delayed.length + late.length ? <ul className="mk-list">{delayed.map(p => <Prow key={p.id} p={p} />)}{late.map(l => <li key={l.id}><div className="mk-main"><b>{l.title}</b><small>{CHECK[C.get(l.id)!.status]![0]}{C.get(l.id)?.note ? ` · ${C.get(l.id)!.note}` : ""}</small></div></li>)}</ul> : <p className="mk-empty">All on time.</p>}</section>
      <section className="lv-col issues" aria-labelledby="lv-iss"><h2 id="lv-iss">Issues {openIncidents.length > 0 && <span className="mk-tag red">{openIncidents.length}</span>}</h2>
        {openIncidents.length ? <ul className="mk-list">{openIncidents.map((i: { id: string; title: string; detail: string; severity: string; created_at: string }) => <li key={i.id}><div className="mk-main"><b>{i.title}</b><small>{i.severity} · {time(i.created_at)}{i.detail ? ` · ${i.detail}` : ""}</small></div><ResolveIncident eventId={id} id={i.id} /></li>)}</ul> : <p className="mk-empty">No open issues.</p>}
        <IncidentForm eventId={id} /></section>
    </div>
    <div className="mk-grid">
      <section className="mk-card" aria-labelledby="lv-prov"><h2 id="lv-prov">Provider arrivals</h2>
        {!(lines ?? []).length ? <p className="mk-empty">No booked providers.</p> : <ul className="mk-list">{((lines ?? []) as Line[]).map(l => { const c = C.get(l.id); const [label, tone] = CHECK[c?.status ?? "expected"]!; return <li key={l.id}>
          <div className="mk-main"><b>{l.title}</b><small>{l.category}{c?.eta && c.status === "en_route" ? ` · ETA ${time(c.eta)}` : ""}{c?.arrived_at ? ` · arrived ${time(c.arrived_at)}` : ""}{c?.note ? ` · ${c.note}` : ""}</small></div>
          <span className="mk-row"><span className={`mk-tag ${tone}`}>{label}</span><CheckinButtons itemId={l.id} status={c?.status ?? "expected"} /></span></li>; })}</ul>}
      </section>
      <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
        <section className="mk-card" aria-labelledby="lv-entry"><h2 id="lv-entry">Ticket entry</h2>
          <p className="lv-big">{entered ?? 0}<small> / {issued ?? 0} checked in</small></p>
          {e.capacity ? <p className="mk-note">Capacity {e.capacity}</p> : null}
          <Link className="mk-link" href={`/organizer/events/${id}?tab=operations&section=checkin`}>Open check-in</Link></section>
        <section className="mk-card" aria-labelledby="lv-team"><h2 id="lv-team">Team on shift</h2>
          {!onShift.length ? <p className="mk-empty">No one on shift right now.</p> : <ul className="mk-list">{onShift.map(s => <li key={s.id}>
            <div className="mk-main"><b>{s.crew_members?.name ?? "Unassigned"}</b><small>{s.role} · {s.title} · until {time(s.ends_at)}</small></div></li>)}</ul>}
          </section>
      </div>
    </div>
  </div>;
}
