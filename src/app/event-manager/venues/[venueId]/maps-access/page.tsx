import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { InsightCard } from "@/components/venues/VenueProfileShell";
import { MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
      <h3 className="text-sm font-semibold text-surface-800 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-surface-500">{label}</span>
      <span className="text-surface-800 font-medium text-right">{value ?? "—"}</span>
    </div>
  );
}

export default async function VenueMapsAccessPage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const [{ data: venue }, { data: access }] = await Promise.all([
    supabase
      .from("venues")
      .select("address_line1, address_line2, city, region, postal_code, country, what3words, latitude, longitude")
      .eq("id", venueId)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("venue_access_details")
      .select("*")
      .eq("venue_id", venueId)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);

  const hasCoords = venue?.latitude != null && venue?.longitude != null;
  const travelTimes = Array.isArray(access?.travel_times) ? (access!.travel_times as { label: string; value: string }[]) : [];
  const nearbyHotels = Array.isArray(access?.nearby_hotels) ? (access!.nearby_hotels as { name: string; distance: string }[]) : [];
  const reminders = Array.isArray(access?.logistics_reminders) ? (access!.logistics_reminders as string[]) : [];

  return (
    <div className="p-6 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <div className="min-w-0 space-y-6">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          {hasCoords ? (
            <iframe
              title="Venue location map"
              className="w-full h-80 border-0"
              loading="lazy"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${venue!.longitude! - 0.01}%2C${venue!.latitude! - 0.01}%2C${venue!.longitude! + 0.01}%2C${venue!.latitude! + 0.01}&layer=mapnik&marker=${venue!.latitude}%2C${venue!.longitude}`}
            />
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-surface-400 gap-2">
              <MapPin className="w-8 h-8" strokeWidth={1.5} />
              <p className="text-sm">No coordinates recorded for this venue yet.</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card title="Address & Directions">
            <Row label="Address" value={[venue?.address_line1, venue?.city, venue?.postal_code].filter(Boolean).join(", ") || "—"} />
            <Row label="What3Words" value={venue?.what3words} />
          </Card>
          <Card title="Venue Access Details">
            <Row label="Main Entrance" value={access?.main_entrance} />
            <Row label="Secondary Entrance" value={access?.secondary_entrance} />
            <Row label="Event Entrance" value={access?.event_entrance} />
            <Row label="Access Hours" value={access?.access_hours} />
          </Card>
          <Card title="Parking & Transport">
            <Row label="On-Site Parking" value={access?.on_site_parking} />
            <Row label="Nearest Car Park" value={access?.nearest_car_park} />
            <Row label="Coach Parking" value={access?.coach_parking} />
            <Row label="Nearest Station" value={access?.nearest_station} />
          </Card>
          <Card title="Loading & Setup Access">
            <Row label="Loading Bay" value={access?.loading_bay} />
            <Row label="Access Hours" value={access?.loading_access_hours} />
            <Row label="Vehicle Restrictions" value={access?.vehicle_restrictions} />
            <Row label="Dock Leveller" value={access?.dock_leveller ? "Available" : "—"} />
          </Card>
          <Card title="Accessibility Features">
            <Row label="Step-Free Access" value={access?.step_free_access ? "Yes" : "—"} />
            <Row label="Accessible Toilets" value={access?.accessible_toilets ? "Yes" : "—"} />
            <Row label="Passenger Lifts" value={access?.passenger_lifts} />
            <Row label="Hearing Loop" value={access?.hearing_loop ? "Yes" : "—"} />
          </Card>
        </div>
      </div>

      <div className="space-y-6">
        <InsightCard title="Travel Times">
          {travelTimes.length === 0 ? (
            <p className="text-sm text-surface-400">Not yet recorded.</p>
          ) : (
            <div className="space-y-1.5">
              {travelTimes.map((t) => (
                <Row key={t.label} label={t.label} value={t.value} />
              ))}
            </div>
          )}
        </InsightCard>
        <InsightCard title="Nearby Hotels">
          {nearbyHotels.length === 0 ? (
            <p className="text-sm text-surface-400">Not yet recorded.</p>
          ) : (
            <div className="space-y-1.5">
              {nearbyHotels.map((h) => (
                <Row key={h.name} label={h.name} value={h.distance} />
              ))}
            </div>
          )}
        </InsightCard>
        <InsightCard title="Logistics Reminders">
          {reminders.length === 0 ? (
            <p className="text-sm text-surface-400">None recorded.</p>
          ) : (
            <ul className="space-y-1.5 text-sm text-surface-600 list-disc list-inside">
              {reminders.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
        </InsightCard>
      </div>
    </div>
  );
}
