import Link from "next/link";
import { Search, PenSquare, ArrowRight, Phone, Video, MoreHorizontal, CheckCircle2, Clock4, Star, MapPin, ChevronRight, Paperclip, CalendarDays, FileText, LifeBuoy, X, Copy, Users } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { getMyEvent } from "@/lib/data/customer-events";
import { CuEventHeader } from "@/components/customer/event-header";
import { Conversation } from "@/components/customer/guests-client";
import { relative, dateShort, time12 } from "@/lib/format";
import { requestTime } from "@/lib/workspace/format";

export const metadata = { title: "Messages" };
const STC: Record<string, string> = { "Booking confirmed": "green", Confirmed: "green", "Response required": "red", "Quote received": "blue", Pending: "amber" };

export default async function MessagesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]); const ctx = await getCustomer(); const d = await getMyEvent(ctx, id); const e = d.e;
  const tab = (["venue", "supplier"].includes(sp.tab ?? "") ? sp.tab : "all") as "all" | "venue" | "supplier"; const q = (sp.q ?? "").toLowerCase();
  const { data: threads } = await ctx.supabase.from("threads").select("id,title,subtitle,image,kind,listing_id,build_item_id,response_due_at,updated_at,messages(id,body,sender_name,from_provider,created_at,read_at,attachments)").eq("event_id", e.id).order("updated_at", { ascending: false });
  const T = (threads ?? []).filter(t => (tab === "all" || t.kind === tab) && (!q || `${t.title} ${t.subtitle}`.toLowerCase().includes(q)));
  const sel = T.find(t => t.id === sp.thread) ?? T.find(t => sp.listing && t.listing_id === sp.listing) ?? T[0];
  const msgs = [...(sel?.messages ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)) as unknown as { id: string; body: string; sender_name: string; from_provider: boolean; created_at: string; read_at: string | null; attachments: { name: string; type: string; size: string }[] }[];
  const item = sel?.build_item_id ? d.items.find(i => i.id === sel.build_item_id) : sel?.listing_id ? d.items.find(i => i.listing_id === sel.listing_id) : null;
  const { data: l } = sel?.listing_id ? await ctx.supabase.from("listings").select("rating,review_count,location,details,category").eq("id", sel.listing_id).maybeSingle() : { data: null };
  const base = `/account/events/${e.id}/messages`;
  const due = sel?.response_due_at; const daysLeft = due ? Math.max(0, Math.ceil((new Date(due).getTime() - requestTime()) / 864e5)) : null;
  const atts = msgs.flatMap(m => m.attachments ?? []);
  const sub = (s: string) => { const [cat, st] = s.split(" • "); return { cat, st: st ?? "" }; };
  return <div className="ce">
    <CuEventHeader d={d} tab="messages" variant="compact" buildPath />
    <div className="cm-grid">
      <aside className="ce-card cm-list">
        <div className="k-row" style={{ gap: 8 }}><div className="cm-ltabs">{([["all", "All"], ["venue", "Venue"], ["supplier", "Suppliers"]] as const).map(([k, lb]) => <Link key={k} href={k === "all" ? base : `${base}?tab=${k}`} aria-current={(tab === k) ? "page" : undefined}>{lb}</Link>)}</div><Link className="k-icon-btn cm-sq" href={`/account/events/${e.id}/build`} aria-label="Start a conversation from your build"><ArrowRight size={16} /></Link></div>
        <div className="k-row" style={{ gap: 8, marginTop: 10 }}><form className="k-input-icon k-grow" action={base}><Search size={15} /><input className="k-input" name="q" defaultValue={sp.q ?? ""} placeholder="Search messages..." aria-label="Search messages" style={{ height: 38 }} /></form><Link className="k-icon-btn cm-sq" href={`/account/events/${e.id}/build`} aria-label="New message"><PenSquare size={16} /></Link></div>
        <ul className="cm-threads">{T.map(t => { const ms = [...(t.messages ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)); const last = ms[0]; const unread = ms.filter(m => m.from_provider && !m.read_at).length; const s = sub(t.subtitle);
          return <li key={t.id}><Link href={`${base}?thread=${t.id}${tab !== "all" ? `&tab=${tab}` : ""}`} className="cm-th" aria-current={sel?.id === t.id ? "true" : undefined}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={t.image || "/assets/gd/oe-neon.webp"} alt="" /><span className="k-grow" style={{ minWidth: 0 }}><span className="k-between"><b>{t.title}</b><small>{last ? (requestTime() - new Date(last.created_at).getTime() < 864e5 ? time12(last.created_at) : relative(last.created_at).replace("1 day ago", "Yesterday")) : ""}</small></span><span className={`cm-st ${STC[s.st] ?? "gray"}`}>{s.st && <i />}{s.cat}{s.st ? ` • ${s.st}` : ""}</span><span className="cm-prev">{last ? `${last.from_provider ? `${last.sender_name.split(" ")[0]}: ` : "You: "}${last.body}` : "No messages yet"}</span></span>{unread > 0 && <span className={`cm-badge ${s.st === "Response required" ? "red" : ""}`}>{unread}</span>}</Link></li>; })}
          <li><span className="cm-th"><span className="cm-team"><Users size={20} /></span><span className="k-grow"><span className="k-between"><b>General Event Team</b><small>Organizer feature</small></span><span className="cm-st blue">Team chat available on Organizer</span><span className="cm-prev">Upgrade to collaborate with a team.</span></span></span></li></ul>
      </aside>
      <section className="ce-card cm-conv">{sel ? <>
        <div className="cm-head">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={sel.image || "/assets/gd/oe-neon.webp"} alt="" /><span className="k-grow"><b>{sel.title}</b>{item && <span className={`gt-st ${item.status === "confirmed" ? "green" : "amber"}`}><i />{item.status === "confirmed" ? "Confirmed booking" : item.status === "quoted" ? "Quote received" : "Request open"}</span>}</span><span className="k-icon-btn cm-ib" role="img" aria-label="Call"><Phone size={17} /></span><span className="k-icon-btn cm-ib" role="img" aria-label="Video"><Video size={17} /></span><Link className="k-btn ghost" href={`/account/events/${e.id}/build`}>View booking</Link><span className="k-icon-btn cm-ib"><MoreHorizontal size={17} /></span></div>
        {due && daysLeft != null && <div className="cm-req"><span className="cm-req-ic"><Clock4 size={14} /></span><span className="k-grow"><b>Response required</b><small>Please confirm guest numbers by {dateShort(due)} ({daysLeft} days remaining)</small></span><Link className="k-link" href={`/account/events/${e.id}/build`}>View details <ArrowRight size={12} /></Link></div>}
        <Conversation threadId={sel.id} title={sel.title} messages={msgs} myName={ctx.name} avatar={sel.image || "/assets/gd/oe-neon.webp"} />
      </> : <p className="k-small" style={{ padding: 20 }}>No conversations yet. Request a quote from your build to start one.</p>}</section>
      <aside className="ce-card cm-info">{sel && <>
        <div className="k-between"><h2 className="ce-h2 sm" style={{ margin: 0 }}>Thread information</h2><X size={16} className="k-muted" /></div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sel.image || "/assets/gd/oe-neon.webp"} alt="" className="cm-info-img" />
        <div className="k-row" style={{ gap: 8, marginTop: 10 }}><b style={{ fontSize: 14 }}>{sel.title}</b>{l && <span className="ce-rate"><Star size={13} fill="#f59e0b" color="#f59e0b" /><b>{Number(l.rating).toFixed(1)}</b> ({l.review_count})</span>}</div>
        <p className="k-small">{item?.package ?? l?.category ?? ""}{l?.details && (l.details as Record<string, unknown>).setting ? ` • ${String((l.details as Record<string, unknown>).setting)}` : ""}</p>
        {l && <p className="k-small k-row" style={{ gap: 6, marginTop: 6 }}><MapPin size={13} />{l.location}</p>}
        <div className="k-grid k-g2" style={{ gap: 8, marginTop: 12 }}><Link className="k-btn outline" href={sel.listing_id ? `/${sel.kind === "venue" ? "venues" : "services"}/${sel.listing_id}` : "/discover"}>View profile</Link><Link className="k-btn outline" href={`/account/events/${e.id}/build`}>View booking</Link></div>
        <div className="k-between" style={{ marginTop: 16 }}><b style={{ fontSize: 14 }}>Booking status</b>{item && <span className={`gt-st ${item.status === "confirmed" ? "green" : "amber"}`}><CheckCircle2 size={12} />{item.status === "confirmed" ? "Confirmed" : item.status}</span>}</div>
        <dl className="cm-dl"><div><dt>Booking reference</dt><dd>GLD-{e.id.slice(0, 4).toUpperCase()}-{(item?.id ?? sel.id).slice(0, 4).toUpperCase()} <Copy size={12} className="k-blue" /></dd></div><div><dt>Event date</dt><dd>{dateShort(e.starts_at)}, {time12(e.starts_at)}</dd></div><div><dt>Access time</dt><dd>From 10:00 AM</dd></div><div><dt>Guest capacity</dt><dd>Up to {e.capacity ?? e.guest_count} guests</dd></div></dl>
        <ul className="cm-links">{due && <li><Clock4 size={16} className="k-red" /><b>Response deadline</b><span className="k-red k-small">{daysLeft} days remaining</span><ChevronRight size={14} /></li>}<li><Paperclip size={16} /><b>Attachments</b><span className="cm-n">{atts.length}</span><ChevronRight size={14} /></li><li><CalendarDays size={16} /><b>Shared booking details</b><ChevronRight size={14} /></li><li><FileText size={16} /><b>Message templates</b><ChevronRight size={14} /></li><li><Link href="/help" className="k-row" style={{ gap: 10, flex: 1 }}><LifeBuoy size={16} /><b>Escalate to support</b></Link><ChevronRight size={14} /></li></ul></>}</aside>
    </div>
  </div>;
}
