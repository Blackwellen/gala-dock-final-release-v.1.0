import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Headset, Clock3, TriangleAlert, Upload, BadgeCheck, Plus, ChevronDown, Filter, ArrowRight, PenLine, ExternalLink, Reply, UserPlus, SquareArrowOutUpRight,
  RefreshCw, Store, Building2, Users, Search, Sparkles, MessageSquareText, StickyNote, ArrowUpFromLine, CirclePlus, Receipt, UserRound, Timer, type LucideIcon, ShieldAlert } from "lucide-react";
import "@/styles/admin-b.css";
import "@/styles/admin-b-support.css";
import { Donut, Restricted } from "@/components/workspace/kit";
import { ActionButton, ActionForm } from "@/components/workspace/actions";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows } from "@/lib/workspace/db";
import { delta, requestTime } from "@/lib/workspace/format";
import { Head, Kpi, TabBar, Pill, Pager, Face, Mark, buckets, cumulative, Img } from "../_b/kit";
import { ParamSelect, SearchParam, Menu, RowCheck } from "../_b/ui";
import { stamp, ago, dur } from "../_b/format";
import { assignCase, setCaseStatus, requestRefund, createSupportCase } from "../_b/actions";
import { loadCases, updatedAt, typeLabel, TYPE_TONE, sla, roleOf, type Case, type Msg } from "./data";

export const metadata: Metadata = { title: "Support" };
const PRI: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export default async function SupportPage(props: PageProps<"/admin/support">) {
  const sp = await props.searchParams;
  const { db, allowed, permissions } = await requireAdminPermission("support");
  if (!allowed) return <Restricted area="Support" />;
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] as string : "");
  const now = requestTime(), W = 7 * 864e5;
  const all = await loadCases(db);
  const [firstReplies, profiles, runs, flagged] = await Promise.all([
    rows<{ case_id: string; created_at: string }>(db.from("support_messages").select("case_id,created_at").eq("internal", false).neq("role", "customer").neq("role", "system").gte("created_at", new Date(now - 2 * W - 864e5).toISOString()).order("created_at")),
    rows<{ id: string; avatar_url: string }>(db.from("profiles").select("id,avatar_url").in("id", [...new Set(all.map(c => c.assignee_id).filter(Boolean))] as string[])),
    permissions.has("agent_ops") ? rows<{ id: string }>(db.from("agent_runs").select("id").eq("surface", "admin").eq("status", "running")) : Promise.resolve([]),
    permissions.has("trust") ? rows<{ id: string }>(db.from("trust_cases").select("id").eq("queue", "reliability").in("status", ["open", "in_review"]).eq("subject_type", "listing")) : Promise.resolve(null),
  ]);
  const avatar = (id: string | null) => profiles.find(p => p.id === id)?.avatar_url || null;
  const first = new Map<string, number>();
  for (const r of firstReplies) if (!first.has(r.case_id)) first.set(r.case_id, new Date(r.created_at).getTime());
  const created = (c: Case) => new Date(c.created_at).getTime();
  const win = (c: Case, a: number, b: number) => created(c) >= a && created(c) < b;
  const respMins = (a: number, b: number) => { const l = all.filter(c => win(c, a, b) && first.has(c.id)).map(c => (first.get(c.id)! - created(c)) / 60000).filter(x => x >= 0); return l.length ? l.reduce((x, y) => x + y, 0) / l.length : 0; };
  const active = all.filter(c => c.status !== "resolved");
  const openN = all.filter(c => c.status === "open").length, waitingN = all.filter(c => c.status === "waiting").length, escN = all.filter(c => c.status === "escalated").length;
  const atRisk = active.filter(c => { const x = sla(c, now); return x.risk || x.overdue; });
  const resolved7 = all.filter(c => c.resolved_at && new Date(c.resolved_at).getTime() >= now - W), resolvedPrev = all.filter(c => c.resolved_at && new Date(c.resolved_at).getTime() >= now - 2 * W && new Date(c.resolved_at).getTime() < now - W);
  const rNow = respMins(now - W, now + 1), rPrev = respMins(now - 2 * W, now - W);
  const series = (l: Case[], at: (c: Case) => string = c => c.created_at) => cumulative(buckets(l, at, () => 1, 14, 10, now));

  const tab = ["waiting", "escalated", "resolved"].includes(s("tab")) ? s("tab") : "open";
  const q = s("q").toLowerCase(), sort = s("sort") || "newest", type = s("type"), pri = s("priority");
  // "Open" is the whole unresolved queue (open, waiting and escalated); the other tabs narrow it.
  const list = all.filter(c => (tab === "open" ? c.status !== "resolved" : c.status === tab) && (!type || typeLabel(c) === type) && (!pri || c.priority === pri)
    && (!q || `${c.reference} ${c.subject} ${c.requester_name} ${c.related?.requester?.email ?? ""} ${c.related?.subject_ref?.label ?? ""} ${c.related?.subject_ref?.ref ?? ""} ${c.related?.order?.ref ?? ""}`.toLowerCase().includes(q)))
    .sort((a, b) => sort === "oldest" ? created(a) - created(b) : sort === "priority" ? PRI[a.priority]! - PRI[b.priority]! || created(b) - created(a)
      : sort === "sla" ? new Date(a.sla_due_at ?? 0).getTime() - new Date(b.sla_due_at ?? 0).getTime() : new Date(updatedAt(b)).getTime() - new Date(updatedAt(a)).getTime());
  const per = 10, page = Math.max(1, Number(s("page")) || 1);
  const qp = (extra: Record<string, string | number>) => { const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]); for (const [k, v] of Object.entries(extra)) { if (v === "") u.delete(k); else u.set(k, String(v)); } const str = u.toString(); return `/admin/support${str ? `?${str}` : ""}`; };
  const sel = all.find(c => c.id === s("case")) ?? list[(page - 1) * per];
  const msgs = sel ? await rows<Msg>(db.from("support_messages").select("id,case_id,author,author_id,body,internal,role,created_at").eq("case_id", sel.id).order("created_at", { ascending: false })) : [];

  // Bottom panels (all computed from cases).
  const venueRep = active.filter(c => c.category === "no_show").length, supplierRep = active.filter(c => c.category === "emergency").length;
  const recent = all.filter(c => win(c, now - W, now + 1));
  const within = recent.filter(c => { const x = sla(c, now); return !x.overdue && !x.risk; }).length, risk = recent.filter(c => sla(c, now).risk).length, over = recent.filter(c => sla(c, now).overdue).length;
  const tot = within + risk + over || 1;
  const byWs = Object.values(active.filter(c => ["no_show", "emergency", "booking"].includes(c.category) && c.workspace_id).reduce<Record<string, number>>((a, c) => { a[c.workspace_id!] = (a[c.workspace_id!] ?? 0) + 1; return a; }, {})).sort((a, b) => b - a)[0] ?? 0;
  const refundNow = all.filter(c => ["refund", "payment"].includes(c.category) && win(c, now - W, now + 1)).length, refundPrev = all.filter(c => ["refund", "payment"].includes(c.category) && win(c, now - 2 * W, now - W)).length;
  const byEvent = Object.entries(active.reduce<Record<string, number>>((a, c) => { const l = c.related?.subject_ref?.label; if (l && c.related?.subject_ref?.ref?.startsWith("EVT")) a[l] = (a[l] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1])[0];
  const insights: [string, string][] = [
    ...(byWs > 1 ? [["green", `${byWs} cases likely related to the same provider no-show.`] as [string, string]] : []),
    ...(refundPrev ? [[refundNow >= refundPrev ? "red" : "green", `Refund request volume is ${Math.abs(delta(refundNow, refundPrev) ?? 0)}% ${refundNow >= refundPrev ? "higher" : "lower"} this week.`] as [string, string]] : []),
    ...(byEvent ? [["amber", `Consider proactive communication for ${byEvent[0]}: ${byEvent[1]} open cases mention this event.`] as [string, string]] : []),
    ...(flagged ? [["amber", `${flagged.length} listings flagged for repeated late responses.`] as [string, string]] : []),
  ];

  return <div className="adb adsu">
    <Head title="Support" subtitle="Resolve booking, ticket, payment and platform issues."
      actions={<>
        {permissions.has("support.break_glass_conversation.read") && <Link className="adb-btn" href="/admin/conversations"><ShieldAlert aria-hidden="true" />Break-glass access</Link>}
        <Link className="adb-btn" href="/admin/support/export"><Upload aria-hidden="true" />Export</Link>
        <details className="adb-pop"><summary className="adb-btn primary"><Plus aria-hidden="true" />New support case<ChevronDown aria-hidden="true" /></summary>
          <div className="adb-pop-body"><h3>New support case</h3><NewCaseForm /></div></details>
      </>} />
    <div className="adsu-bar">
      <TabBar active={tab} tabs={[{ key: "open", label: "Open", href: "/admin/support", count: active.length }, { key: "waiting", label: "Waiting", href: "/admin/support?tab=waiting", count: waitingN },
        { key: "escalated", label: "Escalated", href: "/admin/support?tab=escalated", count: escN }, { key: "resolved", label: "Resolved", href: "/admin/support?tab=resolved" }]} />
      <Suspense><SearchParam placeholder="Search cases, customers, events, orders..." /></Suspense>
      <details className="adb-pop"><summary className="adb-btn adsu-filters"><Filter aria-hidden="true" />Filters</summary>
        <div className="adb-pop-body adb-form"><h3>Filter cases</h3>
          <label>Type<Suspense><ParamSelect param="type" label="Type" value={type} options={[{ value: "", label: "All types" }, ...Object.keys(TYPE_TONE).map(t => ({ value: t, label: t }))]} /></Suspense></label>
          <label>Priority<Suspense><ParamSelect param="priority" label="Priority" value={pri} options={[{ value: "", label: "All priorities" }, { value: "urgent", label: "Urgent" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]} /></Suspense></label>
        </div></details>
      <Suspense><ParamSelect param="sort" label="Sort" className="adb-select adsu-sort" value={sort} options={[{ value: "newest", label: "Sort: Newest" }, { value: "oldest", label: "Sort: Oldest" }, { value: "priority", label: "Sort: Priority" }, { value: "sla", label: "Sort: SLA due" }]} /></Suspense>
    </div>
    <div className="adsu-grid">
      <div className="adsu-main">
        <section className="adb-kpis adsu-kpis">
          <Kpi icon={Headset} tone="blue" label="Open cases" value={openN} delta={delta(all.filter(c => c.status === "open" && win(c, now - W, now + 1)).length, all.filter(c => win(c, now - 2 * W, now - W)).length)} suffix="vs last 7 days" invert series={series(all.filter(c => c.status === "open"))} />
          <Kpi icon={Clock3} tone="green" label="Avg. response time" value={rNow ? dur(rNow) : "—"} delta={rPrev && rNow ? delta(rNow, rPrev) : null} suffix="vs last 7 days" invert series={series(all.filter(c => first.has(c.id)))} />
          <Kpi icon={TriangleAlert} tone="red" label="SLA at risk" value={atRisk.length} note={`${atRisk.filter(c => sla(c, now).overdue).length} overdue`} series={series(atRisk, c => c.sla_due_at ?? c.created_at)} />
          <Kpi icon={ArrowUpFromLine} tone="blue" label="Escalated" value={escN} delta={delta(all.filter(c => c.status === "escalated" && win(c, now - W, now + 1)).length, all.filter(c => c.status === "escalated" && win(c, now - 2 * W, now - W)).length)} invert note="" series={series(all.filter(c => c.status === "escalated"))} />
          <Kpi icon={BadgeCheck} tone="green" label="Resolved (7d)" value={resolved7.length} delta={delta(resolved7.length, resolvedPrev.length)} suffix="vs last 7 days" series={series(resolved7, c => c.resolved_at ?? c.created_at)} />
        </section>
        <div className="adb-table-wrap"><table className="adb-table adsu-table">
          <colgroup>{[34, 62, 100, 68, 128, 150, 52, 54, 64, 56, 66, 36].map((w, i) => <col key={i} style={{ width: `${(w / 880) * 100}%` }} />)}</colgroup>
          <thead><tr><th><RowCheck label="Select all" /></th><th>ID</th><th>Subject</th><th>Type</th><th>Related to</th><th>Customer / Workspace</th><th>Priority</th><th>Status</th><th>SLA</th><th>Assigned</th><th>Updated</th><th aria-label="Actions" /></tr></thead>
          <tbody>{list.slice((page - 1) * per, page * per).map(c => { const t = typeLabel(c), x = sla(c, now), ref = c.related?.subject_ref, req = c.related?.requester;
            return <tr key={c.id} className={sel?.id === c.id ? "sel" : ""}>
              <td><RowCheck label={`Select ${c.reference}`} defaultChecked={sel?.id === c.id} /></td>
              <td className="adsu-muted">{c.reference}</td>
              <td className="adsu-subj"><Link href={`/admin/support/${c.id}`}>{c.subject}</Link></td>
              <td><span className={`adb-tag ${TYPE_TONE[t] ?? "grey"}`}>{t}</span></td>
              <td><span className="adb-cell">{ref?.image ? <Img className="adb-thumb" src={ref.image} alt="" width={32} height={30} /> : <span className="adsu-ico">{ref?.icon === "user" ? <UserRound aria-hidden="true" /> : <Receipt aria-hidden="true" />}</span>}
                <span><b>{ref?.label ?? "—"}</b>{ref?.ref && <small>{ref.ref}</small>}</span></span></td>
              <td><span className="adb-cell"><Face src={req?.avatar} name={req?.name ?? c.requester_name} size={28} /><span><b>{req?.name ?? c.requester_name}</b><small>{req?.email ?? ""}</small></span></span></td>
              <td><Pill status={c.priority} /></td>
              <td><Pill status={c.status} /></td>
              <td className={`adsu-sla ${x.overdue ? "over" : ""}`}><b>{x.target}</b><small>{x.overdue ? "overdue" : `(${x.left})`}</small></td>
              <td><Face src={avatar(c.assignee_id)} name={c.assignee_name || "Unassigned"} size={28} /></td>
              <td className="adsu-muted">{ago(updatedAt(c), now)}</td>
              <td><Menu label={`Actions for ${c.reference}`} entries={[{ kind: "link", label: "Preview", href: qp({ case: c.id }) }, { kind: "link", label: "Open case", href: `/admin/support/${c.id}` }, { kind: "action", label: "Assign to me", run: assignCase.bind(null, c.id) }]} /></td>
            </tr>; })}</tbody>
        </table></div>
        {!list.length && <p className="adb-none">No {tab} cases{q ? " match your search" : ""}.</p>}
        <Pager total={list.length} page={page} per={per} href={p => qp({ page: p, case: "" })} />
        <div className="adsu-bottom">
          <section className="adb-panel adsu-em">
            <div className="adb-sec-h"><h2>Emergency replacements</h2><Link className="adb-link" href="/admin/support?tab=escalated">View all <ArrowRight aria-hidden="true" /></Link></div>
            <ul>
              <li><i><Building2 aria-hidden="true" /></i><span><b>Venue replacement search</b><small>Find alternative venues for cancelled/no-show events.</small></span>{venueRep ? <em>{venueRep} active</em> : <em className="off">None</em>}</li>
              <li><i><Users aria-hidden="true" /></i><span><b>Supplier replacement search</b><small>Find alternative suppliers for no-show events.</small></span>{supplierRep ? <em>{supplierRep} active</em> : <em className="off">None</em>}</li>
              <li><i><Search aria-hidden="true" /></i><span><b>Live search &amp; suggestions <u>AI</u></b><small>{runs.length ? `Gala Agent is running ${runs.length} search${runs.length === 1 ? "" : "es"} for alternatives.` : "Gala Agent is idle."}</small></span></li>
            </ul>
          </section>
          <section className="adb-panel adsu-slap">
            <div className="adb-sec-h"><h2>SLA performance (7 days)</h2><Link className="adb-link" href="/admin/support?sort=sla">View details <ArrowRight aria-hidden="true" /></Link></div>
            <div className="adsu-sla-b"><Donut size={98} thickness={14} parts={[{ label: "Within SLA", value: within, tone: "blue" }, { label: "At risk", value: risk, tone: "orange" }, { label: "Overdue", value: over, tone: "red" }]} center={<><b>{Math.round((100 * within) / tot)}%</b><small>Within SLA</small></>} />
              <ul>{([["Within SLA", within, "#16a46c"], ["At risk", risk, "#f5a524"], ["Overdue", over, "#ec3a52"]] as const).map(([l, v, col]) => <li key={l}><i style={{ background: col }} />{l}<b>{Math.round((100 * v) / tot)}%</b></li>)}</ul></div>
          </section>
          <section className="adb-panel adsu-ai">
            <div className="adb-sec-h"><h2>Gala Agent insights <span className="adsu-new">New</span></h2><Link className="adb-link" href="/admin/agent-integrations">View all <ArrowRight aria-hidden="true" /></Link></div>
            <ul>{insights.length ? insights.map(([tone, text]) => <li key={text}><i className={tone} />{text}</li>) : <li><i className="green" />No patterns detected in open cases.</li>}</ul>
            <Link className="adb-btn adsu-gen" href="/admin/agent-integrations?tab=runs">Generate full analysis <ArrowRight aria-hidden="true" /></Link>
          </section>
        </div>
      </div>
      {sel ? <Preview c={sel} msgs={msgs} now={now} avatar={avatar(sel.assignee_id)} tab={s("ctab") || "overview"} qp={qp} /> : <aside className="adb-panel adsu-rail"><p className="adb-none">No case selected.</p></aside>}
    </div>
  </div>;
}

function NewCaseForm() {
  return <ActionForm action={createSupportCase} className="adb-form">
    <label>Subject<input name="subject" required minLength={3} /></label>
    <label>Category<select name="category" defaultValue="booking">{["booking", "ticketing", "payment", "account", "technical", "no_show", "emergency", "refund", "other"].map(c => <option key={c} value={c}>{c.replace("_", " ")}</option>)}</select></label>
    <label>Priority<select name="priority" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
    <label>Requester name<input name="requester" required /></label>
    <label>Requester email<input name="email" type="email" /></label>
    <label>Internal note<textarea name="body" rows={3} /></label>
    <button className="adb-btn primary" type="submit">Create case</button>
  </ActionForm>;
}

const TL_ICON: Record<string, [LucideIcon, string]> = { customer: [MessageSquareText, "blue"], support: [StickyNote, "amber"], system: [RefreshCw, "red"], provider: [Store, "purple"] };
function Preview({ c, msgs, now, avatar, tab, qp }: { c: Case; msgs: Msg[]; now: number; avatar: string | null; tab: string; qp: (e: Record<string, string>) => string }) {
  const x = sla(c, now), r = c.related ?? {}, req = r.requester;
  const linked = [r.event, r.order, r.provider].filter(Boolean).length;
  const txId = r.order?.transaction_id ?? r.transaction_id;
  const tl = msgs.slice(0, 4);
  return <aside className="adsu-rail">
    <section className="adb-panel adsu-prev">
      <div className="adsu-prev-h"><span className="adsu-ref"><SquareArrowOutUpRight aria-hidden="true" />{c.reference}</span><Pill status={c.priority} label={`${c.priority[0]!.toUpperCase()}${c.priority.slice(1)} priority`} dot />
        <span className="adsu-st"><Pill status={c.status} label={<>{c.status[0]!.toUpperCase() + c.status.slice(1)}<ChevronDown aria-hidden="true" /></>} /></span>
        <Menu label="Case actions" entries={[{ kind: "link", label: "Open full case", href: `/admin/support/${c.id}` }, { kind: "action", label: "Assign to me", run: assignCase.bind(null, c.id) }]} /></div>
      <h2 className="adsu-prev-t">{c.subject}</h2>
      {r.summary && <p className="adsu-prev-s">{r.summary.split(". ")[0]}.</p>}
      <nav className="ads-ctabs adsu-ctabs">{([["overview", "Overview"], ["messages", "Messages", msgs.length], ["linked", "Linked records", linked], ["activity", "Activity"], ["notes", "Notes"]] as [string, string, number?][]).map(([k, l, n]) =>
        <Link key={k} href={qp({ case: c.id, ctab: k === "overview" ? "" : k })} scroll={false} className={tab === k ? "on" : ""}>{l}{n !== undefined && <b>{n}</b>}</Link>)}</nav>
      {tab === "overview" || tab === "linked" ? <>
        <div className="adb-sec-h adsu-cd"><h2>Case details</h2><Link className="adb-btn ads-edit" href={`/admin/support/${c.id}`}><PenLine aria-hidden="true" />Edit</Link></div>
        <dl className="adb-kv adsu-kv">
          <div><dt>Case ID</dt><dd>{c.reference}</dd></div><div><dt>Type</dt><dd>{typeLabel(c)}</dd></div>
          <div><dt>Category</dt><dd>{r.subcategory ?? c.category.replace("_", " ")}</dd></div>
          <div><dt>Status</dt><dd><Pill status={c.status} /></dd></div><div><dt>Priority</dt><dd><Pill status={c.priority} /></dd></div>
          <div><dt>Created</dt><dd>{stamp(c.created_at)}</dd></div><div><dt>Updated</dt><dd>{stamp(updatedAt(c))} ({ago(updatedAt(c), now)})</dd></div>
          <div><dt>SLA</dt><dd className={x.overdue || x.risk ? "red" : ""}><Timer aria-hidden="true" />{x.target} ({x.left})</dd></div>
          <div className="pad"><dt>Assigned to</dt><dd className="adsu-who"><Face src={avatar} name={c.assignee_name || "Unassigned"} size={24} />{c.assignee_name || "Unassigned"}</dd></div>
          <div className="pad"><dt>Customer</dt><dd className="adsu-who"><Face src={req?.avatar} name={req?.name ?? c.requester_name} size={24} /><span><b>{req?.name ?? c.requester_name}</b><small>{req?.email}</small></span></dd></div>
          {r.event && <div className="pad"><dt>Related event</dt><dd className="adsu-who"><Img src={r.event.image} alt="" width={26} height={22} /><Link href={`/admin/events?q=${encodeURIComponent(r.event.ref)}`}>{r.venue?.name ?? r.event.name} ({r.event.ref}) <ExternalLink aria-hidden="true" /></Link></dd></div>}
          {r.order && <div><dt>Related booking</dt><dd className="adsu-who"><Receipt aria-hidden="true" className="adsu-oi" />{txId ? <Link href={`/admin/commerce/transactions/${txId}`}>{r.order.ref} <ExternalLink aria-hidden="true" /></Link> : r.order.ref}</dd></div>}
          {r.provider && <div><dt>Related provider</dt><dd className="adsu-who"><Mark text="G" size={24} />{c.workspace_id ? <Link href={`/admin/workspaces/${c.workspace_id}`}>{r.provider.name} ({r.provider.ref}) <ExternalLink aria-hidden="true" /></Link> : `${r.provider.name} (${r.provider.ref})`}</dd></div>}
        </dl></>
        : <ul className="ads-trail">{(tab === "notes" ? msgs.filter(m => m.internal) : msgs).map(m => <li key={m.id}><b>{m.author}{m.internal ? " · internal" : ""}</b><small>{stamp(m.created_at)}</small><p>{m.body}</p></li>)}
          {!msgs.length && <li><small>Nothing yet.</small></li>}</ul>}
    </section>
    <section className="adb-panel adsu-qa"><h2>Quick actions</h2>
      <div className="adsu-qa-g">
        <Link className="adb-btn" href={`/admin/support/${c.id}#reply`}><Reply aria-hidden="true" />Reply to customer</Link>
        <ActionButton action={assignCase} args={[c.id]} variant="outline"><UserPlus aria-hidden="true" />Assign</ActionButton>
        <ActionButton action={setCaseStatus} args={[c.id, "escalated"]} reason variant="outline" disabled={c.status === "escalated" || c.status === "resolved"} confirm={{ title: "Escalate case", body: "Moves the case to the escalated queue (Tier 2).", cta: "Escalate" }}><ArrowUpFromLine aria-hidden="true" />Escalate</ActionButton>
      </div>
      <div className="adsu-qa-g2">
        <ActionButton action={requestRefund} args={[txId ?? "", Number(r.proposed?.amount ?? c.amount ?? 0), c.id]} reason variant="outline" className="adsu-refund" disabled={!txId || !(r.proposed?.amount ?? c.amount)}
          title={!txId ? "No linked payment on this case" : undefined} confirm={{ title: "Process refund via Commerce", body: "Records a pending refund request against the linked payment. Stripe executes refunds; no money moves from this console.", cta: "Record refund request" }}><CirclePlus aria-hidden="true" />Process refund (via Commerce)</ActionButton>
        <Link className="adb-btn adsu-find" href={`/admin/marketplace?q=${encodeURIComponent(r.provider?.name ?? r.event?.location ?? "")}`}><Search aria-hidden="true" />Find replacement provider</Link>
        <Menu label="More quick actions" entries={[{ kind: "link", label: "Open full case", href: `/admin/support/${c.id}` }, ...(txId ? [{ kind: "link" as const, label: "Open payment", href: `/admin/commerce/transactions/${txId}` }] : [])]} />
      </div>
    </section>
    <section className="adb-panel adsu-tl">
      <div className="adb-sec-h"><h2>Case timeline</h2><Link className="adb-link" href={`/admin/support/${c.id}?tab=activity`}>View all <ArrowRight aria-hidden="true" /></Link></div>
      <ol>{tl.map(m => { const role = roleOf(m, c), [Icon, tone] = TL_ICON[role] ?? TL_ICON.support!;
        const title = role === "customer" ? "Customer replied" : role === "system" ? m.body.split(".")[0] : m.internal ? `Internal note added by ${m.author}` : `${m.author} replied`;
        return <li key={m.id}><time>{ago(m.created_at, now)}</time><i className={tone}><Icon aria-hidden="true" /></i><span><b>{title}</b><small>{m.body.replace(/\n/g, " ").slice(0, 70)}</small></span></li>; })}
        <li><time>{ago(c.created_at, now)}</time><i className="green"><Sparkles aria-hidden="true" /></i><span><b>Customer created case</b><small>{c.subject}</small></span></li></ol>
    </section>
  </aside>;
}
