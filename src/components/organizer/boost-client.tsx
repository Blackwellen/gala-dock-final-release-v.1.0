"use client";
import { useState } from "react";
import { Loader2, Rocket } from "lucide-react";
import { Dialog, useAction } from "@/components/kit/client";
import { buyBoost } from "@/lib/actions/boosts";
import { BOOST_PLACEMENT, londonToday } from "@/lib/ads/flight";

type Product = { key: string; label: string; placement: string; price_minor: number; duration_days: number };

/** Buy a paid placement: start date (London) + optional city/category targeting → Stripe Checkout. */
export function BoostSelect({ eventId, product, defaultCity, defaultCategory }: { eventId: string; product: Product; defaultCity: string; defaultCategory: string }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  const today = londonToday();
  const [start, setStart] = useState(today);
  const [cities, setCities] = useState(defaultCity); const [cats, setCats] = useState(defaultCategory);
  const list = (s: string) => s.split(",").map(x => x.trim()).filter(x => x.length >= 2).slice(0, 5);
  const gbp = (minor: number) => `£${(minor / 100).toLocaleString("en-GB", { minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
  const price = gbp(product.price_minor), total = gbp(Math.round(product.price_minor * 1.2));
  return <>
    <button type="button" className="k-btn outline sm" onClick={() => setOpen(true)}>Select</button>
    <Dialog open={open} onClose={() => setOpen(false)} title={product.label} sub={`${BOOST_PLACEMENT[product.placement] ?? product.placement} for up to ${product.duration_days} days · ${price} plus VAT at 20% (${total} total). Always shown with a “Sponsored” label.`}>
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); if (pending) return; const r = await run(() => buyBoost({ event_id: eventId, product: product.key, starts_on: start || null, cities: list(cities), categories: list(cats) }), { refresh: false }); if (r.ok && typeof r.data === "string") window.location.assign(r.data); }}>
        <label className="k-field"><span>Start date (UK time)</span><input className="k-input" type="date" required min={today} value={start} onChange={x => setStart(x.target.value)} /></label>
        <label className="k-field"><span>Target cities (optional, comma separated)</span><input className="k-input" maxLength={200} value={cities} onChange={x => setCities(x.target.value)} placeholder="London, Manchester" /></label>
        <label className="k-field"><span>Target categories (optional)</span><input className="k-input" maxLength={200} value={cats} onChange={x => setCats(x.target.value)} placeholder="festival, music" /></label>
        <p className="k-small">Payment is taken now. Today’s date starts the boost straight away; a later date starts it at midnight UK time. It ends automatically after {product.duration_days} days, or when your event ends if that is sooner. Impressions not delivered by the end are refunded to your card automatically, VAT included.</p>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>{pending ? <Loader2 size={15} className="k-spin" /> : <Rocket size={15} />}Pay {total}</button></div>
      </form>
    </Dialog>
  </>;
}
