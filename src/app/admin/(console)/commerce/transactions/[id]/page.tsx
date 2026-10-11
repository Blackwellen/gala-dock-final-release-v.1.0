import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Navigation, UserRound, ShoppingCart, Layers, FileText, Landmark, CalendarDays, MapPin, CalendarClock, CircleCheck, RefreshCw, Headset, MoreHorizontal, ArrowRight,
  Target, FileCheck, Gauge as GaugeIcon, ShieldAlert, MapPinned, CreditCard, Lock, Check, Flag, Ticket, Receipt, ScanLine, PenLine, type LucideIcon } from "lucide-react";
import "@/styles/admin-b.css";
import "@/styles/admin-b-transaction.css";
import { Restricted } from "@/components/workspace/kit";
import { ActionButton, ActionForm } from "@/components/workspace/actions";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows, one, isUuid } from "@/lib/workspace/db";
import { money, requestTime } from "@/lib/workspace/format";
import { Head, Pill, Face, Mark, TabBar, Img } from "../../../_b/kit";
import { CopyButton, Menu } from "../../../_b/ui";
import { stamp, ago } from "../../../_b/format";
import { requestRefund, addNote, createSupportCase } from "../../../_b/actions";
import { statusOf, typeOf, type Tx } from "../../data";

export const metadata: Metadata = { title: "Transaction" };

type Details = {
  reference?: string; order?: string; tickets?: number; ticket_label?: string; unit_price?: number; booking_fee?: number; vat?: number; vat_rate?: number; commission_rate?: number; charge_id?: string; provider?: string;
  customer?: { name: string; email: string; ref: string; avatar?: string }; provider_party?: { name: string; ref: string }; event?: { name: string; ref: string; image: string; starts?: string; ends?: string; location?: string };
  payment?: { brand: string; last4: string; exp: string; cardholder: string; three_ds?: boolean }; risk?: { score: number; identity: string; velocity: string; chargebacks: string; location: string };
  timeline?: { at: number; label: string; detail: string; icon: string }[]; disputed?: boolean; held?: boolean;
};
const ICON: Record<string, LucideIcon> = { card: CreditCard, lock: Lock, check: Check, bank: Landmark };

export default async function TransactionPage(props: PageProps<"/admin/commerce/transactions/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!isUuid(id)) notFound();
  const { db, allowed } = await requireAdminPermission("commerce");
  if (!allowed) return <Restricted area="Commerce" />;
  const t = await one<Tx & { details: Details }>(db.from("transactions").select("id,workspace_id,event_id,kind,category,description,amount,status,source,fee_amount,net_amount,counterparty,stripe_ref,occurred_at,details").eq("id", id).maybeSingle());
  if (!t) notFound();
  const [notes, cases, reqs] = await Promise.all([
    rows<{ id: number; body: string; author_name: string; created_at: string }>(db.from("admin_notes").select("id,body,author_name,created_at").eq("entity_type", "transaction").eq("entity_id", id).order("created_at", { ascending: false })),
    rows<{ id: string; reference: string; subject: string; status: string; created_at: string }>(db.from("support_cases").select("id,reference,subject,status,created_at").eq("related->>transaction_id", id).order("created_at", { ascending: false })),
    rows<{ id: string; kind: string; status: string; amount: number; reason: string; requested_by_name: string; created_at: string }>(db.from("admin_money_requests").select("id,kind,status,amount,reason,requested_by_name,created_at").eq("transaction_id", id).order("created_at", { ascending: false })),
  ]);
  const d = t.details ?? {}, now = requestTime();
  const amount = Number(t.amount), fee = Number(t.fee_amount), vat = Number(d.vat ?? 0), netAmt = t.net_amount === null ? null : Number(t.net_amount);
  const st = statusOf(t), ref = d.reference ?? t.stripe_ref ?? t.id.slice(0, 8), type = typeOf(t);
  const at = (mins: number) => new Date(new Date(t.occurred_at).getTime() + mins * 60000).toISOString();
  const refunded = reqs.filter(r => r.kind === "refund" && r.status !== "cancelled" && r.status !== "rejected").reduce((a, r) => a + Number(r.amount), 0);
  const refundable = ["income", "payment"].includes(t.kind) && ["completed", "partial"].includes(t.status) && !d.disputed ? Math.max(0, Math.round((Math.abs(amount) - refunded) * 100) / 100) : 0;
  const ev = d.event, tab = ["timeline", "fees", "support"].includes(String(sp.tab)) ? String(sp.tab) : "overview";
  const base = `/admin/commerce/transactions/${id}`;
  const steps = (d.timeline ?? []).map(s => ({ ...s, iso: at(s.at), done: new Date(at(s.at)).getTime() <= now }));
  const subtotal = (d.unit_price ?? 0) * (d.tickets ?? 0) + (d.booking_fee ?? 0) * (d.tickets ?? 0);
  const custLink = d.customer ? `/admin/users?q=${encodeURIComponent(d.customer.email)}` : `/admin/users?q=${encodeURIComponent(t.counterparty)}`;

  const timeline = <section className="adb-panel adt-tl">
    <div className="adb-sec-h"><h2>Immutable timeline</h2><Link className="adb-link" href={`${base}?tab=timeline`}>View all <ArrowRight aria-hidden="true" /></Link></div>
    <ol>{steps.map(s => { const Icon = ICON[s.icon] ?? CircleCheck; return <li key={s.label} className={s.done ? "" : "future"}><time>{stamp(s.iso).replace(", ", "\n")}</time><i className={`adt-ti ${s.icon}`}><Icon aria-hidden="true" /></i><span><b>{s.label}</b><small>{s.detail}</small></span></li>; })}
      {reqs.map(r => <li key={r.id}><time>{stamp(r.created_at).replace(", ", "\n")}</time><i className="adt-ti flag"><RefreshCw aria-hidden="true" /></i><span><b>{r.kind === "refund" ? "Refund requested" : "Payout retry requested"} · {money(r.amount, "GBP", { cents: true })}</b><small>{r.status === "pending" ? "Pending processor — no money has moved" : r.status} · {r.requested_by_name}</small></span></li>)}
      {!reqs.length && !d.disputed && <li><time>—</time><i className="adt-ti flag"><Flag aria-hidden="true" /></i><span><b>No refunds or disputes</b><small>Transaction completed successfully</small></span></li>}</ol>
  </section>;

  return <div className="adb adt">
    <Head back={{ href: "/admin/commerce", label: "Back to Commerce" }} title={`Transaction #${ref}`} badges={<span className="adt-badge"><Pill status={st.key} label={st.label} dot /></span>}
      subtitle={<>{type} <span className="adt-sep">•</span> {stamp(t.occurred_at).replace(",", " at")}</>}
      actions={<>
        <Link className="adb-btn blue" href={t.event_id ? `/admin/events/${t.event_id}` : `/admin/events?q=${encodeURIComponent(ev?.ref ?? ev?.name ?? "")}`}><ExternalLink aria-hidden="true" />Open event</Link>
        <Link className="adb-btn blue" href={`/admin/tickets?q=${encodeURIComponent(d.order ?? ref)}`}><Navigation aria-hidden="true" />View order</Link>
        <Link className="adb-btn blue" href={custLink}><UserRound aria-hidden="true" />View customer</Link>
        <Menu label="More actions" className="adb-btn adt-more" entries={[{ kind: "link", label: "Export ledger (CSV)", href: "/admin/commerce/export" }, { kind: "link", label: "Payouts", href: "/admin/commerce/payouts" }]} />
      </>} />
    {ev && <div className="adt-event">
      <Img src={ev.image} alt="" width={80} height={52} />
      <div><b>{ev.name}</b><span><span><ScanLine aria-hidden="true" />{ev.ref}</span><span><CalendarDays aria-hidden="true" />{stamp(t.occurred_at).split(",")[0]}, {ev.starts ?? ""} – {ev.ends ?? ""}</span><span><MapPin aria-hidden="true" />{ev.location}</span></span></div>
    </div>}
    <div className="adt-grid">
      <div className="adt-main">
        <TabBar active={tab} tabs={[{ key: "overview", label: "Overview", href: base }, { key: "timeline", label: "Timeline", href: `${base}?tab=timeline` }, { key: "fees", label: "Fees", href: `${base}?tab=fees` }, { key: "support", label: "Support", href: `${base}?tab=support` }]} />
        <section className="adt-stats">
          <div><i className="red"><ShoppingCart aria-hidden="true" /></i><span><b>{money(amount, "GBP", { cents: true })}</b><small>Gross amount</small></span></div>
          <div><i className="purple"><Layers aria-hidden="true" /></i><span><b>{money(fee, "GBP", { cents: true })}</b><small>Platform fee{d.commission_rate ? ` (${d.commission_rate}%)` : ""}</small></span></div>
          <div><i className="orange"><FileText aria-hidden="true" /></i><span><b>{money(vat, "GBP", { cents: true })}</b><small>VAT{d.vat_rate ? ` (${d.vat_rate}%)` : ""}</small></span></div>
          <div><i className="green"><Landmark aria-hidden="true" /></i><span><b>{netAmt === null ? "—" : money(netAmt, "GBP", { cents: true })}</b><small>Net to provider</small></span></div>
        </section>
        {tab === "overview" && <>
          <div className="adt-r2">
            <section className="adb-panel adt-details"><h2>Transaction details</h2>
              <dl className="adb-kv">
                <div><dt>Transaction ID</dt><dd>{ref} <CopyButton value={ref} /></dd></div>
                <div><dt>Type</dt><dd>{type}</dd></div>
                <div><dt>Source</dt><dd>{ev ? <Link href={t.event_id ? `/admin/events/${t.event_id}` : `/admin/events?q=${encodeURIComponent(ev.ref)}`}>Event: {ev.name} ({ev.ref}) <ExternalLink aria-hidden="true" /></Link> : t.source}</dd></div>
                <div><dt>Order ID</dt><dd>{d.order ? <Link href={`/admin/tickets?q=${encodeURIComponent(d.order)}`}>{d.order} <ExternalLink aria-hidden="true" /></Link> : "—"}</dd></div>
                {d.ticket_label && <div><dt>Ticket(s)</dt><dd>{d.ticket_label}</dd></div>}
                <div><dt>Date &amp; time</dt><dd>{new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZoneName: "short" }).format(new Date(t.occurred_at)).replace(/ at /, ", ").replace("BST", "(BST)").replace("GMT", "(GMT)")}</dd></div>
                <div><dt>Payment provider</dt><dd><span className="adt-stripe">S</span> {d.provider ?? "Stripe"}</dd></div>
                <div><dt>Payment intent</dt><dd>{t.stripe_ref ? <>{short(t.stripe_ref)} <CopyButton value={t.stripe_ref} /></> : "—"}</dd></div>
                <div><dt>Charge ID</dt><dd>{d.charge_id ? <>{short(d.charge_id)} <CopyButton value={d.charge_id} /></> : "—"}</dd></div>
                <div><dt>Status</dt><dd><Pill status={st.key} label={st.label} dot /></dd></div>
                <div><dt>Description</dt><dd>{ev ? `Ticket purchase for ${ev.name}` : t.description}</dd></div>
              </dl>
            </section>
            <section className="adb-panel adt-parties"><h2>Parties</h2>
              <h3>Customer</h3>
              <div className="adt-party"><Face src={d.customer?.avatar} name={d.customer?.name ?? t.counterparty} size={38} /><span><b>{d.customer?.name ?? t.counterparty}</b><small>{d.customer?.email ?? ""}</small></span><Link className="adb-link" href={custLink}>View profile <ArrowRight aria-hidden="true" /></Link></div>
              <h3>Provider / Organizer</h3>
              <div className="adt-party"><Mark text="G" color="#0d0d63" size={38} /><span><b>{d.provider_party?.name ?? "—"}</b><small>{d.provider_party?.ref ?? ""}</small></span>{t.workspace_id && <Link className="adb-link" href={`/admin/workspaces/${t.workspace_id}`}>View workspace <ArrowRight aria-hidden="true" /></Link>}</div>
              {ev && <><h3>Event</h3>
                          <div className="adt-party"><Img src={ev.image} alt="" width={52} height={40} /><span><b>{ev.name}</b><small>{ev.ref}</small></span><Link className="adb-link" href={t.event_id ? `/admin/events/${t.event_id}` : `/admin/events?q=${encodeURIComponent(ev.ref)}`}>View event <ArrowRight aria-hidden="true" /></Link></div></>}
            </section>
          </div>
          <div className="adt-r3">
            <div className="adt-r3l">
              <div className="adt-r3a">
                <section className="adb-panel adt-amount"><h2>Amount breakdown</h2>
                  <dl>{d.tickets ? <><div><dt>Ticket price ({d.tickets} × {money(d.unit_price, "GBP", { cents: true })})</dt><dd>{money((d.unit_price ?? 0) * d.tickets, "GBP", { cents: true })}</dd></div>
                    <div><dt>Booking fee ({d.tickets} × {money(d.booking_fee, "GBP", { cents: true })})</dt><dd>{money((d.booking_fee ?? 0) * d.tickets, "GBP", { cents: true })}</dd></div>
                    <div className="sub"><dt>Subtotal</dt><dd>{money(subtotal, "GBP", { cents: true })}</dd></div></> : <div className="sub"><dt>Gross amount</dt><dd>{money(amount, "GBP", { cents: true })}</dd></div>}
                    <div><dt>Platform commission{d.commission_rate ? ` (${d.commission_rate}%)` : ""}</dt><dd>- {money(fee, "GBP", { cents: true })}</dd></div>
                    {vat > 0 && <div><dt>VAT ({d.vat_rate}%)</dt><dd>- {money(vat, "GBP", { cents: true })}</dd></div>}
                    <div className="tot"><dt>Net to provider</dt><dd>{netAmt === null ? "—" : money(netAmt, "GBP", { cents: true })}</dd></div></dl>
                </section>
                <section className="adb-panel adt-pm"><h2>Payment method</h2>
                  {d.payment ? <><div className="adt-card"><span className="visa">{d.payment.brand.toUpperCase()}</span>{d.payment.brand} <b>•••• {d.payment.last4}</b></div>
                    <dl><div><dt>Expires</dt><dd>{d.payment.exp}</dd></div><div><dt>Cardholder</dt><dd>{d.payment.cardholder}</dd></div></dl>
                    {d.payment.three_ds && <span className="adt-3ds"><Pill status="paid" label="3D Secure" dot /></span>}</> : <p className="adb-none">Held by {d.provider ?? "Stripe"}; card details aren’t stored by Gala Dock.</p>}
                </section>
              </div>
              <section className="adb-panel adt-related"><h2>Related records</h2>
                <ul>
                  {ev && <li><CalendarClock aria-hidden="true" /><span>Event</span><b>{ev.name} ({ev.ref})</b><Link className="adb-link" href={t.event_id ? `/admin/events/${t.event_id}` : `/admin/events?q=${encodeURIComponent(ev.ref)}`}>View <ArrowRight aria-hidden="true" /></Link></li>}
                  {d.order && <li><Receipt aria-hidden="true" /><span>Order</span><b>{d.order}</b><Link className="adb-link" href={`/admin/tickets?q=${encodeURIComponent(d.order)}`}>View <ArrowRight aria-hidden="true" /></Link></li>}
                  {d.tickets ? <li><Ticket aria-hidden="true" /><span>Tickets</span><b>{d.tickets} tickets</b><Link className="adb-link" href={`/admin/tickets?q=${encodeURIComponent(d.order ?? ref)}`}>View <ArrowRight aria-hidden="true" /></Link></li> : null}
                  {!ev && !d.order && <li><Receipt aria-hidden="true" /><span>Counterparty</span><b>{t.counterparty}</b></li>}
                </ul>
              </section>
            </div>
            <div className="adt-r3r">
              <section className="adb-panel adt-refunds"><h2>Refunds &amp; disputes</h2>
                {reqs.length || d.disputed ? <ul className="adt-reqs">{d.disputed && <li><Pill status="disputed" label="Disputed" dot /> Chargeback opened — respond in Stripe</li>}
                  {reqs.map(r => <li key={r.id}><Pill status={r.status} dot /><span>{money(r.amount, "GBP", { cents: true })} {r.kind === "refund" ? "refund" : "retry"} · {ago(r.created_at, now)} · {r.requested_by_name}</span></li>)}</ul>
                  : <div className="adt-empty"><b>No refunds or disputes</b><small>This transaction has not been refunded or disputed.</small></div>}
                <RefundButton id={t.id} amount={refundable} label="Process refund" className="adb-btn blue adt-refund-btn" />
              </section>
              {timeline}
            </div>
          </div>
        </>}
        {tab === "timeline" && timeline}
        {tab === "fees" && <section className="adb-panel adt-fees"><h2>Fees</h2>
          <table className="adb-table"><thead><tr><th>Line</th><th className="r">Amount</th><th>Basis</th></tr></thead><tbody>
            <tr><td>Gross amount</td><td className="r">{money(amount, "GBP", { cents: true })}</td><td>Charged to customer</td></tr>
            <tr><td>Platform commission</td><td className="r">{money(fee, "GBP", { cents: true })}</td><td>{d.commission_rate ? `${d.commission_rate}% of ticket price` : "Plan commission"}</td></tr>
            {vat > 0 && <tr><td>VAT on fees</td><td className="r">{money(vat, "GBP", { cents: true })}</td><td>{d.vat_rate}% UK VAT on platform fee</td></tr>}
            <tr><td><b>Net to provider</b></td><td className="r"><b>{netAmt === null ? "—" : money(netAmt, "GBP", { cents: true })}</b></td><td>Paid out by Stripe Connect</td></tr></tbody></table></section>}
        {tab === "support" && <section className="adb-panel adt-fees"><h2>Support cases</h2>
          {cases.length ? <ul className="adt-cases">{cases.map(c => <li key={c.id}><Link href={`/admin/support/${c.id}`}>#{c.reference}</Link><Pill status={c.status} /><span>{c.subject}</span><small>{ago(c.created_at, now)}</small></li>)}</ul> : <p className="adb-none">No support cases reference this transaction.</p>}</section>}
      </div>

      <aside className="adt-rail">
        <section className="adb-panel adt-ps">
          <div className="adb-sec-h"><h2>Payment status</h2><span className="adt-ps-chips"><span className="adt-chip-s"><i>S</i>{(d.provider ?? "Stripe").replace(" Connect", "")}</span><Pill status={t.status === "failed" ? "failed" : "succeeded"} label={t.status === "failed" ? "Failed" : "Succeeded"} dot /></span></div>
          <ol>{steps.map(s => <li key={s.label} className={s.done ? "done" : ""}><CircleCheck aria-hidden="true" /><span><b>{s.label}</b><small>{stamp(s.iso)}</small></span></li>)}</ol>
          {!steps.length && <p className="adb-none">{st.label} · {stamp(t.occurred_at)}</p>}
        </section>
        <section className="adb-panel adt-actions"><h2>Actions</h2>
          <div className="adt-act">
            <RefundButton id={t.id} amount={refundable} label="Process refund" className="adb-btn" />
            <details className="adb-pop"><summary className="adb-btn"><Headset aria-hidden="true" />Create support case</summary>
              <div className="adb-pop-body"><h3>New support case</h3>
                <ActionForm action={createSupportCase} className="adb-form">
                  <input type="hidden" name="transaction_id" value={t.id} /><input type="hidden" name="category" value="payment" />
                  <label>Subject<input name="subject" required minLength={3} defaultValue={`Payment ${ref}`} /></label>
                  <label>Requester<input name="requester" defaultValue={d.customer?.name ?? t.counterparty} /></label>
                  <label>Priority<select name="priority" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
                  <label>Internal note<textarea name="body" rows={3} /></label>
                  <button className="adb-btn primary" type="submit">Create case</button>
                </ActionForm></div></details>
            <div className="adt-act-row">{t.stripe_ref ? <a className="adb-btn adt-stripe-btn" href={`https://dashboard.stripe.com/search?query=${encodeURIComponent(t.stripe_ref)}`} target="_blank" rel="noopener noreferrer"><span className="adt-stripe">S</span>Open in Stripe</a> : <span className="adb-btn adt-stripe-btn" aria-disabled="true">No Stripe reference</span>}
            <Menu label="More transaction actions" className="adb-btn adt-more" entries={[{ kind: "link", label: "View payouts", href: "/admin/commerce/payouts" }, { kind: "link", label: "Open Trust & Safety", href: "/admin/trust" }]} trigger={<MoreHorizontal aria-hidden="true" />} /></div>
          </div>
        </section>
        <section className="adb-panel adt-risk">
          <div className="adb-sec-h"><h2>Fraud &amp; risk <Pill status={(d.risk?.score ?? 0) < 40 ? "paid" : (d.risk?.score ?? 0) < 70 ? "pending" : "failed"} label={(d.risk?.score ?? 0) < 40 ? "Low risk" : (d.risk?.score ?? 0) < 70 ? "Medium risk" : "High risk"} dot /></h2></div>
          {d.risk ? <ul>
            <li><Target aria-hidden="true" /><span>Risk score</span><b>{d.risk.score} / 100</b></li>
            <li><FileCheck aria-hidden="true" /><span>Identity check</span><b className="g">{d.risk.identity}</b></li>
            <li><GaugeIcon aria-hidden="true" /><span>Velocity check</span><b className="g">{d.risk.velocity}</b></li>
            <li><ShieldAlert aria-hidden="true" /><span>Chargeback history</span><b className="g">{d.risk.chargebacks}</b></li>
            <li><MapPinned aria-hidden="true" /><span>Device / Location</span><b>{d.risk.location}</b></li>
          </ul> : <p className="adb-none">No risk assessment recorded for this payment.</p>}
          <Link className="adb-link adt-risk-l" href="/admin/trust">View risk details <ArrowRight aria-hidden="true" /></Link>
        </section>
        <section className="adb-panel adt-notes">
          <div className="adb-sec-h"><h2>Internal notes</h2>
            <details className="adb-pop"><summary className="adb-btn adt-addnote"><PenLine aria-hidden="true" />Add note</summary>
              <div className="adb-pop-body"><h3>Add internal note</h3><ActionForm action={addNote} className="adb-note-form" resetOnSuccess>
                <input type="hidden" name="entity_type" value="transaction" /><input type="hidden" name="entity_id" value={t.id} />
                <textarea name="body" rows={3} required aria-label="Note" placeholder="Visible to platform admins only" /><button className="adb-btn primary" type="submit">Save note</button></ActionForm></div></details></div>
          {notes.length ? <ul>{notes.slice(0, 2).map(n => <li key={n.id}><Face name={n.author_name} src={n.author_name === "Sarah Mitchell" ? "/assets/gd/av-ava-thompson.webp" : n.author_name === "James Carter" ? "/assets/gd/av-james-carter.webp" : null} size={28} /><span><b>{n.author_name} <small>{ago(n.created_at, now)}</small></b><p>{n.body}</p></span><span className="adb-dots" aria-hidden="true"><MoreHorizontal /></span></li>)}</ul> : <p className="adb-none">No notes yet.</p>}
        </section>
        <section className="adb-panel adt-cases-p">
          <div className="adb-sec-h"><h2>Support cases</h2><Link className="adb-link" href={`${base}?tab=support`}>View all <ArrowRight aria-hidden="true" /></Link></div>
          {cases.length ? cases.slice(0, 1).map(c => <div key={c.id} className="adt-case"><i><Headset aria-hidden="true" /></i><span><span><Link href={`/admin/support/${c.id}`}>#{c.reference}</Link><Pill status={c.status} /><small>{ago(c.created_at, now)}</small></span><small>{c.subject}</small></span>
            <Menu label={`Actions for ${c.reference}`} entries={[{ kind: "link", label: "Open case", href: `/admin/support/${c.id}` }]} /></div>) : <p className="adb-none">No support cases for this transaction.</p>}
        </section>
      </aside>
    </div>
  </div>;
}

function short(v: string) { return v.length > 14 ? `${v.slice(0, 8)}...${v.slice(-4)}` : v; }

function RefundButton({ id, amount, label, className }: { id: string; amount: number; label: string; className: string }) {
  return <ActionButton action={requestRefund} args={[id, amount, null]} reason variant="outline" className={className} disabled={amount <= 0}
    title={amount <= 0 ? "Nothing left to refund on this payment" : undefined}
    confirm={{ title: "Request refund", body: `Records a pending refund request for ${money(amount, "GBP", { cents: true })} on this payment. Refunds are executed by Stripe; this console doesn’t move money, so the request stays pending until processed.`, cta: "Record refund request" }}>
    <RefreshCw aria-hidden="true" />{label}</ActionButton>;
}
