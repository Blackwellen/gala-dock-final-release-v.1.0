import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { findSupplierByServiceSlug, findVenueBySlug, type SupplierListing, type VenueListing } from "./fixtures";

// Gala Dock marketplace — Phase 4 live data layer.
//
// marketplace_listings now carries real card-level fields (slug, verified, featured, price,
// rating, tags, seated/standing capacity — see 20260718_marketplace_listing_cards.sql) but NOT
// yet the deep profile-page content (packages, certifications, portfolio images, venue spaces,
// review text) — that needs its own child tables and is a later phase. So `toCardListing`
// below maps a real DB row onto the SAME field names the Phase 2 fixture types use for the
// *card* surface, while profile pages layer the matching fixture entry on top (by slug) for the
// deep content only, clearly commented at each call site. Once child tables exist, swap the
// fixture layer for real joins without touching the card components.

export type ListingRow = Database["public"]["Tables"]["marketplace_listings"]["Row"];

const CATEGORY_LABEL: Record<string, string> = {
  venue: "Venue",
  catering: "Catering",
  entertainment: "Entertainment",
  play_activity: "Play & Activity",
  decor_styling: "Décor & Styling",
  photo_video: "Photo / Video",
  logistics: "Logistics & Hire",
  extras: "Extras",
};

// Fixture cover-image gradients keyed by category — used only when a listing has no
// cover_image_url yet (R2 media wiring is a later phase; see AGENTS.md marketplace brief §18).
const CATEGORY_GRADIENT: Record<string, string> = {
  venue: "linear-gradient(135deg,#0c1830,#1e3a5c,#3a6a8c)",
  catering: "linear-gradient(135deg,#2b1a0e,#4a2c14,#7a4a1e)",
  entertainment: "linear-gradient(135deg,#1a0e2e,#3d1e5e,#6c2ba0)",
  decor_styling: "linear-gradient(135deg,#2c1a3d,#4a2a52,#7c4a63)",
  logistics: "linear-gradient(135deg,#120a24,#2c1653,#5a2b8c)",
  extras: "linear-gradient(135deg,#1a1a1a,#2e2e2e,#454545)",
  photo_video: "linear-gradient(135deg,#1a1030,#3d2a63)",
  play_activity: "linear-gradient(135deg,#0e1a1c,#143a3d,#1e5a5e)",
};

function coverImage(row: Pick<ListingRow, "cover_image_url" | "category">): string {
  return row.cover_image_url ?? CATEGORY_GRADIENT[row.category] ?? CATEGORY_GRADIENT.extras;
}

/** Maps a live marketplace_listings row + its owning workspace onto the SupplierListing card shape. */
export function toSupplierCard(row: ListingRow, workspaceName: string, workspaceSlug: string): SupplierListing {
  const fixture = findSupplierByServiceSlug(row.slug ?? "");
  return {
    id: row.id,
    slug: workspaceSlug,
    serviceId: row.id,
    serviceSlug: row.slug ?? row.id,
    name: workspaceName,
    serviceName: row.title,
    category: CATEGORY_LABEL[row.category] ?? row.category,
    logoInitial: fixture?.logoInitial ?? workspaceName.toUpperCase(),
    logoTone: fixture?.logoTone ?? "dark",
    coverImage: coverImage(row),
    verified: row.verified,
    topRated: row.top_rated,
    featured: row.featured,
    preferred: row.preferred,
    location: fixture?.location ?? (row.coverage_regions[0] ?? "UK Wide"),
    coverage: row.coverage_regions.join(", ") || "UK Wide",
    responseRate: row.response_rate ?? fixture?.responseRate ?? 90,
    responseTime: row.response_time_label ?? fixture?.responseTime ?? "24h",
    rating: Number(row.rating_avg ?? 0),
    reviewCount: row.rating_count,
    leadTime: row.lead_time_label ?? fixture?.leadTime ?? "On request",
    complianceGrade: (row.compliance_grade as "A" | "B" | "C") ?? fixture?.complianceGrade ?? "B",
    priceFromCents: row.price_from_cents,
    priceUnit: row.price_unit as SupplierListing["priceUnit"],
    availability: "contact",
    tags: row.tags.length > 0 ? row.tags : (fixture?.tags ?? []),
    description: row.description ?? fixture?.description ?? "",
    eventsDelivered: fixture?.eventsDelivered ?? 0,
    yearsOnPlatform: fixture?.yearsOnPlatform ?? 1,
    founded: fixture?.founded ?? new Date(row.created_at).getFullYear(),
    companySize: fixture?.companySize ?? "—",
    website: fixture?.website ?? "",
    aboutBullets: fixture?.aboutBullets ?? [],
    servicesOffered: fixture?.servicesOffered ?? [],
    eventTypes: fixture?.eventTypes ?? [],
    portfolio: fixture?.portfolio ?? [],
    certifications: fixture?.certifications ?? [],
    ratingBreakdown: fixture?.ratingBreakdown ?? [],
    reviews: fixture?.reviews ?? [],
    packages: fixture?.packages ?? [],
    included: fixture?.included ?? [],
    serviceAreaNote: fixture?.serviceAreaNote ?? { primary: row.coverage_regions[0] ?? "UK Wide", secondary: "—", global: "—" },
  };
}

/** Maps a live marketplace_listings row (category='venue') onto the VenueListing card shape. */
export function toVenueCard(row: ListingRow, ownerWorkspaceId: string): VenueListing {
  const fixture = findVenueBySlug(row.slug ?? "");
  return {
    id: row.id,
    slug: row.slug ?? row.id,
    name: row.title,
    type: fixture?.type ?? "Venue",
    images: fixture?.images ?? [coverImage(row)],
    verified: row.verified,
    featured: row.featured,
    location: fixture?.location ?? (row.coverage_regions[0] ?? "UK"),
    address: fixture?.address ?? "",
    seatedCapacity: row.seated_capacity ?? fixture?.seatedCapacity ?? 0,
    standingCapacity: row.standing_capacity ?? fixture?.standingCapacity ?? 0,
    availability: "contact",
    priceFromCents: row.price_from_cents,
    responseTime: row.response_time_label ?? fixture?.responseTime ?? "24h",
    rating: Number(row.rating_avg ?? 0),
    reviewCount: row.rating_count,
    amenities: fixture?.amenities ?? [],
    highlights: fixture?.highlights ?? [],
    accessible: row.accessible ?? fixture?.accessible ?? false,
    description: row.description ?? fixture?.description ?? "",
    spaces: fixture?.spaces ?? [],
    ownerId: ownerWorkspaceId,
    hostedEvents: fixture?.hostedEvents ?? [],
    documents: fixture?.documents ?? [],
  };
}

export interface MarketplaceBrowseResult {
  suppliers: SupplierListing[];
  venues: VenueListing[];
}

/** Live browse query backing /event-manager/marketplace. Server-only (RLS-scoped read). */
export async function browseMarketplaceListings(): Promise<MarketplaceBrowseResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketplace_listings")
    .select("*, workspace:workspaces(id, name, slug)")
    .eq("status", "live")
    .order("featured", { ascending: false })
    .order("rating_avg", { ascending: false, nullsFirst: false });

  if (error || !data) return { suppliers: [], venues: [] };

  const suppliers: SupplierListing[] = [];
  const venues: VenueListing[] = [];

  for (const row of data as (ListingRow & { workspace: { id: string; name: string; slug: string | null } | null })[]) {
    if (!row.workspace) continue;
    if (row.category === "venue") {
      venues.push(toVenueCard(row, row.workspace.id));
    } else {
      suppliers.push(toSupplierCard(row, row.workspace.name, row.workspace.slug ?? row.workspace.id));
    }
  }

  return { suppliers, venues };
}

/** Live lookup backing /marketplace/services/[serviceSlug] and quote-request/checkout routes. */
export async function getListingByServiceSlug(serviceSlug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("marketplace_listings")
    .select("*, workspace:workspaces(id, name, slug)")
    .eq("slug", serviceSlug)
    .eq("status", "live")
    .maybeSingle();
  if (!data || !data.workspace) return null;
  return { row: data as ListingRow, workspaceId: data.workspace.id, workspaceName: data.workspace.name, workspaceSlug: data.workspace.slug };
}

/** Live lookup backing /marketplace/venues/[venueSlug] and venue checkout. */
export async function getVenueListingBySlug(venueSlug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("marketplace_listings")
    .select("*, workspace:workspaces(id, name, slug)")
    .eq("slug", venueSlug)
    .eq("category", "venue")
    .eq("status", "live")
    .maybeSingle();
  if (!data || !data.workspace) return null;
  return { row: data as ListingRow, workspaceId: data.workspace.id, workspaceName: data.workspace.name, workspaceSlug: data.workspace.slug };
}

export interface MarketplaceRailItem {
  id: string;
  name: string;
  location: string;
  image: string;
  /** basePath-relative path fragment, e.g. "venues/the-old-vic" or "suppliers/floral-co" */
  hrefPath: string;
}

type RailListingRow = Pick<ListingRow, "id" | "slug" | "title" | "category" | "cover_image_url" | "coverage_regions"> & {
  workspace: { id: string; name: string; slug: string | null } | null;
};

function toRailItem(row: RailListingRow): MarketplaceRailItem {
  const isVenue = row.category === "venue";
  const name = isVenue ? row.title : (row.workspace?.name ?? row.title);
  const hrefSlug = isVenue ? (row.slug ?? row.id) : (row.workspace?.slug ?? row.workspace?.id ?? row.id);
  return {
    id: row.id,
    name,
    location: row.coverage_regions[0] ?? "UK Wide",
    image: coverImage(row),
    hrefPath: isVenue ? `venues/${hrefSlug}` : `suppliers/${hrefSlug}`,
  };
}

/** Live "Recently viewed" rail backing /event-manager/marketplace insights panel. */
export async function getRecentlyViewedRailItems(workspaceId: string, userId: string, limit = 6): Promise<MarketplaceRailItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("marketplace_recently_viewed")
    .select("viewed_at, listing:marketplace_listings(id, slug, title, category, cover_image_url, coverage_regions, workspace:workspaces(id, name, slug))")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .order("viewed_at", { ascending: false })
    .limit(limit);

  if (!data) return [];
  return data
    .map((r) => r.listing as unknown as RailListingRow | null)
    .filter((l): l is RailListingRow => l != null)
    .map(toRailItem);
}

/** Live "My shortlist" rail backing /event-manager/marketplace insights panel. */
export async function getFavouriteRailItems(workspaceId: string, userId: string, limit = 12): Promise<MarketplaceRailItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("marketplace_favourites")
    .select("created_at, listing:marketplace_listings(id, slug, title, category, cover_image_url, coverage_regions, workspace:workspaces(id, name, slug))")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!data) return [];
  return data
    .map((r) => r.listing as unknown as RailListingRow | null)
    .filter((l): l is RailListingRow => l != null)
    .map(toRailItem);
}

/** Live "Compare tray" rail backing /event-manager/marketplace insights panel. */
export async function getCompareRailItems(workspaceId: string, userId: string, limit = 4): Promise<MarketplaceRailItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("marketplace_comparison_items")
    .select("created_at, listing:marketplace_listings(id, slug, title, category, cover_image_url, coverage_regions, workspace:workspaces(id, name, slug))")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!data) return [];
  return data
    .map((r) => r.listing as unknown as RailListingRow | null)
    .filter((l): l is RailListingRow => l != null)
    .map(toRailItem);
}

/** Listing IDs the current user has favourited/compared, for computing card defaultActive state. */
export async function getWorkspaceMarketplaceState(workspaceId: string, userId: string): Promise<{ favouriteIds: Set<string>; compareIds: Set<string> }> {
  const supabase = await createClient();
  const [{ data: favourites }, { data: compares }] = await Promise.all([
    supabase.from("marketplace_favourites").select("listing_id").eq("workspace_id", workspaceId).eq("user_id", userId),
    supabase.from("marketplace_comparison_items").select("listing_id").eq("workspace_id", workspaceId).eq("user_id", userId),
  ]);
  return {
    favouriteIds: new Set((favourites ?? []).map((f) => f.listing_id)),
    compareIds: new Set((compares ?? []).map((c) => c.listing_id)),
  };
}

/** Live lookup backing /marketplace/suppliers/[slug] and /marketplace/venue-owners/[slug] — both key off workspaces.slug. */
export async function getListingsForWorkspaceSlug(workspaceSlug: string) {
  const supabase = await createClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name, slug")
    .eq("slug", workspaceSlug)
    .maybeSingle();
  if (!workspace) return null;

  const { data: listings } = await supabase
    .from("marketplace_listings")
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("status", "live");

  return { workspace, listings: (listings ?? []) as ListingRow[] };
}
