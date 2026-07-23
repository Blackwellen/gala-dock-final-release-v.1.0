import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  MapPin,
  PlayCircle,
  Heart,
  Check,
  ShieldCheck,
  Clock,
  Zap,
  ExternalLink,
} from "lucide-react";
import { getListingByServiceSlug, toSupplierCard } from "@/lib/marketplace/queries";
import { ComplianceBadge } from "@/components/marketplace/badges";
import { RatingSummary } from "@/components/marketplace/RatingSummary";
import { formatMoneyFromCents } from "@/lib/marketplace/format";
import { cn } from "@/lib/utils";

// Live Supabase-backed data (Phase 4) — cannot be statically generated at build time.
export const dynamic = "force-dynamic";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white px-4 py-3">
      <p className="text-lg font-semibold text-surface-900">{value}</p>
      <p className="text-xs text-surface-500 mt-0.5">{label}</p>
    </div>
  );
}

export default async function ServiceProfilePage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const result = await getListingByServiceSlug(serviceSlug);
  if (!result) notFound();
  const supplier = toSupplierCard(result.row, result.workspaceName, result.workspaceSlug ?? result.workspaceId);

  return (
    <div className="px-6 py-6 max-w-[1200px] mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs mb-2">
        <Link href="/event-manager/marketplace" className="text-surface-400 hover:text-surface-700">
          Marketplace
        </Link>
        <span className="text-surface-300">/</span>
        <Link
          href={`/event-manager/marketplace/suppliers/${supplier.slug}`}
          className="text-surface-400 hover:text-surface-700"
        >
          {supplier.name}
        </Link>
        <span className="text-surface-300">/</span>
        <span className="text-surface-700 font-medium">{supplier.serviceName}</span>
      </nav>

      <Link
        href="/event-manager/marketplace"
        className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-surface-700 mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to marketplace
      </Link>

      {/* Hero */}
      <div
        className="relative h-[260px] rounded-2xl overflow-hidden"
        style={{ background: supplier.coverImage }}
      >
        <span className="absolute top-4 left-6 inline-flex items-center rounded-full bg-black/40 backdrop-blur-sm px-3 py-1 text-[11px] font-semibold tracking-wide text-white uppercase">
          {supplier.category}
        </span>
        <div className="absolute -bottom-10 left-6 relative">
          <div className="w-24 h-24 rounded-xl border-4 border-white bg-surface-900 text-white flex items-center justify-center shadow-md">
            <span className="text-[10px] font-semibold text-center leading-tight px-1">
              {supplier.logoInitial}
            </span>
          </div>
          {supplier.verified && (
            <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-sm">
              <BadgeCheck className="w-4 h-4 text-brand-600" />
            </span>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="mt-14 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-surface-900 tracking-tight">{supplier.serviceName}</h1>
            <button
              type="button"
              aria-label="Add to favourites"
              className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-surface-200 hover:border-surface-300 shrink-0"
            >
              <Heart className="w-4 h-4 text-surface-500" />
            </button>
          </div>
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-surface-500">
            by{" "}
            <Link
              href={`/event-manager/marketplace/suppliers/${supplier.slug}`}
              className="font-medium text-brand-600 hover:text-brand-700"
            >
              {supplier.name}
            </Link>
            <span className="text-surface-300">·</span>
            <MapPin className="w-3.5 h-3.5" />
            {supplier.coverage}
            <span className="text-surface-300">·</span>
            {supplier.yearsOnPlatform}+ years on Gala Dock
          </p>
        </div>
      </div>

      {/* Stat strip */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <RatingSummary rating={supplier.rating} reviewCount={supplier.reviewCount} size="md" />
        <span className="text-surface-500">{supplier.responseRate}% response rate</span>
        <span className="text-surface-500">Lead time: {supplier.leadTime}</span>
        <ComplianceBadge grade={supplier.complianceGrade} />
      </div>

      {/* Tabs (visual, stacked sections) */}
      <div className="mt-6 border-b border-surface-200">
        <div className="flex flex-wrap gap-1 overflow-x-auto">
          {["Overview", "Packages", "What's Included", "Add-ons", "Availability", "Reviews", "Portfolio", "FAQs"].map(
            (tab, i) => (
              <span
                key={tab}
                className={cn(
                  "px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px",
                  i === 0 ? "border-brand-600 text-brand-700" : "border-transparent text-surface-500"
                )}
              >
                {tab}
              </span>
            )
          )}
        </div>
      </div>

      <div className="mt-6 lg:grid lg:grid-cols-[1fr_320px] lg:gap-6 lg:items-start">
        {/* Main content */}
        <div className="space-y-8 min-w-0">
          <section>
            <h2 className="text-base font-semibold text-surface-900 mb-3">Overview</h2>
            <p className="text-sm text-surface-600 leading-relaxed">{supplier.description}</p>

            <div className="mt-4 grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              {supplier.eventTypes.map((type) => (
                <div
                  key={type}
                  className="flex items-center gap-2.5 rounded-xl border border-surface-200 bg-white px-3.5 py-3"
                >
                  <Zap className="w-4 h-4 text-brand-600 shrink-0" />
                  <span className="text-sm text-surface-700">{type}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile label="Events delivered" value={`${supplier.eventsDelivered}+`} />
              <StatTile label="Client satisfaction" value={`${supplier.responseRate}%`} />
              <StatTile label="Coverage" value={supplier.coverage} />
              <StatTile label="Technical support" value="24/7" />
            </div>

            <div className="mt-4 rounded-xl bg-surface-100 p-8 flex flex-col items-center justify-center text-center">
              <MapPin className="w-6 h-6 text-surface-400 mb-2" />
              <p className="text-sm font-medium text-surface-700">Service area</p>
              <p className="mt-1 text-xs text-surface-500 max-w-sm">{supplier.serviceAreaNote.primary} (primary) · {supplier.serviceAreaNote.secondary} (secondary) · {supplier.serviceAreaNote.global} (global)</p>
            </div>

            <div className="mt-4 rounded-xl bg-surface-900 p-8 flex flex-col items-center justify-center text-center">
              <PlayCircle className="w-9 h-9 text-white/80 mb-2" />
              <p className="text-sm font-medium text-white">Watch our showreel</p>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-surface-900 mb-3">Package tiers</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {supplier.packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className={cn(
                    "relative rounded-xl border bg-white p-5 flex flex-col",
                    pkg.popular ? "border-brand-300 ring-2 ring-brand-500" : "border-surface-200"
                  )}
                >
                  {pkg.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
                      Most popular
                    </span>
                  )}
                  <p className="text-sm font-semibold text-surface-900">{pkg.tier}</p>
                  <p className="mt-1 text-xl font-semibold text-surface-900">
                    {formatMoneyFromCents(pkg.priceFromCents)}
                  </p>
                  <p className="text-xs text-surface-500 mb-4">{pkg.unit}</p>
                  <ul className="space-y-2 flex-1">
                    {pkg.includes.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-surface-700">
                        <Check className="w-4 h-4 text-success-500 mt-0.5 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className={cn(
                      "mt-4 w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                      pkg.popular
                        ? "bg-brand-600 text-white hover:bg-brand-700"
                        : "border border-surface-200 text-surface-700 hover:border-surface-300"
                    )}
                  >
                    Select package
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-surface-900 mb-3">What&apos;s included</h2>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
              {supplier.included.map((item) => (
                <div key={item} className="flex items-start gap-2 text-sm text-surface-700">
                  <Check className="w-4 h-4 text-success-500 mt-0.5 shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-surface-900 mb-3">Compliance &amp; documents</h2>
            <div className="space-y-2">
              {supplier.certifications.map((cert) => (
                <div
                  key={cert.label}
                  className="flex items-center justify-between rounded-xl border border-surface-200 bg-white px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="w-4 h-4 text-brand-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-surface-900">{cert.label}</p>
                      <p className="text-xs text-surface-500">{cert.sub}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    View
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right rail */}
        <aside className="mt-8 lg:mt-0 lg:sticky lg:top-6 space-y-4">
          <div className="rounded-xl border border-surface-200 bg-white p-4 space-y-3">
            <h3 className="text-base font-semibold text-surface-900">Request a quote</h3>
            <p className="text-xs text-surface-500">Get pricing for your event</p>
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
              Add to shortlist
            </button>
            <Link
              href="/event-manager/inbox"
              className="flex items-center justify-center w-full px-4 py-2.5 rounded-lg border border-surface-200 text-surface-700 text-sm font-medium hover:border-surface-300 transition-colors"
            >
              Contact supplier
            </Link>
          </div>

          <div className="rounded-xl border border-surface-200 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2.5 text-sm text-surface-600">
              <Clock className="w-4 h-4 text-brand-600 shrink-0" />
              Typical response time: {supplier.responseTime}
            </div>
            <div className="flex items-center gap-2.5 text-sm text-surface-600">
              <BadgeCheck className="w-4 h-4 text-brand-600 shrink-0" />
              Verified supplier
            </div>
            <div className="flex items-center gap-2.5 text-sm text-surface-600">
              <ShieldCheck className="w-4 h-4 text-brand-600 shrink-0" />
              Secure payments — Payments processed on Gala Dock
            </div>
          </div>

          <div className="rounded-xl border border-surface-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-surface-900">Your event summary</h3>
              <span className="inline-flex items-center rounded-full bg-surface-100 px-2 py-0.5 text-[11px] font-medium text-surface-500">
                Not started
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-surface-500">Event date</span>
                <span className="text-surface-400">Not selected</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-surface-500">Guest count</span>
                <span className="text-surface-400">Not specified</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-surface-500">Venue</span>
                <span className="text-surface-400">Not selected</span>
              </div>
            </div>
            <button
              type="button"
              className="mt-4 w-full px-4 py-2 rounded-lg border border-surface-200 text-surface-700 text-sm font-medium hover:border-surface-300 transition-colors"
            >
              Edit event details
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
