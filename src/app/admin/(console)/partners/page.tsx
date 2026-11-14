import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, UsersRound, Layers, WalletCards, Clock3, Upload, Plus, ChevronDown, Filter, CircleCheck, CirclePause, CircleDot, ArrowUpRight, PenLine, ArrowRight, Info, Settings2, Pause, Play, FileText, Banknote, Mail } from "lucide-react";
import "@/styles/admin-b.css";
import "@/styles/admin-b-partners.css";
import { Restricted, Empty } from "@/components/workspace/kit";
import { ActionButton, ActionForm } from "@/components/workspace/actions";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows, one } from "@/lib/workspace/db";
import { money, delta, requestTime } from "@/lib/workspace/format";
import { Head, Kpi, TabBar, Pill, Pager, Face, Mark, Delta } from "../_b/kit";
import { ParamSelect, SearchParam, Menu, RowCheck } from "../_b/ui";
import { stamp } from "../_b/format";
import { setPartnerStatus, setPartnerTerms, requestPartnerPayout, markPartnerStatementPaid } from "../_b/actions";

export const metadata: Metadata = { title: "Partners" };

type Partner = {
  id: string; name: string; kind: string; status: string; referral_code: string | null; commission_bps: number; commission_basis: string; referrals: number; eligible_revenue: number; earned: number; paid: number;
  quality_score: number | null; logo: string; created_at: string;
  details: { type?: string; domain?: string; email?: string; country?: string; country_code?: string; payout_status?: string; conversion?: number; revenue_30d?: number; revenue_prev_30d?: number; mark?: string; color?: string;
    account_manager?: string; account_manager_avatar?: string; agreement?: string; tagline?: string; cover?: string; last_paid?: string; next_due?: string; pending?: number; pending_prev?: number; held?: number;
    paid_30d?: number; paid_prev_30d?: number; rev_series?: number[]; pause_reason?: string; perf?: { clicks: number; signups: number; bookings: number; revenue: number; deltas: number[] } };
};
type Earning = { partner_id: string; occurred_at: string; eligible_revenue: number; commission: number; status: string };
type Statement = { id: string; partner_id: string; period_start: string; commission: number; status: string; payout_due: string | null; paid_at: string | null; reference: string | null };
/** Q65: money figures come from the commission ledger (partner_earnings / partner_statements), not from seeded rollups in details. */
type Ledger = { rev30: number; revPrev: number; com30: number; hold: number; owed: number; paid30: number; paidPrev: number; lastPaid: string | null; nextDue: string | null; statements: Statement[] };
const TYPE_TONE: Record<string, string> = { affiliate: "amber", strategic: "purple", promoter: "red" };
const PAYOUT: Record<string, [string, string]> = { paid: ["paid", "Paid"], pending: ["pending", "Pending"], on_hold: ["on_hold", "On hold"], hold: ["hold", "Hold"] };
const typeOf = (p: Partner) => p.details?.type ?? p.kind;
const NO_LEDGER: Ledger = { rev30: 0, revPrev: 0, com30: 0, hold: 0, owed: 0, paid30: 0, paidPrev: 0, lastPaid: null, nextDue: null, statements: [] };
function ledgerOf(earnings: Earning[], statements: Statement[], now: number) {
  const m = new Map<string, Ledger>(), DAY = 864e5;
  const get = (id: string) => { let l = m.get(id); if (!l) { l = { ...NO_LEDGER, statements: [] }; m.set(id, l); } return l; };
  for (const e of earnings) {
    if (e.status === "reversed") continue;
    const l = get(e.partner_id), t = Date.parse(e.occurred_at);
    if (t >= now - 30 * DAY) { l.rev30 += Number(e.eligible_revenue); l.com30 += Number(e.commission); }
    else if (t >= now - 60 * DAY) l.revPrev += Number(e.eligible_revenue);
    if (e.status === "pending") l.hold += Number(e.commission);
  }
  for (const st of statements) {
    const l = get(st.partner_id); l.statements.push(st);
    if (st.status === "open" || st.status === "pending") { l.owed += Number(st.commission); if (st.payout_due && (!l.nextDue || st.payout_due < l.nextDue)) l.nextDue = st.payout_due; }
    if (st.status === "paid" && st.paid_at) {
      const t = Date.parse(st.paid_at);
      if (t >= now - 30 * DAY) l.paid30 += Number(st.commission); else if (t >= now - 60 * DAY) l.paidPrev += Number(st.commission);
      if (!l.lastPaid || st.paid_at > l.lastPaid) l.lastPaid = st.paid_at;
    }
  }
  return (id: string) => m.get(id) ?? NO_LEDGER;
}
const pence = (n: number) => Math.round(n * 100) / 100;
const sum = (l: Partner[], f: (p: Partner) => number) => l.reduce((a, p) => a + f(p), 0);

export default async function PartnersPage(props: PageProps<"/admin/partners">) {
  const sp = await props.searchParams;
  const { db, allowed } = await requireAdminPermission("partners");
  if (!allowed) return <Restricted area="Partners" />;
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] as string : "");
  const now = requestTime();
  const all = (await rows<Partner>(db.from("partners").select("id,name,kind,status,referral_code,commission_bps,commission_basis,referrals,eligible_revenue,earned,paid,quality_score,logo,created_at,details").order("created_at", { ascending: false })))
    .map(p => ({ ...p, details: p.details ?? {} }));
  const since = new Date(now - 60 * 864e5).toISOString();
  const [earnings, statements] = await Promise.all([
    rows<Earning>(db.from("partner_earnings").select("partner_id,occurred_at,eligible_revenue,commission,status").gte("occurred_at", since).limit(20000)),
    rows<Statement>(db.from("partner_statements").select("id,partner_id,period_start,commission,status,payout_due,paid_at,reference").order("period_start", { ascending: false }).limit(5000)),
  ]);
  const led = ledgerOf(earnings, statements, now);
  const rev = (p: Partner) => led(p.id).rev30;
  const tab = ["strategic", "policy"].includes(s("tab")) ? s("tab") : "affiliates";
  const type = s("type"), status = s("status"), country = s("country"), q = s("q").toLowerCase();
  const list = all.filter(p => (tab !== "strategic" || p.kind === "strategic") && (!type || typeOf(p) === type) && (!status || p.status === status) && (!country || (p.details.country_code ?? "") === country)
    && (!q || `${p.name} ${p.details.domain ?? ""} ${p.details.email ?? ""} ${p.referral_code ?? ""}`.toLowerCase().includes(q)));
  const per = 10, page = Math.max(1, Number(s("page")) || 1);
  const qp = (extra: Record<string, string | number>) => { const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]); for (const [k, v] of Object.entries(extra)) { if (v === "") u.delete(k); else u.set(k, String(v)); } const str = u.toString(); return `/admin/partners${str ? `?${str}` : ""}`; };
  const sel = all.find(p => p.id === s("partner")) ?? list[(page - 1) * per];
  const active = all.filter(p => p.status === "active"), joined30 = active.filter(p => new Date(p.created_at).getTime() >= now - 30 * 864e5).length;
  const revSeries = Array.from({ length: 10 }, (_, i) => sum(all, p => p.details.rev_series?.[i] ?? 0));
  // Period-over-period deltas only use partners that have a prior-period rollup (no invented baselines).
  const R = sum(all, rev), Rd = delta(R, sum(all, p => led(p.id).revPrev));
  const C = sum(all, p => led(p.id).paid30), Cd = delta(C, sum(all, p => led(p.id).paidPrev));
  // Pending payouts = cleared, unpaid statements plus earnings still inside the 14-day hold.
  const P = sum(all, p => led(p.id).owed + led(p.id).hold), Pd = null;
  const policy = tab === "policy" ? await one<{ value: { promoter_policy?: Record<string, unknown> }; version: number; release: string | null }>(db.from("platform_settings").select("value,version,release").eq("section", "commerce").eq("status", "published").maybeSingle()) : null;
  const countries = [...new Set(all.map(p => p.details.country_code).filter(Boolean))] as string[];

  return <div className="adb adp">
    <Head title="Partners" subtitle="Operate platform affiliates, strategic partners and organizer-promoter policy."
      actions={<>
        <span className="adb-psel"><CalendarDays aria-hidden="true" /><Suspense><ParamSelect param="range" label="Period" value={s("range") || "30d"} options={[{ value: "30d", label: "Last 30 days" }]} /></Suspense></span>
        <Link className="adb-btn" href="/admin/partners/export"><Upload aria-hidden="true" />Export</Link>
        <Link className="adb-btn primary" href="/admin/partners?tab=policy#add"><Plus aria-hidden="true" />Add partner<ChevronDown aria-hidden="true" /></Link>
      </>} />
    <TabBar active={tab} tabs={[{ key: "affiliates", label: "Affiliates", href: "/admin/partners" }, { key: "strategic", label: "Strategic Partners", href: "/admin/partners?tab=strategic" }, { key: "policy", label: "Promoter Program Policy", href: "/admin/partners?tab=policy" }]} />
    <div className="adp-grid">
      <div className="adp-main">
        <section className="adb-kpis adp-kpis">
          <Kpi icon={UsersRound} tone="green" label="Active partners" value={active.length} delta={delta(active.length, active.length - joined30)} series={revSeries.map((_, i) => all.filter(p => new Date(p.created_at).getTime() < now - (9 - i) * 30 * 864e5).length)} />
          <Kpi icon={Layers} tone="purple" label="Partner revenue (30d)" value={money(R)} delta={Rd} series={revSeries} />
          <Kpi icon={WalletCards} tone="blue" label="Commission paid (30d)" value={money(C)} delta={Cd} series={revSeries.map(v => v * (C / (R || 1)))} />
        </section>
        {tab === "policy" ? <section className="adb-panel adp-policy"><h2>Promoter program policy</h2>
          {policy?.value?.promoter_policy ? <dl className="adb-kv">{Object.entries(policy.value.promoter_policy).map(([k, v]) => <div key={k}><dt>{k.replaceAll("_", " ")}</dt><dd>{String(v)}</dd></div>)}</dl>
            : <Empty title="No promoter policy published" text="Organizer-promoter commission rules live in Platform settings → Commerce. Publish a promoter_policy there to make it effective." action={<Link className="adb-btn primary" href="/admin/settings?tab=commerce">Open Commerce settings</Link>} />}
          <p className="adb-none" id="add">New partners join through the partner application form; approve them here once their agreement is signed. Strategic partners are added by the partnerships team with a signed agreement.</p>
        </section> : <>
          <div className="adp-filters">
            <Suspense><SearchParam placeholder="Search partners, emails, campaigns, domains..." /></Suspense>
            <label className="adb-filter">Type<Suspense><ParamSelect param="type" label="Type" value={type} options={[{ value: "", label: "All types" }, { value: "affiliate", label: "Affiliate" }, { value: "strategic", label: "Strategic" }, { value: "promoter", label: "Promoter" }]} /></Suspense></label>
            <label className="adb-filter">Status<Suspense><ParamSelect param="status" label="Status" value={status} options={[{ value: "", label: "All statuses" }, { value: "active", label: "Active" }, { value: "paused", label: "Paused" }, { value: "pending", label: "Under review" }, { value: "terminated", label: "Terminated" }]} /></Suspense></label>
            <label className="adb-filter">Country<Suspense><ParamSelect param="country" label="Country" value={country} options={[{ value: "", label: "All countries" }, ...countries.map(c => ({ value: c, label: c === "GB" ? "United Kingdom" : c }))]} /></Suspense></label>
            <span className="adb-btn adp-fbtn"><Filter aria-hidden="true" />Filters</span>
          </div>
          <div className="adb-table-wrap"><table className="adb-table adp-table">
            <colgroup>{[34, 158, 70, 94, 86, 96, 72, 88, 92, 70].map((w, i) => <col key={i} style={{ width: `${(w / 860) * 100}%` }} />)}</colgroup>
            <thead><tr><th><RowCheck label="Select all" /></th><th>Partner</th><th>Type</th><th>Status</th><th>Revenue (30d)</th><th>Commission</th><th>Conversion</th><th>Joined</th><th>Payout status</th><th className="r">Actions</th></tr></thead>
            <tbody>{list.slice((page - 1) * per, page * per).map(p => { const t = typeOf(p), [pk, pl] = PAYOUT[p.details.payout_status ?? ""] ?? ["pending", "Pending"], r = rev(p);
              return <tr key={p.id} className={sel?.id === p.id ? "sel" : ""}>
                <td><RowCheck label={`Select ${p.name}`} /></td>
                <td><Link href={qp({ partner: p.id })} scroll={false} className="adb-cell"><Mark text={p.details.mark ?? p.name.slice(0, 1)} color={p.details.color ?? "#1a4fe0"} size={28} /><span><b>{p.name}</b><small>{p.details.domain ?? p.referral_code ?? ""}</small></span></Link></td>
                <td><span className={`adb-tag ${TYPE_TONE[t] ?? "grey"}`}>{t[0]!.toUpperCase() + t.slice(1)}</span></td>
                <td><Pill status={p.status === "pending" ? "processing" : p.status} label={<>{p.status === "active" ? <CircleCheck aria-hidden="true" /> : p.status === "paused" ? <CirclePause aria-hidden="true" /> : <CircleDot aria-hidden="true" />}{p.status === "pending" ? "Under review" : p.status[0]!.toUpperCase() + p.status.slice(1)}</>} /></td>
                <td>{money(r)}</td>
                <td>{money(pence(led(p.id).com30), "GBP", { cents: true })} ({(p.commission_bps / 100).toFixed(p.commission_bps % 100 ? 1 : 0)}%)</td>
                <td>{p.details.conversion != null ? `${p.details.conversion.toFixed(1)}%` : "—"}</td>
                <td>{stamp(p.created_at).split(",")[0]}</td>
                <td><Pill status={pk} label={<><CircleCheck aria-hidden="true" />{pl}</>} /></td>
                <td className="r"><Menu label={`Actions for ${p.name}`} entries={[{ kind: "link", label: "Open partner", href: qp({ partner: p.id }) }, { kind: "link", label: "Commissions", href: qp({ partner: p.id, ptab: "commissions" }) }]} /></td>
              </tr>; })}</tbody>
          </table></div>
          {!list.length && <p className="adb-none">No partners match these filters.</p>}
          <Pager total={list.length} page={page} per={per} href={pg => qp({ page: pg, partner: "" })} />
        </>}
      </div>
      <aside className="adp-rail">
        <div className="adp-pending">
          <Kpi icon={Clock3} tone="orange" label="Pending payouts" value={money(P)} delta={Pd} invert series={revSeries.map(v => v * (P / (R || 1)))} badge={<Pill status="active" label={<><CircleCheck aria-hidden="true" />Active</>} />} />
          <Menu label="Partner programme actions" className="adb-btn adp-dots" entries={[{ kind: "link", label: "Export partners (CSV)", href: "/admin/partners/export" }, { kind: "link", label: "Payout requests", href: "/admin/commerce/payouts" }]} />
        </div>
        {sel ? <PartnerRail p={sel} l={led(sel.id)} month={new Date(now).toISOString().slice(0, 7)} tab={s("ptab") || "overview"} qp={qp} /> : <section className="adb-panel"><p className="adb-none">No partners yet.</p></section>}
      </aside>
    </div>
  </div>;
}

function Flag() {
  return <svg className="adp-flag" viewBox="0 0 60 30" aria-hidden="true"><clipPath id="adp-uk"><path d="M0,0 v30 h60 v-30 z" /></clipPath><g clipPath="url(#adp-uk)"><path d="M0,0 v30 h60 v-30 z" fill="#012169" /><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" /><path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="2" /><path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" /><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" /></g></svg>;
}

function PartnerRail({ p, l, month, tab, qp }: { p: Partner; l: Ledger; month: string; tab: string; qp: (e: Record<string, string>) => string }) {
  const d = p.details, t = typeOf(p), r = l.rev30, earned30 = pence(l.com30), perf = d.perf;
  const pending = pence(l.owed);   // cleared onto open statements, not yet paid
  return <>
    <nav className="ads-ctabs adp-tabs">{[["overview", "Overview"], ["attribution", "Attribution"], ["commissions", "Commissions"], ["payouts", "Payouts"], ["agreement", "Agreement"]].map(([k, l]) =>
      <Link key={k} href={qp({ partner: p.id, ptab: k === "overview" ? "" : k })} scroll={false} className={tab === k ? "on" : ""}>{l}</Link>)}</nav>
    <div className="adp-banner" style={d.cover ? { backgroundImage: `linear-gradient(90deg,#0b0c48f0 30%,#0b0c4866),url(${d.cover})` } : undefined}>
      <Mark text={d.mark ?? p.name.slice(0, 2)} color={d.cover ? "transparent" : d.color ?? "#0d0d63"} size={48} round={false} />
      <span><b>{p.name}</b><small>{d.tagline || d.domain || ""}</small></span>
      {d.domain && <a className="adp-visit" href={`https://${d.domain}`} target="_blank" rel="noopener noreferrer">Visit site <ArrowUpRight aria-hidden="true" /></a>}
    </div>
    {tab === "overview" || tab === "agreement" ? <section className="adb-panel adp-key">
      <div className="adb-sec-h"><h2>Key details</h2><details className="adb-pop"><summary className="adb-btn ads-edit"><PenLine aria-hidden="true" />Edit</summary><div className="adb-pop-body"><TermsForm p={p} /></div></details></div>
      <dl className="adb-kv adp-kv">
        <div><dt>Type</dt><dd>{t[0]!.toUpperCase() + t.slice(1)}</dd></div>
        <div><dt>Status</dt><dd><Pill status={p.status} /></dd></div>
        <div><dt>Joined</dt><dd>{stamp(p.created_at).split(",")[0]}</dd></div>
        <div><dt>Account manager</dt><dd className="adp-who"><Face src={d.account_manager_avatar} name={d.account_manager ?? "Unassigned"} size={20} />{d.account_manager ?? "Unassigned"}</dd></div>
        <div><dt>Email</dt><dd className="adp-who"><Mail aria-hidden="true" />{d.email ? <a href={`mailto:${d.email}`}>{d.email}</a> : "—"}</dd></div>
        <div><dt>Country</dt><dd className="adp-who">{d.country_code === "GB" && <Flag />}{d.country ?? "—"}</dd></div>
        <div><dt>Agreement</dt><dd className="adp-who"><FileText aria-hidden="true" />{d.agreement ?? "Not signed"}</dd></div>
      </dl>
    </section> : <section className="adb-panel adp-key"><h2>{tab[0]!.toUpperCase() + tab.slice(1)}</h2>
      <dl className="adb-kv adp-kv">
        {tab === "attribution" && <><div><dt>Referral code</dt><dd>{p.referral_code ?? "—"}</dd></div><div><dt>Referrals</dt><dd>{p.referrals.toLocaleString("en-GB")}</dd></div><div><dt>Quality score</dt><dd>{p.quality_score ?? "—"}</dd></div><div><dt>Basis</dt><dd>{p.commission_basis.replaceAll("_", " ")}</dd></div></>}
        {tab === "commissions" && <><div><dt>Eligible revenue</dt><dd>{money(p.eligible_revenue)}</dd></div><div><dt>Earned (all time)</dt><dd>{money(p.earned)}</dd></div><div><dt>Rate</dt><dd>{(p.commission_bps / 100).toFixed(0)}%</dd></div></>}
        {tab === "payouts" && <><div><dt>Paid (all time)</dt><dd>{money(p.paid, "GBP", { cents: true })}</dd></div><div><dt>Cleared, unpaid</dt><dd>{money(pending, "GBP", { cents: true })}</dd></div><div><dt>In 14-day hold</dt><dd>{money(pence(l.hold), "GBP", { cents: true })}</dd></div></>}
      </dl>
      {tab === "payouts" && <StatementList p={p} statements={l.statements} thisMonth={month} />}</section>}
    <section className="adb-panel adp-perf">
      <div className="adb-sec-h"><h2>Performance <small>(Last 30 days)</small></h2><Link className="adb-link" href="/admin/analytics?tab=promotion">View analytics <ArrowRight aria-hidden="true" /></Link></div>
      {perf ? <div className="adp-perf-g">{([["Clicks", perf.clicks.toLocaleString("en-GB")], ["Sign ups", perf.signups.toLocaleString("en-GB")], ["Bookings", perf.bookings.toLocaleString("en-GB")], ["Revenue", money(perf.revenue)]] as const).map(([l, v], i) =>
        <div key={l}><small>{l}</small><b>{v}</b><Delta value={perf.deltas[i] ?? null} /></div>)}</div>
        : <p className="adb-none">{p.referrals.toLocaleString("en-GB")} referrals · {money(r)} attributed revenue. Click tracking isn’t connected for this partner.</p>}
    </section>
    <section className="adb-panel adp-comm">
      <div className="adb-sec-h"><h2>Commission &amp; payout</h2><Link className="adb-link" href={qp({ partner: p.id, ptab: "payouts" })}>View all <ArrowRight aria-hidden="true" /></Link></div>
      <dl>
        <div><dt>Commission rate</dt><dd>{(p.commission_bps / 100).toFixed(0)}% <small>(of {p.commission_basis === "subscription_revenue" ? "subscription revenue" : "platform revenue"})</small> <Info aria-hidden="true" /></dd></div>
        <div><dt>Total earned (30d)</dt><dd>{money(earned30, "GBP", { cents: true })}</dd></div>
        <div className="gap"><dt>Paid (30d)</dt><dd>{money(pence(l.paid30), "GBP", { cents: true })}<em>{l.lastPaid ? `Last paid ${stamp(l.lastPaid).split(",")[0]}` : ""}</em></dd></div>
        <div><dt>Cleared, unpaid</dt><dd>{money(pending, "GBP", { cents: true })}<em>{l.nextDue ? `Due ${stamp(l.nextDue).split(",")[0]}` : ""}</em></dd></div>
        <div><dt>In 14-day hold</dt><dd>{money(pence(l.hold), "GBP", { cents: true })}</dd></div>
      </dl>
    </section>
    <section className="adb-panel adp-qa"><h2>Quick actions</h2>
      <div className="adp-qa-g">
        <details className="adb-pop"><summary className="adb-btn"><Settings2 aria-hidden="true" />Adjust terms</summary><div className="adb-pop-body"><TermsForm p={p} /></div></details>
        {p.status === "paused"
          ? <ActionButton action={setPartnerStatus} args={[p.id, "active"]} reason variant="outline" confirm={{ title: `Reactivate ${p.name}`, body: "Referral tracking and commission accrual resume immediately.", cta: "Reactivate" }}><Play aria-hidden="true" />Reactivate</ActionButton>
          : <ActionButton action={setPartnerStatus} args={[p.id, "paused"]} reason variant="outline" disabled={p.status === "terminated"} confirm={{ title: `Pause ${p.name}`, body: "New referrals stop accruing commission while paused. Existing earnings are kept.", cta: "Pause partner" }}><Pause aria-hidden="true" />Pause partner</ActionButton>}
        <Link className="adb-btn" href={qp({ partner: p.id, ptab: "agreement" })}><FileText aria-hidden="true" />View agreement</Link>
      </div>
      <ActionButton action={requestPartnerPayout} args={[p.id, pending]} reason variant="primary" className="adp-payout" disabled={pending <= 0 || p.status !== "active"}
        confirm={{ title: "Process partner payout", body: `Records a payout request of ${money(pending, "GBP", { cents: true })} (cleared, unpaid statements) to ${p.name}. This console doesn’t move money: pay the partner, then mark each statement paid with the payment reference under Payouts.`, cta: "Record payout request" }}>
        <Banknote aria-hidden="true" />Process payout</ActionButton>
    </section>
  </>;
}

/** Q65: monthly statements and their settlement (admin_partner_statement_paid: reason + reference, ledger memo, audit). */
function StatementList({ p, statements, thisMonth }: { p: Partner; statements: Statement[]; thisMonth: string }) {
  if (!statements.length) return <p className="adb-none">No statements yet. Earnings clear onto the month’s statement 14 days after the revenue.</p>;
  return <ul className="adp-stmts">{statements.slice(0, 12).map(st => {
    const period = new Date(`${st.period_start}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "Europe/London" });
    const closed = st.period_start.slice(0, 7) < thisMonth;
    return <li key={st.id}><span><b>{period}</b><small>{money(Number(st.commission), "GBP", { cents: true })} · {st.status === "paid" ? `Paid${st.paid_at ? ` ${stamp(st.paid_at).split(",")[0]}` : ""}${st.reference ? ` · ${st.reference}` : ""}` : st.status === "on_hold" ? "On hold" : closed ? `Due ${st.payout_due ? stamp(st.payout_due).split(",")[0] : "now"}` : "Open — month in progress"}</small></span>
      {(st.status === "open" || st.status === "pending") && closed && Number(st.commission) > 0 && <details className="adb-pop"><summary className="adb-btn">Mark paid</summary><div className="adb-pop-body">
        <ActionForm action={markPartnerStatementPaid} className="adb-form"><h3>Mark {period} paid — {p.name}</h3>
          <input type="hidden" name="statement_id" value={st.id} />
          <label>Payment reference<input name="reference" required minLength={3} maxLength={120} /></label>
          <label>Reason (recorded in audit log)<textarea name="reason" required minLength={5} rows={2} /></label>
          <button className="adb-btn primary" type="submit">Mark paid</button>
        </ActionForm></div></details>}</li>;
  })}</ul>;
}

function TermsForm({ p }: { p: Partner }) {
  return <ActionForm action={setPartnerTerms} className="adb-form"><h3>Adjust terms — {p.name}</h3>
    <input type="hidden" name="partner_id" value={p.id} />
    <label>Commission rate (%)<input name="rate" type="number" min={0} max={50} step={0.5} defaultValue={p.commission_bps / 100} required /></label>
    <label>Reason (recorded in audit log)<textarea name="reason" required minLength={5} rows={3} /></label>
    <button className="adb-btn primary" type="submit">Save terms</button>
  </ActionForm>;
}
