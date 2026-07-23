import Link from "next/link";
import {
  Store,
  Lock,
  ChevronDown,
  LayoutGrid,
  List,
  Tag,
  MapPin,
  CalendarDays,
  Users2,
  Banknote,
  SlidersHorizontal,
  Gauge,
  ShieldCheck as ComplianceIcon,
  Utensils,
  Speaker,
  Lightbulb,
  Palette,
  Users,
  SprayCan,
  ShieldCheck,
  PartyPopper,
} from "lucide-react";
import { getPersonaContext } from "@/lib/flags/context";
import { getSessionUser } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { SupplierMarketplaceCard } from "@/components/marketplace/SupplierMarketplaceCard";
import { VenueMarketplaceCard } from "@/components/marketplace/VenueMarketplaceCard";
import {
  InsightsStrip,
  FeaturedListingsPanel,
  RecentlyViewedPanel,
  ShortlistPanel,
  CompareTrayPanel,
} from "@/components/marketplace/MarketplaceInsightsRail";
import {
  browseMarketplaceListings,
  getRecentlyViewedRailItems,
  getFavouriteRailItems,
  getCompareRailItems,
  getWorkspaceMarketplaceState,
  type MarketplaceRailItem,
} from "@/lib/marketplace/queries";
import type { SupplierListing, VenueListing } from "@/lib/marketplace/fixtures";

const BASE_PATH = "/event-manager/marketplace";

type MarketType = "all" | "venues" | "suppliers";
type SupplierTab = "all" | "preferred" | "shortlisted" | "compared";

export default async function MarketplaceBrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; tab?: string }>;
}) {
  const { workspaceId, workspaceType, flags } = await getPersonaContext();
  const { type: typeParam, tab: tabParam } = await searchParams;

  if (!flags.marketplaceVenue && !flags.marketplaceSupplier) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <div className="max-w-md w-full rounded-2xl border border-surface-200 bg-white p-10 text-center shadow-card">
          <div className="mx-auto w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center mb-5">
            <Lock className="w-6 h-6 text-brand-600" />
          </div>
          <h2 className="text-xl font-semibold text-surface-900 mb-2">Marketplace</h2>
          <p className="text-sm text-surface-500">
            The marketplace is not enabled for this workspace yet. Contact your workspace owner or
            Gala Dock support to turn it on.
          </p>
        </div>
      </div>
    );
  }

  const user = await getSessionUser();
  const { suppliers, venues } = await browseMarketplaceListings();

  // workspaceId/user are guaranteed non-null here: getPersonaContext() already calls
  // requireWorkspace(), which redirects unauthenticated/workspace-less sessions before this point.
  let favouriteIds = new Set<string>();
  let compareIds = new Set<string>();
  let recentlyViewed: MarketplaceRailItem[] = [];
  let favouriteRailItems: MarketplaceRailItem[] = [];
  let compareRailItems: MarketplaceRailItem[] = [];
  if (workspaceId && user) {
    const [marketplaceState, recentlyViewedResult, favouriteRailItemsResult, compareRailItemsResult] = await Promise.all([
      getWorkspaceMarketplaceState(workspaceId, user.id),
      getRecentlyViewedRailItems(workspaceId, user.id),
      getFavouriteRailItems(workspaceId, user.id),
      getCompareRailItems(workspaceId, user.id),
    ]);
    favouriteIds = marketplaceState.favouriteIds;
    compareIds = marketplaceState.compareIds;
    recentlyViewed = recentlyViewedResult;
    favouriteRailItems = favouriteRailItemsResult;
    compareRailItems = compareRailItemsResult;
  }

  if (workspaceType === "venue") {
    const tab: SupplierTab = tabParam === "preferred" || tabParam === "shortlisted" || tabParam === "compared" ? tabParam : "all";
    return (
      <SupplierOnlyDashboard
        tab={tab}
        suppliers={suppliers}
        favouriteIds={favouriteIds}
        compareIds={compareIds}
        recentlyViewed={recentlyViewed}
        favouriteRailItems={favouriteRailItems}
        compareRailItems={compareRailItems}
      />
    );
  }

  const type: MarketType = typeParam === "venues" || typeParam === "suppliers" ? typeParam : "all";
  return (
    <CombinedDashboard
      type={type}
      suppliers={suppliers}
      venues={venues}
      favouriteIds={favouriteIds}
      compareIds={compareIds}
      recentlyViewed={recentlyViewed}
      favouriteRailItems={favouriteRailItems}
    />
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Shared bits                                                                                    */
/* -------------------------------------------------------------------------------------------- */

function SegmentedControl({
  options,
  active,
  paramName,
}: {
  options: { value: string; label: string }[];
  active: string;
  paramName: string;
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-surface-200 bg-white p-1 shrink-0">
      {options.map((opt) => {
        const href = opt.value === "all" ? BASE_PATH : `${BASE_PATH}?${paramName}=${opt.value}`;
        const isActive = active === opt.value;
        return (
          <Link
            key={opt.value}
            href={href}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-md transition-colors",
              isActive ? "bg-brand-50 text-brand-700" : "text-surface-600 hover:bg-surface-50"
            )}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}

function FilterChip({ icon: Icon, label }: { icon: typeof Tag; label: string }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-200 bg-white text-xs font-medium text-surface-600 hover:bg-surface-50 hover:text-surface-900 transition-colors"
    >
      <Icon className="w-3.5 h-3.5 text-surface-400" />
      {label}
      <ChevronDown className="w-3 h-3 text-surface-400" />
    </button>
  );
}

function Toolbar({ resultCount, clearHref }: { resultCount: number; clearHref: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="inline-flex items-center rounded-lg border border-surface-200 bg-white p-1">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-brand-50 text-brand-700">
            <LayoutGrid className="w-4 h-4" />
          </span>
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-md text-surface-400">
            <List className="w-4 h-4" />
          </span>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-200 bg-white text-xs font-medium text-surface-600 hover:bg-surface-50 transition-colors"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-surface-400" />
          Sort by: <span className="text-surface-900">Recommended</span>
          <ChevronDown className="w-3 h-3 text-surface-400" />
        </button>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-surface-500">{resultCount} results</span>
        <Link href={clearHref} className="text-brand-600 hover:underline font-medium">
          Clear all
        </Link>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Spec A — combined Event Manager dashboard                                                      */
/* -------------------------------------------------------------------------------------------- */

function CombinedDashboard({
  type,
  suppliers,
  venues,
  favouriteIds,
  compareIds,
  recentlyViewed,
  favouriteRailItems,
}: {
  type: MarketType;
  suppliers: SupplierListing[];
  venues: VenueListing[];
  favouriteIds: Set<string>;
  compareIds: Set<string>;
  recentlyViewed: MarketplaceRailItem[];
  favouriteRailItems: MarketplaceRailItem[];
}) {
  const venueItems = type === "suppliers" ? [] : venues;
  const supplierItems = type === "venues" ? [] : suppliers;
  const resultCount = venueItems.length + supplierItems.length;

  const featured = [
    ...venues.slice(0, 1).map((v) => ({
      id: v.id,
      name: v.name,
      location: v.location,
      rating: v.rating,
      image: v.images[0],
      href: `${BASE_PATH}/venues/${v.slug}`,
    })),
    ...suppliers.slice(0, 2).map((s) => ({
      id: s.id,
      name: s.name,
      location: s.location,
      rating: s.rating,
      image: s.coverImage,
      href: `${BASE_PATH}/suppliers/${s.slug}`,
    })),
  ];

  const recentlyViewedItems = recentlyViewed.map((item) => ({
    id: item.id,
    name: item.name,
    location: item.location,
    image: item.image,
    href: `${BASE_PATH}/${item.hrefPath}`,
  }));

  const shortlistItems = favouriteRailItems.map((item) => ({ id: item.id, name: item.name, sub: item.location, image: item.image }));

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Marketplace"
        description="Source venues and suppliers from across Gala Dock. Discover verified partners, compare options, and get the best for your events."
      />

      <div className="flex-1 px-6 py-6 xl:flex xl:gap-6">
        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              type="text"
              placeholder='Search venues or suppliers, e.g. "rooftop venues in London"'
              className="flex-1 min-w-[200px] px-3.5 py-2 text-sm border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
            <SegmentedControl
              paramName="type"
              active={type}
              options={[
                { value: "all", label: "All" },
                { value: "venues", label: "Venues" },
                { value: "suppliers", label: "Suppliers" },
              ]}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterChip icon={Tag} label="Category" />
            <FilterChip icon={MapPin} label="Location" />
            <FilterChip icon={CalendarDays} label="Date" />
            <FilterChip icon={Users2} label="Capacity" />
            <FilterChip icon={Banknote} label="Price range" />
            <FilterChip icon={SlidersHorizontal} label="More filters" />
          </div>

          <Toolbar resultCount={resultCount} clearHref={BASE_PATH} />

          {resultCount === 0 ? (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card">
              <EmptyState
                icon={Store}
                title="No listings found"
                description="Try a different category or check back soon — new venues and suppliers are added regularly."
              />
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
              {venueItems.map((venue) => (
                <VenueMarketplaceCard
                  key={venue.id}
                  venue={venue}
                  basePath={BASE_PATH}
                  defaultFavourited={favouriteIds.has(venue.id)}
                  defaultCompared={compareIds.has(venue.id)}
                />
              ))}
              {supplierItems.map((supplier) => (
                <SupplierMarketplaceCard
                  key={supplier.id}
                  supplier={supplier}
                  basePath={BASE_PATH}
                  defaultFavourited={favouriteIds.has(supplier.serviceId)}
                  defaultCompared={compareIds.has(supplier.serviceId)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="hidden xl:block w-[320px] shrink-0 space-y-4">
          <InsightsStrip
            stats={[
              { label: "Total results", value: String(suppliers.length + venues.length) },
              {
                label: "Verified partners",
                value: String(suppliers.filter((s) => s.verified).length + venues.filter((v) => v.verified).length),
              },
              { label: "Featured", value: String(suppliers.filter((s) => s.featured).length + venues.filter((v) => v.featured).length) },
            ]}
          />
          <FeaturedListingsPanel items={featured} viewAllHref={BASE_PATH} />
          <RecentlyViewedPanel items={recentlyViewedItems} />
          <ShortlistPanel items={shortlistItems} viewHref={`${BASE_PATH}/shortlist`} />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Spec B — Venue Manager supplier-only dashboard                                                 */
/* -------------------------------------------------------------------------------------------- */

const SUPPLIER_CATEGORIES: { label: string; icon: typeof Utensils }[] = [
  { label: "Catering", icon: Utensils },
  { label: "AV & Production", icon: Speaker },
  { label: "Lighting", icon: Lightbulb },
  { label: "Décor & Styling", icon: Palette },
  { label: "Staffing", icon: Users },
  { label: "Cleaning", icon: SprayCan },
  { label: "Security", icon: ShieldCheck },
  { label: "Entertainment", icon: PartyPopper },
];

function SupplierOnlyDashboard({
  tab,
  suppliers,
  favouriteIds,
  compareIds,
  recentlyViewed,
  favouriteRailItems,
  compareRailItems,
}: {
  tab: SupplierTab;
  suppliers: SupplierListing[];
  favouriteIds: Set<string>;
  compareIds: Set<string>;
  recentlyViewed: MarketplaceRailItem[];
  favouriteRailItems: MarketplaceRailItem[];
  compareRailItems: MarketplaceRailItem[];
}) {
  const allSuppliers = suppliers;
  const preferredSuppliers = suppliers.filter((s) => s.preferred);
  const shortlistedSuppliers = suppliers.filter((s) => favouriteIds.has(s.serviceId));
  const comparedSuppliers = suppliers.filter((s) => compareIds.has(s.serviceId));

  const visibleSuppliers =
    tab === "preferred" ? preferredSuppliers
    : tab === "shortlisted" ? shortlistedSuppliers
    : tab === "compared" ? comparedSuppliers
    : allSuppliers;
  const showEmptyPlaceholder = (tab === "shortlisted" || tab === "compared") && visibleSuppliers.length === 0;

  const shortlistItems = favouriteRailItems.map((item) => ({ id: item.id, name: item.name, sub: item.location, image: item.image }));
  const compareItems = compareRailItems.map((item) => ({ id: item.id, name: item.name, sub: item.location }));

  const recentlyViewedItems = recentlyViewed.map((item) => ({
    id: item.id,
    name: item.name,
    location: item.location,
    image: item.image,
    href: `${BASE_PATH}/${item.hrefPath}`,
  }));

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Marketplace"
        description="Find trusted suppliers to deliver exceptional events. Compare, shortlist and connect with verified professionals."
      />

      <div className="flex-1 px-6 py-6 xl:flex xl:gap-6">
        <div className="flex-1 min-w-0 space-y-4">
          <SegmentedControl
            paramName="tab"
            active={tab}
            options={[
              { value: "all", label: "All Suppliers" },
              { value: "preferred", label: "Preferred" },
              { value: "shortlisted", label: "Shortlisted" },
              { value: "compared", label: "Compared" },
            ]}
          />

          <div>
            <p className="text-xs font-medium text-surface-500 mb-2">Browse by category</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SUPPLIER_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const count = suppliers.filter((s) => s.category === cat.label).length;
                return (
                  <div
                    key={cat.label}
                    className="flex flex-col items-start gap-2 rounded-xl border border-surface-200 bg-white p-3 hover:border-brand-200 hover:bg-brand-50/40 transition-colors"
                  >
                    <span className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-brand-600" />
                    </span>
                    <span className="text-xs font-medium text-surface-900">{cat.label}</span>
                    <span className="text-[11px] text-surface-400">{count} supplier{count === 1 ? "" : "s"}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterChip icon={Tag} label="Category" />
            <FilterChip icon={MapPin} label="Service area" />
            <FilterChip icon={CalendarDays} label="Available date" />
            <FilterChip icon={Banknote} label="Budget" />
            <FilterChip icon={Gauge} label="Response speed" />
            <FilterChip icon={ComplianceIcon} label="Compliance level" />
          </div>

          <Toolbar resultCount={visibleSuppliers.length} clearHref={BASE_PATH} />

          {showEmptyPlaceholder ? (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card">
              <EmptyState
                icon={Store}
                title="Nothing here yet"
                description={
                  tab === "shortlisted"
                    ? "Suppliers you shortlist will appear here so you can compare and reach out later."
                    : "Add suppliers to your comparison tray to see them side by side."
                }
              />
            </div>
          ) : visibleSuppliers.length === 0 ? (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card">
              <EmptyState icon={Store} title="No suppliers found" description="Try a different category or filter." />
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
              {visibleSuppliers.map((supplier) => (
                <SupplierMarketplaceCard
                  key={supplier.id}
                  supplier={supplier}
                  basePath={BASE_PATH}
                  defaultFavourited={favouriteIds.has(supplier.serviceId)}
                  defaultCompared={compareIds.has(supplier.serviceId)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="hidden xl:block w-[320px] shrink-0 space-y-4">
          <InsightsStrip
            stats={[
              { label: "Total suppliers", value: String(allSuppliers.length) },
              { label: "Verified partners", value: String(allSuppliers.filter((s) => s.verified).length) },
              { label: "Preferred", value: String(preferredSuppliers.length) },
            ]}
          />
          <ShortlistPanel items={shortlistItems} viewHref={`${BASE_PATH}/shortlist`} />
          <CompareTrayPanel items={compareItems} max={4} compareHref={`${BASE_PATH}/compare`} />
          <RecentlyViewedPanel items={recentlyViewedItems} />
        </div>
      </div>
    </div>
  );
}
