import Link from "next/link";
import { Ticket, Map, Globe, CalendarDays, Image as ImageIcon, Users, UserRound, BarChart3, Plus, ArrowRight, Eye, Percent, MoreHorizontal, PenLine, Sparkles, CheckCircle2, Link2, Camera as Instagram, ThumbsUp as Facebook, Music2, Mail, Megaphone, Search, Maximize2, Crosshair } from "lucide-react";
import { Card, Chip, Bar, Spark, Beta, Donut, Legend, LineChart, BarChart } from "@/components/kit";
import { money, num, dateShort, timeRange, pct } from "@/lib/format";
import type { ProEvent, EventData } from "@/lib/data/event";
import { defaultStructure, defaultOverlay, type MapStructure, type OverlayEl } from "@/lib/venue-map";
import { VenueMapSvg } from "../venue-map/render";
import { SubTabs } from "./header";
import { PublicPageToggles, CopyLink } from "./controls";

const TIER_STATUS: Record<string, [string, "green" | "blue" | "gray" | "amber" | "red"]> = { on_sale: ["On sale", "green"], scheduled: ["Scheduled", "blue"], draft: ["Draft", "gray"], paused: ["Paused", "amber"], sold_out: ["Sold out", "red"], hidden: ["Hidden", "gray"] };

export function SellTab({ e, d, section }: { e: ProEvent; d: EventData; section: string }) {
  const id = e.id; const base = `/organizer/events/${id}`;
  const items = [
    { key: "tickets", label: "Tickets", icon: Ticket, href: `${base}?tab=sell` },
    { key: "map", label: "Venue Map", icon: Map, href: `${base}/map` },
    { key: "page", label: "Public Page", icon: Globe, href: `${base}/page` },
    { key: "discover", label: "Discover / Calendar", icon: CalendarDays, href: `${base}/promotion?tab=discover` },
    { key: "media", label: "Posters & Media", icon: ImageIcon, href: `${base}/media` },
    { key: "promoters", label: "Promoters", icon: UserRound, href: `${base}/promotion?tab=promoters` },
    { key: "audience", label: "Audience", icon: Users, href: `${base}/promotion?tab=audience` },
    { key: "performance", label: "Performance", icon: BarChart3, href: `${base}/promotion?tab=performance` },
  ];
  const views = d.metrics.reduce((s, m) => s + m.page_views, 0);
  const viewsSpark = d.metrics.map(m => m.page_views);
  const half = Math.floor(d.metrics.length / 2), firstHalf = d.metrics.slice(0, half).reduce((s, m) => s + m.page_views, 0), secondHalf = d.metrics.slice(half).reduce((s, m) => s + m.page_views, 0);
  const viewsDelta = firstHalf ? Math.round(((secondHalf - firstHalf) / firstHalf) * 100) : 0;
  const lastWeekSales = d.series.slice(-7).reduce((s, x) => s + Number(x.gross), 0), prevWeekSales = d.series.slice(-14, -7).reduce((s, x) => s + Number(x.gross), 0);
  const revDelta = prevWeekSales ? Math.round(((lastWeekSales - prevWeekSales) / prevWeekSales) * 100) : 0;
  const conv = views ? (100 * d.series.reduce((s, x) => s + Number(x.tickets), 0)) / views : 0;
  const structure = (d.vmap?.structure && Object.keys(d.vmap.structure as object).length ? d.vmap.structure : defaultStructure(e.capacity ?? 2000)) as MapStructure;
  const overlay = (Array.isArray(d.vmap?.overlay) && (d.vmap!.overlay as unknown[]).length ? d.vmap!.overlay : defaultOverlay(d.tiers)) as OverlayEl[];
  const zones = overlay.filter(o => o.type === "zone");
  const page = (e.settings.public_page ?? { details: true, tickets: true, map: true, faqs: true, lineup: true, terms: true }) as Record<string, boolean>;
  const listings = (e.settings.listings as string[] | undefined) ?? [];
  const isPublic = e.visibility === "public" && ["published", "on_sale", "live"].includes(e.status);
  const posters = d.media.filter(m => ["poster", "image"].includes(m.kind));
  const srcs = (d.metrics.at(-1)?.sources ?? {}) as Record<string, number>;
  const srcColors = ["#ec4899", "#6366f1", "#0f172a", "#94a3b8", "#cbd5e1"];
  return <>
    <SubTabs current="tickets" items={items} />
    <div className="sl-grid">
      <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
        <div className="k-grid k-g4 sl-kpis">
          <div className="k-kpi"><span className="k-tile lg"><Ticket size={20} /></span><div className="k-grow"><div className="lbl">Tickets sold</div><div className="k-between"><div className="val">{num(d.sold)} / {num(d.cap)}</div><b className="k-small">{pct(d.sold, d.cap)}%</b></div><Bar value={pct(d.sold, d.cap)} label="Tickets sold" /></div></div>
          <div className="k-kpi"><span className="k-tile lg green"><BarChart3 size={20} /></span><div className="k-grow"><div className="k-between"><span className="lbl">Revenue</span>{revDelta !== 0 && <span className={`k-xs ${revDelta > 0 ? "k-green" : "k-red"}`}>{revDelta > 0 ? "↗" : "↘"} {revDelta > 0 ? "+" : ""}{revDelta}% this week</span>}</div><div className="val">{money(d.ticketRevenue)}</div><div className="sub">/ {money(d.potential)} potential</div></div></div>
          <div className="k-kpi"><span className="k-tile lg"><Eye size={20} /></span><div className="k-grow"><div className="lbl">Views</div><div className="k-between"><div className="val">{num(views)}</div><Spark data={viewsSpark} color="#16a34a" width={60} height={26} fill={false} /></div><div className="sub"><span className={viewsDelta >= 0 ? "up" : "down"}>{viewsDelta >= 0 ? "+" : ""}{viewsDelta}%</span> vs prior period</div></div></div>
          <div className="k-kpi"><span className="k-tile lg purple"><Percent size={20} /></span><div className="k-grow"><div className="lbl">Conversion rate</div><div className="k-between"><div className="val">{conv.toFixed(1)}%</div><Spark data={d.series.map(x => Number(x.tickets))} color="#7c3aed" width={60} height={26} fill={false} /></div><div className="sub">tickets ÷ page views (30 days)</div></div></div>
        </div>
        <div className="sl-row2">
          <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Ticket tiers</h3><Link href={`${base}/tickets/setup?step=2`} className="k-btn primary sm"><Plus size={14} />Add tier</Link></div>
            <table className="k-table" style={{ marginTop: 8 }}><thead><tr><th>Tier</th><th>Price</th><th>Sold / Capacity</th><th>Status</th><th /></tr></thead>
              <tbody>{d.tiers.filter(t => t.kind !== "comp").map(t => { const [l, tone] = TIER_STATUS[t.status] ?? [t.status, "gray"]; return <tr key={t.id}><td><span className="k-row" style={{ gap: 8 }}><i className="k-dot" style={{ background: t.color }} /><b style={{ fontWeight: 550, color: "var(--k-ink)" }} className="k-ellipsis">{t.name}</b></span></td><td>{money(t.price, "GBP", { decimals: true })}</td><td style={{ minWidth: 110 }}><span className="k-small">{num(t.sold)} / {num(t.quantity)}</span><Bar value={pct(t.sold, t.quantity)} thin tone={t.kind === "vip" ? "purple" : t.kind === "group" ? "amber" : t.kind === "early" ? "green" : undefined} label={`${t.name} sold`} /></td><td><Chip tone={tone}>{l}</Chip></td><td><Link href={`${base}/tickets/setup?step=2&tier=${t.id}`} className="k-icon-btn" aria-label={`Edit ${t.name}`}><MoreHorizontal size={15} /></Link></td></tr>; })}</tbody></table>
            {!d.tiers.length && <p className="k-small" style={{ padding: 12 }}>No ticket tiers yet. <Link className="k-link" href={`${base}/tickets/setup?step=1`}>Set up tickets</Link></p>}
            <div style={{ textAlign: "right", marginTop: 10 }}><Link className="k-link" href={`${base}/tickets/setup?step=3`}>Manage ticket settings <ArrowRight size={12} /></Link></div></Card>
          <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Venue map & ticketing</h3><Link href={`${base}/map`} className="k-btn outline sm"><PenLine size={13} />Edit map</Link></div>
            <div className="sl-map"><VenueMapSvg structure={structure} overlay={overlay} height={180} /><div className="sl-map-tools"><Link href={`${base}/map`} className="k-icon-btn" aria-label="Open full map"><Maximize2 size={14} /></Link><Link href={`${base}/map?tab=preview`} className="k-icon-btn" aria-label="Preview map"><Crosshair size={14} /></Link></div></div>
            <div className="k-grid k-g3" style={{ gap: 8, marginTop: 8 }}>{zones.slice(0, 3).map(z => { const t = d.tiers.find(x => x.id === z.tierId); return <div key={z.id} className="sl-zone"><i className="k-dot" style={{ background: z.color }} /><div><b className="k-small">{z.label === "General Admission" ? "General" : z.label}</b><div className="k-xs k-muted">{t ? `${num(t.sold)} / ${num(t.quantity)}` : `cap ${num(z.capacity ?? 0)}`}</div></div></div>; })}</div></Card>
        </div>
        <div className="sl-row3">
          <Card><div className="k-row" style={{ gap: 8 }}><h3 className="ov-h" style={{ fontSize: 15 }}>Public event page</h3>{isPublic ? <Chip tone="green" icon={CheckCircle2}>Live</Chip> : <Chip tone="gray">Not published</Chip>}</div>
            <div className="sl-page"><div>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={e.cover_image} alt="" className="sl-page-img" /><b className="k-strong" style={{ display: "block", marginTop: 8 }}>{e.name}</b><div className="k-xs k-muted">{dateShort(e.starts_at)} · {timeRange(e.starts_at, e.ends_at)}</div><div className="k-xs k-muted">{e.venue_name}, {e.city}</div>
              <div className="k-grid k-g2" style={{ gap: 6, marginTop: 10 }}>{isPublic && e.slug ? <Link href={`/events/${e.slug}`} target="_blank" className="k-btn outline sm"><Link2 size={13} />View public page</Link> : <span className="k-btn outline sm" aria-disabled style={{ opacity: .6 }}>Not published</span>}<Link href={`${base}/page`} className="k-btn outline sm">Edit page</Link></div></div>
              <div><PublicPageToggles eventId={id} initial={page} /><div style={{ marginTop: 10 }}>{e.slug && <CopyLink path={`/events/${e.slug}`} />}</div></div></div></Card>
          <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Posters & media</h3><Link className="k-link" href={`${base}/media?tab=library`}>View all <ArrowRight size={12} /></Link></div>
            <div className="sl-posters">{posters.slice(0, 4).map(p => /* eslint-disable-next-line @next/next/no-img-element */ <img key={p.id} src={p.url.startsWith("/") ? p.url : `/api/files/${p.id}`} alt={p.title} />)}{[e.cover_image, "/assets/gd/ev-neon.webp", "/assets/gd/oe-sunset.webp"].slice(0, Math.max(0, 3 - posters.length)).map((s, i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={s} alt="" className="placeholder" />)}<Link href={`${base}/media`} className="sl-add"><Plus size={18} />Create poster</Link></div>
            {!posters.length && <p className="k-xs k-muted" style={{ marginTop: 6 }}>No posters yet — event photography shown. Create posters in the Poster & Media builder.</p>}</Card>
        </div>
        <div className="sl-row3">
          <Card><div className="k-between"><div className="k-row" style={{ gap: 8 }}><h3 className="ov-h" style={{ fontSize: 15 }}>Discover & calendar</h3><span className="k-xs k-muted">Listed on {listings.length} platform{listings.length === 1 ? "" : "s"}</span></div><Link className="k-link" href={`${base}/promotion?tab=discover`}>Manage listings <ArrowRight size={12} /></Link></div>
            <div className="k-grid k-g3" style={{ gap: 8, marginTop: 10 }}>{listings.map(l => <div key={l} className="sl-listing"><span className="k-tile sm"><Globe size={13} /></span><div><b className="k-xs">{l}</b><div><Chip tone="green">Listed</Chip></div></div></div>)}<Link href={`${base}/promotion?tab=calendars`} className="sl-listing add"><Plus size={14} />Add platform</Link></div></Card>
          <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Audience & targeting</h3><Link className="k-link" href={`${base}/promotion?tab=audience`}>View audience <ArrowRight size={12} /></Link></div>
            <div className="sl-aud"><div><b style={{ fontSize: 18 }}>{num(d.metrics.reduce((s, m) => s + m.unique_visitors, 0))}</b><div className="k-xs k-muted">Unique visitors (30d)</div><BarChart labels={["Wk1", "Wk2", "Wk3", "Wk4"]} series={[[0, 1, 2, 3].map(w => d.metrics.slice(w * 7, w * 7 + 7).reduce((s, m) => s + m.unique_visitors, 0))]} height={70} colors={["#3b82f6"]} yFormat={v => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v))} /></div>
              <div><b className="k-small">Audience by source</b><div className="k-row" style={{ gap: 10, marginTop: 6 }}><Donut size={84} stroke={12} parts={Object.entries(srcs).map(([l, v], i) => ({ label: l, value: v, color: srcColors[i % 5]! }))} /><Legend items={Object.entries(srcs).map(([l, v], i) => ({ color: srcColors[i % 5]!, label: l, value: `${Math.round(v * 100)}%` }))} /></div></div></div></Card>
        </div>
      </div>
      <div className="k-col" style={{ gap: 14 }}>
        <section className="k-agent"><div className="k-between"><div className="k-agent-head" style={{ margin: 0 }}><Sparkles size={18} className="k-spark" /><h3>Gala Agent</h3><Beta /></div><MoreHorizontal size={16} className="k-muted" /></div><p style={{ margin: "6px 0" }}>I can help you sell and promote this event:</p>
          <ul className="pl-agent-list">{["Optimise ticket pricing", "Create promotional plan", "Generate posters & social posts", "Find and manage promoters", "Suggest audience targeting", "Track performance"].map(x => <li key={x}><CheckCircle2 size={16} className="k-green" />{x}</li>)}</ul>
          <Link href={`${base}/promotion/new?step=1`} className="k-btn outline block lg" style={{ marginTop: 10 }}><Megaphone size={15} />Generate promotion plan</Link>
          <Link href={`${base}/media`} className="k-btn ghost block" style={{ marginTop: 8, color: "var(--k-blue)" }}><ImageIcon size={15} />Create marketing assets</Link></section>
        <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Promotion channels</h3><Link className="k-link" href={`${base}/promotion`}>Manage <ArrowRight size={12} /></Link></div>
          <div className="k-list">{d.promos.slice(0, 6).map(p => { const I = /instagram|social/i.test(p.channel) ? Instagram : /facebook/i.test(p.channel) ? Facebook : /tiktok|video|lineup/i.test(p.channel) ? Music2 : /email/i.test(p.channel) ? Mail : /directory|discover/i.test(p.channel) ? Search : Megaphone; return <Link key={p.id} href={`${base}/promotion`} className="k-li"><span className="k-tile sm pink"><I size={13} /></span><span className="k-grow k-small k-ellipsis" style={{ color: "var(--k-ink)", fontWeight: 550 }}>{p.channel}</span><Chip tone={p.status === "requires_approval" ? "amber" : p.status === "scheduled" ? "blue" : "green"}>{p.status === "requires_approval" ? "Needs approval" : p.status === "ready" ? "Ready" : p.status}</Chip><span className="k-xs k-muted">{p.scheduled_at ? dateShort(p.scheduled_at).replace(/ \d{4}$/, "") : ""}</span></Link>; })}{!d.promos.length && <p className="k-small">No channels yet.</p>}</div></Card>
        <Card><div className="k-between"><h3 className="ov-h" style={{ fontSize: 15 }}>Performance</h3><span className="k-btn ghost sm">Last 30 days</span></div>
          <div className="k-grid k-g3" style={{ gap: 6, margin: "8px 0" }}><div><b>{num(views)}</b><div className="k-xs k-muted">Page views</div></div><div><b>{num(d.sold)}</b><div className="k-xs k-muted">Tickets sold</div></div><div><b>{money(d.ticketRevenue, "GBP", { compact: true })}</b><div className="k-xs k-muted">Revenue</div></div></div>
          <LineChart series={[{ data: d.metrics.map(m => m.page_views), color: "#3b82f6", label: "Page views", fill: true }, { data: d.series.map(x => Number(x.tickets) * 10), color: "#8b5cf6", label: "Tickets sold (×10)" }]} labels={d.metrics.map((m, i) => (i % 7 === 0 ? new Date(`${m.day}T12:00:00Z`).toLocaleString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : ""))} height={90} yFormat={v => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v))} /></Card>
      </div>
    </div>
  </>;
}
