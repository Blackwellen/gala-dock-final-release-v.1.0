import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Users, Wallet, Phone, Mail, MoreHorizontal, ExternalLink, Sparkles, MessageSquare, Search, FileText, CheckCircle2, ArrowRight, PenLine, Target, Clock, BarChart3, ListChecks, Paperclip, CalendarClock, Building2, Pencil, Navigation } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { Crumbs, Card, Chip, Bar, Avatar, Beta } from "@/components/kit";
import { AgentAsk, MapView } from "@/components/kit/client";
import { LeadActions, ActivityComposer } from "@/components/organizer/sales-client";
import { LEAD_IMG } from "../../page";
import { money, dateShort, time, relative } from "@/lib/format";

export const metadata = { title: "Lead" };
const CITY: Record<string, [number, number]> = { london: [51.5072, -0.1276], manchester: [53.4808, -2.2426], birmingham: [52.4862, -1.8904], surrey: [51.3148, -0.56] };
const ACT_ICON: Record<string, [typeof Mail, string]> = { enquiry: [Target, "blue"], email: [Mail, "purple"], call: [Phone, "green"], note: [PenLine, "amber"], task: [ListChecks, "purple"], stage: [CheckCircle2, "blue"], proposal: [FileText, "blue"], meeting: [CalendarDays, "green"] };

export default async function LeadPage({ params, searchParams }: PageProps<"/organizer/sales/leads/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]); const ctx = await getOrganizer(); const sb = ctx.supabase;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: l } = await sb.from("leads").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!l) notFound();
  const tab = sp.tab === "activity" ? "activity" : "overview";
  const d = (l.details ?? {}) as { flexibility?: string; venue_pref?: string; requirements?: string[]; potential_profit?: number; sales_cycle?: string; lost_reason?: string };
  const [{ data: acts }, { data: venues }, { data: suppliers }, { data: proposals }, { data: crew }, { data: events }, { count: msgs }] = await Promise.all([
    sb.from("lead_activities").select("*").eq("lead_id", l.id).order("created_at", { ascending: false }),
    sb.from("listings").select("id,name,city,capacity_max,price_from,image,details,kind").eq("kind", "venue").eq("published", true).gte("capacity_max", 3000).order("rating", { ascending: false }).limit(3),
    sb.from("listings").select("id,name,category,price_from,image").eq("kind", "service").eq("published", true).in("category", ["Production", "Security", "Marquees", "Catering"]).order("rating", { ascending: false }).limit(3),
    sb.from("proposals").select("id,number,status").eq("lead_id", l.id),
    sb.from("crew_members").select("name,avatar,member_type").eq("workspace_id", ctx.workspace.id),
    sb.from("events").select("id,name").eq("workspace_id", ctx.workspace.id).is("lead_id", null).order("starts_at"),
    sb.from("lead_activities").select("id", { count: "exact", head: true }).eq("lead_id", l.id).in("kind", ["email", "call"]),
  ]);
  const owners = [ctx.name, ...(crew ?? []).filter(c => c.member_type === "member").map(c => c.name)];
  const avatar = (n: string) => crew?.find(c => c.name === n)?.avatar ?? (n === ctx.name ? "/assets/gd/av-alex-organizer.webp" : null);
  const city = Object.keys(CITY).find(c => l.location.toLowerCase().includes(c)) ?? "london";
  const coord = CITY[city]!;
  const stageTone = { new: "purple", qualified: "blue", proposal: "purple", negotiating: "amber", won: "green", lost: "red" }[l.stage] as "blue";
  const proposalHref = `/organizer/proposals/new?step=1&lead=${l.id}`;

  return <>
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Sales", href: "/organizer/sales" }, { label: "Leads", href: "/organizer/sales?view=list" }, { label: l.reference }]} />
    <div className="ld-head">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LEAD_IMG[l.event_type] ?? "/assets/gd/oe-neon.webp"} alt="" className="ld-cover" />
      <div><Chip tone={stageTone}>{l.stage[0]!.toUpperCase() + l.stage.slice(1)}</Chip><h1 style={{ fontSize: 28, margin: "6px 0 4px" }}>{l.name}</h1><div className="k-row k-small k-muted" style={{ gap: 10 }}><span>{l.reference}</span><span>•</span><span>Enquiry received {dateShort(l.created_at)}</span><span>•</span><span>{l.source}</span></div><div className="k-row k-wrap" style={{ gap: 6, marginTop: 10 }}>{l.tags.map((t, i) => <Chip key={t} tone={(["pink", "blue", "green", "green"] as const)[i % 4]}>{t}</Chip>)}</div></div>
      <div className="k-col" style={{ gap: 14, alignItems: "flex-end" }}>
        <div className="ld-meta"><div><small>Owner</small><span className="k-row" style={{ gap: 8 }}><Avatar src={avatar(l.owner_name)} name={l.owner_name} />{l.owner_name}</span></div><div><small>Client</small><span className="k-row" style={{ gap: 8 }}><span className="k-tile sm"><Building2 size={14} /></span>{l.client_name}</span></div><div><small>Probability</small><b style={{ fontSize: 18 }}>{l.probability}%</b><Bar value={l.probability} label="Probability" /></div><div><small>Value (est.)</small><b style={{ fontSize: 18 }}>{money(l.value)}</b></div><div><small>Target date</small><span className="k-row" style={{ gap: 6 }}><CalendarDays size={15} />{l.expected_date ? dateShort(`${l.expected_date}T12:00:00Z`) : "—"}</span></div></div>
        <LeadActions id={l.id} stage={l.stage} owners={owners} events={events ?? []} proposalHref={proposalHref} />
      </div>
    </div>
    {l.stage === "lost" && <div className="k-notice red"><span><b>Lost:</b> {d.lost_reason ?? "No reason recorded"}</span></div>}
    {l.event_id && <div className="k-notice green"><CheckCircle2 size={16} className="k-green" /><span><b>Won.</b> Linked to <Link className="k-link" href={`/organizer/events/${l.event_id}`}>its event</Link>.</span></div>}
    <nav className="k-tabs"><Link className="k-tab" href={`/organizer/sales/leads/${l.id}`} aria-current={tab === "overview" ? "page" : undefined}>Overview</Link><Link className="k-tab" href={`/organizer/sales/leads/${l.id}?tab=activity`} aria-current={tab === "activity" ? "page" : undefined}>Activity</Link></nav>
    <div className="ld-grid">
      <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
        {tab === "overview" ? <>
          <div className="ld-two">
            <Card><div className="k-between" style={{ marginBottom: 10 }}><h2 className="ov-h" style={{ fontSize: 15 }}>Event requirement</h2><button className="k-btn ghost sm" disabled title="Edit from the lead form">Edit</button></div>
              <div className="ld-req">
                <div><small>Event type</small><b>{l.event_type}</b></div>
                <div><small>Event date</small><b>{l.expected_date ? dateShort(`${l.expected_date}T12:00:00Z`) : "TBC"}</b>{d.flexibility && <div className="k-xs k-muted">± {d.flexibility}</div>}</div>
                <div><small>Location preference</small>{l.location || "—"}<div className="k-xs k-muted">Open to alternatives</div></div>
                <div><small>Expected attendance</small><b>{l.guests || "—"}</b><div className="k-xs k-muted">General public</div></div>
                <div><small>Budget (estimated)</small><b>{l.budget || "—"}</b></div>
                <div><small>Venue preference</small>{d.venue_pref ?? "—"}</div>
                <div style={{ gridColumn: "span 2" }}><small>Core requirements</small>{d.requirements?.length ? <ul>{d.requirements.map(r => <li key={r}>{r}</li>)}</ul> : "—"}</div>
                <div><small>Source</small>{l.source}</div>
                <div><small>Assigned to</small><span className="k-row" style={{ gap: 6 }}><Avatar src={avatar(l.owner_name)} name={l.owner_name} size="sm" />{l.owner_name}</span></div>
                <div><small>Current stage</small><Chip tone={stageTone}>{l.stage}</Chip></div>
                <div><small>Next action</small>{l.next_action ? <span className="k-row" style={{ gap: 6, alignItems: "flex-start" }}><CalendarClock size={14} className="k-amber" /><span>{l.next_action}<div className="k-xs k-muted">{l.next_action_at ? `${dateShort(l.next_action_at)}, ${time(l.next_action_at)}` : ""}</div></span></span> : "—"}</div>
              </div></Card>
            <Card><div className="k-between" style={{ marginBottom: 10 }}><h2 className="ov-h" style={{ fontSize: 15 }}>Client / Contact</h2></div>
              <div className="k-li"><span className="k-tile lg"><Building2 size={20} /></span><div><b className="k-strong">{l.client_name}</b><div className="k-xs k-muted">Client organisation</div></div></div>
              <div className="k-li" style={{ marginTop: 12 }}><Avatar name={l.contact_name || l.client_name} size="lg" /><div className="k-grow"><b className="k-small k-strong">{l.contact_name || "No contact yet"}</b><div className="k-xs k-muted">Primary contact</div></div>{l.contact_phone && <a className="k-icon-btn" href={`tel:${l.contact_phone}`} aria-label="Call"><Phone size={14} /></a>}{l.contact_email && <a className="k-icon-btn" href={`mailto:${l.contact_email}`} aria-label="Email"><Mail size={14} /></a>}</div>
              <h3 className="k-xs k-muted" style={{ margin: "14px 0 6px" }}>Contact details</h3>
              <ul className="cal-kv">{l.contact_email && <li><Mail size={13} className="k-blue" /><a className="k-link" href={`mailto:${l.contact_email}`}>{l.contact_email}</a></li>}{l.contact_phone && <li><Phone size={13} className="k-blue" />{l.contact_phone}</li>}<li><MapPin size={13} className="k-blue" />{l.client_name}, {l.location || "UK"}</li></ul></Card>
          </div>
          <div className="ld-two">
            <Card><h2 className="ov-h" style={{ fontSize: 15, marginBottom: 10 }}>Key information</h2><div className="k-grid k-g3" style={{ gap: 8 }}>
              <div className="k-kpi" style={{ padding: 10 }}><span className="k-tile green"><Wallet size={16} /></span><div><div className="lbl">Expected value</div><div className="val" style={{ fontSize: 15.5 }}>{money(l.value)}</div></div></div>
              <div className="k-kpi" style={{ padding: 10 }}><span className="k-tile green"><Target size={16} /></span><div className="k-grow"><div className="lbl">Probability</div><div className="val" style={{ fontSize: 15.5 }}>{l.probability}%</div><Bar value={l.probability} tone="green" label="Probability" /></div></div>
              <div className="k-kpi" style={{ padding: 10 }}><span className="k-tile"><Clock size={16} /></span><div><div className="lbl">Sales cycle</div><div className="val" style={{ fontSize: 15.5 }}>{Math.max(1, Math.round((Date.now() - new Date(l.created_at).getTime()) / 864e5))} days</div></div></div>
              <div className="k-kpi" style={{ padding: 10 }}><span className="k-tile"><BarChart3 size={16} /></span><div><div className="lbl">Weighted value</div><div className="val" style={{ fontSize: 15.5 }}>{money(Number(l.value) * l.probability / 100)}</div></div></div>
              {d.potential_profit != null && <div className="k-kpi" style={{ padding: 10 }}><span className="k-tile"><BarChart3 size={16} /></span><div><div className="lbl">Potential profit</div><div className="val" style={{ fontSize: 15.5 }}>{money(d.potential_profit)}</div></div></div>}
            </div></Card>
            <Card><div className="k-between" style={{ marginBottom: 10 }}><h2 className="ov-h" style={{ fontSize: 15 }}>Location & area</h2><Link className="k-link" href={`/organizer/marketplace?tab=venues&city=${city}`}>Venues nearby <ArrowRight size={12} /></Link></div>
              <MapView pins={[{ id: "lead", lat: coord[0], lng: coord[1], label: l.location }]} center={{ lat: coord[0], lng: coord[1] }} zoom={11} height={150} mapKey={process.env.MAP_TILER_API_KEY} ariaLabel={`Map of ${l.location}`} /></Card>
          </div>
          <div className="ld-two">
            <Card><div className="k-between" style={{ marginBottom: 10 }}><h2 className="ov-h" style={{ fontSize: 15 }}>Suggested venues</h2><Link className="k-link" href="/organizer/marketplace?tab=venues">View all <ArrowRight size={12} /></Link></div><p className="k-xs k-muted" style={{ marginBottom: 8 }}>Ranked by capacity fit for {l.guests || "the expected attendance"} and rating.</p>
              <div className="k-grid k-g3" style={{ gap: 8 }}>{(venues ?? []).map(v => <div key={v.id} className="ld-venue">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={v.image} alt="" /><div style={{ padding: 8 }}><b className="k-small k-strong k-ellipsis" style={{ display: "block" }}>{v.name}</b><div className="k-xs k-muted">{v.city} · {v.capacity_max?.toLocaleString()} cap</div><div className="k-between" style={{ marginTop: 6 }}><b className="k-small">{money(v.price_from)}</b><Link className="k-btn outline sm" href={`/organizer/marketplace/venue/${v.id}`}>View</Link></div></div></div>)}</div></Card>
            <Card><div className="k-between" style={{ marginBottom: 10 }}><h2 className="ov-h" style={{ fontSize: 15 }}>Suggested suppliers</h2><Link className="k-link" href="/organizer/marketplace?tab=services">View all <ArrowRight size={12} /></Link></div>
              <div className="k-list">{(suppliers ?? []).map(s => <div key={s.id} className="k-li">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={s.image} alt="" className="k-thumb sm" /><div className="k-grow"><b className="k-small k-strong">{s.name}</b><div className="k-xs k-muted">{s.category}</div></div><span className="k-xs">from {money(s.price_from)}</span><Link className="k-btn outline sm" href={`/organizer/marketplace/service/${s.id}`}>View</Link></div>)}</div></Card>
          </div>
          <Card><h2 className="ov-h" style={{ fontSize: 15, marginBottom: 10 }}>Related items</h2><div className="ld-related">
            <Link href={proposals?.length ? `/organizer/sales/proposals/${proposals[0]!.id}` : proposalHref}><span className="k-tile sm purple"><FileText size={14} /></span><span><b>{proposals?.length ?? 0} Proposals</b><div className="k-link">{proposals?.length ? "Open proposal" : "Create proposal"}</div></span></Link>
            <Link href={l.event_id ? `/organizer/events/${l.event_id}` : `/organizer/sales/leads/${l.id}?action=convert`}><span className="k-tile sm green"><CalendarDays size={14} /></span><span><b>{l.event_id ? 1 : 0} Events</b><div className="k-link">{l.event_id ? "Open event" : "Convert to event"}</div></span></Link>
            <Link href="/organizer/team?tab=assignments"><span className="k-tile sm purple"><ListChecks size={14} /></span><span><b>{(acts ?? []).filter(a => a.kind === "task").length} Tasks</b><div className="k-link">View tasks</div></span></Link>
            <Link href={`/organizer/sales/leads/${l.id}?tab=activity`}><span className="k-tile sm"><MessageSquare size={14} /></span><span><b>{msgs ?? 0} Messages</b><div className="k-link">View messages</div></span></Link>
            <Link href={`/organizer/sales/leads/${l.id}?tab=activity`}><span className="k-tile sm"><Paperclip size={14} /></span><span><b>Files</b><div className="k-link">View files</div></span></Link>
          </div></Card>
        </> : <Card><h2 className="ov-h" style={{ fontSize: 15, marginBottom: 12 }}>Activity</h2><ActivityComposer id={l.id} /><ol className="ld-act" style={{ marginTop: 16 }}>{(acts ?? []).map(a => { const [I, t] = ACT_ICON[a.kind] ?? [PenLine, "blue"]; return <li key={a.id}><span className={`k-tile sm ${t}`}><I size={13} /></span><div className="k-grow"><b className="k-small k-strong">{a.title}</b>{a.detail && <p className="k-small">{a.detail}</p>}<div className="k-xs k-muted">{a.actor_name} · {relative(a.created_at)}</div></div></li>; })}</ol></Card>}
      </div>
      <div className="k-col" style={{ gap: 14 }}>
        <section className="k-agent"><div className="k-agent-head"><Sparkles size={18} className="k-spark" /><h3>Next best action</h3></div><p>{l.next_action ? `${l.next_action} with ${l.contact_name || l.client_name}${l.next_action_at ? ` (${dateShort(l.next_action_at)})` : ""}.` : `Qualify ${l.client_name}'s budget and date flexibility.`} Then shortlist venues that fit {l.guests || "the expected attendance"}.</p>
          <Link className="k-btn primary block" style={{ marginTop: 10 }} href={`/organizer/agent?goal=${encodeURIComponent(`Draft a follow-up message to ${l.contact_name || l.client_name} about ${l.name}`)}`}><PenLine size={14} />Generate follow-up message</Link>
          <Link className="k-btn ghost block" style={{ marginTop: 8, color: "var(--k-blue)" }} href="/organizer/marketplace?tab=venues"><Search size={14} />Find suitable venues</Link>
          <Link className="k-btn ghost block" style={{ marginTop: 8, color: "var(--k-blue)" }} href={proposalHref}><FileText size={14} />Create proposal draft</Link></section>
        <section className="k-agent"><div className="k-agent-head"><Sparkles size={18} className="k-spark" /><h3>Gala Agent</h3><Beta /></div><p>I can help you with this lead:</p><ul className="pl-agent-list" style={{ marginTop: 6 }}>{["Summarise the enquiry", "Suggest qualification questions", "Find and compare suitable venues", "Recommend suppliers and estimates", "Draft a proposal", "Plan follow-up tasks"].map(x => <li key={x}><CheckCircle2 size={15} className="k-green" />{x}</li>)}</ul><AgentAsk scope="organizer" placeholder="Ask about this lead..." /></section>
        <Card><div className="k-between" style={{ marginBottom: 8 }}><h3 className="ov-h">Recent activity</h3><Link className="k-link" href={`/organizer/sales/leads/${l.id}?tab=activity`}>View all <ArrowRight size={12} /></Link></div>
          <ol className="ld-act">{(acts ?? []).slice(0, 5).map(a => { const [I, t] = ACT_ICON[a.kind] ?? [PenLine, "blue"]; return <li key={a.id}><span className={`k-tile sm ${t}`}><I size={13} /></span><div className="k-grow"><b className="k-xs k-strong">{a.title}</b>{a.detail && <div className="k-xs k-muted k-ellipsis">{a.detail}</div>}<div className="k-xs k-muted">{dateShort(a.created_at)}, {time(a.created_at)}</div></div><Avatar src={avatar(a.actor_name)} name={a.actor_name} size="sm" /></li>; })}</ol></Card>
      </div>
    </div>
  </>;
}
export const _icons = { MoreHorizontal, ExternalLink, Users, Pencil, Navigation };
