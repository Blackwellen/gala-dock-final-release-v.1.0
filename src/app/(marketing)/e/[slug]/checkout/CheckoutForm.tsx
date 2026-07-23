"use client";

import { useMemo, useState, useTransition } from "react";
import { Lock, ShieldCheck, Smartphone, Mail, Tag, Info } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { applyPromoCode, submitCheckout, type BuyerDetailsInput } from "./actions";
import { computeBreakdown, type PriceLine } from "../pricing";

const COUNTRIES = ["United Kingdom", "Ireland", "United States", "Australia", "Canada", "Germany", "France"];

export function CheckoutForm({
  slug,
  lines,
  currency,
}: {
  slug: string;
  lines: PriceLine[];
  currency: string;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [addr1, setAddr1] = useState("");
  const [addr2, setAddr2] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postal, setPostal] = useState("");
  const [country, setCountry] = useState("United Kingdom");
  const [delivery, setDelivery] = useState<"mobile" | "email">("mobile");
  const [protection, setProtection] = useState(true);
  const [promoInput, setPromoInput] = useState("");
  const [promoApplied, setPromoApplied] = useState<{ code: string; discountCents: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [promoPending, startPromo] = useTransition();

  const breakdown = useMemo(
    () => computeBreakdown(lines, { discountCents: promoApplied?.discountCents ?? 0, includeProtection: protection }),
    [lines, promoApplied, protection]
  );

  function checkPromo() {
    setPromoError(null);
    if (!promoInput.trim()) return;
    startPromo(async () => {
      const res = await applyPromoCode({ slug, code: promoInput, lines: lines.map((l) => ({ ticketTypeId: l.ticketTypeId, quantity: l.quantity })) });
      if (res.ok) setPromoApplied({ code: promoInput.trim(), discountCents: res.discountCents ?? 0 });
      else { setPromoApplied(null); setPromoError(res.error ?? "Invalid code."); }
    });
  }

  function submit() {
    setError(null);
    if (!fullName.trim() || !email.trim()) { setError("Please enter your name and email."); return; }
    if (!addr1.trim() || !city.trim() || !postal.trim()) { setError("Please complete your billing address."); return; }
    const buyer: BuyerDetailsInput = {
      fullName, email, phone, marketingOptIn,
      billingAddressLine1: addr1, billingAddressLine2: addr2, billingCity: city,
      billingRegion: region, billingPostalCode: postal, billingCountry: country,
      deliveryMethod: delivery, promoCode: promoApplied?.code, includeProtection: protection,
    };
    start(async () => {
      const res = await submitCheckout(slug, lines.map((l) => ({ ticketTypeId: l.ticketTypeId, quantity: l.quantity })), buyer);
      if (res.ok && res.url) window.location.href = res.url;
      else setError(res.error ?? "Couldn't complete checkout.");
    });
  }

  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
      <div className="space-y-5">
        {/* Contact */}
        <section className="rounded-xl border border-surface-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-surface-900 mb-3">Contact information</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Full name" value={fullName} onChange={setFullName} placeholder="Jane Cooper" />
            <Field label="Email address" type="email" value={email} onChange={setEmail} placeholder="jane.cooper@email.com" />
            <Field label="Phone number" value={phone} onChange={setPhone} placeholder="+44 7700 900000" />
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-surface-500">
            <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} className="rounded border-surface-300" />
            Email me about new events, exclusive offers and updates from Gala Dock.
          </label>
        </section>

        {/* Billing */}
        <section className="rounded-xl border border-surface-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-surface-900 mb-3">Billing address</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Address line 1" value={addr1} onChange={setAddr1} className="sm:col-span-2" />
            <Field label="Address line 2 (optional)" value={addr2} onChange={setAddr2} className="sm:col-span-2" />
            <Field label="City" value={city} onChange={setCity} />
            <Field label="State / County" value={region} onChange={setRegion} />
            <Field label="Postcode" value={postal} onChange={setPostal} />
            <div>
              <label className="mb-1 block text-xs font-medium text-surface-600">Country</label>
              <select value={country} onChange={(e) => setCountry(e.target.value)} className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* Delivery */}
        <section className="rounded-xl border border-surface-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-surface-900 mb-3">Delivery method</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {(
              [
                { id: "mobile" as const, label: "Mobile ticket", desc: "Get tickets on your phone (recommended)", icon: Smartphone },
                { id: "email" as const, label: "Email ticket", desc: "Receive tickets via email", icon: Mail },
              ]
            ).map(({ id, label, desc, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setDelivery(id)}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
                  delivery === id ? "border-brand-500 bg-brand-50/40 ring-1 ring-brand-500" : "border-surface-200 hover:bg-surface-50"
                )}
              >
                <Icon className="w-4 h-4 mt-0.5 text-brand-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-surface-900">{label}</p>
                  <p className="text-xs text-surface-500">{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Promo */}
        <section className="rounded-xl border border-surface-200 bg-white p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-surface-900 mb-3">
            <Tag className="w-4 h-4 text-brand-600" /> Promo code
          </h2>
          <div className="flex gap-2">
            <input
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value)}
              placeholder="Enter promo or discount code"
              className="flex-1 rounded-lg border border-surface-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="button"
              onClick={checkPromo}
              disabled={promoPending || !promoInput.trim()}
              className="rounded-lg bg-surface-900 px-4 py-2 text-sm font-semibold text-white hover:bg-surface-800 disabled:opacity-40"
            >
              {promoPending ? "…" : "Apply"}
            </button>
          </div>
          {promoApplied && <p className="mt-2 text-xs font-medium text-success-600">Code &quot;{promoApplied.code}&quot; applied.</p>}
          {promoError && <p className="mt-2 text-xs text-danger-600">{promoError}</p>}
        </section>

        {/* Payment (redirect notice — real Stripe-hosted secure payment, never a raw card form here) */}
        <section className="rounded-xl border border-surface-200 bg-white p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-surface-900 mb-1">
            <Lock className="w-4 h-4 text-brand-600" /> Payment
          </h2>
          <p className="text-xs text-surface-500">
            You&apos;ll securely enter your card, Apple Pay or Google Pay details on Stripe&apos;s hosted payment
            page in the next step — Gala Dock never sees or stores your card details.
          </p>
          <label className="mt-3 flex items-center gap-2 text-xs text-surface-600">
            <input type="checkbox" checked={protection} onChange={(e) => setProtection(e.target.checked)} className="rounded border-surface-300" />
            Add order protection ({formatCurrency(1.99, currency)}) — full refund if the event is cancelled.
          </label>
        </section>

        <p className="flex items-start gap-1.5 text-[11px] text-surface-400">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Tickets are refundable up to the organiser&apos;s policy. Service fees are non-refundable.
        </p>
      </div>

      {/* Order summary */}
      <div className="lg:sticky lg:top-6 rounded-xl border border-surface-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-surface-900 mb-3">Order summary</h3>
        <div className="space-y-2 text-sm">
          {lines.map((l) => (
            <div key={l.ticketTypeId} className="flex items-center justify-between">
              <span className="text-surface-600">{l.quantity} × {l.name}</span>
              <span className="font-medium text-surface-900">{formatCurrency((l.unitPriceCents * l.quantity) / 100, currency)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-surface-100 pt-3 space-y-1.5 text-sm">
          <Row label="Subtotal" value={formatCurrency(breakdown.subtotalCents / 100, currency)} />
          {breakdown.discountCents > 0 && (
            <Row label="Discount" value={`-${formatCurrency(breakdown.discountCents / 100, currency)}`} valueClass="text-success-600" />
          )}
          <Row label="Booking fee" value={formatCurrency(breakdown.bookingFeeCents / 100, currency)} />
          <Row label="Service fee" value={formatCurrency(breakdown.serviceFeeCents / 100, currency)} />
          {breakdown.protectionCents > 0 && <Row label="Order protection" value={formatCurrency(breakdown.protectionCents / 100, currency)} />}
        </div>
        <div className="mt-3 border-t border-surface-100 pt-3 flex items-center justify-between">
          <span className="font-semibold text-surface-900">Total</span>
          <span className="text-lg font-bold text-surface-900">{currency} {formatCurrency(breakdown.totalCents / 100, currency).replace(/^[^\d]+/, "")}</span>
        </div>

        {error && <p className="mt-3 text-sm text-danger-600">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <Lock className="w-4 h-4" /> {pending ? "Redirecting to secure payment…" : `Continue to secure payment · ${formatCurrency(breakdown.totalCents / 100, currency)}`}
        </button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-surface-400">
          <ShieldCheck className="w-3.5 h-3.5" /> 256-bit SSL · PCI DSS compliant via Stripe
        </p>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text", className,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-surface-600">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between text-surface-500">
      <span>{label}</span>
      <span className={cn("font-medium text-surface-800", valueClass)}>{value}</span>
    </div>
  );
}
