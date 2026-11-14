"use client";
import { useAction } from "@/components/kit/client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Share2, ShoppingCart, ShieldCheck, Smartphone, CheckCircle2, Minus, Plus, BellRing, Repeat } from "lucide-react";
import { useKitToast } from "@/components/kit/client";
import { joinWaitlist } from "@/lib/tickets/actions";
import { CLOSED_LABEL, isSellable, resaleBuyable } from "@/lib/public/ticket-cta";
import { NO_FEE, bookingFee, priceWithFees, type FeeConfig } from "@/lib/public/fees";

export function RecordView({ itemKey, signedIn }: { itemKey: string; signedIn: boolean }) {
  useEffect(() => { if (signedIn) void fetch("/api/recent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: itemKey }) }).catch(() => null); }, [itemKey, signedIn]);
  return null;
}

export function EventActions({ eventId, name, saved: initial, signedIn }: { eventId: string; name: string; saved: boolean; signedIn: boolean }) {
  const [saved, setSaved] = useState(initial); const toast = useKitToast(); const router = useRouter();
  const save = async () => {
    if (!signedIn) { router.push(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
    const next = !saved; setSaved(next);
    const r = await fetch("/api/saved", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: `event:${eventId}`, saved: next }) }).catch(() => null);
    if (!r?.ok) { setSaved(!next); toast("Couldn't update saved events", "error"); } else toast(next ? "Saved to your list" : "Removed from saved");
  };
  const share = async () => { try { if (navigator.share) await navigator.share({ title: name, url: location.href }); else { await navigator.clipboard.writeText(location.href); toast("Link copied"); } } catch { /* cancelled */ } };
  return <div className="pe-acts"><button onClick={() => void save()} aria-pressed={saved}><Heart size={15} fill={saved ? "currentColor" : "none"} />{saved ? "Saved" : "Save"}</button><button onClick={() => void share()}><Share2 size={15} />Share</button></div>;
}

type Tier = { id: string; name: string; sub: string; price: number; left: number; qty: number; status: string; badge: string | null; /** Q57 tierOffer() */ buyable?: boolean; offerLabel?: string | null; soldOut?: boolean };
/** £12.50, £40 — pence always shown when present (toLocaleString printed "£37.5"). */
const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n);
/** Choose a ticket type and quantity, then continue to checkout (/checkout/[event]). */
export function TicketPicker({ slug, tiers, signedIn, eventId, waitlist = false, launch = null, sellerReady = true, resale = 0, fee = NO_FEE }: { slug: string; tiers: Tier[]; signedIn: boolean; eventId?: string; waitlist?: boolean; launch?: string | null; sellerReady?: boolean; /** Q57: live fan resale listings */ resale?: number; /** Q57 / DMCC: booking fee config, so prices include it */ fee?: FeeConfig }) {
  // Checkout only reserves in these launch states (§50); otherwise the CTA explains why tickets aren't available.
  // Shared with the hero CTA (src/lib/public/ticket-cta.ts) so the two never disagree.
  const sellable = isSellable(launch);
  const closed = CLOSED_LABEL;
  const { run, pending } = useAction(); const [joined, setJoined] = useState<string[]>([]);
  const soldOut = (x: Tier) => x.soldOut ?? (x.status === "sold_out" || (x.status === "on_sale" && x.left === 0));
  const canBuy = (x: Tier) => x.buyable ?? (x.status === "on_sale" && x.left > 0);
  const join = async (tierId: string) => { if (!eventId) return; const r = await run(() => joinWaitlist(eventId, tierId, 1), { refresh: false }); if (r.ok) setJoined(j => [...j, tierId]); };
  const buyable = tiers.filter(canBuy);
  const [sel, setSel] = useState(buyable[0]?.id ?? ""); const [n, setN] = useState(1);
  const t = tiers.find(x => x.id === sel); const max = Math.min(10, t?.left ?? 1);
  const href = `/checkout/${slug}?tier=${sel}&qty=${n}`;
  return <>
    <ul className="pe-tiers" aria-label="Ticket type">{tiers.map(x => { const off = !canBuy(x); const low = !off && x.qty > 0 && x.left / x.qty < 0.15; return <li key={x.id}>
      <label className={`pe-tier ${sel === x.id ? "on" : ""} ${off ? "off" : ""}`}><input type="radio" name="tier" checked={sel === x.id} disabled={off} onChange={() => { setSel(x.id); setN(1); }} /><span className="pe-radio" />
        <span className="k-grow"><b>{x.name}</b><small>{x.sub}</small></span>
        <span className="pe-price">{off ? <em className="gray">{x.offerLabel ?? (x.status === "scheduled" ? "Coming soon" : "Sold out")}</em> : low ? <em>Almost gone</em> : null}<b>{x.price === 0 ? "Free" : gbp(priceWithFees(x.price, fee))}</b>{x.price > 0 && bookingFee(x.price, fee) > 0 && <small className="pe-fee">incl. {gbp(bookingFee(x.price, fee))} booking fee</small>}</span>
        {sel === x.id && !off && <span className="pe-qty" onClick={e => e.preventDefault()}><button type="button" aria-label="Fewer tickets" onClick={() => setN(v => Math.max(1, v - 1))}><Minus size={13} /></button><b aria-live="polite">{n}</b><button type="button" aria-label="More tickets" onClick={() => setN(v => Math.min(max, v + 1))}><Plus size={13} /></button></span>}</label></li>; })}
      {!tiers.length && <li className="k-small">Tickets haven&apos;t been released yet.</li>}</ul>
    {waitlist && eventId && tiers.some(soldOut) && <div className="pe-wait">{tiers.filter(soldOut).map(x => joined.includes(x.id) ? <span key={x.id} className="pe-wait-ok"><CheckCircle2 size={14} />You&apos;re on the {x.name} waiting list — we&apos;ll email you if tickets free up.</span>
      : signedIn ? <button key={x.id} className="k-btn outline sm" disabled={pending} onClick={() => void join(x.id)}><BellRing size={14} />Join waiting list · {x.name}</button>
      : <Link key={x.id} className="k-btn outline sm" href={`/login?next=${encodeURIComponent(`/events/${slug}`)}`}><BellRing size={14} />Sign in to join the {x.name} waiting list</Link>)}</div>}
    {/* Seller readiness (Q07, event_payment_readiness): checkout refuses paid orders until the organiser's Stripe account can take
        payments, so the card never offers Buy then — it offers the waitlist (when the event has one) or says sales open soon. */}
    {sellable && !sellerReady ? (waitlist && eventId && t ? (joined.includes(t.id) ? <p className="pe-wait-ok" role="status"><CheckCircle2 size={14} />You&apos;re on the waiting list — we&apos;ll email you when tickets go on sale.</p>
        : signedIn ? <button className="k-btn primary pe-buy" disabled={pending} onClick={() => void join(t.id)}><BellRing size={18} />Join the waitlist</button>
        : <Link className="k-btn primary pe-buy" href={`/login?next=${encodeURIComponent(`/events/${slug}`)}`}><BellRing size={18} />Join the waitlist</Link>)
      : <button className="k-btn primary pe-buy" disabled>Tickets on sale soon</button>)
    : !sellable ? <button className="k-btn primary pe-buy" disabled>{closed[launch!] ?? "Not on sale"}</button> : t && buyable.length > 0 ? <Link className="k-btn primary pe-buy" href={signedIn ? href : `/login?next=${encodeURIComponent(href)}`}><ShoppingCart size={18} />Buy Tickets · {gbp(Math.round(priceWithFees(t.price, fee) * n * 100) / 100)}{t.price > 0 && bookingFee(t.price, fee) > 0 ? " incl. fees" : ""}</Link> : <button className="k-btn primary pe-buy" disabled>Not on sale</button>}
    {/* Q57: access-code tiers aren't publicly readable any more; a code-only presale points to checkout, where the code unlocks them. */}
    {launch === "presale" && sellerReady && buyable.length === 0 && <Link className="k-btn outline pe-buy" href={signedIn ? `/checkout/${slug}` : `/login?next=${encodeURIComponent(`/checkout/${slug}`)}`}>Have a presale code? Enter it at checkout</Link>}
    {/* Q57: resale listings are grouped under their event; when new tickets can't be bought this is how fans find them. */}
    {resale > 0 && sellerReady && resaleBuyable(launch) && <Link className="k-btn outline pe-buy" href={`/checkout/${slug}?resale=1`}><Repeat size={16} />Fan resale · {resale} ticket{resale === 1 ? "" : "s"} at face value or less</Link>}
    <div className="pe-trust"><span><ShieldCheck size={14} />Secure checkout</span><span><Smartphone size={14} />Mobile tickets</span><span><CheckCircle2 size={14} />Instant confirmation</span></div>
  </>;
}
