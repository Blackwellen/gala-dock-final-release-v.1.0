import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { House, CalendarDays, SquareCheckBig, FileText, CircleDollarSign, MessageSquare, ArrowLeft, MapPin, Users, Database, TrendingUp, ChevronRight,
  Play, Download, Ellipsis, FileSpreadsheet, Utensils, Palette, Map, Check, CircleAlert, type LucideIcon } from "lucide-react";
import "@/styles/portal-client.css";
import { PortalShell, PortalPanel, PortalChip, PortalAvatar, type ChipTone } from "@/components/portal/shell";
import { eventHero } from "@/components/portal/media";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { hashToken, isTokenFormat } from "@/lib/security";
import { money, num, requestTime } from "@/lib/workspace/format";
import { ApprovalButtons, MessageComposer, RequestPayment } from "./forms";
import { ago, dateRange, fmt, statusLabel, timeRange } from "@/components/portal/format";

export const metadata: Metadata = { title: "Client portal · Gala Dock", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Approval = { id: string; kind: "approval" | "confirm" | "review" | "sign_off"; title: string; supplier: string; detail: string; amount: number | null; image: string; items_count: number | null;
  status: "pending" | "approved" | "rejected"; due_at: string | null; submitted_at: string; decided_at: string | null; decided_name: string | null; decision_note: string };
type View = {
  link: { id: string; client_name: string; expires_at: string }; organizer: string;
  event: { id: string; name: string; slug: string | null; status: string; visibility: string; starts_at: string | null; ends_at: string | null; venue_name: string; city: string; location: string;
    guest_count: number; capacity: number | null; budget_total: number | null; currency: string; tags: string[]; cover_image: string; updated_at: string; venue_confirmed: boolean; video_url: string | null };
  milestones: { id: string; title: string; detail: string; category: string; due_at: string | null; status: string }[];
  suppliers: { category: string; status: string; amount: number | null }[];
  approvals: Approval[];
  documents: { id: string; title: string; tag: string; size_bytes: number; updated_at: string }[];
  invoices: { id: string; number: string; reference: string; status: string; issue_date: string; due_date: string | null; total: number; amount_paid: number; currency: string }[];
  messages: { id: string; author_name: string; author_avatar: string; from_client: boolean; body: string; read_at: string | null; created_at: string }[];
};
const VIEWS = ["overview", "timeline", "approvals", "documents", "money", "messages"] as const;
type ViewKey = typeof VIEWS[number];
const CATEGORY: Record<string, string> = { general: "Planning", marketing: "Social media, ads and PR", operations: "Operations", risk: "Safety and compliance", logistics: "Logistics", hospitality: "Hospitality" };
const fileSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);
const TAG_TONE: Record<string, ChipTone> = { Proposal: "blue", Contract: "purple", Design: "purple", Compliance: "green" };
const KIND_ICON: Record<Approval["kind"], [LucideIcon, string]> = { approval: [SquareCheckBig, "amber"], confirm: [Utensils, "blue"], review: [Palette, "red"], sign_off: [Map, "indigo"] };

export default async function ClientPortal(props: PageProps<"/portal/[token]">) {
  const { token } = await props.params;
  if (!isTokenFormat(token)) notFound();
  const sp = await props.searchParams;
  const view: ViewKey = VIEWS.includes(sp.view as ViewKey) ? sp.view as ViewKey : "overview";
  const sb = untyped(await createClient());
  const { data, error } = await sb.rpc("portal_view", { p_token_hash: hashToken(token) });
  if (error?.message.includes("rate_limited")) throw new Error("This link is receiving too many requests. Please try again shortly.");
  if (error || !data) notFound();
  const v = data as View, e = v.event, now = requestTime();
  const base = `/portal/${token}`, href = (k: ViewKey) => (k === "overview" ? base : `${base}?view=${k}`);
  const first = v.link.client_name.split(/\s+/)[0];
  const pending = v.approvals.filter(a => a.status === "pending");
  const unread = v.messages.filter(m => !m.from_client && !m.read_at).length;

  // Readiness: derived from the organiser's live plan (supplier line-up, ticketing, approvals and milestone tasks).
  const primary = v.suppliers.filter(s => !["declined", "cancelled", "unavailable", "expired"].includes(s.status));
  const confirmed = primary.filter(s => ["confirmed", "fulfilled"].includes(s.status)).length;
  const venueDone = e.venue_confirmed || v.suppliers.some(s => s.category === "venue" && s.status === "confirmed");
  const checks: { label: string; state: "done" | "part" | "todo" }[] = [
    { label: "Venue confirmed", state: venueDone ? "done" : "todo" },
    { label: `Supplier line-up (${confirmed}/${primary.length})`, state: primary.length && confirmed === primary.length ? "done" : confirmed ? "part" : "todo" },
    { label: "Ticketing live", state: ["on_sale", "live", "completed"].includes(e.status) ? "done" : "todo" },
    ...v.milestones.map(m => ({ label: m.title, state: (m.status === "done" ? "done" : m.status === "in_progress" ? "part" : "todo") as "done" | "part" | "todo" })),
    { label: "Client approvals complete", state: pending.length ? (v.approvals.length > pending.length ? "part" : "todo") : "done" },
  ];
  const doneN = checks.filter(c => c.state === "done").length, readiness = Math.round((100 * (doneN + 0.5 * checks.filter(c => c.state === "part").length)) / checks.length);
  const overdue = v.milestones.filter(m => m.status !== "done" && m.due_at && Date.parse(m.due_at) < now);
  const committed = v.suppliers.filter(s => ["confirmed", "fulfilled", "held"].includes(s.status)).reduce((a, s) => a + Number(s.amount ?? 0), 0);
  const budget = Number(e.budget_total ?? 0), committedPct = budget ? Math.round((100 * committed) / budget) : 0;
  const timeline = [...v.milestones.map(m => ({ id: m.id, at: m.due_at, title: m.title, sub: m.detail || CATEGORY[m.category] || "Planning", status: m.status })),
    ...(e.starts_at ? [{ id: "event", at: e.starts_at, title: "Event day", sub: e.venue_name || e.location, status: "event" }] : [])]
    .filter(t => t.at).sort((a, b) => Date.parse(a.at!) - Date.parse(b.at!));
  const tlChip = (t: { status: string; at: string | null }): [ChipTone, string] => t.status === "event" ? ["purple", "Event day"] : t.status === "done" ? ["green", "Completed"]
    : t.at && Date.parse(t.at) < now ? ["red", "Overdue"] : t.status === "in_progress" ? ["blue", "In progress"] : ["amber", "Pending"];
  const invoiceState = (i: View["invoices"][number]): [ChipTone, string] => i.status === "paid" ? ["green", "Paid"] : i.status === "partial" ? ["blue", "Part paid"] : i.status === "overdue" ? ["red", "Overdue"]
    : i.status === "draft" ? (i.due_date ? ["blue", "Scheduled"] : ["grey", "Not issued"]) : ["amber", "Pending"];
  const thumb = e.cover_image || "/assets/gd/oe-neon.webp";
  const hero = eventHero(e.slug, "client", thumb);

  const timelineList = (rows: typeof timeline) => <ol className="pc-tl">{rows.map(t => { const [tone, label] = tlChip(t); const d = new Date(t.at!);
    return <li key={t.id} className={`s-${tone}`} data-q={`${t.title} ${t.sub}`}>
      <span className="pc-date"><small>{fmt(d, { month: "short" }).toUpperCase()}</small><b>{fmt(d, { day: "numeric" })}</b></span><i className="pc-node" />
      <span className="pc-tl-text"><b>{t.title}</b><small>{t.sub}</small></span><PortalChip tone={tone}>{label}</PortalChip></li>; })}</ol>;
  const approvalRow = (a: Approval, detail = false) => <li key={a.id} className="pc-ap" data-q={`${a.title} ${a.supplier}`}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={a.image || thumb} alt="" width={78} height={60} loading="lazy" />
    <div className="pc-ap-body">
      <div className="pc-ap-top"><b>{a.title}</b>{a.status === "pending" ? <PortalChip tone="blue">♥ Pending</PortalChip> : a.status === "approved" ? <PortalChip tone="green" dot>Approved</PortalChip> : <PortalChip tone="red" dot>Rejected</PortalChip>}</div>
      <small>{a.amount != null ? <>{money(a.amount)} <em>•</em> </> : null}{a.supplier}{a.items_count ? ` • ${a.items_count} items` : ""}</small>
      {detail && a.detail && <p className="pc-ap-detail">{a.detail}</p>}
      <div className="pc-ap-foot"><small>{a.status === "pending" ? `Submitted ${fmt(a.submitted_at)}` : `${a.status === "approved" ? "Approved" : "Rejected"} ${fmt(a.decided_at)}${detail && a.decided_name ? ` by ${a.decided_name}` : ""}`}</small>
        {a.status === "pending" && <ApprovalButtons token={token} id={a.id} title={a.title} viewHref={detail ? undefined : `${href("approvals")}#ap-${a.id}`} />}</div>
      {detail && a.decision_note && <p className="pc-ap-detail">“{a.decision_note}”</p>}
    </div></li>;
  const recentApprovals = [...pending.filter(a => a.amount != null).slice(0, 1), ...v.approvals.filter(a => a.status !== "pending").sort((a, b) => Date.parse(b.decided_at ?? "") - Date.parse(a.decided_at ?? ""))].slice(0, 3);
  const actions = [...pending].sort((a, b) => Date.parse(a.due_at ?? "9999") - Date.parse(b.due_at ?? "9999"));
  const actionList = () => <ul className="pc-actions">{actions.map(a => { const [Icon, tone] = KIND_ICON[a.kind]; const days = a.due_at ? Math.ceil((Date.parse(a.due_at) - now) / 864e5) : null;
    return <li key={a.id} data-q={`${a.title} ${a.supplier}`}><Link href={`${href("approvals")}#ap-${a.id}`}><span className={`pc-act-ic ${tone}`}><Icon aria-hidden="true" /></span>
      <span><b>{a.kind === "approval" ? `Review and approve ${a.title.toLowerCase().replace(/ package$/, "")}` : a.title}</b><small>{a.items_count ? `${a.items_count} items to review` : a.supplier}</small></span>
      {days !== null && days <= 3 ? <PortalChip tone={days < 0 ? "red" : "amber"}>{days < 0 ? "Overdue" : `Due in ${days} day${days === 1 ? "" : "s"}`}</PortalChip> : <PortalChip tone="amber">Pending</PortalChip>}</Link></li>; })}
    {!actions.length && <li className="pt-empty">Nothing needs your attention right now.</li>}</ul>;
  const docList = (rows: View["documents"]) => <ul className="pc-docs">{rows.map(d => <li key={d.id} data-q={`${d.title} ${d.tag}`}>
    <span className="pc-file"><FileText aria-hidden="true" /></span><span className="pc-doc-t"><b>{d.title}</b><small>{fileSize(d.size_bytes)} • Updated {fmt(d.updated_at)}</small></span>
    <PortalChip tone={TAG_TONE[d.tag] ?? "grey"}>{d.tag}</PortalChip>
    <a className="pc-ico" href={`${base}/documents/${d.id}`} aria-label={`Download ${d.title}`} download><Download aria-hidden="true" /></a>
    <details className="pc-more pt-pop"><summary aria-label={`More actions for ${d.title}`}><Ellipsis aria-hidden="true" /></summary>
      <div className="pt-pop-panel right" role="menu"><a href={`${base}/documents/${d.id}?inline=1`} target="_blank" rel="noopener" role="menuitem">Open in new tab</a>
        <Link href={`${href("messages")}&about=${encodeURIComponent(d.title)}#compose`} role="menuitem">Ask about this document</Link></div></details></li>)}
    {!rows.length && <li className="pt-empty">No documents have been shared yet.</li>}</ul>;
  const invoiceList = (rows: View["invoices"]) => <ul className="pc-inv">{rows.map(i => { const [tone, label] = invoiceState(i); const pct = budget && i.reference.match(/\((\d+)%\)/)?.[1];
    return <li key={i.id} data-q={`${i.reference} ${i.number}`}><span className={`pc-file ${tone}`}><FileSpreadsheet aria-hidden="true" /></span>
      <span className="pc-inv-t"><b>{i.reference.replace(/\s*\(\d+%\)/, "") || "Invoice"}</b><small>{i.number}{pct ? ` • ${pct}%` : ""}</small></span>
      <b className="pc-amt">{money(i.total)}</b>
      <span className="pc-inv-s"><PortalChip tone={tone}>{label}</PortalChip>{i.due_date && i.status !== "paid" && <small>Due {fmt(i.due_date)}</small>}</span>
      {["sent", "viewed", "partial", "overdue"].includes(i.status) ? <RequestPayment token={token} number={i.number} amount={money(i.total - i.amount_paid)} /> : <span />}</li>; })}
    {!rows.length && <li className="pt-empty">No invoices yet.</li>}</ul>;
  const messageList = (rows: View["messages"]) => <ul className="pc-msgs">{rows.map(m => <li key={m.id} data-q={`${m.author_name} ${m.body}`} className={m.from_client ? "mine" : ""}>
    <PortalAvatar src={m.author_avatar || null} name={m.author_name} size={36} /><span><b>{m.from_client ? `${m.author_name} (you)` : m.author_name}</b><small>{m.body}</small></span>
    <time dateTime={m.created_at}>{ago(m.created_at, now)}</time>{!m.from_client && <i className={m.read_at ? "read" : "unread"} aria-label={m.read_at ? "Read" : "Unread"} />}</li>)}
    {!rows.length && <li className="pt-empty">No messages yet.</li>}</ul>;

  const kpis: { icon: LucideIcon; label: string; value: string; sub: React.ReactNode; href: string; tone?: string }[] = [
    { icon: CalendarDays, label: "Event dates", value: dateRange(e.starts_at, e.ends_at), sub: timeRange(e.starts_at, e.ends_at), href: href("timeline") },
    { icon: Users, label: "Expected guests", value: num(e.guest_count), sub: e.capacity ? `Capacity ${num(e.capacity)}` : "Capacity to be confirmed", href: href("overview") },
    { icon: Database, label: "Total budget", value: budget ? money(budget) : "—", sub: <>{money(committed)} committed ({committedPct}%)<i className="pc-bar"><i style={{ width: `${Math.min(100, committedPct)}%` }} /></i></>, href: href("money") },
    { icon: TrendingUp, label: "Overall status", value: overdue.length ? "Needs attention" : "On track", sub: `Last updated ${ago(e.updated_at, now, true)}`, href: href("timeline"), tone: overdue.length ? "amber" : "green" },
  ];

  return <PortalShell
    portal={{ title: "Client Portal", subtitle: e.name, thumb }}
    context={{ label: e.name, thumb }}
    nav={[
      { href: href("overview"), label: "Overview", icon: House, active: view === "overview" },
      { href: href("timeline"), label: "Timeline", icon: CalendarDays, active: view === "timeline" },
      { href: href("approvals"), label: "Approvals", icon: SquareCheckBig, active: view === "approvals", badge: pending.length },
      { href: href("documents"), label: "Documents", icon: FileText, active: view === "documents" },
      { href: href("money"), label: "Money", icon: CircleDollarSign, active: view === "money" },
      { href: href("messages"), label: "Messages", icon: MessageSquare, active: view === "messages", badge: unread },
    ]}
    user={{ name: v.link.client_name, detail: `Shared by ${v.organizer || "your organiser"} · link expires ${fmt(v.link.expires_at)}`, signOut: false }}
    links={{ messages: href("messages"), messagesUnread: unread, notifications: href("approvals"), notificationsUnread: pending.length, help: `${href("messages")}#compose` }}
    searchPlaceholder="Search approvals, documents, invoices or messages…"
    create={[{ href: `${href("messages")}#compose`, label: "Message to organiser" }, { href: `${href("messages")}&about=${encodeURIComponent("a change request")}#compose`, label: "Change request" },
      { href: `${href("messages")}&about=${encodeURIComponent("a question")}#compose`, label: "Question" }]}
    sideFooter={<Link href="/" className="pt-side-back"><ArrowLeft aria-hidden="true" />Back to main site</Link>}>
    <div className="pc">
      <header className="pt-head">
        <div className="pt-head-main">
          <h1>{e.name}<PortalChip tone="blue" dot>{statusLabel(e.status)}</PortalChip></h1>
          <div className="pt-meta">
            <span><CalendarDays aria-hidden="true" />{dateRange(e.starts_at, e.ends_at)}</span>
            <span><MapPin aria-hidden="true" />{[e.venue_name, e.city].filter(Boolean).join(", ") || e.location}</span>
            <span><Users aria-hidden="true" />{e.capacity && e.capacity !== e.guest_count ? `${num(e.guest_count)} – ${num(e.capacity)}` : num(e.guest_count)}</span>
            {!!e.tags.length && <span className="pt-tags">{e.tags.slice(0, 3).map(t => <i key={t}>{t}</i>)}</span>}
          </div>
        </div>
        <div className="pt-head-actions">
          {e.slug && e.visibility === "public" && <Link href={`/events/${e.slug}`} className="pt-btn outline">View event page <ChevronRight aria-hidden="true" /></Link>}
          <Link href={`${href("messages")}#compose`} className="pt-btn primary"><MessageSquare aria-hidden="true" />Message organizer <ChevronRight aria-hidden="true" /></Link>
        </div>
      </header>

      {view === "overview" ? <>
        <div className="pc-top">
          <div className="pc-top-main">
            <section className={hero.className} style={{ backgroundImage: `url(${hero.src})` }} aria-label="Welcome">
              <small>Client event portal</small><h2>{e.name}</h2>
              <p>Welcome, {first}. Here’s the latest progress, approvals and key information for your event.</p>
              {e.video_url && <a className="pt-hero-btn" href={e.video_url} target="_blank" rel="noopener noreferrer"><Play aria-hidden="true" />Watch event video</a>}
            </section>
            <div className="pc-kpis">{kpis.map(k => { const Icon = k.icon; return <Link key={k.label} href={k.href} className="pc-kpi">
              <span className="pc-kpi-ic"><Icon aria-hidden="true" /></span>
              <span className="pc-kpi-t"><span>{k.label}</span><strong className={k.tone ? `st ${k.tone}` : ""}>{k.value}</strong><small>{k.sub}</small></span>
              <ChevronRight className="pc-kpi-go" aria-hidden="true" /></Link>; })}</div>
          </div>
          <Link href={href("timeline")} className="pt-panel pc-progress">
            <div className="pc-progress-h"><h2>Progress &amp; readiness</h2><ChevronRight aria-hidden="true" /></div>
            <p className="pc-pct"><b>{readiness}%</b> complete</p>
            <span className="pc-track"><i style={{ width: `${readiness}%` }} /></span>
            <small>{doneN} of {checks.length} key milestones complete</small>
            <ul>{checks.slice(0, 6).map(c => <li key={c.label} className={c.state}><i>{c.state !== "todo" && <Check aria-hidden="true" />}</i>{c.label}</li>)}</ul>
          </Link>
        </div>
        <div className="pc-row">
          <PortalPanel title="Upcoming timeline" action={{ href: href("timeline"), label: "View full timeline" }} className="pc-timeline">{timelineList(timeline.slice(0, 5))}</PortalPanel>
          <PortalPanel title="Recent approvals" action={{ href: href("approvals"), label: "View all" }} className="pc-approvals" extra={!!pending.length && <span className="pc-pending">✦ {pending.length} pending</span>}>
            <ul className="pc-ap-list">{recentApprovals.map(a => approvalRow(a))}{!recentApprovals.length && <li className="pt-empty">No approvals yet.</li>}</ul></PortalPanel>
          <PortalPanel title="Next key actions" action={{ href: href("approvals"), label: "View all" }} className="pc-next">{actionList()}</PortalPanel>
        </div>
        <div className="pc-row">
          <PortalPanel title="Latest documents" action={{ href: href("documents"), label: "View all" }} className="pc-documents">{docList(v.documents.slice(0, 4))}</PortalPanel>
          <PortalPanel title="Invoices & payments" action={{ href: href("money"), label: "View all" }} className="pc-invoices">{invoiceList(v.invoices.slice(0, 4))}</PortalPanel>
          <PortalPanel title="Messages" action={{ href: href("messages"), label: "View all" }} className="pc-messages">{messageList(v.messages.slice(0, 4))}</PortalPanel>
        </div>
      </> : <div className="pc-view">
        {view === "timeline" && <><PortalPanel title="Timeline" className="pc-timeline">{timelineList(timeline)}</PortalPanel>
          <PortalPanel title="Progress & readiness" className="pc-checks"><p className="pc-pct"><b>{readiness}%</b> complete · {doneN} of {checks.length} key milestones</p>
            <ul>{checks.map(c => <li key={c.label} className={c.state}><i>{c.state !== "todo" && <Check aria-hidden="true" />}</i>{c.label}</li>)}</ul>
            {!!overdue.length && <p className="pt-notice amber"><CircleAlert aria-hidden="true" /> {overdue.length} milestone{overdue.length > 1 ? "s are" : " is"} past due — your organiser has been notified.</p>}</PortalPanel></>}
        {view === "approvals" && <><PortalPanel title={`Waiting for you (${pending.length})`} className="pc-approvals"><ul className="pc-ap-list">{pending.map(a => <div key={a.id} id={`ap-${a.id}`}>{approvalRow(a, true)}</div>)}
          {!pending.length && <li className="pt-empty">You’re all caught up.</li>}</ul></PortalPanel>
          <PortalPanel title="Decision history" className="pc-approvals"><ul className="pc-ap-list">{v.approvals.filter(a => a.status !== "pending").map(a => <div key={a.id} id={`ap-${a.id}`}>{approvalRow(a, true)}</div>)}
            {v.approvals.every(a => a.status === "pending") && <li className="pt-empty">No decisions recorded yet.</li>}</ul></PortalPanel></>}
        {view === "documents" && <PortalPanel title="Shared documents" className="pc-documents">{docList(v.documents)}</PortalPanel>}
        {view === "money" && <><PortalPanel title="Budget" className="pc-budget"><dl>
          <div><dt>Total budget</dt><dd>{budget ? money(budget) : "—"}</dd></div><div><dt>Committed with suppliers</dt><dd>{money(committed)} ({committedPct}%)</dd></div>
          <div><dt>Invoiced to you</dt><dd>{money(v.invoices.filter(i => i.status !== "draft").reduce((a, i) => a + Number(i.total), 0))}</dd></div>
          <div><dt>Paid</dt><dd>{money(v.invoices.reduce((a, i) => a + Number(i.amount_paid), 0))}</dd></div></dl></PortalPanel>
          <PortalPanel title="Invoices & payments" className="pc-invoices">{invoiceList(v.invoices)}<p className="pc-note">“Request link” asks your organiser for a secure payment link. Payments are only marked paid once they are received.</p></PortalPanel></>}
        {view === "messages" && <PortalPanel title={`Messages with ${v.organizer || "your organiser"}`} className="pc-messages pc-thread">
          <MessageComposer token={token} initial={typeof sp.about === "string" ? `About ${sp.about.slice(0, 120)}: ` : ""} />
          {messageList(v.messages)}</PortalPanel>}
      </div>}
    </div>
  </PortalShell>;
}
