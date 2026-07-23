"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  ChevronLeft, Star, ShieldCheck, MapPin, Users, LayoutGrid,
  PoundSterling, Gauge, Share2, Pencil, MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";

export interface VenueProfileTab {
  id: string;
  label: string;
  href: string;
}

export const VENUE_PROFILE_TABS: VenueProfileTab[] = [
  { id: "overview", label: "Overview", href: "overview" },
  { id: "events", label: "Events", href: "events" },
  { id: "documents", label: "Documents", href: "documents" },
  { id: "notes", label: "Notes", href: "notes" },
  { id: "activity", label: "Activity", href: "activity" },
  { id: "maps-access", label: "Maps & Access", href: "maps-access" },
  { id: "gallery-spaces", label: "Gallery & Spaces", href: "gallery-spaces" },
  { id: "commercials-records", label: "Commercials & Records", href: "commercials-records" },
  { id: "holds", label: "Holds", href: "holds" },
  { id: "rooms", label: "Room Blocks", href: "rooms" },
];

export interface VenueProfileHeaderData {
  id: string;
  name: string;
  coverUrl?: string | null;
  isPreferred: boolean;
  isVerified: boolean;
  rating: number | null;
  venueType: string | null;
  location: string;
  primaryContactName?: string | null;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;
  maxCapacity: number | null;
  spacesCount: number;
  avgSpendLabel: string;
  commercialStatus: string | null;
  lastUsedLabel: string;
}

function TabStrip({ venueId }: { venueId: string }) {
  const pathname = usePathname();
  return (
    <div className="border-b border-surface-200 bg-white">
      <div
        className="flex overflow-x-auto px-6"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {VENUE_PROFILE_TABS.map((tab) => {
          const full = `/event-manager/venues/${venueId}/${tab.href}`;
          const active = pathname === full || pathname?.startsWith(full + "/");
          return (
            <Link
              key={tab.id}
              href={full}
              className={cn(
                "px-3.5 py-3 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors shrink-0",
                active
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-surface-500 hover:text-surface-800 hover:border-surface-300"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function VenueProfileHeader({ venue }: { venue: VenueProfileHeaderData }) {
  return (
    <div className="bg-white border-b border-surface-200 px-6 pt-5 pb-0">
      <Link
        href="/event-manager/venues"
        className="inline-flex items-center gap-1 text-xs font-medium text-surface-500 hover:text-brand-600 mb-4 transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2} />
        Back to Venues
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 pb-5">
        <div className="flex items-start gap-4 min-w-0">
          <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-surface-200 shrink-0 bg-surface-100">
            {venue.coverUrl ? (
              <Image src={venue.coverUrl} alt={venue.name} fill className="object-cover" unoptimized />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-surface-300">
                <LayoutGrid className="w-6 h-6" strokeWidth={1.5} />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-surface-900 truncate">{venue.name}</h1>
              {venue.isPreferred && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-success-50 text-success-700 border border-success-200">
                  <Star className="w-3 h-3 fill-current" /> Preferred
                </span>
              )}
              {venue.isVerified && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200">
                  <ShieldCheck className="w-3 h-3" /> Verified
                </span>
              )}
              {venue.rating != null && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-500">
                  <Star className="w-3.5 h-3.5 fill-current" /> {venue.rating.toFixed(1)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-surface-500 mb-1">
              {venue.venueType && <span>{venue.venueType}</span>}
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" strokeWidth={1.8} /> {venue.location}
              </span>
            </div>
            {(venue.primaryContactName || venue.primaryContactEmail || venue.primaryContactPhone) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-surface-500">
                {venue.primaryContactName && <span className="font-medium text-surface-700">{venue.primaryContactName}</span>}
                {venue.primaryContactEmail && <span>{venue.primaryContactEmail}</span>}
                {venue.primaryContactPhone && <span>{venue.primaryContactPhone}</span>}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="#"
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
          >
            <Share2 className="w-4 h-4" strokeWidth={1.8} /> Share
          </Link>
          <Link
            href={`/event-manager/venues/${venue.id}/edit`}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
          >
            <Pencil className="w-4 h-4" strokeWidth={2} /> Edit Venue
          </Link>
          <button
            type="button"
            aria-label="More actions"
            className="p-2 text-surface-500 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pb-5 border-t border-surface-100 pt-4">
        <Metric icon={Users} label="Max Capacity" value={venue.maxCapacity != null ? String(venue.maxCapacity) : "—"} />
        <Metric icon={LayoutGrid} label="Spaces" value={String(venue.spacesCount)} />
        <Metric icon={PoundSterling} label="Avg Spend" value={venue.avgSpendLabel} />
        <Metric icon={Gauge} label="Suitability" value={venue.rating != null ? `${venue.rating.toFixed(1)} / 5` : "—"} />
        <div>
          <p className="text-[11px] font-medium text-surface-400 uppercase tracking-wider mb-1">Status</p>
          {venue.commercialStatus ? (
            <StatusBadge status={venue.commercialStatus as never} />
          ) : (
            <span className="text-sm text-surface-400">—</span>
          )}
        </div>
        <div>
          <p className="text-[11px] font-medium text-surface-400 uppercase tracking-wider mb-1">Last Used</p>
          <p className="text-sm font-semibold text-surface-800">{venue.lastUsedLabel}</p>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-surface-400 uppercase tracking-wider mb-1 flex items-center gap-1">
        <Icon className="w-3 h-3" strokeWidth={1.8} /> {label}
      </p>
      <p className="text-sm font-semibold text-surface-800 tabular-nums">{value}</p>
    </div>
  );
}

export function VenueProfileShell({
  venue,
  children,
}: {
  venue: VenueProfileHeaderData;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <VenueProfileHeader venue={venue} />
      <TabStrip venueId={venue.id} />
      <div className="bg-surface-50 min-h-[500px]">{children}</div>
    </div>
  );
}

/** Small shared right-rail card used consistently across all profile tabs. */
export function InsightCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-surface-800">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}
