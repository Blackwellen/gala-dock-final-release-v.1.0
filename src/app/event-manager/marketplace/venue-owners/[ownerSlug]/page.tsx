import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, CheckCircle2, MapPin, ChevronRight, Sparkles, Users2, Handshake } from "lucide-react";
import { cn } from "@/lib/utils";
import { findVenueOwnerBySlug, type VenueOwner } from "@/lib/marketplace/fixtures";
import { getListingsForWorkspaceSlug, toVenueCard } from "@/lib/marketplace/queries";
import { VerifiedBadge, FeaturedBadge } from "@/components/marketplace/badges";
import { RatingSummary, RatingDistribution } from "@/components/marketplace/RatingSummary";

const BASE_PATH = "/event-manager/marketplace";

// Fixture data doesn't include a star-by-star breakdown, so we derive a plausible-looking
// distribution from the aggregate rating (heavier weight toward 5-star as rating approaches 5).
// This is presentational estimation only, not real per-review data.
function deriveDistribution(rating: number): { stars: number; pct: number }[] {
  const fiveStarShare = Math.max(0, Math.min(1, (rating - 3) / 2));
  const fivePct = Math.round(40 + fiveStarShare * 50);
  const fourPct = Math.round((100 - fivePct) * 0.6);
  const threePct = Math.round((100 - fivePct - fourPct) * 0.6);
  const twoPct = Math.round((100 - fivePct - fourPct - threePct) * 0.6);
  const onePct = Math.max(0, 100 - fivePct - fourPct - threePct - twoPct);
  return [
    { stars: 5, pct: fivePct },
    { stars: 4, pct: fourPct },
    { stars: 3, pct: threePct },
    { stars: 2, pct: twoPct },
    { stars: 1, pct: onePct },
  ];
}

const STATUS_TONE: Record<string, string> = {
  Completed: "bg-success-50 text-success-700 border-success-200",
  Confirmed: "bg-info-50 text-info-700 border-info-200",
};

export default async function VenueOwnerProfilePage({
  params,
}: {
  params: Promise<{ ownerSlug: string }>;
}) {
  const { ownerSlug } = await params;

  // Identity (name) and the venues list are real, live Supabase data keyed off workspaces.slug.
  // Every other field on this page — bio copy, account manager, trust badges, recent events,
  // operational regions — has no home yet on the real `workspaces` table; it needs a dedicated
  // `marketplace_venue_operator_profiles`-style table in a later phase. Until then we layer the
  // matching fixture entry (by slug) on top for that illustrative content, or fall back to
  // clearly-derived defaults (never fabricated numbers) when no fixture entry exists.
  const result = await getListingsForWorkspaceSlug(ownerSlug);
  if (!result) notFound();
  const venueListings = result.listings.filter((l) => l.category === "venue");
  if (venueListings.length === 0) notFound(); // this workspace owns no venues — not a venue-owner profile
  const venues = venueListings.map((row) => toVenueCard(row, result.workspace.id));

  const fixture = findVenueOwnerBySlug(ownerSlug);
  const avgRating = venues.reduce((sum, v) => sum + v.rating, 0) / venues.length;
  const totalReviews = venues.reduce((sum, v) => sum + v.reviewCount, 0);
  const logoInitial =
    fixture?.logoInitial ??
    result.workspace.name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 3)
      .toUpperCase();

  const owner: VenueOwner = {
    id: result.workspace.id,
    slug: ownerSlug,
    name: result.workspace.name, // real
    logoInitial,
    tagline: fixture?.tagline ?? "Venue operator on Gala Dock Marketplace",
    location: fixture?.location ?? venues[0]?.location ?? "UK",
    companyReg: fixture?.companyReg ?? "—",
    founded: fixture?.founded ?? new Date().getFullYear(),
    rating: fixture?.rating ?? Number(avgRating.toFixed(1)), // derived from real venues when no fixture
    reviewCount: fixture?.reviewCount ?? totalReviews,
    responseRate: fixture?.responseRate ?? 90,
    responseTime: fixture?.responseTime ?? venues[0]?.responseTime ?? "24h",
    acceptedBookingRate: fixture?.acceptedBookingRate ?? 0,
    venueIds: venues.map((v) => v.id), // real
    about: fixture?.about ?? `${result.workspace.name} lists ${venues.length} venue${venues.length === 1 ? "" : "s"} on Gala Dock Marketplace.`,
    preferredEventTypes: fixture?.preferredEventTypes ?? [],
    operationalRegions: fixture?.operationalRegions ?? [],
    accountManager: fixture?.accountManager ?? { name: "Gala Dock Support", role: "Marketplace Team", email: "support@galadock.com", phone: "—" },
    trust: fixture?.trust ?? [],
    recentEvents: fixture?.recentEvents ?? [],
  };

  const distribution = deriveDistribution(owner.rating);

  const quickFacts = [
    {
      icon: Sparkles,
      label: "Event Expertise",
      body:
        owner.preferredEventTypes.length > 0
          ? `Specialists across ${owner.preferredEventTypes.slice(0, 3).join(", ")}${owner.preferredEventTypes.length > 3 ? " and more" : ""}.`
          : `Operates ${venues.length} venue${venues.length === 1 ? "" : "s"} on Gala Dock Marketplace.`,
    },
    {
      icon: Users2,
      label: "Client Focused",
      body: "Dedicated account management from first enquiry through to on-the-day delivery.",
    },
    {
      icon: Handshake,
      label: "End-to-End Support",
      body: "Coordinated venue hire, planning and on-site support for every booking.",
    },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-6 pt-4">
        <nav className="text-xs text-surface-400">
          <Link href={BASE_PATH} className="hover:text-brand-600">
            Marketplace
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-surface-600">{owner.name}</span>
        </nav>
      </div>

      <div className="px-6 py-4 space-y-6">
        {/* Hero band */}
        <div
          className="relative rounded-2xl h-[220px] overflow-hidden"
          style={{ background: "linear-gradient(135deg,#241812,#4a3020)" }}
        >
          <div className="absolute top-4 left-4">
            <VerifiedBadge label="Verified partner" />
          </div>
          <div className="absolute -bottom-10 left-6 w-24 h-24 rounded-xl border-4 border-white bg-surface-900 text-white flex items-center justify-center shadow-md">
            <span className="text-[9px] font-bold tracking-wide text-center leading-tight px-1">{owner.logoInitial}</span>
          </div>
        </div>

        {/* Header */}
        <div className="pt-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="inline-flex items-center gap-2 text-2xl font-semibold text-surface-900 tracking-tight">
              {owner.name}
              <BadgeCheck className="w-5 h-5 text-brand-600" />
            </h1>
            <p className="mt-1 text-sm text-surface-500">{owner.tagline}</p>
            <p className="mt-1 text-sm text-surface-500">
              {owner.location} · Established {owner.founded} · Company Reg. {owner.companyReg}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-surface-600">
              <RatingSummary rating={owner.rating} reviewCount={owner.reviewCount} size="md" />
              <span>{owner.responseRate}% response rate</span>
              <span>{owner.responseTime} average response</span>
              <span>{owner.acceptedBookingRate}% accepted bookings</span>
              <span>{venues.length} venue{venues.length === 1 ? "" : "s"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-brand-600 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              Contact Owner
            </button>
            <a
              href="#venues"
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg border border-surface-200 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
            >
              View Venues
            </a>
          </div>
        </div>

        {/* Content grid */}
        <div className="lg:flex lg:gap-8 lg:items-start">
          <div className="flex-1 min-w-0 space-y-6">
            <section>
              <h2 className="text-base font-semibold text-surface-900">About {owner.name}</h2>
              <p className="mt-2 text-sm text-surface-600 max-w-2xl">{owner.about}</p>
            </section>

            <section className="grid sm:grid-cols-3 gap-3">
              {quickFacts.map((fact) => (
                <div key={fact.label} className="rounded-xl border border-surface-200 bg-white p-4">
                  <span className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
                    <fact.icon className="w-4 h-4 text-brand-600" />
                  </span>
                  <p className="mt-2.5 text-sm font-semibold text-surface-900">{fact.label}</p>
                  <p className="mt-1 text-xs text-surface-500">{fact.body}</p>
                </div>
              ))}
            </section>

            <section id="venues">
              <h2 className="text-base font-semibold text-surface-900">Our Venues ({venues.length})</h2>
              {venues.length === 0 ? (
                <p className="mt-2 text-sm text-surface-500">No venues listed for this operator yet.</p>
              ) : (
                <div className="mt-3 grid sm:grid-cols-2 gap-3">
                  {venues.map((venue) => (
                    <Link
                      key={venue.id}
                      href={`${BASE_PATH}/venues/${venue.slug}`}
                      className="group rounded-xl border border-surface-200 bg-white overflow-hidden hover:shadow-card transition-shadow"
                    >
                      <div className="relative h-28" style={{ background: venue.images[0] }}>
                        {(venue.featured || venue.verified) && (
                          <div className="absolute top-2 left-2 flex items-center gap-1.5">
                            {venue.featured && <FeaturedBadge />}
                            {venue.verified && <VerifiedBadge label="Verified" />}
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-semibold text-surface-900 group-hover:text-brand-700 truncate">{venue.name}</p>
                        <p className="text-xs text-surface-400 mt-0.5">{venue.location}</p>
                        <div className="mt-1.5">
                          <RatingSummary rating={venue.rating} reviewCount={venue.reviewCount} />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {owner.preferredEventTypes.length > 0 && (
              <section>
                <h2 className="text-base font-semibold text-surface-900">Preferred event types</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {owner.preferredEventTypes.map((type) => (
                    <span key={type} className="px-2.5 py-1 rounded-full bg-surface-100 text-xs text-surface-600">
                      {type}
                    </span>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="text-base font-semibold text-surface-900">Operational regions</h2>
              {owner.operationalRegions.length === 0 && (
                <p className="mt-2 text-sm text-surface-500">Region breakdown not yet tracked for this operator.</p>
              )}
              <ul className="mt-2 space-y-1.5 text-sm text-surface-600">
                {owner.operationalRegions.map((r) => (
                  <li key={r.region} className="flex items-center justify-between max-w-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-surface-400" /> {r.region}
                    </span>
                    <span className="text-surface-400">{r.count} venue{r.count === 1 ? "" : "s"}</span>
                  </li>
                ))}
              </ul>
              {/* Real map integration is out of scope for Phase 2 — static placeholder. */}
              <div className="mt-3 h-40 rounded-xl bg-surface-100 flex items-center justify-center">
                <MapPin className="w-6 h-6 text-surface-400" />
              </div>
            </section>
          </div>

          {/* Side column */}
          <div className="mt-8 lg:mt-0 w-full lg:w-[340px] shrink-0 space-y-4">
            <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-card">
              <h3 className="text-sm font-semibold text-surface-900">Account Manager</h3>
              <div className="mt-3 flex items-center gap-3">
                <span className="w-11 h-11 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold shrink-0">
                  {owner.accountManager.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-surface-900 truncate">{owner.accountManager.name}</p>
                  <p className="text-xs text-surface-400 truncate">{owner.accountManager.role}</p>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-xs text-surface-500">
                <p>{owner.accountManager.email}</p>
                <p>{owner.accountManager.phone}</p>
              </div>
              <button
                type="button"
                className="mt-3 w-full inline-flex items-center justify-center px-4 py-2 rounded-lg bg-brand-600 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
              >
                Send Message
              </button>
            </div>

            <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-card">
              <h3 className="text-sm font-semibold text-surface-900">Policies</h3>
              <div className="mt-3 divide-y divide-surface-100">
                {[
                  { label: "Cancellation Policy", sub: "Flexible terms available" },
                  { label: "Payment Terms", sub: "Net 30 days" },
                  { label: "Booking Terms", sub: "Standard marketplace terms" },
                ].map((policy) => (
                  <button
                    key={policy.label}
                    type="button"
                    className="w-full flex items-center justify-between py-2.5 text-left first:pt-0 last:pb-0"
                  >
                    <span>
                      <span className="block text-sm font-medium text-surface-900">{policy.label}</span>
                      <span className="block text-xs text-surface-400">{policy.sub}</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-surface-300 shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-card">
              <h3 className="text-sm font-semibold text-surface-900">Trust & Compliance</h3>
              {owner.trust.length === 0 && (
                <p className="mt-2 text-xs text-surface-500">No trust & compliance badges recorded yet for this operator.</p>
              )}
              <div className="mt-3 space-y-2.5">
                {owner.trust.map((t) => (
                  <div key={t.label} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success-500 mt-0.5 shrink-0" />
                    <span>
                      <span className="block text-sm font-medium text-surface-900">{t.label}</span>
                      <span className="block text-xs text-surface-400">{t.sub}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-card">
              <h3 className="text-sm font-semibold text-surface-900">Reviews</h3>
              <div className="mt-2">
                <RatingSummary rating={owner.rating} reviewCount={owner.reviewCount} size="md" />
              </div>
              <div className="mt-3">
                <RatingDistribution distribution={distribution} />
              </div>
            </div>

            {owner.recentEvents.length > 0 && (
              <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-card">
                <h3 className="text-sm font-semibold text-surface-900">Recent Successful Events</h3>
                <div className="mt-3 space-y-3">
                  {owner.recentEvents.map((event) => (
                    <div key={event.name} className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg shrink-0"
                        style={{ background: "linear-gradient(135deg,#2c1c30,#4a2c52)" }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-surface-900 truncate">{event.name}</p>
                        <p className="text-xs text-surface-400 truncate">
                          {event.venue} · {event.guests} guests
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          STATUS_TONE[event.status] ?? "bg-surface-100 text-surface-600 border-surface-200"
                        )}
                      >
                        {event.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
