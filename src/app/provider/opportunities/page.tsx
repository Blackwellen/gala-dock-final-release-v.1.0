import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Mail, FileText, LockKeyhole, TriangleAlert, Trophy, CalendarDays, MapPin, Clock4, Users, Box, ArrowRight, SlidersHorizontal, List, Map as MapIcon, Siren, CalendarRange, ChevronDown, CircleCheck } from "lucide-react";
import "@/styles/provider-opps.css";
import { Kpi, Tabs, Chip, Avatar, Thumb, Ring, Empty, type Tone } from "@/components/workspace/kit";
import { money, countdown, day, delta, requestTime } from "@/lib/workspace/format";
import { getProvider } from "@/lib/provider/context";
import { workspaceBlocks, workspaceQuotes } from "@/lib/provider/commercial";
import { workspaceItems, workspaceJobs, workspaceListings, workspaceSpaces, itemState, isEmergency, isQuoteRequested, dailySeries, OPEN, type Item } from "@/lib/provider/queries";
import { compatibility } from "@/lib/provider/fit";
import { RowMenu } from "../_components/row-menu";
import { ParamSelect } from "../_components/param-select";
import { SearchParam } from "../_components/search-param";
import { respondToRequest, releaseHold } from "./actions";

export const metadata: Metadata = { title: "Opportunities" };
type Tab = "requests" | "quotes" | "holds" | "emergency";
const PAGE = 8;

function status(i: Item, now: number): { label: string; tone: Tone } {
  const s = itemState(i, now);
  if (s === "expired") return { label: "Expired / No response", tone: "grey" };
  if (s === "held") return { label: "Held", tone: "pink" };
  if (s === "quoted") return { label: `Quote Sent${i.quote?.version ? ` v${i.quote.version}` : ""}`, tone: "purple" };
  if (s === "clarification") return { label: "Clarification", tone: "amber" };
  if (s === "available") return { label: "Available", tone: "green" };
  if (isEmergency(i)) return { label: i.role === "primary" ? "Emergency" : "Standby", tone: i.role === "primary" ? "red" : "blue" };
  if (isQuoteRequested(i)) return { label: "Quote Requested", tone: "orange" };
  return { label: "New Request", tone: "blue" };
}

export default async function OpportunitiesPage(props: PageProps<"/provider/opportunities">) {
  const sp = await props.searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? sp[k] as string : "");
  const tab = (["requests", "quotes", "holds", "emergency"].includes(str("tab")) ? str("tab") : "requests") as Tab;
  const [ctx, items, jobs, listings, spaces, blocks, quotes] = await Promise.all([getProvider(), workspaceItems(), workspaceJobs(), workspaceListings(), workspaceSpaces(), workspaceBlocks(), workspaceQuotes()]);
  const now = requestTime();
  const live = (i: Item) => itemState(i, now) !== "expired";

  const groups: Record<Tab, Item[]> = {
    requests: items.filter(i => OPEN.includes(i.status) && !isEmergency(i)),
    quotes: items.filter(i => i.status === "quoted"),
    holds: items.filter(i => i.status === "held"),
    emergency: items.filter(i => isEmergency(i) && (OPEN.includes(i.status) || ["available", "standby"].includes(i.status))),
  };

  // KPIs: current state counts, with 30-day vs previous-30-day deltas on creation/activity
  const win = (t: string | null | undefined, a: number, b: number) => !!t && new Date(t).getTime() >= a && new Date(t).getTime() < b;
  const d30 = now - 30 * 864e5, d60 = now - 60 * 864e5;
  const sentQuotes = quotes.filter(q => q.sent_at);
  const won = jobs.filter(j => j.build_item_id && j.status !== "cancelled");
  const kpi = {
    requests: groups.requests.filter(live).length, requestsDelta: delta(items.filter(i => win(i.created_at, d30, now)).length, items.filter(i => win(i.created_at, d60, d30)).length),
    quotes: sentQuotes.filter(q => win(q.sent_at, d30, now)).length, quotesDelta: delta(sentQuotes.filter(q => win(q.sent_at, d30, now)).length, sentQuotes.filter(q => win(q.sent_at, d60, d30)).length),
    holds: groups.holds.length, emergency: groups.emergency.filter(live).length,
    won: won.filter(j => win(j.created_at, d30, now)).length, wonDelta: delta(won.filter(j => win(j.created_at, d30, now)).length, won.filter(j => win(j.created_at, d60, d30)).length),
  };

  // Filters
  const q = str("q").toLowerCase(), type = str("type"), loc = str("location"), when = str("date"), value = str("value"), sort = str("sort") || "deadline";
  const types = [...new Set(items.map(i => i.event?.event_type).filter(Boolean))] as string[];
  const locations = [...new Set(items.map(i => i.event?.city || i.event?.location).filter(Boolean))] as string[];
  const valueBands: Record<string, [number, number]> = { lt2k: [0, 2000], "2to5k": [2000, 5000], "5to10k": [5000, 10000], gt10k: [10000, Infinity] };
  let list = groups[tab].filter(i => {
    const e = i.event;
    if (q && ![e?.name, e?.client_name, e?.location, i.request?.scope, i.package].some(v => v?.toLowerCase().includes(q))) return false;
    if (type && e?.event_type !== type) return false;
    if (loc && (e?.city || e?.location) !== loc) return false;
    if (when && e?.starts_at) { const days = (new Date(e.starts_at).getTime() - now) / 864e5; if (days > Number(when)) return false; }
    if (value) { const v = i.amount ?? i.request?.budget_max ?? 0; const [lo, hi] = valueBands[value] ?? [0, Infinity]; if (v < lo || v >= hi) return false; }
    return true;
  });
  const fitOf = new Map(list.map(i => [i.id, compatibility(i, { listing: listings.find(l => l.id === i.listing_id), spaces, jobs, blocks, now })]));
  const deadline = (i: Item) => new Date((tab === "holds" ? i.hold_expires_at : i.response_deadline) ?? 8.64e15).getTime();
  list = list.sort((a, b) => sort === "value" ? (b.amount ?? b.request?.budget_max ?? 0) - (a.amount ?? a.request?.budget_max ?? 0)
    : sort === "date" ? new Date(a.event?.starts_at ?? 0).getTime() - new Date(b.event?.starts_at ?? 0).getTime()
    : sort === "fit" ? fitOf.get(b.id)!.score - fitOf.get(a.id)!.score
    : (live(a) ? 0 : 1) - (live(b) ? 0 : 1) || deadline(a) - deadline(b));
  const page = Math.max(1, Number(str("page")) || 1), pages = Math.max(1, Math.ceil(list.length / PAGE));
  const shown = list.slice((page - 1) * PAGE, page * PAGE);
  const view = str("view") === "map" ? "map" : "list";
  const autoResponse = Boolean((ctx.workspace.settings as Record<string, Record<string, unknown>>)?.booking_rules?.auto_response ?? false);
  const qs = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    for (const [k, v] of Object.entries(patch)) { if (v === null) n.delete(k); else n.set(k, v); }
    return `/provider/opportunities${n.toString() ? `?${n}` : ""}`;
  };

  return <div className="po">
    <header className="ws-page-head po-head">
      <div><h1>Opportunities</h1><p>Manage requests, quotes and commercial opportunities in one place.</p></div>
      <div className="ws-page-actions">
        <Link href="/provider/settings?tab=booking-rules" className={`po-auto ${autoResponse ? "on" : ""}`}><i />Auto-response: {autoResponse ? "On" : "Off"}</Link>
        <Link href="/provider/calendar?action=block" className="ws-btn outline po-manage"><CalendarDays aria-hidden="true" />Manage availability<ChevronDown aria-hidden="true" /></Link>
      </div>
    </header>

    <section className="ws-kpis po-kpis" aria-label="Opportunity figures">
      <Kpi icon={Mail} tone="blue" label="New Requests" value={kpi.requests} delta={kpi.requestsDelta} deltaSuffix="" series={dailySeries(items, i => i.created_at, () => 1, 14, now)} href={qs({ tab: null, page: null })} />
      <Kpi icon={FileText} tone="blue" label="Quotes Sent" value={kpi.quotes} delta={kpi.quotesDelta} deltaSuffix="" series={dailySeries(sentQuotes, x => x.sent_at, () => 1, 14, now)} href={qs({ tab: "quotes", page: null })} />
      <Kpi icon={LockKeyhole} tone="pink" label="Conditional Holds" value={kpi.holds} series={dailySeries(groups.holds, i => i.hold_expires_at, () => 1, 14, now + 7 * 864e5)} href={qs({ tab: "holds", page: null })} />
      <Kpi icon={TriangleAlert} tone="red" label="Emergency Requests" value={kpi.emergency} series={dailySeries(groups.emergency, i => i.created_at, () => 1, 14, now)} href={qs({ tab: "emergency", page: null })} />
      <Kpi icon={Trophy} tone="green" label="Won (Last 30 days)" value={kpi.won} delta={kpi.wonDelta} deltaSuffix="" series={dailySeries(won, j => j.created_at, () => 1, 14, now)} href="/provider/bookings" />
    </section>

    <section className="ws-table-wrap po-table">
      <Tabs base="/provider/opportunities" active={tab} tabs={[
        { key: "requests", label: "Requests", count: groups.requests.filter(live).length }, { key: "quotes", label: "Quotes", count: groups.quotes.length },
        { key: "holds", label: "Holds", count: groups.holds.length }, { key: "emergency", label: "Emergency", count: groups.emergency.filter(live).length },
      ]} />
      <div className="ws-toolbar po-toolbar">
        <Suspense><SearchParam placeholder="Search opportunities..." /></Suspense>
        <Suspense>
          <span className="po-sel"><CalendarRange aria-hidden="true" /><ParamSelect param="type" label="Event type" value={type} resetParams={["page"]} options={[{ value: "", label: "Any type" }, ...types.map(t => ({ value: t, label: t.replaceAll("_", " ").replace(/^\w/, c => c.toUpperCase()) }))]} /></span>
          <span className="po-sel"><MapPin aria-hidden="true" /><ParamSelect param="location" label="Location" value={loc} resetParams={["page"]} options={[{ value: "", label: "Any location" }, ...locations.map(l => ({ value: l, label: l }))]} /></span>
          <span className="po-sel"><CalendarDays aria-hidden="true" /><ParamSelect param="date" label="Event date" value={when} resetParams={["page"]} options={[{ value: "", label: "Any date" }, { value: "7", label: "Next 7 days" }, { value: "30", label: "Next 30 days" }, { value: "90", label: "Next 90 days" }]} /></span>
          <span className="po-sel"><CalendarDays aria-hidden="true" /><ParamSelect param="value" label="Value" value={value} resetParams={["page"]} options={[{ value: "", label: "Any value" }, { value: "lt2k", label: "Under £2,000" }, { value: "2to5k", label: "£2,000 – £5,000" }, { value: "5to10k", label: "£5,000 – £10,000" }, { value: "gt10k", label: "£10,000+" }]} /></span>
        </Suspense>
        {tab === "emergency" && <Link href="/provider/emergency" className="ws-btn outline po-more"><TriangleAlert aria-hidden="true" />Emergency Supply settings</Link>}
        <Link href={qs({ type: null, location: null, date: null, value: null, q: null, page: null })} className="ws-btn outline po-more"><SlidersHorizontal aria-hidden="true" />{type || loc || when || value || q ? "Clear filters" : "More filters"}</Link>
        <span className="ws-spacer" />
        <label className="po-sort">Sort by <Suspense><ParamSelect param="sort" label="Sort by" value={sort} options={[{ value: "deadline", label: "Response deadline" }, { value: "value", label: "Highest value" }, { value: "date", label: "Event date" }, { value: "fit", label: "Best fit" }]} /></Suspense></label>
        <nav className="po-views" aria-label="View">
          <Link href={qs({ view: null })} aria-current={view === "list" ? "page" : undefined} aria-label="List view"><List aria-hidden="true" /></Link>
          <Link href={qs({ view: "map" })} aria-current={view === "map" ? "page" : undefined} aria-label="Map view"><MapIcon aria-hidden="true" /></Link>
        </nav>
      </div>

      {view === "map" ? <LocationView items={list} /> : shown.length ? <div className="ws-table-scroll"><table className="ws-table po-grid">
        <colgroup><col style={{ width: 232 }} /><col style={{ width: 138 }} /><col style={{ width: 142 }} /><col style={{ width: 124 }} /><col style={{ width: 122 }} /><col style={{ width: 122 }} /><col style={{ width: 126 }} /><col style={{ width: 54 }} /><col style={{ width: 112 }} /><col style={{ width: 48 }} /></colgroup>
        <thead><tr><th>Event / Date</th><th>Listing / Capability</th><th>Scope</th><th>Value / Range</th><th>{tab === "holds" ? "Hold expires" : "Response deadline"}</th><th>Status</th><th>Requester</th><th>Fit</th><th colSpan={2}>Actions</th></tr></thead>
        <tbody>{shown.map(i => {
          const e = i.event, r = i.request, st = status(i, now), fit = fitOf.get(i.id)!;
          const listing = listings.find(l => l.id === i.listing_id);
          const space = fit.space;
          const due = tab === "holds" ? i.hold_expires_at : i.response_deadline;
          const cd = countdown(due, now), expired = itemState(i, now) === "expired";
          const quote = quotes.find(x => x.build_item_id === i.id && x.status !== "superseded");
          const cta = expired ? { label: "View", href: `/provider/opportunities/${i.id}` }
            : i.status === "quoted" && quote ? { label: "View Quote", href: `/provider/quotes/${quote.id}` }
            : i.status === "held" ? { label: "Review", href: `/provider/opportunities/${i.id}` }
            : isQuoteRequested(i) ? { label: "Send Quote", href: `/provider/opportunities/${i.id}/quote?step=1` }
            : { label: "Respond", href: `/provider/opportunities/${i.id}?tab=response` };
          return <tr key={i.id} className={expired ? "expired" : ""}>
            <td><div className="ws-cell"><Thumb src={e?.cover_image || i.image} w={50} h={50} /><div className="ws-cell-text">
              <Link href={`/provider/opportunities/${i.id}`}><b>{e?.name ?? i.package}</b></Link>
              <small className="po-ic"><CalendarDays aria-hidden="true" />{day(e?.starts_at)}</small>
              <small className="po-ic"><MapPin aria-hidden="true" />{e?.location || e?.city}</small></div></div></td>
            <td><div className="ws-cell-text"><b>{space?.name ?? listing?.name}</b><small>{listing?.kind === "venue" ? "Venue Space" : listing?.category || "Service"}</small>
              {space && <small className="po-meta"><span><Users aria-hidden="true" />{Number(r?.requirements?.guests ?? e?.guest_count ?? 0)}</span><span><Box aria-hidden="true" />{space.indoor ? "Indoor" : "Outdoor"}</span></small>}</div></td>
            <td><div className="ws-cell-text"><b className="po-scope">{(r?.scope ?? i.scope).split(". ")[0]}</b><small>{(r?.scope ?? "").split(". ")[1]?.replace(/\.$/, "")}</small></div></td>
            <td className="ws-num"><b className="po-value">{i.amount ? money(i.amount) : r?.budget_min || r?.budget_max ? `${money(r?.budget_min ?? 0)} – ${money(r?.budget_max ?? 0)}` : "Undisclosed"}</b></td>
            <td><div className={`po-due ${expired ? "expired" : cd.urgent || isEmergency(i) ? "urgent" : (new Date(due ?? 0).getTime() - now) < 864e5 ? "soon" : ""}`}>
              {isEmergency(i) && !expired ? <TriangleAlert aria-hidden="true" /> : <Clock4 aria-hidden="true" />}
              <span><b>{expired ? "Expired" : isEmergency(i) && cd.urgent ? "Urgent" : cd.label}</b><small>{expired ? "No response" : isEmergency(i) && cd.urgent ? cd.label : shortDue(due, now)}</small></span></div></td>
            <td><Chip tone={st.tone}>{st.label}</Chip></td>
            <td><div className="ws-cell"><Avatar name={e?.client_name || "Client"} size={32} /><div className="ws-cell-text"><b>{e?.client_name}</b><small>{String(e?.settings?.requester_org ?? "")}</small></div></div></td>
            <td><Ring value={fit.score} size={38} />{fit.hard && <span className="sr-only">Hard conflict</span>}</td>
            <td><Link className={`ws-btn ${expired ? "outline" : "primary"} po-cta`} href={cta.href}>{cta.label}{cta.label === "Respond" && <ArrowRight aria-hidden="true" />}</Link></td>
            <td><RowMenu label={`Quick actions for ${e?.name}`} entries={[
              { kind: "link", label: "Open opportunity", href: `/provider/opportunities/${i.id}` },
              ...(OPEN.includes(i.status) && !expired ? [
                { kind: "link" as const, label: "Send quote", href: `/provider/opportunities/${i.id}/quote?step=1` },
                { kind: "action" as const, label: "Request clarification", run: respondToRequest.bind(null, i.id, "clarification", "") },
                { kind: "action" as const, label: "Mark unavailable", danger: true, confirm: "Tell the requester you’re unavailable?", run: respondToRequest.bind(null, i.id, "unavailable", "") },
                { kind: "action" as const, label: "Decline", danger: true, confirm: "Decline this request?", run: respondToRequest.bind(null, i.id, "declined", "") }] : []),
              ...(i.status === "held" ? [{ kind: "action" as const, label: "Release hold", danger: true, confirm: "Release this hold? The date becomes available to others.", run: releaseHold.bind(null, i.id) }] : []),
            ]} /></td>
          </tr>;
        })}</tbody></table></div>
        : <Empty icon={CircleCheck} title={`No ${tab === "requests" ? "open requests" : tab} right now`} text={q || type || loc || when || value ? "Try clearing the filters." : "New requests appear here with their response deadline."} />}
      {view === "list" && list.length > PAGE && <div className="ws-pager"><span>Showing {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, list.length)} of {list.length}</span>
        <nav aria-label="Pages">{Array.from({ length: pages }, (_, n) => n + 1).map(n => n === page ? <span key={n} className="cur" aria-current="page">{n}</span> : <Link key={n} href={qs({ page: String(n) })}>{n}</Link>)}</nav></div>}
    </section>

    <section className="po-promos">
      <div className="po-promo"><span className="po-promo-icon blue"><CalendarDays aria-hidden="true" /></span>
        <div><h2>Bulk availability response</h2><p>Have multiple similar requests? Use Gala Agent to prepare responses based on your availability and packages.</p></div>
        <Link className="ws-btn outline sm" href={`/provider/agent?goal=${encodeURIComponent(`Prepare responses for my ${kpi.requests} open requests based on availability and packages`)}`}>Review with Gala Agent <ArrowRight aria-hidden="true" /></Link></div>
      <div className="po-promo"><span className="po-promo-icon red"><Siren aria-hidden="true" /></span>
        <div><h2>Emergency availability</h2><p>{listings.some(l => l.emergency_supply) ? "You have emergency categories enabled. Manage your last-minute availability and response settings." : "Emergency supply is off. Turn it on to receive short-notice requests."}</p></div>
        <Link className="ws-btn outline sm" href="/provider/calendar?action=emergency">Manage emergency availability <ArrowRight aria-hidden="true" /></Link></div>
    </section>
  </div>;
}

/** Deadline label as in the design: "Today, 11:00", "Fri, 09:00" within a week, else "12 Oct, 09:00" (London, 24h). */
function shortDue(iso: string | null | undefined, now: number) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }).format(t);
  if (sameDay(iso, now)) return `Today, ${hm}`;
  const label = t - now < 6 * 864e5 ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" }).format(t) : day(iso, { day: "numeric", month: "short" });
  return `${label}, ${hm}`;
}
function sameDay(iso: string | null | undefined, now: number) {
  if (!iso) return false;
  const f = (t: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "short" }).format(new Date(t));
  return f(new Date(iso).getTime()) === f(now);
}

function LocationView({ items }: { items: Item[] }) {
  const byPlace = new Map<string, Item[]>();
  for (const i of items) { const k = i.event?.location || i.event?.city || "Location not given"; byPlace.set(k, [...(byPlace.get(k) ?? []), i]); }
  return <div className="po-places">{[...byPlace].map(([place, list]) => <section key={place}>
    <h3><MapPin aria-hidden="true" />{place}<span>{list.length}</span></h3>
    <ul>{list.map(i => <li key={i.id}><Link href={`/provider/opportunities/${i.id}`}>{i.event?.name}</Link><small>{day(i.event?.starts_at)}</small></li>)}</ul>
  </section>)}</div>;
}
