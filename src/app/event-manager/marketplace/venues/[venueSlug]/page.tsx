import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CheckCircle2,
  Wifi,
  ParkingCircle,
  UtensilsCrossed,
  MonitorPlay,
  BedDouble,
  Shirt,
  Wind,
  Lightbulb,
  Accessibility,
  ArrowUpDown,
  MapPin,
  FileText,
  Grid3x3,
  Map as MapIcon,
  Users,
  UserSquare2,
} from "lucide-react";
import { getVenueListingBySlug, toVenueCard } from "@/lib/marketplace/queries";
import { formatMoneyFromCents } from "@/lib/marketplace/format";
import { VerifiedBadge } from "@/components/marketplace/badges";
import { FavouriteButton } from "@/components/marketplace/ShortlistCompareButtons";
import { Copy } from "lucide-react";
import { VenueEnquiryForm } from "./VenueEnquiryForm";

const BASE_PATH = "/event-manager/marketplace";

// Local amenity → icon mapping. Any amenity string not covered here falls back to a generic
// CheckCircle2 tick so new fixture amenities never render blank.
const AMENITY_ICONS: Record<string, typeof Wifi> = {
  "Wi-Fi": Wifi,
  "Parking": ParkingCircle,
  "Catering": UtensilsCrossed,
  "AV": MonitorPlay,
  "In-house AV": MonitorPlay,
  "Accommodation": BedDouble,
  "Cloakroom": Shirt,
  "Air conditioning": Wind,
  "Stage & lighting": Lightbulb,
  "Disabled access": Accessibility,
  "Lift access": ArrowUpDown,
};

function AmenityIcon({ label }: { label: string }) {
  const Icon = AMENITY_ICONS[label] ?? CheckCircle2;
  return <Icon className="w-4 h-4 text-brand-600" />;
}

export default async function VenueProfilePage({
  params,
}: {
  params: Promise<{ venueSlug: string }>;
}) {
  const { venueSlug } = await params;
  const result = await getVenueListingBySlug(venueSlug);
  if (!result) notFound();
  const venue = toVenueCard(result.row, result.workspaceId);

  // Owner identity comes straight from the query result (real workspace row), not a fixture
  // lookup — result.workspaceSlug already matches workspaces.slug used by the venue-owners route.
  const ownerName = result.workspaceName;
  const ownerSlug = result.workspaceSlug;
  const galleryTiles = venue.images.slice(1, 4);

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-6 pt-4">
        <nav className="text-xs text-surface-400">
          <Link href={BASE_PATH} className="hover:text-brand-600">
            Marketplace
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-surface-600">{venue.name}</span>
        </nav>
      </div>

      <div className="px-6 py-4 lg:flex lg:gap-8 lg:items-start">
        <div className="flex-1 min-w-0 space-y-6">
          {/* Media block */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div
              className="relative md:col-span-2 h-64 md:h-[360px] rounded-2xl overflow-hidden"
              style={{ background: venue.images[0] }}
            >
              <div className="absolute top-3 left-3">
                <VerifiedBadge label="Verified venue" />
              </div>
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <FavouriteButton variant="icon-dark" />
                <button
                  type="button"
                  aria-label="Copy venue link"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow-sm backdrop-blur-sm transition-colors"
                >
                  <Copy className="w-4 h-4 text-surface-500" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
              {galleryTiles.length > 0 ? (
                galleryTiles.map((img, i) => (
                  <div
                    key={i}
                    className="h-[110px] md:h-[110px] rounded-xl"
                    style={{ background: img }}
                  />
                ))
              ) : (
                <div className="h-[110px] rounded-xl bg-surface-100 flex items-center justify-center text-xs text-surface-400">
                  No further photos
                </div>
              )}
            </div>
          </div>

          {/* Header row */}
          <div id="overview">
            <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 border border-brand-200">
              VERIFIED VENUE
            </span>
            <div className="mt-2 flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-surface-900 tracking-tight">{venue.name}</h1>
            </div>
            <p className="mt-1 text-sm text-surface-500">
              {venue.type} · {venue.location} ·{" "}
              <span className="text-surface-700 font-medium">★ {venue.rating.toFixed(1)}</span> ({venue.reviewCount}){" "}
              <a href="#reviews" className="text-brand-600 hover:underline">
                View reviews
              </a>
            </p>
            <p className="mt-3 text-sm text-surface-600 max-w-2xl">{venue.description}</p>

            {ownerSlug && (
              <p className="mt-3 text-xs text-surface-500">
                Operated by{" "}
                <Link href={`${BASE_PATH}/venue-owners/${ownerSlug}`} className="text-brand-600 font-medium hover:underline">
                  {ownerName}
                </Link>
              </p>
            )}
          </div>

          {/* Stat strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl border border-surface-200 bg-white p-4 shadow-card">
            <div>
              <p className="text-xs text-surface-400">Minimum spend</p>
              <p className="mt-0.5 text-sm font-semibold text-surface-900">{formatMoneyFromCents(venue.priceFromCents)}</p>
            </div>
            <div>
              <p className="text-xs text-surface-400">Guests</p>
              <p className="mt-0.5 text-sm font-semibold text-surface-900">
                {venue.seatedCapacity}–{venue.standingCapacity}
              </p>
            </div>
            <div>
              <p className="text-xs text-surface-400">Earliest date</p>
              <p className="mt-0.5 text-sm font-semibold text-surface-900">{venue.availabilityDate ?? "Contact venue"}</p>
            </div>
            <div>
              <p className="text-xs text-surface-400">Response</p>
              <p className="mt-0.5 text-sm font-semibold text-surface-900">Typically replies within {venue.responseTime}</p>
            </div>
          </div>

          {/* Overview highlights */}
          <div className="flex flex-wrap gap-2">
            {venue.highlights.map((h) => (
              <span
                key={h}
                className="inline-flex items-center gap-1.5 rounded-full border border-surface-200 bg-white px-3 py-1.5 text-xs text-surface-600"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-success-500" />
                {h}
              </span>
            ))}
          </div>

          {/* Spaces & capacities */}
          <section id="spaces">
            <h2 className="text-base font-semibold text-surface-900">Spaces & capacities</h2>
            <div className="mt-3 overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-100 text-left text-xs text-surface-400">
                    <th className="px-4 py-3 font-medium">Space</th>
                    <th className="px-4 py-3 font-medium">Seated</th>
                    <th className="px-4 py-3 font-medium">Standing</th>
                    <th className="px-4 py-3 font-medium">From</th>
                  </tr>
                </thead>
                <tbody>
                  {venue.spaces.map((space) => (
                    <tr key={space.name} className="border-b border-surface-50 last:border-0">
                      <td className="px-4 py-3 font-medium text-surface-900">{space.name}</td>
                      <td className="px-4 py-3 text-surface-600">
                        <span className="inline-flex items-center gap-1">
                          <UserSquare2 className="w-3.5 h-3.5 text-surface-400" /> {space.seated}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-surface-600">
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-surface-400" /> {space.standing}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-surface-900">{formatMoneyFromCents(space.priceFromCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Amenities */}
          <section id="amenities">
            <h2 className="text-base font-semibold text-surface-900">Amenities</h2>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {venue.amenities.map((a) => (
                <div
                  key={a}
                  className="flex items-center gap-2 rounded-xl border border-surface-200 bg-white px-3 py-2.5 text-sm text-surface-700"
                >
                  <span className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                    <AmenityIcon label={a} />
                  </span>
                  {a}
                </div>
              ))}
            </div>
          </section>

          {/* Catering & bar */}
          <section id="catering">
            <h2 className="text-base font-semibold text-surface-900">Catering & bar</h2>
            <p className="mt-2 text-sm text-surface-600 max-w-2xl">
              {venue.amenities.includes("Catering")
                ? "In-house catering and bar service is available for this venue — the events team can tailor menus and drinks packages to your event brief."
                : "This venue does not provide in-house catering. Approved external caterers can be arranged — ask the venue team for their supplier list."}
            </p>
          </section>

          {/* Accessibility */}
          <section id="accessibility">
            <h2 className="text-base font-semibold text-surface-900">Accessibility</h2>
            {venue.accessible ? (
              <div className="mt-3 rounded-xl border border-success-200 bg-success-50 p-4">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-success-700">
                  <Accessibility className="w-4 h-4" /> Fully accessible
                </p>
                <ul className="mt-2 space-y-1 text-sm text-success-700 list-disc list-inside">
                  <li>Step-free access throughout public event spaces</li>
                  <li>Accessible toilets available on site</li>
                  <li>Induction hearing loop fitted in main event spaces</li>
                </ul>
              </div>
            ) : (
              <p className="mt-2 text-sm text-surface-500">Contact the venue team to confirm accessibility arrangements for your event.</p>
            )}
          </section>

          {/* House rules */}
          <section id="house-rules">
            <h2 className="text-base font-semibold text-surface-900">House rules</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-surface-600 list-disc list-inside">
              <li>All events must end by the time agreed in the venue hire contract</li>
              <li>External suppliers require prior sign-off from the venue events team</li>
              <li>Full public liability insurance is required for all bookings</li>
            </ul>
          </section>

          {/* Transport & parking */}
          <section id="transport">
            <h2 className="text-base font-semibold text-surface-900">Transport & parking</h2>
            <p className="mt-2 text-sm text-surface-600 max-w-2xl">
              {venue.address}. {venue.amenities.includes("Parking") ? "On-site parking is available for guests and suppliers." : "No on-site parking — nearby public car parks and strong transport links are available."}
            </p>
          </section>

          {/* Floor plans / seating layouts / site maps */}
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { id: "floor-plans", label: "View Floor Plans", icon: Grid3x3, sub: "Floor plans" },
              { id: "seating-layouts", label: "Open Seating Planner", icon: Users, sub: "Seating layouts" },
              { id: "site-maps", label: "View Site Map", icon: MapIcon, sub: "Site maps" },
            ].map((tile) => (
              <section key={tile.id} id={tile.id}>
                <h2 className="text-base font-semibold text-surface-900">{tile.sub}</h2>
                <div className="mt-3 rounded-xl border border-dashed border-surface-300 bg-surface-50 h-32 flex flex-col items-center justify-center gap-2">
                  <tile.icon className="w-5 h-5 text-surface-400" />
                  {/* Seating planner / floor plan / site map records are not modelled yet — wired
                      once the real detail record lands (Phase 5/6). */}
                  <Link href="#" className="text-xs font-medium text-brand-600 hover:underline">
                    {tile.label}
                  </Link>
                </div>
              </section>
            ))}
          </div>

          {/* Hosted events */}
          {venue.hostedEvents.length > 0 && (
            <section id="hosted-events">
              <h2 className="text-base font-semibold text-surface-900">Hosted events</h2>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {venue.hostedEvents.map((img, i) => (
                  <div key={i} className="h-28 rounded-xl" style={{ background: img }} />
                ))}
              </div>
            </section>
          )}

          {/* Reviews */}
          <section id="reviews">
            <h2 className="text-base font-semibold text-surface-900">Reviews</h2>
            <p className="mt-2 text-sm text-surface-600">
              ★ {venue.rating.toFixed(1)} average from {venue.reviewCount} reviews.
            </p>
          </section>

          {/* Documents */}
          <section id="documents">
            <h2 className="text-base font-semibold text-surface-900">Documents</h2>
            <div className="mt-3 divide-y divide-surface-100 rounded-2xl border border-surface-200 bg-white shadow-card">
              {venue.documents.map((doc) => (
                <div key={doc.label} className="flex items-center justify-between px-4 py-3">
                  <span className="inline-flex items-center gap-2 text-sm text-surface-700">
                    <FileText className="w-4 h-4 text-surface-400" />
                    {doc.label}
                    <span className="text-xs text-surface-400">{doc.size}</span>
                  </span>
                  <Link href="#" className="text-xs font-medium text-brand-600 hover:underline">
                    View
                  </Link>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right rail */}
        <div className="mt-8 lg:mt-0 w-full lg:w-[340px] shrink-0 space-y-4 lg:sticky lg:top-6 self-start">
          <VenueEnquiryForm listingId={result.row.id} venueName={venue.name} responseTime={venue.responseTime} />

          <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-card">
            <h3 className="text-sm font-semibold text-surface-900">Documents & policies</h3>
            <div className="mt-3 space-y-2">
              {venue.documents.map((doc) => (
                <div key={doc.label} className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 text-surface-600">
                    <FileText className="w-3.5 h-3.5 text-surface-400" />
                    {doc.label}
                  </span>
                  <Link href="#" className="text-brand-600 hover:underline font-medium">
                    View
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-card">
            <h3 className="text-sm font-semibold text-surface-900">Location</h3>
            {/* Real map integration is out of scope for Phase 2 — this is a static placeholder. */}
            <div className="mt-3 h-40 rounded-xl bg-surface-100 flex items-center justify-center">
              <MapPin className="w-6 h-6 text-surface-400" />
            </div>
            <p className="mt-2 text-xs text-surface-500">{venue.address}</p>
            <Link href="#" className="mt-1 inline-block text-xs font-medium text-brand-600 hover:underline">
              Get directions
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
