import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock4, CalendarDays, PartyPopper, MapPin, Users, ExternalLink, Coins, ShieldCheck, FileText, ClipboardCheck, Sparkles, ArrowRight, CalendarRange, CircleCheck, CircleAlert, CircleX, NotebookPen, MessageSquare, History } from "lucide-react";
import "@/styles/provider-opp.css";
import { Chip, Avatar, Thumb, Tabs, Empty } from "@/components/workspace/kit";
import { ActionForm } from "@/components/workspace/actions";
import { money, day, time, countdown, relative, titleCase, requestTime } from "@/lib/workspace/format";
import { getProvider } from "@/lib/provider/context";
import { rows } from "@/lib/workspace/db";
import { workspaceItems, workspaceJobs, workspaceListings, workspaceSpaces, itemState, isEmergency, isQuoteRequested, OPEN } from "@/lib/provider/queries";
import { workspaceBlocks, workspaceQuotes } from "@/lib/provider/commercial";
import { compatibility } from "@/lib/provider/fit";
import { addInternalNote } from "./actions";
import { QuickResponse, HeaderActions } from "./interactive";
import { LifecyclePanel } from "@/components/marketplace/lifecycle-panel";

export const metadata: Metadata = { title: "Opportunity" };
const verdict: Record<string, Record<string, string>> = {
  calendar: { ok: "Available", warn: "Date to confirm", fail: "Conflict" }, space: { ok: "Available", warn: "Check space", fail: "Unavailable" },
  capacity: { ok: "Good fit", warn: "Check numbers", fail: "Over capacity" }, budget: { ok: "Within budget", warn: "Tight budget", fail: "Below budget" },
  lead_time: { ok: "Suitable", warn: "Short notice", fail: "Too soon" }, commitments: { ok: "Clear", warn: "Check", fail: "Conflict" },
};
const steps = ["New", "In Progress", "Quoted", "Hold", "Booked"] as const;
const stepOf = (s: string) => ({ sent: 0, awaiting: 0, clarification: 1, available: 1, standby: 1, quoted: 2, held: 3, confirmed: 4, fulfilled: 4 } as Record<string, number>)[s] ?? 0;

export default async function OpportunityPage(props: PageProps<"/provider/opportunities/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const tab = (["overview", "response", "activity"].includes(String(sp.tab)) ? sp.tab : "overview") as "overview" | "response" | "activity";
  const [ctx, items, jobs, listings, spaces, blocks, quotes] = await Promise.all([getProvider(), workspaceItems(), workspaceJobs(), workspaceListings(), workspaceSpaces(), workspaceBlocks(), workspaceQuotes()]);
  const item = items.find(i => i.id === id);
  if (!item) notFound();
  const now = requestTime();
  const e = item.event, r = item.request, req = (r?.requirements ?? {}) as Record<string, unknown>;
  const listing = listings.find(l => l.id === item.listing_id);
  const fit = compatibility(item, { listing, spaces, jobs, blocks, now });
  const state = itemState(item, now), expired = state === "expired", open = OPEN.includes(item.status);
  const cd = countdown(item.response_deadline, now);
  const myQuotes = quotes.filter(q => q.build_item_id === item.id);
  const [saved, notes, audit, thread] = await Promise.all([
    rows<{ item_key: string }>(ctx.db.from("saved_items").select("item_key").eq("user_id", ctx.userId).eq("item_key", `opportunity:${id}`)),
    rows<{ id: string; detail: string; assignee_name: string; created_at: string }>(ctx.db.from("tasks").select("id,detail,assignee_name,created_at").eq("workspace_id", ctx.workspace.id).eq("category", "opportunity_note").like("detail", `%${id}%`).order("created_at", { ascending: false })),
    rows<{ id: number; event: string; metadata: Record<string, unknown>; created_at: string }>(ctx.db.from("audit_events").select("id,event,metadata,created_at").eq("workspace_id", ctx.workspace.id).contains("metadata", { build_item_id: id }).order("created_at", { ascending: false })),
    rows<{ id: string; messages: { id: string; sender_name: string; body: string; from_provider: boolean; created_at: string }[] }>(ctx.db.from("threads").select("id,messages(id,sender_name,body,from_provider,created_at)").eq("build_item_id", id)),
  ]);
  const similar = items.filter(i => i.id !== item.id && OPEN.includes(i.status) && itemState(i, now) !== "expired" && i.event?.event_type === e?.event_type).slice(0, 3);
  const statusChip = expired ? { label: "Expired / No response", tone: "grey" as const } : item.status === "held" ? { label: "Held", tone: "pink" as const }
    : item.status === "quoted" ? { label: "Quote sent", tone: "purple" as const } : isEmergency(item) ? { label: "Emergency", tone: "red" as const }
    : isQuoteRequested(item) ? { label: "Quote Requested", tone: "orange" as const } : open ? { label: "New Request", tone: "blue" as const } : { label: titleCase(item.status), tone: "green" as const };
  const gallery = [listing?.image, ...(listing?.gallery ?? [])].filter(Boolean) as string[];
  const guests = Number(req.guests ?? e?.guest_count ?? 0);
  const icon = (s: string) => s === "ok" ? CircleCheck : s === "warn" ? CircleAlert : CircleX;
  const budgetInsight = r?.budget_max && fit.score >= 70 ? `High-quality enquiry with ${fit.score}% fit. The disclosed budget is ${money(r.budget_min ?? 0)} – ${money(r.budget_max)}; a quote inside that range is likely to be competitive.`
    : fit.hard ? "This request has a hard conflict. Consider offering standby or suggesting an alternative date." : "Review the compatibility checks before responding.";

  return <div className="pq">
    <Link href="/provider/opportunities" className="ws-back pq-back"><ArrowLeft aria-hidden="true" />Back to Opportunities</Link>
    <header className="pq-head">
      <div className="pq-title"><h1>{e?.name ?? item.package}</h1>
        <div className="pq-sub"><Chip tone={statusChip.tone}>{statusChip.label}</Chip><span>Received {relative(item.created_at, now)}</span></div></div>
      {open && <div className={`pq-deadline ${expired ? "expired" : ""}`}><Clock4 aria-hidden="true" /><span><b>{expired ? "Response window closed" : `${cd.label} remaining`}</b>
        <small>{expired ? "Expired / No response" : `Respond by ${day(item.response_deadline, { weekday: "short", day: "numeric", month: "short" })}, ${time(item.response_deadline)}`}</small></span></div>}
      <div className="pq-actions"><HeaderActions itemId={id} saved={saved.length > 0} /></div>
    </header>
    <Tabs base={`/provider/opportunities/${id}`} active={tab} tabs={[{ key: "overview", label: "Overview" }, { key: "response", label: "Response" }, { key: "activity", label: "Activity" }]} />

    <div className="pq-body">
      <div className="pq-main">
        {tab === "overview" && <>
          <div className="pq-row1">
            <div className="pq-gallery">
              <Thumb src={e?.cover_image || item.image} alt={e?.name ?? ""} w={343} h={192} />
              <div className="pq-thumbs">{gallery.slice(0, 4).map((g, i) => i < 3 || gallery.length <= 4 ? <Thumb key={g + i} src={g} w={58} h={52} /> : <span key="more" className="pq-more" style={{ backgroundImage: `url(${g})` }}>+{gallery.length - 3} photos</span>)}</div>
            </div>
            <section className="ws-panel pq-details">
              <h2 className="pq-h"><CalendarRange aria-hidden="true" />Event details</h2>
              <div className="pq-details-grid">
                <dl className="pq-dl">
                  <div><dt>Date</dt><dd><CalendarDays aria-hidden="true" /><span><b>{day(e?.starts_at, { weekday: "long", day: "numeric", month: "long" })}, {e?.starts_at ? new Date(e.starts_at).getFullYear() : ""}</b><small>{time(e?.starts_at)} – {time(e?.ends_at)}</small></span></dd></div>
                  <div><dt>Event type</dt><dd><PartyPopper aria-hidden="true" /><span><b>{titleCase(e?.event_type ?? "Event")}</b><small>{r?.scope?.split(". ")[0]}</small></span></dd></div>
                  <div><dt>Location</dt><dd><MapPin aria-hidden="true" /><span><b>{e?.venue_name || e?.location}</b><small>{e?.location}</small>
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e?.location ?? "")}`} target="_blank" rel="noopener noreferrer">View on map <ArrowRight aria-hidden="true" /></a></span></dd></div>
                  <div><dt>Expected guests</dt><dd><Users aria-hidden="true" /><span><b>{guests ? `${guests} guests` : "Not given"}</b></span></dd></div>
                </dl>
                <div className="pq-side">
                  <div className="pq-map"><span className="pq-pin"><MapPin aria-hidden="true" /></span><b>{e?.venue_name || listing?.name}</b>
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e?.location ?? "")}`} target="_blank" rel="noopener noreferrer">Open in Maps <ExternalLink aria-hidden="true" /></a></div>
                  <small className="pq-label">Client / Organiser</small>
                  <div className="pq-client"><Avatar name={e?.client_name ?? "Client"} size={32} /><span><b>{e?.client_name}</b><small>{String(e?.settings?.requester_org ?? "Client")}</small></span></div>
                  <div className="pq-budget"><Coins aria-hidden="true" /><span><small>Budget {r?.budget_max ? "(disclosed)" : ""}</small><b>{r?.budget_min || r?.budget_max ? `${money(r?.budget_min ?? 0)} – ${money(r?.budget_max ?? 0)}` : "Not disclosed"}</b></span></div>
                </div>
              </div>
            </section>
          </div>
          <div className="pq-row2">
            <section className="ws-panel pq-reqs">
              <h2 className="pq-h"><FileText aria-hidden="true" />Event requirements</h2>
              <dl className="pq-req-dl">
                <div><dt>Overview</dt><dd>{e?.description || r?.scope}</dd></div>
                <div><dt>Scope</dt><dd>{r?.title}</dd></div>
                {req.setup || req.access ? <div><dt>Access & setup</dt><dd>{[req.setup && `Setup: ${req.setup}`, req.access && `Access: ${req.access}`].filter(Boolean).join(". ")}</dd></div> : null}
                <div><dt>Key requirements</dt><dd><ul>
                  {guests ? <li>{guests} guests{req.layout ? ` · ${titleCase(String(req.layout))} layout` : ""}</li> : null}
                  {req.space ? <li>Space: {String(req.space)}</li> : null}
                  {isQuoteRequested(item) ? <li>Itemised quote requested</li> : null}
                  {r?.emergency ? <li>Emergency / short-notice request</li> : null}
                  <li>Response window: {r?.response_hours ?? "—"} hours</li>
                </ul></dd></div>
                <div><dt>Attachments</dt><dd>{Array.isArray(req.attachments) && req.attachments.length ? (req.attachments as { name: string }[]).map(a => a.name).join(", ") : <span className="ws-muted">No attachments provided</span>}</dd></div>
              </dl>
            </section>
            <section className="ws-panel pq-fit">
              <h2 className="pq-h"><ClipboardCheck aria-hidden="true" />Compatibility & fit <span className={`pq-score ${fit.score >= 85 ? "good" : fit.score >= 70 ? "ok" : "low"}`}>{fit.score}%</span></h2>
              <ul className="pq-checks">{fit.checks.map(c => { const I = icon(c.state); return <li key={c.key}><span>{c.label}</span><I className={c.state} aria-hidden="true" />
                <span><b className={c.state}>{verdict[c.key][c.state]}</b><small>{c.detail}</small></span>
                {c.key === "calendar" && <Link href={`/provider/calendar?date=${(e?.starts_at ?? "").slice(0, 10)}&view=day`} className="ws-btn outline sm">View calendar</Link>}</li>; })}</ul>
              <div className="pq-insight"><Sparkles aria-hidden="true" /><div><b>Gala Agent insight</b><p>{budgetInsight}</p>
                <Link className="ws-btn outline sm" href={`/provider/agent?goal=${encodeURIComponent(`Draft a response for ${e?.name}`)}`}>Generate draft response <ArrowRight aria-hidden="true" /></Link></div></div>
            </section>
          </div>
          <section className="ws-panel pq-similar">
            <h2 className="pq-h"><Users aria-hidden="true" />Similar opportunities</h2>
            {similar.length ? <div className="pq-sim-grid">{similar.map(s => <article key={s.id}><Thumb src={s.event?.cover_image} w={62} h={62} />
              <div><b>{s.event?.name}</b><small><CalendarDays aria-hidden="true" />{day(s.event?.starts_at)}</small><small><MapPin aria-hidden="true" />{s.event?.location}</small>
                <small><Users aria-hidden="true" />{s.event?.guest_count} guests <strong>{s.request?.budget_max ? `${money(s.request.budget_min ?? 0)} – ${money(s.request.budget_max)}` : ""}</strong></small></div>
              <Link href={`/provider/opportunities/${s.id}`} className="ws-btn outline sm">View <ArrowRight aria-hidden="true" /></Link></article>)}</div>
              : <p className="ws-muted">No other open requests of this type.</p>}
          </section>
        </>}

        {tab === "response" && <section className="ws-panel pq-response">
          <h2 className="pq-h"><MessageSquare aria-hidden="true" />Respond</h2>
          <p className="ws-muted">Choose a response. Hard conflicts block options that would commit the date.</p>
          {fit.hard && <p className="pq-conflict"><CircleX aria-hidden="true" />{fit.checks.filter(c => c.state === "fail").map(c => c.detail).join(" · ")}</p>}
          <QuickResponse itemId={id} open={open} hard={fit.hard} hardReason={fit.checks.find(c => c.state === "fail")?.detail ?? ""} expired={expired} />
          {myQuotes.length > 0 && <><h3 className="pq-h3">Quote versions</h3><ul className="pq-versions">{myQuotes.map(q => <li key={q.id}><Link href={`/provider/quotes/${q.id}`}>{q.reference} v{q.version}</Link><Chip tone={q.status === "sent" ? "purple" : q.status === "superseded" ? "grey" : "blue"}>{titleCase(q.status)}</Chip><b>{money(q.total)}</b><small>{relative(q.sent_at ?? q.created_at, now)}</small></li>)}</ul></>}
        </section>}

        {tab === "activity" && <section className="ws-panel pq-activity">
          <h2 className="pq-h"><History aria-hidden="true" />Activity</h2>
          {(() => {
            const ev = [
              { at: item.created_at, text: `Request received from ${e?.client_name}`, kind: "request" },
              ...myQuotes.map(q => ({ at: q.sent_at ?? q.created_at, text: `${q.reference} v${q.version} ${q.status === "draft" ? "drafted" : "sent"} — ${money(q.total)}`, kind: "quote" })),
              ...audit.map(a => ({ at: a.created_at, text: titleCase(a.event.replace(".", " ")) + (a.metadata.response ? `: ${titleCase(String(a.metadata.response))}` : ""), kind: "audit" })),
              ...thread.flatMap(t => t.messages).map(m => ({ at: m.created_at, text: `${m.sender_name}: “${m.body}”`, kind: "message" })),
              ...(expired ? [{ at: item.response_deadline!, text: "Response deadline passed — marked Expired / No response", kind: "expired" }] : []),
            ].sort((a, b) => b.at.localeCompare(a.at));
            return ev.length ? <ol className="pq-timeline">{ev.map((x, i) => <li key={i} className={x.kind}><time>{day(x.at, { day: "numeric", month: "short" })} · {time(x.at)}</time><span>{x.text}</span></li>)}</ol> : <Empty title="No activity yet" />;
          })()}
        </section>}
      </div>

      <aside className="pq-rail">
        {open && <section className="ws-panel pq-card"><h2 className="pq-h"><Clock4 aria-hidden="true" className="red" />Response deadline</h2>
          <p className={`pq-due ${expired ? "expired" : ""}`}><Clock4 aria-hidden="true" /><span><b>{expired ? "Expired" : `${day(item.response_deadline, { weekday: "short" })}, ${time(item.response_deadline)}`}</b><small>{expired ? "No response was sent in time" : `${cd.label} remaining`}</small></span></p></section>}
        <section className="ws-panel pq-card"><h2 className="pq-h"><CalendarRange aria-hidden="true" />Request status</h2>
          <p className="pq-status"><FileText aria-hidden="true" /><span><b>{statusChip.label}</b><small>{open ? "No response yet" : `Updated ${relative(item.updated_at, now)}`}</small></span></p>
          <ol className="pq-steps">{steps.map((s, i) => <li key={s} className={!expired && i <= stepOf(item.status) ? "on" : ""}><i /><span>{s}</span></li>)}</ol></section>
        <LifecyclePanel itemId={item.id} viewer="provider" />
        {tab !== "response" && <section className="ws-panel pq-card"><h2 className="pq-h"><ShieldCheck aria-hidden="true" />Quick response</h2>
          <QuickResponse itemId={id} open={open} hard={fit.hard} hardReason={fit.checks.find(c => c.state === "fail")?.detail ?? ""} expired={expired} /></section>}
        <section className="ws-panel pq-card"><h2 className="pq-h"><NotebookPen aria-hidden="true" />Internal notes</h2>
          {notes.length > 0 && <ul className="pq-notes">{notes.map(n => { let body = n.detail; try { body = JSON.parse(n.detail).body; } catch {} return <li key={n.id}><b>{n.assignee_name}</b><p>{body}</p><small>{relative(n.created_at, now)}</small></li>; })}</ul>}
          <ActionForm action={addInternalNote.bind(null, id)} className="pq-note-form" resetOnSuccess>
            <Avatar src={ctx.userAvatar} name={ctx.userName} size={30} />
            <label className="sr-only" htmlFor="pq-note">Private note</label>
            <textarea id="pq-note" name="note" rows={3} placeholder="Add a private note..." />
            <button className="ws-btn primary sm">Save note</button>
          </ActionForm></section>
      </aside>
    </div>
  </div>;
}
