"use client";
import { useState } from "react";
import { Loader2, Rocket } from "lucide-react";
import { Dialog, useAction } from "@/components/kit/client";
import { buyBoost } from "@/lib/actions/boosts";

type Product = { key: string; label: string; placement: string; price_minor: number; duration_days: number };
const PLACEMENT: Record<string, string> = { discover: "Featured on Discover", category: "Spotlight in its category", homepage: "Homepage hero", search: "Boosted in search results" };

/** Buy a paid placement: start date + optional city/category targeting → Stripe Checkout. */
export function BoostSelect({ eventId, product, defaultCity, defaultCategory }: { eventId: string; product: Product; defaultCity: string; defaultCategory: string }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [cities, setCities] = useState(defaultCity); const [cats, setCats] = useState(defaultCategory);
  const list = (s: string) => s.split(",").map(x => x.trim()).filter(Boolean).slice(0, 5);
  const price = `£${(product.price_minor / 100).toLocaleString("en-GB", { minimumFractionDigits: product.price_minor % 100 ? 2 : 0 })}`;
  return <>
    <button type="button" className="k-btn outline sm" onClick={() => setOpen(true)}>Select</button>
    <Dialog open={open} onClose={() => setOpen(false)} title={product.label} sub={`${PLACEMENT[product.placement] ?? product.placement} for ${product.duration_days} days · ${price}. Shown with a “Sponsored” label.`}>
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const r = await run(() => buyBoost({ event_id: eventId, product: product.key, starts_at: start ? new Date(`${start}T09:00:00`).toISOString() : null, cities: list(cities), categories: list(cats) }), { refresh: false }); if (r.ok && typeof r.data === "string") window.location.assign(r.data); }}>
        <label className="k-field"><span>Start date</span><input className="k-input" type="date" required min={new Date().toISOString().slice(0, 10)} value={start} onChange={x => setStart(x.target.value)} /></label>
        <label className="k-field"><span>Target cities (optional, comma separated)</span><input className="k-input" maxLength={200} value={cities} onChange={x => setCities(x.target.value)} placeholder="London, Manchester" /></label>
        <label className="k-field"><span>Target categories (optional)</span><input className="k-input" maxLength={200} value={cats} onChange={x => setCats(x.target.value)} placeholder="festival, music" /></label>
        <p className="k-small">Payment is taken now; the boost goes live on the start date and ends automatically. Unused boosts can be refunded from Money.</p>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>{pending ? <Loader2 size={15} className="k-spin" /> : <Rocket size={15} />}Pay {price}</button></div>
      </form>
    </Dialog>
  </>;
}
