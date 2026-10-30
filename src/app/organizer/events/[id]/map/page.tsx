import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Info, MapPin } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { getProEvent } from "@/lib/data/event";
import { untyped } from "@/lib/workspace/db";
import { loadEventPlan, isPlanV2 } from "@/lib/data/event-plan";
import type { MapEl } from "@/app/provider/venues/_components/venue-map";
import { EventMapEditor, type Binding, type MapTab, type VersionRow, type ZoneRow } from "./editor";
import type { Validation } from "./actions";
import "@/styles/org-event-map.css";

export const metadata: Metadata = { title: "Venue map" };
const TABS: MapTab[] = ["design", "ticketing", "operations", "preview"];
const PALETTE = ["#5b5bff", "#a855f7", "#16a46c", "#e08a00", "#e0398b", "#0ea5c6"];

/**
 * ORG-013 · Event venue map. The venue's published structural plan is locked underneath; the organiser builds the event
 * overlay (seating, zones, facilities) and ticket bindings on top. Version-checked saves, findings from event_map_validate,
 * compare/restore, and a published preview (Q19 map engine, docs/maps/map-engine.md).
 */
export default async function EventMapPage(props: PageProps<"/organizer/events/[id]/map">) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const ctx = await getOrganizer();
  const e = await getProEvent(ctx, id);
  const sb = untyped(ctx.supabase);
  const [{ data: tiers }, { data: seatRows }, plan, { data: versions }, { data: val }, { data: bind }, { data: pub }] = await Promise.all([
    sb.from("ticket_tiers").select("id,name,color,status,quantity,price").eq("event_id", e.id).order("sort"),
    sb.from("event_seats").select("status").eq("event_id", e.id),
    loadEventPlan(ctx.supabase, { id: e.id, venue_listing_id: (e as { venue_listing_id?: string | null }).venue_listing_id }),
    sb.from("venue_maps").select("version,status,created_at").eq("event_id", e.id).order("version", { ascending: false }).limit(50),
    sb.rpc("event_map_validate", { p_event: e.id }),
    sb.rpc("event_map_bindings", { p_event: e.id }),
    sb.from("venue_maps").select("overlay").eq("event_id", e.id).eq("status", "published").order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const { data: structure } = plan.venueId ? await sb.from("venue_structures").select("capacity_max").eq("venue_id", plan.venueId).eq("status", "published").maybeSingle() : { data: null };
  const tab = (TABS as string[]).includes(String(sp.tab)) ? sp.tab as MapTab : "design";
  const b = (bind ?? { tiers: [], zones: [] }) as { tiers: Binding[]; zones: ZoneRow[] };
  const sold = (seatRows ?? []).filter(r => r.status === "sold").length, held = (seatRows ?? []).filter(r => r.status === "held").length;
  const when = e.starts_at ? new Date(e.starts_at as string) : null;
  const fmtD = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
  const fmtT = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  const ends = e.ends_at ? new Date(e.ends_at as string) : null;
  const canEdit = ["owner", "manager", "member"].includes(ctx.role);

  return <div className="om-page">
    <nav className="om-crumbs" aria-label="Breadcrumb"><ol><li><Link href="/organizer">Organizer</Link></li><li><Link href="/organizer/events">Events</Link></li>
      <li><Link href={`/organizer/events/${e.id}`}>{e.name}</Link></li><li aria-current="page">Venue Map</li></ol></nav>
    <header className="om-head">
      <div><h1>{e.name}<span className={`om-chip ${plan.publishedVersion ? "live" : "draft"}`}>{plan.publishedVersion ? "Published" : "Draft"}</span></h1>
        <p className="om-meta">{when && <span><CalendarDays aria-hidden="true" />{fmtD(when)} · {fmtT(when)}{ends ? ` – ${fmtT(ends)}` : ""}</span>}
          {(plan.venueName || e.city) && <span><MapPin aria-hidden="true" />{[plan.venueName, e.city].filter(Boolean).join(", ")}</span>}</p></div>
      <p className="om-intro">{plan.venueName && plan.structureVersion ? <>Built on <b>{plan.venueName}</b>’s published plan (v{plan.structureVersion}). Venue exits, routes, rooms and walls are locked; add seating, zones and facilities on top.</>
        : plan.venueName ? <><b>{plan.venueName}</b> hasn’t published a floor plan yet, so build the event layout here. Add the street map or upload a site drawing.</>
        : "Build your site plan: upload a site drawing or aerial image, add the street map and drag in assets."}</p>
    </header>
    {plan.legacy && <p className="om-note"><Info aria-hidden="true" />This event has an earlier zone layout. Building here creates a new version in the new planner — the old layout stays in version history.</p>}
    <EventMapEditor eventId={e.id} base={plan.base} overlay={plan.overlay} spaces={plan.spaces} geo={plan.geo} initialTab={tab} canEdit={canEdit}
      tiers={(tiers ?? []).map((t, i) => ({ id: t.id as string, name: t.name as string, color: (t.color as string | null) || PALETTE[i % PALETTE.length], quantity: (t.quantity as number | null) ?? null, price: (t.price as number | null) ?? null, status: String(t.status ?? "") }))}
      versions={(versions ?? []) as VersionRow[]} publishedVersion={plan.publishedVersion} latestVersion={plan.latest?.version ?? 0}
      validation={(val as Validation | null) ?? null} bindings={b.tiers ?? []} zones={b.zones ?? []} venueCapacity={(structure?.capacity_max as number | null | undefined) ?? null}
      sold={sold} held={held} publishedOverlay={pub && isPlanV2(pub.overlay) ? pub.overlay as MapEl[] : []} />
  </div>;
}
