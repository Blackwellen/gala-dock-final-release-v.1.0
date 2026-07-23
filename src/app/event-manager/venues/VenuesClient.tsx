"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus, Search, Building2, Star, CheckCircle2, Users, Gauge, PoundSterling,
  LayoutGrid, List, Mail, Phone,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TabNav } from "@/components/ui/TabNav";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { VenueCard, type VenueCardData } from "@/components/workspace-cards/VenueCard";
import { formatGBP } from "./lib";

export interface VenueRow {
  id: string;
  name: string;
  category: string | null;
  location: string;
  city?: string | null;
  capacity: number | null;
  status: string;
  isPreferred: boolean;
  isVerified: boolean;
  rating: number | null;
  responseTimeHours: number | null;
  avgSpendCents: number | null;
  bestFitEventTypes: string[];
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  lastUsed: string;
  lastUsedAt: string | null;
}

export interface VenuesKpis {
  total: number;
  activeThisYear: number;
  preferred: number;
  avgCapacity: number;
  avgRating: number;
  avgSpendCents: number;
  recentlyUsed: number;
  activeRelationships: number;
}

function toVenueCardData(venue: VenueRow): VenueCardData {
  return {
    id: venue.id,
    name: venue.name,
    status: venue.isPreferred ? "preferred" : venue.status,
    location: venue.location,
    capacity: venue.capacity,
    category: venue.category,
    indoor: null,
    amenities: undefined,
    coverUrl: null,
  };
}

function CityBreakdown({ venues }: { venues: VenueRow[] }) {
  const byCity = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of venues) {
      const city = v.city ?? "Other";
      map.set(city, (map.get(city) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [venues]);
  const max = byCity[0]?.[1] ?? 1;

  if (byCity.length === 0) return <p className="text-sm text-surface-400">No location data yet.</p>;

  return (
    <div className="space-y-2.5">
      {byCity.map(([city, count]) => (
        <div key={city}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-surface-600 font-medium">{city}</span>
            <span className="text-surface-400">{count}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ResponseTimeLeaderboard({ venues }: { venues: VenueRow[] }) {
  const ranked = useMemo(
    () =>
      venues
        .filter((v) => v.responseTimeHours != null)
        .sort((a, b) => (a.responseTimeHours ?? 0) - (b.responseTimeHours ?? 0))
        .slice(0, 5),
    [venues]
  );
  if (ranked.length === 0) return <p className="text-sm text-surface-400">No response-time data yet.</p>;
  return (
    <div className="space-y-2">
      {ranked.map((v, i) => (
        <div key={v.id} className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-surface-700 truncate">
            <span className="w-4 h-4 flex items-center justify-center rounded-full bg-surface-100 text-[10px] font-bold text-surface-500 shrink-0">
              {i + 1}
            </span>
            <span className="truncate">{v.name}</span>
          </span>
          <span className="text-surface-500 text-xs shrink-0">{v.responseTimeHours?.toFixed(1)} hrs</span>
        </div>
      ))}
    </div>
  );
}

function PreferredVenueCard({ venue }: { venue: VenueRow }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-0">
        <div className="relative h-40 sm:h-full bg-gradient-to-br from-surface-700 to-surface-900">
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/95 text-success-700">
              <Star className="w-3 h-3 fill-current" /> Preferred
            </span>
            {venue.isVerified && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/95 text-violet-700">
                Verified
              </span>
            )}
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <Link href={`/event-manager/venues/${venue.id}`} className="font-semibold text-surface-900 hover:text-brand-600 transition-colors">
                {venue.name}
              </Link>
              <p className="text-xs text-surface-500 mt-0.5">
                {venue.location} {venue.category && `· ${venue.category}`}
              </p>
              {(venue.contactName || venue.contactEmail) && (
                <p className="text-xs text-surface-500 mt-1">
                  {venue.contactName}
                  {venue.contactEmail && (
                    <span className="ml-2 inline-flex items-center gap-1"><Mail className="w-3 h-3" />{venue.contactEmail}</span>
                  )}
                  {venue.contactPhone && (
                    <span className="ml-2 inline-flex items-center gap-1"><Phone className="w-3 h-3" />{venue.contactPhone}</span>
                  )}
                </p>
              )}
            </div>
            {venue.rating != null && (
              <span className="flex items-center gap-1 text-sm font-semibold text-amber-500 shrink-0">
                <Star className="w-4 h-4 fill-current" /> {venue.rating.toFixed(1)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mt-3">
            <div>
              <p className="text-surface-400 uppercase tracking-wide">Response Time</p>
              <p className="font-semibold text-surface-800">{venue.responseTimeHours != null ? `${venue.responseTimeHours.toFixed(1)} hrs` : "—"}</p>
            </div>
            <div>
              <p className="text-surface-400 uppercase tracking-wide">Avg Spend</p>
              <p className="font-semibold text-surface-800">{formatGBP(venue.avgSpendCents)}</p>
            </div>
            <div>
              <p className="text-surface-400 uppercase tracking-wide">Capacity</p>
              <p className="font-semibold text-surface-800">{venue.capacity ?? "—"}</p>
            </div>
            <div>
              <p className="text-surface-400 uppercase tracking-wide">Last Used</p>
              <p className="font-semibold text-surface-800">{venue.lastUsed}</p>
            </div>
          </div>

          {venue.bestFitEventTypes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {venue.bestFitEventTypes.slice(0, 4).map((t) => (
                <span key={t} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-100 text-surface-600">{t}</span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 mt-4">
            <Link href={`/event-manager/venues/${venue.id}`} className="px-3 py-1.5 text-xs font-semibold text-brand-700 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors">
              View Profile
            </Link>
            <button className="px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors">
              Create Proposal
            </button>
            <button className="px-3 py-1.5 text-xs font-semibold text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors">
              Add to Event
            </button>
          </div>
        </div>
      </div>
    </div>
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
      { id: "all", label: "All Venues", count: venues.length },
      { id: "preferred", label: "Preferred Venues", count: venues.filter((v) => v.isPreferred).length },
      ...categories.map((c) => ({ id: `cat:${c}`, label: c, count: venues.filter((v) => v.category === c).length })),
    ],
    [venues, categories]
  );

  const isPreferredView = activeTab === "preferred";

  const filtered = useMemo(() => {
    let byTab = venues;
    if (activeTab === "preferred") {
      byTab = venues.filter((v) => v.isPreferred);
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
        (v.category ?? "").toLowerCase().includes(q) ||
        (v.contactName ?? "").toLowerCase().includes(q)
    );
  }, [venues, activeTab, query]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Venues"
        description="Manage your venue directory, relationships, suitability and commercial records."
        actions={
          <>
            <div className="hidden sm:flex items-center rounded-lg border border-surface-200 overflow-hidden">
              <button type="button" onClick={() => setView("table")} className={cn("flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors", view === "table" ? "bg-brand-50 text-brand-700" : "text-surface-500 hover:bg-surface-50")} aria-label="Table view">
                <List className="w-4 h-4" strokeWidth={1.8} />
              </button>
              <button type="button" onClick={() => setView("cards")} className={cn("flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-l border-surface-200", view === "cards" ? "bg-brand-50 text-brand-700" : "text-surface-500 hover:bg-surface-50")} aria-label="Cards view">
                <LayoutGrid className="w-4 h-4" strokeWidth={1.8} />
              </button>
            </div>
            <Link href="/event-manager/venues/new" className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand">
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              {isPreferredView ? "Add Preferred Venue" : "Add Venue"}
            </Link>
          </>
        }
        tabs={<TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />}
      />

      <div className="p-6 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        <div className="min-w-0 space-y-6">
          <KPIGrid className="grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {isPreferredView ? (
              <>
                <MetricCard label="Preferred Venues" value={String(kpis.preferred)} icon={Star} iconColor="text-success-600" iconBg="bg-success-50" />
                <MetricCard label="Recently Used" value={String(kpis.recentlyUsed)} icon={CheckCircle2} iconColor="text-brand-600" iconBg="bg-brand-50" />
                <MetricCard label="Avg. Suitability" value={kpis.avgRating ? `${kpis.avgRating.toFixed(1)} / 5` : "—"} icon={Gauge} iconColor="text-violet-600" iconBg="bg-violet-50" />
                <MetricCard label="Avg. Spend (Est.)" value={formatGBP(kpis.avgSpendCents)} icon={PoundSterling} iconColor="text-warning-600" iconBg="bg-warning-50" />
                <MetricCard label="Active Relationships" value={String(kpis.activeRelationships)} icon={Users} iconColor="text-brand-600" iconBg="bg-brand-50" />
              </>
            ) : (
              <>
                <MetricCard label="Total Venues" value={String(kpis.total)} icon={Building2} iconColor="text-brand-600" iconBg="bg-brand-50" />
                <MetricCard label="Preferred Venues" value={String(kpis.preferred)} icon={Star} iconColor="text-violet-600" iconBg="bg-violet-50" />
                <MetricCard label="Recently Used" value={String(kpis.recentlyUsed)} icon={CheckCircle2} iconColor="text-success-600" iconBg="bg-success-50" />
                <MetricCard label="Avg. Suitability" value={kpis.avgRating ? `${kpis.avgRating.toFixed(1)} / 5` : "—"} icon={Gauge} iconColor="text-warning-600" iconBg="bg-warning-50" />
                <MetricCard label="Avg Capacity" value={kpis.avgCapacity ? String(kpis.avgCapacity) : "—"} icon={Users} iconColor="text-brand-600" iconBg="bg-brand-50" />
              </>
            )}
          </KPIGrid>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white flex-1 min-w-[200px] max-w-sm">
              <Search className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isPreferredView ? "Search preferred venues by name, city, or contact…" : "Search venues by name, city, or contact…"}
                className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <EmptyState
                icon={Building2}
                title={isPreferredView ? "No preferred venues yet" : "No venues found"}
                description={isPreferredView ? "Mark venues as preferred from their profile to build your shortlist." : "Try a different filter or add a new venue to your directory."}
                action={
                  <Link href="/event-manager/venues/new" className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors">
                    <Plus className="w-4 h-4" strokeWidth={2.5} />
                    Add Venue
                  </Link>
                }
                compact
              />
            </div>
          ) : isPreferredView ? (
            <div className="space-y-4">
              {filtered.map((v) => <PreferredVenueCard key={v.id} venue={v} />)}
            </div>
          ) : view === "cards" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((v) => <VenueCard key={v.id} venue={toVenueCardData(v)} />)}
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
                        <Link href={`/event-manager/venues/${venue.id}`} className="font-medium text-surface-900 hover:text-brand-600 transition-colors flex items-center gap-1.5">
                          {venue.name}
                          {venue.isPreferred && <Star className="w-3 h-3 text-success-600 fill-current" />}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell">{venue.location}</td>
                      <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell">{venue.category ?? "—"}</td>
                      <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell tabular-nums">{venue.capacity != null ? venue.capacity : "—"}</td>
                      <td className="px-4 py-3.5"><StatusBadge status={(venue.isPreferred ? "preferred" : venue.status) as never} /></td>
                      <td className="px-4 py-3.5 text-surface-400 text-xs hidden xl:table-cell whitespace-nowrap">{venue.lastUsed}</td>
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

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-800 mb-3">{isPreferredView ? "Preferred by City" : "Venue Mix"}</h3>
            <CityBreakdown venues={isPreferredView ? filtered : venues} />
          </div>
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-800 mb-3">Response Time Leaderboard</h3>
            <ResponseTimeLeaderboard venues={venues} />
          </div>
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-800 mb-3">Quick Insights</h3>
            <ul className="space-y-2 text-sm text-surface-600">
              <li>{kpis.preferred} of {kpis.total} venues are marked preferred.</li>
              <li>{kpis.recentlyUsed} venue{kpis.recentlyUsed === 1 ? "" : "s"} used in the last 90 days.</li>
              <li>{kpis.activeRelationships} venue{kpis.activeRelationships === 1 ? "" : "s"} with a recorded primary contact.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
