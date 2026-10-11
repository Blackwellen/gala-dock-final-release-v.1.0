import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock4, MapPin, CircleCheck, CalendarRange, User, Mail, ExternalLink, Wallet, ShieldCheck, FileText, Users, Coins,
  CircleAlert, ListChecks, Sparkles, ClipboardList, MessageSquare, CircleDot, Truck, Wrench, Paperclip, History } from "lucide-react";
import "@/styles/provider-booking.css";
import { Chip, Avatar, Thumb, Tabs, IconTile, Empty } from "@/components/workspace/kit";
import { ActionForm, ActionButton } from "@/components/workspace/actions";
import { money, day, relative, titleCase, requestTime } from "@/lib/workspace/format";
import { getProvider } from "@/lib/provider/context";
import { rows, one, isUuid } from "@/lib/workspace/db";
import { workspaceJobs, workspaceListings, workspaceSpaces, workspaceCrew } from "@/lib/provider/queries";
import { transitionBooking, assignCrew } from "../actions";
import { BookingHeaderActions, QuickActions, FileUpload } from "./interactive";

export const metadata: Metadata = { title: "Booking" };
const hm = (iso?: string | null) => iso ? new Intl.DateTimeFormat("en-US", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "";
type Beo = { arrival?: string; setup?: string; breakdown?: string; fnb?: string; bar?: string; access?: string; compliance?: string[]; parking?: string; special?: string };
type Service = { deliverables?: string[]; equipment?: string[]; milestones?: { label: string; done: boolean }[] };

export default async function BookingProfile(props: PageProps<"/provider/bookings/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const sp = await props.searchParams;
  const tab = (["overview", "delivery", "team", "commercial", "files"].includes(String(sp.tab)) ? sp.tab : "overview") as "overview" | "delivery" | "team" | "commercial" | "files";
  const [ctx, jobs, listings, spaces, crew] = await Promise.all([getProvider(), workspaceJobs(), workspaceListings(), workspaceSpaces(), workspaceCrew()]);
  const j = jobs.find(x => x.id === id);
  if (!j) notFound();
  const now = requestTime();
  const space = spaces.find(s => s.id === j.space_id), listing = listings.find(l => l.id === j.listing_id);
  const [shifts, thread, pkg, audit, tasks, files] = await Promise.all([
    rows<{ id: string; crew_id: string; role: string; status: string; starts_at: string; ends_at: string }>(ctx.db.from("shifts").select("id,crew_id,role,status,starts_at,ends_at").eq("job_id", j.id).order("starts_at")),
    j.build_item_id ? one<{ id: string; messages: { id: string; sender_name: string; body: string; from_provider: boolean; created_at: string }[] }>(ctx.db.from("threads").select("id,messages(id,sender_name,body,from_provider,created_at)").eq("build_item_id", j.build_item_id).limit(1).maybeSingle()) : null,
    j.package_id ? one<{ name: string }>(ctx.db.from("packages").select("name").eq("id", j.package_id).maybeSingle()) : null,
    rows<{ id: number; event: string; metadata: Record<string, unknown>; created_at: string }>(ctx.db.from("audit_events").select("id,event,metadata,created_at").eq("workspace_id", ctx.workspace.id).contains("metadata", { job_id: j.id }).order("created_at", { ascending: false })),
    rows<{ id: string; title: string; category: string; status: string; priority: string; created_at: string }>(ctx.db.from("tasks").select("id,title,category,status,priority,created_at").eq("workspace_id", ctx.workspace.id).like("detail", `%${j.id}%`).order("created_at", { ascending: false })),
    rows<{ id: string; title: string; url: string; kind: string; created_at: string }>(ctx.db.from("media_assets").select("id,title,url,kind,created_at").eq("workspace_id", ctx.workspace.id).contains("data", { job_id: j.id }).order("created_at", { ascending: false })),
  ]);
  const team = shifts.map(s => ({ ...s, crew: crew.find(c => c.id === s.crew_id) }));
  const beo = (j.details?.beo ?? {}) as Beo, svc = j.details as Service;
  const snap = j.commercial_snapshot as { value?: number; commission_bps?: number; platform_fee?: number; deposit_pct?: number; cancellation?: { window: string; refund: number }[]; captured_at?: string };
  const depositAmt = Math.round(j.value * (snap.deposit_pct ?? 30)) / 100;
  const balance = Math.max(0, j.value - j.paid_amount);
  const balanceDue = new Date(new Date(j.starts_at).getTime() - 14 * 864e5).toISOString();
  const numbersDue = new Date(new Date(j.starts_at).getTime() - 7 * 864e5).toISOString();
  const status: { label: string; tone: "green" | "blue" | "amber" | "red" | "grey" } = j.status === "confirmed" ? { label: "Confirmed", tone: "green" } : j.status === "active" ? { label: "Active", tone: "blue" } : j.status === "held" ? { label: "Held", tone: "amber" } : j.status === "cancelled" ? { label: "Cancelled", tone: "red" } : { label: titleCase(j.status), tone: "grey" };
  const mins = (h: string | undefined, fallback: number) => { const m = /(\d+)\s*(hour|minute)/.exec(h ?? ""); return m ? Number(m[1]) * (m[2] === "hour" ? 60 : 1) : fallback; };
  const start = new Date(j.starts_at).getTime(), end = new Date(j.ends_at).getTime();
  const timeline = [
    { at: start - mins(beo.setup, 120) * 6e4, title: j.mode === "venue" ? "Supplier access" : "Arrive on site", sub: "& setup" },
    { at: start - 30 * 6e4, title: j.mode === "venue" ? "Venue ready" : "Ready to start", sub: "& final checks" },
    { at: start, title: "Guest arrival", sub: j.event_name },
    ...(end - start > 4 * 36e5 ? [{ at: start + (end - start) / 2, title: "Main programme", sub: space?.name ?? "" }] : []),
    { at: end, title: "Event ends", sub: "" },
    { at: end + mins(beo.breakdown, 60) * 6e4, title: "Breakdown", sub: "complete" },
  ];
  const messages = (thread?.messages ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-3);
  const next: { to: string; label: string } | null = j.status === "held" ? { to: "confirmed", label: "Confirm booking" } : j.status === "confirmed" ? { to: "active", label: "Mark as arrived" } : j.status === "active" ? { to: "completed", label: "Mark as complete" } : null;
  const fee = snap.platform_fee ?? j.platform_fee;

  return <div className="pk">
    <Link href="/provider/bookings" className="ws-back pk-back"><ArrowLeft aria-hidden="true" />Back to Bookings</Link>
    <header className="pk-head">
      <div><div className="pk-title"><h1>{j.event_name}</h1><Chip tone={status.tone} dot>{status.label}</Chip><span className="pk-ref">#{j.reference}</span></div>
        <p className="pk-meta"><span><Clock4 aria-hidden="true" />{day(j.starts_at)}</span><span><CalendarDays aria-hidden="true" />{hm(j.starts_at)} – {hm(j.ends_at)}</span><span><MapPin aria-hidden="true" />{space ? `${ctx.workspace.name}, ${space.name}` : j.location}</span></p></div>
      <BookingHeaderActions jobId={j.id} threadId={thread?.id ?? null} next={next} />
    </header>
    <Tabs base={`/provider/bookings/${j.id}`} active={tab} tabs={[{ key: "overview", label: "Overview" }, { key: "delivery", label: "Delivery / Operations" }, { key: "team", label: "Team & Schedule" }, { key: "commercial", label: "Commercial" }, { key: "files", label: "Files & Activity" }]} />

    <div className="pk-body">
      <div className="pk-main">
        {tab === "overview" && <>
          <div className="pk-row1">
            <div className="pk-photo"><Thumb src={j.image || listing?.image} w={270} h={178} />{listing?.gallery?.length ? <span>+{listing.gallery.length} photos</span> : null}</div>
            <section className="ws-panel pk-card"><h2><IconTile icon={CalendarRange} tone="purple" size={30} />Event &amp; client</h2>
              <ul className="pk-lines"><li><CircleDot aria-hidden="true" /><b>{j.event_name}</b></li><li><User aria-hidden="true" />{j.client_name}{j.client_org && j.client_org !== j.client_name ? ` · ${j.client_org}` : ""}</li>
                {j.client_email && <li><Mail aria-hidden="true" /><a href={`mailto:${j.client_email}`}>{j.client_email}</a></li>}</ul>
              {thread && <Link href={`/provider/messages/${thread.id}`} className="ws-btn outline sm"><MessageSquare aria-hidden="true" />Message</Link>}</section>
            <section className="ws-panel pk-card"><h2><IconTile icon={CalendarDays} tone="purple" size={30} />Date, time &amp; location</h2>
              <ul className="pk-lines"><li><CalendarDays aria-hidden="true" /><span><b>{day(j.starts_at, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</b><small>{hm(j.starts_at)} – {hm(j.ends_at)}</small></span></li>
                <li><MapPin aria-hidden="true" /><span><b>{space ? `${ctx.workspace.name} · ${space.name}` : listing?.name}</b><small>{listing?.location ?? j.location}</small></span></li></ul>
              <a className="ws-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(listing?.location ?? j.location)}`} target="_blank" rel="noopener noreferrer">Open in maps <ExternalLink aria-hidden="true" /></a></section>
            <section className="ws-panel pk-card"><h2><IconTile icon={Wallet} tone="purple" size={30} />Booking value &amp; payment</h2>
              <p className="pk-big">{money(j.value)}</p><small>Total booking value</small><p className="pk-big sm">{money(j.net_payout)}</p><small>Net payout (after platform fee)</small>
              <Link className="ws-link" href={`/provider/bookings/${j.id}?tab=commercial`}>View breakdown <ExternalLink aria-hidden="true" /></Link></section>
          </div>
          <div className="pk-row2">
            <section className="ws-panel pk-key"><h2><IconTile icon={FileText} tone="purple" size={30} />Key details</h2><dl>
              <div><dt>Event type</dt><dd>{titleCase(j.event_type)}</dd></div><div><dt>Guests</dt><dd>{j.guests ?? "—"}</dd></div>
              {j.mode === "venue" && <div><dt>Spaces</dt><dd>{space?.name ?? "—"}{j.layout ? ` · ${j.layout}` : ""}</dd></div>}
              <div><dt>Package</dt><dd>{pkg?.name ?? "—"}</dd></div>
              {j.mode === "venue" ? <><div><dt>Food &amp; drink</dt><dd>{beo.fnb ?? "—"}{beo.bar ? ` · ${beo.bar}` : ""}</dd></div><div><dt>Access</dt><dd>{beo.access ?? "—"}</dd></div>
                <div><dt>Setup</dt><dd>{beo.setup ?? "—"}</dd></div><div><dt>Breakdown</dt><dd>{beo.breakdown ?? "—"}</dd></div>{beo.compliance?.length ? <div><dt>Compliance</dt><dd>{beo.compliance.join(" · ")}</dd></div> : null}</>
                : <><div><dt>Deliverables</dt><dd>{svc.deliverables?.join(" · ") ?? "—"}</dd></div><div><dt>Equipment</dt><dd>{svc.equipment?.join(", ") ?? "—"}</dd></div></>}
            </dl></section>
            <div className="pk-mid">
              <section className="ws-panel pk-contacts"><h2><IconTile icon={Users} tone="purple" size={30} />Primary contacts</h2>
                <div className="pk-contact"><Avatar name={j.client_name} size={36} /><span><b>{j.client_name}</b><small>{j.client_org || "Client"}</small></span>
                  {thread ? <Link className="ws-btn outline sm" href={`/provider/messages/${thread.id}`}><MessageSquare aria-hidden="true" />Message</Link> : j.client_email ? <a className="ws-btn outline sm" href={`mailto:${j.client_email}`}><Mail aria-hidden="true" />Email</a> : null}</div></section>
              <section className="ws-panel pk-dates"><h2><IconTile icon={CalendarDays} tone="orange" size={30} />Important dates &amp; deadlines</h2><ul>
                <li><CircleCheck aria-hidden="true" className={j.paid_amount >= depositAmt ? "ok" : "warn"} /><span>Deposit {j.paid_amount >= depositAmt ? "paid" : "due"}</span><b>{money(depositAmt)}</b></li>
                <li><Clock4 aria-hidden="true" className={balance === 0 ? "ok" : "warn"} /><span>Balance {balance === 0 ? "paid" : "due"}</span><b>{day(balanceDue, { day: "numeric", month: "short", year: "numeric" })}</b></li>
                <li><Clock4 aria-hidden="true" /><span>Final guest numbers</span><b>{day(numbersDue, { day: "numeric", month: "short", year: "numeric" })}</b></li>
                {j.next_action && <li><CircleAlert aria-hidden="true" className="warn" /><span>{j.next_action}</span><b>{j.next_action_due ? day(j.next_action_due, { day: "numeric", month: "short" }) : "—"}</b></li>}
              </ul></section>
            </div>
            <section className="ws-panel pk-team"><div className="ws-panel-head"><h2><IconTile icon={ListChecks} tone="green" size={30} />Team &amp; resources</h2><Link className="ws-link" href={`/provider/bookings/${j.id}?tab=team`}>Manage</Link></div>
              {team.length ? <ul>{team.slice(0, 3).map(t => <li key={t.id}><Avatar src={t.crew?.avatar} name={t.crew?.name ?? "Crew"} size={34} /><span><b>{t.crew?.name}</b><small>{t.role}</small></span><Chip tone={t.status === "confirmed" ? "green" : "amber"} dot>{titleCase(t.status)}</Chip></li>)}
                {team.length > 3 && <li className="pk-more"><Users aria-hidden="true" /><span><b>{team.length - 3} more staff</b><small>Assigned</small></span><Link className="ws-link" href={`/provider/bookings/${j.id}?tab=team`}>View all ({team.length})</Link></li>}</ul>
                : <p className="ws-muted">No team assigned yet.</p>}
              {space && <div className="pk-resource"><Thumb src={space.image} w={50} h={40} /><span><b>{space.name}</b><small>{hm(j.starts_at)} – {hm(j.ends_at)}</small></span><Chip tone="green" dot>Reserved</Chip></div>}</section>
          </div>
          <section className="ws-panel pk-timeline"><div className="ws-panel-head"><h2><IconTile icon={CalendarDays} tone="purple" size={30} />Event timeline <Chip tone="grey">{day(j.starts_at, { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</Chip></h2>
            <Link className="ws-link" href={`/provider/calendar?date=${j.starts_at.slice(0, 10)}&view=day`}>View full schedule</Link></div>
            <ol>{timeline.map((t, i) => <li key={i} className={t.at < now ? "past" : ""}><i /><b>{hm(new Date(t.at).toISOString())}</b><small>{t.title}</small><small>{t.sub}</small></li>)}</ol></section>
          <section className="pk-agent"><h2><Sparkles aria-hidden="true" />Gala Agent assistance <span>Let Gala Agent help you run this event.</span></h2><div>
            {[["Generate event run sheet", "Create a full BEO and timeline"], ["Prepare staff briefing", "Key information for your team"], ["Check checklist", "See what’s outstanding"], ["Draft client update", `Send a confirmation to ${j.client_name}`]].map(([t, d]) =>
              <Link key={t} href={`/provider/agent?goal=${encodeURIComponent(`${t} for ${j.event_name} (${j.reference})`)}`}><ClipboardList aria-hidden="true" /><span><b>{t}</b><small>{d}</small></span></Link>)}</div></section>
        </>}

        {tab === "delivery" && <section className="ws-panel pk-tab">{j.mode === "venue" ? <>
          <h2>Banqueting event order (BEO)</h2><p className="ws-muted">Operational details for venue teams. Changes to commercial terms go through a change request.</p>
          <dl className="pk-dl">{([["Arrival", beo.arrival], ["Setup", beo.setup], ["Breakdown", beo.breakdown], ["Food & beverage", beo.fnb], ["Bar", beo.bar], ["Access", beo.access], ["Layout", j.layout], ["Space", space?.name], ["Guests", j.guests]] as [string, unknown][]).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v ? String(v) : "—"}</dd></div>)}</dl>
          <h3>Compliance</h3><ul className="pk-checklist">{(beo.compliance ?? ["No compliance notes recorded"]).map(c => <li key={c}><ShieldCheck aria-hidden="true" />{c}</li>)}</ul></>
          : <><h2>Service delivery</h2><h3><Truck aria-hidden="true" />Deliverables</h3><ul className="pk-checklist">{(svc.deliverables ?? []).map(d => <li key={d}><CircleCheck aria-hidden="true" />{d}</li>)}</ul>
            <h3><Wrench aria-hidden="true" />Equipment</h3><ul className="pk-checklist">{(svc.equipment ?? []).map(d => <li key={d}><CircleDot aria-hidden="true" />{d}</li>)}</ul>
            <h3>Milestones</h3><ul className="pk-checklist">{(svc.milestones ?? []).map(m => <li key={m.label} className={m.done ? "done" : ""}><CircleCheck aria-hidden="true" />{m.label}{m.done ? " — done" : ""}</li>)}</ul></>}
          <h3>Delivery status</h3><p className="pk-state">Current status: <Chip tone={status.tone}>{status.label}</Chip></p>
          {next && <ActionButton action={transitionBooking} args={[j.id, next.to, ""]} variant="primary" confirm={{ title: next.label, body: next.to === "completed" ? "Completing the booking doesn’t mark it as paid — payment status only changes when payments clear." : "Update the delivery status for your team and the client.", cta: next.label }}>{next.label}</ActionButton>}
        </section>}

        {tab === "team" && <section className="ws-panel pk-tab"><h2>Team &amp; schedule</h2>
          {team.length ? <table className="ws-table pk-team-table"><thead><tr><th>Person</th><th>Role</th><th>Shift</th><th>Status</th></tr></thead><tbody>{team.map(t => <tr key={t.id}>
            <td><div className="ws-cell"><Avatar src={t.crew?.avatar} name={t.crew?.name ?? "Crew"} size={30} /><Link href={`/provider/team/${t.crew_id}`}><b>{t.crew?.name}</b></Link></div></td><td>{t.role}</td>
            <td>{day(t.starts_at, { day: "numeric", month: "short" })} {hm(t.starts_at)} – {hm(t.ends_at)}</td><td><Chip tone={t.status === "confirmed" ? "green" : "amber"}>{titleCase(t.status)}</Chip></td></tr>)}</tbody></table>
            : <Empty icon={Users} title="No one assigned yet" />}
          {["held", "confirmed", "active"].includes(j.status) && ctx.can.manage && <ActionForm action={assignCrew.bind(null, j.id)} className="pk-assign" resetOnSuccess>
            <h3>Assign a team member</h3>
            <label className="ws-field"><span>Team member</span><select name="crew" required defaultValue=""><option value="" disabled>Choose…</option>{crew.filter(c => !team.some(t => t.crew_id === c.id)).map(c => <option key={c.id} value={c.id}>{c.name} — {c.role}</option>)}</select></label>
            <label className="ws-field"><span>Role on this booking</span><input name="role" placeholder="e.g. Event lead" /></label>
            <button className="ws-btn primary">Assign</button><small className="ws-muted">Double-booking a person is refused automatically.</small>
          </ActionForm>}
        </section>}

        {tab === "commercial" && <section className="ws-panel pk-tab"><h2>Commercial</h2>
          <p className="ws-muted">These terms were captured when the booking was confirmed{snap.captured_at ? ` (${day(snap.captured_at, { day: "numeric", month: "short", year: "numeric" })})` : ""} and are locked. Later price changes don’t affect them.</p>
          <dl className="pk-dl">
            <div><dt>Booking value</dt><dd>{money(snap.value ?? j.value)}</dd></div>
            <div><dt>Platform fee</dt><dd>{money(fee)} ({((snap.commission_bps ?? 0) / 100).toFixed(1)}% commission at confirmation)</dd></div>
            <div><dt>Net payout</dt><dd><b>{money(j.net_payout)}</b></dd></div>
            <div><dt>Deposit</dt><dd>{snap.deposit_pct ?? 30}% · {money(depositAmt)}</dd></div>
            <div><dt>Paid so far</dt><dd>{money(j.paid_amount)} · {titleCase(j.payment_status)}</dd></div>
            <div><dt>Outstanding</dt><dd>{money(balance)}</dd></div>
            <div><dt>Source</dt><dd>{titleCase(j.source)}</dd></div>
          </dl>
          <h3>Cancellation policy</h3><table className="qp-policy pk-policy"><tbody>{(snap.cancellation ?? []).map(c => <tr key={c.window}><td>{c.window} before</td><td>{c.refund ? `${c.refund}% refund` : "No refund"}</td></tr>)}</tbody></table>
          <p className="pk-note"><Coins aria-hidden="true" />Payment status changes only when payments clear through Gala Dock. Payouts appear in <Link href="/provider/money?tab=payouts">Money</Link>.</p>
          {["held", "confirmed", "active"].includes(j.status) && ctx.can.manage && <div className="pk-cancel" id="cancel"><h3>Cancel this booking</h3>
            <p className="ws-muted">Refunds follow the cancellation policy above, and provider cancellations count towards reliability.</p>
            <ActionButton action={transitionBooking} args={[j.id, "cancelled"]} variant="danger" reason confirm={{ title: "Cancel booking", body: "The client will be notified and refunds handled according to the booking’s cancellation policy. This can’t be undone.", cta: "Cancel booking" }}>Cancel booking</ActionButton></div>}
        </section>}

        {tab === "files" && <section className="ws-panel pk-tab"><h2><Paperclip aria-hidden="true" />Files</h2>
          {files.length ? <ul className="pk-files">{files.map(f => <li key={f.id}><FileText aria-hidden="true" /><span><b>{f.title}</b><small>{titleCase(f.kind)} · {relative(f.created_at, now)}</small></span></li>)}</ul> : <p className="ws-muted">No files yet.</p>}
          <FileUpload jobId={j.id} />
          <h2 className="pk-h2b"><History aria-hidden="true" />Activity</h2>
          <ol className="pq-timeline">{[
            ...audit.map(a => ({ at: a.created_at, text: titleCase(a.event.replace(".", " ")) + (a.metadata.reason ? ` — ${a.metadata.reason}` : "") })),
            ...tasks.map(t => ({ at: t.created_at, text: `${titleCase(t.category)}: ${t.title}` })),
            { at: j.created_at, text: `Booking ${j.reference} created (${titleCase(j.source)})` },
          ].sort((a, b) => b.at.localeCompare(a.at)).map((x, i) => <li key={i}><time>{day(x.at, { day: "numeric", month: "short" })} · {hm(x.at)}</time><span>{x.text}</span></li>)}</ol></section>}
      </div>

      <aside className="pk-rail">
        <section className="ws-panel pk-status"><div className="ws-panel-head"><h2><IconTile icon={CircleCheck} tone="green" size={30} />Booking status</h2><Chip tone={status.tone} dot>{status.label}</Chip></div>
          <ul><li><CircleCheck aria-hidden="true" className={j.paid_amount >= depositAmt ? "ok" : "warn"} /><span>Deposit {j.paid_amount >= depositAmt ? "paid" : "due"}</span><b>{money(depositAmt)}</b></li>
            <li><Clock4 aria-hidden="true" className="warn" /><span>Balance due</span><b>{money(balance)}</b>{balance > 0 && <em>Due {day(balanceDue, { day: "numeric", month: "short" })}</em>}</li>
            <li><ShieldCheck aria-hidden="true" className="ok" /><span>Payment protection</span><b className="green">Gala Dock checkout</b></li></ul></section>
        <section className="ws-panel pk-convo"><div className="ws-panel-head"><h2>Client conversation</h2>{thread && <Link className="ws-link" href={`/provider/messages/${thread.id}`}>Open in full chat</Link>}</div>
          {messages.length ? <ul>{messages.map(m => <li key={m.id}><Avatar name={m.from_provider ? ctx.userName : m.sender_name} size={30} /><span><b>{m.from_provider ? "You" : m.sender_name} <small>{hm(m.created_at)}</small></b><p>{m.body}</p></span></li>)}</ul>
            : <p className="ws-muted">{thread ? "No messages yet." : "This is a direct booking — contact the client by email."}</p>}</section>
        <QuickActions jobId={j.id} canCancel={["held", "confirmed", "active"].includes(j.status)} />
      </aside>
    </div>
  </div>;
}
