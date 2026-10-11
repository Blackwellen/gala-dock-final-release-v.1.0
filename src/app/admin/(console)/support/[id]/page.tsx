import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UserPlus, ArrowUpFromLine, SquarePen, ClipboardCheck, ChevronDown, MoreHorizontal, ScanLine, CalendarDays, MapPin, Ticket, OctagonX, Layers, Copy, ExternalLink, PenLine,
  CalendarCheck2, Receipt, UserRound, Headset, Mail, ArrowRight, BadgeCheck, CalendarClock, Paperclip, Smile, Hash, type LucideIcon } from "lucide-react";
import "@/styles/admin-b.css";
import "@/styles/admin-b-support.css";
import "@/styles/admin-b-case.css";
import { Restricted } from "@/components/workspace/kit";
import { ActionButton, ActionForm } from "@/components/workspace/actions";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows, one, isUuid } from "@/lib/workspace/db";
import { money, requestTime } from "@/lib/workspace/format";
import { Head, Pill, Face, Mark, Gauge, TabBar, Img } from "../../_b/kit";
import { Menu, CopyButton } from "../../_b/ui";
import { stamp, ago } from "../../_b/format";
import { assignCase, setCaseStatus, resolveCase, replyCase, requestRefund } from "../../_b/actions";
import { CASE_COLS, typeLabel, updatedAt, sla, roleOf, type Case, type Msg } from "../data";

export const metadata: Metadata = { title: "Support case" };
const ROLE_LABEL: Record<string, string> = { customer: "Customer", support: "Support", provider: "Provider", system: "System" };

export default async function CasePage(props: PageProps<"/admin/support/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!isUuid(id)) notFound();
  const { db, allowed, userId } = await requireAdminPermission("support");
  if (!allowed) return <Restricted area="Support" />;
  const c = await one<Case>(db.from("support_cases").select(CASE_COLS).eq("id", id).maybeSingle());
  if (!c) notFound();
  const r = c.related ?? {}, now = requestTime(), x = sla(c, now);
  const [msgs, reqs, related, assignee] = await Promise.all([
    rows<Msg>(db.from("support_messages").select("id,case_id,author,author_id,body,internal,role,created_at").eq("case_id", id).order("created_at")),
    rows<{ id: string; status: string; amount: number; reason: string; requested_by_name: string; created_at: string }>(db.from("admin_money_requests").select("id,status,amount,reason,requested_by_name,created_at").eq("case_id", id).order("created_at", { ascending: false })),
    r.related_cases?.length ? rows<{ id: string; reference: string; subject: string; status: string }>(db.from("support_cases").select("id,reference,subject,status").in("reference", r.related_cases)) : Promise.resolve([]),
    c.assignee_id ? one<{ avatar_url: string }>(db.from("profiles").select("avatar_url").eq("id", c.assignee_id).maybeSingle()) : Promise.resolve(null),
  ]);
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] as string : "");
  const tab = ["evidence", "communications", "actions", "activity"].includes(s("tab")) ? s("tab") : "case";
  const f = ["customer", "internal", "provider", "system"].includes(s("f")) ? s("f") : "all";
  const compose = s("compose") === "internal" ? "internal" : "customer";
  const base = `/admin/support/${id}`;
  const roleCount = (k: string) => msgs.filter(m => k === "internal" ? m.internal : !m.internal && roleOf(m, c) === k).length;
  // "All" is the shared thread (customer, provider, support replies, system events); internal notes have their own filter.
  const shown = msgs.filter(m => (f === "all" ? !m.internal : f === "internal" ? m.internal : !m.internal && roleOf(m, c) === f));
  const visible = msgs.filter(m => !m.internal);
  const systemN = msgs.filter(m => roleOf(m, c) === "system").length;
  const txId = r.order?.transaction_id ?? r.transaction_id;
  const resolved = c.status === "resolved";
  const ev = r.event, req = r.requester;
  const assigneeAvatar = assignee?.avatar_url || null;
  const elapsed = x.elapsed ?? 0, remaining = x.remainingMin ?? 0, target = (x.targetH ?? 1) * 60;
  const fmtMins = (m: number) => { const a = Math.abs(m), h = Math.floor(a / 60), mm = a % 60; return h ? `${h}h ${mm}m` : `${mm} minutes`; };

  const conversation = <section className="adb-panel adca-conv">
    <div className="adca-conv-h"><h2>Conversation</h2>
      <nav className="adca-seg">{([["all", "All"], ["customer", "Customer"], ["internal", "Internal"], ["provider", "Provider"], ["system", "System"]] as const).map(([k, l]) =>
        <Link key={k} href={`${base}?${new URLSearchParams({ ...(tab !== "case" ? { tab } : {}), ...(k !== "all" ? { f: k } : {}) })}`} scroll={false} className={f === k ? "on" : ""}>{l}{k !== "all" && <b>{roleCount(k)}</b>}</Link>)}</nav>
      <Link className="adb-btn adca-addnote" href={`${base}?compose=internal#reply`}><PenLine aria-hidden="true" />Add note</Link>
      <Menu label="Conversation actions" entries={[{ kind: "link", label: "Export case (CSV)", href: "/admin/support/export" }, { kind: "link", label: "Back to queue", href: "/admin/support" }]} />
    </div>
    <ol className="adca-msgs">{shown.map(m => { const role = roleOf(m, c), mine = m.author_id === userId;
      return <li key={m.id} className={`${role} ${m.internal ? "internal" : ""}`}>
        {role === "system" ? <Mark text="G" size={34} /> : <Face name={m.author} src={role === "customer" ? req?.avatar : m.author_id === c.assignee_id ? assigneeAvatar : null} size={34} />}
        <div><header><b>{m.author}</b><span>{role === "support" ? `Support${mine ? " (You)" : ""}` : ROLE_LABEL[role] ?? role}{m.internal ? " · Internal note" : ""}</span><time>{stamp(m.created_at)}</time>
          <span className="adb-dots" aria-hidden="true"><MoreHorizontal /></span></header>
          <p>{m.body}</p></div></li>; })}
      {!shown.length && <li className="empty"><p>No messages in this view.</p></li>}</ol>
  </section>;

  return <div className="adb adca">
    <Head back={{ href: "/admin/support", label: "Back to Support" }} title={`Case ${c.reference}`} subtitle={c.subject}
      badges={<span className="adca-badges"><Pill status={c.priority} label={`${c.priority[0]!.toUpperCase()}${c.priority.slice(1)} priority`} dot /><Pill status={c.status} dot /></span>}
      actions={<>
        <ActionButton action={assignCase} args={[id]} variant="outline" className="adca-b"><UserPlus aria-hidden="true" />Assign</ActionButton>
        <ActionButton action={setCaseStatus} args={[id, "escalated"]} reason variant="danger" className="adca-b" disabled={c.status === "escalated" || resolved} confirm={{ title: "Escalate case", body: "Moves the case to Tier 2 / the escalated queue.", cta: "Escalate" }}><ArrowUpFromLine aria-hidden="true" />Escalate</ActionButton>
        <Link className="adb-btn blue adca-b" href={`${base}?compose=internal#reply`}><SquarePen aria-hidden="true" />Create internal note</Link>
        <span className="adca-resolve">
          <ActionButton action={resolveCase} args={[id]} reason outcome variant="primary" disabled={resolved} confirm={{ title: "Resolve case", body: "Document the outcome. The case is closed and the resolution is written to the audit log.", cta: "Resolve case" }}><ClipboardCheck aria-hidden="true" />Resolve case</ActionButton>
          <Menu label="More status options" className="adca-caret" trigger={<ChevronDown aria-hidden="true" />} entries={[{ kind: "link", label: "Mark waiting on customer…", href: `${base}?tab=actions` }, { kind: "link", label: "Reopen…", href: `${base}?tab=actions` }]} />
        </span>
        <Menu label="More actions" className="adb-btn adca-more" entries={[{ kind: "link", label: "Back to queue", href: "/admin/support" }, ...(txId ? [{ kind: "link" as const, label: "Open payment", href: `/admin/commerce/transactions/${txId}` }] : [])]} />
      </>} />
    {ev && <div className="adt-event adca-event">
      <Img src={ev.image} alt="" width={80} height={52} />
      <div><b>{ev.name}</b><span><span><ScanLine aria-hidden="true" />{ev.ref}</span><span><CalendarDays aria-hidden="true" />{stamp(c.created_at).split(",")[0]}, {ev.starts ?? ""} – {ev.ends ?? ""}</span><span><MapPin aria-hidden="true" />{ev.location}</span></span></div>
    </div>}
    <div className="adca-grid">
      <div className="adca-main">
        <TabBar active={tab} tabs={[{ key: "case", label: "Case", href: base }, { key: "evidence", label: "Evidence", href: `${base}?tab=evidence` }, { key: "communications", label: "Communications", href: `${base}?tab=communications`, count: visible.length },
          { key: "actions", label: "Actions", href: `${base}?tab=actions`, count: reqs.length + systemN }, { key: "activity", label: "Activity", href: `${base}?tab=activity` }]} />
        {tab === "case" && <>
          <section className="adca-stats">
            <div><i className="blue"><Ticket aria-hidden="true" /></i><span><small>Case status</small><b>{c.status[0]!.toUpperCase() + c.status.slice(1)}</b><em>Since {stamp(c.created_at)}</em></span></div>
            <div><i className="red"><OctagonX aria-hidden="true" /></i><span><small>Priority</small><b className="red">{c.priority[0]!.toUpperCase() + c.priority.slice(1)}</b><em className="red">SLA: {x.target} ({x.left})</em></span></div>
            <div><i className="purple"><Layers aria-hidden="true" /></i><span><small>Category</small><b className="sm">{r.subcategory ?? typeLabel(c)}</b></span></div>
            <div><Face src={assigneeAvatar} name={c.assignee_name || "Unassigned"} size={38} /><span><small>Assigned to</small><b className="sm">{c.assignee_name || "Unassigned"}</b><em>{c.assignee_name ? "support@gala-dock.com" : "Assign to take ownership"}</em></span></div>
          </section>
          <section className="adb-panel adca-sum"><h2>Issue summary</h2>
            <p>{r.summary ?? msgs[0]?.body ?? c.subject}</p>
            <dl>
              <div><dt>Case ID</dt><dd>{c.reference} <CopyButton value={c.reference} /></dd></div>
              <div><dt>Created</dt><dd>{stamp(c.created_at)}</dd></div>
              <div><dt>Updated</dt><dd>{stamp(updatedAt(c))} <span className="adca-ago">{ago(updatedAt(c), now)}</span></dd></div>
              <div><dt>Created by</dt><dd>{r.created_by ?? c.requester_name}</dd></div>
              <div><dt>Source</dt><dd>{r.source ?? "—"}</dd></div>
              {ev && <div><dt>Related event</dt><dd><Link href={`/admin/events?q=${encodeURIComponent(ev.ref)}`}>{ev.name} <ExternalLink aria-hidden="true" /></Link></dd></div>}
            </dl>
          </section>
          {conversation}
        </>}
        {tab === "communications" && conversation}
        {tab === "evidence" && <section className="adb-panel adca-sum"><h2>Evidence</h2><p>No files have been attached to this case. Evidence uploaded by the customer or provider appears here with its scan status.</p>
          <ul className="ads-trail">{ev && <li><b>Event record</b><small>{ev.name} · {ev.ref}</small></li>}{r.order && <li><b>Order</b><small>{r.order.ref} · {r.order.label}</small></li>}</ul></section>}
        {tab === "actions" && <section className="adb-panel adca-sum"><h2>Actions</h2>
          <div className="adca-act-row">
            <ActionButton action={setCaseStatus} args={[id, "waiting"]} reason variant="outline" disabled={c.status === "waiting" || resolved} confirm={{ title: "Mark waiting", body: "Pauses the case while waiting on the customer.", cta: "Mark waiting" }}>Mark waiting on customer</ActionButton>
            <ActionButton action={setCaseStatus} args={[id, "open"]} reason variant="outline" disabled={c.status === "open"} confirm={{ title: "Reopen case", body: "Returns the case to the open queue.", cta: "Reopen" }}>Reopen</ActionButton>
          </div>
          <ul className="ads-trail">{reqs.map(q => <li key={q.id}><b>Refund request · {money(q.amount, "GBP", { cents: true })} · <Pill status={q.status} /></b><small>{stamp(q.created_at)} · {q.requested_by_name} · {q.reason}</small></li>)}
            {msgs.filter(m => roleOf(m, c) === "system").map(m => <li key={m.id}><b>{m.body}</b><small>{stamp(m.created_at)}</small></li>)}
            {!reqs.length && !systemN && <li><small>No actions recorded yet.</small></li>}</ul></section>}
        {tab === "activity" && <section className="adb-panel adca-sum"><h2>Activity</h2><ul className="ads-trail">
          <li><b>Case created</b><small>{stamp(c.created_at)} · {r.created_by ?? c.requester_name}</small></li>
          {msgs.map(m => <li key={m.id}><b>{m.internal ? `Internal note by ${m.author}` : `${ROLE_LABEL[roleOf(m, c)] ?? "Message"}: ${m.author}`}</b><small>{stamp(m.created_at)}</small></li>)}
          {c.resolved_at && <li><b>Resolved: {c.outcome}</b><small>{stamp(c.resolved_at)} · {c.resolution_reason}</small></li>}</ul></section>}
        <section className="adb-panel adca-reply" id="reply">
          <nav className="adca-rtabs"><Link href={`${base}#reply`} className={compose === "customer" ? "on" : ""} scroll={false}>Reply to customer</Link><Link href={`${base}?compose=internal#reply`} className={compose === "internal" ? "on" : ""} scroll={false}>Internal note</Link></nav>
          <ActionForm action={replyCase} className="adca-form" resetOnSuccess>
            <input type="hidden" name="case_id" value={id} />
            <textarea name="body" required rows={2} aria-label={compose === "internal" ? "Internal note" : "Reply to customer"} placeholder={compose === "internal" ? "Internal note — visible to support staff only." : "Type a response... Use @ to mention team members. Drag and drop files to attach."} disabled={resolved} />
            <div className="adca-form-b"><span className="adca-tools"><Paperclip aria-hidden="true" /><Smile aria-hidden="true" /><Hash aria-hidden="true" /></span>
              <select name="mode" defaultValue={compose} aria-label="Message type" className="adb-select"><option value="customer">Customer reply</option><option value="internal">Internal note</option></select>
              <span className="adca-send"><button type="submit" className="adb-btn primary" disabled={resolved}>{compose === "internal" ? "Save note" : "Send reply"}</button><span className="adca-send-c"><ChevronDown aria-hidden="true" /></span></span></div>
          </ActionForm>
        </section>
      </div>

      <aside className="adca-rail">
        <section className="adb-panel adca-sla">
          <div className="adca-sla-h"><h2>SLA &amp; priority</h2><Pill status={c.priority} label={`${c.priority[0]!.toUpperCase()}${c.priority.slice(1)} priority`} dot /></div>
          <div className="adca-sla-b">
            <Gauge value={Math.max(0, Math.min(target, elapsed))} max={target} size={104} stroke={9} color={x.overdue ? "#ec3a52" : "#ec3a52"}><b className="adca-g">{x.overdue ? "Overdue" : x.left.replace(" left", "")}{!x.overdue && <small> left</small>}</b><small className="adca-gs">{x.target} SLA</small></Gauge>
            <dl><div><dt>Created</dt><dd>{stamp(c.created_at)}</dd></div><div><dt>SLA target</dt><dd>{x.targetH ?? "—"} hours</dd></div>
              <div><dt>Time elapsed</dt><dd className="red">{fmtMins(elapsed).replace(" minutes", "m")}</dd></div><div><dt>Time remaining</dt><dd className="red">{x.overdue ? `${fmtMins(remaining)} overdue` : fmtMins(remaining)}</dd></div></dl>
          </div>
        </section>
        <section className="adb-panel adca-linked"><h2>Linked records</h2>
          <ul>
            {ev && <LinkRow icon={CalendarCheck2} label="Event" img={ev.image} title={ev.name} sub={ev.ref} href={`/admin/events?q=${encodeURIComponent(ev.ref)}`} />}
            {r.order && <LinkRow icon={Receipt} label="Order" title={r.order.ref} sub={r.order.label} href={txId ? `/admin/commerce/transactions/${txId}` : `/admin/commerce?q=${encodeURIComponent(r.order.ref)}`} tile />}
            {req && <LinkRow icon={UserRound} label="Customer" avatar={req.avatar} title={req.name} sub={req.email ?? ""} href={`/admin/users?q=${encodeURIComponent(req.email ?? req.name)}`} />}
            {r.provider && <LinkRow icon={Headset} label="Organizer" mark title={r.provider.name} sub={r.provider.ref} href={c.workspace_id ? `/admin/workspaces/${c.workspace_id}` : `/admin/workspaces?q=${encodeURIComponent(r.provider.name)}`} />}
            {r.venue && <LinkRow icon={Mail} label="Venue" img={r.venue.image} title={r.venue.name} sub={r.venue.ref} href={`/admin/marketplace?q=${encodeURIComponent(r.venue.name)}`} />}
            {!ev && !r.order && !req && <li className="adb-none">No linked records.</li>}
          </ul>
        </section>
        <section className="adb-panel adca-res">
          <div className="adb-sec-h"><h2>Proposed resolution {r.proposed?.eligible && <Pill status="paid" label={r.proposed.eligible} dot />}</h2><Link className="adb-btn ads-edit" href={`${base}?tab=actions`}><PenLine aria-hidden="true" />Edit</Link></div>
          {r.proposed ? <dl className="adb-kv adca-res-kv"><div><dt>Action</dt><dd>{r.proposed.action}</dd></div><div><dt>Amount</dt><dd>{r.proposed.amount_label ?? money(r.proposed.amount, "GBP", { cents: true })}</dd></div>
            <div><dt>Reason</dt><dd>{r.proposed.reason}</dd></div><div><dt>Policy</dt><dd>{r.proposed.policy}</dd></div><div><dt>Approval</dt><dd>{r.proposed.approval}</dd></div></dl>
            : <p className="adb-none">No resolution proposed yet.</p>}
          <ActionButton action={requestRefund} args={[txId ?? "", Number(r.proposed?.amount ?? c.amount ?? 0), id]} reason variant="primary" className="adca-refund" disabled={!txId || !(r.proposed?.amount ?? c.amount) || resolved}
            title={!txId ? "No linked payment on this case" : undefined}
            confirm={{ title: "Process refund via Commerce", body: `Records a pending refund request of ${money(Number(r.proposed?.amount ?? c.amount ?? 0), "GBP", { cents: true })} against ${r.order?.ref ?? "the linked payment"}. Stripe executes refunds — no money moves from this console, and the request stays pending until processed.`, cta: "Record refund request" }}>
            <BadgeCheck aria-hidden="true" />Process refund (via Commerce)</ActionButton>
          {reqs.length > 0 && <p className="adca-req">Refund request {reqs[0]!.status} · {money(reqs[0]!.amount, "GBP", { cents: true })} · {ago(reqs[0]!.created_at, now)}</p>}
          <div className="adca-res-b"><Link className="adb-btn blue" href={`/admin/events?q=${encodeURIComponent(ev?.location?.split(",")[1]?.trim() ?? "London")}`}><CalendarClock aria-hidden="true" />Find replacement event for customer</Link>
            <Menu label="More resolution options" entries={[{ kind: "link", label: "View payouts & requests", href: "/admin/commerce/payouts" }]} /></div>
        </section>
        <section className="adb-panel adca-rel">
          <div className="adb-sec-h"><h2>Related cases</h2><Link className="adb-link" href={`/admin/support?tab=resolved&q=${encodeURIComponent(c.requester_name)}`}>View all <ArrowRight aria-hidden="true" /></Link></div>
          {related.length ? <ul>{related.map(rc => <li key={rc.id}><Link href={`/admin/support/${rc.id}`}>{rc.reference}</Link><span>{rc.subject}</span><Pill status={rc.status === "resolved" ? "closed" : rc.status} label={rc.status === "resolved" ? "Closed" : undefined} /></li>)}</ul> : <p className="adb-none">No related cases.</p>}
        </section>
      </aside>
    </div>
  </div>;
}

function LinkRow({ icon: Icon, label, title, sub, href, img, avatar, mark, tile }: { icon: LucideIcon; label: string; title: string; sub: string; href: string; img?: string; avatar?: string; mark?: boolean; tile?: boolean }) {
  return <li><Icon aria-hidden="true" className="adca-li" /><span className="adca-ll">{label}</span>
    {img ? <Img src={img} alt="" width={34} height={30} /> : avatar !== undefined ? <Face src={avatar} name={title} size={32} /> : mark ? <Mark text="G" size={32} /> : tile ? <span className="adca-tile"><Copy aria-hidden="true" /></span> : <span />}
    <span className="adca-lt"><b>{title}</b><small>{sub}</small></span><Link className="adb-link" href={href}>View <ArrowRight aria-hidden="true" /></Link></li>;
}
