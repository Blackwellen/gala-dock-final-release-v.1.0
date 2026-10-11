import Link from "next/link";
import { Star, MapPin, Home, Users, ArrowRight, Plus, CheckCircle2, Circle, Sparkles, UtensilsCrossed, Gem, Camera, Car, BedDouble, Music2, Flower2, MoreHorizontal, ChevronRight, ClipboardCheck } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { getMyEvent } from "@/lib/data/customer-events";
import { LISTING_COLS, type Listing } from "@/lib/data/marketplace";
import { CuEventHeader } from "@/components/customer/event-header";
import { ItemCta, ItemMenu, AddProviderDialog } from "@/components/customer/build-client";
import { Beta } from "@/components/kit";
import { money } from "@/lib/format";

export const metadata = { title: "My event" };
export const CU_STATUS: Record<string, [string, string]> = { confirmed: ["Confirmed", "green"], fulfilled: ["Completed", "green"], quoted: ["Pending quote", "blue"], available: ["Available", "blue"], sent: ["Requested", "purple"], awaiting: ["Requested", "purple"], held: ["Held", "blue"], suggested: ["Suggested", "gray"], standby: ["Standby", "gray"], declined: ["Declined", "red"], expired: ["No response", "gray"] };
const CTA: Record<string, string> = { confirmed: "View booking", quoted: "Review quote", available: "Book now", held: "Confirm booking", sent: "View proposal", awaiting: "View proposal", suggested: "Request quote", declined: "Find another", expired: "Request again" };

export default async function MyEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const ctx = await getCustomer(); const d = await getMyEvent(ctx, id); const e = d.e;
  const items = d.items.filter(i => !["cancelled"].includes(i.status) && i.role !== "backup").slice(0, 4);
  const { data: lst } = await ctx.supabase.from("listings").select(LISTING_COLS).eq("published", true).order("rating", { ascending: false }).limit(80);
  const listings = (lst ?? []) as unknown as Listing[];
  const { data: rev } = await ctx.supabase.from("listings").select("id,rating,review_count,location,capacity_max,details").in("id", items.map(i => i.listing_id).filter(Boolean) as string[]);
  const L = new Map((rev ?? []).map(r => [r.id, r]));
  const budget = Number(e.budget_total ?? 0); const est = d.s.pkg, paid = d.s.paid;
  const tickets = await ctx.supabase.from("ticket_tiers").select("id", { count: "exact", head: true }).eq("event_id", e.id);
  const checks = [["Venue confirmed", d.s.venueOk], ["Date and time set", !!e.starts_at], [`${d.s.confirmed} of ${d.s.providers} key providers confirmed`, d.s.providers > 0 && d.s.confirmed === d.s.providers], [tickets.count ? "Tickets set up" : "Tickets not set up", !!tickets.count], ["Finalise remaining providers", d.s.providers > 0 && d.s.confirmed === d.s.providers]] as [string, boolean][];
  const score = Math.round((100 * checks.filter(c => c[1]).length) / checks.length);
  const pendingQ = d.items.find(i => i.status === "quoted");
  const recs = [pendingQ ? `Review the ${pendingQ.category === "food" ? "catering " : ""}quote from ${pendingQ.title}.` : "Request quotes for your remaining categories.", tickets.count ? "Send invitations to your guests." : "Set up your ticket types for guests.", !d.items.some(i => i.category === "media") ? "Consider adding a photographer (3 great options)." : "Review your day plan timings."];
  const add = [["food", "Catering", UtensilsCrossed], ["styling", "Decor", Gem], ["media", "Photography", Camera], ["transport", "Transport", Car], ["extras", "Accommodation", BedDouble], ["entertainment", "Entertainment", Music2], ["styling", "Flowers", Flower2]] as const;
  const sugg = [["Add a live band", "Create an unforgettable atmosphere", "/assets/gd/sg-live-band.webp", "entertainment"], ["Wedding decor", "Transform your space", "/assets/gd/sg-wedding-decor.webp", "styling"], ["Photo booth", "Keep your guests entertained", "/assets/gd/sg-photo-booth.webp", "media"], ["Transport options", "Get your guests there easily", "/assets/gd/sg-transport.webp", "transport"]] as const;
  const forCat = (c: string) => listings.filter(l => c === "venue" ? l.kind === "venue" : l.kind === "service").map(l => ({ id: l.id, name: l.name, image: l.image, rating: l.rating, review_count: l.review_count, price_from: l.price_from, price_unit: l.price_unit, location: l.location, category: l.category }));
  return <div className="ce">
    <CuEventHeader d={d} tab="build" variant="full" />
    <div className="ce-grid">
      <section className="ce-card">
        <div className="k-between" style={{ alignItems: "flex-start", marginBottom: 14 }}><div><h2 className="ce-h2">Build your event package</h2><p className="ce-sub">Add and manage your venue, services and extras. Get quotes, compare options and confirm your bookings.</p></div><AddProviderDialog eventId={e.id} category="extras" label="Add provider or service" listings={forCat("service")} trigger="button" /></div>
        <div className="ce-items">{items.map(it => { const [sl, st] = CU_STATUS[it.status] ?? [it.status, "gray"]; const r = it.listing_id ? L.get(it.listing_id) : null; const perGuest = it.price_basis === "per_person" && (it.quote as { per_guest?: number }).per_guest;
          return <article key={it.id} className="ce-item">
            <div className="ce-item-img">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={it.image || "/assets/gd/oe-neon.webp"} alt="" /><span className={`ce-st ${st}`}><CheckCircle2 size={13} />{sl}</span></div>
            <div className="ce-item-body"><div className="k-row" style={{ gap: 8 }}><b className="ce-item-name">{it.title}</b>{r && <span className="ce-rate"><Star size={14} fill="#f59e0b" color="#f59e0b" /><b>{Number(r.rating).toFixed(1)}</b> ({r.review_count})</span>}</div>
              {it.category === "venue" ? <div className="ce-facts"><span><MapPin size={13} />{r?.location ?? e.location}</span><span><Home size={13} />{String((r?.details as Record<string, unknown>)?.setting ?? "Indoor & outdoor")}</span><span><Users size={13} />Up to {r?.capacity_max ?? e.capacity ?? "—"} guests</span></div>
                : <div className="ce-tags">{it.scope.split("•").map(x => x.trim()).filter(Boolean).slice(0, 4).map(x => <span key={x}>{x}</span>)}</div>}
              <Link className="k-link" href={`/account/events/${e.id}/build?item=${it.id}`}>View details <ArrowRight size={12} /></Link></div>
            <div className="ce-item-price"><b>{perGuest ? <>{money(perGuest)} <small>per guest</small></> : it.category === "media" && it.status === "suggested" ? `From ${money(it.amount)}` : money(it.amount)}</b><small>{it.status === "confirmed" ? "Total cost" : "Estimated"}</small><ItemCta eventId={e.id} it={it} label={CTA[it.status] ?? "View"} variant={it.status === "quoted" ? "primary" : "soft"} /></div>
            <ItemMenu eventId={e.id} it={it} />
          </article>; })}</div>
        <div className="ce-addmore"><span className="ce-addmore-ic"><Plus size={18} /></span><div className="k-grow"><b>Add more to your event</b><small>Catering, decor, transport, accommodation, entertainment and more.</small></div>
          {add.map(([c, l, I]) => <AddTile key={l} eventId={e.id} category={c} label={l} Icon={I} listings={forCat(c)} />)}<Link className="ce-addmore-it" href={`/account/events/${e.id}/build`}><MoreHorizontal size={18} /><small>More</small></Link></div>
        <h3 className="ce-h3">Smart suggestions for your event</h3>
        <div className="ce-sugg">{sugg.map(([t, s2, img, c]) => <div key={t} className="ce-sg">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={img} alt="" /><span className="k-grow"><b>{t}</b><small>{s2}</small></span><AddProviderDialog eventId={e.id} category={c} label={t} listings={forCat(c)} trigger="tile" /></div>)}<Link className="ce-sugg-next" href={`/account/events/${e.id}/build`} aria-label="More suggestions"><ChevronRight size={16} /></Link></div>
      </section>
      <div className="k-col" style={{ gap: 14 }}>
        <section className="ce-card"><h2 className="ce-h2 sm">Event readiness</h2><div className="ce-ready"><span className="ce-ring" style={{ ["--v" as string]: score }}><b>{score}%</b></span><ul>{checks.map(([l, ok]) => <li key={l}>{ok ? <CheckCircle2 size={17} className="k-green" fill="#10b981" color="#fff" /> : <Circle size={17} className="k-muted" />}{l}</li>)}</ul></div></section>
        <section className="ce-card ce-planner"><div className="k-row" style={{ gap: 8 }}><Sparkles size={24} className="k-blue" /><b style={{ fontSize: 16 }}>Gala Planner</b><Beta /></div><p className="ce-planner-q">Here&apos;s what I recommend next:</p><ol>{recs.map((r, i) => <li key={i}><span>{i + 1}</span>{r}</li>)}</ol><Link className="k-btn primary block lg" href={`/account/events/${e.id}/build`}>Continue planning with me <ArrowRight size={15} /></Link></section>
        <section className="ce-card"><div className="k-between"><h2 className="ce-h2 sm">Estimated budget</h2><Link className="k-link" href={`/account/events/${e.id}/money`}>Edit budget</Link></div>
          <div className="ce-budget-bar"><i style={{ width: `${budget ? Math.min(100, (paid / budget) * 100) : 0}%`, background: "#14b8a6" }} /><i style={{ width: `${budget ? Math.min(100, ((est - paid) / budget) * 100) : 0}%`, background: "#5eead4" }} /></div><div className="k-xs k-muted" style={{ textAlign: "right", marginTop: -14 }}>{money(budget)}</div>
          <div className="ce-budget"><span><b>{money(est)}</b><small>Estimated</small></span><span><b>{money(paid)}</b><small>Paid</small></span><span><b>{money(Math.max(0, budget - est))}</b><small>Remaining</small></span></div>
          <Link className="ce-breakdown" href={`/account/events/${e.id}/money`}><ClipboardCheck size={16} />View full breakdown <ArrowRight size={14} /></Link></section>
      </div>
    </div>
  </div>;
}
function AddTile({ eventId, category, label, Icon, listings }: { eventId: string; category: string; label: string; Icon: React.ComponentType<{ size?: number }>; listings: Parameters<typeof AddProviderDialog>[0]["listings"] }) {
  return <span className="ce-addmore-it"><Icon size={18} /><small>{label}</small><span className="ce-addmore-hit"><AddProviderDialog eventId={eventId} category={category} label={`Add ${label.toLowerCase()}`} listings={listings} trigger="link" /></span></span>;
}
