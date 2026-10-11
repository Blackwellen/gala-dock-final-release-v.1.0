"use client";
import { useAction } from "@/components/kit/client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Share2, ShoppingCart, ShieldCheck, Smartphone, CheckCircle2, Minus, Plus, BellRing } from "lucide-react";
import { useKitToast } from "@/components/kit/client";
import { joinWaitlist } from "@/lib/tickets/actions";

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

type Tier = { id: string; name: string; sub: string; price: number; left: number; qty: number; status: string; badge: string | null };
/** Choose a ticket type and quantity, then continue to checkout (/checkout/[event]). */
export function TicketPicker({ slug, tiers, signedIn, eventId, waitlist = false, launch = null }: { slug: string; tiers: Tier[]; signedIn: boolean; eventId?: string; waitlist?: boolean; launch?: string | null }) {
  // Checkout only reserves in these launch states (§50); otherwise the CTA explains why tickets aren't available.
  const sellable = !launch || ["presale", "on_sale", "final_release", "low_availability"].includes(launch);
  const closed: Record<string, string> = { draft: "Not on sale", coming_soon: "Tickets on sale soon", countdown: "Tickets on sale soon", sold_out: "Sold out", waitlist: "Sold out — join the waiting list", postponed: "Event postponed", cancelled: "Event cancelled", ended: "This event has ended" };
  const { run, pending } = useAction(); const [joined, setJoined] = useState<string[]>([]);
  const soldOut = (x: Tier) => x.status === "sold_out" || (x.status === "on_sale" && x.left === 0);
  const join = async (tierId: string) => { if (!eventId) return; const r = await run(() => joinWaitlist(eventId, tierId, 1), { refresh: false }); if (r.ok) setJoined(j => [...j, tierId]); };
  const buyable = tiers.filter(t => t.status === "on_sale" && t.left > 0);
  const [sel, setSel] = useState(buyable[0]?.id ?? ""); const [n, setN] = useState(1);
  const t = tiers.find(x => x.id === sel); const max = Math.min(10, t?.left ?? 1);
  const href = `/checkout/${slug}?tier=${sel}&qty=${n}`;
  return <>
    <ul className="pe-tiers" role="radiogroup" aria-label="Ticket type">{tiers.map(x => { const off = x.status !== "on_sale" || x.left === 0; const low = !off && x.qty > 0 && x.left / x.qty < 0.15; return <li key={x.id}>
      <label className={`pe-tier ${sel === x.id ? "on" : ""} ${off ? "off" : ""}`}><input type="radio" name="tier" checked={sel === x.id} disabled={off} onChange={() => { setSel(x.id); setN(1); }} /><span className="pe-radio" />
        <span className="k-grow"><b>{x.name}</b><small>{x.sub}</small></span>
        <span className="pe-price">{off ? <em className="gray">{x.status === "scheduled" ? "Coming soon" : "Sold out"}</em> : low ? <em>Almost gone</em> : null}<b>{x.price === 0 ? "Free" : `£${x.price.toLocaleString("en-GB")}`}</b></span>
        {sel === x.id && !off && <span className="pe-qty" onClick={e => e.preventDefault()}><button type="button" aria-label="Fewer tickets" onClick={() => setN(v => Math.max(1, v - 1))}><Minus size={13} /></button><b aria-live="polite">{n}</b><button type="button" aria-label="More tickets" onClick={() => setN(v => Math.min(max, v + 1))}><Plus size={13} /></button></span>}</label></li>; })}
      {!tiers.length && <li className="k-small">Tickets haven&apos;t been released yet.</li>}</ul>
    {waitlist && eventId && tiers.some(soldOut) && <div className="pe-wait">{tiers.filter(soldOut).map(x => joined.includes(x.id) ? <span key={x.id} className="pe-wait-ok"><CheckCircle2 size={14} />You&apos;re on the {x.name} waiting list — we&apos;ll email you if tickets free up.</span>
      : signedIn ? <button key={x.id} className="k-btn outline sm" disabled={pending} onClick={() => void join(x.id)}><BellRing size={14} />Join waiting list · {x.name}</button>
      : <Link key={x.id} className="k-btn outline sm" href={`/login?next=${encodeURIComponent(`/events/${slug}`)}`}><BellRing size={14} />Sign in to join the {x.name} waiting list</Link>)}</div>}
    {!sellable ? <button className="k-btn primary pe-buy" disabled>{closed[launch!] ?? "Not on sale"}</button> : t && buyable.length > 0 ? <Link className="k-btn primary pe-buy" href={signedIn ? href : `/login?next=${encodeURIComponent(href)}`}><ShoppingCart size={18} />Buy Tickets · £{(t.price * n).toLocaleString("en-GB")}</Link> : <button className="k-btn primary pe-buy" disabled>Not on sale</button>}
    <div className="pe-trust"><span><ShieldCheck size={14} />Secure checkout</span><span><Smartphone size={14} />Mobile tickets</span><span><CheckCircle2 size={14} />Instant confirmation</span></div>
  </>;
}
