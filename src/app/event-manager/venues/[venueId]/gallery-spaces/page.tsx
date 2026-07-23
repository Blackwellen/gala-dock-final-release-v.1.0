import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { InsightCard } from "@/components/venues/VenueProfileShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { r2PublicUrl } from "@/lib/storage/r2";
import { Image as ImageIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function VenueGallerySpacesPage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const [{ data: media }, { data: spaces }] = await Promise.all([
    supabase
      .from("venue_media")
      .select("id, category, r2_key, alt_text, is_cover, sort_order")
      .eq("venue_id", venueId)
      .eq("workspace_id", workspaceId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("venue_spaces")
      .select("id, name, space_type, capacity_seated, capacity_standing, dimensions, area_sqm, av_readiness, accessibility, preferred_uses, amenities")
      .eq("venue_id", venueId)
      .eq("workspace_id", workspaceId)
      .order("sort_order", { ascending: true }),
  ]);

  const mediaRows = media ?? [];
  const spaceRows = spaces ?? [];
  const largestCapacity = spaceRows.reduce((max, s) => Math.max(max, s.capacity_standing ?? s.capacity_seated ?? 0), 0);
  const outdoorAreas = spaceRows.filter((s) => (s.space_type ?? "").toLowerCase().includes("outdoor") || (s.space_type ?? "").toLowerCase().includes("terrace") || (s.space_type ?? "").toLowerCase().includes("rooftop")).length;

  return (
    <div className="p-6 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <div className="min-w-0 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card px-4 py-3">
            <p className="text-xs text-surface-500 uppercase tracking-wide">Total Spaces</p>
            <p className="text-2xl font-bold text-surface-900">{spaceRows.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-200 shadow-card px-4 py-3">
            <p className="text-xs text-surface-500 uppercase tracking-wide">Largest Capacity</p>
            <p className="text-2xl font-bold text-surface-900">{largestCapacity || "—"}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-200 shadow-card px-4 py-3">
            <p className="text-xs text-surface-500 uppercase tracking-wide">Outdoor Areas</p>
            <p className="text-2xl font-bold text-surface-900">{outdoorAreas}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-200 shadow-card px-4 py-3">
            <p className="text-xs text-surface-500 uppercase tracking-wide">Media Items</p>
            <p className="text-2xl font-bold text-surface-900">{mediaRows.length}</p>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-surface-800 mb-3">Gallery</h3>
          {mediaRows.length === 0 ? (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <EmptyState icon={ImageIcon} title="No gallery media yet" description="Upload venue exterior, event-space and floor-plan images." compact />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {mediaRows.map((m) => (
                <div key={m.id} className="relative aspect-video rounded-lg overflow-hidden border border-surface-200 bg-surface-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r2PublicUrl(m.r2_key) ?? ""} alt={m.alt_text ?? ""} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-surface-800 mb-3">Spaces & Areas</h3>
          {spaceRows.length === 0 ? (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <EmptyState icon={ImageIcon} title="No spaces recorded" description="Add the venue's rooms and areas with capacities and amenities." compact />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 bg-surface-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Space / Area</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Capacity</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Dimensions</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">AV Readiness</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Accessibility</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {spaceRows.map((s) => (
                    <tr key={s.id} className="hover:bg-surface-50 transition-colors">
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-surface-800">{s.name}</p>
                        {s.space_type && <p className="text-xs text-surface-500">{s.space_type}</p>}
                      </td>
                      <td className="px-4 py-3.5 text-surface-600 tabular-nums">
                        {s.capacity_seated ?? "—"} / {s.capacity_standing ?? "—"}
                      </td>
                      <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell">{s.dimensions ?? "—"}</td>
                      <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell">{s.av_readiness ?? "—"}</td>
                      <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell">{s.accessibility ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <InsightCard title="Venue Highlights">
          <p className="text-sm text-surface-500">
            {spaceRows.length} space{spaceRows.length === 1 ? "" : "s"} recorded across this venue.
          </p>
        </InsightCard>
      </div>
    </div>
  );
}
