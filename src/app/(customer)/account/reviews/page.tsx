import Link from "next/link";
import { PenLine, ShieldCheck, Info, CheckCircle2, MapPin, CalendarDays, ArrowRight, MessageSquareText, CircleCheck, Lightbulb, ImageIcon, Star, FileText } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { ReviewForm, ReviewRowMenu, SubmittedMenu } from "@/components/customer/reviews-client";
import { requestTime } from "@/lib/workspace/format";

export const metadata = { title: "Reviews" };
const CAT: Record<string, [string, string]> = { venue: ["Venue", "purple"], food: ["Catering", "red"], drinks: ["Drinks & Bar", "amber"], entertainment: ["Entertainment", "green"], media: ["Photography", "blue"], styling: ["Flowers & Styling", "red"], transport: ["Transport", "blue"], staff: ["Staff", "gray"], production: ["Production", "green"], hire: ["Hire", "amber"], extras: ["Extras", "gray"] };
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }) : "";
type Item = { id: string; title: string; category: string; image: string; status: string; listing_id: string | null; event: { id: string; name: string; starts_at: string | null; ends_at: string | null; location: string; city: string } };

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const ctx = await getCustomer();
  const tab = sp.tab === "submitted" ? "submitted" : "pending";
  const now = new Date().toISOString();
  const [{ data: items }, { data: mine }] = await Promise.all([
    ctx.supabase.from("build_items").select("id,title,category,image,status,listing_id,event:events!inner(id,name,starts_at,ends_at,location,city,owner_id)").eq("event.owner_id", ctx.user.id).in("status", ["fulfilled", "confirmed"]).lt("event.starts_at", now),
    ctx.supabase.from("reviews").select("id,rating,ratings,body,created_at,photos,build_item_id,listing_id,build_items(title,category,image)").eq("user_id", ctx.user.id).order("created_at", { ascending: false }),
  ]);
  const reviewed = new Set((mine ?? []).map(r => r.build_item_id));
  const all = ((items ?? []) as unknown as Item[]).filter(i => (i.event.ends_at ?? i.event.starts_at ?? now) < now);
  const pending = all.filter(i => !reviewed.has(i.id)).sort((a, b) => (b.event.starts_at ?? "").localeCompare(a.event.starts_at ?? ""));
  const { data: ls } = pending.length ? await ctx.supabase.from("listings").select("id,location").in("id", pending.map(p => p.listing_id).filter(Boolean) as string[]) : { data: [] };
  const loc = new Map((ls ?? []).map(l => [l.id, l.location]));
  const sel = pending.find(p => p.id === sp.item) ?? pending[0];
  const editing = sp.edit ? (mine ?? []).find(r => r.id === sp.edit) : null;
  const editItem = editing ? all.find(i => i.id === editing.build_item_id) : null;
  const target = editItem ?? sel;
  const subs = (mine ?? []) as unknown as { id: string; rating: number; ratings: Record<string, number>; body: string; created_at: string; photos: string[]; build_item_id: string; build_items: { title: string; category: string; image: string } | null }[];
  const stars = (n: number) => <span className="rv-stars" role="img" aria-label={`${n} out of 5`}>{[1, 2, 3, 4, 5].map(i => <Star key={i} size={14} className={i <= n ? "on" : ""} />)}</span>;

  return <div className="rv">
    <div className="rv-grid">
      <div className="rv-main">
        <h1>Reviews</h1><p className="rv-sub">Share your experience and help other people plan amazing events.</p>
        <nav className="rv-tabs" aria-label="Reviews"><Link href="/account/reviews" aria-current={tab === "pending" ? "page" : undefined}><PenLine size={18} />To review ({pending.length})</Link><Link href="/account/reviews?tab=submitted" aria-current={tab === "submitted" ? "page" : undefined}><ShieldCheck size={18} />Submitted ({subs.length})</Link></nav>
        <div className="rv-note"><Info size={17} />Only completed bookings can be reviewed. Your reviews are verified and linked to real events to keep our community authentic.</div>
        {tab === "pending" ? <>
          <ol className="rv-list">{pending.map(p => { const [cl, ct] = CAT[p.category] ?? [p.category, "gray"]; return <li key={p.id} className={`ce-card rv-row ${target?.id === p.id ? "on" : ""}`}>
            <div className="rv-img">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.image || "/assets/gd/oe-neon.webp"} alt="" /><span className="rv-done"><CheckCircle2 size={15} />Completed</span></div>
            <div className="rv-body"><span className={`rv-cat ${ct}`}>{cl}</span><h2>{p.title}</h2><p><MapPin size={15} />{(p.listing_id && loc.get(p.listing_id)) || p.event.location || p.event.city}</p><p><CalendarDays size={15} />{day(p.event.starts_at)}</p></div>
            <div className="rv-acts"><div className="k-row" style={{ gap: 12 }}><Link className="k-btn primary rv-write" href={`/account/reviews?item=${p.id}#write`}>Write review <ArrowRight size={16} /></Link><ReviewRowMenu eventId={p.event.id} listingId={p.listing_id} /></div><Link className="k-link" href={`/account/events/${p.event.id}/money`}>View booking <ArrowRight size={14} /></Link></div>
          </li>; })}</ol>
          {!pending.length && <div className="ce-card rv-empty"><CircleCheck size={28} /><b>You&apos;re all caught up</b><p>When a booking is completed you can review it here.</p></div>}
          {target && <ReviewForm key={target.id + (editing?.id ?? "")} item={{ id: target.id, title: target.title, image: target.image, location: (target.listing_id && loc.get(target.listing_id)) || target.event.location || target.event.city, date: day(target.event.starts_at), category: (CAT[target.category] ?? [target.category])[0] }} initial={editing ? { ratings: { overall: editing.rating, ...(editing.ratings as Record<string, number>) }, body: editing.body } : null} draft={sp.draft === "1"} />}
        </> : <ol className="rv-subs">{subs.map(r => { const [cl, ct] = CAT[r.build_items?.category ?? ""] ?? ["Booking", "gray"]; return <li key={r.id} className="ce-card rv-sub-row">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={r.build_items?.image || "/assets/gd/oe-neon.webp"} alt="" /><div className="k-grow"><div className="k-row" style={{ gap: 10 }}><b>{r.build_items?.title ?? "Booking"}</b><span className={`rv-cat ${ct}`}>{cl}</span></div><div className="k-row" style={{ gap: 10, margin: "6px 0" }}>{stars(r.rating)}<small>{day(r.created_at)}</small></div><p>{r.body}</p></div><SubmittedMenu id={r.id} editable={new Date(r.created_at).getTime() > requestTime() - 30 * 864e5} /></li>; })}{!subs.length && <li className="ce-card rv-empty"><b>No reviews yet</b><p>Your published reviews will appear here.</p></li>}</ol>}
      </div>
      <aside className="rv-side">
        <section className="ce-card rv-agent"><div className="k-row" style={{ gap: 10 }}><FileText size={24} className="pw-spark" /><b>Need a starting point?</b></div><p>Start from a short template with your booking details filled in, then make it your own.</p><Link className="k-btn outline rv-help" href={`/account/reviews?${target ? `item=${target.id}&` : ""}draft=1#write`}>Start from a template <ArrowRight size={15} /></Link></section>
        <section className="ce-card rv-guide"><div className="k-row" style={{ gap: 12 }}><span className="rv-guide-ic"><ShieldCheck size={22} /></span><b>Review guidelines</b></div>
          <ul>{[[MessageSquareText, "Be honest and constructive", "Share what went well and what could be improved.", "blue"], [CircleCheck, "Focus on your real experience", "All reviews are verified against completed bookings.", "purple"], [Lightbulb, "Keep it helpful", "Include details about quality, communication, value and reliability.", "amber"], [ImageIcon, "Add photos (optional)", "Photos help others see what to expect.", "blue"]].map(([I, h, d, c]) => { const Ic = I as typeof Star; return <li key={h as string}><span className={`rv-gi ${c}`}><Ic size={20} /></span><span><b>{h as string}</b><small>{d as string}</small></span></li>; })}</ul></section>
        <section className="ce-card rv-recent"><div className="k-between"><b>Your recent reviews</b><Link className="k-link" href="/account/reviews?tab=submitted">View all <ArrowRight size={13} /></Link></div>
          <ul>{subs.slice(0, 4).map(r => <li key={r.id}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={r.build_items?.image || "/assets/gd/oe-neon.webp"} alt="" /><div className="k-grow"><b>{r.build_items?.title}</b><small>{(CAT[r.build_items?.category ?? ""] ?? ["Booking"])[0]}</small><div className="k-row" style={{ gap: 10 }}>{stars(r.rating)}<small>{new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</small></div><p>{r.body}</p></div><SubmittedMenu id={r.id} editable={new Date(r.created_at).getTime() > requestTime() - 30 * 864e5} compact /></li>)}{!subs.length && <li className="k-small">Reviews you write will appear here.</li>}</ul></section>
      </aside>
    </div>
  </div>;
}
