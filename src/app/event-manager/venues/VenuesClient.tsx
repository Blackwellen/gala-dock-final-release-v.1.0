"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus, Search, Building2, Star, CheckCircle2, Users,
  LayoutGrid, List, MapPin,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TabNav } from "@/components/ui/TabNav";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

export interface VenueRow {
  id: string;
  name: string;
  category: string | null;
  location: string;
  capacity: number | null;
  status: string;
  lastUsed: string;
}

export interface VenuesKpis {
  total: number;
  activeThisYear: number;
  preferred: number;
  avgCapacity: number;
}

// Map the live venue status onto the StatusBadge vocabulary (all supported).
function badgeStatus(status: string): string {
  return status; // preferred | active | inactive | archived
}

function VenueCardTile({ venue }: { venue: VenueRow }) {
  return (
    <Link
      href={`/event-manager/venues/${venue.id}`}
      className="group bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="h-28 bg-gradient-to-br from-brand-100 via-brand-50 to-violet-50 flex items-center justify-center">
        <Building2 className="w-8 h-8 text-brand-300" strokeWidth={1.5} />
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-surface-900 group-hover:text-brand-600 transition-colors truncate">
            {venue.name}
          </h3>
          <StatusBadge status={badgeStatus(venue.status) as never} dot={false} />
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-surface-500">
          <MapPin className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
          {venue.location}
        </p>
        <div className="mt-3 flex items-center justify-between text-xs">
          {venue.category ? (
            <span className="px-2 py-0.5 rounded-full bg-surface-100 text-surface-600 border border-surface-200">
              {venue.category}
            </span>
          ) : (
            <span className="text-surface-300">Uncategorised</span>
          )}
          <span className="text-surface-500">
            {venue.capacity != null ? `Cap. ${venue.capacity}` : "—"}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function VenuesClient({
  venues,
  kpis,
  categories,
}: {
  venues: VenueRow[];
  kpis: VenuesKpis;
  categories: string[];
}) {
  const [activeTab, setActiveTab] = useState("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"table" | "cards">("table");

  const tabs = useMemo(
    () => [
      { id: "all", label: "All", count: venues.length },
      {
        id: "preferred",
        label: "Preferred",
        count: venues.filter((v) => v.status === "preferred").length,
      },
      ...categories.map((c) => ({
        id: `cat:${c}`,
        label: c,
        count: venues.filter((v) => v.category === c).length,
      })),
    ],
    [venues, categories]
  );

  const filtered = useMemo(() => {
    let byTab = venues;
    if (activeTab === "preferred") {
      byTab = venues.filter((v) => v.status === "preferred");
    } else if (activeTab.startsWith("cat:")) {
      const cat = activeTab.slice(4);
      byTab = venues.filter((v) => v.category === cat);
    }
    const q = query.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.location.toLowerCase().includes(q) ||
        (v.category ?? "").toLowerCase().includes(q)
    );
  }, [venues, activeTab, query]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Venues"
        description="Your venue directory — capacities, contacts and compliance documents"
        actions={
          <>
            <div className="hidden sm:flex items-center rounded-lg border border-surface-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setView("table")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors",
                  view === "table"
                    ? "bg-brand-50 text-brand-700"
                    : "text-surface-500 hover:bg-surface-50"
                )}
                aria-label="Table view"
              >
                <List className="w-4 h-4" strokeWidth={1.8} />
              </button>
              <button
                type="button"
                onClick={() => setView("cards")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-l border-surface-200",
                  view === "cards"
                    ? "bg-brand-50 text-brand-700"
                    : "text-surface-500 hover:bg-surface-50"
                )}
                aria-label="Cards view"
              >
                <LayoutGrid className="w-4 h-4" strokeWidth={1.8} />
              </button>
            </div>
            <Link
              href="/event-manager/venues/new"
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              Add Venue
            </Link>
          </>
        }
        tabs={<TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />}
      />

      <div className="p-6 space-y-6 max-w-[1400px]">
        <KPIGrid className="grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total Venues"     value={String(kpis.total)}          icon={Building2}    iconColor="text-brand-600"   iconBg="bg-brand-50" />
          <MetricCard label="Active This Year"  value={String(kpis.activeThisYear)} icon={CheckCircle2} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Preferred"         value={String(kpis.preferred)}      icon={Star}         iconColor="text-violet-600"  iconBg="bg-violet-50" />
          <MetricCard label="Avg Capacity"      value={kpis.avgCapacity ? String(kpis.avgCapacity) : "—"} icon={Users} iconColor="text-warning-600" iconBg="bg-warning-50" />
        </KPIGrid>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search venues..."
              className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <EmptyState
              icon={Building2}
              title="No venues found"
              description="Try a different filter or add a new venue to your directory."
              action={
                <Link
                  href="/event-manager/venues/new"
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
                >
                  <Plus className="w-4 h-4" strokeWidth={2.5} />
                  Add Venue
                </Link>
              }
              compact
            />
          </div>
        ) : view === "cards" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((v) => (
              <VenueCardTile key={v.id} venue={v} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Venue Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Capacity</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden xl:table-cell">Last Used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {filtered.map((venue) => (
                  <tr key={venue.id} className="hover:bg-surface-50 transition-colors group">
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/event-manager/venues/${venue.id}`}
                        className="font-medium text-surface-900 hover:text-brand-600 transition-colors"
                      >
                        {venue.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell">{venue.location}</td>
                    <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell">{venue.category ?? "—"}</td>
                    <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell tabular-nums">
                      {venue.capacity != null ? venue.capacity : "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={badgeStatus(venue.status) as never} />
                    </td>
                    <td className="px-4 py-3.5 text-surface-400 text-xs hidden xl:table-cell whitespace-nowrap">
                      {venue.lastUsed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-surface-400">
          Showing {filtered.length} of {venues.length} venues
        </p>
      </div>
    </div>
  );
}
