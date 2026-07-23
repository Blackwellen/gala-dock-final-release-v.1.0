import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { Plus, Layers, Users, AlertTriangle, Eye, Settings, Download } from "lucide-react";
import { VenueMap } from "@/components/maps/VenueMap";

export const dynamic = "force-dynamic";

const ZONE_COLORS: Record<string, string> = {
  main_stage:    "bg-brand-500",
  vip:           "bg-amber-500",
  catering:      "bg-green-500",
  registration:  "bg-blue-500",
  backstage:     "bg-gray-600",
  breakout:      "bg-teal-500",
  exhibition:    "bg-violet-500",
  networking:    "bg-pink-500",
  outdoor:       "bg-lime-500",
};

const ZONE_LABELS: Record<string, string> = {
  main_stage:   "Main Stage",
  vip:          "VIP Zone",
  catering:     "Catering",
  registration: "Registration",
  backstage:    "Backstage",
  breakout:     "Breakout",
  exhibition:   "Exhibition",
  networking:   "Networking",
  outdoor:      "Outdoor",
};

const STATUS_STYLES: Record<string, string> = {
  active:    "bg-success-100 text-success-700 border-success-200",
  inactive:  "bg-surface-100 text-surface-500 border-surface-200",
  warning:   "bg-warning-100 text-warning-700 border-warning-200",
  alert:     "bg-danger-100 text-danger-700 border-danger-200",
};

// Well-known London venue coordinates
const VENUE_COORDS: Record<string, { lat: number; lng: number }> = {
  "ExCeL London":              { lat: 51.5079, lng: 0.0332 },
  "Olympia London":            { lat: 51.4965, lng: -0.2108 },
  "O2 Arena":                  { lat: 51.5030, lng: 0.0032 },
  "Royal Albert Hall":         { lat: 51.5009, lng: -0.1776 },
  "Barbican Centre":           { lat: 51.5205, lng: -0.0933 },
  "Tate Modern":               { lat: 51.5076, lng: -0.0994 },
  "Southbank Centre":          { lat: 51.5054, lng: -0.1153 },
  "Business Design Centre":    { lat: 51.5357, lng: -0.1046 },
  "Alexandra Palace":          { lat: 51.5949, lng: -0.1295 },
  "Wembley Arena":             { lat: 51.5560, lng: -0.2796 },
};

function resolveCoords(venueName: string | null): { lat: number; lng: number } {
  if (!venueName) return { lat: 51.5074, lng: -0.1278 };
  const direct = VENUE_COORDS[venueName];
  if (direct) return direct;
  const key = Object.keys(VENUE_COORDS).find(
    (k) => venueName.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(venueName.toLowerCase())
  );
  return key ? VENUE_COORDS[key] : { lat: 51.5074, lng: -0.1278 };
}

interface EventZone {
  id: string;
  zone_type: string | null;
  name: string | null;
  capacity: number | null;
  current_occupancy: number | null;
  status: string | null;
  notes: string | null;
}

interface MapIncident {
  id: string;
  title: string | null;
  category: string | null;
  description: string | null;
  severity: string | null;
  status: string | null;
  occurred_at: string | null;
}

export default async function EventMapPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name, venue_name_snapshot, venue_address_snapshot")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: zonesData } = (await (supabase as any)
    .from("event_zones")
    .select("id, zone_type, name, capacity, current_occupancy, status, notes")
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .order("name")) as { data: EventZone[] | null };

  const { data: incidentsData } = await supabase
    .from("event_incidents")
    .select("id, title, category, description, severity, status, occurred_at")
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .order("occurred_at", { ascending: false })
    .limit(10);

  const zones = (zonesData ?? []) as EventZone[];
  const incidents = (incidentsData ?? []) as MapIncident[];

  const totalCapacity = zones.reduce((s, z) => s + (z.capacity ?? 0), 0);
  const totalOccupancy = zones.reduce((s, z) => s + (z.current_occupancy ?? 0), 0);
  const activeZones = zones.filter((z) => z.status === "active").length;
  const activeIncidents = incidents.filter((i) => i.status !== "resolved").length;

  const venueName = event.venue_name_snapshot ?? "Venue";
  const venueAddress = event.venue_address_snapshot ?? "London, UK";
  const coords = resolveCoords(event.venue_name_snapshot);

  return (
    <div className="space-y-6 p-6 pb-12 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-surface-900">Event Map</h2>
          <p className="text-sm text-surface-500">
            {venueName} · {zones.length} zone{zones.length !== 1 ? "s" : ""} · Live capacity tracking
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3.5 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 shadow-sm">
            <Download className="h-4 w-4" />
            Export map
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3.5 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 shadow-sm">
            <Settings className="h-4 w-4" />
            Edit zones
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm">
            <Plus className="h-4 w-4" />
            Add Zone
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Capacity", value: totalCapacity.toLocaleString("en-GB"), sub: "Across all zones", color: "text-surface-900", icon: <Users className="h-4 w-4 text-surface-600" />, bg: "bg-surface-50" },
          { label: "Current Occupancy", value: totalOccupancy.toLocaleString("en-GB"), sub: totalCapacity > 0 ? `${Math.round((totalOccupancy / totalCapacity) * 100)}% full` : "—", color: "text-blue-700", icon: <Users className="h-4 w-4 text-blue-600" />, bg: "bg-blue-50" },
          { label: "Active Zones", value: activeZones, sub: `${zones.length - activeZones} inactive`, color: "text-success-700", icon: <Eye className="h-4 w-4 text-success-600" />, bg: "bg-success-50" },
          { label: "Open Incidents", value: activeIncidents, sub: activeIncidents > 0 ? "Require attention" : "All clear", color: activeIncidents > 0 ? "text-danger-700" : "text-success-700", icon: <AlertTriangle className="h-4 w-4 text-danger-600" />, bg: "bg-danger-50" },
        ].map(({ label, value, sub, color, icon, bg }) => (
          <div key={label} className="rounded-xl border border-surface-200 bg-white p-4 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">{label}</p>
                <p className={`mt-1 text-2xl font-bold tracking-tight ${color}`}>{value}</p>
                <p className="mt-0.5 text-[11px] text-surface-400">{sub}</p>
              </div>
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg}`}>{icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Active incident alert */}
      {activeIncidents > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-danger-600 shrink-0" />
          <p className="text-sm font-medium text-danger-800">
            {activeIncidents} open incident{activeIncidents > 1 ? "s" : ""} require immediate attention.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Interactive MapTiler venue map */}
        <div className="lg:col-span-2 rounded-xl border border-surface-200 bg-white shadow-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-surface-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-brand-500" />
              <span className="text-sm font-semibold text-surface-900">Venue Location</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button className="rounded-lg border border-surface-200 px-2.5 py-1 text-xs text-surface-600 hover:bg-surface-50">Satellite</button>
              <button className="rounded-lg border border-brand-300 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">Streets</button>
            </div>
          </div>

          <div className="relative">
            <VenueMap
              venueName={venueName}
              venueAddress={venueAddress}
              lat={coords.lat}
              lng={coords.lng}
              className="h-[360px] w-full"
            />

            {/* Zone legend overlay */}
            {zones.length > 0 && (
              <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 max-w-[160px]">
                {zones.slice(0, 5).map((zone) => {
                  const zoneKey = (zone.zone_type ?? "main_stage").toLowerCase().replace(/\s/g, "_");
                  const dotColor = ZONE_COLORS[zoneKey] ?? "bg-surface-400";
                  return (
                    <div key={zone.id} className="flex items-center gap-1.5 bg-white/90 backdrop-blur rounded-lg px-2.5 py-1.5 shadow-sm">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
                      <span className="text-[11px] font-medium text-surface-800 truncate">
                        {zone.name ?? ZONE_LABELS[zoneKey] ?? zone.zone_type}
                      </span>
                    </div>
                  );
                })}
                {zones.length > 5 && (
                  <div className="bg-white/90 backdrop-blur rounded-lg px-2.5 py-1.5 shadow-sm text-[10px] text-surface-500 text-center">
                    +{zones.length - 5} more zones
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Zones sidebar */}
        <div className="space-y-3">
          <div className="rounded-xl border border-surface-200 bg-white shadow-card">
            <div className="px-4 py-3 border-b border-surface-100">
              <h3 className="text-sm font-semibold text-surface-900">Zone Occupancy</h3>
            </div>
            {zones.length === 0 ? (
              <p className="px-4 py-4 text-xs text-surface-400">No zones configured yet.</p>
            ) : (
              <ul className="divide-y divide-surface-100">
                {zones.map((zone) => {
                  const zoneKey = (zone.zone_type ?? "other").toLowerCase().replace(/\s/g, "_");
                  const dotColor = ZONE_COLORS[zoneKey] ?? "bg-surface-400";
                  const fillPct = zone.capacity && zone.current_occupancy
                    ? Math.round((zone.current_occupancy / zone.capacity) * 100)
                    : 0;
                  const st = STATUS_STYLES[(zone.status ?? "inactive").toLowerCase()] ?? STATUS_STYLES.inactive;
                  return (
                    <li key={zone.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotColor}`} />
                          <span className="text-xs font-medium text-surface-900 truncate">
                            {zone.name ?? ZONE_LABELS[zoneKey] ?? zone.zone_type}
                          </span>
                        </div>
                        <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ${st}`}>
                          {zone.status ?? "inactive"}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-surface-500 mb-1">
                        <span>{zone.current_occupancy ?? 0} / {zone.capacity ?? "—"}</span>
                        <span>{fillPct}%</span>
                      </div>
                      {zone.capacity && (
                        <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${fillPct > 90 ? "bg-danger-500" : fillPct > 75 ? "bg-warning-500" : dotColor}`}
                            style={{ width: `${Math.min(fillPct, 100)}%` }}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Incidents */}
          <div className="rounded-xl border border-surface-200 bg-white shadow-card">
            <div className="px-4 py-3 border-b border-surface-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-surface-900">Incidents</h3>
              {activeIncidents > 0 && (
                <span className="rounded-full bg-danger-100 px-2 py-0.5 text-[10px] font-bold text-danger-700">
                  {activeIncidents} open
                </span>
              )}
            </div>
            {incidents.length === 0 ? (
              <p className="px-4 py-3 text-xs text-success-600 font-medium">All clear — no incidents reported.</p>
            ) : (
              <ul className="divide-y divide-surface-100 max-h-48 overflow-y-auto">
                {incidents.map((inc) => (
                  <li key={inc.id} className={`px-4 py-2.5 ${inc.status === "resolved" ? "opacity-50" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-surface-900 truncate">
                          {inc.title ?? inc.description ?? "Incident"}
                        </p>
                        <p className="text-[11px] text-surface-400 capitalize">
                          {(inc.category ?? "other").replace(/_/g, " ")} · {inc.severity ?? "low"}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${inc.status === "resolved" ? "bg-success-100 text-success-700" : "bg-danger-100 text-danger-700"}`}>
                        {inc.status === "resolved" ? "Resolved" : "Open"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
