import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, MapPin, CalendarDays, Ticket, Info, Clock, IdCard, ShieldCheck, Tag, ChevronRight, CircleHelp, FileText, Navigation, Map as MapIcon, BookOpen } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { ticketQr, whenLine, type TicketRow } from "@/lib/data/customer-tickets";
import { ManageTicket, AttendeeCard } from "@/components/customer/tickets-detail";
import { eventTypeLabel } from "@/lib/format";

export const metadata = { title: "Ticket" };
const COLS = "id,code,status,seat,order_ref,attendee_name,attendee_email,price_paid,checked_in_at,created_at,qr_nonce,replaced_by,tier:ticket_tiers(name,kind,description),event:events!inner(id,name,slug,starts_at,ends_at,venue_name,location,city,cover_image,event_type,tags,settings,venue_listing_id)";
const stamp = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Europe/London" }).replace(" am", " AM").replace(" pm", " PM");

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getCustomer();
  const { data } = await ctx.supabase.from("tickets").select(COLS).eq("id", id).eq("holder_id", ctx.user.id).maybeSingle();
  if (!data) notFound();
  const t = data as unknown as TicketRow & { event: TicketRow["event"] & { venue_listing_id: string | null } };
  const e = t.event; const s = (e.settings ?? {}) as Record<string, unknown>;
  const [{ data: siblings }, { data: scans }, { data: venue }, qr] = await Promise.all([
    ctx.supabase.from("tickets").select("id,status,tier:ticket_tiers(name)").eq("holder_id", ctx.user.id).eq("event_id", e.id).eq("order_ref", t.order_ref).order("created_at"),
    ctx.supabase.from("check_ins").select("result,created_at").eq("ticket_id", t.id).order("created_at"),
    e.venue_listing_id ? ctx.supabase.from("listings").select("name,image,location,lat,lng,slug,kind,id").eq("id", e.venue_listing_id).maybeSingle() : Promise.resolve({ data: null }),
    ticketQr(t),
  ]);
  const sib = (siblings ?? []) as unknown as { id: string; status: string; tier: { name: string } | null }[];
  const idx = Math.max(0, sib.findIndex(x => x.id === t.id));
  const d = e.starts_at ? new Date(e.starts_at) : null;
  const gate = String(s.entry_gate ?? "Main Gate A"); const doors = e.starts_at ? new Date(new Date(e.starts_at).getTime() - 60 * 6e4).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Europe/London" }).toUpperCase() : null;
  const STATUS: Record<string, [string, string]> = { valid: ["Active", "green"], used: ["Used", "gray"], resale_listed: ["Listed for resale", "amber"], transferred: ["Transferred", "blue"], resold: ["Resold", "gray"], refunded: ["Refunded", "gray"], cancelled: ["Cancelled", "red"] };
  const [sl, tone] = STATUS[t.status] ?? [t.status, "gray"];
  const venueName = venue?.name ?? e.venue_name ?? e.city; const venueAddr = venue?.location ?? e.location;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([venueName, venueAddr].filter(Boolean).join(", "))}`;
  const history = [["Purchased", t.created_at, true], ["Ticket issued", new Date(new Date(t.created_at).getTime() + 6e4).toISOString(), true], ...(scans ?? []).map(c => [c.result === "admitted" ? "Scanned at entry" : `Scan ${c.result}`, c.created_at, true] as [string, string, boolean]), ...(t.status === "valid" && !(scans ?? []).length ? [["Ready for entry", new Date(new Date(t.created_at).getTime() + 6e4).toISOString(), true] as [string, string, boolean]] : [])] as [string, string, boolean][];

  return <div className="td">
    <Link className="td-back" href="/account/tickets"><ArrowLeft size={15} />Back to My Tickets</Link>
    <section className="td-hero">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={e.cover_image || "/assets/gd/oe-neon.webp"} alt="" />
      <div className="td-hero-in">{d && <span className="tk-date lg"><small>{d.toLocaleDateString("en-GB", { month: "short", timeZone: "Europe/London" }).toUpperCase()}</small><b>{d.toLocaleDateString("en-GB", { day: "numeric", timeZone: "Europe/London" })}</b></span>}
        <h1>{e.name}</h1><p><MapPin size={16} />{[e.venue_name, e.city].filter(Boolean).join(", ") || e.location}</p><p><CalendarDays size={16} />{whenLine(e)}</p>
        <div className="td-tags">{[...new Map([eventTypeLabel(e.event_type), ...(e.tags ?? []).slice(0, 2), t.tier?.name].filter((x): x is string => !!x).map(x => [x.toLowerCase(), x])).values()].slice(0, 3).map((x, i) => <span key={`${x}${i}`} className={i === 0 ? "p" : i === 1 ? "b" : ""}>{x}</span>)}</div></div>
      {e.slug && <Link className="k-btn td-page" href={`/events/${e.slug}`}>View event page <ArrowRight size={15} /></Link>}
    </section>
    <div className="td-grid">
      <div className="td-main">
        <section className="td-ticket"><div className="td-tin">
          <div className="k-between" style={{ alignItems: "flex-start" }}><div className="k-row" style={{ gap: 16, alignItems: "flex-start" }}><Ticket size={30} className="td-ticon" /><div><h2>{t.tier?.name ?? "Admission"}</h2><p>{t.seat ? `Seat ${t.seat}` : t.tier?.kind === "vip" ? "VIP Entry" : "Standard Entry"}</p>{t.tier?.description && <p className="k-muted">{t.tier.description}</p>}</div></div><span className="td-n">Ticket {idx + 1} of {sib.length || 1}</span></div>
          <div className={`tk-qr td-qr ${t.status === "valid" ? "" : "dim"}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={qr} alt={`QR code for ticket ${t.code}`} /><span className="tk-qr-logo" aria-hidden>G</span>{t.status !== "valid" && <span className="tk-qr-void">{t.status === "resale_listed" ? "Paused while listed" : sl}</span>}</div>
          <b className="tk-code td-code">{t.code}</b>
          <span className={`tk-valid ${tone}`}>{tone === "green" ? "✓ Valid for entry" : sl}</span>
          <dl className="td-facts"><div><dt><MapPin size={20} /></dt><dd><small>Entry gate</small><b>{gate}</b></dd></div><div><dt><Ticket size={20} /></dt><dd><small>Ticket type</small><b>{t.tier?.name ?? "Admission"}</b></dd></div><div><dt><i className={`td-dot ${tone}`} /></dt><dd><small>Status</small><b>{sl}</b></dd></div><div><dt><FileText size={20} /></dt><dd><small>Order reference</small><b>{t.order_ref}</b></dd></div></dl>
        </div></section>
        <section className="ce-card td-info"><h2><Info size={18} />Important information</h2><ul>{[[Clock, "Arrive early", doors ? `Gates open at ${doors}. We recommend arriving at least 30 minutes before your preferred set.` : "Arrive at least 30 minutes before the start."], [IdCard, "Valid ID may be required", "Bring a valid photo ID matching the ticket holder's name."], [ShieldCheck, "Non-transferable after entry", "Once scanned, this ticket cannot be transferred or resold."], [Tag, "Official resale only", "Only use our official resale platform to ensure your ticket remains valid."]].map(([I, h, p]) => { const Ic = I as typeof Clock; return <li key={h as string}><Ic size={20} /><span className="k-grow"><b>{h as string}</b><small>{p as string}</small></span><ChevronRight size={16} /></li>; })}</ul></section>
        <div className="td-two">
          <section className="ce-card td-hist"><h2><Info size={18} />Entry history</h2><p>{(scans ?? []).length ? `Scanned ${(scans ?? []).length} time${(scans ?? []).length === 1 ? "" : "s"}.` : "This ticket has not been scanned yet."}</p><ol>{history.map(([l, at], k) => <li key={`${l}${k}`} className={k === 0 ? "on" : ""}><b>{l}</b><small>{stamp(at)}</small></li>)}</ol></section>
          <section className="ce-card td-sibs"><h2>Your tickets for this event</h2><p>{sib.length} ticket{sib.length === 1 ? "" : "s"} • Order {t.order_ref}</p><ul>{sib.map((x, k) => { const [l, tn] = STATUS[x.status] ?? [x.status, "gray"]; return <li key={x.id}><Link href={`/account/tickets/${x.id}`} aria-current={x.id === t.id ? "page" : undefined}><Ticket size={20} /><span className="k-grow"><b>Ticket {k + 1}</b><small>{x.tier?.name ?? "Admission"}</small></span><span className={`td-pill ${tn}`}>{l}</span><ChevronRight size={16} /></Link></li>; })}</ul></section>
        </div>
      </div>
      <aside className="td-side">
        <ManageTicket ticket={{ id: t.id, code: t.code, status: t.status, qr, name: e.name, transfers: s.transfers !== false }} />
        <section className="ce-card td-own"><h2>Ticket ownership</h2><div className="td-own-row">{ctx.profile?.avatar_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={ctx.profile.avatar_url} alt="" /> : <span className="td-av">{ctx.name.slice(0, 1)}</span>}<span className="k-grow"><b>{ctx.name} <i>You</i></b><small>{ctx.user.email}</small></span><ChevronRight size={18} /></div></section>
        <AttendeeCard ticket={{ id: t.id, status: t.status, name: t.attendee_name || ctx.name, email: t.attendee_email || ctx.user.email || "", phone: String((ctx.profile as { phone?: string } | null)?.phone ?? ""), checked: !!t.checked_in_at }} />
        <section className="ce-card td-event"><h2>Event information</h2><Link href={e.slug ? `/events/${e.slug}` : "#"} className="td-event-row">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={e.cover_image || "/assets/gd/oe-neon.webp"} alt="" /><span className="k-grow"><b>{e.name}</b><small><MapPin size={13} />{[e.venue_name, e.city].filter(Boolean).join(", ")}</small><small><CalendarDays size={13} />{whenLine(e)}</small><span className="td-tags sm">{[...new Map([eventTypeLabel(e.event_type), ...(e.tags ?? []).slice(0, 2), t.tier?.name].filter((x): x is string => !!x).map(x => [x.toLowerCase(), x])).values()].slice(0, 3).map((x, i) => <span key={`${x}${i}`} className={i === 0 ? "p" : ""}>{x}</span>)}</span></span><ChevronRight size={18} /></Link>
          <div className="k-between td-venue-h"><h3>{venueName}</h3><a className="td-dir" href={maps} target="_blank" rel="noopener noreferrer"><Navigation size={13} />Get directions</a></div>
          {/* eslint-disable-next-line @next/next/no-img-element */}<img className="td-venue-img" src={venue?.image || e.cover_image || "/assets/gd/oe-neon.webp"} alt="" />
          <p className="td-addr"><MapPin size={15} />{venueAddr}</p>
          <div className="k-row" style={{ gap: 10 }}><a className="k-btn outline sm" href={maps} target="_blank" rel="noopener noreferrer"><MapIcon size={14} />View on map</a>{venue && <Link className="k-btn outline sm" href={`/${venue.kind === "venue" ? "venues" : "services"}/${venue.slug || venue.id}`}><BookOpen size={14} />See venue guide</Link>}</div></section>
        <Link href="/help?topic=tickets" className="ce-card tk-help"><span className="tk-help-ic"><CircleHelp size={22} /></span><span className="k-grow"><b>Need help with your ticket?</b><small>View entry information, transfer rules or contact support.</small></span><ChevronRight size={18} /></Link>
      </aside>
    </div>
  </div>;
}
