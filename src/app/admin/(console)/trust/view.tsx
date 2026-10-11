import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, BookmarkCheck, ShieldCheck, Store, TriangleAlert, MessageCircleQuestion, Upload, Plus, ChevronDown, Filter, SquareArrowOutUpRight, ExternalLink, PenLine, ArrowRight,
  ShoppingCart, CreditCard, UserRound, Clock3, CircleAlert, UserPlus, FileSearch, CircleX, CircleCheck, type LucideIcon } from "lucide-react";
import { Restricted } from "@/components/workspace/kit";
import { ActionButton, ActionForm } from "@/components/workspace/actions";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows } from "@/lib/workspace/db";
import { delta, requestTime } from "@/lib/workspace/format";
import { Head, Kpi, TabBar, Pill, Pager, Face, Mark, Gauge, buckets, cumulative, Img } from "../_b/kit";
import { ParamSelect, SearchParam, Menu, RowCheck } from "../_b/ui";
import { stamp, ago } from "../_b/format";
import { assignTrust, requestEvidence, decideTrust, createTrustCase, addNote } from "../_b/actions";

type Evidence = { kind: string; label: string; level?: string; icon?: string; at?: string; by?: string };
type Case = {
  id: string; reference: string; queue: string; category: string; subject_type: string; subject_id: string | null; subject_name: string; risk_score: number; status: string; reason: string;
  evidence: Evidence[]; decision: string | null; decided_at: string | null; created_at: string; updated_at: string; assignee_name: string; assignee_id: string | null;
  related: { subject_ref?: string; image?: string | null; related_to?: string; stage?: string; assignee_avatar?: string; orders?: number; event?: { name: string; ref: string; image: string; date_label?: string; venue?: string } };
};
const QUEUES: Record<string, [string, string]> = { verification: ["Verification", "blue"], reliability: ["Reliability", "purple"], fraud: ["Fraud/Abuse", "red"], appeal: ["Appeals", "green"] };
const STAGE: Record<string, [string, string]> = { investigating: ["investigating", "Investigating"], awaiting_info: ["awaiting_info", "Awaiting info"], info_requested: ["info_requested", "Info requested"], monitoring: ["monitoring", "Monitoring"] };
const isDispute = (c: Case) => /chargeback|dispute/i.test(c.category);
function stageOf(c: Case): [string, string] {
  if (c.status === "actioned") return ["resolved", "Resolved"];
  if (c.status === "dismissed") return c.queue === "verification" ? ["approved", "Approved"] : ["dismissed", "Dismissed"];
  if (c.status === "appealed") return ["appealed", "Appealed"];
  const st = c.related?.stage ?? "";
  if (c.status === "in_review" && (c.evidence ?? []).some(e => e.kind === "request") && !STAGE[st]) return ["info_requested", "Info requested"];
  if (STAGE[st]) return STAGE[st];
  return c.status === "open" ? ["open", "Open"] : ["under_review", "Under review"];
}
const riskOf = (r: number): [string, string] => r >= 70 ? ["high", "High"] : r >= 40 ? ["medium", "Medium"] : ["low", "Low"];
const IND: Record<string, LucideIcon> = { cart: ShoppingCart, card: CreditCard, user: UserRound, clock: Clock3, alert: CircleAlert };

export async function TrustView({ sp, disputes = false }: { sp: Record<string, string | string[] | undefined>; disputes?: boolean }) {
  const { db, allowed, userId } = await requireAdminPermission("trust");
  if (!allowed) return <Restricted area="Trust & Safety" />;
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] as string : "");
  const now = requestTime();
  const all = await rows<Case>(db.from("trust_cases").select("id,reference,queue,category,subject_type,subject_id,subject_name,risk_score,status,reason,evidence,decision,decided_at,created_at,updated_at,assignee_name,assignee_id,related")
    .order("updated_at", { ascending: false }).limit(2000));
  const days = { "7d": 7, "30d": 30, "90d": 90 }[s("range") || "30d"] ?? 30;
  const inP = (c: Case, from: number, to: number) => { const t = new Date(c.created_at).getTime(); return t >= from && t < to; };
  const cur = (c: Case) => inP(c, now - days * 864e5, now + 1), prev = (c: Case) => inP(c, now - 2 * days * 864e5, now - days * 864e5);
  const open = (c: Case) => c.status === "open" || c.status === "in_review";
  const k = (f: (c: Case) => boolean) => { const a = all.filter(f); return { n: a.filter(open).length, d: delta(a.filter(cur).length, a.filter(prev).length), series: cumulative(buckets(a, c => c.created_at, () => 1, days * 2, 10, now)) }; };
  const kv = k(c => c.queue === "verification"), ki = { n: all.filter(c => c.status === "in_review").length, d: delta(all.filter(c => c.status === "in_review" && cur(c)).length, all.filter(c => c.status === "in_review" && prev(c)).length), series: cumulative(buckets(all.filter(c => c.status === "in_review"), c => c.updated_at, () => 1, days * 2, 10, now)) };
  const restricted = all.filter(c => c.status === "actioned"), kr = { n: restricted.length, d: delta(restricted.filter(c => cur({ ...c, created_at: c.decided_at ?? c.created_at })).length, restricted.filter(c => prev({ ...c, created_at: c.decided_at ?? c.created_at })).length), series: cumulative(buckets(restricted, c => c.decided_at ?? c.created_at, () => 1, days * 2, 10, now)) };
  const ka = k(c => c.queue === "fraud" && ["listing", "ticket", "event", "review"].includes(c.subject_type)), kp = k(c => c.queue === "appeal");

  const tab = disputes ? "disputes" : Object.keys(QUEUES).includes(s("tab")) ? s("tab") : "";
  const type = s("type") || tab, status = s("status"), risk = s("risk"), who = s("who"), q = s("q").toLowerCase();
  const list = all.filter(c => (!disputes || isDispute(c)) && (!type || c.queue === type) && (!status || stageOf(c)[0] === status || (status === "open_all" && open(c)))
    && (!risk || riskOf(c.risk_score)[0] === risk) && (!who || (who === "me" ? c.assignee_id === userId : who === "unassigned" ? !c.assignee_name : c.assignee_name === who))
    && (!s("range") || new Date(c.updated_at).getTime() >= now - days * 864e5)
    && (!q || `${c.reference} ${c.subject_name} ${c.category} ${c.related?.subject_ref ?? ""}`.toLowerCase().includes(q)));
  const per = 10, page = Math.max(1, Number(s("page")) || 1);
  const qp = (extra: Record<string, string | number>) => { const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]); for (const [key, v] of Object.entries(extra)) { if (v === "") u.delete(key); else u.set(key, String(v)); } const str = u.toString(); return `${disputes ? "/admin/trust/disputes" : "/admin/trust"}${str ? `?${str}` : ""}`; };
  const sel = all.find(c => c.id === s("case")) ?? list.find(c => c.status === "open" && c.risk_score >= 70) ?? list[0];
  const assignees = [...new Set(all.map(c => c.assignee_name).filter(Boolean))];

  return <div className="adb ads">
    <Head title={disputes ? "Disputes" : "Trust & Safety"} subtitle={disputes ? "Chargebacks and payment disputes under Trust & Safety review." : "Operate identity, provider reliability, listing and ticket abuse, and cancellation enforcement."}
      actions={<>
        <span className="adb-psel"><CalendarDays aria-hidden="true" /><Suspense><ParamSelect param="range" label="Date range" value={s("range") || "30d"} options={[{ value: "30d", label: "Last 30 days" }, { value: "7d", label: "Last 7 days" }, { value: "90d", label: "Last 90 days" }]} /></Suspense></span>
        <Link className="adb-btn" href="/admin/trust/export"><Upload aria-hidden="true" />Export</Link>
        <details className="adb-pop"><summary className="adb-btn primary"><Plus aria-hidden="true" />New case<ChevronDown aria-hidden="true" /></summary>
          <div className="adb-pop-body"><h3>Open a Trust &amp; Safety case</h3>
            <ActionForm action={createTrustCase} className="adb-form">
              <label>Queue<select name="queue" defaultValue="fraud">{Object.entries(QUEUES).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label>Subject type<select name="subject_type" defaultValue="listing">{["user", "workspace", "listing", "event", "ticket", "review"].map(v => <option key={v} value={v}>{v}</option>)}</select></label>
              <label>Subject name<input name="subject_name" required minLength={2} /></label>
              <label>Category<input name="category" placeholder="e.g. Fake reviews detected" /></label>
              <label>Risk score (0–100)<input name="risk" type="number" min={0} max={100} defaultValue={50} /></label>
              <label>Reason (recorded in audit log)<textarea name="reason" required minLength={5} rows={3} /></label>
              <button className="adb-btn primary" type="submit">Open case</button>
            </ActionForm></div></details>
      </>} />
    <TabBar active={tab} tabs={[...Object.entries(QUEUES).map(([key, [label]]) => ({ key, label: label === "Fraud/Abuse" ? "Fraud / Abuse" : label, href: tab === key ? "/admin/trust" : `/admin/trust?tab=${key}` })),
      ...(disputes ? [{ key: "disputes", label: "Disputes", href: "/admin/trust/disputes" }] : [])]} />
    <section className="adb-kpis ads-kpis">
      <Kpi icon={BookmarkCheck} tone="blue" label="Verification queue" value={kv.n} delta={kv.d} series={kv.series} invert />
      <Kpi icon={ShieldCheck} tone="green" label="Active investigations" value={ki.n} delta={ki.d} series={ki.series} invert />
      <Kpi icon={Store} tone="red" label="Restricted accounts" value={kr.n} delta={kr.d} series={kr.series} invert />
      <Kpi icon={TriangleAlert} tone="red" label="Listing/ticket abuse" value={ka.n} delta={ka.d} series={ka.series} invert />
      <Kpi icon={MessageCircleQuestion} tone="purple" label="Appeals (open)" value={kp.n} delta={kp.d} series={kp.series} invert />
    </section>
    <div className="ads-grid">
      <div className="ads-main">
        <div className="ads-searchrow"><Suspense><SearchParam placeholder="Search cases, users, listings, events, orders..." /></Suspense><span className="adb-btn ads-filters"><Filter aria-hidden="true" />Filters</span></div>
        <div className="ads-filters-row">
          <label className="adb-filter">Case type<Suspense><ParamSelect param="type" label="Case type" value={type} options={[{ value: "", label: "All types" }, ...Object.entries(QUEUES).map(([value, [label]]) => ({ value, label }))]} /></Suspense></label>
          <label className="adb-filter">Status<Suspense><ParamSelect param="status" label="Status" value={status} options={[{ value: "", label: "All statuses" }, { value: "open_all", label: "Open & in review" }, { value: "open", label: "Open" }, { value: "under_review", label: "Under review" }, { value: "investigating", label: "Investigating" }, { value: "info_requested", label: "Info requested" }, { value: "awaiting_info", label: "Awaiting info" }, { value: "monitoring", label: "Monitoring" }, { value: "resolved", label: "Resolved" }, { value: "approved", label: "Approved" }, { value: "dismissed", label: "Dismissed" }]} /></Suspense></label>
          <label className="adb-filter">Risk level<Suspense><ParamSelect param="risk" label="Risk level" value={risk} options={[{ value: "", label: "All levels" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]} /></Suspense></label>
          <label className="adb-filter">Assigned to<Suspense><ParamSelect param="who" label="Assigned to" value={who} options={[{ value: "", label: "All admins" }, { value: "me", label: "Me" }, { value: "unassigned", label: "Unassigned" }, ...assignees.map(a => ({ value: a, label: a }))]} /></Suspense></label>
          <label className="adb-filter">Date range<Suspense><ParamSelect param="range" label="Updated within" value={s("range") || "30d"} options={[{ value: "30d", label: "Last 30 days" }, { value: "7d", label: "Last 7 days" }, { value: "90d", label: "Last 90 days" }]} /></Suspense></label>
        </div>
        <div className="adb-table-wrap"><table className="adb-table ads-table">
          <colgroup>{[33, 62, 82, 130, 65, 148, 60, 96, 84, 85, 45].map((w, i) => <col key={i} style={{ width: `${(w / 890) * 100}%` }} />)}</colgroup>
          <thead><tr><th><RowCheck label="Select all" /></th><th>ID</th><th>Type</th><th>Title / Subject</th><th>Related to</th><th>User / Provider</th><th>Risk</th><th>Status</th><th>Updated</th><th>Assigned</th><th className="r">Actions</th></tr></thead>
          <tbody>{list.slice((page - 1) * per, page * per).map(c => { const [ql, qt] = QUEUES[c.queue] ?? ["Other", "grey"], [sk, sl] = stageOf(c), [rk, rl] = riskOf(c.risk_score);
            return <tr key={c.id} className={sel?.id === c.id ? "sel" : ""}>
              <td><RowCheck label={`Select ${c.reference}`} /></td>
              <td><Link href={qp({ case: c.id })} scroll={false} className="ads-ref">{c.reference}</Link></td>
              <td><span className={`adb-tag ${qt}`}>{ql}</span></td>
              <td className="ads-title"><Link href={qp({ case: c.id })} scroll={false}>{c.category || c.reason}</Link></td>
              <td className="ads-muted">{c.related?.related_to ?? c.subject_type}</td>
              <td><span className="adb-cell">{c.related?.image ? <Img className="adb-thumb" src={c.related.image} alt="" width={32} height={30} /> : <Mark text="G" color="#0d0d63" size={30} />}
                <span><b>{c.subject_name}</b><small>{c.related?.subject_ref ?? ""}</small></span></span></td>
              <td><Pill status={rk} label={rl} /></td>
              <td><Pill status={sk} label={sl} /></td>
              <td className="ads-muted">{ago(c.updated_at, now)}</td>
              <td><Face src={c.related?.assignee_avatar} name={c.assignee_name || "Unassigned"} size={28} /></td>
              <td className="r"><Menu label={`Actions for ${c.reference}`} entries={[{ kind: "link", label: "Open case", href: qp({ case: c.id }) }, { kind: "action", label: "Assign to me", run: assignTrust.bind(null, c.id) }]} /></td>
            </tr>; })}</tbody>
        </table></div>
        {!list.length && <p className="adb-none">No cases match these filters.</p>}
        <Pager total={list.length} page={page} per={per} href={p => qp({ page: p })} />
      </div>
      {sel ? <CasePanel c={sel} now={now} tab={s("ctab") || "overview"} href={(extra) => qp(extra)} /> : <aside className="adb-panel ads-rail"><p className="adb-none">Select a case to review it.</p></aside>}
    </div>
  </div>;
}

async function CasePanel({ c, now, tab, href }: { c: Case; now: number; tab: string; href: (e: Record<string, string>) => string }) {
  const [rk, rl] = riskOf(c.risk_score), [sk, sl] = stageOf(c), [ql] = QUEUES[c.queue] ?? ["Other"];
  const indicators = (c.evidence ?? []).filter(e => e.kind === "indicator"), trail = (c.evidence ?? []).filter(e => e.kind !== "indicator");
  const ev = c.related?.event;
  const final = c.status === "actioned" || c.status === "dismissed";
  const { db } = await requireAdminPermission("trust");
  const notes = tab === "notes" ? await rows<{ id: number; body: string; author_name: string; created_at: string }>(db.from("admin_notes").select("id,body,author_name,created_at").eq("entity_type", "trust_case").eq("entity_id", c.id).order("created_at", { ascending: false })) : [];
  const typeLabel = ql === "Fraud/Abuse" ? "Fraud / Abuse" : ql;
  return <aside className="ads-rail">
    <section className="adb-panel ads-case">
      <div className="ads-case-h"><span className="ads-case-ref"><SquareArrowOutUpRight aria-hidden="true" />{c.reference}</span><Pill status={rk} label={`${rl} risk`} dot /><span className="ads-case-st"><Pill status={sk} label={<>{sl}<ChevronDown aria-hidden="true" /></>} /></span></div>
      <div className="ads-case-t">{(ev?.image ?? c.related?.image) ? <Img src={ev?.image ?? c.related?.image ?? ""} alt="" width={56} height={66} /> : <Mark text="G" size={56} round={false} />}
        <div><h2>{c.category || c.reason}</h2><p>{typeLabel} <span>•</span> {c.related?.related_to ?? c.subject_type}</p>
          {ev && <div className="ads-ev"><Img src={ev.image} alt="" width={30} height={24} /><span><b>{ev.name}</b><small>{ev.ref} • {ev.date_label ?? ""} • {ev.venue ?? ""}</small></span></div>}</div></div>
      <nav className="ads-ctabs">{[["overview", "Overview"], ["evidence", "Evidence"], ["activity", "Activity"], ["notes", "Notes"], ["related", "Related"]].map(([k, l]) => <Link key={k} href={href({ case: c.id, ctab: k === "overview" ? "" : k })} scroll={false} className={tab === k ? "on" : ""}>{l}</Link>)}</nav>
      {tab === "overview" && <>
        <div className="adb-sec-h ads-cd-h"><h2>Case details</h2><Link className="adb-btn ads-edit" href={href({ case: c.id, ctab: "notes" })}><PenLine aria-hidden="true" />Edit</Link></div>
        <dl className="adb-kv ads-kv">
          <div><dt>ID</dt><dd>{c.reference}</dd></div><div><dt>Type</dt><dd>{typeLabel}</dd></div>
          <div><dt>Status</dt><dd><Pill status={sk} label={sl} /></dd></div>
          <div><dt>Risk level</dt><dd className={rk}>{rl} ({c.risk_score} / 100)</dd></div>
          <div><dt>Created</dt><dd>{stamp(c.created_at)}</dd></div><div><dt>Updated</dt><dd>{stamp(c.updated_at)}</dd></div>
          <div><dt>Assigned to</dt><dd className="ads-who"><Face src={c.related?.assignee_avatar} name={c.assignee_name || "Unassigned"} size={20} />{c.assignee_name || "Unassigned"}</dd></div>
          {ev && <div><dt>Related event</dt><dd><Link href={`/admin/events?q=${encodeURIComponent(ev.ref)}`}>{ev.name} ({ev.ref}) <ExternalLink aria-hidden="true" /></Link></dd></div>}
          {c.related?.orders ? <div><dt>Related orders</dt><dd><Link href={`/admin/commerce?q=${encodeURIComponent(ev?.name ?? c.subject_name)}`}>{c.related.orders} orders (view)</Link></dd></div> : null}
          <div><dt>Description</dt><dd className="ads-desc">{c.reason}</dd></div>
        </dl>
      </>}
      {tab === "evidence" && <ul className="ads-trail">{trail.length ? trail.map((e, i) => <li key={i}><b>{e.label}</b><small>{e.at ? stamp(e.at) : ""}{e.by ? ` · ${e.by}` : ""}</small></li>) : <li><small>No evidence attached yet.</small></li>}</ul>}
      {tab === "activity" && <ul className="ads-trail"><li><b>Case opened</b><small>{stamp(c.created_at)}</small></li>{trail.filter(e => e.at).map((e, i) => <li key={i}><b>{e.label}</b><small>{stamp(e.at)}</small></li>)}
        {c.decided_at && <li><b>Decision: {sl}</b><small>{stamp(c.decided_at)} · {c.decision}</small></li>}</ul>}
      {tab === "notes" && <div className="ads-notes"><ActionForm action={addNote} className="adb-note-form" resetOnSuccess><input type="hidden" name="entity_type" value="trust_case" /><input type="hidden" name="entity_id" value={c.id} />
        <textarea name="body" rows={3} required aria-label="Note" placeholder="Internal note (admins only)" /><button type="submit" className="adb-btn primary">Add note</button></ActionForm>
        <ul className="ads-trail">{notes.map(n => <li key={n.id}><b>{n.author_name}</b><small>{ago(n.created_at, now)}</small><p>{n.body}</p></li>)}</ul></div>}
      {tab === "related" && <ul className="ads-trail"><li><b>{c.subject_name}</b><small>{c.related?.subject_ref ?? c.subject_type}</small></li>{ev && <li><b>{ev.name}</b><small>{ev.ref}</small></li>}</ul>}
    </section>
    <section className="adb-panel ads-risk">
      <div className="adb-sec-h"><h2>Risk indicators</h2><Link className="adb-link" href={href({ case: c.id, ctab: "evidence" })}>View full analysis <ArrowRight aria-hidden="true" /></Link></div>
      <div className="ads-risk-b">
        <ul>{indicators.length ? indicators.map(i => { const Icon = IND[i.icon ?? "alert"] ?? CircleAlert; return <li key={i.label}><Icon aria-hidden="true" /><span>{i.label}</span><Pill status={i.level === "High" ? "high" : i.level === "Medium" ? "medium" : "low"} label={i.level} /></li>; })
          : <li><span>No automated indicators recorded.</span></li>}</ul>
        <Gauge value={c.risk_score} size={110} stroke={9} arc={0.78} color={c.risk_score >= 70 ? "#ec3a52" : c.risk_score >= 40 ? "#f5a524" : "#16a46c"}><b className="ads-g">{c.risk_score} / 100</b><small className="ads-gs">Risk score</small></Gauge>
      </div>
    </section>
    <section className="adb-panel ads-actions"><h2>Actions</h2>
      <div className="ads-act">
        <ActionButton action={assignTrust} args={[c.id]} variant="outline"><UserPlus aria-hidden="true" />Assign</ActionButton>
        <ActionButton action={requestEvidence} args={[c.id]} reason variant="outline" confirm={{ title: "Request evidence", body: "The subject is asked for evidence and the case moves to review.", cta: "Request evidence" }}><FileSearch aria-hidden="true" />Request evidence</ActionButton>
        <details className="adb-pop"><summary className="adb-btn ads-more">More actions<ChevronDown aria-hidden="true" /></summary>
          <div className="adb-pop-body ads-more-b"><h3>More actions</h3>
            <ActionButton action={decideTrust} args={[c.id, "in_review"]} reason variant="outline" disabled={final} confirm={{ title: "Move to review", body: "Marks the case as under review.", cta: "Move to review" }}>Move to review</ActionButton>
            <ActionButton action={decideTrust} args={[c.id, "dismissed"]} reason variant="outline" disabled={final} confirm={{ title: "Dismiss case", body: "Closes the case with no action against the subject.", cta: "Dismiss" }}>Dismiss — no action</ActionButton>
          </div></details>
      </div>
      <div className="ads-act2">
        <ActionButton action={decideTrust} args={[c.id, "actioned"]} reason variant="danger" disabled={final} reasonOptions={["Confirmed fraud / bot activity", "Policy violation confirmed", "Repeated reliability breaches", "Identity could not be verified"]}
          confirm={{ title: "Restrict / suspend", body: `Records an enforcement decision on ${c.subject_name}. The decision is appealable and written to the audit log.`, cta: "Restrict" }}><CircleX aria-hidden="true" />Restrict / Suspend</ActionButton>
        <ActionButton action={decideTrust} args={[c.id, "dismissed"]} reason variant="outline" className="ads-ok" disabled={final} confirm={{ title: "Mark as resolved", body: "Closes the case without restriction.", cta: "Resolve" }}><CircleCheck aria-hidden="true" />Mark as resolved</ActionButton>
      </div>
      {final && <p className="adb-none">Decided {c.decided_at ? ago(c.decided_at, now) : ""}: {c.decision}</p>}
    </section>
  </aside>;
}
