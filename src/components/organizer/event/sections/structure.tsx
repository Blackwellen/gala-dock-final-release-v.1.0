import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { can } from "@/lib/domain/permissions";
import type { SectionProps } from "./types";
import { StructureClient, type StructureData } from "./structure-client";

/**
 * Plan › Structure (Q40 domains 247–250 + passes). Series / recurring / tours anchored on this event, parent and sub-events
 * with rolled-up readiness and shared resources, multi-day, multi-venue and room schedules, and pass tiers whose components
 * can never oversell a date. Every write goes through the Q40 commands; reads are RLS-scoped.
 */
export async function StructureSection({ e, d, role }: SectionProps) {
  const sb = untyped(await createClient());
  const ev = e as typeof e & { series_id?: string | null; parent_event_id?: string | null; composition_role?: string; series_overrides?: string[]; series_index?: number | null };
  const [{ data: series }, { data: parent }, { data: kids }, { data: days }, { data: venues }, venueSched, dayRep, rooms] = await Promise.all([
    ev.series_id ? sb.from("event_series").select("id,name,slug,kind,visibility,status,timezone,recurrence,version,anchor_event_id").eq("id", ev.series_id).maybeSingle() : Promise.resolve({ data: null }),
    ev.parent_event_id ? sb.from("events").select("id,name,status,starts_at,ends_at").eq("id", ev.parent_event_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("events").select("id,name,status,composition_role,starts_at,ends_at,capacity").eq("parent_event_id", e.id).order("starts_at"),
    sb.from("event_days").select("id,day_date,label,starts_at,ends_at,event_venue_id,status").eq("event_id", e.id).order("day_date"),
    sb.from("event_venues").select("id,venue_name,listing_id,role,starts_at,ends_at,capacity,sort").eq("event_id", e.id).order("sort"),
    sb.rpc("event_venue_schedule", { p_event: e.id }), sb.rpc("event_day_report", { p_event: e.id }), sb.rpc("event_room_schedule", { p_event: e.id }),
  ]);
  const children = (kids ?? []) as StructureData["children"];
  const s = series as StructureData["series"];
  const [report, readiness, resources, siblings] = await Promise.all([
    s ? sb.rpc("series_report", { p_series: s.id }).then(r => r.data) : Promise.resolve(null),
    children.length ? sb.rpc("event_composition_readiness", { p_event: e.id }).then(r => r.data) : Promise.resolve(null),
    children.length ? sb.rpc("event_composition_resources", { p_event: e.id }).then(r => r.data) : Promise.resolve(null),
    s ? sb.from("events").select("id,name,starts_at").eq("series_id", s.id).neq("id", e.id).order("starts_at").limit(60).then(r => r.data ?? []) : Promise.resolve([]),
  ]);
  // Pass tiers live on this event; components may be this event's tiers, its sub-events' or same-series dates' tiers.
  const related = [e.id, ...children.map(c => c.id), ...(siblings as { id: string }[]).map(x => x.id)];
  const names = new Map<string, string>([[e.id, e.name], ...children.map(c => [c.id, c.name] as [string, string]), ...(siblings as { id: string; name: string; starts_at: string | null }[]).map(x => [x.id, x.name] as [string, string])]);
  const [{ data: tiers }, { data: comps }, { data: shifts }, { data: programme }] = await Promise.all([
    sb.from("ticket_tiers").select("id,event_id,name,quantity,sold,held,status,pass_kind,pass_committed,event_day_id,space_id,valid_venue_ids").in("event_id", related).limit(400),
    sb.from("ticket_pass_components").select("pass_tier_id,component_tier_id,units").in("pass_tier_id", d.tiers.map(t => t.id).length ? d.tiers.map(t => t.id) : ["00000000-0000-0000-0000-000000000000"]),
    // Day / room / venue bindings (set_composition_binding, 202610294039).
    sb.from("shifts").select("id,role,title,starts_at,ends_at,status,event_day_id,space_id,event_venue_id").eq("event_id", e.id).order("starts_at").limit(300),
    sb.from("programme_items").select("id,title,kind,starts_at,duration_minutes,event_day_id,space_id").eq("event_id", e.id).order("starts_at").limit(300),
  ]);
  const passIds = ((tiers ?? []) as { id: string; event_id: string; pass_kind: string | null }[]).filter(t => t.event_id === e.id && t.pass_kind).map(t => t.id);
  const inventory = Object.fromEntries(await Promise.all(passIds.map(async id => [id, (await sb.rpc("event_pass_inventory", { p_pass_tier: id })).data] as const)));
  const data: StructureData = {
    event: { id: e.id, name: e.name, status: e.status, starts_at: e.starts_at, ends_at: e.ends_at, timezone: (e.timezone as string | null) ?? "Europe/London", role: ev.composition_role ?? "standalone", overrides: ev.series_overrides ?? [] },
    series: s, report: report as StructureData["report"], parent: parent as StructureData["parent"], children, readiness: readiness as StructureData["readiness"], resources: resources as StructureData["resources"],
    days: (days ?? []) as StructureData["days"], dayReport: (dayRep.data ?? []) as StructureData["dayReport"], venues: (venues ?? []) as StructureData["venues"],
    venueSchedule: venueSched.data as StructureData["venueSchedule"], rooms: (rooms.data ?? []) as StructureData["rooms"],
    tiers: ((tiers ?? []) as StructureData["tiers"]).map(t => ({ ...t, event_name: names.get(t.event_id) ?? "" })), components: (comps ?? []) as StructureData["components"], inventory: inventory as StructureData["inventory"],
    shifts: (shifts ?? []) as StructureData["shifts"], programme: (programme ?? []) as StructureData["programme"],
  };
  return <StructureClient data={data} canWrite={can("organizer", role, "events.write")} canCascade={["owner", "manager"].includes(role)} canTickets={can("organizer", role, "tickets.manage")} />;
}
