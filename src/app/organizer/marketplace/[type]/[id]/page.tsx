import Link from "next/link";
import { notFound } from "next/navigation";
import { Star, BadgeCheck, MapPin, Users, Clock, Zap, CalendarDays, ShieldCheck, Package, ArrowRight, Sparkles, CheckCircle2, Layers, Ruler } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { LISTING_COLS, fitFor, availabilityFor, type Listing, type EventCtx } from "@/lib/data/marketplace";
import { Crumbs, Card, Chip, Tag, Bar, Empty, Beta } from "@/components/kit";
import { SaveHeart, AgentAsk } from "@/components/kit/client";
import { MessageButton } from "@/components/messaging/messaging-client";
import { money, num, dateShort, relative } from "@/lib/format";

export const metadata = { title: "Provider" };

export default async function ProviderProfile({ params, searchParams }: { params: Promise<{ type: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ type, id }, sp] = await Promise.all([params, searchParams]); const ctx = await getOrganizer(); const sb = ctx.supabase;
  if (!["venue", "service"].includes(type) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: row } = await sb.from("listings").select(LISTING_COLS).eq("id", id).eq("kind", type).eq("published", true).maybeSingle();
  if (!row) notFound();
  const l = row as unknown as Listing;
  const tab = ["availability", "packages", "reviews"].includes(sp.tab ?? "") ? sp.tab! : "overview";
  const { data: evs } = await sb.from("events").select("id,name,starts_at,ends_at,city,location,capacity,guest_count,budget_total,cover_image,event_type").eq("workspace_id", ctx.workspace.id).gte("starts_at", new Date().toISOString()).order("starts_at");
  const events = (evs ?? []) as EventCtx[]; const ev = events.find(e => e.id === sp.event) ?? events[0] ?? null;
  const f = fitFor(l, ev); const a = (await availabilityFor(ctx, [l.id], ev)).get(l.id)!;
  const [{ data: spaces }, { data: pkgs }, { data: reviews }, { data: saved }, { data: hist }, { data: blocks }] = await Promise.all([
    type === "venue" ? sb.from("spaces").select("id,name,indoor,area_sqm,capacity_standing,capacity_seated,layouts,amenities,image,rate_hourly").eq("venue_id", l.id) : Promise.resolve({ data: [] }),
    sb.from("packages").select("id,name,description,base_price,price_basis,min_guests,max_guests,duration_hours,deposit_pct,inclusions,booking_mode,image").eq("listing_id", l.id),
    sb.from("reviews").select("id,rating,ratings,body,created_at").eq("listing_id", l.id).eq("status", "published").order("created_at", { ascending: false }).limit(20),
    sb.from("saved_items").select("item_key").eq("user_id", ctx.user.id).eq("item_key", `listing:${l.id}`),
    sb.from("build_items").select("status,events!inner(workspace_id,name)").eq("listing_id", l.id).eq("events.workspace_id", ctx.workspace.id),
    sb.from("availability_blocks").select("starts_at,ends_at,kind").eq("listing_id", l.id).gte("ends_at", new Date().toISOString()).limit(60),
  ]);
  const gallery = [l.image, ...(l.gallery ?? [])].filter(Boolean);
  while (gallery.length < 5) gallery.push(["/assets/gd/v-grand-hall.webp", "/assets/gd/v-pulse.webp", "/assets/gd/v-oakwood.webp", "/assets/gd/v-skyline-rooftop.webp"][gallery.length - 1] ?? l.image);
  // What Gala Agent sees about this listing, so answers are about it (not a similarly named one).
  const agentFocus = [`${type === "venue" ? "Venue" : "Supplier"} listing "${l.name}" (${l.category}) in ${l.city || l.location}`, l.capacity_max ? `capacity ${l.capacity_min ?? 0}–${l.capacity_max}` : "",
    l.price_from != null ? `from £${l.price_from} ${l.price_unit}` : "price on request", `rated ${l.rating.toFixed(1)} from ${l.review_count} reviews`, l.verified ? "verified" : "not yet verified",
    l.instant_book ? "instant book" : "", l.emergency_supply ? "offers emergency supply" : "", l.response_hours != null ? `usually replies within ${l.response_hours}h` : "",
    ev ? `availability for ${ev.name}: ${a.label}; fit score ${f.score}%` : "", (pkgs?.length ? `packages: ${pkgs.slice(0, 5).map(p => `${p.name} £${p.base_price}`).join(", ")}` : ""),
    l.description ? `description: ${l.description.slice(0, 600)}` : ""].filter(Boolean).join("; ");
  const reqHref = `/organizer/marketplace/requests/new?step=1&listing=${l.id}${ev ? `&event=${ev.id}` : ""}&category=${type === "venue" ? "venue" : l.category.toLowerCase()}`;
  const base = `/organizer/marketplace/${type}/${l.id}${ev ? `?event=${ev.id}` : ""}`;
  const sep = base.includes("?") ? "&" : "?";
  // Availability month around the selected event date
  const anchor = ev?.starts_at ? new Date(ev.starts_at) : new Date();
  const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1)); const offset = (first.getUTCDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1 - offset + i)));
  const busy = (d: Date) => (blocks ?? []).some(b => b.starts_at.slice(0, 10) <= d.toISOString().slice(0, 10) && b.ends_at.slice(0, 10) >= d.toISOString().slice(0, 10));
  const worked = (hist ?? []).filter(h => ["confirmed", "fulfilled"].includes(h.status)).length;
  const avgR = (k: string) => { const v = (reviews ?? []).map(r => Number((r.ratings as Record<string, number>)[k] ?? r.rating)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : l.rating; };
  return <>
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Marketplace", href: `/organizer/marketplace${type === "service" ? "?tab=services" : ""}` }, { label: l.name }]} />
    <div className="k-page-head" style={{ marginTop: -6, alignItems: "flex-start" }}>
      <div><div className="k-row" style={{ gap: 8 }}><h1 style={{ fontSize: 27 }}>{l.name}</h1>{l.verified && <Chip tone="blue" icon={BadgeCheck} lg>Verified</Chip>}{l.badge && <Chip tone="purple" lg>{l.badge}</Chip>}</div>
        <div className="k-row k-small k-muted k-wrap" style={{ gap: 12, marginTop: 6 }}><span className="k-row" style={{ gap: 4 }}><Star size={13} fill="#f59e0b" color="#f59e0b" /><b style={{ color: "var(--k-ink)" }}>{l.rating.toFixed(1)}</b> ({l.review_count} reviews)</span><span className="k-row" style={{ gap: 4 }}><MapPin size={13} />{l.location}</span>{l.capacity_max && <span className="k-row" style={{ gap: 4 }}><Users size={13} />Up to {num(l.capacity_max)}</span>}<span className="k-row" style={{ gap: 4 }}><Clock size={13} />Responds within {l.response_hours}h</span>{l.emergency_supply && <span className="k-row k-amber" style={{ gap: 4 }}><Zap size={13} />Emergency supply</span>}</div></div>
      <div className="k-row" style={{ gap: 8 }}><SaveHeart itemKey={`listing:${l.id}`} saved={!!saved?.length} className="k-btn ghost lg" size={16} label={l.name} /><Link className="k-btn outline lg" href={`/organizer/agent?goal=${encodeURIComponent(`Compare ${l.name} with alternatives for ${ev?.name ?? "my event"}`)}`}><Sparkles size={15} />Compare</Link><Link className="k-btn primary lg" href={reqHref}><CalendarDays size={15} />{l.instant_book ? "Book now" : "Request availability"}</Link></div>
    </div>
    <div className="pv-gallery">{gallery.slice(0, 5).map((g, i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={g} alt={i === 0 ? l.name : ""} />)}</div>
    <nav className="k-tabs">{([["overview", "Overview"], ["availability", "Availability"], ["packages", type === "venue" ? "Spaces & Packages" : "Packages"], ["reviews", "Reviews & Performance"]] as const).map(([k, lbl]) => <Link key={k} className="k-tab" href={k === "overview" ? base : `${base}${sep}tab=${k}`} aria-current={tab === k ? "page" : undefined}>{lbl}</Link>)}</nav>
    <div className="pv-grid">
      <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
        {tab === "overview" && <>
          <Card><h2 className="ov-h" style={{ fontSize: 15, marginBottom: 8 }}>About</h2><p style={{ fontSize: 13, color: "var(--k-ink-2)", lineHeight: 1.6 }}>{l.description || "No description provided."}</p><div className="k-row k-wrap" style={{ gap: 6, marginTop: 10 }}>{l.tags.map(t => <Tag key={t}>{t}</Tag>)}</div></Card>
          <div className="pv-facts">{(type === "venue" ? [["Capacity", l.capacity_max ? `Up to ${num(l.capacity_max)}` : "—"], ["Setting", String(l.details?.setting ?? "—")], ["Spaces", String(spaces?.length || l.details?.spaces || 1)], ["Booking mode", l.instant_book ? "Instant book" : "Request"]] : [["Category", l.category], ["Coverage", l.location], ["Experience", String(l.details?.experience ?? "—")], ["Booking mode", l.instant_book ? "Instant book" : "Request"]]).map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}</div>
          <Card><h2 className="ov-h" style={{ fontSize: 15, marginBottom: 8 }}>Pricing &amp; terms</h2><dl className="pr-terms"><div><dt>From</dt><dd><b>{money(l.price_from)}</b> {l.price_unit}</dd></div><div><dt>Deposit</dt><dd>{pkgs?.[0]?.deposit_pct ?? 30}% on confirmation</dd></div><div><dt>Cancellation</dt><dd>Deposit non-refundable within 30 days of the event; full terms in the quote</dd></div><div><dt>Response</dt><dd>Commits to respond within {l.response_hours} hours</dd></div></dl></Card>
          {type === "venue" && <Card><h2 className="ov-h" style={{ fontSize: 15, marginBottom: 8 }}>Location</h2><p className="k-small">{l.location}</p><p className="k-xs k-muted" style={{ marginTop: 6 }}>Access, curfew and restrictions are confirmed in the provider&apos;s quote.</p></Card>}
        </>}
        {tab === "availability" && <Card><div className="k-between" style={{ marginBottom: 10 }}><h2 className="ov-h" style={{ fontSize: 15 }}>{anchor.toLocaleString("en-GB", { month: "long", year: "numeric" })}</h2><span className="k-xs k-muted">Live availability from the provider&apos;s calendar and confirmed bookings</span></div>
          <div className="pv-avail">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <b key={i} className="k-xs k-muted" style={{ textAlign: "center" }}>{d}</b>)}{days.map(d => <span key={d.toISOString()} className={`${busy(d) ? "busy" : ""} ${d.getUTCMonth() !== first.getUTCMonth() ? "out" : ""} ${ev?.starts_at?.slice(0, 10) === d.toISOString().slice(0, 10) ? "sel" : ""}`}>{d.getUTCDate()}</span>)}</div>
          <div className="k-notice" style={{ marginTop: 12 }}><CheckCircle2 size={14} className="k-blue" /><span className="k-xs">{ev ? `${ev.name} (${dateShort(ev.starts_at)}): ${a.label}.` : "Choose an event to check its date."} Availability is confirmed only when the provider responds.</span></div></Card>}
        {tab === "packages" && <>
          {type === "venue" && <Card><h2 className="ov-h" style={{ fontSize: 15, marginBottom: 10 }}>Spaces</h2>{spaces?.length ? <div className="k-grid k-g2">{spaces.map(s => <div key={s.id} className="k-card tight"><div className="k-row" style={{ gap: 10 }}>{/* eslint-disable-next-line @next/next/no-img-element */}{s.image && <img src={s.image} alt="" className="k-thumb lg" />}<div><b className="k-small k-strong">{s.name}</b><div className="k-xs k-muted">{s.indoor ? "Indoor" : "Outdoor"}{s.area_sqm ? ` · ${num(s.area_sqm)} m²` : ""}</div></div></div><div className="k-row k-xs k-muted" style={{ gap: 10, marginTop: 8 }}><span><Users size={11} /> {num(s.capacity_standing)} standing</span><span><Layers size={11} /> {num(s.capacity_seated)} seated</span>{s.rate_hourly && <span><Ruler size={11} /> {money(s.rate_hourly)}/h</span>}</div></div>)}</div> : <Empty icon={Layers} title="No spaces listed" />}</Card>}
          <Card><h2 className="ov-h" style={{ fontSize: 15, marginBottom: 10 }}>Packages</h2>{pkgs?.length ? <div className="k-col" style={{ gap: 10 }}>{pkgs.map(p => <div key={p.id} className="k-card tight"><div className="k-between"><b className="k-small k-strong">{p.name}</b><b>{money(p.base_price)} <span className="k-xs k-muted">{p.price_basis}</span></b></div><p className="k-xs" style={{ marginTop: 4 }}>{p.description}</p><div className="k-row k-wrap" style={{ gap: 5, marginTop: 6 }}>{((p.inclusions as string[] | null) ?? []).slice(0, 6).map(x => <Tag key={x}>{x}</Tag>)}</div><div className="k-between k-xs k-muted" style={{ marginTop: 8 }}><span>{p.min_guests ?? 0}–{p.max_guests ?? "∞"} guests · {p.deposit_pct ?? 30}% deposit</span><Link className="k-btn primary sm" href={`${reqHref}&package=${p.id}`}>Request this package</Link></div></div>)}</div> : <Empty icon={Package} title="No packages published" text="Request a tailored quote instead." action={<Link className="k-btn primary" href={reqHref}>Request quote</Link>} />}</Card>
        </>}
        {tab === "reviews" && <Card><h2 className="ov-h" style={{ fontSize: 15, marginBottom: 10 }}>Reviews &amp; performance</h2>
          <div className="k-grid k-g4" style={{ marginBottom: 14 }}>{([["Quality", "quality"], ["Communication", "communication"], ["Value", "value"], ["Reliability", "reliability"]] as const).map(([lbl, k]) => <div key={k} className="k-kpi"><div className="k-grow"><div className="lbl">{lbl}</div><div className="val" style={{ fontSize: 17 }}>{avgR(k).toFixed(1)}</div><Bar value={avgR(k) * 20} tone="green" label={lbl} /></div></div>)}</div>
          {reviews?.length ? <div className="k-list">{reviews.map(r => <div key={r.id}><div className="k-row" style={{ gap: 4 }}>{Array.from({ length: 5 }, (_, i) => <Star key={i} size={12} fill={i < r.rating ? "#f59e0b" : "none"} color="#f59e0b" />)}<span className="k-xs k-muted" style={{ marginLeft: 6 }}>Verified booking · {relative(r.created_at)}</span></div><p className="k-small" style={{ marginTop: 4, color: "var(--k-ink-2)" }}>{r.body}</p></div>)}</div> : <p className="k-small">{l.review_count} ratings imported from completed bookings; written reviews will appear here.</p>}</Card>}
      </div>
      <div className="k-col" style={{ gap: 14 }}>
        <Card><h3 className="ov-h">For {ev?.name ?? "your event"}</h3>
          <div className="k-row" style={{ gap: 12, margin: "10px 0" }}><span className="rf-ring" style={{ ["--v" as string]: f.score, ["--c" as string]: f.score >= 85 ? "#16a34a" : f.score >= 70 ? "#f59e0b" : "#ef4444" }}><b>{f.score}%</b></span><div><b className="k-small">Event fit</b><div className="k-xs k-muted">{f.reasons.slice(0, 2).join(" · ")}</div></div></div>
          <Chip tone={a.state === "available" ? "green" : a.state === "unavailable" ? "red" : a.state === "pending" ? "amber" : "blue"}>{a.label}</Chip>
          <div className="k-col" style={{ gap: 8, marginTop: 12 }}><Link className="k-btn primary block" href={reqHref}>Request availability</Link><Link className="k-btn outline block" href={`${reqHref}&hold=1`}>Request with conditional hold</Link>{l.emergency_supply && <Link className="k-btn danger block" href={`${reqHref}&emergency=1`}><Zap size={14} />Emergency request</Link>}<MessageButton className="k-btn ghost block" toType="workspace" to={l.workspace_id} toName={l.name} kind="enquiry" listingId={l.id} eventId={ev?.id} asWorkspace={ctx.workspace.id} inbox="/organizer/inbox" label={type === "venue" ? "Message venue" : "Message provider"} subject={`Enquiry about ${l.name}${ev ? ` for ${ev.name}` : ""}`} values={{ me: ctx.name, business: ctx.workspace.name }} /></div></Card>
        <Card><h3 className="ov-h" style={{ marginBottom: 8 }}>Trust &amp; relationship</h3><ul className="pl-agent-list"><li><ShieldCheck size={15} className={l.verified ? "k-green" : "k-muted"} />{l.verified ? "Identity & insurance verified" : "Verification pending"}</li><li><CheckCircle2 size={15} className="k-green" />{l.review_count} completed bookings on Gala Dock</li><li><CheckCircle2 size={15} className={worked ? "k-green" : "k-muted"} />{worked ? `Worked with you ${worked} time${worked === 1 ? "" : "s"}` : "New to your workspace"}</li></ul></Card>
        <section className="k-agent"><div className="k-agent-head"><Sparkles size={16} className="k-spark" /><h3>Gala Agent</h3><Beta /></div><p>Ask about fit, terms or alternatives.</p><AgentAsk scope="organizer" eventId={ev?.id} placeholder={`Ask about ${l.name}...`} context={agentFocus} /></section>
        <Link className="k-link" href={`/organizer/marketplace${type === "service" ? "?tab=services" : ""}`}>Back to marketplace <ArrowRight size={12} /></Link>
      </div>
    </div>
  </>;
}
