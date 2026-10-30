import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, MapPin, CalendarDays, Ticket, Info, Clock, IdCard, ShieldCheck, Tag, ChevronRight, CircleHelp, FileText, Navigation, Map as MapIcon, BookOpen, Printer, Download, Video } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { ticketQr, whenLine, type TicketRow } from "@/lib/data/customer-tickets";
import { ManageTicket, AttendeeCard } from "@/components/customer/tickets-detail";
import { eventTypeLabel } from "@/lib/format";
import { TicketCredential } from "@/components/tickets/ticket-credential";
import { untyped } from "@/lib/workspace/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { myOnlineSessions } from "@/lib/virtual/my-online";
import { OnlineSessions } from "@/components/customer/online-sessions";
import { PublicPlan } from "@/components/venue-plan/public-plan";
import { SponsorsSection } from "@/components/public/event-sections";
import { loadEventExtras } from "@/lib/public/event-extras";
import { loadGettingThere } from "@/lib/public/getting-there";
import { EventGettingThere } from "@/components/public/event-getting-there";

export const metadata = { title: "Ticket" };
const COLS = "id,code,status,seat,order_ref,attendee_name,attendee_email,price_paid,checked_in_at,created_at,qr_nonce,replaced_by,tier:ticket_tiers(id,name,kind,description),event:events!inner(id,name,slug,starts_at,ends_at,venue_name,location,city,cover_image,event_type,tags,settings,venue_listing_id)";
const stamp = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Europe/London" }).replace(" am", " AM").replace(" pm", " PM");

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { id } = await params; if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getCustomer();
  const { data } = await ctx.supabase.from("tickets").select(COLS).eq("id", id).eq("holder_id", ctx.user.id).maybeSingle();
  if (!data) notFound();
  const t = data as unknown as TicketRow & { event: TicketRow["event"] & { venue_listing_id: string | null } };
  const e = t.event; const s = (e.settings ?? {}) as Record<string, unknown>;
  // Online session (virtual / hybrid events): null when the event has none.
  const { data: virtualRaw } = await ctx.supabase.rpc("event_virtual_public" as never, { p_event: e.id } as never);
  const online = virtualRaw as { format?: string; provider?: string; opens_minutes_before?: number; replay_available?: boolean } | null;
  // Q29 sessions (main / breakouts / workshops) with per-session join and replay state; the legacy single link is the fallback.
  const sessions = ["valid", "used"].includes(t.status) ? await myOnlineSessions(ctx.supabase as unknown as SupabaseClient, e.id) : [];
  const [{ data: siblings }, { data: scans }, { data: venue }, qr] = await Promise.all([
    ctx.supabase.from("tickets").select("id,status,tier:ticket_tiers(name)").eq("holder_id", ctx.user.id).eq("event_id", e.id).eq("order_ref", t.order_ref).order("created_at"),
    ctx.supabase.from("check_ins").select("result,created_at").eq("ticket_id", t.id).order("created_at"),
    e.venue_listing_id ? ctx.supabase.from("listings").select("name,image,location,lat,lng,slug,kind,id").eq("id", e.venue_listing_id).maybeSingle() : Promise.resolve({ data: null }),
    ticketQr(t),
  ]);
  const sib = (siblings ?? []) as unknown as { id: string; status: string; tier: { name: string } | null }[];
  const idx = Math.max(0, sib.findIndex(x => x.id === t.id));
  const d = e.starts_at ? new Date(e.starts_at) : null;
  const STATUS: Record<string, [string, string]> = { valid: ["Active", "green"], used: ["Used", "gray"], resale_listed: ["Listed for resale", "amber"], transferred: ["Transferred", "blue"], resold: ["Resold", "gray"], refunded: ["Refunded", "gray"], cancelled: ["Cancelled", "red"] };
  const [sl, tone] = STATUS[t.status] ?? [t.status, "gray"];
  const proceeds=t.status==='resold'?await untyped(ctx.supabase).from('resale_payouts').select('status,amount').eq('ticket_id',t.id).eq('seller_id',ctx.user.id).maybeSingle():null;
  if(proceeds?.error)throw new Error('Could not load your resale refund status. Try again.');
  const payout=proceeds?.data;
  const venueName = venue?.name ?? e.venue_name ?? e.city; const venueAddr = venue?.location ?? e.location;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([venueName, venueAddr].filter(Boolean).join(", "))}`;
  // Event map / programme / partners from the public-safe sources (published public events); the holder's tier and gate are highlighted.
  const [x, { data: tierRows }, { data: prog }, gt] = await Promise.all([
    loadEventExtras(ctx.supabase, { id: e.id, venue_listing_id: e.venue_listing_id }),
    ctx.supabase.from("ticket_tiers").select("id,name,color").eq("event_id", e.id).order("sort"),
    ctx.supabase.from("programme_items").select("id,title,area,starts_at,segment").eq("event_id", e.id).eq("kind", "programme").order("starts_at").limit(40),
    loadGettingThere(ctx.supabase, e.id),   // lane D: same public getting-there info as the event page (202610294081)
  ]);
  const myTier = (t.tier as { id?: string } | null)?.id ?? null;
  const tm = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/London" }) : "";
  // No invented entry details: the gate is the organiser's settings.entry_gate, else the plan's only entrance; doors are the
  // programme's "doors" item. Either is left out when the organiser hasn't set it.
  const entrances = [...x.plan.base, ...x.plan.overlay].filter(el => el.type === "entrance" && !el.hidden && el.label?.trim()).map(el => el.label.trim());
  const gate = (typeof s.entry_gate === "string" && s.entry_gate.trim()) || (new Set(entrances).size === 1 ? entrances[0]! : null);
  const doorsAt = (prog ?? []).find(p => (p as { segment?: string | null }).segment === "doors")?.starts_at ?? null;
  const doors = doorsAt ? new Date(doorsAt).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Europe/London" }).toUpperCase() : null;
  const history = [["Ticket issued", t.created_at, true], ...(scans ?? []).map(c => [c.result === "admitted" ? "Scanned at entry" : `Scan ${c.result}`, c.created_at, true] as [string, string, boolean])] as [string, string, boolean][];

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
          {/* Valid tickets show a signed, 30-second rotating code (screenshots expire; transfer/resale kills it). */}
          {t.status === "valid" ? <div className="td-cred"><TicketCredential defaultMode={(["qr", "visual", "barcode"].includes(String(s.ticket_display)) ? s.ticket_display : "qr") as "qr" | "visual" | "barcode"} allowSwitch={s.ticket_display_switch !== false} compact
              ticket={{ id: t.id, code: t.code, status: t.status, event: e.name, date: d ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }) : "Date TBC", time: whenLine(e).split("•").pop()?.trim() ?? "", venue: [e.venue_name, e.city].filter(Boolean).join(", ") || e.location, holder: t.attendee_name || ctx.name, tier: t.tier?.name ?? "General Admission", seat: t.seat, orderRef: t.order_ref ?? "", artwork: e.cover_image, rules: [gate && `Entry via ${gate}.`, doors && `Doors ${doors}.`].filter(Boolean).join(" "), transfer: s.transfers !== false ? "Transferable in Gala Dock" : "Non-transferable" }} /></div>
            : <div className="tk-qr td-qr dim">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={qr} alt={`QR code for ticket ${t.code}`} /><span className="tk-qr-void">{t.status === "resale_listed" ? "Paused while listed" : sl}</span></div>}
          {sp.join && <div className="k-notice amber td-join-note" role="status">{sp.join.slice(0, 200)}</div>}
          {t.status === "valid" && online && !sessions.length && <div className="td-join"><Link className="k-btn primary" href={`/tickets/${t.id}/join`}><Video size={15} />Join event</Link><small>{online.opens_minutes_before ? `Opens ${online.opens_minutes_before} min before start` : "Online session"}{online.replay_available ? " · replay available" : ""}</small></div>}
          {t.status === "valid" && s.print_tickets !== false && <div className="td-print"><Link className="k-btn outline sm" href={`/account/tickets/${t.id}/print`} target="_blank"><Printer size={14} />Print ticket</Link><a className="k-btn outline sm" href={`/api/tickets/${t.id}/pdf`}><Download size={14} />Download PDF</a></div>}
          <b className="tk-code td-code">{t.code}</b>
          <span className={`tk-valid ${tone}`}>{tone === "green" ? "✓ Valid for entry" : sl}</span>
          <dl className="td-facts">{gate && <div><dt><MapPin size={20} /></dt><dd><small>Entry gate</small><b>{gate}</b></dd></div>}<div><dt><Ticket size={20} /></dt><dd><small>Ticket type</small><b>{t.tier?.name ?? "Admission"}</b></dd></div><div><dt><i className={`td-dot ${tone}`} /></dt><dd><small>Status</small><b>{sl}</b></dd></div><div><dt><FileText size={20} /></dt><dd><small>Order reference</small><b>{t.order_ref}</b></dd></div></dl>
        </div></section>
        <OnlineSessions ticketId={t.id} sessions={sessions} />
        <PublicPlan id="ticket-map" title="Event map" intro={myTier ? "Your ticket's area is highlighted; other areas are greyed out." : undefined} label={`Event map for ${e.name}`} base={x.plan.base} overlay={x.plan.overlay} spaces={x.plan.spaces}
          tiers={(tierRows ?? []).map(r => ({ id: r.id, name: r.name, color: r.color }))} mineTier={myTier} gate={gate} />
        {(prog ?? []).length > 0 && <section className="ce-card pe3-sched" aria-labelledby="td-prog-h"><h2 id="td-prog-h">Programme</h2><ol className="pe-sched-l">{(prog ?? []).map(p => <li key={p.id}><time>{tm(p.starts_at)}</time><span className="k-grow"><b>{p.title}</b></span>{p.area && <em>{p.area}</em>}</li>)}</ol></section>}
        <SponsorsSection partners={x.extras.partners} />
        <section className="ce-card td-info"><h2><Info size={18} />Important information</h2><ul>{[[Clock, "Arrive early", doors ? `Gates open at ${doors}. We recommend arriving at least 30 minutes before your preferred set.` : "Arrive at least 30 minutes before the start."], [IdCard, "Valid ID may be required", "Bring a valid photo ID matching the ticket holder's name."], [ShieldCheck, "Non-transferable after entry", "Once scanned, this ticket cannot be transferred or resold."], [Tag, "Official resale only", "Only use our official resale platform to ensure your ticket remains valid."]].map(([I, h, p]) => { const Ic = I as typeof Clock; return <li key={h as string}><Ic size={20} /><span className="k-grow"><b>{h as string}</b><small>{p as string}</small></span><ChevronRight size={16} /></li>; })}</ul></section>
        <div className="td-two">
          <section className="ce-card td-hist"><h2><Info size={18} />Entry history</h2><p>{(scans ?? []).length ? `Scanned ${(scans ?? []).length} time${(scans ?? []).length === 1 ? "" : "s"}.` : "This ticket has not been scanned yet."}</p><ol>{history.map(([l, at], k) => <li key={`${l}${k}`} className={k === 0 ? "on" : ""}><b>{l}</b><small>{stamp(at)}</small></li>)}</ol></section>
          <section className="ce-card td-sibs"><h2>Your tickets for this event</h2><p>{sib.length} ticket{sib.length === 1 ? "" : "s"} • Order {t.order_ref}</p><ul>{sib.map((x, k) => { const [l, tn] = STATUS[x.status] ?? [x.status, "gray"]; return <li key={x.id}><Link href={`/account/tickets/${x.id}`} aria-current={x.id === t.id ? "page" : undefined}><Ticket size={20} /><span className="k-grow"><b>Ticket {k + 1}</b><small>{x.tier?.name ?? "Admission"}</small></span><span className={`td-pill ${tn}`}>{l}</span><ChevronRight size={16} /></Link></li>; })}</ul></section>
        </div>
      </div>
      <aside className="td-side">
        {t.status==='resold'&&<section className="ce-card td-own"><h2>Resale refund</h2><p role="status">{payout?.status==='paid'?'The payment provider confirmed your ticket-price refund to your original payment method. Your bank controls when it appears.':payout?.status==='cancelled'?'The resale refund was cancelled. Check your original order for the event cancellation refund.':payout?.status==='failed'?'Your refund needs another attempt or support review. It has not been confirmed as paid.':'Your ticket-price refund to your original payment method is pending confirmation.'}</p><p>Your original booking fee is excluded from resale proceeds.</p><Link href="/help?topic=tickets">Ticket refund help</Link></section>}
        <ManageTicket ticket={{ id: t.id, code: t.code, status: t.status, qr, name: e.name, transfers: s.transfers !== false }} />
        <section className="ce-card td-own"><h2>Ticket ownership</h2><div className="td-own-row">{ctx.profile?.avatar_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={ctx.profile.avatar_url} alt="" /> : <span className="td-av">{ctx.name.slice(0, 1)}</span>}<span className="k-grow"><b>{ctx.name} <i>You</i></b><small>{ctx.user.email}</small></span><ChevronRight size={18} /></div></section>
        <AttendeeCard ticket={{ id: t.id, status: t.status, name: t.attendee_name || ctx.name, email: t.attendee_email || ctx.user.email || "", phone: String((ctx.profile as { phone?: string } | null)?.phone ?? ""), checked: !!t.checked_in_at }} />
        <EventGettingThere data={gt} maps={maps} id="td-getting-there" />
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
