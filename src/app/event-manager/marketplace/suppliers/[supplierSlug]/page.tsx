import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  Layout,
  Sliders,
  Flower2,
  Sun,
  CheckCircle2,
  MessageSquare,
  Video,
  Music,
  Sparkles,
  ShieldCheck,
  Clock,
  Heart,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import { getListingsForWorkspaceSlug, toSupplierCard } from "@/lib/marketplace/queries";
import { VerifiedBadge, TopRatedBadge, PreferredBadge } from "@/components/marketplace/badges";
import { RatingSummary, RatingBreakdownBars } from "@/components/marketplace/RatingSummary";
import { cn } from "@/lib/utils";

// Live Supabase-backed data (Phase 4) — cannot be statically generated at build time.
export const dynamic = "force-dynamic";

// Loose icon-name -> lucide mapping from the servicesOffered fixture field. Unknown keys fall
// back to Sparkles rather than throwing, since the fixture strings aren't a closed enum.
const SERVICE_ICON_MAP: Record<string, LucideIcon> = {
  layout: Layout,
  sliders: Sliders,
  flower: Flower2,
  sun: Sun,
  "check-circle": CheckCircle2,
  "message-square": MessageSquare,
  video: Video,
  music: Music,
};

function serviceIcon(key: string): LucideIcon {
  return SERVICE_ICON_MAP[key] ?? Sparkles;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white px-4 py-3">
      <p className="text-lg font-semibold text-surface-900">{value}</p>
      <p className="text-xs text-surface-500 mt-0.5">{label}</p>
    </div>
  );
}

export default async function SupplierProfilePage({
  params,
}: {
  params: Promise<{ supplierSlug: string }>;
}) {
  const { supplierSlug } = await params;
  const result = await getListingsForWorkspaceSlug(supplierSlug);
  if (!result || result.listings.length === 0) notFound();
  // A workspace can own multiple live listings, but current seed data has one listing per
  // supplier workspace, so the first (flagship) listing is the company profile's data source.
  // Future phase: once the "Services & Listings" tab needs to render every real listing, swap
  // this for a list over `result.listings` instead of just the primary one.
  const primaryListing = result.listings[0];
  const supplier = toSupplierCard(primaryListing, result.workspace.name, result.workspace.slug ?? result.workspace.id);

  return (
    <div className="px-6 py-6 max-w-[1200px] mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs mb-4">
        <Link href="/event-manager/marketplace" className="text-surface-400 hover:text-surface-700">
          Marketplace
        </Link>
        <span className="text-surface-300">/</span>
        <Link href="/event-manager/marketplace" className="text-surface-400 hover:text-surface-700">
          Suppliers
        </Link>
        <span className="text-surface-300">/</span>
        <span className="text-surface-700 font-medium">{supplier.name}</span>
      </nav>

      {/* Hero */}
      <div
        className="relative h-[280px] sm:h-[320px] rounded-2xl overflow-hidden"
        style={{ background: supplier.coverImage }}
      >
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <VerifiedBadge label="Verified Supplier" />
          {supplier.topRated && <TopRatedBadge />}
        </div>
        <div className="absolute -bottom-10 left-6 w-24 h-24 rounded-xl border-4 border-white bg-surface-900 text-white flex items-center justify-center shadow-md">
          <span className="text-[10px] font-semibold text-center leading-tight px-1">
            {supplier.logoInitial}
          </span>
        </div>
      </div>

      {/* Header */}
      <div className="mt-14 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-surface-900 tracking-tight">{supplier.name}</h1>
            {supplier.verified && <BadgeCheck className="w-5 h-5 text-brand-600" aria-label="Verified" />}
          </div>
          <p className="mt-1 text-sm text-surface-500">{supplier.category}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-surface-500">
            <MapPin className="w-3.5 h-3.5" />
            {supplier.location} · Founded {supplier.founded} · {supplier.yearsOnPlatform}+ years on Gala Dock
          </p>
        </div>
      </div>

      {/* Stat strip */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="font-medium text-surface-900">{supplier.responseRate}% response rate</span>
        <RatingSummary rating={supplier.rating} reviewCount={supplier.reviewCount} size="md" />
        <span className="text-surface-500">Lead time: {supplier.leadTime}</span>
        <span className="text-surface-500">{supplier.eventsDelivered}+ events delivered</span>
      </div>

      {/* Badges row */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {supplier.preferred && <PreferredBadge />}
        <span className="inline-flex items-center rounded-full bg-surface-100 px-2.5 py-1 text-[11px] font-medium text-surface-600">
          {supplier.yearsOnPlatform}+ Years on Gala Dock
        </span>
      </div>

      {/* Tabs (visual, stacked sections) */}
      <div className="mt-6 border-b border-surface-200">
        <div className="flex flex-wrap gap-1 overflow-x-auto">
          {[
            "Overview",
            `Services & Listings`,
            `Reviews (${supplier.reviewCount})`,
            "Portfolio",
            "Team",
            "Certifications",
            "Coverage",
            "Policies",
            "Availability",
          ].map((tab, i) => (
            <span
              key={tab}
              className={cn(
                "px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px",
                i === 0
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-surface-500"
              )}
            >
              {tab}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6 lg:grid lg:grid-cols-[1fr_320px] lg:gap-6 lg:items-start">
        {/* Main content */}
        <div className="space-y-8 min-w-0">
          {/* Overview */}
          <section>
            <h2 className="text-base font-semibold text-surface-900 mb-3">About {supplier.name}</h2>
            <p className="text-sm text-surface-600 leading-relaxed">{supplier.description}</p>
            <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-2">
              {supplier.aboutBullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2 text-sm text-surface-700">
                  <CheckCircle2 className="w-4 h-4 text-success-500 mt-0.5 shrink-0" />
                  {bullet}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-surface-900 mb-3">Services offered</h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              {supplier.servicesOffered.map((service) => {
                const Icon = serviceIcon(service.icon);
                return (
                  <div
                    key={service.label}
                    className="flex items-center gap-2.5 rounded-xl border border-surface-200 bg-white px-3.5 py-3"
                  >
                    <Icon className="w-4 h-4 text-brand-600 shrink-0" />
                    <span className="text-sm text-surface-700">{service.label}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-surface-900 mb-3">Event types served</h2>
            <div className="flex flex-wrap gap-2">
              {supplier.eventTypes.map((type) => (
                <span
                  key={type}
                  className="inline-flex items-center rounded-full bg-surface-100 px-3 py-1 text-xs font-medium text-surface-600"
                >
                  {type}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-surface-900 mb-3">Portfolio highlights</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {supplier.portfolio.map((gradient, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-xl"
                  style={{ background: gradient }}
                  aria-label={`Portfolio image ${i + 1}`}
                />
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-surface-900 mb-3">Coverage</h2>
            <div className="rounded-xl border border-surface-200 bg-white p-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-surface-500">Primary</span>
                <span className="font-medium text-surface-900">{supplier.serviceAreaNote.primary}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-surface-500">Secondary</span>
                <span className="font-medium text-surface-900">{supplier.serviceAreaNote.secondary}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-surface-500">Global</span>
                <span className="font-medium text-surface-900">{supplier.serviceAreaNote.global}</span>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-surface-900 mb-3">Certifications &amp; compliance</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {supplier.certifications.map((cert) => (
                <div
                  key={cert.label}
                  className="flex items-start gap-3 rounded-xl border border-surface-200 bg-white p-4"
                >
                  <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4.5 h-4.5 text-brand-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-surface-900">{cert.label}</p>
                    <p className="text-xs text-surface-500 mt-0.5">{cert.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-surface-900 mb-3">Response performance</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile label="Response rate" value={`${supplier.responseRate}%`} />
              <StatTile label="Typical lead time" value={supplier.leadTime} />
              <StatTile label="Support availability" value="24/7" />
              <StatTile label="On-time delivery" value="95%" />
            </div>
          </section>
        </div>

        {/* Right rail */}
        <aside className="mt-8 lg:mt-0 lg:sticky lg:top-6 space-y-4">
          <div className="rounded-xl border border-surface-200 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2">
              <VerifiedBadge label="Verified" solid={false} />
              {supplier.topRated && <TopRatedBadge solid={false} />}
            </div>
            <Link
              href={`/event-manager/marketplace/services/${supplier.serviceSlug}/request-quote`}
              className="flex items-center justify-center w-full px-4 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors"
            >
              Request Quote
            </Link>
            <button
              type="button"
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg border border-surface-200 text-surface-700 text-sm font-medium hover:border-surface-300 transition-colors"
            >
              <Heart className="w-4 h-4" />
              Save Supplier
            </button>
            <Link
              href="/event-manager/inbox"
              className="flex items-center justify-center w-full px-4 py-2.5 rounded-lg border border-surface-200 text-surface-700 text-sm font-medium hover:border-surface-300 transition-colors"
            >
              Contact Supplier
            </Link>
          </div>

          <div className="rounded-xl border border-surface-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Supplier score</h3>
            <RatingBreakdownBars items={supplier.ratingBreakdown} />
          </div>

          <div className="rounded-xl border border-surface-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-surface-900">Recent client reviews</h3>
              <Link href="#" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                View all
              </Link>
            </div>
            {supplier.reviews.length === 0 ? (
              <p className="text-xs text-surface-400">No reviews yet.</p>
            ) : (
              <ul className="space-y-3">
                {supplier.reviews.map((review, i) => (
                  <li key={i} className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-surface-900">{review.author}</span>
                      <span className="inline-flex items-center gap-1 text-xs text-warning-600">
                        <Sparkles className="w-3 h-3" />
                        {review.rating.toFixed(1)}
                      </span>
                    </div>
                    <p className="text-xs text-surface-500">{review.company}</p>
                    <p className="mt-1 text-xs text-surface-600 leading-relaxed">{review.text}</p>
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-surface-400">
                      <Clock className="w-3 h-3" />
                      {review.when}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
