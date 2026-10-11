import Link from "next/link";
import { ArrowRight, Search, MapPin, CalendarDays, Clock, ChevronRight, CheckCircle2, Repeat, Tag, CircleHelp, X, Ticket } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { myTickets, ticketQr, whenLine } from "@/lib/data/customer-tickets";
import { TicketPanel, GroupActions, FilterSelect } from "@/components/customer/tickets-client";
import { eventTypeLabel } from "@/lib/format";
import { requestTime } from "@/lib/workspace/format";

export const metadata = { title: "My Tickets" };
const TONES: Record<string, string> = { music: "purple", festival: "blue", nightlife: "blue", food_drink: "green", party: "purple", comedy: "amber", wedding: "purple" };

export default async function MyTicketsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const ctx = await getCustomer(); const all = await myTickets(ctx);
  const tab = (["past", "resale"].includes(sp.tab ?? "") ? sp.tab : "upcoming") as "upcoming" | "past" | "resale";
  const q = (sp.q ?? "").toLowerCase(), type = sp.type ?? "", when = sp.when ?? "", loc = sp.loc ?? "";
  const now = requestTime();
  const list = all[tab].filter(g => (!q || `${g.event.name} ${g.event.venue_name} ${g.event.location} ${g.order}`.toLowerCase().includes(q)) && (!type || g.event.event_type === type) && (!loc || g.event.city === loc)
    && (!when || (() => { const t = g.event.starts_at ? new Date(g.event.starts_at).getTime() : 0; const d = (t - now) / 864e5; return when === "week" ? d <= 7 && d >= -7 : when === "month" ? d <= 31 && d >= -31 : when === "later" ? d > 31 : true; })()));
  const sel = sp.t === "none" ? null : list.find(g => g.key === sp.t) ?? list[0] ?? null;
  const qrs = sel && sel.when !== "resale" ? await Promise.all(sel.tickets.map(t => ticketQr(t))) : [];
  const types = [...new Set(all.groups.map(g => g.event.event_type))]; const cities = [...new Set(all.groups.map(g => g.event.city).filter(Boolean))];
  const href = (p: Record<string, string | undefined>) => { const u = new URLSearchParams(); const m = { tab, q: sp.q, type, when, loc, ...p }; for (const [k, v] of Object.entries(m)) if (v && !(k === "tab" && v === "upcoming")) u.set(k, v); const s = u.toString(); return `/account/tickets${s ? `?${s}` : ""}`; };

  return <div className="tk">
    <div className="tk-head"><div><h1>My Tickets</h1><p>Your upcoming events, past experiences and tickets you&apos;ve sold or transferred.</p></div><Link className="k-btn primary tk-browse" href="/discover?tab=events&results=1">Browse Events <ArrowRight size={18} /></Link></div>
    <div className={`tk-grid ${sel ? "" : "solo"}`}>
      <div className="tk-main">
        <nav className="ce-card tk-tabs" aria-label="Ticket lists">{([["upcoming", "Upcoming", all.upcoming], ["past", "Past", all.past], ["resale", "Resale / Transferred", all.resale]] as const).map(([k, l, g]) => <Link key={k} href={href({ tab: k, t: undefined })} aria-current={tab === k ? "page" : undefined}>{l} ({g.length})</Link>)}</nav>
        <form className="tk-filters" action="/account/tickets">
          {tab !== "upcoming" && <input type="hidden" name="tab" value={tab} />}
          <span className="tk-search"><Search size={18} /><input name="q" defaultValue={sp.q ?? ""} placeholder="Search your tickets..." aria-label="Search your tickets" /></span>
          <FilterSelect name="type" value={type} label="All event types" options={types.map(t => [t, eventTypeLabel(t)])} />
          <FilterSelect name="when" value={when} label="All dates" options={[["week", "This week"], ["month", "This month"], ["later", "Later"]]} />
          <FilterSelect name="loc" value={loc} label="All locations" options={cities.map(c => [c, c])} />
        </form>
        <ol className="tk-list">{list.map(g => { const n = g.tickets.length; const d = g.event.starts_at ? new Date(g.event.starts_at) : null; const first = g.tickets[0]!; const active = sel?.key === g.key;
          return <li key={g.key} className={`ce-card tk-card ${active ? "on" : ""}`}>
            <Link href={href({ t: g.key })} className="tk-img" aria-label={`Show ${g.event.name} tickets`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={g.event.cover_image || "/assets/gd/oe-neon.webp"} alt="" />{d && <span className="tk-date"><small>{d.toLocaleDateString("en-GB", { month: "short", timeZone: "Europe/London" }).toUpperCase()}</small><b>{d.toLocaleDateString("en-GB", { day: "numeric", timeZone: "Europe/London" })}</b></span>}</Link>
            <div className="tk-body">
              <div className="tk-top"><h2><Link href={href({ t: g.key })}>{g.event.name}</Link></h2><span className={`tk-state ${g.state.tone}`}>{g.state.tone === "green" ? <CheckCircle2 size={17} /> : g.state.label === "Available to transfer" ? <ArrowRight size={17} /> : g.state.label.startsWith("Resale") ? <Tag size={15} /> : g.state.label === "Transferred" ? <Repeat size={15} /> : <Clock size={15} />}{g.state.label}</span><span className="tk-count">{n > 1 && g.when !== "resale" ? `Ticket 1 of ${n}` : `${n} ticket${n === 1 ? "" : "s"}`}</span><Link href={`/account/tickets/${first.id}`} className="tk-chev" aria-label={`Open ${g.event.name} ticket`}><ChevronRight size={18} /></Link></div>
              <p className="tk-line"><MapPin size={16} />{[g.event.venue_name, g.event.city].filter(Boolean).join(", ") || g.event.location}</p>
              <p className="tk-line">{g.when === "past" ? <CalendarDays size={16} /> : <Clock size={16} />}{whenLine(g.event)}</p>
              <div className="tk-foot"><div className="tk-tags">{[...new Map([eventTypeLabel(g.event.event_type), ...(g.event.tags ?? []).slice(0, 2), first.tier?.name].filter((x): x is string => !!x).map(x => [x.toLowerCase(), x])).values()].slice(0, 3).map((t, i) => <span key={`${t}${i}`} className={`tk-tag ${i === 0 ? TONES[g.event.event_type] ?? "blue" : i === 2 && /vip/i.test(String(t)) ? "amber" : ""}`}>{t}</span>)}</div>
                <GroupActions group={{ key: g.key, when: g.when, firstId: first.id, ids: g.tickets.map(t => t.id), statuses: g.tickets.map(t => t.status), name: g.event.name, slug: g.event.slug, transfers: g.event.settings?.transfers !== false, n }} /></div>
            </div>
          </li>; })}
          {!list.length && <li className="ce-card tk-empty"><Ticket size={28} /><b>{q || type || when || loc ? "No tickets match your filters" : tab === "upcoming" ? "No upcoming tickets yet" : tab === "past" ? "No past events yet" : "Nothing sold or transferred"}</b><p>{tab === "upcoming" ? "Find something brilliant to go to — your tickets will appear here." : "Tickets you've used, sold or passed on will show up here."}</p><Link className="k-btn primary" href="/discover?tab=events&results=1">Browse events</Link></li>}
        </ol>
      </div>
      {sel && <aside className="tk-side">
        <section className="ce-card tk-panel">
          <div className="tk-hero">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={sel.event.cover_image || "/assets/gd/oe-neon.webp"} alt="" /><Link href={href({ t: "none" })} className="tk-close" aria-label="Close ticket panel"><X size={20} /></Link>
            <div><h2>{sel.event.name}</h2><p><MapPin size={15} />{[sel.event.venue_name, sel.event.city].filter(Boolean).join(", ")}</p><p><CalendarDays size={15} />{whenLine(sel.event)}</p></div></div>
          <TicketPanel when={sel.when} slug={sel.event.slug} transfers={sel.event.settings?.transfers !== false} tickets={sel.tickets.map((t, i) => ({ id: t.id, code: t.code, status: t.status, tier: t.tier?.name ?? "Admission", sub: t.tier?.description || (t.tier?.kind === "vip" ? "VIP Entry" : "Standard Entry"), gate: String((sel.event.settings?.entry_gate as string | undefined) ?? "Main Gate A"), seat: t.seat, qr: qrs[i] ?? null, attendee: t.attendee_name }))} />
        </section>
        <Link href="/help?topic=tickets" className="ce-card tk-help"><span className="tk-help-ic"><CircleHelp size={22} /></span><span className="k-grow"><b>Need help with your ticket?</b><small>View entry information, transfer rules or contact support.</small></span><ChevronRight size={18} /></Link>
      </aside>}
    </div>
  </div>;
}
