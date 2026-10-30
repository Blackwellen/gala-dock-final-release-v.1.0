import { Globe2 } from "lucide-react";
import { Card, Chip } from "@/components/kit";
import { saveGettingThere } from "@/lib/actions/getting-there";
import { cleanGettingThere, type GettingThere } from "@/lib/public/getting-there";
import { EventGettingThere } from "@/components/public/event-getting-there";
import { dateShort, time } from "@/lib/format";
import { FormDialog, type Field } from "./ops-forms-client";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";

type MoveLite = { id: string; kind: string; status: string; from_place: string; to_place: string; pickup_point: string; departs_at: string; arrives_at: string; public_page?: boolean };
type AreaLite = { id: string; name: string; kind: string; accessible_spaces: number; opens_at: string | null; closes_at: string | null; status: string; public_page?: boolean };
type Notes = Partial<Record<"parking" | "transit" | "shuttle" | "dropoff" | "accessible" | "cycle" | "rideshare", string>> & { public?: boolean };

const PUBLIC_AREA = ["general", "accessible", "mixed"];
const LIVE_MOVE = ["planned", "confirmed", "en_route"];

/**
 * Ops › Logistics: "Public getting-there info" (migration 202610294081). Organiser notes + per-item "Show on public event page"
 * for general / accessible / mixed parking and shuttles, with a preview built by the same rules as public_event_getting_there.
 * Driver names, phones, vehicle registrations, permits, routes, crew transport, bays, rooms and costs are never part of it.
 * Notes live in the private event_getting_there table (202610294083, member-readable only); legacy settings.getting_there is the
 * fallback while an event has no row yet.
 */
export async function GettingThereCard({ eventId, settings, moves, areas, maps, disabledReason }: { eventId: string; settings: Record<string, unknown>; moves: MoveLite[]; areas: AreaLite[]; maps: string; disabledReason: string | null }) {
  const { data: row } = await untyped(await createClient()).from("event_getting_there").select("notes,public").eq("event_id", eventId).maybeSingle();
  const r = row as { notes: Record<string, unknown> | null; public: boolean } | null;
  const n = (r ? { ...(r.notes ?? {}), public: r.public } : (settings.getting_there ?? {})) as Notes;
  const shuttles = moves.filter(m => m.kind === "shuttle" && m.status !== "cancelled");
  const pubAreas = areas.filter(a => PUBLIC_AREA.includes(a.kind));
  // Preview: the exact public contract (notes only when marked public; items flagged, live, of a public kind).
  const preview: GettingThere | null = cleanGettingThere({
    notes: n.public ? n : {},
    parking: pubAreas.filter(a => a.public_page && a.status === "active").map(a => ({ name: a.name, kind: a.kind, accessible_spaces: a.accessible_spaces, opens_at: a.opens_at, closes_at: a.closes_at })),
    shuttles: shuttles.filter(m => m.public_page && LIVE_MOVE.includes(m.status)).map(m => ({ from: m.from_place, to: m.to_place, pickup: m.pickup_point, departs_at: m.departs_at, arrives_at: m.arrives_at })),
  });
  const shown = (preview ? Object.keys(preview.notes).length + preview.parking.length + preview.shuttles.length : 0);
  const note = (name: keyof Notes & string, label: string, placeholder: string): Field => ({ name, label, type: "textarea", defaultValue: typeof n[name] === "string" ? n[name] as string : "", placeholder, maxLength: 500 });
  const fields: Field[] = [
    { name: "public", label: "Show notes on the public event page", type: "checkbox", defaultValue: n.public === true, hint: "Attendees see the notes below" },
    note("transit", "Public transport", "e.g. Stratford (Elizabeth line, Jubilee) — 8 min walk via the Greenway"),
    note("parking", "Parking", "e.g. Pay-and-display car park on site; pre-book recommended"),
    note("accessible", "Accessible parking", "e.g. Blue badge bays by Gate 1 — show your badge on arrival"),
    note("dropoff", "Drop-off point", "e.g. Gate 2 lay-by on Riverside Road"),
    note("shuttle", "Shuttles", "e.g. Free shuttle from Stratford every 15 min from 17:00"),
    note("rideshare", "Taxis & rideshare", "e.g. Rideshare pick-up zone on Carpenters Road"),
    note("cycle", "Cycle parking", "e.g. 200 stands at the North entrance"),
    ...pubAreas.map(a => ({ name: `pa_${a.id}`, label: `Parking: ${a.name}`, type: "checkbox", defaultValue: a.public_page === true, hint: "Show on public event page (name, type, accessible spaces, hours)" } as Field)),
    ...shuttles.map(m => ({ name: `sh_${m.id}`, label: `Shuttle: ${dateShort(m.departs_at)} ${time(m.departs_at)} ${m.from_place || "?"} → ${m.to_place || "?"}`, type: "checkbox", defaultValue: m.public_page === true, hint: "Show on public event page (places, pickup point, times)" } as Field)),
  ];
  return <Card><div className="k-between eo-head"><div><h3 className="ov-h"><Globe2 size={16} aria-hidden /> Public getting-there info</h3>
      <p className="k-small">What attendees see under “Getting there” on the event page and their ticket. Staff, supplier, talent and VIP parking, crew transport, drivers, vehicles, permits, bays and rooms always stay private.</p></div>
    <FormDialog label="Edit" icon="edit" wide title="Public getting-there info" sub="Only what you tick or write here is published. Hide the block entirely in the page editor." disabledReason={disabledReason} action={saveGettingThere.bind(null, eventId)} fields={fields} submitLabel="Save" /></div>
    <div className="k-row" style={{ gap: 6, flexWrap: "wrap", margin: "6px 0 10px" }}><Chip tone={shown ? "green" : "gray"}>{shown ? `${shown} item${shown === 1 ? "" : "s"} public` : "Nothing public"}</Chip>
      {!n.public && Object.keys(n).some(k => !["public", "updated_at"].includes(k)) && <Chip tone="amber">Notes saved but hidden</Chip>}</div>
    {preview ? <div aria-label="Attendee preview"><p className="k-xs eo-muted" style={{ margin: "0 0 6px" }}>Attendee preview</p><EventGettingThere data={preview} maps={maps} id="gt-preview" /></div>
      : <p className="k-small eo-muted">Nothing is shown to attendees yet. Add notes, or tick public parking areas and shuttles.</p>}
  </Card>;
}
