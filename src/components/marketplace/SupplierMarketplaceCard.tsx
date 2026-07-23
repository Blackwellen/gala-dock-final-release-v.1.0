import Link from "next/link";
import { MessageSquare, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SupplierListing } from "@/lib/marketplace/fixtures";
import { formatPriceFrom } from "@/lib/marketplace/format";
import { VerifiedBadge, FeaturedBadge, TopRatedBadge, ComplianceBadge, AvailabilityBadge, PreferredBadge } from "./badges";
import { RatingSummary } from "./RatingSummary";
import { FavouriteButton, CompareToggleButton } from "./ShortlistCompareButtons";

// Reference: floral_co._event_supplier_card.png. Reused across Event Manager (combined) and
// Venue Manager (supplier-only) marketplaces — do not fork per workspace, pass `basePath` instead.

interface SupplierMarketplaceCardProps {
  supplier: SupplierListing;
  basePath: string; // "/event-manager/marketplace" | "/venue-manager/marketplace"
  variant?: "grid" | "compact";
  className?: string;
  defaultFavourited?: boolean;
  defaultCompared?: boolean;
}

export function SupplierMarketplaceCard({
  supplier,
  basePath,
  variant = "grid",
  className,
  defaultFavourited = false,
  defaultCompared = false,
}: SupplierMarketplaceCardProps) {
  const supplierHref = `${basePath}/suppliers/${supplier.slug}`;
  const serviceHref = `${basePath}/services/${supplier.serviceSlug}`;
  const quoteHref = `${basePath}/services/${supplier.serviceSlug}/request-quote`;

  return (
    <div className={cn("group rounded-2xl border border-surface-200 bg-white overflow-hidden shadow-card hover:shadow-dropdown transition-shadow", className)}>
      <div className="relative h-40" style={{ background: supplier.coverImage }}>
        <div className="absolute top-3 left-3 flex items-center gap-2">
          {supplier.featured && <FeaturedBadge />}
          {supplier.verified && <VerifiedBadge label="Verified Supplier" />}
          {supplier.topRated && <TopRatedBadge />}
        </div>
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <FavouriteButton listingId={supplier.serviceId} defaultActive={defaultFavourited} variant="icon-dark" />
          <CompareToggleButton listingId={supplier.serviceId} defaultActive={defaultCompared} />
        </div>
        <Link
          href={supplierHref}
          className="absolute -bottom-8 left-4 w-16 h-16 rounded-xl border-4 border-white bg-surface-900 flex items-center justify-center text-white overflow-hidden shadow-md"
          aria-hidden={variant === "compact"}
        >
          <span className="text-[8px] font-bold tracking-wide text-center leading-tight px-1">{supplier.logoInitial}</span>
        </Link>
      </div>

      <div className="pt-10 px-4 pb-4">
        <p className="text-xs font-medium text-brand-600">{supplier.category}</p>
        <Link href={supplierHref} className="block mt-0.5 text-sm font-semibold text-surface-900 hover:text-brand-700 truncate">
          {supplier.name}
        </Link>
        <p className="text-xs text-surface-400 mt-0.5">{supplier.location}</p>

        {supplier.preferred && <PreferredBadge className="mt-2" />}

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="font-semibold text-surface-900">{supplier.responseRate}%</p>
            <p className="text-surface-400">Response rate</p>
          </div>
          <div>
            <RatingSummary rating={supplier.rating} reviewCount={supplier.reviewCount} />
            <p className="text-surface-400 mt-0.5">Rating</p>
          </div>
          <div>
            <p className="font-semibold text-surface-900">{formatPriceFrom(supplier.priceFromCents, supplier.priceUnit)}</p>
            <p className="text-surface-400">Starting price</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-surface-500">
          <span>Lead time <span className="text-surface-700 font-medium">{supplier.leadTime}</span></span>
          <ComplianceBadge grade={supplier.complianceGrade} />
        </div>

        <div className="mt-3 flex items-center justify-between">
          <AvailabilityBadge status={supplier.availability} date={supplier.availabilityDate} />
        </div>

        {variant === "grid" && supplier.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {supplier.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="px-2 py-0.5 rounded-full bg-surface-100 text-[11px] text-surface-600">
                {tag}
              </span>
            ))}
            {supplier.tags.length > 4 && (
              <span className="px-2 py-0.5 rounded-full bg-surface-100 text-[11px] text-surface-400">+{supplier.tags.length - 4} more</span>
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            href={supplierHref}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 text-xs font-medium text-surface-700 hover:bg-surface-50 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" /> View profile
          </Link>
          <Link
            href={quoteHref}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" /> Request Quote
          </Link>
        </div>
        <Link href={serviceHref} className="block mt-2 text-center text-[11px] text-surface-400 hover:text-brand-600">
          View service: {supplier.serviceName}
        </Link>
      </div>
    </div>
  );
}
