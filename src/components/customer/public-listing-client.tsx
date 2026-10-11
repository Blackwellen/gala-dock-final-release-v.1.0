"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Share2, Columns3, FileText, MessageSquare, Clock4, CalendarCheck, Zap, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useAction, useKitToast } from "@/components/kit/client";
import { addAndRequest } from "@/lib/actions/build-extra";

export function RecordView({ itemKey, signedIn }: { itemKey: string; signedIn: boolean }) {
  useEffect(() => { if (signedIn) void fetch("/api/recent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: itemKey }) }).catch(() => null); }, [itemKey, signedIn]);
  return null;
}

export function ListingActions({ listingId, name, saved: initial, signedIn }: { listingId: string; name: string; saved: boolean; signedIn: boolean }) {
  const [saved, setSaved] = useState(initial); const toast = useKitToast(); const router = useRouter();
  const save = async () => {
    if (!signedIn) { router.push(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
    const next = !saved; setSaved(next);
    const r = await fetch("/api/saved", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: `listing:${listingId}`, saved: next }) }).catch(() => null);
    if (!r?.ok) { setSaved(!next); toast("Couldn't update saved items", "error"); } else toast(next ? `${name} saved` : "Removed from saved");
  };
  const share = async () => { try { if (navigator.share) await navigator.share({ title: name, url: location.href }); else { await navigator.clipboard.writeText(location.href); toast("Link copied"); } } catch { /* cancelled */ } };
  return <div className="pl-acts"><button onClick={() => void save()} aria-pressed={saved}><Heart size={16} fill={saved ? "currentColor" : "none"} />{saved ? "Saved" : "Save"}</button><Link href={signedIn ? "/account/saved?tab=venues&compare=venues" : "/login"}><Columns3 size={16} />Compare</Link><button onClick={() => void share()}><Share2 size={16} />Share</button></div>;
}

type Ev = { id: string; name: string; guests?: number };
/** Add this listing to one of your events and go to the right step: request quote, hold, enquiry (messages) or book. */
export function PlanWithListing({ listing, events, signedIn, next, compact }: { listing: { id: string; name: string; category: string; kind: string; capacity?: number | null }; events: Ev[]; signedIn: boolean; next: string; compact?: boolean }) {
  const { run, pending } = useAction(); const [ev, setEv] = useState(events[0]?.id ?? "");
  const e = events.find(x => x.id === ev);
  const login = `/login?next=${encodeURIComponent(next)}`;
  if (compact) return signedIn && ev ? <button className="k-btn primary" disabled={pending} onClick={() => void run(() => addAndRequest(ev, listing.id, listing.category, "quote"))}><FileText size={15} />Request quote</button> : <Link className="k-btn primary" href={signedIn ? "/plan" : login}><FileText size={15} />Request quote</Link>;
  if (!signedIn) return <div className="pl-plan"><Link className="k-btn primary pl-main-cta" href={login}><FileText size={17} />Request quote</Link><div className="pl-cta-g"><Link className="k-btn outline" href={login}><MessageSquare size={16} />Enquire</Link><Link className="k-btn outline" href={login}><Clock4 size={16} />Conditional hold</Link></div><p className="k-xs k-muted">Sign in to request quotes, hold dates and book. It&apos;s free.</p></div>;
  if (!events.length) return <div className="pl-plan"><p className="k-small">Start a plan to request quotes from {listing.name}.</p><Link className="k-btn primary pl-main-cta" href="/plan">Plan an event</Link></div>;
  const fit = listing.capacity && e?.guests ? e.guests <= listing.capacity : null;
  const go = (mode: "add" | "quote") => void run(() => addAndRequest(ev, listing.id, listing.category, mode));
  return <div className="pl-plan">
    <label className="pl-ev"><span>For your event</span><select value={ev} onChange={x => setEv(x.target.value)}>{events.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    {fit !== null && <div className={`pl-fit ${fit ? "ok" : "bad"}`}>{fit ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}{fit ? `Fits your ${e!.guests} guests` : `Holds up to ${listing.capacity} — you have ${e!.guests} guests`}</div>}
    <button className="k-btn primary pl-main-cta" disabled={pending} onClick={() => go("quote")}>{pending ? <Loader2 size={16} className="k-spin" /> : <FileText size={17} />}Request quote</button>
    <div className="pl-cta-g">
      <button className="k-btn outline" disabled={pending} onClick={() => go("add")}><CalendarCheck size={16} />Add to build</button>
      <button className="k-btn outline" disabled={pending} onClick={() => go("quote")}><Clock4 size={16} />Conditional hold</button>
      <Link className="k-btn outline" href={`/account/events/${ev}/messages?listing=${listing.id}`}><MessageSquare size={16} />Enquire</Link>
      <Link className="k-btn outline" href={`/account/events/${ev}/build?cat=${listing.category}`}><Zap size={16} />Compare options</Link>
    </div>
  </div>;
}
