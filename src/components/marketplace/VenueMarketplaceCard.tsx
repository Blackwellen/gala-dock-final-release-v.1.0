import Link from "next/link";
import { Users, UserSquare2, Accessibility } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VenueListing } from "@/lib/marketplace/fixtures";
import { formatMoneyFromCents } from "@/lib/marketplace/format";
import { VerifiedBadge, FeaturedBadge, AvailabilityBadge } from "./badges";
import { RatingSummary } from "./RatingSummary";
import { FavouriteButton, CompareToggleButton } from "./ShortlistCompareButtons";

// Reference: venue_listing_overview_with_modern_ui.png.

interface VenueMarketplaceCardProps {
  venue: VenueListing;
  basePath: string; // "/event-manager/marketplace"
  className?: string;
  defaultFavourited?: boolean;
  defaultCompared?: boolean;
}

export function VenueMarketplaceCard({
  venue,
  basePath,
  className,
  defaultFavourited = false,
  defaultCompared = false,
}: VenueMarketplaceCardProps) {
  const venueHref = `${basePath}/venues/${venue.slug}`;
  const enquireHref = `${basePath}/venues/${venue.slug}/enquire`;

  return (
    <div className={cn("group rounded-2xl border border-surface-200 bg-white overflow-hidden shadow-card hover:shadow-dropdown transition-shadow", className)}>
      <div className="relative h-40" style={{ background: venue.images[0] }}>
        <div className="absolute top-3 left-3 flex items-center gap-2">
          {venue.featured && <FeaturedBadge />}
          {venue.verified && <VerifiedBadge label="Verified" />}
        </div>
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <FavouriteButton listingId={venue.id} defaultActive={defaultFavourited} variant="icon-dark" />
          <CompareToggleButton listingId={venue.id} defaultActive={defaultCompared} />
        </div>
        {venue.images.length > 1 && (
          <span className="absolute bottom-3 right-3 rounded-full bg-black/60 text-white text-[11px] px-2 py-0.5">
            1 / {venue.images.length}
          </span>
        )}
      </div>

      <div className="p-4">
        <p className="text-xs font-medium text-brand-600">{venue.type}</p>
        <Link href={venueHref} className="block mt-0.5 text-sm font-semibold text-surface-900 hover:text-brand-700 truncate">
          {venue.name}
        </Link>
        <p className="text-xs text-surface-400 mt-0.5">{venue.location}</p>

        <div className="mt-3 flex items-center gap-4 text-xs text-surface-600">
          <span className="inline-flex items-center gap-1"><UserSquare2 className="w-3.5 h-3.5 text-surface-400" /> {venue.seatedCapacity} seated</span>
          <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5 text-surface-400" /> {venue.standingCapacity} standing</span>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <AvailabilityBadge status={venue.availability} date={venue.availabilityDate} />
          <RatingSummary rating={venue.rating} reviewCount={venue.reviewCount} />
        </div>

        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="font-semibold text-surface-900">From {formatMoneyFromCents(venue.priceFromCents)}</span>
          <span className="text-surface-400">{venue.responseTime} response</span>
        </div>

        {venue.accessible && (
          <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-success-600">
            <Accessibility className="w-3.5 h-3.5" /> Fully accessible
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            href={venueHref}
            className="inline-flex items-center justify-center px-3 py-2 rounded-lg border border-surface-200 text-xs font-medium text-surface-700 hover:bg-surface-50 transition-colors"
          >
            View Venue
          </Link>
          <Link
            href={enquireHref}
            className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-brand-600 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
          >
            Send Enquiry
          </Link>
        </div>
      </div>
    </div>
  );
}
