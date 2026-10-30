import Link from "next/link";
import { CalendarDays, ChevronDown, Search, Filter, List, LayoutGrid, MoreHorizontal, ArrowRight, Image as ImageIcon, Link2, Rocket, BookOpen, Share2, Plus, CheckCircle2, Flame, Clock } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { listWorkspaceEvents, withStats } from "@/lib/data/organizer";
import { Crumbs, LinkTabs, Spark, LineChart, Beta } from "@/components/kit";
import { AgentAsk } from "@/components/kit/client";
import { HubFilters } from "@/components/organizer/tickets-hub-client";
import { money, num, eventTypeLabel } from "@/lib/format";
import { requestTime } from "@/lib/workspace/format";

export const metadata = { title: "Tickets & Promotion" };
const TZ = "Europe/London";
const COLORS = ["#4f46e5", "#a855f7", "#10b981", "#f97316", "#0ea5e9"];

export default async function TicketsHub({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const ctx = await getOrganizer(); const sb = ctx.supabase;
  const tab = ["promotion", "directory", "promoters", "media", "performance"].includes(sp.tab ?? "") ? sp.tab! : "ticketing";
  const days = Math.min(365, Math.max(7, Number(sp.days) || 30));
  const now = requestTime(); const since = new Date(now - days * 864e5).toISOString(); const prevSince = new Date(now - 2 * days * 864e5).toISOString();
  const all = await withStats(sb, await listWorkspaceEvents(sb, ctx.workspace.id));
  const ticketed = all.filter(e => e.ticketCap > 0 && !["cancelled", "archived"].includes(e.status));
  const scope = sp.event ? ticketed.filter(e => e.id === sp.event) : ticketed;
  // "Share event" needs a page the public can open (same rule as /events/[slug]); otherwise it goes to the promotion tab.
  const shareable = scope.find(e => e.slug && e.visibility === "public" && ["published", "on_sale", "live"].includes(e.status));
  const ids = scope.map(e => e.id);
  const [{ data: tk }, { data: views }, { data: promoters }, { data: media }, { data: promos }] = ids.length ? await Promise.all([
    sb.from("tickets").select("event_id,price_paid,created_at").in("event_id", ids).gte("created_at", prevSince).is("replaced_by", null),
    sb.from("event_metrics_daily").select("event_id,day,page_views").in("event_id", ids).gte("day", prevSince.slice(0, 10)),
    sb.from("promoters").select("id,name,event_id,tickets_sold,revenue,clicks,status").in("event_id", ids).order("revenue", { ascending: false }).limit(20),
    sb.from("media_assets").select("id,title,url,kind,format,event_id,status").eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: false }).limit(12),
    sb.from("promotions").select("id,title,channel,status,event_id,scheduled_at,cost").in("event_id", ids).order("scheduled_at", { ascending: false }).limit(20),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const cur = (tk ?? []).filter(t => t.created_at >= since), prev = (tk ?? []).filter(t => t.created_at < since);
  const rev = cur.reduce((s, t) => s + Number(t.price_paid), 0), prevRev = prev.reduce((s, t) => s + Number(t.price_paid), 0);
  const pv = (views ?? []).filter(v => v.day >= since.slice(0, 10)).reduce((s, v) => s + v.page_views, 0), prevPv = (views ?? []).filter(v => v.day < since.slice(0, 10)).reduce((s, v) => s + v.page_views, 0);
  const pct = (a: number, b: number) => b ? Math.round(((a - b) / b) * 100) : null;
  const onSale = scope.filter(e => e.starts_at && Date.parse(e.starts_at) > now && ["on_sale", "published", "live"].includes(e.status));
  const fast = onSale.filter(e => e.ticketCap && e.sold / e.ticketCap >= 0.6).length;
  const fill = scope.length ? Math.round(scope.reduce((s, e) => s + (e.ticketCap ? e.sold / e.ticketCap : 0), 0) / scope.length * 100) : 0;
  const conv = pv ? (cur.length / pv) * 100 : 0, prevConv = prevPv ? (prev.length / prevPv) * 100 : 0;
  // Daily series (last `days`) for sparklines and the performance chart.
  const dayKeys = Array.from({ length: days }, (_, i) => new Date(now - (days - 1 - i) * 864e5).toISOString().slice(0, 10));
  const daily = (pred: (t: { event_id: string }) => boolean, f: (t: { price_paid: number }) => number) => dayKeys.map(d => cur.filter(t => t.created_at.slice(0, 10) === d && pred(t)).reduce((s, t) => s + f(t), 0));
  const cum = (a: number[]) => a.reduce<number[]>((o, v) => [...o, (o.at(-1) ?? 0) + v], []);
  const top = [...scope].sort((a, b) => b.ticketRevenue - a.ticketRevenue).slice(0, 4);
  const q = (sp.q ?? "").toLowerCase();
  const list = [...scope].filter(e => tab !== "ticketing" || !e.ends_at || Date.parse(e.ends_at) > now - 864e5).filter(e => !q || e.name.toLowerCase().includes(q)).filter(e => sp.status !== "draft" || e.status === "draft").sort((a, b) => (a.starts_at ?? "9").localeCompare(b.starts_at ?? "9"));
  const status = (e: typeof scope[number]) => e.status === "draft" ? ["Draft", "gray"] : e.ticketCap && e.sold >= e.ticketCap ? ["Sold out", "red"] : e.ticketCap && e.sold / e.ticketCap >= 0.6 && e.starts_at && Date.parse(e.starts_at) - now < 60 * 864e5 ? ["Selling Fast", "amber"] : ["On Sale", "green"];
  const pvBy = (id: string) => (views ?? []).filter(v => v.event_id === id && v.day >= since.slice(0, 10)).reduce((s, v) => s + v.page_views, 0);
  const tkBy = (id: string) => cur.filter(t => t.event_id === id).length;
  const href = (p: Record<string, string | undefined>) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries({ tab: tab === "ticketing" ? undefined : tab, days: days === 30 ? undefined : String(days), event: sp.event, q: sp.q, ...p })) if (v) u.set(k, v); return `/organizer/tickets${u.size ? `?${u}` : ""}`; };
  const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
  const delta = (d: number | null) => d == null ? null : <span className={d >= 0 ? "th-up" : "th-down"}>{d >= 0 ? "↑" : "↓"} {Math.abs(d)}%</span>;
  const range = `${new Date(now - days * 864e5).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} – ${new Date(now).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  return <div className="th">
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Tickets & Promotion" }]} />
    <div className="k-page-head th-head"><div><h1>Tickets &amp; Promotion Hub</h1><p className="sub">Manage ticketing, promotion and media for all your events.</p></div>
      <HubFilters days={days} range={range} event={sp.event ?? ""} events={ticketed.map(e => ({ id: e.id, name: e.name }))} /></div>
    <LinkTabs current={tab} tabs={[["ticketing", "Ticketing"], ["promotion", "Promotion"], ["directory", "Directory"], ["promoters", "Promoters"], ["media", "Media"], ["performance", "Performance"]].map(([k, l]) => ({ key: k, label: l, href: href({ tab: k === "ticketing" ? undefined : k }) }))} />
    <div className="th-kpis">
      <div className="ce-card th-kpi"><small>Total ticket revenue</small><b>{money(rev)}</b>{delta(pct(rev, prevRev))}<Spark data={daily(() => true, t => Number(t.price_paid))} width={86} height={40} /></div>
      <div className="ce-card th-kpi"><small>Tickets sold</small><b>{num(cur.length)}</b>{delta(pct(cur.length, prev.length))}<Spark data={cum(daily(() => true, () => 1))} width={100} height={40} /></div>
      <div className="ce-card th-kpi"><small>Events on sale</small><b>{onSale.length}</b><em>{fast} selling fast</em><span className="th-ic"><CalendarDays size={20} /></span></div>
      <div className="ce-card th-kpi"><small>Avg. event fill rate</small><b>{fill}%</b><span className="th-ring" style={{ ["--v" as string]: fill }} /></div>
      <div className="ce-card th-kpi"><small>Page views (all events)</small><b>{fmtK(pv)}</b>{delta(pct(pv, prevPv))}<Spark data={dayKeys.map(d => (views ?? []).filter(v => v.day === d).reduce((s, v) => s + v.page_views, 0))} width={86} height={40} /></div>
      <div className="ce-card th-kpi"><small>Conversion rate</small><b>{conv.toFixed(1)}%</b>{prevConv ? <span className={conv >= prevConv ? "th-up" : "th-down"}>{conv >= prevConv ? "↑" : "↓"} {Math.abs(conv - prevConv).toFixed(1)}%</span> : null}<Spark data={dayKeys.map(d => { const v = (views ?? []).filter(x => x.day === d).reduce((s, x) => s + x.page_views, 0); return v ? cur.filter(t => t.created_at.slice(0, 10) === d).length / v * 100 : 0; })} width={100} height={40} /></div>
    </div>
    <div className="th-grid">
      <div className="th-main">
        {tab === "ticketing" || tab === "performance" ? <section className="ce-card th-events"><div className="k-between th-eh"><div><h2>Live &amp; Upcoming Events</h2><p>Manage tickets, promotion and performance across all events.</p></div>
          <form className="th-tools" action="/organizer/tickets">{tab !== "ticketing" && <input type="hidden" name="tab" value={tab} />}<span className="th-search"><Search size={15} /><input name="q" defaultValue={sp.q ?? ""} placeholder="Search events..." aria-label="Search events" /></span><Link className="k-btn outline th-f" href={href({ status: sp.status === "draft" ? undefined : "draft" })}><Filter size={15} />{sp.status === "draft" ? "Drafts" : "Filter"}</Link><span className="th-seg"><Link href={href({ view: undefined })} aria-current={sp.view !== "cards" ? "true" : undefined}><List size={15} />List</Link><Link href={href({ view: "cards" })} aria-current={sp.view === "cards" ? "true" : undefined}><LayoutGrid size={15} />Cards</Link></span></form></div>
          {sp.view === "cards" ? <div className="th-cards">{list.map(e => { const [sl, st] = status(e); return <Link key={e.id} href={`/organizer/events/${e.id}?tab=sell`} className="th-card">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={e.cover_image || "/assets/gd/oe-neon.webp"} alt="" /><b>{e.name}</b><small>{e.starts_at ? new Date(e.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }) : "TBC"} · {e.venue_name}</small><span className="th-bar"><i style={{ width: `${e.ticketCap ? (e.sold / e.ticketCap) * 100 : 0}%` }} /></span><span className="k-between"><em>{num(e.sold)} / {num(e.ticketCap)}</em><span className={`th-st ${st}`}>{sl}</span></span></Link>; })}</div>
          : <div className="k-table-wrap"><table className="k-table th-table"><thead><tr><th>Event</th><th>Date</th><th>Venue</th><th>Tickets</th><th>Revenue</th><th>Status</th><th>Actions</th></tr></thead><tbody>{list.map(e => { const [sl, st] = status(e); const p = e.ticketCap ? Math.round((e.sold / e.ticketCap) * 100) : 0;
            return <tr key={e.id}><td><div className="th-ev">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={e.cover_image || "/assets/gd/oe-neon.webp"} alt="" /><div><Link href={`/organizer/events/${e.id}`}><b>{e.name}</b></Link><span className="th-tags">{[...new Map([eventTypeLabel(e.event_type), ...(e.tags ?? []).slice(0, 2)].map(t => [t.toLowerCase(), t])).values()].slice(0, 2).map(t => <i key={t}>{t}</i>)}</span></div></div></td>
              <td><b className="th-d">{e.starts_at ? new Date(e.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }) : "TBC"}</b><small>{e.starts_at ? new Date(e.starts_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }) : ""}{e.ends_at ? ` – ${new Date(e.ends_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ })}` : ""}</small></td>
              <td><b className="th-d">{e.venue_name || "TBC"}</b><small>{e.city}</small></td>
              <td><b className="th-d">{num(e.sold)} / {num(e.ticketCap)}</b><span className="th-prog"><span className="th-bar"><i style={{ width: `${p}%` }} /></span>{p}%</span></td>
              <td><b className="th-d">{money(e.ticketRevenue)}</b></td><td><span className={`th-st ${st}`}>{st === "green" ? <CheckCircle2 size={12} /> : st === "amber" ? <Flame size={12} /> : <Clock size={12} />}{sl}</span></td>
              <td><span className="k-row" style={{ gap: 8 }}><Link className="k-btn outline th-manage" href={`/organizer/events/${e.id}/tickets/setup`}>Manage</Link><Link className="k-icon-btn th-dots" href={`/organizer/events/${e.id}?tab=sell`} aria-label={`More for ${e.name}`}><MoreHorizontal size={16} /></Link></span></td></tr>; })}
            {!list.length && <tr><td colSpan={7} className="k-small" style={{ padding: 20 }}>No ticketed events yet. <Link href="/organizer/events">Set up tickets on an event</Link>.</td></tr>}</tbody></table></div>}</section>
        : tab === "promoters" ? <section className="ce-card th-events"><h2>Promoters</h2><div className="k-table-wrap"><table className="k-table th-table"><thead><tr><th>Promoter</th><th>Event</th><th>Clicks</th><th>Tickets</th><th>Revenue</th><th>Status</th></tr></thead><tbody>{(promoters ?? []).map(p => <tr key={p.id}><td><b>{p.name}</b></td><td>{scope.find(e => e.id === p.event_id)?.name}</td><td>{num(p.clicks)}</td><td>{num(p.tickets_sold)}</td><td>{money(p.revenue)}</td><td><span className={`th-st ${p.status === "active" ? "green" : "gray"}`}>{p.status}</span></td></tr>)}{!(promoters ?? []).length && <tr><td colSpan={6} className="k-small" style={{ padding: 20 }}>No promoters yet.</td></tr>}</tbody></table></div></section>
        : tab === "promotion" ? <section className="ce-card th-events"><div className="k-between"><h2>Campaigns</h2><Link className="k-btn primary" href="/organizer/promotions/new"><Plus size={15} />Create promotion</Link></div><div className="k-table-wrap"><table className="k-table th-table"><thead><tr><th>Campaign</th><th>Event</th><th>Channel</th><th>Scheduled</th><th>Budget</th><th>Status</th></tr></thead><tbody>{(promos ?? []).map(p => <tr key={p.id}><td><b>{p.title}</b></td><td>{scope.find(e => e.id === p.event_id)?.name}</td><td>{p.channel}</td><td>{p.scheduled_at ? new Date(p.scheduled_at).toLocaleDateString("en-GB") : "—"}</td><td>{money(p.cost)}</td><td><span className={`th-st ${p.status === "live" ? "green" : p.status === "scheduled" ? "blue" : "gray"}`}>{p.status}</span></td></tr>)}{!(promos ?? []).length && <tr><td colSpan={6} className="k-small" style={{ padding: 20 }}>No campaigns yet.</td></tr>}</tbody></table></div></section>
        : tab === "directory" ? <section className="ce-card th-events"><h2>Gala Dock directory</h2><p className="k-small">Public events appear in Discover and the event directory automatically once tickets are on sale.</p><ul className="th-dir">{scope.map(e => <li key={e.id}><b>{e.name}</b><span className={`th-st ${e.visibility === "public" && ["on_sale", "published", "live"].includes(e.status) ? "green" : "gray"}`}>{e.visibility === "public" && ["on_sale", "published", "live"].includes(e.status) ? "Listed" : e.visibility === "public" ? "Not on sale" : "Private"}</span>{e.slug && <Link className="k-link" href={`/events/${e.slug}`}>View page <ArrowRight size={12} /></Link>}</li>)}</ul></section>
        : <section className="ce-card th-events"><h2>Media library</h2><div className="th-media big">{(media ?? []).map(m => <figure key={m.id}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={m.url} alt="" /><figcaption>{m.title}</figcaption></figure>)}{!(media ?? []).length && <p className="k-small">No media yet — create a poster from an event&apos;s Promote tab.</p>}</div></section>}
        <div className="th-two">
          <section className="ce-card th-assets"><div className="k-between"><div><h2>Promotion Assets</h2><p>Event posters, images, videos and approved media.</p></div><Link className="k-btn outline th-vml" href={href({ tab: "media" })}>View media library <ArrowRight size={14} /></Link></div>
            <div className="th-chips">{["All", "Posters", "Videos", "Images", "Venue Tours", "Showreels"].map((c, i) => <span key={c} className={i === 0 ? "on" : ""}>{c}</span>)}</div>
            <div className="th-media">{(media ?? []).filter(m => m.url).slice(0, 4).map(m => /* eslint-disable-next-line @next/next/no-img-element */ <img key={m.id} src={m.url} alt={m.title} />)}{(media ?? []).length < 4 && scope.slice(0, 4 - (media ?? []).length).map(e => /* eslint-disable-next-line @next/next/no-img-element */ <img key={e.id} src={e.cover_image || "/assets/gd/oe-neon.webp"} alt={e.name} />)}<Link href={scope[0] ? `/organizer/events/${scope[0].id}/media` : "/organizer/events"} className="th-new"><Plus size={20} /><b>Create new</b><small>Poster, image or video</small></Link></div></section>
          <section className="ce-card th-perf"><div className="k-between"><div><h2>Ticket Sales Performance</h2><p>Sales pace, capacity and revenue across events.</p></div><span className="th-sel">Revenue <ChevronDown size={14} /></span></div>
            <LineChart height={170} labels={dayKeys.map((d, i) => i % Math.ceil(days / 5) === 0 ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "")} yFormat={v => v >= 1000 ? `£${Math.round(v / 1000)}K` : `£${v}`} series={top.map((e, i) => ({ label: e.name, color: COLORS[i]!, data: cum(daily(t => t.event_id === e.id, t => Number(t.price_paid))), fill: i === 0 }))} />
            <div className="th-legend">{top.map((e, i) => <span key={e.id}><i style={{ background: COLORS[i] }} />{e.name}</span>)}</div></section>
        </div>
      </div>
      <aside className="th-side">
        <section className="ce-card th-tools-c"><h2>Promotion Tools</h2><p>Launch and manage promotion for your event.</p><ul>{([[ImageIcon, "Create event poster", "Generate AI posters and media", scope[0] ? `/organizer/events/${scope[0].id}/media` : "/organizer/events", "green"], [Link2, "Create promoter link", "Invite promoters and track sales", href({ tab: "promoters" }), "amber"], [Rocket, "Buy owned boost", "Feature in our event directory", "/organizer/promotions/new?type=boost", "red"], [BookOpen, "Submit to directory", "List on Gala Dock event calendar", href({ tab: "directory" }), "purple"], [Share2, "Share event", "Get public link and social assets", shareable ? `/events/${shareable.slug}` : href({ tab: "promotion" }), "blue"]] as const).map(([I, t, s, h, c]) => <li key={t}><Link href={h}><span className={`th-ti ${c}`}><I size={17} /></span><span className="k-grow"><b>{t}</b><small>{s}</small></span><ArrowRight size={15} /></Link></li>)}</ul></section>
        <section className="ce-card th-qp"><div className="k-between"><h2>Quick Performance</h2><Link className="k-link" href={href({ tab: "performance" })}>View all <ArrowRight size={13} /></Link></div>
          <table><thead><tr><th>Event</th><th /><th>Views</th><th>Tickets</th><th>Conv.</th></tr></thead><tbody>{[...scope].sort((a, b) => pvBy(b.id) - pvBy(a.id)).slice(0, 5).map((e, i) => { const v = pvBy(e.id), t = tkBy(e.id); return <tr key={e.id}><td>{e.name}</td><td><Spark data={dayKeys.slice(-14).map(d => (views ?? []).filter(x => x.event_id === e.id && x.day === d).reduce((s, x) => s + x.page_views, 0))} width={44} height={16} color={COLORS[i % 5]} fill={false} /></td><td>{fmtK(v)}</td><td>{num(t)}</td><td>{v ? ((t / v) * 100).toFixed(1) : "0.0"}%</td></tr>; })}</tbody></table></section>
        <section className="ce-card th-top"><div className="k-between"><h2>Top Promoters</h2><Link className="k-link" href={href({ tab: "promoters" })}>View all <ArrowRight size={13} /></Link></div>
          <ol>{(promoters ?? []).slice(0, 4).map((p, i) => <li key={p.id}><span className="th-rank">{i + 1}</span><span className="th-pav">{p.name.slice(0, 1)}</span><b className="k-grow">{p.name}</b><small>{p.tickets_sold} ticket sales</small><strong>{money(p.revenue)}</strong></li>)}{!(promoters ?? []).length && <li className="k-small">Invite promoters to track their sales here.</li>}</ol></section>
        <section className="ce-card th-agent"><div className="k-row" style={{ gap: 8 }}><b>Gala Agent</b><Beta /></div><p className="k-small">Boost ticket sales with AI marketing plans.</p><AgentAsk scope="organizer" placeholder="Ask anything..." compact /></section>
      </aside>
    </div>
  </div>;
}
