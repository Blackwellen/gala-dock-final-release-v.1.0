"use client";
import { useMemo, useState } from "react";
import { Rocket, Plus, Link2, Copy, CalendarDays, Ban, AlertTriangle, CheckCircle2, Info, Pencil, BarChart3, Trash2 } from "lucide-react";
import { Card, CardHead, Chip, Empty, Btn, Bar, Stat } from "@/components/kit";
import { Dialog, useAction, useKitToast } from "@/components/kit/client";
import { money, num, dateShort, timeRange } from "@/lib/format";
import { timezones } from "@/lib/master-data";
import { saveCampaignSetupStep, moveCampaign, createTrackedLink, addPromotionBlackout, deletePromotionBlackout, type Blocker } from "@/lib/actions/campaigns-ui";

export type Channel = { campaign_id: string; channel: string; budget_minor: number; spent_minor: number; status: string };
export type CampaignRow = { id: string; name: string; goal: string; goal_target: number | null; status: string; starts_at: string | null; ends_at: string | null; timezone: string;
  budget_minor: number; audience: Record<string, unknown>; setup_step: number; version: number; utm_campaign: string; cancelled_reason: string | null; created_at: string; channels: Channel[] };
export type LinkRow = { id: string; campaign_id: string; channel: string; code: string; destination: string; utm_source: string; utm_medium: string; created_at: string };
export type CampaignReport = { budget_minor: number; spend_minor: number; touches: number; unique_visitors: number; orders: number; attributed_revenue_minor: number; conversion_rate: number | null;
  goal_progress: number | null; channels: { channel: string; budget_minor: number; status: string; touches: number; orders: number; revenue_minor: number }[];
  messages: { id: string; channel: string; status: string; sent_at: string | null; counts: { sent_fixture?: number; suppressed?: number; unsubscribed?: number } | null }[];
  ads: { boosts: number; paid_minor: number; verified_impressions: number; verified_clicks: number; conversions: number; undelivered_credit_minor: number } | null;
  reconciled: { orders: number; revenue_minor: number; matches: boolean; mismatches: { order_ref: string; issue: string }[] }; provenance: { attribution: string; deliveries: string } };
export type CalendarData = { from: string; to: string; items: { kind: string; id: string; title: string; starts_at: string; ends_at: string; certainty: string }[]; conflicts: { type: string }[] };

const STATUS: Record<string, [string, "gray" | "blue" | "green" | "amber" | "red"]> = { draft: ["Draft", "gray"], scheduled: ["Scheduled", "blue"], active: ["Active", "green"], paused: ["Paused", "amber"], completed: ["Completed", "green"], cancelled: ["Cancelled", "red"] };
const NEXT: Record<string, string[]> = { draft: ["scheduled", "cancelled"], scheduled: ["active", "draft", "cancelled"], active: ["paused", "completed", "cancelled"], paused: ["active", "completed", "cancelled"], completed: [], cancelled: [] };
const VERB: Record<string, string> = { scheduled: "Schedule", active: "Activate", draft: "Back to draft", paused: "Pause", completed: "Complete", cancelled: "Cancel campaign" };
const GOALS: [string, string][] = [["ticket_sales", "Ticket sales"], ["awareness", "Awareness"], ["registrations", "Registrations"], ["followers", "Followers"], ["launch", "Launch"], ["sell_out", "Sell out"]];
const CHANNELS: [string, string][] = [["organic", "Organic (Gala Dock)"], ["social", "Social"], ["email", "Email"], ["sms", "SMS"], ["ads", "Gala Dock ads"], ["partner", "Partners"], ["poster", "Posters / QR"], ["landing", "Landing page"]];
const CH_LABEL = Object.fromEntries(CHANNELS);
// Every canonical timezone (master data) plus UTC; the RPC accepts any IANA zone, and a stored one outside the list is kept.
const ZONES: (readonly [string, string])[] = [...timezones().map(z => [z.tz, z.label] as const), ["UTC", "(GMT+0) UTC"]];
const STEPS = ["Basics", "Schedule", "Audience", "Channels & budget", "Review"];
const gbp = (minor: number) => money(minor / 100);
const localInput = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };
const rid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");

export function CampaignsClient(p: { eventId: string; eventName: string; slug: string | null; eventEnds: string | null; listed: boolean; campaigns: CampaignRow[]; links: LinkRow[];
  reports: Record<string, CampaignReport>; blockers: Record<string, Blocker[]>; calendar: CalendarData | null; canManage: boolean; canBudget: boolean }) {
  const [sel, setSel] = useState<string | null>(p.campaigns[0]?.id ?? null);
  const [wizard, setWizard] = useState<{ c: CampaignRow | null; step: number } | null>(null);
  const c = p.campaigns.find(x => x.id === sel) ?? null;
  const counts = useMemo(() => p.campaigns.reduce<Record<string, number>>((a, x) => ({ ...a, [x.status]: (a[x.status] ?? 0) + 1 }), {}), [p.campaigns]);
  const noWrite = p.canManage ? undefined : "Only owners and managers (promotion permission) can change campaigns.";
  return <div className="oc">
    <div className="k-notice"><Info size={16} aria-hidden /><span><b>Sending is not enabled yet.</b> Email and SMS messages are recorded through a test transport and never delivered. Tracked links, attribution and the report work today.{!p.listed && " This event isn't listed publicly yet, so channels outside Gala Dock are blocked until it is published."}</span></div>
    <div className="oc-kpis">
      <Stat label="Campaigns" value={num(p.campaigns.length)} sub={`${counts.active ?? 0} active · ${counts.scheduled ?? 0} scheduled`} />
      <Stat label="Budget planned" value={gbp(p.campaigns.filter(x => x.status !== "cancelled").reduce((a, x) => a + Number(x.budget_minor), 0))} />
      <Stat label="Attributed orders" value={num(Object.values(p.reports).reduce((a, r) => a + Number(r.orders), 0))} sub="last-touch, 7 days" />
      <Stat label="Attributed revenue" value={gbp(Object.values(p.reports).reduce((a, r) => a + Number(r.attributed_revenue_minor), 0))} tone="green" />
    </div>
    <div className="oc-split">
      <Card>
        <CardHead title="Campaigns" sub={`For ${p.eventName}`}>{p.canManage && <Btn size="sm" icon={Plus} onClick={() => setWizard({ c: null, step: 1 })}>New campaign</Btn>}</CardHead>
        {p.campaigns.length ? <ul className="oc-list" role="listbox" aria-label="Campaigns">{p.campaigns.map(x => <li key={x.id}>
          <button type="button" role="option" aria-selected={x.id === sel} className={`oc-li ${x.id === sel ? "on" : ""}`} onClick={() => setSel(x.id)}>
            <span className="k-grow"><b>{x.name}</b><small>{x.starts_at ? `${dateShort(x.starts_at)} – ${dateShort(x.ends_at)}` : "Dates not set"} · {GOALS.find(g => g[0] === x.goal)?.[1] ?? x.goal}</small></span>
            <Chip tone={STATUS[x.status]?.[1]}>{STATUS[x.status]?.[0] ?? x.status}</Chip></button></li>)}</ul>
          : <Empty icon={Rocket} title="No campaigns yet" text="Plan a campaign with dates, audience, channels and budget. Tracked links attribute ticket orders back to it." action={p.canManage ? <Btn size="sm" icon={Plus} onClick={() => setWizard({ c: null, step: 1 })}>Create the first campaign</Btn> : <p className="k-small k-muted">{noWrite}</p>} />}
      </Card>
      {c ? <CampaignDetail key={c.id} c={c} p={p} onEdit={step => setWizard({ c, step })} /> : <Card><Empty icon={BarChart3} title="Select a campaign" text="Its status, channels, tracked links and report appear here." /></Card>}
    </div>
    <PromotionCalendar eventId={p.eventId} cal={p.calendar} canManage={p.canManage} />
    {wizard && <CampaignWizard key={wizard.c?.id ?? "new"} eventId={p.eventId} c={wizard.c} step={wizard.step} canBudget={p.canBudget} initialBlockers={wizard.c ? p.blockers[wizard.c.id] ?? [] : []}
      onClose={() => setWizard(null)} onCreated={id => setSel(id)} />}
  </div>;
}

function CampaignDetail({ c, p, onEdit }: { c: CampaignRow; p: Parameters<typeof CampaignsClient>[0]; onEdit: (step: number) => void }) {
  const { run, pending } = useAction();
  const [confirm, setConfirm] = useState<string | null>(null); const [reason, setReason] = useState("");
  const r = p.reports[c.id]; const bl = p.blockers[c.id] ?? []; const links = p.links.filter(l => l.campaign_id === c.id);
  const editable = p.canManage && !["completed", "cancelled"].includes(c.status);
  const go = async (to: string) => { const res = await run(() => moveCampaign(p.eventId, c.id, to, c.status, reason)); if (res.ok) { setConfirm(null); setReason(""); } };
  const spendPct = r && r.budget_minor > 0 ? Math.min(100, Math.round((100 * r.spend_minor) / r.budget_minor)) : 0;
  return <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
    <Card>
      <div className="k-between oc-wrap"><div className="k-grow" style={{ minWidth: 0 }}><h2 className="oc-h">{c.name}</h2>
        <p className="k-small k-muted">{c.starts_at ? `${dateShort(c.starts_at)} ${timeRange(c.starts_at, null)} → ${dateShort(c.ends_at)}` : "Dates not set"} · {c.timezone} · utm_campaign <code>{c.utm_campaign}</code></p></div>
        <Chip lg tone={STATUS[c.status]?.[1]}>{STATUS[c.status]?.[0]}</Chip></div>
      {c.cancelled_reason && <p className="k-small k-muted">Cancelled: {c.cancelled_reason}</p>}
      {bl.length > 0 && <div className="k-notice amber" style={{ marginTop: 10 }}><AlertTriangle size={16} aria-hidden /><div><b>Before it can be scheduled</b><ul className="oc-ul">{bl.map(b => <li key={b.key}>{b.label}{b.external ? " (informational)" : ""} {editable && <button className="k-link" type="button" onClick={() => onEdit(b.step)}>Fix in step {b.step}</button>}</li>)}</ul></div></div>}
      <div className="k-row oc-wrap" style={{ gap: 8, marginTop: 12 }}>
        {editable && <Btn size="sm" variant="outline" icon={Pencil} onClick={() => onEdit(Math.min(c.setup_step, 5))}>Edit setup (step {Math.min(c.setup_step, 5)} of 5)</Btn>}
        {(NEXT[c.status] ?? []).map(s => <Btn key={s} size="sm" variant={s === "cancelled" ? "danger" : s === "active" || s === "scheduled" ? "primary" : "outline"} disabled={!p.canManage || pending}
          title={!p.canManage ? "Only owners and managers can change campaign status." : undefined} onClick={() => ["cancelled", "completed"].includes(s) ? setConfirm(s) : void go(s)}>{VERB[s]}</Btn>)}
        {!p.canManage && <span className="k-xs k-muted">Read only — promotion permission needed to change campaigns.</span>}
      </div>
    </Card>
    <Card>
      <CardHead title="Channels & budget" sub={`Campaign budget ${gbp(c.budget_minor)}`} />
      {c.channels.length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Channel</th><th>Status</th><th className="num">Budget</th><th className="num">Touches</th><th className="num">Orders</th><th className="num">Revenue</th></tr></thead>
        <tbody>{c.channels.map(x => { const rc = r?.channels.find(y => y.channel === x.channel); return <tr key={x.channel}><td>{CH_LABEL[x.channel] ?? x.channel}{x.channel === "sms" && <small className="k-muted"> · no SMS provider yet</small>}{x.channel === "email" && <small className="k-muted"> · not sent (test transport)</small>}</td>
          <td><Chip tone={x.status === "active" ? "green" : x.status === "paused" ? "amber" : "gray"}>{x.status}</Chip></td><td className="num">{gbp(x.budget_minor)}</td><td className="num">{num(rc?.touches ?? 0)}</td><td className="num">{num(rc?.orders ?? 0)}</td><td className="num">{gbp(rc?.revenue_minor ?? 0)}</td></tr>; })}</tbody></table></div>
        : <Empty title="No channels chosen" text="Pick at least one channel in step 4." action={editable ? <Btn size="sm" variant="outline" onClick={() => onEdit(4)}>Choose channels</Btn> : undefined} />}
    </Card>
    <LinksCard c={c} links={links} eventId={p.eventId} slug={p.slug} canManage={editable} />
    <Card>
      <CardHead title="Campaign report" sub="Aggregates only — no buyer emails or identifiers." />
      {r ? <>
        <div className="oc-kpis">
          <Stat label="Spend vs budget" value={`${gbp(r.spend_minor)} / ${gbp(r.budget_minor)}`} sub={r.budget_minor ? `${spendPct}% used` : "No budget set"} />
          <Stat label="Link touches" value={num(r.touches)} sub={`${num(r.unique_visitors)} unique visitors`} />
          <Stat label="Orders" value={num(r.orders)} sub={r.conversion_rate != null ? `${(r.conversion_rate * 100).toFixed(1)}% of visitors` : "—"} />
          <Stat label="Revenue" value={gbp(r.attributed_revenue_minor)} tone="green" sub={c.goal_target ? `Goal ${num(r.goal_progress ?? 0)} / ${num(c.goal_target)}` : undefined} />
        </div>
        {r.budget_minor > 0 && <div style={{ marginTop: 10 }}><Bar value={spendPct} tone={spendPct > 95 ? "red" : "green"} label="Budget used" /></div>}
        <div className="oc-grid2" style={{ marginTop: 12 }}>
          <div><h3 className="oc-h3">Deliveries</h3>{r.messages.length ? <ul className="oc-ul">{r.messages.map(m => <li key={m.id}>{m.channel} · {m.status}{m.counts ? ` · ${num(m.counts.sent_fixture ?? 0)} recorded, ${num(m.counts.suppressed ?? 0)} suppressed, ${num(m.counts.unsubscribed ?? 0)} unsubscribed` : ""}</li>)}</ul>
            : <p className="k-small k-muted">No messages. Sending is not enabled yet — deliveries would be recorded through the test transport only.</p>}</div>
          <div><h3 className="oc-h3">Reconciliation</h3>
            <p className="k-small">{r.reconciled.matches ? <><CheckCircle2 size={14} className="k-green" aria-hidden /> Matches checkout orders: {num(r.reconciled.orders)} orders, {gbp(r.reconciled.revenue_minor)}.</> : <><AlertTriangle size={14} className="k-amber" aria-hidden /> {r.reconciled.mismatches.length} attributed order(s) no longer match checkout ({[...new Set(r.reconciled.mismatches.map(m => m.issue.replace(/_/g, " ")))].join(", ")}).</>}</p>
            {r.ads && r.ads.boosts > 0 && <p className="k-small k-muted">Ads: {num(r.ads.boosts)} boost(s), {num(r.ads.verified_impressions)} verified impressions, {num(r.ads.verified_clicks)} clicks, {gbp(r.ads.paid_minor)} paid.</p>}</div>
        </div>
        <p className="k-xs k-muted" style={{ marginTop: 10 }}>{r.provenance.attribution}</p>
      </> : <p className="k-small k-muted">The report is available for your ten most recent campaigns.</p>}
    </Card>
    <Dialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm === "cancelled" ? "Cancel this campaign?" : "Complete this campaign?"}
      sub={confirm === "cancelled" ? "Cancelling is final. Scheduled messages are cancelled and channels close. Tracked links keep redirecting but stop counting." : "Completing is final. The report stays available."}
      footer={<><Btn variant="ghost" onClick={() => setConfirm(null)}>Keep campaign</Btn><Btn variant={confirm === "cancelled" ? "danger" : "primary"} disabled={pending || (confirm === "cancelled" && reason.trim().length < 5)} onClick={() => confirm && void go(confirm)}>{confirm ? VERB[confirm] : ""}</Btn></>}>
      {confirm === "cancelled" ? <label className="k-field"><span>Reason (shown in the audit log)</span><input className="k-input" value={reason} maxLength={300} onChange={e => setReason(e.target.value)} /><small>At least 5 characters</small></label> : <span />}
    </Dialog>
  </div>;
}

function LinksCard({ c, links, eventId, slug, canManage }: { c: CampaignRow; links: LinkRow[]; eventId: string; slug: string | null; canManage: boolean }) {
  const { run, pending } = useAction(); const toast = useKitToast();
  const [channel, setChannel] = useState(c.channels[0]?.channel ?? "social"); const [dest, setDest] = useState(slug ? `/events/${slug}` : ""); const [medium, setMedium] = useState("");
  const copy = async (code: string) => { const u = `${window.location.origin}/r/c/${code}`; try { await navigator.clipboard.writeText(u); toast("Tracked link copied"); } catch { toast(u); } };
  return <Card>
    <CardHead title="Tracked links" sub="Short links (/r/c/…) add UTM tags, record a touch and attribute ticket orders to this campaign." />
    {canManage && <form className="oc-form" onSubmit={e => { e.preventDefault(); void run(() => createTrackedLink(eventId, c.id, channel, dest, medium)); }}>
      <label className="k-field"><span>Channel</span><select className="k-select" value={channel} onChange={e => setChannel(e.target.value)}>{CHANNELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="k-field oc-span2"><span>Destination (Gala Dock page)</span><input className="k-input" value={dest} onChange={e => setDest(e.target.value)} placeholder="/events/your-event" /></label>
      <label className="k-field"><span>Medium (optional)</span><input className="k-input" value={medium} onChange={e => setMedium(e.target.value)} placeholder={channel} /></label>
      <Btn type="submit" size="sm" icon={Link2} disabled={pending || !dest}>Create link</Btn>
    </form>}
    {!slug && canManage && <p className="k-xs k-muted">This event has no public address yet — publish it to link to its page.</p>}
    {links.length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Link</th><th>Channel</th><th>Destination</th><th>Created</th><th /></tr></thead><tbody>
      {links.map(l => <tr key={l.id}><td><code>/r/c/{l.code}</code></td><td>{CH_LABEL[l.channel] ?? l.channel} · {l.utm_medium}</td><td className="oc-ellipsis">{l.destination}</td><td>{dateShort(l.created_at)}</td>
        <td><button type="button" className="k-icon-btn" aria-label={`Copy tracked link ${l.code}`} onClick={() => void copy(l.code)}><Copy size={14} /></button></td></tr>)}</tbody></table></div>
      : <p className="k-small k-muted">No tracked links yet.{canManage ? " Create one above and share it on the channel." : ""}</p>}
  </Card>;
}

function CampaignWizard({ eventId, c, step: initial, canBudget, initialBlockers, onClose, onCreated }: { eventId: string; c: CampaignRow | null; step: number; canBudget: boolean; initialBlockers: Blocker[]; onClose: () => void; onCreated: (id: string) => void }) {
  const { run, pending } = useAction();
  const [step, setStep] = useState(c ? initial : 1); const [id, setId] = useState<string | null>(c?.id ?? null); const [version, setVersion] = useState<number | null>(c?.version ?? null);
  const [blockers, setBlockers] = useState<Blocker[]>(initialBlockers); const [reqId] = useState(rid);
  const a = (c?.audience ?? {}) as { followers?: boolean; consented_contacts?: boolean; past_attendees?: boolean; cities?: string[]; categories?: string[] };
  const [f, setF] = useState({ name: c?.name ?? "", goal: c?.goal ?? "ticket_sales", target: c?.goal_target ? String(c.goal_target) : "", starts: localInput(c?.starts_at ?? null), ends: localInput(c?.ends_at ?? null),
    tz: c?.timezone ?? "Europe/London", followers: a.followers ?? true, consented: a.consented_contacts ?? false, past: a.past_attendees ?? false, cities: (a.cities ?? []).join(", "), categories: (a.categories ?? []).join(", "),
    budget: c ? String(Number(c.budget_minor) / 100) : "0", channels: Object.fromEntries((c?.channels ?? []).map(x => [x.channel, String(Number(x.budget_minor) / 100)])) as Record<string, string> });
  const set = (k: keyof typeof f, v: unknown) => setF(s => ({ ...s, [k]: v }));
  const minor = (v: string) => Math.round((Number(v) || 0) * 100);
  const list = (v: string) => v.split(",").map(s => s.trim()).filter(Boolean);
  const payload = () => step === 1 ? { step, name: f.name, goal: f.goal, goal_target: f.target ? Number(f.target) : null, event_id: eventId }
    : step === 2 ? { step, starts_at: f.starts ? new Date(f.starts).toISOString() : "", ends_at: f.ends ? new Date(f.ends).toISOString() : "", timezone: f.tz }
    : step === 3 ? { step, audience: { followers: f.followers, consented_contacts: f.consented, past_attendees: f.past, cities: list(f.cities), categories: list(f.categories) } }
    : step === 4 ? { step, budget_minor: minor(f.budget), channels: Object.entries(f.channels).map(([channel, b]) => ({ channel, budget_minor: minor(b) })) } : { step: 5 };
  const save = async (next: number | null) => {
    const r = await run(() => saveCampaignSetupStep(eventId, id, payload(), version, reqId));
    const d = (r as { data?: { id?: string; version: number; blockers?: Blocker[] } }).data;
    if (!r.ok || !d) return;
    if (d.id && !id) { setId(d.id); onCreated(d.id); }
    setVersion(d.version); setBlockers(d.blockers ?? []);
    if (next) setStep(next); else onClose();
  };
  const schedule = async () => { if (!id) return; const r = await run(() => moveCampaign(eventId, id, "scheduled", "draft")); if (r.ok) onClose(); };
  const adsOn = "ads" in f.channels;
  const chanTotal = Object.values(f.channels).reduce((s, v) => s + minor(v), 0);
  return <Dialog open onClose={onClose} wide title={c ? `Edit campaign · ${c.name}` : "New campaign"} sub={`Step ${step} of 5 · ${STEPS[step - 1]}`}
    footer={<>{step > 1 && <Btn variant="ghost" onClick={() => setStep(step - 1)} disabled={pending}>Back</Btn>}<Btn variant="outline" onClick={onClose}>Close</Btn>
      {step < 5 ? <Btn disabled={pending || (step === 1 && f.name.trim().length < 2) || (!id && step > 1)} onClick={() => void save(step + 1)}>Save and continue</Btn>
        : <><Btn variant="outline" disabled={pending || !id} onClick={() => void save(null)}>Save draft</Btn><Btn disabled={pending || !id || blockers.some(b => !b.external) || (c != null && c.status !== "draft")} onClick={() => void schedule()}>Schedule campaign</Btn></>}</>}>
    <ol className="oc-steps" aria-label="Campaign setup steps">{STEPS.map((s, i) => <li key={s} data-state={i + 1 === step ? "current" : i + 1 < step ? "done" : "todo"}>
      <button type="button" disabled={!id && i > 0} onClick={() => setStep(i + 1)} aria-current={i + 1 === step ? "step" : undefined}><span>{i + 1}</span>{s}</button></li>)}</ol>
    {step === 1 && <div className="oc-form">
      <label className="k-field oc-span2"><span>Campaign name <b>*</b></span><input className="k-input" value={f.name} maxLength={120} onChange={e => set("name", e.target.value)} placeholder="e.g. Early-bird push" /></label>
      <label className="k-field"><span>Goal</span><select className="k-select" value={f.goal} onChange={e => set("goal", e.target.value)}>{GOALS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="k-field"><span>Target (optional)</span><input className="k-input" inputMode="numeric" value={f.target} onChange={e => set("target", e.target.value.replace(/\D/g, ""))} placeholder="e.g. 200 orders" /></label>
    </div>}
    {step === 2 && <div className="oc-form">
      <label className="k-field"><span>Starts</span><input type="datetime-local" className="k-input" value={f.starts} onChange={e => set("starts", e.target.value)} /></label>
      <label className="k-field"><span>Ends</span><input type="datetime-local" className="k-input" value={f.ends} onChange={e => set("ends", e.target.value)} /></label>
      <label className="k-field"><span>Time zone</span><select className="k-select" value={f.tz} onChange={e => set("tz", e.target.value)}>{(ZONES.some(z => z[0] === f.tz) ? ZONES : [[f.tz, f.tz] as const, ...ZONES]).map(([z, l]) => <option key={z} value={z}>{l}</option>)}</select></label>
      <p className="k-xs k-muted oc-span2">Times are entered in your browser&apos;s local time. A campaign that starts after the event has finished is blocked.</p>
    </div>}
    {step === 3 && <div className="oc-form">
      <fieldset className="oc-fieldset oc-span2"><legend className="k-label">Who to reach</legend>
        <label className="k-row" style={{ gap: 8 }}><input type="checkbox" checked={f.followers} onChange={e => set("followers", e.target.checked)} /> Followers of your organiser page and this event</label>
        <label className="k-row" style={{ gap: 8 }}><input type="checkbox" checked={f.consented} onChange={e => set("consented", e.target.checked)} /> Contacts who opted in to your marketing (unsubscribes and suppressions always excluded)</label>
        <label className="k-row" style={{ gap: 8 }}><input type="checkbox" checked={f.past} onChange={e => set("past", e.target.checked)} /> Past attendees who opted in</label></fieldset>
      <label className="k-field"><span>Cities (comma separated)</span><input className="k-input" value={f.cities} onChange={e => set("cities", e.target.value)} placeholder="London, Manchester" /></label>
      <label className="k-field"><span>Categories (comma separated)</span><input className="k-input" value={f.categories} onChange={e => set("categories", e.target.value)} placeholder="nightlife, comedy" /></label>
    </div>}
    {step === 4 && <div className="k-col" style={{ gap: 10 }}>
      <label className="k-field" style={{ maxWidth: 220 }}><span>Campaign budget (£)</span><input className="k-input" inputMode="decimal" value={f.budget} onChange={e => set("budget", e.target.value.replace(/[^\d.]/g, ""))} /></label>
      <div className="oc-chans">{CHANNELS.map(([k, l]) => { const on = k in f.channels; const lockAds = k === "ads" && !canBudget;
        return <div key={k} className={`oc-chan ${on ? "on" : ""}`}><label className="k-row" style={{ gap: 8 }}><input type="checkbox" checked={on} onChange={e => setF(s => { const ch = { ...s.channels }; if (e.target.checked) ch[k] = "0"; else delete ch[k]; return { ...s, channels: ch }; })} /><b>{l}</b></label>
          {on && <label className="k-field"><span>Budget (£)</span><input className="k-input" inputMode="decimal" disabled={lockAds} title={lockAds ? "Advertising budgets need finance permission." : undefined} value={f.channels[k]} onChange={e => setF(s => ({ ...s, channels: { ...s.channels, [k]: e.target.value.replace(/[^\d.]/g, "") } }))} />
            {lockAds && <small>Advertising budgets need finance permission — ask an owner or finance member.</small>}{k === "sms" && <small>No SMS provider is configured yet.</small>}{k === "email" && <small>Sending is not enabled yet.</small>}</label>}</div>; })}</div>
      <p className={`k-small ${chanTotal > minor(f.budget) ? "k-red" : "k-muted"}`}>Channel budgets: {gbp(chanTotal)} of {gbp(minor(f.budget))}{adsOn ? " · ads spend is billed through Gala Dock boosts" : ""}</p>
    </div>}
    {step === 5 && <div className="k-col" style={{ gap: 10 }}>
      <dl className="oc-dl"><dt>Name</dt><dd>{f.name || "—"}</dd><dt>Goal</dt><dd>{GOALS.find(g => g[0] === f.goal)?.[1]}{f.target ? ` · target ${f.target}` : ""}</dd>
        <dt>Dates</dt><dd>{f.starts && f.ends ? `${f.starts.replace("T", " ")} → ${f.ends.replace("T", " ")} (${f.tz})` : "Not set"}</dd>
        <dt>Channels</dt><dd>{Object.keys(f.channels).map(k => CH_LABEL[k]).join(", ") || "None"}</dd><dt>Budget</dt><dd>{gbp(minor(f.budget))}</dd></dl>
      {blockers.length ? <div className="k-notice amber"><AlertTriangle size={16} aria-hidden /><div><b>Resolve before scheduling</b><ul className="oc-ul">{blockers.map(b => <li key={b.key}>{b.label} <button type="button" className="k-link" onClick={() => setStep(b.step)}>Go to step {b.step}</button></li>)}</ul></div></div>
        : <div className="k-notice green"><CheckCircle2 size={16} aria-hidden /><span>Ready to schedule. It becomes active at its start time.</span></div>}
      <p className="k-xs k-muted">Sending is not enabled yet: messages are recorded, not delivered.</p>
    </div>}
  </Dialog>;
}

function PromotionCalendar({ eventId, cal, canManage }: { eventId: string; cal: CalendarData | null; canManage: boolean }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  const [b, setB] = useState({ starts: "", ends: "", reason: "", channel: "" });
  const [del, setDel] = useState<{ id: string; title: string; starts_at: string; ends_at: string | null } | null>(null);
  const KIND: Record<string, [string, "blue" | "purple" | "green" | "amber" | "red" | "gray"]> = { event: ["Event", "blue"], campaign: ["Campaign", "purple"], send: ["Send", "green"], boost: ["Boost", "amber"], blackout: ["Blackout", "red"] };
  const CONF: Record<string, string> = { send_in_blackout: "A scheduled send falls inside a blackout", boost_after_event: "A boost runs past its event's end", campaign_after_event: "A campaign starts after its event has finished" };
  return <Card>
    <CardHead title="Promotion calendar" sub="Your workspace's events, campaigns, sends, boosts and blackouts — next 90 days.">{canManage && <Btn size="sm" variant="outline" icon={Ban} onClick={() => setOpen(true)}>Add blackout</Btn>}</CardHead>
    {!cal ? <p className="k-small k-muted">The calendar needs promotion, finance or events permission.</p> : <>
      {cal.conflicts.length > 0 && <div className="k-notice amber"><AlertTriangle size={16} aria-hidden /><ul className="oc-ul">{Object.entries(cal.conflicts.reduce<Record<string, number>>((a, x) => ({ ...a, [x.type]: (a[x.type] ?? 0) + 1 }), {})).map(([t, n]) => <li key={t}>{CONF[t] ?? t} ({n})</li>)}</ul></div>}
      {cal.items.length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>When</th><th>Type</th><th>Title</th><th>Certainty</th>{canManage && <th><span className="k-sr">Actions</span></th>}</tr></thead><tbody>
        {cal.items.slice(0, 40).map(i => <tr key={`${i.kind}-${i.id}`}><td>{dateShort(i.starts_at)}{i.ends_at && i.ends_at !== i.starts_at ? ` → ${dateShort(i.ends_at)}` : ""}</td><td><Chip tone={KIND[i.kind]?.[1]}>{KIND[i.kind]?.[0] ?? i.kind}</Chip></td><td>{i.title}</td><td className="k-small">{i.certainty}</td>{canManage && <td>{i.kind === "blackout" && <button type="button" className="k-icon-btn" aria-label={`Remove blackout ${i.title}`} title="Remove blackout" onClick={() => setDel({ id: i.id, title: i.title, starts_at: i.starts_at, ends_at: i.ends_at })}><Trash2 size={14} /></button>}</td>}</tr>)}</tbody></table></div>
        : <Empty icon={CalendarDays} title="Nothing scheduled" text="Events, campaigns and blackouts in the next 90 days appear here." />}
    </>}
    <Dialog open={!!del} onClose={() => setDel(null)} title="Remove this blackout?" sub={del ? `“${del.title || "Blackout"}” · ${dateShort(del.starts_at)}${del.ends_at ? ` → ${dateShort(del.ends_at)}` : ""}. Sends in this period will no longer be flagged. The removal is recorded in the audit log.` : undefined}
      footer={<><Btn variant="ghost" onClick={() => setDel(null)}>Keep blackout</Btn><Btn variant="danger" disabled={pending} onClick={async () => { if (!del) return; const r = await run(() => deletePromotionBlackout(eventId, del.id)); if (r.ok) setDel(null); }}>Remove blackout</Btn></>}><span /></Dialog>
    <Dialog open={open} onClose={() => setOpen(false)} title="Add a promotion blackout" sub="No sends should be scheduled inside a blackout; conflicts are flagged on the calendar."
      footer={<><Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn><Btn disabled={pending || !b.starts || !b.ends || b.reason.trim().length < 3} onClick={async () => { const r = await run(() => addPromotionBlackout(eventId, new Date(b.starts).toISOString(), new Date(b.ends).toISOString(), b.reason, b.channel || null)); if (r.ok) { setOpen(false); setB({ starts: "", ends: "", reason: "", channel: "" }); } }}>Add blackout</Btn></>}>
      <div className="oc-form">
        <label className="k-field"><span>Starts</span><input type="datetime-local" className="k-input" value={b.starts} onChange={e => setB({ ...b, starts: e.target.value })} /></label>
        <label className="k-field"><span>Ends</span><input type="datetime-local" className="k-input" value={b.ends} onChange={e => setB({ ...b, ends: e.target.value })} /></label>
        <label className="k-field"><span>Channel</span><select className="k-select" value={b.channel} onChange={e => setB({ ...b, channel: e.target.value })}><option value="">All channels</option><option value="email">Email</option><option value="sms">SMS</option><option value="social">Social</option><option value="ads">Ads</option></select></label>
        <label className="k-field"><span>Reason</span><input className="k-input" maxLength={200} value={b.reason} onChange={e => setB({ ...b, reason: e.target.value })} placeholder="e.g. Bank holiday weekend" /></label>
      </div>
    </Dialog>
  </Card>;
}
