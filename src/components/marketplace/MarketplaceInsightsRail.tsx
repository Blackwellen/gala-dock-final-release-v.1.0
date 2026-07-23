import Link from "next/link";
import { TrendingUp, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { RatingSummary } from "./RatingSummary";

// Right rail used on both the Event Manager combined marketplace (image 3) and the Venue
// Manager supplier marketplace (image 4). Each block is exported separately so a page can pick
// the subset it needs (e.g. Venue Manager omits "Recommended for event").

export function InsightsStrip({
  stats,
  className,
}: {
  stats: { label: string; value: string }[];
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-surface-200 bg-white p-4 shadow-card", className)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-surface-900">Marketplace insights</h3>
        <TrendingUp className="w-4 h-4 text-success-500" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-lg font-semibold text-surface-900">{s.value}</p>
            <p className="text-[11px] text-surface-400 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FeaturedListingsPanel({
  items,
  viewAllHref,
  className,
}: {
  items: { id: string; name: string; location: string; rating: number; image: string; href: string }[];
  viewAllHref: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-surface-200 bg-white p-4 shadow-card", className)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-surface-900">Featured listings</h3>
        <Link href={viewAllHref} className="text-xs text-brand-600 hover:underline">View all</Link>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <Link key={item.id} href={item.href} className="flex items-center gap-3 group">
            <div className="w-11 h-11 rounded-lg shrink-0" style={{ background: item.image }} />
            <div className="min-w-0">
              <p className="text-xs font-medium text-surface-900 group-hover:text-brand-700 truncate">{item.name}</p>
              <p className="text-[11px] text-surface-400 truncate">{item.location}</p>
            </div>
            <RatingSummary rating={item.rating} reviewCount={0} size="xs" className="ml-auto shrink-0 [&>span:last-child]:hidden" />
          </Link>
        ))}
      </div>
    </div>
  );
}

export function RecentlyViewedPanel({
  items,
  className,
}: {
  items: { id: string; name: string; location: string; image: string; href: string }[];
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-surface-200 bg-white p-4 shadow-card", className)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-surface-900">Recently viewed</h3>
        <button type="button" className="text-xs text-surface-400 hover:text-surface-600">Clear</button>
      </div>
      <div className="space-y-3">
        {items.length === 0 && <p className="text-xs text-surface-400">Listings you view will appear here.</p>}
        {items.map((item) => (
          <Link key={item.id} href={item.href} className="flex items-center gap-3 group">
            <div className="w-11 h-11 rounded-lg shrink-0" style={{ background: item.image }} />
            <div className="min-w-0">
              <p className="text-xs font-medium text-surface-900 group-hover:text-brand-700 truncate">{item.name}</p>
              <p className="text-[11px] text-surface-400 truncate">{item.location}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ShortlistPanel({
  items,
  viewHref,
  className,
}: {
  items: { id: string; name: string; sub: string; image?: string }[];
  viewHref: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-surface-200 bg-white p-4 shadow-card", className)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-surface-900">My shortlist</h3>
        <span className="text-[11px] text-surface-400">{items.length} items</span>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg shrink-0 bg-surface-100" style={item.image ? { background: item.image } : undefined} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-surface-900 truncate">{item.name}</p>
              <p className="text-[11px] text-surface-400 truncate">{item.sub}</p>
            </div>
            <Bookmark className="w-3.5 h-3.5 text-brand-500 fill-brand-500 shrink-0" />
          </div>
        ))}
      </div>
      <Link
        href={viewHref}
        className="mt-4 block text-center text-xs font-medium text-surface-700 border border-surface-200 rounded-lg py-2 hover:bg-surface-50 transition-colors"
      >
        View shortlist
      </Link>
    </div>
  );
}

export function CompareTrayPanel({
  items,
  max,
  compareHref,
  className,
}: {
  items: { id: string; name: string; sub: string }[];
  max: number;
  compareHref: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-surface-200 bg-white p-4 shadow-card", className)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-surface-900">Compare suppliers</h3>
        <span className="text-[11px] text-surface-400">{items.length}/{max} selected</span>
      </div>
      <div className="space-y-2 mb-3">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 text-xs">
            <div className="w-7 h-7 rounded bg-surface-100 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-surface-900 truncate">{item.name}</p>
              <p className="text-[11px] text-surface-400 truncate">{item.sub}</p>
            </div>
            <button type="button" aria-label={`Remove ${item.name} from comparison`} className="text-surface-300 hover:text-surface-500">
              ×
            </button>
          </div>
        ))}
      </div>
      <Link
        href={compareHref}
        aria-disabled={items.length < 2}
        className={cn(
          "block text-center text-xs font-medium rounded-lg py-2 transition-colors",
          items.length >= 2 ? "bg-brand-600 text-white hover:bg-brand-700" : "bg-surface-100 text-surface-400 pointer-events-none"
        )}
      >
        Compare selected
      </Link>
    </div>
  );
}
