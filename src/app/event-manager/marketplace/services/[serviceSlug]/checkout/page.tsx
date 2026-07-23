// Phase 2 fixture-only checkout mockup — all totals are computed client-visible for display
// purposes only. Phase 7 (payments) MUST recompute every total server-side from the database and
// never trust a client-supplied amount; see AGENTS.md marketplace brief section 13.
//
// COPY NOTE: the original reference design uses the word "escrow" throughout ("Escrow Protected",
// "Payment & Escrow Details", "held securely in escrow"). That word is intentionally NOT used
// anywhere in this file's UI copy — the current backend only supports Stripe Connect destination
// charges, not regulated escrow, so using that word would misrepresent the product to paying
// customers. It has been replaced with "payment protection" / "milestone release" language.
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Lock,
  ShieldCheck,
  BadgeCheck,
  Landmark,
  CreditCard,
  Building2,
  MoreHorizontal,
  Clock,
  CalendarDays,
  MapPin,
  CheckCircle2,
  Info,
} from "lucide-react";
import { findSupplierByServiceSlug } from "@/lib/marketplace/fixtures";
import { formatMoneyFromCents } from "@/lib/marketplace/format";
import { VerifiedBadge, ComplianceBadge } from "@/components/marketplace/badges";

export const dynamic = "force-static";

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-surface-500">{label}</span>
      <span className="font-medium text-surface-900">{value}</span>
    </div>
  );
}

export default async function SupplierCheckoutPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const supplier = findSupplierByServiceSlug(serviceSlug);
  if (!supplier) notFound();

  const selectedPackage = supplier.packages[1] ?? supplier.packages[0];
  const isStaffing = supplier.category === "Staffing";

  // ---- Pricing maths (Phase 2 display-only — see file header comment) ----
  const packageCents = selectedPackage.priceFromCents;
  const equipmentMaterialsCents = Math.round(packageCents * 0.15); // ~15% of package — equipment/materials
  const subtotalCents = packageCents + equipmentMaterialsCents;
  const travelDeliveryCents = Math.round(subtotalCents * 0.03); // ~3% of subtotal — travel & delivery
  const bookingFeeCents = Math.round(subtotalCents * 0.01); // Booking Fee 1%
  const vatBaseCents = subtotalCents + travelDeliveryCents + bookingFeeCents;
  const vatCents = Math.round(vatBaseCents * 0.2); // VAT 20%
  const grandTotalCents = vatBaseCents + vatCents;

  const depositCents = Math.round(grandTotalCents * 0.3); // Deposit 30% — due now
  const preEventCents = Math.round(grandTotalCents * 0.4); // Pre-Event 40%
  const postEventCents = grandTotalCents - depositCents - preEventCents; // Post-Event ~30% (remainder)
  const remainingBalanceCents = preEventCents + postEventCents;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1200px] mx-auto">
      <Link
        href={`/event-manager/marketplace/suppliers/${supplier.slug}`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-surface-500 hover:text-surface-700"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to marketplace
      </Link>

      <div className="mt-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-surface-900 tracking-tight">
          <Lock className="w-5 h-5 text-brand-600" />
          Secure your booking
        </h1>
        <p className="mt-1 text-sm text-surface-500">
          Premium booking with payment protection — pay securely, we handle the rest.
        </p>
      </div>

      {/* Trust strip */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: ShieldCheck, label: "Payment Protection", sub: "Funds held until milestones met" },
          { icon: BadgeCheck, label: "Verified Supplier", sub: "Identity & business verified" },
          { icon: Clock, label: "Response SLA", sub: `${supplier.responseTime} typical response` },
          { icon: CheckCircle2, label: "Compliance Checked", sub: `Risk grade ${supplier.complianceGrade}` },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-surface-200 bg-white p-3.5">
            <item.icon className="w-4 h-4 text-success-500" />
            <p className="mt-2 text-xs font-semibold text-surface-900">{item.label}</p>
            <p className="text-[11px] text-surface-500">{item.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 lg:grid lg:grid-cols-[1fr_360px] lg:gap-6 lg:items-start">
        {/* Main column */}
        <div className="space-y-5 min-w-0">
          <section className="rounded-2xl border border-surface-200 bg-white p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-surface-900 text-white flex items-center justify-center shrink-0">
                <span className="text-[9px] font-semibold text-center leading-tight px-1">
                  {supplier.logoInitial}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-surface-900">{supplier.name}</h2>
                  <VerifiedBadge label="Verified" solid={false} />
                </div>
                <p className="mt-1 text-xs text-surface-500">
                  {supplier.category} · {supplier.coverage}
                </p>
                <p className="mt-1 text-xs text-surface-500">
                  ★ {supplier.rating.toFixed(1)} ({supplier.reviewCount} reviews) · {supplier.responseRate}%
                  response rate
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-brand-700 border border-brand-200">
                  Package
                </span>
                <span className="text-sm font-semibold text-surface-900">{supplier.serviceName}</span>
              </div>
              <p className="mt-2 text-sm text-surface-600 leading-relaxed">{supplier.description}</p>
              <Link href="#" className="mt-2 inline-block text-xs font-medium text-brand-600 hover:text-brand-700">
                View package details
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-surface-200 bg-white p-5 sm:p-6">
            <h2 className="text-base font-semibold text-surface-900 mb-4">Event &amp; Service Details</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-surface-600 flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" /> Event date
                </label>
                <input
                  disabled
                  defaultValue={supplier.availabilityDate ?? "Sat, 24 Aug 2024"}
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5 text-sm text-surface-700"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-600">Service hours</label>
                <div className="mt-1 flex items-center gap-2">
                  <select disabled className="w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5 text-sm text-surface-700">
                    <option>2:00 PM</option>
                  </select>
                  <span className="text-surface-400 text-sm">to</span>
                  <select disabled className="w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5 text-sm text-surface-700">
                    <option>11:00 PM</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-surface-600">
                  {isStaffing ? "Staffing" : "Quantity"}
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <button type="button" disabled className="h-9 w-9 rounded-lg border border-surface-200 text-surface-400 text-sm">
                    −
                  </button>
                  <span className="w-10 text-center text-sm font-semibold text-surface-900">
                    {isStaffing ? 4 : 1}
                  </span>
                  <button type="button" disabled className="h-9 w-9 rounded-lg border border-surface-200 text-surface-400 text-sm">
                    +
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-surface-600 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> Delivery / Travel
                </label>
                <div className="mt-1 flex items-center justify-between rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5">
                  <span className="text-sm text-surface-700">{supplier.location}</span>
                  <Link href="#" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                    Change
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-surface-200 bg-white p-5 sm:p-6">
            <h2 className="text-base font-semibold text-surface-900 mb-4">Payment &amp; Milestone Details</h2>
            <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 p-4">
              <div>
                <p className="text-xs font-semibold text-brand-700 uppercase tracking-wide">Deposit (due now)</p>
                <p className="text-xs text-brand-600 mt-0.5">30% of the total package price</p>
              </div>
              <span className="text-lg font-bold text-brand-700">{formatMoneyFromCents(depositCents)}</span>
            </div>
            <p className="mt-3 text-xs text-surface-500 leading-relaxed">
              Your payment is held securely until each milestone is confirmed. Funds are released to
              the supplier only after each stage of delivery is complete.
            </p>

            <p className="mt-5 text-xs font-semibold text-surface-700 uppercase tracking-wide">
              Milestone schedule
            </p>
            <ul className="mt-2 space-y-2.5">
              <li className="flex items-center justify-between rounded-lg border border-surface-200 p-3">
                <div>
                  <p className="text-sm font-medium text-surface-900">Deposit — 30%</p>
                  <p className="text-xs text-surface-500">Due now, to confirm your booking</p>
                </div>
                <span className="text-sm font-semibold text-surface-900">{formatMoneyFromCents(depositCents)}</span>
              </li>
              <li className="flex items-center justify-between rounded-lg border border-surface-200 p-3">
                <div>
                  <p className="text-sm font-medium text-surface-900">Pre-Event — 40%</p>
                  <p className="text-xs text-surface-500">Due 7 days before your event date</p>
                </div>
                <span className="text-sm font-semibold text-surface-900">{formatMoneyFromCents(preEventCents)}</span>
              </li>
              <li className="flex items-center justify-between rounded-lg border border-surface-200 p-3">
                <div>
                  <p className="text-sm font-medium text-surface-900">Post-Event — 30%</p>
                  <p className="text-xs text-surface-500">Released after delivery is confirmed complete</p>
                </div>
                <span className="text-sm font-semibold text-surface-900">{formatMoneyFromCents(postEventCents)}</span>
              </li>
            </ul>
          </section>

          <section className="rounded-2xl border border-surface-200 bg-white p-5 sm:p-6">
            <h2 className="text-base font-semibold text-surface-900 mb-3">Event Requirements</h2>
            <div className="rounded-lg border border-surface-200 bg-surface-50 p-3.5 text-sm text-surface-600 leading-relaxed">
              Please arrange full setup one hour before doors open, with a dedicated point of
              contact on-site for the duration of the event.
            </div>
            <p className="mt-1.5 text-right text-[11px] text-surface-400">156/1000</p>

            <h2 className="text-base font-semibold text-surface-900 mb-3 mt-4">Message to Supplier</h2>
            <div className="rounded-lg border border-surface-200 bg-surface-50 p-3.5 text-sm text-surface-600 leading-relaxed">
              Looking forward to working together — please confirm crew arrival time once booked.
            </div>
            <p className="mt-1.5 text-right text-[11px] text-surface-400">98/1000</p>
          </section>

          <section className="rounded-2xl border border-surface-200 bg-white p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:justify-between">
              <div className="space-y-2.5">
                {["Terms of Service", "Supplier Agreement", "Payment Protection Terms"].map((term) => (
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
              <div className="rounded-xl border border-brand-200 bg-brand-50 p-3.5 sm:w-56 shrink-0">
                <p className="text-xs font-semibold text-brand-700">Gala Dock Guarantee</p>
                <p className="mt-1 text-[11px] text-brand-600 leading-relaxed">
                  Every booking is backed by our payment protection and dispute resolution support.
                </p>
              </div>
            </div>

            <h3 className="mt-6 text-sm font-semibold text-surface-900 mb-3">Payment Method</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Card", icon: CreditCard, selected: true },
                { label: "Bank Transfer", icon: Landmark, selected: false },
                { label: "Corporate Account", icon: Building2, selected: false },
                { label: "More methods", icon: MoreHorizontal, selected: false },
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
          </section>
        </div>

        {/* Right rail — order summary */}
        <aside className="mt-6 lg:mt-0 lg:sticky lg:top-6 space-y-4">
          <div className="rounded-2xl border border-surface-200 bg-white p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-surface-900">Order Summary</h3>
              <p className="mt-2 text-sm font-medium text-surface-900">{selectedPackage.tier} — {supplier.serviceName}</p>
              <p className="text-xs text-surface-500">{formatMoneyFromCents(packageCents)} {selectedPackage.unit}</p>
            </div>

            <div className="space-y-2 border-t border-surface-100 pt-3">
              <SummaryRow
                label={isStaffing ? "4 technicians × 8 hours" : `1 × ${selectedPackage.unit}`}
                value={formatMoneyFromCents(packageCents)}
              />
              <SummaryRow label="Equipment &amp; Materials" value={formatMoneyFromCents(equipmentMaterialsCents)} />
              <div className="flex items-center justify-between text-sm font-semibold pt-1 border-t border-surface-100">
                <span className="text-surface-700">Subtotal</span>
                <span className="text-surface-900">{formatMoneyFromCents(subtotalCents)}</span>
              </div>
              <SummaryRow label="Travel &amp; Delivery" value={formatMoneyFromCents(travelDeliveryCents)} />
              <SummaryRow label="Booking Fee (1%)" value={formatMoneyFromCents(bookingFeeCents)} />
              <SummaryRow label="VAT (20%)" value={formatMoneyFromCents(vatCents)} />
              <div className="flex items-center justify-between pt-2 border-t border-surface-200">
                <span className="text-sm font-semibold text-surface-900">Due now (Deposit 30%)</span>
                <span className="text-base font-bold text-brand-700">{formatMoneyFromCents(depositCents)}</span>
              </div>
              <p className="text-xs text-surface-500">
                Remaining balance {formatMoneyFromCents(remainingBalanceCents)}, paid in 2 milestone
                payments.
              </p>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-success-200 bg-success-50 p-3.5">
              <ShieldCheck className="w-4 h-4 text-success-600 shrink-0 mt-0.5" />
              <p className="text-xs text-success-800">
                <span className="font-semibold">Payment Protection: </span>
                Funds are held securely and only released to the supplier once each milestone is
                confirmed complete.
              </p>
            </div>

            <div className="rounded-xl border border-surface-200 p-3.5 space-y-1">
              <p className="text-xs font-semibold text-surface-700 uppercase tracking-wide">Supplier SLA</p>
              <SummaryRow label="Response time" value={supplier.responseTime} />
              <SummaryRow label="Response rate" value={`${supplier.responseRate}%`} />
            </div>

            <div className="rounded-xl border border-surface-200 p-3.5 space-y-2">
              <p className="text-xs font-semibold text-surface-700 uppercase tracking-wide">Compliance Snapshot</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-surface-500">Risk rating</span>
                <ComplianceBadge grade={supplier.complianceGrade} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-surface-500">Insurance</span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-success-600">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-surface-500">Background Check</span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-success-600">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                </span>
              </div>
              <Link href="#" className="inline-block text-xs font-medium text-brand-600 hover:text-brand-700">
                View full compliance report
              </Link>
            </div>

            {/* Phase 7 TODO: wire to a real payment-intent server action with an idempotency key;
                never trust this client-computed depositCents — recompute server-side from the DB. */}
            <button
              type="button"
              className="flex items-center justify-center gap-2 w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Lock className="w-4 h-4" />
              Confirm Booking &amp; Pay Deposit
            </button>
            <p className="flex items-start gap-1.5 text-[11px] text-surface-400">
              <Info className="w-3.5 h-3.5 shrink-0" />
              By confirming you agree to the terms above. Your deposit is protected until delivery
              milestones are met.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
