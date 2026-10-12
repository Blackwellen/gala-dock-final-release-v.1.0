import Link from "next/link";
import { LayoutGrid, List, Map as MapIcon, MapPin, Star, BadgeCheck, CalendarDays, ChevronRight, RotateCw, Clock, Zap, Images, Search, Inbox, Bookmark } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { LISTING_COLS, fitFor, availabilityFor, type Listing, type EventCtx } from "@/lib/data/marketplace";
import { Crumbs, Card, Chip, Empty, Tag } from "@/components/kit";
import { SaveHeart } from "@/components/kit/client";
import { MarketFilters, TypeChips, SortMenu, EventPicker, MarketMap } from "@/components/organizer/marketplace-client";
import { money, dateShort, time, num } from "@/lib/format";

export const metadata = { title: "Marketplace" };
const str = (v: unknown) => (typeof v === "string" ? v : "");
const AV: Record<string, "green" | "blue" | "amber" | "red" | "gray"> = { available: "green", likely: "blue", pending: "amber", unavailable: "red", unknown: "gray" };

const CITY: Record<string, { lat: number; lng: number }> = { london: { lat: 51.507, lng: -0.11 }, manchester: { lat: 53.48, lng: -2.24 }, surrey: { lat: 51.31, lng: -0.56 }, birmingham: { lat: 52.49, lng: -1.89 } };
export default async function MarketplacePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams; const ctx = await getOrganizer(); const sb = ctx.supabase;
  const tab = str(sp.tab) === "services" ? "services" : "venues"; const view = (["cards", "list", "map"].includes(str(sp.view)) ? str(sp.view) : "cards") as "cards" | "list" | "map";
  const section = str(sp.section);
  const { data: evs } = await sb.from("events").select("id,name,starts_at,ends_at,city,location,capacity,guest_count,budget_total,cover_image,event_type").eq("workspace_id", ctx.workspace.id).gte("starts_at", new Date().toISOString()).order("starts_at");
  const events = (evs ?? []) as EventCtx[];
  const evId = str(sp.event) || events[0]?.id || null; const ev = events.find(e => e.id === evId) ?? null;
  let q = sb.from("listings").select(LISTING_COLS).eq("published", true).eq("kind", tab === "venues" ? "venue" : "service");
  if (str(sp.q)) q = q.or(`name.ilike.%${str(sp.q).replace(/[%,()]/g, "")}%,category.ilike.%${str(sp.q).replace(/[%,()]/g, "")}%,description.ilike.%${str(sp.q).replace(/[%,()]/g, "")}%`);
  if (str(sp.city)) q = q.ilike("location", `%${str(sp.city)}%`);
  if (str(sp.cat) && str(sp.cat) !== "all") q = q.eq("category", str(sp.cat));
  if (Number(str(sp.cap))) q = q.gte("capacity_max", Number(str(sp.cap)));
  if (Number(str(sp.price))) q = q.lte("price_from", Number(str(sp.price)));
  if (Number(str(sp.resp))) q = q.lte("response_hours", Number(str(sp.resp)));
  if (Number(str(sp.rating))) q = q.gte("rating", Number(str(sp.rating)));
  if (str(sp.verified) === "1") q = q.eq("verified", true);
  if (str(sp.instant) === "1") q = q.eq("instant_book", true);
  if (str(sp.emergency) === "1") q = q.eq("emergency_supply", true);
  // Map area ("Search as I move the map"): south,west,north,east.
  const bbox = str(sp.bbox).split(",").map(Number); const hasBox = bbox.length === 4 && bbox.every(Number.isFinite);
  if (hasBox) q = q.gte("lat", bbox[0]!).lte("lat", bbox[2]!).gte("lng", bbox[1]!).lte("lng", bbox[3]!);
  const [{ data: rows }, { data: catsRaw }, { data: saved }, { data: myItems }] = await Promise.all([
    q.limit(200), sb.from("listings").select("category").eq("published", true).eq("kind", tab === "venues" ? "venue" : "service"),
    sb.from("saved_items").select("item_key").eq("user_id", ctx.user.id),
    sb.from("build_items").select("listing_id,status,events!inner(workspace_id)").eq("events.workspace_id", ctx.workspace.id),
  ]);
  let list = (rows ?? []) as unknown as Listing[];
  const savedKeys = new Set((saved ?? []).map(s => s.item_key));
  const worked = new Set((myItems ?? []).filter(i => ["confirmed", "fulfilled"].includes(i.status)).map(i => i.listing_id));
  if (str(sp.history) === "1") list = list.filter(l => worked.has(l.id));
  if (section === "saved") list = list.filter(l => savedKeys.has(`listing:${l.id}`));
  const fit = new Map(list.map(l => [l.id, fitFor(l, ev)]));
  const sort = str(sp.sort) || "recommended";
  list.sort((a, b) => sort === "rating" ? b.rating - a.rating : sort === "price_asc" ? (a.price_from ?? 1e9) - (b.price_from ?? 1e9) : sort === "price_desc" ? (b.price_from ?? 0) - (a.price_from ?? 0) : sort === "capacity" ? (b.capacity_max ?? 0) - (a.capacity_max ?? 0) : sort === "response" ? a.response_hours - b.response_hours : fit.get(b.id)!.score - fit.get(a.id)!.score);
  const avail = await availabilityFor(ctx, list.map(l => l.id), ev);
  const cats = [...new Set((catsRaw ?? []).map(c => c.category).filter(Boolean))].sort();
  const qs = (patch: Record<string, string | null>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(sp)) if (typeof v === "string") p.set(k, v); for (const [k, v] of Object.entries(patch)) v == null ? p.delete(k) : p.set(k, v); return `/organizer/marketplace?${p}`; };
  const href = (l: Listing) => `/organizer/marketplace/${l.kind}/${l.id}${ev ? `?event=${ev.id}` : ""}`;
  const reqHref = (l: Listing) => `/organizer/marketplace/requests/new?step=1&listing=${l.id}${ev ? `&event=${ev.id}` : ""}&category=${encodeURIComponent(l.kind === "venue" ? "venue" : l.category.toLowerCase())}`;
  const label = tab === "venues" ? "venues" : "services";
  const pins = list.filter(l => l.lat && l.lng).map(l => ({ id: l.id, lat: l.lat!, lng: l.lng!, name: l.name, price: money(l.price_from), image: l.image, rating: l.rating, reviews: l.review_count, capacity: l.capacity_max, href: href(l) }));
  const { data: reqs } = section === "requests" ? await sb.from("provider_requests").select("id,reference,title,category,status,response_deadline,created_at,event_id,events!inner(name,workspace_id)").eq("events.workspace_id", ctx.workspace.id).order("created_at", { ascending: false }) : { data: null };

  return <>
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Marketplace" }]} />
    <div className="k-page-head mk-head">
      <div><h1 style={{ fontSize: 28 }}>{tab === "venues" ? "Venues" : "Services"}</h1><p className="sub" style={{ fontSize: 13 }}>{tab === "venues" ? "Find and book the perfect venue for your event." : "Find trusted suppliers for every part of your event."}</p></div>
      <div className="k-row mk-ctxs" style={{ gap: 10 }}>
        <EventPicker events={events} current={evId} />
        <div className="mk-ctx"><span className="k-tile sm"><MapPin size={14} /></span><span className="k-grow"><small>Location</small><b>{ev?.city ? `${ev.city}, UK` : "Anywhere in UK"}</b></span><ChevronRight size={14} className="k-muted" /></div>
        <div className="mk-ctx"><span className="k-tile sm"><CalendarDays size={14} /></span><span className="k-grow"><small>Date &amp; time</small><b>{ev?.starts_at ? `${dateShort(ev.starts_at)} · ${time(ev.starts_at)} – ${time(ev.ends_at)}` : "Any date"}</b></span><ChevronRight size={14} className="k-muted" /></div>
      </div>
    </div>
    <div className="k-between mk-tabs-row"><nav className="k-tabs" style={{ borderBottom: 0 }}><Link className="k-tab" href={qs({ tab: null, cat: null, section: null })} aria-current={tab === "venues" && !section ? "page" : undefined}>Venues</Link><Link className="k-tab" href={qs({ tab: "services", cat: null, cap: null, section: null })} aria-current={tab === "services" && !section ? "page" : undefined}>Services</Link></nav>
      <div className="k-row" style={{ gap: 6 }}><Link className="k-btn ghost sm" href={qs({ section: section === "saved" ? null : "saved" })} aria-current={(section === "saved") ? "page" : undefined}><Bookmark size={14} />Saved</Link><Link className="k-btn ghost sm" href={qs({ section: section === "requests" ? null : "requests" })}><Inbox size={14} />Requests</Link><Link className="k-btn primary sm" href={`/organizer/marketplace/requests/new?step=1${ev ? `&event=${ev.id}` : ""}`}>New request</Link></div></div>
    {section === "requests" ? <Card flush><div style={{ padding: "14px 16px" }}><h2 className="ov-h" style={{ fontSize: 15 }}>Requests</h2><p className="k-small">RFQs sent to providers across your events.</p></div>
      <table className="k-table"><thead><tr><th>Reference</th><th>Request</th><th>Event</th><th>Category</th><th>Responses due</th><th>Status</th></tr></thead><tbody>{(reqs ?? []).map(r => <tr key={r.id}><td><Link className="k-link" href={`/organizer/marketplace/requests/${r.id}`}>{r.reference}</Link></td><td style={{ color: "var(--k-ink)" }}>{r.title}</td><td>{(r.events as unknown as { name: string }).name}</td><td style={{ textTransform: "capitalize" }}>{r.category}</td><td>{r.response_deadline ? `${dateShort(r.response_deadline)} ${time(r.response_deadline)}` : "—"}</td><td><Chip tone={r.status === "sent" ? "blue" : "gray"}>{r.status === "sent" ? "Open" : r.status}</Chip></td></tr>)}</tbody></table>
      {!reqs?.length && <Empty icon={Inbox} title="No requests yet" />}</Card> : <>
      <MarketFilters tab={tab} categories={cats} />
      {tab === "venues" && <TypeChips types={cats.slice(0, 10)} />}
      <div className={`mk-body ${view === "map" ? "full-map" : ""}`}>
        <div className="k-col" style={{ gap: 12, minWidth: 0 }}>
          <div className="k-between"><div className="k-row" style={{ gap: 12 }}><div className="k-seg solid">{([["cards", "Cards", LayoutGrid], ["list", "List", List], ["map", "Map", MapIcon]] as const).map(([k, l, I]) => <Link key={k} aria-current={(view === k) ? "page" : undefined} href={qs({ view: k === "cards" ? null : k })}><I size={14} />{l}</Link>)}</div><span className="k-row k-small k-muted" style={{ gap: 6 }}><RotateCw size={13} />{num(list.length)} {label} found</span></div><SortMenu value={sort} /></div>
          {!list.length ? <Card><Empty icon={Search} title={`No ${label} match`} text="Try widening the location, capacity or price." /></Card>
            : view === "list" ? <Card flush><table className="k-table"><thead><tr><th>{tab === "venues" ? "Venue" : "Supplier"}</th><th>Location</th>{tab === "venues" ? <th>Capacity</th> : <th>Category</th>}<th>Rating</th><th>Response</th><th>Availability</th><th>Fit</th><th className="num">From</th><th /></tr></thead>
              <tbody>{list.map(l => { const a = avail.get(l.id)!; const f = fit.get(l.id)!; return <tr key={l.id}><td><Link href={href(l)} className="k-row" style={{ gap: 10 }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={l.image || "/assets/gd/covers/summer-sessions.webp"} alt="" className="k-thumb sm" /><b className="k-strong">{l.name}</b>{l.verified && <BadgeCheck size={14} className="k-blue" />}</Link></td><td>{l.city}</td><td>{tab === "venues" ? num(l.capacity_max) : l.category}</td><td><span className="k-row" style={{ gap: 4 }}><Star size={12} fill="#f59e0b" color="#f59e0b" />{l.rating.toFixed(1)} ({l.review_count})</span></td><td>{l.response_hours}h</td><td><Chip tone={AV[a.state]}>{a.label}</Chip></td><td title={f.reasons.join(" · ")}><b>{f.score}%</b></td><td className="num">{money(l.price_from)}</td><td><Link className="k-btn primary sm" href={reqHref(l)}>Request</Link></td></tr>; })}</tbody></table></Card>
            : view === "map" ? null
            : <div className="mk-cards">{list.map(l => { const a = avail.get(l.id)!; const f = fit.get(l.id)!; return <article key={l.id} className="mk-card">
                <Link href={href(l)} className="mk-card-img">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={l.image || "/assets/gd/covers/summer-sessions.webp"} alt="" />{(l.badge || l.sponsored) && <span className="mk-badge">{l.sponsored ? "Sponsored" : l.badge}</span>}<span className="mk-count"><Images size={12} />1 / {Math.max(1, (l.gallery?.length ?? 0) + 12)}</span><span className="mk-dots"><i className="on" /><i /><i /><i /></span></Link>
                <SaveHeart itemKey={`listing:${l.id}`} saved={savedKeys.has(`listing:${l.id}`)} className="mk-heart" label={l.name} />
                <div className="mk-card-body">
                  <div className="k-between" style={{ alignItems: "flex-start" }}><Link href={href(l)}><b className="mk-name">{l.name}</b></Link><span className="mk-price"><b>{money(l.price_from)}</b> /{l.price_unit.replace("per ", "")}<small>From</small></span></div>
                  <div className="k-row k-small" style={{ gap: 8 }}><span className="k-row" style={{ gap: 4 }}><Star size={13} fill="#f59e0b" color="#f59e0b" /><b>{l.rating.toFixed(1)}</b><span className="k-muted">({l.review_count} reviews)</span></span>{l.verified && <Chip tone="blue" icon={BadgeCheck}>Verified</Chip>}</div>
                  <div className="k-row k-xs k-muted mk-meta"><MapPin size={12} />{l.city}, UK{l.capacity_max && <><span>•</span>{num(l.capacity_max)} capacity</>}{l.details?.setting ? <><span>•</span>{String(l.details.setting)}</> : l.kind === "service" ? <><span>•</span>{l.category}</> : null}</div>
                  <div className="k-row k-wrap" style={{ gap: 5 }}>{l.tags.slice(0, 4).map(t => <Tag key={t}>{t}</Tag>)}</div>
                  <p className="mk-desc">{l.description}</p>
                  <div className="k-row k-xs" style={{ gap: 8 }}><Chip tone={AV[a.state]}>{a.label}</Chip>{ev && <span className="k-muted" title={f.reasons.join(" · ")}>{f.score}% fit · {f.reasons[0] ?? ""}</span>}<span className="k-row k-muted" style={{ gap: 3, marginLeft: "auto" }}>{l.emergency_supply && <><Zap size={11} />Emergency · </>}<Clock size={11} />{l.response_hours}h</span></div>
                  <div className="k-grid k-g2" style={{ gap: 8 }}><Link className="k-btn outline" href={href(l)}>View details</Link><Link className="k-btn primary" href={reqHref(l)}><CalendarDays size={14} />{l.instant_book ? "Book" : "Request availability"}</Link></div>
                </div>
              </article>; })}</div>}
        </div>
        <MarketMap center={hasBox ? { lat: (bbox[0]! + bbox[2]!) / 2, lng: (bbox[1]! + bbox[3]!) / 2 } : CITY[(str(sp.city) || ev?.city || "london").toLowerCase()] ?? CITY.london} pins={pins} total={list.length} label={label} />
      </div>
    </>}
  </>;
}
