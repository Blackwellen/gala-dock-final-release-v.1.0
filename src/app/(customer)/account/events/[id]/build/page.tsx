import Link from "next/link";
import { Search, Building2, UtensilsCrossed, Wine, Music2, Camera, Flower2, Users, Lightbulb, Armchair, Car, Sparkles, ChevronRight, CheckCircle2, Circle, Lock, FileText, Clock4, XCircle, Columns3, Repeat, Star, MapPin, MoreHorizontal, Map as MapIcon, Wand2, AlertCircle, Mic, Video, Baby, Shield } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { getMyEvent, type MyEventFull } from "@/lib/data/customer-events";
import { LISTING_COLS, type Listing } from "@/lib/data/marketplace";
import { CuEventHeader } from "@/components/customer/event-header";
import { ItemCta, ItemMenu, AddProviderDialog } from "@/components/customer/build-client";
import { Beta } from "@/components/kit";
import { AgentAsk } from "@/components/kit/client";
import { CU_STATUS } from "../page";
import { money } from "@/lib/format";
import { buildCategoryOf } from "@/lib/build-categories";
import { listingHref } from "@/lib/links";
import { SortableBuild } from "@/components/customer/build-sortable";
import { PackageMenu } from "@/components/customer/build-menu";

export const metadata = { title: "Build" };
type Cat = { key: string; label: string; sub: string; icon: React.ComponentType<{ size?: number }>; color: string; need: "Foundation" | "Required" | "Optional" };
/** Categories adapt to event type. */
function categoriesFor(type: string): Cat[] {
  const base: Record<string, Cat> = {
    venue: { key: "venue", label: "Venue", sub: "Spaces & locations", icon: Building2, color: "#2563eb", need: "Foundation" },
    food: { key: "food", label: "Food & Catering", sub: "Menus & dining", icon: UtensilsCrossed, color: "#e11d48", need: "Required" },
    drinks: { key: "drinks", label: "Drinks & Bar", sub: "Bars, drinks & packages", icon: Wine, color: "#f59e0b", need: "Optional" },
    entertainment: { key: "entertainment", label: "Entertainment", sub: "Bands, DJs, performers", icon: Music2, color: "#7c3aed", need: "Optional" },
    media: { key: "media", label: "Media & Content", sub: "Photo, video & live streaming", icon: Camera, color: "#2563eb", need: "Optional" },
    styling: { key: "styling", label: "Styling & Decor", sub: "Themes, decor & flowers", icon: Flower2, color: "#e11d48", need: "Optional" },
    staff: { key: "staff", label: "Staff & Crew", sub: "Event staff & security", icon: Users, color: "#2563eb", need: "Optional" },
    production: { key: "production", label: "Production", sub: "Lighting, sound & staging", icon: Lightbulb, color: "#10b981", need: "Optional" },
    hire: { key: "hire", label: "Hire & Equipment", sub: "Furniture, AV & more", icon: Armchair, color: "#f59e0b", need: "Optional" },
    transport: { key: "transport", label: "Transport & Accommodation", sub: "Travel & guest stays", icon: Car, color: "#2563eb", need: "Optional" },
    extras: { key: "extras", label: "Extras", sub: "Activities, experiences & more", icon: Sparkles, color: "#e11d48", need: "Optional" },
  };
  if (type === "webinar") return [{ ...base.production!, label: "Streaming & Production", sub: "Platform, AV & tech rehearsal", need: "Foundation" }, { key: "speaker", label: "Speakers", sub: "Hosts & guest speakers", icon: Mic, color: "#7c3aed", need: "Required" }, { key: "media", label: "Access & Recording", sub: "Links, captions & replay", icon: Video, color: "#2563eb", need: "Optional" }, base.extras!];
  if (type === "childrens_party") return [base.venue!, { ...base.entertainment!, sub: "Age-suitable entertainers" }, base.food!, { key: "staff", label: "Supervision & Safety", sub: "DBS-checked staff, first aid", icon: Shield, color: "#10b981", need: "Required" }, { key: "extras", label: "Activities", sub: "Crafts, games & party bags", icon: Baby, color: "#e11d48", need: "Optional" }];
  if (type === "festival") return [base.venue!, { ...base.production!, need: "Required" }, { ...base.entertainment!, label: "Artists & Line-up", need: "Required" }, { ...base.staff!, need: "Required" }, base.food!, base.drinks!, base.hire!, base.extras!];
  if (type === "private_dinner") return [base.venue!, base.food!, base.drinks!, base.styling!, base.extras!];
  return Object.values(base);
}

export default async function BuildCanvas({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]); const ctx = await getCustomer(); const d = await getMyEvent(ctx, id); const e = d.e;
  const cats = categoriesFor(e.event_type); const active = sp.cat ?? null; const q = (sp.q ?? "").toLowerCase();
  const filtered = d.items.filter(i => i.status !== "cancelled").filter(i => !active || i.category === active).filter(i => !q || i.title.toLowerCase().includes(q));
  // Backups sit directly under the main choice for the same category.
  const items = filtered.filter(i => i.role !== "backup").concat(filtered.filter(i => i.role === "backup")).reduce<typeof filtered>((acc, it) => { if (it.role !== "backup") { acc.push(it); return acc; } const at = acc.map(x => x.category).lastIndexOf(it.category); if (at === -1) acc.push(it); else acc.splice(at + 1, 0, it); return acc; }, []);
  const replacing = sp.replace ? d.items.find(i => i.id === sp.replace) : null;
  const compareCat = sp.compare ? (sp.compare === "all" ? null : sp.compare) : undefined;
  const { data: lst } = await ctx.supabase.from("listings").select(LISTING_COLS).eq("published", true).order("rating", { ascending: false }).limit(80);
  const listings = (lst ?? []) as unknown as Listing[];
  const { data: info } = await ctx.supabase.from("listings").select("id,rating,review_count,location,capacity_max,details,slug,kind,response_hours").in("id", d.items.map(i => i.listing_id).filter(Boolean) as string[]);
  const L = new Map((info ?? []).map(r => [r.id, r]));
  const sum = (st: string[]) => d.items.filter(i => st.includes(i.status) && i.role !== "backup").reduce((s, i) => s + Number(i.amount ?? 0), 0);
  const budget = Number(e.budget_total ?? 0), confirmed = sum(["confirmed", "fulfilled"]), held = sum(["held"]), pending = sum(["quoted", "sent", "awaiting", "available"]), suggested = sum(["suggested"]);
  const est = confirmed + held + pending; const pct = budget ? Math.min(100, Math.round((est / budget) * 100)) : 0;
  const { count: tiers } = await ctx.supabase.from("ticket_tiers").select("id", { count: "exact", head: true }).eq("event_id", e.id);
  const { count: guests } = await ctx.supabase.from("guests").select("id", { count: "exact", head: true }).eq("event_id", e.id);
  const checks = [["Venue confirmed", d.s.venueOk], ["Date and time set", !!e.starts_at], [`${d.s.confirmed} of ${d.s.providers} key providers confirmed`, d.s.providers > 0 && d.s.confirmed === d.s.providers], [tiers || guests ? "Guest list or tickets set up" : "Guest list or tickets not set up", !!tiers || !!guests], [budget ? (est <= budget ? "Spend within budget" : "Spend is over budget") : "Set a budget", !!budget && est <= budget]] as [string, boolean][];
  const score = Math.round((100 * checks.filter(c => c[1]).length) / checks.length);
  const missing = [...cats.filter(c => c.need !== "Optional" && !d.items.some(i => i.category === c.key && ["confirmed", "fulfilled"].includes(i.status))).map(c => ({ title: `${c.label.split(" ")[0]} not yet confirmed`, sub: d.items.some(i => i.category === c.key) ? "Review your quotes to proceed" : "Get at least one quote to proceed", href: `/account/events/${e.id}/build?cat=${c.key}` })), ...(!tiers && !guests ? [{ title: "Set up your guest list or tickets", sub: "Create RSVP or ticket types", href: `/account/events/${e.id}/guests-tickets` }] : [])];
  const forCat = (c: string) => listings.filter(l => c === "extras" ? l.kind === "service" : buildCategoryOf(l.kind, l.category) === c).map(l => ({ id: l.id, name: l.name, image: l.image, rating: l.rating, review_count: l.review_count, price_from: l.price_from, price_unit: l.price_unit, location: l.location, category: l.category }));
  const catOf = (k: string) => cats.find(c => c.key === k) ?? cats[cats.length - 1]!;
  const venueGate = e.settings.venue_gates_suppliers === true && !d.s.venueOk;
  const more = [["Photographer", "/assets/gd/am-photographer.webp", "media"], ["Live Band", "/assets/gd/am-live-band.webp", "entertainment"], ["Transport", "/assets/gd/am-transport.webp", "transport"], ["Sweet Cart", "/assets/gd/am-sweet-cart.webp", "extras"], ["Photo Booth", "/assets/gd/am-photo-booth.webp", "media"]] as const;
  return <div className="ce">
    <CuEventHeader d={d} tab="build" variant="compact" buildPath />
    <div className="cb-grid">
      <aside className="cb-rail ce-card" aria-label="Categories">
        <h2 className="ce-h2 sm" style={{ fontSize: 17 }}>Add to your event</h2>
        <form className="k-input-icon" action={`/account/events/${e.id}/build`}><Search size={15} /><input className="k-input" name="q" defaultValue={sp.q ?? ""} placeholder="Search venues, services..." aria-label="Search your build" style={{ height: 36 }} /></form>
        <nav className="cb-cats">{cats.map(c => { const n = d.items.filter(i => i.category === c.key && i.status !== "cancelled").length; return <Link key={c.key} href={active === c.key ? `/account/events/${e.id}/build` : `/account/events/${e.id}/build?cat=${c.key}`} className="cb-cat" aria-current={active === c.key || (!active && c.key === "venue") ? "page" : undefined}><span className="cb-cat-ic" style={{ color: c.color, background: `color-mix(in srgb, ${c.color} 10%, #fff)` }}><c.icon size={19} /></span><span className="k-grow"><b>{c.label}</b><small>{c.sub}{n ? ` · ${n}` : ""}</small></span><ChevronRight size={15} /></Link>; })}</nav>
      </aside>
      <section className="ce-card cb-main">
        <div className="k-between" style={{ alignItems: "flex-start", marginBottom: 14 }}><div><h2 className="ce-h2" style={{ fontSize: 19 }}>Your event package</h2><p className="ce-sub" style={{ fontSize: 12 }}>Add, compare and arrange your venue, services and extras. Confirm each booking when you&apos;re ready.</p></div>
          <div className="k-row" style={{ gap: 8 }}><Link className="k-btn outline" href={`/plan?step=4&event=${e.id}`}><Sparkles size={14} />Suggestions</Link><Link className="k-btn ghost" href={`/discover?tab=${active && active !== "venue" ? "services" : "venues"}&view=map&results=1`}><MapIcon size={14} />View on map</Link><PackageMenu eventId={e.id} eventName={e.name} cat={active} rows={d.items.filter(i => i.status !== "cancelled").map(i => ({ category: catOf(i.category).label, title: i.title, status: (CU_STATUS[i.status] ?? [i.status])[0], role: i.role, amount: i.amount == null ? null : Number(i.amount), deposit: i.deposit == null ? null : Number(i.deposit) }))} /></div></div>
        {replacing && <div className="k-notice blue cb-banner"><Repeat size={15} className="k-blue" /><span className="k-grow">Choosing a replacement for <b>{replacing.title}</b>. Your pick becomes the main choice{["confirmed", "held", "fulfilled"].includes(replacing.status) ? "" : ` and ${replacing.title} is kept as a backup`}.</span><AddProviderDialog eventId={e.id} category={replacing.category} label={`Replace ${replacing.title}`} listings={forCat(replacing.category).filter(l => l.id !== replacing.listing_id)} trigger="button" replaceId={replacing.id} initialOpen /><Link className="k-link" href={`/account/events/${e.id}/build`}>Cancel</Link></div>}
        {compareCat !== undefined && <CompareTable rows={d.items.filter(i => i.status !== "cancelled" && (compareCat === null || i.category === compareCat))} info={L} catLabel={(k: string) => catOf(k).label} close={`/account/events/${e.id}/build${active ? `?cat=${active}` : ""}`} eventId={e.id} />}
        {venueGate && <div className="k-notice amber" style={{ marginBottom: 10 }}><AlertCircle size={15} className="k-amber" /><span>Confirm your venue first — suppliers can be quoted and held now, but bookings depend on the venue and date.</span></div>}
        {items.length ? <SortableBuild eventId={e.id} ids={items.map(i => i.id)} labels={items.map(i => i.title)}>{items.map(it => { const c = catOf(it.category); const [sl, st] = CU_STATUS[it.status] ?? [it.status, "gray"]; const r = it.listing_id ? L.get(it.listing_id) : null; const perGuest = (it.quote as { per_guest?: number }).per_guest; const done = ["confirmed", "fulfilled"].includes(it.status);
          const Icon = STATUS_ICON[it.status] ?? Clock4; const due = ["sent", "awaiting"].includes(it.status) && it.response_deadline ? hoursLeft(it.response_deadline) : null; const holdLeft = it.status === "held" && it.hold_expires_at ? hoursLeft(it.hold_expires_at) : null; const backupOf = it.role === "backup" ? items.find(x => x.category === it.category && x.role !== "backup") : null;
          return <div key={it.id} className={`cb-row-in ${it.role === "backup" ? "backup" : ""}`}>
            <div className="cb-cat-col"><span className={`cb-node ${done ? "done" : it.status === "quoted" ? "cur" : ""}`} style={done || it.status === "quoted" ? undefined : { color: c.color, background: `color-mix(in srgb, ${c.color} 10%, #fff)` }}>{done ? <CheckCircle2 size={18} /> : it.status === "quoted" ? <CheckCircle2 size={18} /> : <c.icon size={16} />}</span><span><b>{c.label}</b><span className={`cb-need ${c.need === "Foundation" ? "green" : c.need === "Required" ? "blue" : "gray"}`}>{c.need === "Foundation" ? <CheckCircle2 size={11} /> : <Circle size={9} />}{it.role === "backup" ? "Backup" : it.role === "standby" ? "Standby" : c.need}</span></span></div>
            <div className="cb-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.image || "/assets/gd/oe-neon.webp"} alt="" />
              <div className="cb-card-body"><div className="k-row" style={{ gap: 8 }}><b className="cb-name">{it.title}</b>{r && <span className="ce-rate"><Star size={13} fill="#f59e0b" color="#f59e0b" /><b>{Number(r.rating).toFixed(1)}</b> ({r.review_count})</span>}</div>
                {it.category === "venue" ? <div className="cb-lines"><span><MapPin size={12} />{r?.location ?? e.location}</span><span><Users size={12} />Up to {r?.capacity_max ?? "—"} guests</span></div> : <div className="cb-lines inline"><span>{it.package}</span></div>}
                <div className="ce-tags">{it.scope.split("•").map(x => x.trim()).filter(Boolean).slice(0, 4).map(x => <span key={x}>{x}</span>)}</div></div>
              <div className="cb-price"><span className={`cb-st ${st}`}><Icon size={12} />{sl}</span><b>{perGuest ? <>{money(perGuest)} <small>per guest</small></> : money(it.amount)}</b>{perGuest ? <small>Est. {money(Number(it.amount ?? perGuest * e.guest_count) > perGuest ? Number(it.amount) : perGuest * e.guest_count)}</small> : it.status === "held" ? <small>Deposit {money(it.deposit)}</small> : null}{due != null && <small className={`cb-due ${due < 12 ? "red" : ""}`}><Clock4 size={11} />{due > 0 ? `Reply due in ${fmtLeft(due)}` : "Awaiting reply"}</small>}{holdLeft != null && <small className={`cb-due ${holdLeft < 12 ? "red" : ""}`}><Lock size={11} />{holdLeft > 0 ? `Hold ends in ${fmtLeft(holdLeft)}` : "Hold expired"}</small>}
                <ItemCta eventId={e.id} it={it} label={it.status === "quoted" ? "Review quote" : it.status === "suggested" ? "Request quote" : it.status === "held" ? "Confirm" : "View details"} variant={it.status === "quoted" ? "primary" : "soft"} />{it.listing_id && ["held", "confirmed", "conditional_hold_requested", "standby", "cancellation_requested", "replacement_required", "disputed", "cancelled_by_provider", "cancelled_by_customer"].includes(it.status) && <Link className="k-link" href={`/account/events/${e.id}/bookings/${it.id}`}>Manage booking</Link>}</div>
              <ItemMenu eventId={e.id} it={it} href={r ? listingHref(r.kind, r.slug, r.id) : undefined} />
            </div>
          {backupOf && <small className="cb-backup-note">Backup for {backupOf.title}</small>}</div>; })}</SortableBuild> : <p className="k-small" style={{ padding: 16 }}>{q ? `Nothing matches “${sp.q}”.` : "Nothing here yet — add options from the categories on the left."}</p>}
        <div className="cb-more"><AddProviderDialog eventId={e.id} category={active ?? "extras"} label="Add" listings={forCat(active ?? "extras")} trigger="tile" /><div className="k-grow"><b>Add more to your event</b><small>Browse and add catering, decor, transport, accommodation and more.</small></div>
          {more.map(([l, img, c]) => <div key={l} className="cb-more-it">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={img} alt="" /><small>{l}</small><span className="ce-addmore-hit"><AddProviderDialog eventId={e.id} category={c} label={`Add ${l.toLowerCase()}`} listings={forCat(c)} trigger="link" /></span></div>)}
          <Link href="/discover?tab=services&results=1" className="cb-more-it"><span className="cb-more-dots"><MoreHorizontal size={16} /></span><small>More</small></Link></div>
      </section>
      <div className="k-col" style={{ gap: 12 }}>
        <section className="ce-card"><div className="k-between"><h2 className="ce-h2 sm" style={{ margin: 0 }}>Budget &amp; spend</h2><Link className="k-link" href={`/account/events/${e.id}/money`}>Edit budget</Link></div>
          {budget > 0 && est > budget && <div className="k-notice red cb-over"><AlertCircle size={14} className="k-red" />Over budget by {money(est - budget)} — compare options or adjust your budget.</div>}
          <div className="cb-bud"><span><b>{money(budget)}</b><small>Total budget</small></span><span><b>{money(est)}</b><small>Estimated spend</small></span><span><b className={budget - est < 0 ? "k-red" : "k-green"}>{budget - est < 0 ? `−${money(est - budget)}` : money(budget - est)}</b><small>{budget - est < 0 ? "Over budget" : "Remaining"}</small></span></div>
          <div className="k-row" style={{ gap: 10 }}><div className="cb-bar"><i style={{ width: `${budget ? (confirmed / budget) * 100 : 0}%`, background: "#10b981" }} /><i style={{ width: `${budget ? (held / budget) * 100 : 0}%`, background: "#2563eb" }} /><i style={{ width: `${budget ? (pending / budget) * 100 : 0}%`, background: "#f59e0b" }} /></div><b className="k-small">{pct}%</b></div>
          <div className="cb-legend">{([["Confirmed", confirmed, "#10b981"], ["Pending", pending, "#f59e0b"], ["Held", held, "#2563eb"], ["Suggested", suggested, "#8b5cf6"]] as const).map(([l, v, c]) => <span key={l}><i style={{ background: c }} />{l}<b>{money(v)}</b></span>)}</div></section>
        <section className="ce-card"><h2 className="ce-h2 sm">Event readiness</h2><div className="cb-ready"><span className="ce-ring" style={{ ["--v" as string]: score, width: 86, height: 86 }}><b style={{ fontSize: 18 }}>{score}%</b></span><div><b className="k-small" style={{ color: "var(--k-ink)" }}>{score >= 60 ? "You're making great progress!" : "Let's get the essentials in place"}</b><ul>{checks.map(([l, ok]) => <li key={l}>{ok ? <CheckCircle2 size={15} className="k-green" fill="#10b981" color="#fff" /> : <Circle size={15} className="k-muted" />}{l}</li>)}</ul></div></div></section>
        <section className="ce-card"><div className="k-between" style={{ marginBottom: 6 }}><h2 className="ce-h2 sm k-row" style={{ margin: 0, gap: 8 }}><span className="cb-miss-ic"><AlertCircle size={14} /></span>Missing essentials <span className="cb-badge">{missing.length}</span></h2><Link className="k-link" href={`/account/events/${e.id}/plan?tab=checklist`}>View all</Link></div>
          <div className="k-list">{missing.slice(0, 3).map(m => <Link key={m.title} href={m.href} className="k-li"><span className="cb-miss-ic soft"><AlertCircle size={13} /></span><span className="k-grow"><b className="k-small" style={{ color: "var(--k-ink)", fontWeight: 550 }}>{m.title}</b><div className="k-xs k-muted">{m.sub}</div></span><ChevronRight size={14} className="k-muted" /></Link>)}{!missing.length && <p className="k-small">All essentials are covered.</p>}</div></section>
        <section className="ce-card"><div className="k-row" style={{ gap: 8, marginBottom: 6 }}><Sparkles size={20} className="k-blue" /><b style={{ fontSize: 15 }}>Gala Agent</b><Beta /></div><p className="k-small">I can help you build your event package, compare options and keep you on track.</p>
          <div className="k-row k-wrap" style={{ gap: 6, margin: "10px 0" }}><Link className="cb-ask" href={`/plan?step=4&event=${e.id}`}><Wand2 size={12} />Build a full package for my budget</Link><Link className="cb-ask" href={`/account/events/${e.id}/build?cat=media`}>Find a wedding photographer</Link><Link className="cb-ask" href={`/account/events/${e.id}/build?cat=entertainment`}>Suggest entertainment options</Link></div>
          <AgentAsk scope="customer" eventId={e.id} placeholder="Ask me anything about your event..." compact /></section>
      </div>
    </div>
  </div>;
}

const STATUS_ICON: Record<string, React.ComponentType<{ size?: number }>> = { confirmed: CheckCircle2, fulfilled: CheckCircle2, quoted: FileText, available: CheckCircle2, held: Lock, sent: Clock4, awaiting: Clock4, suggested: Sparkles, standby: Shield, declined: XCircle, expired: XCircle, unavailable: XCircle };
const hoursLeft = (iso: string) => Math.round((new Date(iso).getTime() - Date.now()) / 36e5);
const fmtLeft = (h: number) => h >= 48 ? `${Math.round(h / 24)} days` : `${h}h`;

type Row = MyEventFull["items"][number];
type Info = { id: string; rating: number; review_count: number; capacity_max: number | null; response_hours: number | null };
/** Side-by-side comparison of options (price, deposit, status, rating, capacity, response time). */
function CompareTable({ rows, info, catLabel, close, eventId }: { rows: Row[]; info: Map<string, Info>; catLabel: (k: string) => string; close: string; eventId: string }) {
  const cols = rows.slice(0, 6);
  const get = (c: Row) => c.listing_id ? info.get(c.listing_id) : undefined;
  const lines: [string, (c: Row) => string][] = [
    ["Status", c => (CU_STATUS[c.status] ?? [c.status])[0]], ["Price", c => money(c.amount)], ["Deposit", c => Number(c.deposit) ? money(c.deposit) : "—"],
    ["Rating", c => { const i = get(c); return i ? `${Number(i.rating).toFixed(1)} (${i.review_count})` : "—"; }], ["Capacity", c => get(c)?.capacity_max ? `Up to ${get(c)!.capacity_max}` : "—"],
    ["Responds within", c => get(c)?.response_hours ? `${get(c)!.response_hours}h` : "—"], ["Includes", c => c.scope || c.package || "—"],
  ];
  return <section className="cb-compare" aria-label="Compare options">
    <div className="k-between" style={{ marginBottom: 10 }}><b className="k-row" style={{ gap: 8 }}><Columns3 size={16} className="k-blue" />Compare options</b><Link className="k-link" href={close}>Close comparison</Link></div>
    {cols.length < 2 ? <p className="k-small">Add at least two options{rows[0] ? ` for ${catLabel(rows[0].category)}` : ""} to compare them side by side.</p> : <div className="k-table-wrap"><table className="k-table cb-compare-t"><thead><tr><th scope="col">&nbsp;</th>{cols.map(c => <th key={c.id} scope="col">{c.title}<small>{catLabel(c.category)}{c.role === "backup" ? " · backup" : ""}</small></th>)}</tr></thead>
      <tbody>{lines.map(([l, f]) => <tr key={l}><th scope="row">{l}</th>{cols.map(c => <td key={c.id}>{f(c)}</td>)}</tr>)}
        <tr><th scope="row">&nbsp;</th>{cols.map(c => <td key={c.id}>{["quoted", "available", "held"].includes(c.status) ? <Link className="k-btn primary sm" href={`/account/events/${eventId}/book?step=2&item=${c.id}`}>Book</Link> : ["suggested", "expired", "declined"].includes(c.status) ? <Link className="k-btn outline sm" href={`/account/events/${eventId}/book?step=1&item=${c.id}`}>Request quote</Link> : <span className="k-small">{(CU_STATUS[c.status] ?? [c.status])[0]}</span>}</td>)}</tr></tbody></table></div>}
  </section>;
}
