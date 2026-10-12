import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { getProEvent } from "@/lib/data/event";
import { untyped } from "@/lib/workspace/db";
import { loadEventPlan } from "@/lib/data/event-plan";
import { planSeats, planAreas } from "@/components/venue-plan/inventory";
import { EventPlanEditor } from "./editor";

export const metadata: Metadata = { title: "Event layout" };

/** ORG-013 · Event layout: the venue's published structural plan is locked underneath; the organiser builds the event overlay and ticketing on top. */
export default async function EventMapPage(props: PageProps<"/organizer/events/[id]/map">) {
  const { id } = await props.params;
  const ctx = await getOrganizer();
  const e = await getProEvent(ctx, id);
  const sb = untyped(ctx.supabase);
  const [{ data: tiers }, { data: seatRows }, plan] = await Promise.all([
    sb.from("ticket_tiers").select("id,name,color,status").eq("event_id", e.id).order("sort"),
    sb.from("event_seats").select("status").eq("event_id", e.id),
    loadEventPlan(ctx.supabase, { id: e.id, venue_listing_id: (e as { venue_listing_id?: string | null }).venue_listing_id }),
  ]);
  const { base, overlay, legacy, geo, latest } = plan;
  const venue = plan.venueName ? { name: plan.venueName } : null, structure = plan.structureVersion ? { version: plan.structureVersion } : null;
  let seats = 0; try { seats = planSeats(overlay).length; } catch { seats = 0; }
  const standing = planAreas(overlay).reduce((a, x) => a + x.capacity, 0);
  const sold = (seatRows ?? []).filter(r => r.status === "sold").length, held = (seatRows ?? []).filter(r => r.status === "held").length;
  const palette = ["#5b5bff", "#a855f7", "#16a46c", "#e08a00", "#e0398b", "#0ea5c6"];

  return <div className="ep">
    <Link href={`/organizer/events/${e.id}?tab=plan`} className="ep-back"><ArrowLeft aria-hidden="true" />Back to {e.name}</Link>
    <header className="ep-head"><div><h1>Event layout</h1>
      <p>{venue && structure ? <>Built on <b>{venue.name}</b>’s published plan (v{structure.version}). The venue structure is locked; add seating, zones and facilities on top.</>
        : venue ? <><b>{venue.name}</b> hasn’t published a floor plan yet, so build the event layout here. Add the street map to place it on site, or upload a site drawing.</>
        : "Build your site plan: upload a site drawing or aerial image, add the street map and drag in assets."}</p></div>
      <dl className="ep-stats"><div><dt>Reserved seats</dt><dd>{seats.toLocaleString("en-GB")}</dd></div><div><dt>Standing / area capacity</dt><dd>{standing.toLocaleString("en-GB")}</dd></div>
        <div><dt>Seats sold · held</dt><dd>{sold} · {held}</dd></div><div><dt>Layout</dt><dd>{latest ? `v${latest.version} · ${latest.status}` : "Not started"}</dd></div></dl></header>
    {(tiers ?? []).length > 0 && <ul className="ep-tiers" aria-label="Ticket tiers">{(tiers ?? []).map((t, i) => <li key={t.id}><i style={{ background: t.color || palette[i % palette.length] }} />{t.name}<small>{t.status.replace("_", " ")}</small></li>)}</ul>}
    {legacy && <p className="ep-note"><Info aria-hidden="true" />This event has an earlier zone layout. Building here creates a new version in the new planner — the old layout stays in version history.</p>}
    <EventPlanEditor eventId={e.id} base={base} overlay={overlay} version={plan.publishedVersion} draftVersion={latest && latest.status !== "published" ? latest.version : 0} geo={geo}
      spaces={plan.spaces}
      tiers={(tiers ?? []).map((t, i) => ({ id: t.id, name: t.name, color: t.color || palette[i % palette.length] }))} />
    <style>{`.ep{display:grid;gap:12px;padding:4px 0 24px}.ep-back{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:#1d2068;justify-self:start}.ep-back svg{width:15px;height:15px}
.ep-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;flex-wrap:wrap}.ep-head h1{font-size:28px;font-weight:800;letter-spacing:-.03em;color:#02032e}.ep-head p{font-size:12.5px;color:#3f4596;margin-top:4px;max-width:680px}
.ep-stats{display:flex;gap:10px;margin:0}.ep-stats div{padding:9px 14px;border:1px solid #eef4fc;border-radius:10px;background:#fff;box-shadow:0 1px 3px rgba(60,110,200,.04)}.ep-stats dt{font-size:10px;color:#5157a4}.ep-stats dd{margin:2px 0 0;font-size:16px;font-weight:750;color:#02032e}
.ep-tiers{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px}.ep-tiers li{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 11px;border:1px solid #eef4fc;border-radius:14px;background:#fff;font-size:11px;color:#0d0d63}
.ep-tiers i{width:10px;height:10px;border-radius:50%}.ep-tiers small{color:#5d60a8;text-transform:capitalize}.ep-note{display:flex;gap:8px;align-items:center;font-size:11.5px;color:#1d2068;background:#eef3ff;border-radius:8px;padding:9px 12px}.ep-note svg{width:15px;height:15px;color:#1a1af2}`}</style>
  </div>;
}
