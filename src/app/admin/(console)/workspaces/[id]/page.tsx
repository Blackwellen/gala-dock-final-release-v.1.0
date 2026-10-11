import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Globe, ChevronDown, Ban, CircleCheck, Users, Ticket, CalendarDays, Layers, Coins, Pencil, ShieldCheck, Store, Megaphone,
  UsersRound, Headphones, Plus, CircleAlert, Activity } from "lucide-react";
import "@/styles/admin-a-base.css";
import "@/styles/admin-a-workspaces.css";
import "@/styles/admin-a-profile.css";
import "@/styles/admin-a-workspace.css";
import { Avatar, Thumb, Restricted, Sparkline } from "@/components/workspace/kit";
import { ActionButton, ActionForm } from "@/components/workspace/actions";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows, one, count, isUuid } from "@/lib/workspace/db";
import { money, day, relative, requestTime, delta, titleCase } from "@/lib/workspace/format";
import { AdminMenu } from "../../_a/client";
import { Status, SectionHead, KVRows, Flag, LineTabs, Delta, TimelineItem } from "../../_a/ui";
import { shortRef, str, rpc, planLabel, hmRange, qs, type SP } from "../../_a/lib";
import { loadMetrics, loadPlans, commissionTier, WS_COLS, type Ws } from "../../_a/workspaces";
import { setWorkspaceStatus, setWorkspacePlan, setWorkspaceCommission, addRecordNote } from "../../_a/actions";

export const metadata: Metadata = { title: "Workspace" };

type Daily = { day: string; tickets: number; services: number; other: number; ticket_count: number };

function PerfChart({ data, metric }: { data: Daily[]; metric: "revenue" | "tickets" }) {
  const W = 470, H = 92, pl = 30, pb = 16, n = data.length || 1, bw = (W - pl) / n;
  const vals = data.map(d => metric === "tickets" ? Number(d.ticket_count) : Number(d.tickets) + Number(d.services) + Number(d.other));
  const max = Math.max(1, ...vals), step = Math.pow(10, Math.floor(Math.log10(max / 2 || 1))), top = Math.ceil(max / 4 / step) * step * 4 || 4;
  const y = (v: number) => (H - pb) * (1 - v / top) + 2;
  const label = (v: number) => metric === "tickets" ? String(v) : v >= 1000 ? `£${Math.round(v / 1000)}K` : `£${v}`;
  return <svg className="awd-chart" viewBox={`0 0 ${W} ${H + 4}`} role="img" aria-label={`Daily ${metric} for the last ${n} days`}>
    {[0, 1, 2, 3, 4].map(k => <g key={k}><line x1={pl} x2={W} y1={y(top * k / 4)} y2={y(top * k / 4)} className="grid" /><text x={pl - 4} y={y(top * k / 4) + 3} textAnchor="end">{label(top * k / 4)}</text></g>)}
    {data.map((d, i) => {
      const x = pl + i * bw + bw * .2, w = bw * .6;
      if (metric === "tickets") return <rect key={i} x={x} y={y(vals[i]!)} width={w} height={Math.max(0, y(0) - y(vals[i]!))} className="b1" rx={1} />;
      const parts = [Number(d.tickets), Number(d.services), Number(d.other)]; let acc = 0;
      return <g key={i}><title>{`${d.day}: ${money(vals[i]!)}`}</title>{parts.map((p, j) => { const y0 = y(acc), y1 = y(acc + p); acc += p; return p ? <rect key={j} x={x} y={y1} width={w} height={Math.max(0, y0 - y1)} className={`b${j + 1}`} /> : null; })}</g>;
    })}
    <polyline points={vals.map((v, i) => `${pl + i * bw + bw / 2},${y(v)}`).join(" ")} className="ln" />
    {data.map((d, i) => i % 7 === 0 && <text key={`l${i}`} x={pl + i * bw + bw / 2} y={H + 3} textAnchor="middle">{day(`${d.day}T12:00:00Z`, { day: "numeric", month: "short" })}</text>)}
  </svg>;
}

export default async function WorkspaceDetailPage(props: PageProps<"/admin/workspaces/[id]">) {
  const ctx = await requireAdminPermission("workspaces");
  if (!ctx.allowed) return <Restricted area="Workspaces" />;
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const sp = (await props.searchParams) as SP;
  const tab = ["access", "commerce", "trust", "activity"].includes(str(sp, "tab")) ? str(sp, "tab") : "overview";
  const metric = str(sp, "perf") === "tickets" ? "tickets" : "revenue";
  const { db, permissions } = ctx;
  const can = (p: Parameters<typeof permissions.has>[0]) => permissions.has(p);
  const now = requestTime();

  const w = await one<Ws>(db.from("workspaces").select(WS_COLS).eq("id", id).maybeSingle());
  if (!w) notFound();
  const [metrics, { plans, payoutSchedule }, daily, members, events, eventCount, upcomingCount, listings, tickets, cases, trust, audit, notes, payouts] = await Promise.all([
    loadMetrics(db, 30), loadPlans(db),
    rpc<Daily[]>(db, "admin_workspace_daily", { p_ws: id, p_days: 30 }),
    rows<{ user_id: string; role: string; status: string; created_at: string }>(db.from("workspace_members").select("user_id,role,status,created_at").eq("workspace_id", id).order("created_at")),
    can("events") || can("tickets") ? rows<{ id: string; name: string; starts_at: string | null; ends_at: string | null; status: string; cover_image: string; capacity: number | null }>(
      db.from("events").select("id,name,starts_at,ends_at,status,cover_image,capacity").eq("workspace_id", id).order("starts_at", { ascending: false }).limit(4)) : Promise.resolve([]),
    can("events") || can("tickets") ? count(db.from("events").select("id", { count: "exact", head: true }).eq("workspace_id", id)) : Promise.resolve(0),
    can("events") || can("tickets") ? count(db.from("events").select("id", { count: "exact", head: true }).eq("workspace_id", id).gt("starts_at", new Date(now).toISOString())) : Promise.resolve(0),
    rows<{ id: string; kind: string; published: boolean }>(db.from("listings").select("id,kind,published").eq("workspace_id", id)),
    can("tickets") ? rows<{ id: string; order_ref: string; status: string; price_paid: number; created_at: string; tier: { name: string } | null; event: { name: string; starts_at: string | null } | null }>(
      db.from("tickets").select("id,order_ref,status,price_paid,created_at,tier:ticket_tiers(name),event:events!inner(name,starts_at,workspace_id)").eq("event.workspace_id", id).order("created_at", { ascending: false }).limit(200)) : Promise.resolve([]),
    can("support") ? rows<{ id: string; priority: string; status: string }>(db.from("support_cases").select("id,priority,status").eq("workspace_id", id).neq("status", "resolved")) : Promise.resolve([]),
    can("trust") ? rows<{ id: string; category: string; status: string; risk_score: number; created_at: string; decision: string | null }>(
      db.from("trust_cases").select("id,category,status,risk_score,created_at,decision").eq("subject_type", "workspace").or(`subject_id.eq.${id},subject_name.eq."${w.name.replaceAll('"', "")}"`).order("created_at", { ascending: false }).limit(5)) : Promise.resolve([]),
    can("audit") ? rows<{ id: number; event: string; metadata: Record<string, unknown>; created_at: string }>(db.from("audit_events").select("id,event,metadata,created_at").eq("workspace_id", id).order("created_at", { ascending: false }).limit(tab === "activity" ? 40 : 6)) : Promise.resolve([]),
    rows<{ id: number; body: string; author_name: string; created_at: string }>(db.from("admin_record_notes").select("id,body,author_name,created_at").eq("subject_type", "workspace").eq("subject_id", id).order("created_at", { ascending: false }).limit(5)),
    can("commerce") ? rows<{ amount: number; status: string; occurred_at: string }>(db.from("transactions").select("amount,status,occurred_at").eq("workspace_id", id).eq("kind", "payout").order("occurred_at", { ascending: false }).limit(20)) : Promise.resolve([]),
  ]);
  const people = (can("users") || can("support")) && members.length ? await rows<{ id: string; full_name: string; avatar_url: string }>(db.from("profiles").select("id,full_name,avatar_url").in("id", members.map(m => m.user_id))) : [];
  const person = new Map(people.map(p => [p.id, p]));
  const owner = person.get(w.owner_id);
  const m = metrics.get(id);
  const fee = (m?.gmv ?? 0) * w.commission_bps / 10000, feePrev = (m?.gmv_prev ?? 0) * w.commission_bps / 10000;
  const series = daily.map(d => Number(d.tickets) + Number(d.services) + Number(d.other));
  const sum = (k: keyof Daily) => daily.reduce((a, d) => a + Number(d[k]), 0);
  const nextPayout = payouts.filter(p => p.status !== "completed").sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))[0];
  const openFlags = trust.filter(t => ["open", "in_review"].includes(t.status));
  const orders = [...tickets.reduce((acc, t) => { const o = acc.get(t.order_ref) ?? { ...t, qty: 0, total: 0, refunded: true }; o.qty++; o.total += Number(t.price_paid); o.refunded &&= t.status === "refunded"; acc.set(t.order_ref, o); return acc; },
    new Map<string, (typeof tickets)[number] & { qty: number; total: number; refunded: boolean }>()).values()].slice(0, 5);
  const isOrg = w.kind === "organizer", base = `/admin/workspaces/${id}`;
  const caps = [
    { icon: ShieldCheck, label: "Venue management", on: w.capabilities?.includes("venue") || listings.some(l => l.kind === "venue") },
    { icon: Users, label: "Supplier management", on: w.capabilities?.includes("service") || listings.some(l => l.kind === "service") || (isOrg && (m?.services_booked ?? 0) > 0) },
    { icon: CalendarDays, label: "Event management", on: isOrg || eventCount > 0 },
    { icon: Megaphone, label: "Ticketing & promotion", on: tickets.length > 0 || (m?.tickets ?? 0) > 0 },
    { icon: Store, label: "Marketplace", on: listings.some(l => l.published) || (m?.services_booked ?? 0) > 0 },
    { icon: UsersRound, label: "Team management", on: members.filter(x => x.status === "active").length > 1 },
  ];
  const planEntries = ["starter", "pro", "business", "enterprise"].filter(p => p !== w.plan).map(p => ({ kind: "action" as const, label: `Change to ${planLabel(p)}${plans[p] ? ` (${money(plans[p]!.monthly)}/mo)` : ""}`,
    action: setWorkspacePlan, args: [id, p], reason: true, confirm: { title: `Move ${w.name} to ${planLabel(p)}?`, body: "Plan limits and pricing change immediately. The owner is notified.", cta: "Change plan" } }));
  const tierEntries = [800, 1000, 1200, 1500].filter(b => b !== w.commission_bps).map(b => ({ kind: "action" as const, label: `Set to ${b / 100}%`, action: setWorkspaceCommission, args: [id, b], reason: true,
    confirm: { title: `Set commission to ${b / 100}%?`, body: "Applies to new bookings and ticket sales. Existing orders keep their snapshot.", cta: "Update commission" } }));

  const detailsPanel = <section className="aa-panel awd-details">
    <SectionHead title="Workspace details"><Link className="aa-edit" href={`${base}?tab=access`}><Pencil aria-hidden="true" />Team &amp; access</Link></SectionHead>
    <KVRows rows={[
      ["Name", w.name], ["Workspace ID", shortRef("ORG", id, w.settings?.reference)], ["Type", <span key="t" className={`aa-chip ${isOrg ? "pink" : ""}`}>{titleCase(w.kind)}</span>],
      ["Plan", <span key="p" className="aa-blue">{planLabel(w.plan)}{plans[w.plan] ? ` (${money(plans[w.plan]!.monthly)}/month)` : ""}</span>],
      ["Status", <Status key="s" value={w.status === "suspended" ? "suspended" : "active"} label={w.status === "suspended" ? "Suspended" : "Active"} />],
      ["Owner", owner ? <Link className="aa-who" href={`/admin/users/${owner.id}`}><Avatar src={owner.avatar_url} name={owner.full_name} size={26} /><span>{owner.full_name} <em className="aa-muted">({shortRef("USR", owner.id)})</em></span></Link> : "—"],
      ["Company", w.settings?.company || "—"], ["Company no.", w.settings?.company_no || "—"], ["VAT number", w.settings?.vat_number || "—"],
      ["Location", w.settings?.location ? <span className="aa-loc"><Flag country="GB" />{w.settings.location}</span> : "—"],
      ["Created", day(w.created_at, { day: "numeric", month: "short", year: "numeric" })],
      ["Verification", <span key="v" className="awd-ver"><Status value={w.verification_status} />{can("trust") && <Link className="aa-link" href={`/admin/trust?q=${encodeURIComponent(w.name)}`}>View details →</Link>}</span>],
    ]} />
  </section>;
  const teamPanel = <section className="aa-panel awd-team">
    <SectionHead title={<>Team members <span>({members.length})</span></>} href={tab === "access" ? undefined : `${base}?tab=access`} />
    {!people.length && members.length ? <p className="aa-empty">Member identities need the Users permission.</p> : <ul className="awd-people">{members.slice(0, tab === "access" ? 50 : 4).map(mb => {
      const p = person.get(mb.user_id);
      return <li key={mb.user_id}><Avatar src={p?.avatar_url} name={p?.full_name ?? "Member"} size={32} /><div><Link href={`/admin/users/${mb.user_id}`}><b>{p?.full_name ?? "Member"}</b></Link>
        <small>{titleCase(mb.role)} · {mb.role === "owner" ? "Full access" : mb.role === "finance" ? "Finance · Commerce" : mb.role === "manager" ? "Events & Tickets" : "Operations"}</small></div>
        <Status value={mb.status === "active" ? "active" : mb.status} label={titleCase(mb.status)} /></li>;
    })}</ul>}
    {tab !== "access" && <Link className="ap-more" href={`${base}?tab=access`}><Plus aria-hidden="true" />View all team members</Link>}
  </section>;
  const planPanel = <section className="aa-panel awd-plan">
    <SectionHead title="Plan &amp; billing"><AdminMenu label="Manage plan" className="aa-edit awd-manage" trigger={<>Manage plan</>} entries={planEntries} /></SectionHead>
    <KVRows rows={[
      ["Current plan", <span key="c" className="awd-plan-now"><b>{planLabel(w.plan)}</b>{plans[w.plan] ? <span>{money(plans[w.plan]!.monthly)} / month</span> : <span>Custom pricing</span>}
        <small>{plans[w.plan] ? `${plans[w.plan]!.commission_bps / 100}% plan commission` : "Negotiated terms"}</small></span>],
      ["Subscription status", <Status key="s" value={w.status === "suspended" ? "suspended" : "active"} label={w.status === "suspended" ? "Suspended" : "Active"} />],
      ["Payout account", <Status key="pa" value={w.payout_status === "active" ? "active" : w.payout_status === "restricted" ? "restricted" : "pending"} label={titleCase(w.payout_status)} />],
      ["Members", `${members.filter(x => x.status === "active").length} active`],
    ]} />
  </section>;
  const commissionPanel = <section className="aa-panel awd-commission">
    <SectionHead title="Commission &amp; payouts" href={can("commerce") ? `/admin/commerce?q=${encodeURIComponent(w.name)}` : undefined} />
    <KVRows rows={[
      ["Commission tier", commissionTier(w.commission_bps, w.plan, plans), can("commerce") ? <AdminMenu label="Edit commission tier" className="ws-btn outline sm" trigger={<>Edit tier</>} entries={tierEntries} /> : undefined],
      ["Total platform fees (30d)", <span key="f" className="awd-fee"><b>{money(fee)}</b><Delta value={delta(fee, feePrev)} /></span>],
      ["Next payout", can("commerce") ? (nextPayout ? <span key="n" className="awd-plan-now"><b>{money(nextPayout.amount)}</b><small>Scheduled {day(nextPayout.occurred_at, { day: "numeric", month: "short", year: "numeric" })}</small></span> : "None scheduled") : "Needs Commerce permission"],
      ["Payout schedule", titleCase(payoutSchedule)],
      ["Payout method", <span key="pm" className="awd-stripe"><b>S</b><span>Stripe Connect<Status value={w.payout_status === "active" ? "active" : "pending"} label={w.payout_status === "active" ? "Connected" : titleCase(w.payout_status)} /></span></span>],
    ]} />
  </section>;
  const trustPanel = <section className="aa-panel awd-trust">
    <SectionHead title="Trust &amp; support" href={can("trust") ? `/admin/trust?q=${encodeURIComponent(w.name)}` : undefined} />
    <div className="awd-tr"><span className={`aa-tile ${openFlags.length ? "red" : "green"}`}><ShieldCheck aria-hidden="true" /></span><b>Trust status</b><span className="aa-muted">{openFlags.length ? `${openFlags.length} active flag${openFlags.length > 1 ? "s" : ""}` : "• No active flags"}</span></div>
    {can("support") && <div className="awd-tr"><span className="aa-tile blue"><Headphones aria-hidden="true" /></span><b>Open support cases</b>
      <span><b>{cases.length}</b>{cases.some(c => ["high", "urgent"].includes(c.priority)) && <small className="red">{cases.filter(c => ["high", "urgent"].includes(c.priority)).length} high priority</small>}</span>
      <Link className="ws-btn outline sm" href={`/admin/support?q=${encodeURIComponent(w.name)}`}>View cases</Link></div>}
    {can("trust") && <><h4 className="awd-sub">Recent trust events</h4>{trust.length ? <ul className="awd-tevents">{trust.slice(0, 3).map(t => <li key={t.id}>
      <span className={`awd-dot ${["open", "in_review"].includes(t.status) ? "bad" : ""}`}>{["open", "in_review"].includes(t.status) ? <CircleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}</span>
      <div><b>{t.category}</b><small>{day(t.created_at, { day: "numeric", month: "short", year: "numeric" })} · {titleCase(t.decision ?? t.status)}</small></div></li>)}</ul>
      : <ul className="awd-tevents"><li><span className="awd-dot"><CircleCheck aria-hidden="true" /></span><div><b>No trust cases on record</b><small>{w.verification_status === "verified" ? "Business verification completed" : `Verification ${w.verification_status}`}</small></div></li></ul>}</>}
  </section>;
  const ticketsPanel = <section className="aa-panel awd-tickets">
    <SectionHead title="Recent tickets" href={can("tickets") ? `/admin/tickets?q=${encodeURIComponent(w.name)}` : undefined} />
    {!can("tickets") ? <p className="aa-empty">Ticket data needs the Tickets permission.</p> : orders.length ? <table className="aa-mtable"><thead><tr><th>Event</th><th>Date</th><th>Type</th><th>Qty</th><th>Total</th><th>Status</th></tr></thead>
      <tbody>{orders.map(o => <tr key={o.order_ref}><td>{o.event?.name}</td><td>{day(o.event?.starts_at, { day: "numeric", month: "short", year: "numeric" })}</td><td className="aa-muted">{o.tier?.name?.replace(" Admission", "")}</td><td>{o.qty}</td>
        <td>{money(o.total, "GBP", { cents: true })}</td><td>{o.refunded ? <Status value="refunded" label="Refunded" /> : o.status === "used" ? <Status value="used" label="Used" dot={false} /> : <Status value="paid" label="Paid" />}</td></tr>)}</tbody></table>
      : <p className="aa-empty">No ticket orders for this workspace.</p>}
  </section>;
  const eventsPanel = <section className="aa-panel awd-events">
    <SectionHead title="Recent events" href={`/admin/events?q=${encodeURIComponent(w.name)}`} />
    {events.length ? <ul className="awd-evs">{events.map(e => <li key={e.id}><Thumb src={e.cover_image || null} w={38} h={30} /><div><b>{e.name}</b>
      <small>{day(e.starts_at, { day: "numeric", month: "short", year: "numeric" })} · {hmRange(e.starts_at, e.ends_at)}{e.capacity ? ` · ${e.capacity.toLocaleString("en-GB")} capacity` : ""}</small></div>
      {e.starts_at && new Date(e.starts_at).getTime() > now ? <Status value="active" label="Upcoming" dot={false} /> : <Status value="past" label="Past" dot={false} />}</li>)}</ul>
      : <p className="aa-empty">{can("events") || can("tickets") ? "No events yet." : "Event data needs the Events permission."}</p>}
  </section>;
  const perfPanel = <section className="aa-panel awd-perf">
    <SectionHead title={<>Performance <span>(last 30 days)</span></>} href={`${base}?tab=commerce`} label="View analytics" />
    <div className="awd-perf-bar"><nav className="awd-seg" aria-label="Metric">
      <Link scroll={false} href={qs(base, sp, { perf: null })} className={metric === "revenue" ? "on" : ""}>Revenue</Link>
      <Link scroll={false} href={qs(base, sp, { perf: "tickets" })} className={metric === "tickets" ? "on" : ""}>Tickets</Link></nav>
      <span className="awd-period">Last 30 days</span></div>
    <PerfChart data={daily} metric={metric} />
    <ul className="awd-legend"><li className="t">Ticket sales<b>{money(sum("tickets"))}</b></li><li className="s">Service bookings<b>{money(sum("services"))}</b></li><li className="o">Other revenue<b>{money(sum("other"))}</b></li><li className="l">Total revenue (line)</li></ul>
  </section>;
  const notesPanel = <section className="aa-panel ap-notes">
    <SectionHead title="Admin notes" />
    <ActionForm action={addRecordNote.bind(null, "workspace", id)} className="aa-note-form" resetOnSuccess>
      <label className="sr-only" htmlFor="awd-note">Internal note</label><input id="awd-note" name="body" placeholder="Add an internal note (visible to admins only)..." maxLength={2000} required minLength={2} />
      <button type="submit" className="ws-btn primary">Add note</button></ActionForm>
    {notes.length ? notes.map(n => <div key={n.id} className="aa-note"><span className="ap-note-ico"><Activity aria-hidden="true" /></span><div><small><b>{n.author_name}</b> · {relative(n.created_at, now)}</small><p>{n.body}</p></div></div>) : <p className="aa-empty">No notes yet.</p>}
  </section>;
  const activityPanel = <section className="aa-panel">
    <SectionHead title="Activity" />
    {!can("audit") ? <p className="aa-empty">Activity needs the Audit permission.</p> : audit.length ? <ul className="aa-tls">{audit.map(a => <TimelineItem key={a.id} icon={Activity}
      title={`${titleCase(a.event.replace(/\./g, " "))}${a.metadata?.event ? `: ${a.metadata.event}` : ""}`} meta={`${relative(a.created_at, now)}${a.metadata?.reason ? ` · ${a.metadata.reason}` : ""}`} />)}</ul> : <p className="aa-empty">No recorded activity.</p>}
  </section>;

  return <div className="aa awd">
    <Link className="aa-back" href="/admin/workspaces"><ArrowLeft aria-hidden="true" />Back to Workspaces</Link>
    <header className="aa-hero awd-hero">
      <Thumb src={w.cover_image || null} w={110} h={73} />
      <div>
        <h1>{w.name} <Status value={w.status === "suspended" ? "suspended" : "active"} label={w.status === "suspended" ? "Suspended" : "Active"} /></h1>
        <p className="aa-hero-meta">{shortRef("ORG", id, w.settings?.reference)}<span className="sep">•</span>{titleCase(w.kind)} Workspace<span className="sep">•</span>{planLabel(w.plan)} Plan</p>
        <p className="aa-hero-meta"><Flag country="GB" />{w.settings?.company || w.name}{w.settings?.company_no && <><span className="sep">•</span>Company no. {w.settings.company_no}</>}{w.settings?.location && <><span className="sep">•</span>{w.settings.location}</>}</p>
      </div>
      <div className="aa-hero-actions">
        <Link className="ws-btn outline" href={`/admin/events?q=${encodeURIComponent(w.name)}`}><ExternalLink aria-hidden="true" />Open in platform</Link>
        {listings.some(l => l.published) ? <Link className="ws-btn outline" href={`/admin/marketplace?q=${encodeURIComponent(w.name)}`}><Globe aria-hidden="true" />View public profile</Link> : null}
        <AdminMenu label="More actions" className="ws-btn outline awd-more" trigger={<>More actions<ChevronDown aria-hidden="true" /></>} entries={[
          ...planEntries.slice(0, 2), ...(owner ? [{ kind: "link" as const, label: "View owner", href: `/admin/users/${owner.id}` }] : []),
          { kind: "link", label: "Export (CSV)", href: `/admin/workspaces/export?id=${id}` }]} />
        {w.status === "suspended"
          ? <ActionButton action={setWorkspaceStatus} args={[id, "active"]} reason variant="outline" confirm={{ title: `Reinstate ${w.name}?`, body: "Members regain access immediately.", cta: "Reinstate" }}><CircleCheck aria-hidden="true" />Reinstate workspace</ActionButton>
          : <ActionButton action={setWorkspaceStatus} args={[id, "suspended"]} reason variant="danger" confirm={{ title: `Suspend ${w.name}?`, body: "All members lose access and live listings stop taking bookings until reinstated. The owner can appeal.", cta: "Suspend workspace" }}><Ban aria-hidden="true" />Suspend workspace</ActionButton>}
      </div>
    </header>
    <LineTabs base={base} sp={sp} active={tab} className="ap-tabs" tabs={[{ key: "overview", label: "Overview" }, { key: "access", label: "Access" }, { key: "commerce", label: "Commerce" }, { key: "trust", label: "Trust" }, { key: "activity", label: "Activity" }]} />

    <section className="awd-kpis" aria-label="Summary">
      <div className="awd-kpi"><span className="aa-tile blue"><Users aria-hidden="true" /></span><div><small>Total Revenue (30d)</small><b>{money(m?.gmv ?? 0)}</b><Delta value={delta(m?.gmv ?? 0, m?.gmv_prev ?? 0)} /></div><Sparkline values={series} tone="blue" /></div>
      <div className="awd-kpi"><span className="aa-tile purple"><Ticket aria-hidden="true" /></span><div><small>Tickets Sold (30d)</small><b>{(m?.tickets ?? 0).toLocaleString("en-GB")}</b><Delta value={delta(m?.tickets ?? 0, m?.tickets_prev ?? 0)} /></div><Sparkline values={daily.map(d => Number(d.ticket_count))} tone="purple" /></div>
      <div className="awd-kpi"><span className="aa-tile blue"><CalendarDays aria-hidden="true" /></span><div><small>Events</small><b>{eventCount}</b><em>{upcomingCount} upcoming</em></div></div>
      <div className="awd-kpi"><span className="aa-tile blue"><Layers aria-hidden="true" /></span><div><small>{isOrg ? "Services Booked" : "Jobs Booked"}</small><b>{m?.services_booked ?? 0}</b><Delta value={delta(m?.services_booked ?? 0, m?.services_prev ?? 0)} /></div><Sparkline values={daily.map(d => Number(d.services))} tone="blue" /></div>
      <div className="awd-kpi"><span className="aa-tile orange"><Coins aria-hidden="true" /></span><div><small>Commission (30d)</small><b>{money(fee)}</b><Delta value={delta(fee, feePrev)} /></div><Sparkline values={series.map(v => v * w.commission_bps / 10000)} tone="orange" /></div>
    </section>

    {tab === "overview" && <div className="awd-grid">
      <div className="ap-col">{detailsPanel}{perfPanel}{eventsPanel}</div>
      <div className="ap-col">
        <section className="aa-panel awd-caps"><SectionHead title={<>Capabilities <span>({titleCase(w.kind)})</span></>} />
          <ul>{caps.map(c => <li key={c.label}><span className="aa-tile purple"><c.icon aria-hidden="true" /></span><div><b>{c.label}</b>{c.on ? <Status value="active" label="Enabled" /> : <Status value="draft" label="Not used" dot={false} />}</div></li>)}</ul>
        </section>
        {teamPanel}{ticketsPanel}
      </div>
      <div className="ap-col">{planPanel}{commissionPanel}{trustPanel}</div>
    </div>}
    {tab === "access" && <div className="ap-grid two"><div className="ap-col">{teamPanel}</div><div className="ap-col">{detailsPanel}</div></div>}
    {tab === "commerce" && <div className="ap-grid two"><div className="ap-col">{perfPanel}{ticketsPanel}</div><div className="ap-col">{planPanel}{commissionPanel}</div></div>}
    {tab === "trust" && <div className="ap-grid two"><div className="ap-col">{trustPanel}</div><div className="ap-col">{notesPanel}</div></div>}
    {tab === "activity" && <div className="ap-grid two"><div className="ap-col">{activityPanel}</div><div className="ap-col">{eventsPanel}{notesPanel}</div></div>}
  </div>;
}
