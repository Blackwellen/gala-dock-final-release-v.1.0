// Phase 2 fixture-only checkout mockup — all totals are computed client-visible for display
// purposes only. Phase 7 (payments) MUST recompute every total server-side from the database and
// never trust a client-supplied amount; see AGENTS.md marketplace brief section 13.
//
// COPY NOTE: the original reference design uses the word "escrow" throughout ("Escrow Protected",
// "held securely in escrow"). That word is intentionally NOT used anywhere in this file's UI copy
// — the current backend only supports Stripe Connect destination charges, not regulated escrow,
// so using that word would misrepresent the product to paying customers. It has been replaced
// with "payment protection" / "held funds" / "milestone release" language instead.
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Lock,
  ShieldCheck,
  BadgeCheck,
  Landmark,
  CreditCard,
  Wallet,
  Info,
  CalendarDays,
  Users,
  MapPin,
  CheckCircle2,
  PenLine,
} from "lucide-react";
import { findVenueBySlug } from "@/lib/marketplace/fixtures";
import { formatMoneyFromCents } from "@/lib/marketplace/format";
import { VerifiedBadge } from "@/components/marketplace/badges";

export const dynamic = "force-static";

function SectionCard({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-surface-200 bg-white p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
            {step}
          </span>
          <h2 className="text-base font-semibold text-surface-900">{title}</h2>
        </div>
        <button
          type="button"
          className="text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          Edit
        </button>
      </div>
      {children}
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-surface-500">{label}</span>
      <span className="font-medium text-surface-900">{value}</span>
    </div>
  );
}

export default async function VenueCheckoutPage({
  params,
}: {
  params: Promise<{ venueSlug: string }>;
}) {
  const { venueSlug } = await params;
  const venue = findVenueBySlug(venueSlug);
  if (!venue) notFound();

  const primarySpace = venue.spaces[0];
  const secondarySpace = venue.spaces[1];
  const guestCount = Math.min(320, primarySpace?.seated ?? venue.seatedCapacity);

  // ---- Pricing maths (Phase 2 display-only — see file header comment) ----
  const venueHireCents = venue.priceFromCents;
  const setupBreakdownCents = Math.round(venueHireCents * 0.07); // ~7% of hire — setup & breakdown crew
  const totalBeforeFeesCents = venueHireCents + setupBreakdownCents;
  const bookingFeeCents = Math.round(totalBeforeFeesCents * 0.025); // Platform Booking Fee 2.5%
  const serviceFeeCents = Math.round(totalBeforeFeesCents * 0.01); // Service Fee 1.0%
  const vatBaseCents = totalBeforeFeesCents + bookingFeeCents + serviceFeeCents;
  const vatCents = Math.round(vatBaseCents * 0.2); // VAT 20%
  const grandTotalCents = vatBaseCents + vatCents;
  const depositCents = Math.round(grandTotalCents * 0.5); // 50% due now
  const balanceCents = grandTotalCents - depositCents;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1200px] mx-auto">
      <Link
        href={`/event-manager/marketplace/venues/${venue.slug}`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-surface-500 hover:text-surface-700"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Marketplace
      </Link>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-surface-900 tracking-tight">
            <Lock className="w-5 h-5 text-brand-600" />
            Secure your booking
          </h1>
          <p className="mt-1 text-sm text-surface-500">
            Complete your booking with payment protection and secure checkout.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-surface-500 sm:justify-end">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-success-500" /> Payment Protection
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-success-500" /> Secure Payments
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BadgeCheck className="w-3.5 h-3.5 text-success-500" /> Verified Venue
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-success-500" /> GDPR Compliant
          </span>
        </div>
      </div>

      {/* Payment protection banner */}
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-success-200 bg-success-50 p-4">
        <ShieldCheck className="w-5 h-5 text-success-600 shrink-0 mt-0.5" />
        <p className="text-sm text-success-800">
          <span className="font-semibold">Your payment is protected. </span>
          Your payment is held securely until your milestones are met. Funds are released to the
          venue only after each stage is confirmed.{" "}
          <Link href="#" className="font-medium underline underline-offset-2">
            Learn more
          </Link>
        </p>
      </div>

      <div className="mt-6 lg:grid lg:grid-cols-[1fr_360px] lg:gap-6 lg:items-start">
        {/* Main column */}
        <div className="space-y-5 min-w-0">
          <SectionCard step={1} title="Event Details">
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <div>
                <dt className="text-surface-500 flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" /> Date &amp; Time
                </dt>
                <dd className="mt-1 font-medium text-surface-900">
                  {venue.availabilityDate ?? "Sat, 24 Aug 2024"} · 6:00 PM – 11:30 PM
                </dd>
              </div>
              <div>
                <dt className="text-surface-500">Setup &amp; Breakdown</dt>
                <dd className="mt-1 font-medium text-surface-900">
                  Setup from 2:00 PM · Breakdown by 12:30 AM
                </dd>
              </div>
              <div>
                <dt className="text-surface-500 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Guest Count &amp; Layout
                </dt>
                <dd className="mt-1 font-medium text-surface-900">
                  {guestCount} guests · Banquet round tables
                </dd>
              </div>
              <div>
                <dt className="text-surface-500 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> Selected Spaces
                </dt>
                <dd className="mt-1 font-medium text-surface-900">
                  {primarySpace?.name}
                  {secondarySpace ? `, ${secondarySpace.name}` : ""}
                </dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard step={2} title="Enquiry &amp; Requirements">
            <div className="rounded-lg border border-surface-200 bg-surface-50 p-3.5 text-sm text-surface-600 leading-relaxed">
              Looking to host our annual leadership gala with a formal dinner, awards presentation
              and evening reception. We&apos;ll need staging for a short keynote and AV support for
              a 15-minute highlights reel.
            </div>
            <p className="mt-4 text-xs font-semibold text-surface-700 uppercase tracking-wide">
              Special Requirements
            </p>
            <ul className="mt-2 space-y-2">
              {[
                "In-house AV and stage lighting for keynote address",
                "Step-free access for all guests and suppliers",
                "Dedicated vendor load-in window before 2:00 PM",
                "Cloakroom staffed for full event duration",
              ].map((req) => (
                <li key={req} className="flex items-start gap-2 text-sm text-surface-700">
                  <CheckCircle2 className="w-4 h-4 text-success-500 mt-0.5 shrink-0" />
                  {req}
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard step={3} title="Terms &amp; Agreements">
            <div className="space-y-2.5">
              {[
                "Terms of Service",
                "Venue Hire Agreement",
                "Cancellation Policy",
                "Privacy Policy",
              ].map((term) => (
                <label key={term} className="flex items-center gap-2.5 text-sm text-surface-700">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                  />
                  I agree to the{" "}
                  <Link href="#" className="font-medium text-brand-600 hover:text-brand-700">
                    {term}
                  </Link>
                </label>
              ))}
            </div>
            <div className="mt-5 rounded-lg border border-surface-200 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-surface-700 uppercase tracking-wide">
                  Electronic signature
                </p>
                <button type="button" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                  Clear
                </button>
              </div>
              <p className="mt-3 font-serif italic text-2xl text-surface-900 flex items-center gap-2">
                <PenLine className="w-4 h-4 text-surface-300" />
                J. Alexandra Morgan
              </p>
            </div>
          </SectionCard>

          <SectionCard step={4} title="Payment Method">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Credit / Debit Card", icon: CreditCard, selected: true },
                { label: "Bank Transfer", icon: Landmark, selected: false },
                { label: "Digital Wallet", icon: Wallet, selected: false },
                { label: "PayPal", icon: Wallet, selected: false },
              ].map((method) => (
                <div
                  key={method.label}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center ${
                    method.selected
                      ? "border-brand-500 ring-2 ring-brand-500 bg-brand-50/50"
                      : "border-surface-200"
                  }`}
                >
                  <method.icon
                    className={`w-5 h-5 ${method.selected ? "text-brand-600" : "text-surface-400"}`}
                  />
                  <span className="text-xs font-medium text-surface-700">{method.label}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-surface-600">Card Number</label>
                <input
                  disabled
                  placeholder="4242 4242 4242 4242"
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5 text-sm text-surface-400 placeholder:text-surface-300"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-600">Name on Card</label>
                <input
                  disabled
                  placeholder="J. Alexandra Morgan"
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5 text-sm text-surface-400 placeholder:text-surface-300"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-600">Expiry Date</label>
                <input
                  disabled
                  placeholder="MM / YY"
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5 text-sm text-surface-400 placeholder:text-surface-300"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-600">CVC</label>
                <input
                  disabled
                  placeholder="123"
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5 text-sm text-surface-400 placeholder:text-surface-300"
                />
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Right rail — order summary */}
        <aside className="mt-6 lg:mt-0 lg:sticky lg:top-6 space-y-4">
          <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
            <div className="h-28 relative" style={{ background: venue.images[0] }}>
              <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                <VerifiedBadge label="Verified" />
                {venue.featured && (
                  <span className="inline-flex items-center rounded-full bg-success-500 px-2.5 py-1 text-[10px] font-semibold text-white">
                    FEATURED
                  </span>
                )}
              </div>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-surface-900">{venue.name}</h3>
                <p className="text-xs text-surface-500">{venue.location}</p>
                <p className="mt-1 text-xs text-surface-500">
                  ★ {venue.rating.toFixed(1)} ({venue.reviewCount}) · {venue.hostedEvents.length * 40 || 120}+
                  events hosted
                </p>
              </div>

              <div className="space-y-2 border-t border-surface-100 pt-3">
                <SummaryRow label="Event Date" value={venue.availabilityDate ?? "Sat, 24 Aug 2024"} />
                <SummaryRow label="Event Time" value="6:00 PM – 11:30 PM" />
                <SummaryRow label="Setup Time" value="From 2:00 PM" />
                <SummaryRow label="Breakdown Time" value="By 12:30 AM" />
                <SummaryRow label="Guest Count" value={`${guestCount} guests`} />
                <SummaryRow label="Layout" value="Banquet round tables" />
                <SummaryRow
                  label="Selected Spaces"
                  value={`${primarySpace?.name}${secondarySpace ? `, ${secondarySpace.name}` : ""}`}
                />
              </div>

              <div className="space-y-2 border-t border-surface-100 pt-3">
                <SummaryRow label="Venue Hire" value={formatMoneyFromCents(venueHireCents)} />
                <SummaryRow label="Additional Services" value={formatMoneyFromCents(setupBreakdownCents)} />
                <div className="flex items-center justify-between text-sm font-semibold pt-1 border-t border-surface-100">
                  <span className="text-surface-700">Total Before Fees</span>
                  <span className="text-surface-900">{formatMoneyFromCents(totalBeforeFeesCents)}</span>
                </div>
              </div>

              <div className="rounded-xl border border-surface-200 bg-surface-50 p-3.5 space-y-2">
                <p className="text-xs font-semibold text-surface-700 uppercase tracking-wide">
                  Payment Breakdown
                </p>
                <SummaryRow label="Venue Hire" value={formatMoneyFromCents(venueHireCents)} />
                <SummaryRow label="Setup &amp; Breakdown" value={formatMoneyFromCents(setupBreakdownCents)} />
                <SummaryRow label="Platform Booking Fee (2.5%)" value={formatMoneyFromCents(bookingFeeCents)} />
                <SummaryRow label="Service Fee (1.0%)" value={formatMoneyFromCents(serviceFeeCents)} />
                <SummaryRow label="VAT (20%)" value={formatMoneyFromCents(vatCents)} />
                <div className="flex items-center justify-between pt-2 border-t border-surface-200">
                  <span className="text-sm font-semibold text-surface-900">Due Now</span>
                  <span className="text-base font-bold text-brand-700">
                    {formatMoneyFromCents(depositCents)}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-xl border border-success-200 bg-success-50 p-3.5">
                <ShieldCheck className="w-4 h-4 text-success-600 shrink-0 mt-0.5" />
                <p className="text-xs text-success-800">
                  <span className="font-semibold">Amount Held: </span>
                  {formatMoneyFromCents(depositCents)} is held securely and released to the venue
                  once your booking milestones are confirmed.
                </p>
              </div>

              <div className="rounded-xl border border-surface-200 p-3.5 space-y-1">
                <p className="text-xs font-semibold text-surface-700 uppercase tracking-wide">
                  Balance Schedule
                </p>
                <SummaryRow label="Balance Due" value={formatMoneyFromCents(balanceCents)} />
                <p className="text-xs text-surface-500">Due 15 days before your event date.</p>
              </div>

              <div className="rounded-xl border border-surface-200 p-3.5 space-y-1.5">
                <p className="text-xs font-semibold text-surface-700 uppercase tracking-wide">
                  Cancellation Policy
                </p>
                <p className="text-xs text-surface-600">Full refund — 60+ days before event</p>
                <p className="text-xs text-surface-600">50% refund — 30–60 days before event</p>
                <p className="text-xs text-surface-600">No refund — under 30 days before event</p>
                <Link href="#" className="inline-block text-xs font-medium text-brand-600 hover:text-brand-700">
                  View full policy
                </Link>
              </div>

              {/* Phase 7 TODO: wire to a real payment-intent server action with an idempotency key;
                  never trust this client-computed depositCents — recompute server-side from the DB. */}
              <button
                type="button"
                className="flex items-center justify-center gap-2 w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                <Lock className="w-4 h-4" />
                Secure Booking &amp; Pay Now
              </button>
              <p className="flex items-start gap-1.5 text-[11px] text-surface-400">
                <Info className="w-3.5 h-3.5 shrink-0" />
                By confirming you agree to the terms above. Payment is protected until your event
                milestones are met.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
